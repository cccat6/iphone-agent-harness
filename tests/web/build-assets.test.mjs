import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,cp,readdir,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {isPublicWebAsset} from '../../tools/web-assets.mjs';
test('website packaging excludes interrupted firmware stages and keeps published firmware',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'iah-assets-')),source=path.join(dir,'web'),dest=path.join(dir,'site');
 try{
  for(const name of ['index.html','firmware/manifest.json','firmware/esp32c3/application.bin','.firmware-staging-abcd/unpublished.bin','.firmware-backup-old/manifest.json','api/worker.js','diagnostics/local.html','worker.js','.env','settings.local.json','icons/icon.svg']){const file=path.join(source,name);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,name);}
  await cp(source,dest,{recursive:true,filter:file=>isPublicWebAsset(file,source)});
  assert.deepEqual((await readdir(dest)).sort(),['firmware','icons','index.html']);assert.deepEqual((await readdir(path.join(dest,'firmware'))).sort(),['esp32c3','manifest.json']);
 }finally{await rm(dir,{recursive:true,force:true});}
});
