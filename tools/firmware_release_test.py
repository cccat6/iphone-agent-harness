#!/usr/bin/env python3
"""Finite offline release tests; no GitHub writes, compilers, credentials or ports."""
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import shutil
import subprocess
import struct
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import firmware_release as release

SOURCE_ROOT = release.ROOT


@contextlib.contextmanager
def fixture():
    with tempfile.TemporaryDirectory(prefix='iah-release-test-') as temporary:
        root = Path(temporary)
        sketch = root / 'firmware/IPhoneAutomationHarness'
        sketch.mkdir(parents=True)
        for name in release.builder.SOURCE_FILES:
            destination = sketch / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(SOURCE_ROOT / 'firmware/IPhoneAutomationHarness' / name, destination)
        (root / 'tools').mkdir()
        for recipe in ('build_firmware.py', 'verify_rtc_tls_link.py', 'build_c2_sdk.py', 'c2_sdk.lock.json', 'c2_sdk.components.lock', 'partitions/c2-2m.csv'):
            (root/'tools'/recipe).parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(SOURCE_ROOT / 'tools' / recipe, root / 'tools' / recipe)
        shutil.copyfile(SOURCE_ROOT / 'LICENSE', root / 'LICENSE')
        output = root / 'apps/web/firmware'
        output.mkdir(parents=True)
        (output / 'README.md').write_text('Synthetic offline firmware fixture; never publish or flash.')
        (output / 'licenses').mkdir()
        (output / 'licenses/fixture-LICENSE').write_text('Synthetic fixture license notice')
        # No production binaries are assumed current or relabelled. All tiny
        # binary fixtures and their declared build records exist only here.
        entries=[(1,2,0x9000,0x5000,b'nvs'),(1,0,0xe000,0x2000,b'otadata'),(0,16,0x10000,0x300000,b'app0')]
        partitions=b''.join(struct.pack('<HBBLL16sL',0x50aa,t,s,o,n,label,0) for t,s,o,n,label in entries)+b'\xff'*32
        profiles=[]
        for profile_id,config in release.builder.PROFILES.items():
            parts=[]
            for name,offset,raw in zip(release.PARTS,[config.get('bootloaderOffset',0x1000 if profile_id=='esp32' else 0),0x8000,0xe000,0x10000],[b'fixture boot',(partitions if config.get('minFlashMB',4)==4 else b''.join(struct.pack('<HBBLL16sL',0x50aa,t,s,o,n,label,0) for t,s,o,n,label in [(1,2,0x9000,0x5000,b'nvs'),(1,0,0xe000,0x2000,b'otadata'),(0,0,0x10000,0x1e0000,b'app0'),(1,3,0x1f0000,0x10000,b'coredump')])+b'\xff'*32),b'fixture OTA',b'fixture app']):
                destination=output/profile_id/name;destination.parent.mkdir(exist_ok=True);destination.write_bytes(raw)
                parts.append({'path':f'{profile_id}/{name}','offset':offset,'size':len(raw),'sha256':release.sha(raw)})
            profiles.append({'id':profile_id,'label':config['label'],'chip':config.get('chip',profile_id),'board':config['board'],'minFlashMB':config.get('minFlashMB',4),'usbCdc':config['usbCdc'],'flashFreq':config['flashFreq'],**({'xtalMHz':config['xtalMHz']} if config.get('xtalMHz') else {}),'parts':parts})
        source_files={name:release.sha((sketch/name).read_bytes()) for name in release.builder.SOURCE_FILES}
        report={'dependencies':release.DEPENDENCIES,'sourceFiles':source_files,'sourceSha256':release.sha(json.dumps(source_files,sort_keys=True,separators=(',',':')).encode()),'profiles':[{'id':name,'fqbn':config['fqbn'],'compiled':True,**({'sdkProvenance':{'recipe':release.builder.c2_sdk.provenance(config['xtalMHz']),'filesSha256':'a'*64,'fileCount':100,'configuration':release.builder.c2_configuration(config['xtalMHz'])}} if config.get('chip')=='esp32c2' else {})} for name,config in release.builder.PROFILES.items()]}
        (output/'manifest.json').write_text(json.dumps({'schemaVersion':1,'profiles':profiles}))
        (output/'build-report.json').write_text(json.dumps(report))
        with patch.object(release, 'ROOT', root), patch.object(release, 'FIRMWARE', output), patch.object(release.builder, 'SKETCH', sketch):
            (output/'build-inputs.json').write_text(json.dumps(release.inputs()))
            yield root, sketch, output


class FirmwareReleaseTests(unittest.TestCase):
    def test_web_docs_and_local_credentials_do_not_change_firmware_key(self):
        with fixture() as (root, sketch, output):
            before = release.key(release.inputs())
            (root / 'apps/web/app.js').write_text('// changed web')
            (sketch / 'README.md').write_text('changed docs')
            (sketch / 'config.local.h').write_text('not a public build input')
            self.assertEqual(release.key(release.inputs()), before)
            with patch.object(release, 'gh', side_effect=AssertionError('offline must not call GitHub')):
                self.assertFalse(release.plan(offline=True)['compile'])

    def test_source_and_recipe_changes_require_compile_even_after_many_web_pushes(self):
        with fixture() as (root, sketch, output):
            before = release.key(release.inputs())
            (sketch / 'src/Core.h').write_text((sketch / 'src/Core.h').read_text() + '\n// source change\n')
            self.assertNotEqual(release.key(release.inputs()), before)
            self.assertTrue(release.plan(offline=True)['compile'])
        with fixture() as (root, sketch, output):
            before = release.key(release.inputs())
            (root / 'tools/build_firmware.py').write_text('// changed recipe')
            self.assertNotEqual(release.key(release.inputs()), before)
            self.assertTrue(release.plan(offline=True)['compile'])

    def test_tls_link_guard_change_invalidates_recipe_reuse(self):
        with fixture() as (root, sketch, output):
            before = release.key(release.inputs())
            guard = root / 'tools/verify_rtc_tls_link.py'
            guard.write_text(guard.read_text() + '\n# changed verification recipe\n')
            self.assertNotEqual(release.key(release.inputs()), before)
            self.assertTrue(release.plan(offline=True)['compile'])

    def test_partial_profiles_wrong_dependencies_and_corrupt_binary_are_rejected(self):
        with fixture() as (root, sketch, output):
            report_path = output / 'build-report.json'
            original = report_path.read_text()
            report = json.loads(original)
            report['profiles'].pop()
            report_path.write_text(json.dumps(report))
            with self.assertRaisesRegex(RuntimeError, 'configured profiles'):
                release.validate()
            report = json.loads(original)
            report['dependencies']['NimBLE-Arduino'] = '0.0.0'
            report_path.write_text(json.dumps(report))
            with self.assertRaisesRegex(RuntimeError, 'dependency'):
                release.validate()
            report_path.write_text(original)
            (output / 'esp32c3/application.bin').write_bytes(b'corrupted')
            with self.assertRaisesRegex(RuntimeError, 'hash'):
                release.validate()

    def test_pack_has_all_configured_loose_binaries_metadata_licenses_and_reproducible_archive(self):
        with fixture() as (root, sketch, output):
            folder = release.pack()
            self.assertEqual(len(list(folder.glob('*.bin'))), len(release.builder.PROFILES)*len(release.PARTS))
            sums = release.checksums((folder / 'SHA256SUMS').read_text())
            self.assertEqual(set(sums), {p.name for p in folder.iterdir()} - {'SHA256SUMS'})
            for name, digest in sums.items():
                self.assertEqual(hashlib.sha256((folder / name).read_bytes()).hexdigest(), digest)
            archive_name = next(folder.glob('*.tar.gz')).name
            before = (folder / archive_name).read_bytes()
            with tarfile.open(fileobj=io.BytesIO(before), mode='r:gz') as archive:
                self.assertTrue(set(release.core_paths()).issubset(archive.getnames()))
                self.assertIn('LICENSE.txt', archive.getnames())
                self.assertTrue(any(n.startswith('licenses/') for n in archive.getnames()))
            self.assertEqual((release.pack() / archive_name).read_bytes(), before)

    def test_restore_validates_everything_before_copying_and_published_cache_avoids_compile(self):
        with fixture() as (root, sketch, output):
            folder = release.pack()
            archive_name = next(folder.glob('*.tar.gz')).name
            metadata = {'draft': False, 'assets': [{'name': p.name, 'digest': 'sha256:' + release.sha(p.read_bytes())} for p in folder.iterdir()]}
            snapshot = {p.name: p.read_bytes() for p in folder.iterdir()}
            def fake_gh(*args, **kwargs):
                if args[:2] == ('release', 'download'):
                    destination = Path(args[args.index('--dir') + 1])
                    for name in [archive_name, 'SHA256SUMS']:
                        (destination / name).write_bytes(snapshot[name])
                    return ''
                raise AssertionError(args)
            (output / 'esp32c3/application.bin').write_bytes(b'stale checkout binary')
            with patch.object(release, 'release', return_value=metadata), patch.object(release, 'gh', side_effect=fake_gh):
                self.assertEqual(release.plan('owner/repo')['origin'], 'release')
                release.validate()
                destination = root / 'destination'
                destination.mkdir()
                sentinel = destination / 'manifest.json'
                sentinel.write_text('preserved')
                snapshot[archive_name] += b'tampered'
                with self.assertRaisesRegex(RuntimeError, 'checksum mismatch'):
                    release.restore('owner/repo', 'tag', archive_name, metadata, destination)
                self.assertEqual(sentinel.read_text(), 'preserved')
                self.assertEqual(list(destination.iterdir()), [sentinel])

    def test_complete_draft_archive_recovers_missing_assets_without_recompiling(self):
        with fixture() as (root, sketch, output):
            folder=release.pack();archive_name=next(folder.glob('*.tar.gz')).name
            snapshot={p.name:p.read_bytes() for p in folder.iterdir()}
            metadata={'draft':True,'assets':[{'name':archive_name},{'name':'SHA256SUMS'}]}
            (output/'esp32c3/application.bin').write_bytes(b'stale checked-in binary')
            calls=[]
            def fake_gh(*args,**kwargs):
                calls.append(args)
                if args[:2]==('release','download'):
                    destination=Path(args[args.index('--dir')+1])
                    for name in [archive_name,'SHA256SUMS']:(destination/name).write_bytes(snapshot[name])
                return ''
            with patch.object(release,'release',return_value=metadata),patch.object(release,'gh',side_effect=fake_gh):
                plan=release.plan('owner/repo');self.assertEqual(plan['origin'],'release-draft');self.assertFalse(plan['compile'])
                release.validate();calls.clear();release.publish('owner/repo','a'*40)
                self.assertEqual([c[1] for c in calls],['upload','edit'])
                self.assertIn('--clobber',calls[0]);self.assertIn('--draft=false',calls[1])

    def test_published_cache_corruption_fails_instead_of_wasting_a_rebuild(self):
        with fixture():
            with patch.object(release, 'release', return_value={'draft': False, 'assets': []}):
                with self.assertRaisesRegex(RuntimeError, 'incomplete'):
                    release.plan('owner/repo')

    def test_archive_traversal_links_duplicates_and_missing_parts_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for name, kind in [('../outside', tarfile.REGTYPE), ('manifest.json', tarfile.SYMTYPE)]:
                archive = root / 'bad.tar.gz'
                with tarfile.open(archive, 'w:gz') as stream:
                    info = tarfile.TarInfo(name)
                    info.type = kind
                    info.linkname = '../outside' if kind == tarfile.SYMTYPE else ''
                    stream.addfile(info)
                with self.assertRaisesRegex(RuntimeError, 'Unexpected'):
                    release.unpack(archive, root / 'out')
                self.assertFalse((root.parent / 'outside').exists())
            with tarfile.open(root / 'bad.tar.gz', 'w:gz') as stream:
                for _ in range(2):
                    stream.addfile(tarfile.TarInfo('manifest.json'), io.BytesIO(b''))
            with self.assertRaisesRegex(RuntimeError, 'Unexpected'):
                release.unpack(root / 'bad.tar.gz', root / 'out')
            with tarfile.open(root / 'bad.tar.gz', 'w:gz'):
                pass
            with self.assertRaisesRegex(RuntimeError, 'incomplete'):
                release.unpack(root / 'bad.tar.gz', root / 'out')

    def test_permission_and_network_failures_are_not_cache_misses(self):
        with patch.object(release.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, '', 'Not Found (HTTP 404)')):
            self.assertIsNone(release.gh('api', 'path', missing_ok=True))
        for message in ['Forbidden (HTTP 403)', 'connection timeout']:
            with patch.object(release.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, '', message)):
                with self.assertRaisesRegex(RuntimeError, 'GitHub command failed'):
                    release.gh('api', 'path', missing_ok=True)

    def test_draft_publish_and_published_reuse_never_overwrite_a_published_release(self):
        with fixture() as (root, sketch, output):
            calls = []
            with patch.object(release, 'release', return_value=None), patch.object(release, 'gh', side_effect=lambda *a, **k: calls.append(a)):
                release.publish('owner/repo', 'a' * 40)
            self.assertEqual([c[1] for c in calls], ['create', 'upload', 'edit'])
            self.assertIn('--draft', calls[0])
            self.assertIn('--target', calls[0])
            self.assertIn('--clobber', calls[1])
            self.assertIn('--draft=false', calls[2])
            calls.clear()
            with patch.object(release, 'release', return_value={'draft': False}), patch.object(release, 'restore') as restore, patch.object(release, 'gh', side_effect=lambda *a, **k: calls.append(a)):
                release.publish('owner/repo', 'a' * 40)
                restore.assert_called_once()
            self.assertEqual(calls, [])

    def test_workflow_has_only_manual_trigger_and_copies_firmware_before_site_build(self):
        text = (SOURCE_ROOT / '.github/workflows/checks.yml').read_text()
        self.assertRegex(text, r'(?m)^on:\n  workflow_dispatch:\n\n')
        for trigger in ['push:', 'pull_request:', 'schedule:', 'release:', 'workflow_run:']:
            self.assertNotIn('\n  ' + trigger + '\n', text.split('jobs:')[0])
        self.assertIn("if: github.ref == 'refs/heads/main'", text)
        self.assertIn('cancel-in-progress: false', text)
        self.assertEqual(text.count("if: steps.firmware.outputs.compile == 'true'"), 3)
        order = ['firmware_release.py plan', 'build_firmware.py --parallel', 'firmware_release.py verify', 'npm run build', 'firmware_release.py publish', 'wrangler deploy\n', 'verify_release_site.mjs']
        positions = [text.index(item) for item in order]
        self.assertEqual(positions, sorted(positions))


if __name__ == '__main__':
    unittest.main(verbosity=2)
