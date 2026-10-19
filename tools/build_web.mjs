import {cp,mkdir,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {syncAssets} from './sync_assets.mjs';
import {isPublicWebAsset} from './web-assets.mjs';
const root=path.resolve(import.meta.dirname,'..'),destination=path.join(root,'build/site');
// This signed installation download is a product asset, not a debug artifact.
const shortcut=await readFile(path.join(root,'apps/web/shortcuts/iPhone Agent Clipboard.shortcut'));
if(shortcut.length<256)throw new Error('The signed clipboard Shortcut download is missing or empty');
await syncAssets(root);
await rm(destination,{recursive:true,force:true});
await mkdir(destination,{recursive:true});
await cp(path.join(root,'LICENSE'),path.join(destination,'LICENSE.txt'));
await cp(path.join(root,'THIRD_PARTY_NOTICES.md'),path.join(destination,'THIRD_PARTY_NOTICES.md'));
await cp(path.join(root,'apps/web'),destination,{recursive:true,filter:source=>isPublicWebAsset(source,path.join(root,'apps/web'))});
await mkdir(path.join(destination,'media'),{recursive:true});
for(const name of await readdir(path.join(root,'docs/media')))if(/^architecture(?:\.[-A-Za-z]+)?\.svg$/.test(name))await cp(path.join(root,'docs/media',name),path.join(destination,'media',name));
await cp(path.join(root,'specs'),path.join(destination,'specs'),{recursive:true});
await cp(path.join(root,'prompts'),path.join(destination,'prompts'),{recursive:true});
const catalog={version:1,skills:[]};
for(const dir of await readdir(path.join(root,'apps/web/skills'),{withFileTypes:true}))if(dir.isDirectory()){
  try{const manifest=JSON.parse(await readFile(path.join(root,'apps/web/skills',dir.name,'manifest.json'),'utf8'));catalog.skills.push({id:manifest.id,name:manifest.id,description:manifest.description,version:manifest.version,url:`./${dir.name}/SKILL.md`,manifestUrl:`./${dir.name}/manifest.json`});}catch{}
}
await writeFile(path.join(destination,'skills/catalog.json'),JSON.stringify(catalog,null,2)+'\n');
console.log('Static Web output: build/site (no credentials, private sessions, or reference repositories)');
