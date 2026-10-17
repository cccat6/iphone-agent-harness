#!/usr/bin/env python3
"""Compile clean, static-hostable diagnostic firmware; never touches serial ports."""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import nullcontext
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import struct
import sys
import tempfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
SKETCH = ROOT / 'firmware' / 'IPhoneAutomationHarness'
CORE_VERSION = '3.3.11'
SOURCE_FILES = ('IPhoneAutomationHarness.ino', 'main.cpp', 'config.example.h', 'ResourceLimits.h', 'build_opt.h', 'src/Core.h', 'src/Canonical.h', 'src/SetupState.h', 'src/HidReportMap.h', 'src/Admission.h', 'src/Pki.h', 'src/Wire.h', 'src/SecureService.h')

PROFILES = {
    'esp32c3': {'label': 'ESP32-C3', 'board': 'ESP32C3 Dev Module', 'usbCdc': True,
                'fqbn': 'esp32:esp32:esp32c3:CDCOnBoot=cdc,FlashMode=dio,FlashSize=4M,PartitionScheme=huge_app'},
    'esp32s3': {'label': 'ESP32-S3', 'board': 'ESP32S3 Dev Module', 'usbCdc': True,
                'fqbn': 'esp32:esp32:esp32s3:USBMode=hwcdc,CDCOnBoot=cdc,FlashMode=dio,FlashSize=4M,PartitionScheme=huge_app,PSRAM=disabled'},
    'esp32c6': {'label': 'ESP32-C6', 'board': 'ESP32C6 Dev Module', 'usbCdc': True,
                'fqbn': 'esp32:esp32:esp32c6:CDCOnBoot=cdc,FlashMode=dio,FlashSize=4M,PartitionScheme=huge_app'},
    'esp32': {'label': 'ESP32', 'board': 'ESP32 Dev Module', 'usbCdc': False,
              'fqbn': 'esp32:esp32:esp32:FlashMode=dio,FlashSize=4M,PartitionScheme=huge_app,PSRAM=disabled'},
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def json_command(cli: str, *args: str):
    return json.loads(subprocess.check_output([cli, *args, '--format', 'json'], text=True))


def dependencies(cli: str):
    core = next((p for p in json_command(cli, 'core', 'list').get('platforms', []) if p.get('id') == 'esp32:esp32'), {})
    if core.get('installed_version') != CORE_VERSION:
        raise RuntimeError(f'Install pinned esp32:esp32@{CORE_VERSION}; no tools are installed automatically')
    libraries = json_command(cli, 'lib', 'list').get('installed_libraries', [])
    arduino_json = next((x['library'] for x in libraries if x.get('library', {}).get('name') == 'ArduinoJson'), {})
    if arduino_json.get('version') != '7.4.3':
        raise RuntimeError('Install pinned ArduinoJson@7.4.3; no libraries are installed automatically')
    nimble = ROOT / 'tools' / 'libraries' / 'NimBLE_Arduino-2.5.1'
    installed_nimble = next((x['library'] for x in libraries if x.get('library', {}).get('name') == 'NimBLE-Arduino'), {})
    if nimble.is_dir():
        if 'version=2.5.1' not in (nimble / 'library.properties').read_text():
            raise RuntimeError('Project-local NimBLE-Arduino must be pinned to 2.5.1')
    elif installed_nimble.get('version') != '2.5.1':
        raise RuntimeError('Install NimBLE-Arduino@2.5.1 through Library Manager, or place it in tools/libraries/NimBLE_Arduino-2.5.1')
    return {'arduinoEsp32': CORE_VERSION, 'NimBLE-Arduino': '2.5.1', 'ArduinoJson': '7.4.3'}


def copy_clean_sketch(destination: Path):
    """Allowlist source files. Never package ignored config.local.h or old relay config."""
    if destination.resolve() == SKETCH.resolve():
        raise RuntimeError('Build staging must not overwrite source sketch')
    if destination.is_symlink() or (destination.exists() and any(p.is_symlink() for p in destination.rglob('*'))):
        raise RuntimeError('Persistent staging must not contain symlinks')
    if destination.exists():
        actual = {p.relative_to(destination).as_posix() for p in destination.rglob('*') if p.is_file()}
        if not actual.issubset(set(SOURCE_FILES)):
            raise RuntimeError('Persistent staging has unapproved files; use a dedicated clean work directory')
    destination.mkdir(parents=True, exist_ok=True)
    for relative in SOURCE_FILES:
        path = destination / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        data = (SKETCH / relative).read_bytes()
        if not path.is_file() or path.read_bytes() != data:
            path.write_bytes(data)
    source_files = sorted(p for p in destination.rglob('*') if p.is_file())
    checksums = {p.relative_to(destination).as_posix(): digest(p.read_bytes()) for p in source_files}
    return digest(json.dumps(checksums, sort_keys=True, separators=(',', ':')).encode()), checksums


def validate_partition_table(data: bytes):
    entries = []
    for at in range(0, len(data) - 31, 32):
        magic, kind, subtype, offset, size, label, flags = struct.unpack('<HBBLL16sL', data[at:at + 32])
        if magic in (0xFFFF, 0xEBEB):
            break
        if magic != 0x50AA or not size or offset + size > 4 * 1024 * 1024:
            raise RuntimeError('Invalid or larger-than-4MB partition table')
        entries.append((kind, subtype, offset, size, label.split(b'\0')[0].decode('ascii')))
    if not any(kind == 0 and offset == 0x10000 and size == 0x300000 for kind, subtype, offset, size, label in entries):
        raise RuntimeError('Expected a 3MB application partition at 0x10000')
    intervals = sorted((offset, offset + size) for kind, subtype, offset, size, label in entries)
    if not intervals or any(intervals[i][1] > intervals[i + 1][0] for i in range(len(intervals) - 1)):
        raise RuntimeError('Empty or overlapping partition table')
    return entries


def collect_parts(build: Path, profile_id: str, output: Path):
    args = (build / 'flash_args').read_text().splitlines()
    entries = []
    for line in args:
        match = re.fullmatch(r'\s*(0x[0-9a-fA-F]+)\s+([^\s]+\.bin)\s*', line)
        if match:
            offset, name = int(match[1], 16), match[2]
            if Path(name).name != name:
                raise RuntimeError('Unexpected nonlocal flash filename')
            entries.append((offset, name))
    expected_boot = 0x1000 if profile_id == 'esp32' else 0
    if [x[0] for x in entries] != [expected_boot, 0x8000, 0xE000, 0x10000]:
        raise RuntimeError(f'Unexpected flash layout for {profile_id}')
    names = ['bootloader.bin', 'partitions.bin', 'boot_app0.bin', 'application.bin']
    published = output / profile_id
    published.mkdir(parents=True, exist_ok=True)
    parts = []
    previous_end = 0
    for (offset, source_name), name in zip(entries, names):
        data = (build / source_name).read_bytes()
        if not data or offset < previous_end or offset + len(data) > 4 * 1024 * 1024:
            raise RuntimeError('Empty, overlapping, or out-of-bounds flash image')
        if name == 'partitions.bin':
            validate_partition_table(data)
        if name == 'application.bin' and len(data) > 0x300000:
            raise RuntimeError('Application exceeds the 4 MB Huge APP partition')
        previous_end = offset + len(data)
        destination = published / name
        destination.write_bytes(data)
        parts.append({'path': f'{profile_id}/{name}', 'offset': offset, 'sha256': digest(data), 'size': len(data)})
    return parts


def validate_manifest(path: Path):
    data = json.loads(path.read_text())
    if data.get('schemaVersion') != 1 or not isinstance(data.get('profiles'), list):
        raise RuntimeError('Invalid manifest root')
    seen = set()
    for profile in data['profiles']:
        if not all(isinstance(profile.get(k), str) and profile[k] for k in ['id', 'label', 'chip', 'board']) or not isinstance(profile.get('usbCdc'), bool):
            raise RuntimeError('Missing firmware profile identity or USB mode')
        if profile['id'] in seen or profile['chip'] not in PROFILES or profile['minFlashMB'] != 4:
            raise RuntimeError('Invalid or duplicate firmware profile')
        seen.add(profile['id'])
        end = 0
        if len(profile['parts']) != 4:
            raise RuntimeError('Incomplete firmware parts')
        expected_offsets = [0x1000 if profile['chip'] == 'esp32' else 0, 0x8000, 0xE000, 0x10000]
        if [part.get('offset') for part in profile['parts']] != expected_offsets:
            raise RuntimeError('Firmware offsets do not match the compiled board layout')
        for part in profile['parts']:
            if not isinstance(part.get('size'), int) or part['size'] <= 0 or not re.fullmatch('[0-9a-f]{64}', str(part.get('sha256', ''))):
                raise RuntimeError('Missing firmware size/hash')
            relative = Path(part['path'])
            if relative.is_absolute() or '..' in relative.parts:
                raise RuntimeError('Firmware path escapes manifest directory')
            image = (path.parent / relative).read_bytes()
            if relative.name == 'partitions.bin':
                validate_partition_table(image)
            if len(image) != part['size'] or digest(image) != part['sha256']:
                raise RuntimeError('Firmware size/hash mismatch')
            if not isinstance(part['offset'], int) or part['offset'] < end:
                raise RuntimeError('Firmware offsets overlap')
            end = part['offset'] + len(image)
            if end > profile['minFlashMB'] * 1024 * 1024:
                raise RuntimeError('Firmware exceeds declared minimum flash')
    return len(seen)


def verify_sources(output: Path):
    report_path = output / 'build-report.json'
    if not report_path.is_file():
        raise RuntimeError('Missing build report: cannot prove binaries match current firmware source')
    report = json.loads(report_path.read_text())
    recorded = report.get('sourceFiles')
    if not isinstance(recorded, dict) or set(recorded) != set(SOURCE_FILES):
        raise RuntimeError('Build report has no complete current allowlisted source record; rebuild firmware')
    current = {}
    for relative in SOURCE_FILES:
        current[relative] = digest((SKETCH / relative).read_bytes())
        if current[relative] != recorded[relative]:
            raise RuntimeError(f'Firmware binary source is stale: {relative}; rebuild before publishing')
    overall = digest(json.dumps(current, sort_keys=True, separators=(',', ':')).encode())
    if report.get('sourceSha256') != overall:
        raise RuntimeError('Build report overall source SHA-256 is inconsistent')
    return len(current)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--arduino-cli', default=os.environ.get('ARDUINO_CLI') or shutil.which('arduino-cli') or '/Applications/Arduino IDE.app/Contents/Resources/app/lib/backend/resources/arduino-cli')
    parser.add_argument('--profiles', nargs='+', choices=list(PROFILES), default=list(PROFILES))
    parser.add_argument('--output', type=Path, default=ROOT / 'apps' / 'web' / 'firmware')
    parser.add_argument('--jobs', type=int, default=4)
    parser.add_argument('--parallel', type=int, default=1, help='Independent chip builds; each uses --jobs workers')
    parser.add_argument('--work-dir', type=Path, help='Dedicated persistent build cache; contains allowlisted staging and compiler output only')
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    if args.verify_only:
        count = validate_manifest(args.output / 'manifest.json')
        source_count = verify_sources(args.output)
        print(f'Verified {count} firmware profiles and {source_count} current source files')
        return 0
    if not Path(args.arduino_cli).is_file():
        raise RuntimeError('Arduino CLI was not found; use --arduino-cli')
    if not 1 <= args.parallel <= 4:
        raise RuntimeError('--parallel must be between 1 and 4')
    if not 1 <= args.jobs <= 16:
        raise RuntimeError('--jobs must be between 1 and 16')
    pinned = dependencies(args.arduino_cli)
    args.output.mkdir(parents=True, exist_ok=True)
    compiled, reports, failed = [], [], []
    if args.work_dir:
        args.work_dir.mkdir(parents=True, exist_ok=True)
    manager = nullcontext(str(args.work_dir)) if args.work_dir else tempfile.TemporaryDirectory(prefix='iah-firmware-build-')
    with manager as temporary:
        work = Path(temporary)
        sketch = work / 'IPhoneAutomationHarness'
        source_hash, source_files = copy_clean_sketch(sketch)
        def compile_profile(profile_id):
            profile = PROFILES[profile_id]
            build = work / (profile_id + '-build')
            command = [args.arduino_cli, 'compile', '--jobs', str(args.jobs), '--fqbn', profile['fqbn'], '--build-path', str(build)]
            if (ROOT / 'tools' / 'libraries').is_dir():
                command += ['--libraries', str(ROOT / 'tools' / 'libraries')]
            # All implementation lives in ordinary main.cpp, so no Arduino
            # prototypes are needed. Work around the old x86 macOS ctags only.
            if sys.platform == 'darwin':
                command += ['--build-property', 'tools.ctags.cmd.path=/usr/bin/true']
            if os.name != 'nt':
                # SDK's cp -f refreshes the options mtime on every build. CLI can
                # remove this file before hooks, so a no-op hook is unsafe. Copy
                # the exact options with their source timestamp instead.
                command += ['--build-property', 'recipe.hooks.prebuild.5.pattern=/bin/cp -p "{build.source.path}/build_opt.h" "{build.path}/build_opt.h"']
            command.append(str(sketch))
            print(f'Compiling {profile["label"]} (4 MB, CDC={profile["usbCdc"]})', flush=True)
            run = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            summary = [line for line in run.stdout.splitlines() if line.startswith(('Sketch uses', 'Global variables use'))]
            report = {'id': profile_id, 'fqbn': profile['fqbn'], 'compiled': run.returncode == 0, 'summary': summary}
            if run.returncode == 0:
                if (build / 'build_opt.h').read_bytes() != (sketch / 'build_opt.h').read_bytes():
                    raise RuntimeError('Compiled options do not match allowlisted source')
                parts = collect_parts(build, profile_id, args.output)
                built = {'id': profile_id, 'label': profile['label'], 'chip': profile_id, 'board': profile['board'], 'minFlashMB': 4, 'usbCdc': profile['usbCdc'], 'parts': parts}
                for line in summary:
                    print(line, flush=True)
            else:
                # Failure diagnostics remain local, not in a public manifest.
                built = None
                print('\n'.join(run.stdout.splitlines()[-25:]), file=sys.stderr, flush=True)
            return profile_id, built, report
        with ThreadPoolExecutor(max_workers=args.parallel) as executor:
            pending = [executor.submit(compile_profile, profile_id) for profile_id in args.profiles]
            for future in as_completed(pending):
                profile_id, built, report = future.result()
                reports.append(report)
                if built is None:
                    failed.append(profile_id)
                else:
                    compiled.append(built)
        order = {value: index for index, value in enumerate(args.profiles)}
        compiled.sort(key=lambda value: order[value['id']])
        reports.sort(key=lambda value: order[value['id']])
    manifest = {'schemaVersion': 1, 'firmwareVersion': '0.2.0-lan', 'executionEnabled': True, 'physicalValidation': False, 'requiresManualTrust': True, 'stage': 'secure-lan-unvalidated', 'profiles': compiled}
    report = {'builtAt': datetime.now(timezone.utc).isoformat(), 'dependencies': pinned, 'sourceSha256': source_hash, 'sourceFiles': source_files, 'serialPortsOpened': False, 'flashed': False, 'profiles': reports, 'excluded': [{'chip': 'esp32s2', 'reason': 'No Bluetooth LE radio'}]}
    for name, value in [('manifest.json', manifest), ('build-report.json', report)]:
        temporary_path = args.output / (name + '.tmp')
        temporary_path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
        temporary_path.replace(args.output / name)
    validate_manifest(args.output / 'manifest.json')
    verify_sources(args.output)
    print(f'Published {len(compiled)} compiled profiles; failed: {failed or "none"}', flush=True)
    return 1 if failed else 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (RuntimeError, OSError, subprocess.SubprocessError) as error:
        print(f'Firmware build failed: {error}', file=sys.stderr)
        raise SystemExit(1)
