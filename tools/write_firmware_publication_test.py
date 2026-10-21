import hashlib,json,unittest
from write_firmware_publication import publication
class PublicationTest(unittest.TestCase):
 def setUp(self):
  self.manifest={'firmwareVersion':'0.5.5','buildId':'test-build'};self.raw=json.dumps(self.manifest).encode();self.meta={'draft':False,'published_at':'2026-10-21T10:38:33Z','assets':[{'name':'manifest.json','digest':'sha256:'+hashlib.sha256(self.raw).hexdigest()}]}
 def test_uses_actual_release_date_and_matching_build(self):
  value=publication(self.manifest,self.meta,self.raw);self.assertEqual(value['publishedAt'],'2026-10-21T10:38:33Z');self.assertEqual(value['buildId'],'test-build')
 def test_refuses_unpublished_and_different_artifact(self):
  for patch in [{'draft':True},{'published_at':None},{'published_at':'2026-10-21T10:38:33'},{'assets':[]}]:
   with self.assertRaises(ValueError):publication(self.manifest,{**self.meta,**patch},self.raw)
 def test_reuse_preserves_publication_date(self):
  self.assertEqual(publication(self.manifest,self.meta,self.raw),publication(self.manifest,self.meta,self.raw))
if __name__=='__main__':unittest.main()
