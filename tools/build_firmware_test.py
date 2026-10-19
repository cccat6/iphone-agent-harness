#!/usr/bin/env python3
"""Offline artifact-integrity tests. All binary fixtures are temporary, never published."""
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch
import subprocess
import sys

spec=importlib.util.spec_from_file_location('build_firmware',Path(__file__).with_name('build_firmware.py'))
build=importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


def partition_table(flash_mb=4):
    entries=[(1,2,0x9000,0x5000,b'nvs'),(1,0,0xe000,0x2000,b'otadata'),(0,16,0x10000,0x300000,b'app0'),(1,130,0x310000,0xe0000,b'spiffs'),(1,3,0x3f0000,0x10000,b'coredump')]
    if flash_mb==2:entries=[(1,2,0x9000,0x5000,b'nvs'),(1,0,0xe000,0x2000,b'otadata'),(0,0,0x10000,0x1e0000,b'app0'),(1,3,0x1f0000,0x10000,b'coredump')]
    result=b''.join(struct.pack('<HBBLL16sL',0x50aa,t,s,o,n,label,0) for t,s,o,n,label in entries)
    return result+b'\xff'*(3072-len(result))


class FirmwareArtifacts(unittest.TestCase):
    def fixture(self,root):
        directory=root/'esp32c3';directory.mkdir()
        data=[b'bootloader',partition_table(),b'\0'*8192,b'temporary test app']
        names=['bootloader.bin','partitions.bin','boot_app0.bin','application.bin']
        offsets=[0,0x8000,0xe000,0x10000]
        parts=[]
        for name,raw,offset in zip(names,data,offsets):
            (directory/name).write_bytes(raw)
            parts.append({'path':'esp32c3/'+name,'offset':offset,'size':len(raw),'sha256':build.digest(raw)})
        manifest={'schemaVersion':1,'profiles':[{'id':'esp32c3','label':'ESP32-C3','chip':'esp32c3','board':'ESP32C3 Dev Module','minFlashMB':4,'usbCdc':True,'parts':parts}]}
        path=root/'manifest.json';path.write_text(json.dumps(manifest))
        return path,manifest

    def test_valid_offsets_hashes_and_4mb_partitions(self):
        with tempfile.TemporaryDirectory() as temporary:
            path,_=self.fixture(Path(temporary));self.assertEqual(build.validate_manifest(path),1)

    def test_c5_requires_its_0x2000_bootloader_offset(self):
        with tempfile.TemporaryDirectory() as temporary:
            path,manifest=self.fixture(Path(temporary));root=path.parent
            (root/'esp32c3').rename(root/'esp32c5')
            profile=manifest['profiles'][0];profile.update(id='esp32c5',chip='esp32c5',label='ESP32-C5',board='ESP32C5 Dev Module')
            for part in profile['parts']:part['path']=part['path'].replace('esp32c3/','esp32c5/')
            profile['parts'][0]['offset']=0x2000;path.write_text(json.dumps(manifest));self.assertEqual(build.validate_manifest(path),1)
            profile['parts'][0]['offset']=0;path.write_text(json.dumps(manifest))
            with self.assertRaisesRegex(RuntimeError,'offsets'):build.validate_manifest(path)

    def test_mismatched_flash_frequency_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            path,manifest=self.fixture(Path(temporary));manifest['profiles'][0]['flashFreq']='60m';path.write_text(json.dumps(manifest))
            with self.assertRaisesRegex(RuntimeError,'frequency'):build.validate_manifest(path)

    def test_c2_crystal_profiles_share_physical_chip_but_require_exact_variant(self):
        with tempfile.TemporaryDirectory() as temporary:
            path,manifest=self.fixture(Path(temporary));root=path.parent;original=manifest['profiles'][0];profiles=[]
            import copy,shutil
            for profile_id,xtal in [('esp32c2',26),('esp32c2-40',40)]:
                shutil.copytree(root/'esp32c3',root/profile_id);profile=copy.deepcopy(original);profile.update(id=profile_id,chip='esp32c2',label='ESP32-C2',board='ESP32C2 Dev Module',usbCdc=False,flashFreq='60m',xtalMHz=xtal,minFlashMB=2)
                for part in profile['parts']:part['path']=part['path'].replace('esp32c3/',profile_id+'/')
                part=profile['parts'][1];raw=partition_table(2);(root/part['path']).write_bytes(raw);part.update(size=len(raw),sha256=build.digest(raw))
                profiles.append(profile)
            manifest['profiles']=profiles;path.write_text(json.dumps(manifest));self.assertEqual(build.validate_manifest(path),2)
            profiles[1]['xtalMHz']=26;path.write_text(json.dumps(manifest))
            with self.assertRaisesRegex(RuntimeError,'crystal'):build.validate_manifest(path)

    def test_c2_sdk_configuration_proves_crystal_wifi_and_ble(self):
        with tempfile.TemporaryDirectory() as temporary:
            sdk=Path(temporary);(sdk/'dio_qspi/include').mkdir(parents=True)
            for xtal in [26,40]:
                config='CONFIG_XTAL_FREQ='+str(xtal)+'\n'+'\n'.join(flag+'=y' for flag in ['CONFIG_BT_ENABLED','CONFIG_BT_NIMBLE_ENABLED','CONFIG_ESP_WIFI_ENABLED'])+'\n'
                header='#define CONFIG_XTAL_FREQ '+str(xtal)+'\n'+'\n'.join('#define '+flag+' 1' for flag in ['CONFIG_BT_ENABLED','CONFIG_BT_NIMBLE_ENABLED','CONFIG_ESP_WIFI_ENABLED'])+'\n'
                (sdk/'sdkconfig').write_text(config);(sdk/'dio_qspi/include/sdkconfig.h').write_text(header)
                self.assertEqual(build.verify_c2_configuration(sdk,xtal)['xtalMHz'],xtal)
                with self.assertRaisesRegex(RuntimeError,'crystal'):build.verify_c2_configuration(sdk,40 if xtal==26 else 26)
                (sdk/'sdkconfig').write_text(config.replace('CONFIG_BT_ENABLED=y','CONFIG_BT_ENABLED=n'))
                with self.assertRaisesRegex(RuntimeError,'Bluetooth'):build.verify_c2_configuration(sdk,xtal)

    def test_c2_two_mb_partition_has_headroom_and_preserves_nvs(self):
        entries=build.validate_partition_table(partition_table(2),2,0x1e0000)
        self.assertIn((1,2,0x9000,0x5000,'nvs'),entries)
        self.assertIn((0,0,0x10000,0x1e0000,'app0'),entries)
        self.assertEqual(max(offset+size for _,_,offset,size,_ in entries),2*1024*1024)
        with self.assertRaisesRegex(RuntimeError,'2MB'):build.validate_partition_table(partition_table(),2,0x1e0000)

    def test_corrupted_binary_and_bad_flash_offsets_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            path,manifest=self.fixture(Path(temporary));image=path.parent/manifest['profiles'][0]['parts'][3]['path'];image.write_bytes(b'corrupt')
            with self.assertRaisesRegex(RuntimeError,'hash'):build.validate_manifest(path)
            part=manifest['profiles'][0]['parts'][3];part.update(size=7,sha256=build.digest(b'corrupt'),offset=0x20000);path.write_text(json.dumps(manifest))
            with self.assertRaisesRegex(RuntimeError,'offsets'):build.validate_manifest(path)

    def test_path_escape_and_partition_overflow_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            path,manifest=self.fixture(Path(temporary));manifest['profiles'][0]['parts'][0]['path']='../outside.bin';path.write_text(json.dumps(manifest))
            with self.assertRaisesRegex(RuntimeError,'escapes'):build.validate_manifest(path)
        raw=bytearray(partition_table());raw[8:12]=struct.pack('<L',0x800000)
        with self.assertRaisesRegex(RuntimeError,'4MB'):build.validate_partition_table(bytes(raw))

    def test_local_configuration_and_relay_files_never_enter_clean_source(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);source=root/'source';source.mkdir();(source/'src').mkdir()
            for name in build.SOURCE_FILES:
                public=source/name;public.parent.mkdir(parents=True,exist_ok=True);public.write_text('// public source')
            (source/'config.local.h').write_text('private testing secret');(source/'relay_config.h').write_text('private relay secret')
            original=build.SKETCH
            try:
                build.SKETCH=source
                _,files=build.copy_clean_sketch(root/'clean')
            finally:build.SKETCH=original
            self.assertNotIn('config.local.h',files);self.assertNotIn('relay_config.h',files)
            self.assertNotIn(b'private',b''.join(p.read_bytes() for p in (root/'clean').rglob('*') if p.is_file()))

    def test_persistent_staging_reuses_public_files_and_rejects_extra_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);clean=root/'clean'
            first=build.copy_clean_sketch(clean)
            self.assertEqual(build.copy_clean_sketch(clean),first)
            (clean/'config.local.h').write_text('// do not copy private configuration')
            with self.assertRaisesRegex(RuntimeError,'unapproved'):
                build.copy_clean_sketch(clean)

    def test_source_provenance_rejects_stale_or_missing_reports(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);source=root/'source';source.mkdir()
            for relative in build.SOURCE_FILES:
                path=source/relative;path.parent.mkdir(parents=True,exist_ok=True);path.write_text('// public source')
            original=build.SKETCH
            try:
                build.SKETCH=source
                with self.assertRaisesRegex(RuntimeError,'Missing build report'):build.verify_sources(root)
                overall,files=build.copy_clean_sketch(root/'clean')
                report={'sourceSha256':overall,'sourceFiles':files};(root/'build-report.json').write_text(json.dumps(report))
                self.assertEqual(build.verify_sources(root),len(build.SOURCE_FILES))
                (source/'main.cpp').write_text('// source changed after build')
                with self.assertRaisesRegex(RuntimeError,'stale'):build.verify_sources(root)
                (source/'main.cpp').write_text('// public source');report['sourceSha256']='0'*64;(root/'build-report.json').write_text(json.dumps(report))
                with self.assertRaisesRegex(RuntimeError,'overall'):build.verify_sources(root)
            finally:build.SKETCH=original


class FirmwarePublication(unittest.TestCase):
    def snapshot(self, folder):
        return {p.relative_to(folder).as_posix(): p.read_bytes() for p in folder.rglob('*') if p.is_file()}

    def prior(self, root):
        output = root / 'published'; output.mkdir()
        (output / 'esp32c3').mkdir(); (output / 'esp32c3/application.bin').write_bytes(b'prior app')
        (output / 'manifest.json').write_bytes(b'prior manifest')
        (output / 'build-inputs.json').write_bytes(b'prior seal')
        (output / 'README.md').write_bytes(b'current docs')
        (output / 'licenses').mkdir(); (output / 'licenses/MIT').write_bytes(b'license')
        return output

    def test_collect_and_validation_failures_preserve_the_whole_prior_set(self):
        for failure in ['collect', 'validate']:
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as temporary:
                root=Path(temporary); output=self.prior(root); before=self.snapshot(output)
                with self.assertRaisesRegex(RuntimeError, failure):
                    with build.staged_output(output) as candidate:
                        (candidate/'esp32c3').mkdir()
                        (candidate/'esp32c3/application.bin').write_bytes(b'new partial app')
                        raise RuntimeError(failure)
                self.assertEqual(self.snapshot(output),before)

    def test_collect_invalid_later_part_never_changes_published_earlier_parts(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary); output=self.prior(root); before=self.snapshot(output)
            compiler=root/'compiler';compiler.mkdir()
            (compiler/'flash_args').write_text('--flash-freq 80m --flash-size 4MB\n0x0 boot.bin\n0x8000 partition.bin\n0xe000 ota.bin\n0x10000 app.bin\n')
            for name,raw in [('boot.bin',b'new boot'),('partition.bin',b'bad partition'*256),('ota.bin',b'ota'),('app.bin',b'app')]:
                (compiler/name).write_bytes(raw)
            with self.assertRaisesRegex(RuntimeError,'partition'):
                with build.staged_output(output) as candidate:
                    build.collect_parts(compiler,'esp32c3',candidate)
            self.assertEqual(self.snapshot(output),before)

    def test_directory_swap_failure_restores_previous_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary); output=self.prior(root); before=self.snapshot(output)
            rename=Path.rename
            def interrupted(path, target):
                if path.name=='candidate': raise OSError('swap failed')
                return rename(path,target)
            with self.assertRaisesRegex(OSError,'swap failed'), patch.object(Path,'rename',interrupted):
                with build.staged_output(output) as candidate:
                    (candidate/'manifest.json').write_text('new manifest')
            self.assertEqual(self.snapshot(output),before)

    def test_success_retains_docs_and_licenses_and_removes_old_seal(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary); output=self.prior(root)
            with build.staged_output(output) as candidate:
                (candidate/'manifest.json').write_text('new manifest')
            self.assertEqual((output/'README.md').read_bytes(),b'current docs')
            self.assertEqual((output/'licenses/MIT').read_bytes(),b'license')
            self.assertEqual((output/'manifest.json').read_text(),'new manifest')
            self.assertFalse((output/'build-inputs.json').exists())
            self.assertFalse((output/'esp32c3').exists())

    def test_docs_and_license_edits_during_compilation_survive_publication(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);output=self.prior(root)
            with build.staged_output(output) as candidate:
                (output/'README.md').write_text('new instructions during compilation')
                (output/'licenses/MIT').unlink()
                (output/'licenses/New').write_text('new notice')
                (candidate/'manifest.json').write_text('new manifest')
            self.assertEqual((output/'README.md').read_text(),'new instructions during compilation')
            self.assertFalse((output/'licenses/MIT').exists())
            self.assertEqual((output/'licenses/New').read_text(),'new notice')

    def test_main_recipe_edit_during_compilation_preserves_prior_set(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary); output=self.prior(root);before=self.snapshot(output)
            def compiler(command,**kwargs):
                location=Path(command[command.index('--build-path')+1]);location.mkdir()
                (location/'build_opt.h').write_bytes((build.SKETCH/'build_opt.h').read_bytes())
                return subprocess.CompletedProcess(command,0,'')
            argv=['build_firmware.py','--arduino-cli',sys.executable,'--profiles','esp32c3','--output',str(output)]
            with patch.object(sys,'argv',argv),patch.object(build,'dependencies',return_value={}),patch.object(build.subprocess,'run',side_effect=compiler),patch.object(build,'verify_tls_link',return_value={}),patch.object(build,'collect_parts',return_value=[]),patch.object(build,'validate_manifest'),patch.object(build,'verify_sources'),patch.object(build,'recipe_files',side_effect=[{'recipe':'before'},{'recipe':'after'}]):
                with self.assertRaisesRegex(RuntimeError,'recipe changed during compilation'):build.main()
            self.assertEqual(self.snapshot(output),before)

    def test_production_requires_complete_set_and_partial_builds_use_separate_output(self):
        with self.assertRaisesRegex(RuntimeError,'every profile'):
            build.check_output_profiles(build.ROOT/'apps/web/firmware',['esp32c3'])
        build.check_output_profiles(build.ROOT/'build/partial',['esp32c3'])
        with self.assertRaisesRegex(RuntimeError,'once'):
            build.check_output_profiles(build.ROOT/'build/partial',['esp32c3','esp32c3'])

    def test_main_compiler_failure_preserves_prior_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary); output=self.prior(root);before=self.snapshot(output)
            argv=['build_firmware.py','--arduino-cli',sys.executable,'--profiles','esp32c3','--output',str(output)]
            with patch.object(sys,'argv',argv), patch.object(build,'dependencies',return_value={}), patch.object(build.subprocess,'run',return_value=subprocess.CompletedProcess([],1,'compiler error')):
                with self.assertRaisesRegex(RuntimeError,'Compilation failed'):
                    build.main()
            self.assertEqual(self.snapshot(output),before)

    def test_main_final_validation_failure_preserves_prior_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary); output=self.prior(root);before=self.snapshot(output)
            def compiler(command,**kwargs):
                location=Path(command[command.index('--build-path')+1]);location.mkdir()
                (location/'build_opt.h').write_bytes((build.SKETCH/'build_opt.h').read_bytes())
                flag=command[command.index('--build-property')+1]
                self.assertRegex(flag, r'^compiler\.cpp\.extra_flags=-DIAH_BUILD_ID=[a-f0-9]{16}$')
                return subprocess.CompletedProcess(command,0,'')
            def collect(location,profile,candidate):
                (candidate/profile).mkdir();(candidate/profile/'application.bin').write_bytes(b'new compiled app')
                return []
            argv=['build_firmware.py','--arduino-cli',sys.executable,'--profiles','esp32c3','--output',str(output)]
            with patch.object(sys,'argv',argv), patch.object(build,'dependencies',return_value={}), patch.object(build.subprocess,'run',side_effect=compiler), patch.object(build,'verify_tls_link',return_value={}), patch.object(build,'collect_parts',side_effect=collect), patch.object(build,'validate_manifest',side_effect=RuntimeError('manifest validation failed')):
                with self.assertRaisesRegex(RuntimeError,'manifest validation failed'):build.main()
            self.assertEqual(self.snapshot(output),before)


if __name__=='__main__':unittest.main()
