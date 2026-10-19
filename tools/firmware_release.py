#!/usr/bin/env python3
"""Content-addressed firmware reuse and Release packaging. Never opens a serial port."""
from __future__ import annotations
import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile

import build_firmware as builder

ROOT = Path(__file__).resolve().parents[1]
FIRMWARE = ROOT / 'apps/web/firmware'
PARTS = ('bootloader.bin', 'partitions.bin', 'boot_app0.bin', 'application.bin')
CLI_VERSION = '1.5.1'
DEPENDENCIES = {'arduinoEsp32': builder.CORE_VERSION, 'NimBLE-Arduino': '2.5.1', 'ArduinoJson': '7.4.3'}
METADATA = ('manifest.json', 'build-report.json', 'build-inputs.json')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def inputs(root=None):
    root = root or ROOT
    source = {name: sha((root / 'firmware/IPhoneAutomationHarness' / name).read_bytes()) for name in builder.SOURCE_FILES}
    recipes = {name: sha((root / 'tools' / name).read_bytes()) for name in ('build_firmware.py', 'verify_rtc_tls_link.py', 'build_c2_sdk.py', 'c2_sdk.lock.json', 'c2_sdk.components.lock', 'partitions/c2-2m.csv')}
    return {'format': 'iah-firmware-inputs/1', 'sourceFiles': source,
            'recipeFiles': recipes, 'recipeSha256': sha(json.dumps(recipes, sort_keys=True, separators=(',', ':')).encode()),
            'arduinoCli': CLI_VERSION, 'dependencies': DEPENDENCIES, 'profiles': builder.PROFILES}


def key(value):
    return sha(json.dumps(value, sort_keys=True, separators=(',', ':')).encode())


def core_paths():
    return [*METADATA, *(f'{profile}/{part}' for profile in builder.PROFILES for part in PARTS)]


def flat_name(path):
    return path.replace('/', '-')


def validate(output=None, *, sealed=True):
    output = output or FIRMWARE
    if any((output / path).is_symlink() for path in core_paths()):
        raise RuntimeError('Firmware package cannot contain symlinks')
    if builder.validate_manifest(output / 'manifest.json') != len(builder.PROFILES):
        raise RuntimeError('All configured firmware profiles are required')
    builder.verify_sources(output)
    manifest = json.loads((output / 'manifest.json').read_text())
    if {p['id'] for p in manifest['profiles']} != set(builder.PROFILES):
        raise RuntimeError('Firmware profile set does not match the build recipe')
    for profile in manifest['profiles']:
        expected = builder.PROFILES[profile['id']]
        if profile['chip'] != expected.get('chip',profile['id']) or profile['usbCdc'] != expected['usbCdc'] or profile['board'] != expected['board'] or profile.get('flashFreq') != expected['flashFreq'] or profile.get('xtalMHz') != expected.get('xtalMHz'):
            raise RuntimeError('Firmware board/USB configuration does not match the recipe')
        if [part['path'] for part in profile['parts']] != [f"{profile['id']}/{name}" for name in PARTS]:
            raise RuntimeError('Firmware part filenames do not match the recipe')
    report = json.loads((output / 'build-report.json').read_text())
    if report['dependencies'] != DEPENDENCIES:
        raise RuntimeError('Firmware dependency versions do not match')
    if len(report['profiles']) != len(builder.PROFILES) or {p['id'] for p in report['profiles']} != set(builder.PROFILES):
        raise RuntimeError('Build report must cover all configured profiles')
    if any(not p['compiled'] or p['fqbn'] != builder.PROFILES[p['id']]['fqbn'] for p in report['profiles']):
        raise RuntimeError('Firmware compilation report does not match the recipe')
    if sealed and json.loads((output / 'build-inputs.json').read_text()) != inputs():
        raise RuntimeError('Firmware build inputs changed')


def gh(*args, missing_ok=False):
    result = subprocess.run(['gh', *args], capture_output=True, text=True)
    if result.returncode:
        if missing_ok and '(HTTP 404)' in result.stderr:
            return None
        # Do not forward arbitrary upstream diagnostics into Actions logs.
        raise RuntimeError(f'GitHub command failed: {args[0]} (exit {result.returncode})')
    return result.stdout


def release(repository, tag):
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository):
        raise RuntimeError('Invalid GitHub repository')
    result = gh('api', f'repos/{repository}/releases/tags/{tag}', missing_ok=True)
    return json.loads(result) if result is not None else None


def checksums(text):
    result = {}
    for line in text.splitlines():
        match = re.fullmatch(r'([0-9a-f]{64})  ([A-Za-z0-9._-]+)', line)
        if not match or match[2] in result:
            raise RuntimeError('Invalid or duplicate Release checksum entry')
        result[match[2]] = match[1]
    return result


def unpack(archive, output):
    required = set(core_paths())
    extracted = set()
    with tarfile.open(archive, 'r:gz') as package:
        total = 0
        for member in package:
            name = member.name
            optional = name in ('README.md', 'LICENSE.txt') or re.fullmatch(r'licenses/[A-Za-z0-9._-]+', name)
            if not member.isfile() or name in extracted or (name not in required and not optional):
                raise RuntimeError('Unexpected firmware archive entry')
            total += member.size
            if member.size > 8 * 1024 * 1024 or total > 32 * 1024 * 1024 or len(extracted) >= 64:
                raise RuntimeError('Firmware archive exceeds package limits')
            extracted.add(name)
            data = package.extractfile(member).read()
            if name in required:
                destination = output / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(data)
    if not required.issubset(extracted):
        raise RuntimeError('Firmware archive is incomplete')


def restore(repository, tag, archive_name, metadata, output=None):
    output = output or FIRMWARE
    expected_assets = {flat_name(p) for p in core_paths()} | {archive_name, 'SHA256SUMS'}
    assets = {asset['name']: asset for asset in metadata['assets']}
    required_assets = {archive_name, 'SHA256SUMS'} if metadata.get('draft') else expected_assets
    if not required_assets.issubset(assets):
        raise RuntimeError('Published firmware Release is incomplete; refusing silent rebuild')
    with tempfile.TemporaryDirectory(prefix='iah-release-') as temp:
        folder = Path(temp)
        gh('release', 'download', tag, '--repo', repository, '--pattern', archive_name,
           '--pattern', 'SHA256SUMS', '--dir', str(folder))
        if (folder / 'SHA256SUMS').stat().st_size > 65536 or (folder / archive_name).stat().st_size > 32 * 1024 * 1024:
            raise RuntimeError('Firmware Release download exceeds package limits')
        sums = checksums((folder / 'SHA256SUMS').read_text())
        if sha((folder / archive_name).read_bytes()) != sums.get(archive_name):
            raise RuntimeError('Firmware Release archive checksum mismatch')
        candidate = folder / 'verified'
        candidate.mkdir()
        unpack(folder / archive_name, candidate)
        validate(candidate)
        for name in core_paths():
            digest = sha((candidate / name).read_bytes())
            asset = assets.get(flat_name(name), {})
            if digest != sums.get(flat_name(name)) or (asset.get('digest') and asset['digest'] != 'sha256:' + digest):
                raise RuntimeError('Firmware Release asset checksum mismatch')
        # Only copy after complete validation. Never restore old site docs/licenses.
        for name in core_paths():
            destination = output / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(candidate / name, destination)


def plan(repository=None, offline=False):
    value = inputs()
    fingerprint = key(value)
    tag = 'firmware-' + fingerprint
    archive_name = 'iphone-agent-firmware-' + fingerprint[:16] + '.tar.gz'
    origin = 'compile'
    metadata = release(repository, tag) if repository and not offline else None
    draft_archive_ready = metadata and {archive_name, 'SHA256SUMS'}.issubset({asset['name'] for asset in metadata['assets']})
    if metadata and (not metadata['draft'] or draft_archive_ready):
        restore(repository, tag, archive_name, metadata)
        origin = 'release-draft' if metadata['draft'] else 'release'
    else:
        try:
            validate()
            origin = 'repository'
        except (RuntimeError, OSError, ValueError, KeyError):
            pass
    result = {'key': fingerprint, 'tag': tag, 'archive': archive_name, 'origin': origin,
              'compile': origin == 'compile'}
    build = ROOT / 'build'
    build.mkdir(exist_ok=True)
    (build / 'firmware-plan.json').write_text(json.dumps(result, indent=2) + '\n')
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as stream:
            stream.write('compile=' + str(result['compile']).lower() + '\n')
            stream.write('key=' + fingerprint + '\ntag=' + tag + '\n')
    print(json.dumps(result))
    return result


def seal():
    validate(sealed=False)
    (FIRMWARE / 'build-inputs.json').write_text(json.dumps(inputs(), indent=2) + '\n')


def pack():
    validate()
    fingerprint = key(inputs())
    folder = ROOT / 'build/firmware-release'
    if folder.exists():
        shutil.rmtree(folder)
    folder.mkdir(parents=True)
    for name in core_paths():
        shutil.copyfile(FIRMWARE / name, folder / flat_name(name))
    archive = folder / ('iphone-agent-firmware-' + fingerprint[:16] + '.tar.gz')
    extras = {'README.md': FIRMWARE / 'README.md', 'LICENSE.txt': ROOT / 'LICENSE'}
    extras.update({'licenses/' + p.name: p for p in (FIRMWARE / 'licenses').iterdir() if p.is_file()})
    files = {name: FIRMWARE / name for name in core_paths()} | extras
    with archive.open('wb') as raw, gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w') as package:
            for name, path in sorted(files.items()):
                data = path.read_bytes()
                info = tarfile.TarInfo(name)
                info.size, info.mode, info.mtime = len(data), 0o644, 0
                package.addfile(info, io.BytesIO(data))
    (folder / 'SHA256SUMS').write_text(''.join(f'{sha(p.read_bytes())}  {p.name}\n' for p in sorted(folder.iterdir())))
    return folder


def publish(repository, commit):
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise RuntimeError('Release must name an exact source commit')
    folder = pack()
    fingerprint = key(inputs())
    tag = 'firmware-' + fingerprint
    current = release(repository, tag)
    if current and not current['draft']:
        restore(repository, tag, 'iphone-agent-firmware-' + fingerprint[:16] + '.tar.gz', current)
        print('Reusing verified published firmware Release: ' + tag)
        return
    notes = ROOT / 'build/firmware-release-notes.md'
    notes.write_text(f'Firmware inputs: `{fingerprint}`\n\nSource commit: `{commit}`\n\n'
                     f'{len(builder.PROFILES)} compiled profiles: C2 (26/40 MHz crystals, 2 MB minimum), C3, C5, C6, S3 and classic ESP32 (4 MB minimum). '
                     'Each board has bootloader, partitions, boot_app0 and application binaries. '
                     'Use manifest.json for offsets and SHA-256. The archive also contains licenses. '
                     'The website build uses these same firmware bytes for online flashing; see Actions for deployment status. '
                     'Compilation does not establish physical phone acceptance.\n')
    if not current:
        gh('release', 'create', tag, '--repo', repository, '--target', commit, '--draft', '--latest=false',
           '--title', 'Firmware ' + fingerprint[:12], '--notes-file', str(notes))
    gh('release', 'upload', tag, '--repo', repository, '--clobber', *[str(p) for p in sorted(folder.iterdir())])
    gh('release', 'edit', tag, '--repo', repository, '--draft=false', '--latest=false')
    print('Published firmware Release: ' + tag)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['plan', 'seal', 'verify', 'pack', 'publish'])
    parser.add_argument('--repository', default=os.environ.get('GITHUB_REPOSITORY'))
    parser.add_argument('--commit', default=os.environ.get('GITHUB_SHA'))
    parser.add_argument('--offline', action='store_true')
    args = parser.parse_args()
    if args.command == 'plan':
        plan(args.repository, args.offline)
    elif args.command == 'seal':
        seal()
    elif args.command == 'verify':
        validate()
        print(f'Verified all {len(builder.PROFILES)} current-source firmware profiles and sealed build inputs')
    elif args.command == 'pack':
        print(pack())
    else:
        if not args.repository or not args.commit:
            raise RuntimeError('Publishing requires a repository and exact source commit')
        publish(args.repository, args.commit)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError, tarfile.TarError) as error:
        raise SystemExit('Firmware release failed: ' + str(error))
