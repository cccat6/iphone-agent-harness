import {cp,mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),destination=path.join(root,'build/site');
await mkdir(destination,{recursive:true});
await cp(path.join(root,'apps/web'),destination,{recursive:true,filter:source=>!/(^|\/)\.env($|\.)|\.local\.|\.DS_Store$/.test(source)});
await cp(path.join(root,'specs'),path.join(destination,'specs'),{recursive:true});
await cp(path.join(root,'prompts'),path.join(destination,'prompts'),{recursive:true});
const catalog={version:1,skills:[]};
for(const dir of await readdir(path.join(root,'apps/web/skills'),{withFileTypes:true}))if(dir.isDirectory()){
  try{const manifest=JSON.parse(await readFile(path.join(root,'apps/web/skills',dir.name,'manifest.json'),'utf8'));catalog.skills.push({id:manifest.id,name:manifest.id,description:manifest.description,version:manifest.version,url:`./${dir.name}/SKILL.md`,manifestUrl:`./${dir.name}/manifest.json`});}catch{}
}
await writeFile(path.join(destination,'skills/catalog.json'),JSON.stringify(catalog,null,2)+'\n');
console.log('Static Web output: build/site (no credentials, private sessions, or reference repositories)');
