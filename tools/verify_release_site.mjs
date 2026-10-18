// Verify the deployed bytes against the exact clean build, including firmware.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {parseArgs} from 'node:util';
const {values}=parseArgs({options:{output:{type:'string'}}});
const require=createRequire(import.meta.url),{fetch,EnvHttpProxyAgent}=require('undici');
const dispatcher=new EnvHttpProxyAgent(),origin='https://igent.cc',root=new URL('../build/site/',import.meta.url);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function filesAt(directory,prefix=''){
 const items=await readdir(directory,{withFileTypes:true}),paths=[];
 for(const item of items){const relative=prefix+item.name;if(item.isDirectory())paths.push(...await filesAt(new URL(item.name+'/',directory),relative+'/'));else if(item.isFile())paths.push(relative);}
 return paths.sort();
}
const paths=await filesAt(root);
const checks=[];
try{
 for(let at=0;at<paths.length;at+=4)await Promise.all(paths.slice(at,at+4).map(async path=>{
  const expected=await readFile(new URL(path,root)),sha256=digest(expected),url=path==='index.html'?origin+'/':origin+'/'+path;
  const response=await fetch(url,{dispatcher,headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)}),actual=Buffer.from(await response.arrayBuffer());
  checks.push({path,status:response.status,bytes:actual.length,sha256,passed:response.status===200&&digest(actual)===sha256});
 }));
}catch{checks.push({path:'network',passed:false});}
finally{await dispatcher.close();}
const report={checkedAt:new Date().toISOString(),origin,passed:checks.length===paths.length&&checks.every(x=>x.passed),checks};
await writeFile(values.output||new URL('../docs/research/release-site-verification.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,verifiedFiles:checks.filter(x=>x.passed).length,expectedFiles:paths.length,failed:checks.filter(x=>!x.passed).map(x=>x.path)}));
if(!report.passed)process.exitCode=1;
