#!/usr/bin/env python3
import tempfile
import unittest
from pathlib import Path
import verify_rtc_tls_link as guard

class TlsLinkTests(unittest.TestCase):
 def fixture(self,root):
  source=root/'source';source.mkdir();(source/'RtcTlsConfig.h').write_text('#define MBEDTLS_SSL_IN_CONTENT_LEN 2048\n#define MBEDTLS_SSL_OUT_CONTENT_LEN 2048\n')
  objects=root/'build/sketch/src/RtcTls';objects.mkdir(parents=True)
  for name in guard.TLS_UNITS:
   (source/name).write_text('#include "RtcTlsConfig.h"\n// isolated fixture\n');(objects/(name+'.o')).write_bytes(b'ELF-fixture')
  lines=['LOAD /sdk/libmbedtls_2.a']
  for symbol,unit in guard.CRITICAL.items():lines.extend([' .text.'+symbol,' 0x42001234 0x40 '+str(objects/(unit+'.o'))])
  path=root/'build/fixture.map';path.write_text('\n'.join(lines)+'\n');return root/'build',source,path
 def test_complete_family_with_live_project_symbols_passes(self):
  with tempfile.TemporaryDirectory() as tmp:
   build,source,path=self.fixture(Path(tmp));r=guard.verify_tls_link(build,source);self.assertEqual(r['recordContentBytes'],2048);self.assertEqual(r['tlsUnitsCompiled'],20);self.assertEqual(r['sdkTlsMembers'],[])
 def test_local_tls_archive_live_symbols_pass_without_accepting_other_archives(self):
  with tempfile.TemporaryDirectory() as tmp:
   build,source,path=self.fixture(Path(tmp));text=path.read_text()
   for unit in set(guard.CRITICAL.values()):text=text.replace('/sketch/src/RtcTls/'+unit+'.o','/sketch/src/RtcTls/objs.a('+unit+'.o)')
   path.write_text(text);self.assertEqual(guard.verify_tls_link(build,source)['tlsUnitsCompiled'],20)
   path.write_text(text.replace('/sketch/src/RtcTls/objs.a','/sketch/src/Other/objs.a'))
   with self.assertRaisesRegex(RuntimeError,'live symbol'):guard.verify_tls_link(build,source)
 def test_precompiled_tls_member_fails_even_if_all_project_objects_exist(self):
  with tempfile.TemporaryDirectory() as tmp:
   build,source,path=self.fixture(Path(tmp));path.write_text(path.read_text()+'\n/sdk/libmbedtls_2.a(ssl_msg.c.obj)\n')
   with self.assertRaisesRegex(RuntimeError,'Precompiled SDK TLS'):guard.verify_tls_link(build,source)
 def test_discarded_only_symbol_cannot_masquerade_as_live_ownership(self):
  with tempfile.TemporaryDirectory() as tmp:
   build,source,path=self.fixture(Path(tmp));path.write_text(path.read_text().replace('0x42001234','0x00000000',1))
   with self.assertRaisesRegex(RuntimeError,'live symbol'):guard.verify_tls_link(build,source)
 def test_missing_unit_wrong_profile_or_nonuniform_include_fails(self):
  with tempfile.TemporaryDirectory() as tmp:
   build,source,path=self.fixture(Path(tmp));(build/'sketch/src/RtcTls/ssl_tls.c.o').unlink()
   with self.assertRaisesRegex(RuntimeError,'Missing project TLS'):guard.verify_tls_link(build,source)
  with tempfile.TemporaryDirectory() as tmp:
   build,source,path=self.fixture(Path(tmp));(source/'RtcTlsConfig.h').write_text('#define MBEDTLS_SSL_IN_CONTENT_LEN 16384\n#define MBEDTLS_SSL_OUT_CONTENT_LEN 2048\n')
   with self.assertRaisesRegex(RuntimeError,'uniformly'):guard.verify_tls_link(build,source)
  with tempfile.TemporaryDirectory() as tmp:
   build,source,path=self.fixture(Path(tmp));(source/'ssl_msg.c').write_text('// missing size configuration')
   with self.assertRaisesRegex(RuntimeError,'profile first'):guard.verify_tls_link(build,source)
if __name__=='__main__':unittest.main()
