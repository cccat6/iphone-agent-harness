#!/usr/bin/env python3
"""Compile clean, static-hostable firmware; never touches serial ports."""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import nullcontext, contextmanager
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
from verify_rtc_tls_link import verify_tls_link
import build_c2_sdk as c2_sdk

ROOT = Path(__file__).resolve().parents[1]
SKETCH = ROOT / 'firmware' / 'IPhoneAutomationHarness'
CORE_VERSION = '3.3.11'
RECIPE_FILES = ('build_firmware.py', 'verify_rtc_tls_link.py', 'build_c2_sdk.py', 'c2_sdk.lock.json', 'c2_sdk.components.lock', 'partitions/c2-2m.csv')
SOURCE_FILES = ('IPhoneAutomationHarness.ino', 'main.cpp', 'config.example.h', 'ResourceLimits.h', 'build_opt.h', 'src/Core.h', 'src/CompactGesture.h', 'src/Canonical.h', 'src/SetupState.h', 'src/StorageMigration.h', 'src/HidReportMap.h', 'src/Admission.h', 'src/CryptoUtils.h', 'src/FirmwareVersion.h', 'src/MdnsLifecycle.h', 'src/RtcPeerOwnership.h', 'src/Wire.h', 'src/SecureService.h', 'src/HtmlJson.h', 'src/HttpHtmlResponse.h', 'src/WifiSetupPage.h', 'src/BridgeSettings.h', 'src/BridgeSettingsPage.h', 'src/ClipboardMailbox.h', 'src/ClipboardWire.h', 'src/RtcIdentity.h', 'src/RtcSctp.h', 'src/RtcRpc.h', 'src/RtcRequest.h', 'src/RtcBridge.h', 'src/RtcTlsServer.h', 'src/RtcUdpSend.h', 'src/StrictJson.h')

# Exact ESP-IDF 5.5.5 TLS family; explicit names keep local config files excluded.
RTC_TLS_FILES = tuple("src/RtcTls/" + name for name in (
    'RtcTlsConfig.h',
    'aesce.h',
    'aesni.h',
    'alignment.h',
    'base64_internal.h',
    'bignum_core.h',
    'bignum_core_invasive.h',
    'bignum_internal.h',
    'bignum_mod.h',
    'bignum_mod_raw.h',
    'bignum_mod_raw_invasive.h',
    'block_cipher_internal.h',
    'bn_mul.h',
    'check_crypto_config.h',
    'cipher_invasive.h',
    'cipher_wrap.h',
    'common.h',
    'constant_time_impl.h',
    'constant_time_internal.h',
    'ctr.h',
    'debug.c',
    'debug_internal.h',
    'ecp_internal_alt.h',
    'ecp_invasive.h',
    'entropy_poll.h',
    'esp_platform_time.c',
    'lmots.h',
    'mbedtls_debug.c',
    'md_psa.h',
    'md_wrap.h',
    'mps_common.h',
    'mps_error.h',
    'mps_reader.c',
    'mps_reader.h',
    'mps_trace.c',
    'mps_trace.h',
    'net_sockets.c',
    'padlock.h',
    'pk_internal.h',
    'pk_wrap.h',
    'pkwrite.h',
    'psa_crypto_aead.h',
    'psa_crypto_cipher.h',
    'psa_crypto_core.h',
    'psa_crypto_core_common.h',
    'psa_crypto_driver_wrappers.h',
    'psa_crypto_driver_wrappers_no_static.h',
    'psa_crypto_ecp.h',
    'psa_crypto_ffdh.h',
    'psa_crypto_hash.h',
    'psa_crypto_invasive.h',
    'psa_crypto_its.h',
    'psa_crypto_mac.h',
    'psa_crypto_pake.h',
    'psa_crypto_random.h',
    'psa_crypto_random_impl.h',
    'psa_crypto_rsa.h',
    'psa_crypto_se.h',
    'psa_crypto_slot_management.h',
    'psa_crypto_storage.h',
    'psa_util_internal.h',
    'rsa_alt_helpers.h',
    'rsa_internal.h',
    'ssl_cache.c',
    'ssl_ciphersuites.c',
    'ssl_ciphersuites_internal.h',
    'ssl_client.c',
    'ssl_client.h',
    'ssl_cookie.c',
    'ssl_debug_helpers.h',
    'ssl_debug_helpers_generated.c',
    'ssl_misc.h',
    'ssl_msg.c',
    'ssl_ticket.c',
    'ssl_tls.c',
    'ssl_tls12_client.c',
    'ssl_tls12_server.c',
    'ssl_tls13_client.c',
    'ssl_tls13_generic.c',
    'ssl_tls13_invasive.h',
    'ssl_tls13_keys.c',
    'ssl_tls13_keys.h',
    'ssl_tls13_server.c',
    'threading_internal.h',
    'x509_internal.h',
))
SOURCE_FILES += RTC_TLS_FILES

PROFILES = {
    'esp32c2': {'label': 'ESP32-C2 · 26 MHz', 'chip': 'esp32c2', 'board': 'ESP32C2 Dev Module', 'usbCdc': False, 'flashFreq': '60m', 'xtalMHz': 26, 'minFlashMB': 2, 'appCapacityBytes': 0x1E0000, 'partitions': 'partitions/c2-2m.csv',
                'fqbn': 'esp32:esp32:esp32c2:FlashMode=dio,FlashFreq=60,FlashSize=2M,PartitionScheme=minimal'},
    'esp32c2-40': {'label': 'ESP32-C2 · 40 MHz', 'chip': 'esp32c2', 'board': 'ESP32C2 Dev Module', 'usbCdc': False, 'flashFreq': '60m', 'xtalMHz': 40, 'minFlashMB': 2, 'appCapacityBytes': 0x1E0000, 'partitions': 'partitions/c2-2m.csv',
                'fqbn': 'esp32:esp32:esp32c2:FlashMode=dio,FlashFreq=60,FlashSize=2M,PartitionScheme=minimal'},
    'esp32c3': {'label': 'ESP32-C3', 'board': 'ESP32C3 Dev Module', 'usbCdc': True, 'flashFreq': '80m',
                'fqbn': 'esp32:esp32:esp32c3:CDCOnBoot=cdc,FlashMode=dio,FlashSize=4M,PartitionScheme=huge_app'},
    'esp32s3': {'label': 'ESP32-S3', 'board': 'ESP32S3 Dev Module', 'usbCdc': True, 'flashFreq': '80m',
                'fqbn': 'esp32:esp32:esp32s3:USBMode=hwcdc,CDCOnBoot=cdc,FlashMode=dio,FlashSize=4M,PartitionScheme=huge_app,PSRAM=disabled'},
    'esp32c5': {'label': 'ESP32-C5', 'board': 'ESP32C5 Dev Module', 'usbCdc': True, 'flashFreq': '80m', 'bootloaderOffset': 0x2000,
                'fqbn': 'esp32:esp32:esp32c5:CDCOnBoot=cdc,FlashMode=dio,FlashSize=4M,PartitionScheme=huge_app,PSRAM=disabled'},
    'esp32c6': {'label': 'ESP32-C6', 'board': 'ESP32C6 Dev Module', 'usbCdc': True, 'flashFreq': '80m',
                'fqbn': 'esp32:esp32:esp32c6:CDCOnBoot=cdc,FlashMode=dio,FlashSize=4M,PartitionScheme=huge_app'},
    'esp32': {'label': 'ESP32', 'board': 'ESP32 Dev Module', 'usbCdc': False, 'flashFreq': '80m',
              'fqbn': 'esp32:esp32:esp32:FlashMode=dio,FlashSize=4M,PartitionScheme=huge_app,PSRAM=disabled'},
}


def c2_configuration(xtal):return {'xtalMHz':xtal,'bluetoothLEEnabled':True,'wifiEnabled':True}
def verify_c2_configuration(sdk:Path,xtal:int):
    config=(sdk/'sdkconfig').read_text();header=(sdk/'dio_qspi/include/sdkconfig.h').read_text()
    if not re.search(r'(?m)^CONFIG_XTAL_FREQ='+str(xtal)+r'$',config) or not re.search(r'(?m)^#define CONFIG_XTAL_FREQ '+str(xtal)+r'$',header):
        raise RuntimeError('ESP32-C2 SDK crystal frequency does not match the selected profile')
    for flag in ['CONFIG_BT_ENABLED','CONFIG_BT_NIMBLE_ENABLED','CONFIG_ESP_WIFI_ENABLED']:
        if not re.search(r'(?m)^'+flag+r'=y$',config) or not re.search(r'(?m)^#define '+flag+r' 1$',header):
            raise RuntimeError('ESP32-C2 SDK must enable Wi-Fi and Bluetooth LE: '+flag)
    return c2_configuration(xtal)


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


def copy_clean_sketch(destination: Path, *, generated_files=()):
    """Allowlist source files. Never package ignored config.local.h or old relay config."""
    if destination.resolve() == SKETCH.resolve():
        raise RuntimeError('Build staging must not overwrite source sketch')
    if destination.is_symlink() or (destination.exists() and any(p.is_symlink() for p in destination.rglob('*'))):
        raise RuntimeError('Persistent staging must not contain symlinks')
    if destination.exists():
        actual = {p.relative_to(destination).as_posix() for p in destination.rglob('*') if p.is_file()}
        if not actual.issubset(set(SOURCE_FILES)|set(generated_files)):
            raise RuntimeError('Persistent staging has unapproved files; use a dedicated clean work directory')
    destination.mkdir(parents=True, exist_ok=True)
    for relative in SOURCE_FILES:
        path = destination / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        data = (SKETCH / relative).read_bytes()
        if not path.is_file() or path.read_bytes() != data:
            path.write_bytes(data)
    source_files = sorted(p for p in destination.rglob('*') if p.is_file() and p.relative_to(destination).as_posix() not in generated_files)
    checksums = {p.relative_to(destination).as_posix(): digest(p.read_bytes()) for p in source_files}
    return digest(json.dumps(checksums, sort_keys=True, separators=(',', ':')).encode()), checksums


def validate_partition_table(data: bytes, flash_mb=4, app_bytes=0x300000):
    entries = []
    for at in range(0, len(data) - 31, 32):
        magic, kind, subtype, offset, size, label, flags = struct.unpack('<HBBLL16sL', data[at:at + 32])
        if magic in (0xFFFF, 0xEBEB):
            break
        if magic != 0x50AA or not size or offset + size > flash_mb * 1024 * 1024:
            raise RuntimeError(f'Invalid or larger-than-{flash_mb}MB partition table')
        entries.append((kind, subtype, offset, size, label.split(b'\0')[0].decode('ascii')))
    if not any(kind == 0 and offset == 0x10000 and size == app_bytes for kind, subtype, offset, size, label in entries):
        raise RuntimeError('Unexpected application partition capacity at 0x10000')
    intervals = sorted((offset, offset + size) for kind, subtype, offset, size, label in entries)
    if not intervals or any(intervals[i][1] > intervals[i + 1][0] for i in range(len(intervals) - 1)):
        raise RuntimeError('Empty or overlapping partition table')
    return entries


def collect_parts(build: Path, profile_id: str, output: Path):
    profile=PROFILES[profile_id];flash_mb=profile.get('minFlashMB',4);app_bytes=profile.get('appCapacityBytes',0x300000)
    args = (build / 'flash_args').read_text().splitlines()
    parameters = re.search(r'--flash-freq\s+(\S+)', args[0] if args else '')
    if not parameters or parameters.group(1) != PROFILES[profile_id]['flashFreq']:
        raise RuntimeError('Compiled flash frequency does not match the board profile')
    capacity=re.search(r'--flash-size\s+(\S+)',args[0] if args else '')
    if not capacity or capacity.group(1)!=str(flash_mb)+'MB':raise RuntimeError('Compiled flash size does not match the board profile')
    entries = []
    for line in args:
        match = re.fullmatch(r'\s*(0x[0-9a-fA-F]+)\s+([^\s]+\.bin)\s*', line)
        if match:
            offset, name = int(match[1], 16), match[2]
            if Path(name).name != name:
                raise RuntimeError('Unexpected nonlocal flash filename')
            entries.append((offset, name))
    expected_boot = PROFILES[profile_id].get('bootloaderOffset', 0x1000 if profile_id == 'esp32' else 0)
    if [x[0] for x in entries] != [expected_boot, 0x8000, 0xE000, 0x10000]:
        raise RuntimeError(f'Unexpected flash layout for {profile_id}')
    names = ['bootloader.bin', 'partitions.bin', 'boot_app0.bin', 'application.bin']
    published = output / profile_id
    published.mkdir(parents=True, exist_ok=True)
    parts = []
    previous_end = 0
    for (offset, source_name), name in zip(entries, names):
        data = (build / source_name).read_bytes()
        if not data or offset < previous_end or offset + len(data) > flash_mb * 1024 * 1024:
            raise RuntimeError('Empty, overlapping, or out-of-bounds flash image')
        if name == 'partitions.bin':
            validate_partition_table(data,flash_mb,app_bytes)
        if name == 'application.bin' and len(data) > app_bytes:
            raise RuntimeError('Application exceeds the declared application partition')
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
        if profile['id'] in seen or profile['id'] not in PROFILES or profile['chip'] != PROFILES[profile['id']].get('chip',profile['id']) or profile['minFlashMB'] != PROFILES[profile['id']].get('minFlashMB',4):
            raise RuntimeError('Invalid or duplicate firmware profile')
        if profile.get('xtalMHz') != PROFILES[profile['id']].get('xtalMHz'):
            raise RuntimeError('Firmware crystal variant does not match the board profile')
        if profile.get('flashFreq', PROFILES[profile['id']]['flashFreq']) != PROFILES[profile['id']]['flashFreq']:
            raise RuntimeError('Firmware flash frequency does not match the board profile')
        seen.add(profile['id'])
        end = 0
        if len(profile['parts']) != 4:
            raise RuntimeError('Incomplete firmware parts')
        expected_offsets = [PROFILES[profile['id']].get('bootloaderOffset', 0x1000 if profile['chip'] == 'esp32' else 0), 0x8000, 0xE000, 0x10000]
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
                validate_partition_table(image,profile['minFlashMB'],PROFILES[profile['id']].get('appCapacityBytes',0x300000))
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
    for profile in report.get('profiles',[]):
        config=PROFILES.get(profile.get('id'),{})
        if config.get('chip')=='esp32c2' and profile.get('compiled'):
            sdk=profile.get('sdkProvenance',{})
            if sdk.get('recipe')!=c2_sdk.provenance(config['xtalMHz']) or sdk.get('configuration')!=c2_configuration(config['xtalMHz']) or not re.fullmatch('[a-f0-9]{64}',str(sdk.get('filesSha256',''))) or not isinstance(sdk.get('fileCount'),int) or sdk['fileCount']<1:
                raise RuntimeError('C2 SDK build provenance is stale or incomplete')
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


def recipe_files(root=None):
    root = root or ROOT
    return {name: digest((root / 'tools' / name).read_bytes()) for name in RECIPE_FILES}


def firmware_version():
    source = (SKETCH / 'src/FirmwareVersion.h').read_text()
    match = re.search(r'Version\[\]\s*=\s*"([A-Za-z0-9.+-]+)"', source)
    if not match:
        raise RuntimeError('FirmwareVersion.h must declare the firmware Version')
    return match.group(1)


def replace_output(candidate: Path, output: Path):
    """Publish a validated sibling directory, restoring the prior one on failure."""
    backup = candidate.parent / 'previous'
    had_output = output.exists()
    if had_output:
        output.rename(backup)
    try:
        candidate.rename(output)
    except BaseException:
        if had_output:
            backup.rename(output)
        raise
    if had_output:
        shutil.rmtree(backup)


@contextmanager
def staged_output(output: Path):
    if output.is_symlink():
        raise RuntimeError('Firmware output must not be a symlink')
    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists() and any(p.is_symlink() for p in output.rglob('*')):
        raise RuntimeError('Firmware output must not contain symlinks')
    with tempfile.TemporaryDirectory(prefix='.' + output.name + '-staging-', dir=output.parent) as temp:
        candidate = Path(temp) / 'candidate'
        candidate.mkdir()
        yield candidate
        # Read notices at publication time: a long compilation may overlap a
        # documentation edit. Preserve the current files, including deletions.
        generated = set(PROFILES) | {'manifest.json', 'build-report.json', 'build-inputs.json'}
        for path in candidate.iterdir():
            if path.name not in generated:
                shutil.rmtree(path) if path.is_dir() else path.unlink()
        if output.exists():
            if any(p.is_symlink() for p in output.rglob('*')):
                raise RuntimeError('Firmware output must not contain symlinks')
            for source in output.iterdir():
                if source.name not in generated:
                    destination = candidate / source.name
                    if source.is_dir():
                        shutil.copytree(source, destination)
                    else:
                        shutil.copy2(source, destination)
        replace_output(candidate, output)


def check_output_profiles(output: Path, profiles):
    if len(profiles) != len(set(profiles)):
        raise RuntimeError('Each firmware profile must be selected once')
    if output.resolve() == (ROOT / 'apps/web/firmware').resolve() and set(profiles) != set(PROFILES):
        raise RuntimeError('The website firmware directory requires every profile; use --output for a partial build')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--arduino-cli', default=os.environ.get('ARDUINO_CLI') or shutil.which('arduino-cli') or '/Applications/Arduino IDE.app/Contents/Resources/app/lib/backend/resources/arduino-cli')
    parser.add_argument('--profiles', nargs='+', choices=list(PROFILES), default=list(PROFILES))
    parser.add_argument('--output', type=Path, default=ROOT / 'apps' / 'web' / 'firmware')
    parser.add_argument('--jobs', type=int, default=4)
    parser.add_argument('--parallel', type=int, default=1, help='Independent chip builds; each uses --jobs workers')
    parser.add_argument('--work-dir', type=Path, help='Dedicated persistent build cache; contains allowlisted staging and compiler output only')
    parser.add_argument('--verify-only', action='store_true')
    parser.add_argument('--c2-sdk-cache', type=Path, default=c2_sdk.DEFAULT_CACHE, help='Private pinned C2 SDK cache produced by tools/build_c2_sdk.py')
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
    check_output_profiles(args.output, args.profiles)
    recipe_snapshot = recipe_files()
    pinned = dependencies(args.arduino_cli)
    compiled, reports, failed = [], [], []
    if args.work_dir:
        args.work_dir.mkdir(parents=True, exist_ok=True)
    manager = nullcontext(str(args.work_dir)) if args.work_dir else tempfile.TemporaryDirectory(prefix='iah-firmware-build-')
    with staged_output(args.output) as candidate, manager as temporary:
        work = Path(temporary)
        sketch = work / 'IPhoneAutomationHarness'
        source_hash, source_files = copy_clean_sketch(sketch)
        version = firmware_version()
        build_id = source_hash[:16]
        def compile_profile(profile_id):
            profile = PROFILES[profile_id]
            build = work / (profile_id + '-build')
            profile_sketch=sketch
            if profile.get('partitions'):
                profile_sketch=work/(profile_id+'-sketch')/'IPhoneAutomationHarness';copy_clean_sketch(profile_sketch,generated_files=('partitions.csv',));shutil.copyfile(ROOT/'tools'/profile['partitions'],profile_sketch/'partitions.csv')
            command = [args.arduino_cli, 'compile', '--jobs', str(args.jobs), '--fqbn', profile['fqbn'], '--build-path', str(build), '--build-property', 'compiler.cpp.extra_flags=-DIAH_BUILD_ID=' + build_id]
            sdk_metadata=None
            if profile.get('chip')=='esp32c2':
                sdk=c2_sdk.verified_sdk(args.c2_sdk_cache,profile['xtalMHz']);record=json.loads((sdk/'iah-sdk-provenance.json').read_text());sdk_metadata={'recipe':record['recipe'],'filesSha256':digest(json.dumps(record['files'],sort_keys=True,separators=(',',':')).encode()),'fileCount':len(record['files']),'configuration':verify_c2_configuration(sdk,profile['xtalMHz'])}
                command+=['--build-property','runtime.tools.esp32c2-libs.path='+str(sdk),'--build-property','upload.maximum_size='+str(profile['appCapacityBytes'])]
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
            command.append(str(profile_sketch))
            print(f'Compiling {profile["label"]} ({profile.get("minFlashMB",4)} MB, CDC={profile["usbCdc"]})', flush=True)
            run = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            summary = [line for line in run.stdout.splitlines() if line.startswith(('Sketch uses', 'Global variables use'))]
            report = {'id': profile_id, 'fqbn': profile['fqbn'], 'compiled': run.returncode == 0, 'summary': summary}
            if sdk_metadata:report['sdkProvenance']=sdk_metadata
            if run.returncode == 0:
                if (build / 'build_opt.h').read_bytes() != (sketch / 'build_opt.h').read_bytes():
                    raise RuntimeError('Compiled options do not match allowlisted source')
                report['rtcTlsLink'] = verify_tls_link(build, sketch / 'src' / 'RtcTls')
                parts = collect_parts(build, profile_id, candidate)
                built = {'id': profile_id, 'label': profile['label'], 'chip': profile.get('chip',profile_id), 'board': profile['board'], 'minFlashMB': profile.get('minFlashMB',4), 'usbCdc': profile['usbCdc'], 'flashFreq': profile['flashFreq'], 'parts': parts}
                if profile.get('xtalMHz'):built['xtalMHz']=profile['xtalMHz']
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
        if failed:
            raise RuntimeError('Compilation failed for: ' + ', '.join(failed))
        manifest = {'schemaVersion': 1, 'firmwareVersion': version, 'buildId': build_id, 'executionEnabled': True, 'requiresManualTrust': False, 'profiles': compiled}
        report = {'builtAt': datetime.now(timezone.utc).isoformat(), 'firmwareVersion': version, 'buildId': build_id, 'dependencies': pinned, 'recipeFiles': recipe_snapshot, 'sourceSha256': source_hash, 'sourceFiles': source_files, 'serialPortsOpened': False, 'flashed': False, 'profiles': reports}
        for name, value in [('manifest.json', manifest), ('build-report.json', report)]:
            (candidate / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
        validate_manifest(candidate / 'manifest.json')
        verify_sources(candidate)
        if recipe_files() != recipe_snapshot:
            raise RuntimeError('Firmware build recipe changed during compilation; rebuild before publishing')
    print(f'Published {len(compiled)} compiled profiles, firmware {version}, build {build_id}', flush=True)
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (RuntimeError, OSError, subprocess.SubprocessError) as error:
        print(f'Firmware build failed: {error}', file=sys.stderr)
        raise SystemExit(1)
