// Prepare the documented Cloudflare direct-upload manifest; no credentials.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),blake3=require('blake3-wasm');
const root=path.resolve(import.meta.dirname,'../build/site'),manifest={};
async function walk(folder){for(const entry of await readdir(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory())await walk(file);else{const data=await readFile(file),extension=path.extname(file).slice(1),key='/'+path.relative(root,file).split(path.sep).join('/');manifest[key]={hash:blake3.hash(data.toString('base64')+extension).toString('hex').slice(0,32),size:data.length};}}}
await walk(root);await writeFile(path.resolve(root,'../cloudflare-manifest.json'),JSON.stringify(manifest));console.log(JSON.stringify({assets:Object.keys(manifest).length,totalBytes:Object.values(manifest).reduce((n,a)=>n+a.size,0)}));
