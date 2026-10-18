#!/usr/bin/env python3
"""Offline artifact-integrity tests. All binary fixtures are temporary, never published."""
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('build_firmware',Path(__file__).with_name('build_firmware.py'))
build=importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


def partition_table():
    entries=[(1,2,0x9000,0x5000,b'nvs'),(1,0,0xe000,0x2000,b'otadata'),(0,16,0x10000,0x300000,b'app0'),(1,130,0x310000,0xe0000,b'spiffs'),(1,3,0x3f0000,0x10000,b'coredump')]
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


if __name__=='__main__':unittest.main()
