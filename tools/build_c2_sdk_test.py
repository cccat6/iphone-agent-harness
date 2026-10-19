"""Independent offline C2 SDK cache/recipe regressions; never downloads or compiles."""
from __future__ import annotations
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
REQUIRED=['sdkconfig','flags/cpp_flags','flags/ld_libs','bin/bootloader_dio_60m.elf','dio_qspi/include/sdkconfig.h','lib/libbt.a','lib/libesp_wifi.a']
def load():
 spec=importlib.util.spec_from_file_location('independent_c2_sdk',ROOT/'tools/build_c2_sdk.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def output_at(path):
 for name in REQUIRED:
  file=path/name;file.parent.mkdir(parents=True,exist_ok=True)
  file.write_bytes(b'\x7fELF-fixture'if name.endswith('.elf')else b'!<arch>\nfixture'if name.endswith('.a')else b'synthetic required file\n')

def seal(module,cache,xtal):
 folder=module.sdk_path(cache,xtal);output_at(folder);(folder/'iah-sdk-provenance.json').write_text(json.dumps({'recipe':module.provenance(xtal),'files':module.sdk_files(folder)}));return folder

class C2CacheTests(unittest.TestCase):
 def test_crystal_caches_are_separate_and_cannot_reuse_the_other_marker(self):
  module=load()
  with tempfile.TemporaryDirectory()as temp:
   cache=Path(temp);first=seal(module,cache,26);second=seal(module,cache,40)
   self.assertNotEqual(first,second);self.assertEqual(module.verified_sdk(cache,26),first);self.assertEqual(module.verified_sdk(cache,40),second)
   shutil.copyfile(first/'iah-sdk-provenance.json',second/'iah-sdk-provenance.json')
   with self.assertRaises(RuntimeError):module.verified_sdk(cache,40)
   self.assertEqual(module.verified_sdk(cache,26),first)

 def test_sdk_modification_addition_deletion_and_missing_magic_are_rejected(self):
  for change in ['library','header','flags','added','missing','invalid-magic']:
   with self.subTest(change=change),tempfile.TemporaryDirectory()as temp:
    module=load();cache=Path(temp);folder=seal(module,cache,26)
    if change=='library':(folder/'lib/libbt.a').write_bytes(b'!<arch>\nmodified')
    elif change=='header':(folder/'dio_qspi/include/sdkconfig.h').write_text('changed header')
    elif change=='flags':(folder/'flags/cpp_flags').write_text('changed compile flags')
    elif change=='added':(folder/'unrecorded.h').write_text('unexpected')
    elif change=='missing':(folder/'sdkconfig').unlink()
    else:
     (folder/'lib/libbt.a').write_bytes(b'not-a-static-archive')
     (folder/'iah-sdk-provenance.json').write_text(json.dumps({'recipe':module.provenance(26),'files':module.sdk_files(folder)}))
    with self.assertRaises(RuntimeError):module.verified_sdk(cache,26)

 def test_fresh_pinned_clone_materializes_and_discards_a_tracked_cache_edit(self):
  git='/Library/Developer/CommandLineTools/usr/bin/git'if Path('/Library/Developer/CommandLineTools/usr/bin/git').is_file()else shutil.which('git')
  if not git:self.skipTest('git is unavailable')
  def command(*args):return subprocess.check_output([git,*map(str,args)],stderr=subprocess.DEVNULL,text=True).strip()
  with tempfile.TemporaryDirectory()as temp:
   module=load();origin=Path(temp)/'origin';origin.mkdir();command('init',origin);command('-C',origin,'config','user.name','Offline fixture');command('-C',origin,'config','user.email','fixture@example.invalid');(origin/'source.txt').write_text('pinned\n');command('-C',origin,'add','source.txt');command('-C',origin,'commit','-m','fixture');commit=command('-C',origin,'rev-parse','HEAD');destination=Path(temp)/'checkout';spec={'url':origin.as_uri(),'commit':commit}
   with contextlib.redirect_stdout(io.StringIO()):module.checkout(git,spec,destination,os.environ.copy())
   self.assertEqual((destination/'source.txt').read_text(),'pinned\n');(destination/'source.txt').write_text('modified\n')
   with contextlib.redirect_stdout(io.StringIO()):module.checkout(git,spec,destination,os.environ.copy())
   self.assertEqual((destination/'source.txt').read_text(),'pinned\n')

 def test_recursive_checkout_keeps_the_committed_submodule_revision_and_discards_its_edit(self):
  git='/Library/Developer/CommandLineTools/usr/bin/git'if Path('/Library/Developer/CommandLineTools/usr/bin/git').is_file()else shutil.which('git')
  if not git:self.skipTest('git is unavailable')
  env={**os.environ,'GIT_ALLOW_PROTOCOL':'file'}
  def command(*args):return subprocess.check_output([git,'-c','protocol.file.allow=always',*map(str,args)],stderr=subprocess.DEVNULL,text=True,env=env).strip()
  def repository(path):
   path.mkdir();command('init',path);command('-C',path,'config','user.name','Offline fixture');command('-C',path,'config','user.email','fixture@example.invalid')
  with tempfile.TemporaryDirectory()as temp:
   root=Path(temp);child=root/'child';parent=root/'parent';repository(child);(child/'source.txt').write_text('pinned submodule\n');command('-C',child,'add','source.txt');command('-C',child,'commit','-m','fixture A');pinned=command('-C',child,'rev-parse','HEAD');repository(parent);command('-C',parent,'submodule','add',child.as_uri(),'deps/tiny');command('-C',parent,'commit','-am','pin fixture submodule');commit=command('-C',parent,'rev-parse','HEAD');(child/'source.txt').write_text('new upstream revision\n');command('-C',child,'commit','-am','fixture B');destination=root/'checkout';module=load();spec={'url':parent.as_uri(),'commit':commit}
   with contextlib.redirect_stdout(io.StringIO()):module.checkout(git,spec,destination,env,recursive=True)
   self.assertEqual(command('-C',destination/'deps/tiny','rev-parse','HEAD'),pinned);(destination/'deps/tiny/source.txt').write_text('dirty cached submodule\n')
   with contextlib.redirect_stdout(io.StringIO()):module.checkout(git,spec,destination,env,recursive=True)
   self.assertEqual(command('-C',destination/'deps/tiny','rev-parse','HEAD'),pinned);self.assertEqual((destination/'deps/tiny/source.txt').read_text(),'pinned submodule\n')

 def main_fixture(self,change=None):
  temporary=tempfile.TemporaryDirectory(prefix='iah-c2-offline-');self.addCleanup(temporary.cleanup);root=Path(temporary.name);module=load();bootstrap=root/'bootstrap.py';shutil.copyfile(ROOT/'tools/build_c2_sdk.py',bootstrap);module.__file__=str(bootstrap);module.LOCK=root/'c2_sdk.lock.json';recipe=json.loads((ROOT/'tools/c2_sdk.lock.json').read_text());constraints=b'pinned offline constraints\n';recipe['constraints']['sha256']=hashlib.sha256(constraints).hexdigest();module.LOCK.write_text(json.dumps(recipe));shutil.copyfile(ROOT/'tools/c2_sdk.components.lock',root/'c2_sdk.components.lock')
  cache=root/'cache';builder=cache/'lib-builder';(builder/'configs').mkdir(parents=True);(builder/'configs/builds.json').write_text('{"targets":[]}');(builder/'configs/defconfig.esp32c2').write_text('CONFIG_XTAL_FREQ_26=y\nCONFIG_XTAL_FREQ=26\n');(builder/'build.sh').write_text('getopts ":A:I:i:c:t:b:D:sde"');python=cache/'python-env'/('Scripts/python.exe'if os.name=='nt'else'bin/python');python.parent.mkdir(parents=True);python.write_text('offline placeholder');compiler=root/'compiler';(compiler/'bin').mkdir(parents=True);(compiler/'bin/riscv32-esp-elf-gcc').write_text('offline placeholder');constraintfile=cache/'idf-tools/espidf.constraints.v5.5.txt';constraintfile.parent.mkdir(parents=True);constraintfile.write_bytes(b'wrong'if change=='constraints'else constraints);calls=[]
  module.checkout=lambda git,spec,destination,env,recursive=False:Path(destination).mkdir(parents=True,exist_ok=True);module.gnu_tools=lambda *args:None
  def run(command,**kwargs):
   if '--version'in list(map(str,command)):return recipe['toolchainVersion']
   self.assertEqual(list(map(str,command)),['bash','./build.sh','-s','-n','-t','esp32c2']);calls.append(command);output_at(builder/'out/tools/esp32-arduino-libs/esp32c2')
   if change=='bootstrap':bootstrap.write_text(bootstrap.read_text()+'\n# in-flight change\n')
   if change=='recipe-lock':module.LOCK.write_text(module.LOCK.read_text()+'\n')
   if change=='managed-lock':(builder/'dependencies.lock').write_text('unapproved dependency resolution')
   return ''
  module.run=run
  return module,cache,compiler,calls

 def invoke(self,module,cache,compiler):
  with patch.object(sys,'argv',['bootstrap','--cache',str(cache),'--toolchain',str(compiler),'--xtal','26']),contextlib.redirect_stdout(io.StringIO()):return module.main()

 def test_successful_simulated_output_is_sealed_then_reused_without_a_second_build(self):
  module,cache,compiler,calls=self.main_fixture();self.assertEqual(self.invoke(module,cache,compiler),0);self.assertEqual(len(calls),1);self.assertEqual(module.verified_sdk(cache,26),module.sdk_path(cache,26));self.assertEqual(self.invoke(module,cache,compiler),0);self.assertEqual(len(calls),1)

 def test_inflight_recipe_or_managed_dependency_changes_never_publish_a_cache_marker(self):
  for change in ['bootstrap','recipe-lock','managed-lock']:
   with self.subTest(change=change):
    module,cache,compiler,calls=self.main_fixture(change)
    with self.assertRaises(RuntimeError):self.invoke(module,cache,compiler)
    self.assertEqual(len(calls),1);self.assertFalse((module.sdk_path(cache,26)/'iah-sdk-provenance.json').exists())

 def test_mismatched_python_constraints_reject_before_any_simulated_build(self):
  module,cache,compiler,calls=self.main_fixture('constraints')
  with self.assertRaisesRegex(RuntimeError,'constraints changed'):self.invoke(module,cache,compiler)
  self.assertEqual(calls,[])

if __name__=='__main__':unittest.main()
