import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=new URL('../../',import.meta.url);
const compact=value=>value.trim().replace(/\s+/g,' ').replace(/>\s+</g,'><');
const canonical=compact(await readFile(new URL('apps/web/icons/logo.svg',root),'utf8'));
for(const name of ['settings','setup']){
 const html=await readFile(path.join(process.argv[2],name+'.html'),'utf8');
 const logos=[...html.matchAll(/<svg\b[\s\S]*?<\/svg>/g)];
 assert.equal(logos.length,1,name+' has one inline brand mark');
 assert.equal(compact(logos[0][0]),canonical,name+' matches the approved SVG geometry and colors');
 assert.match(html,/\.bridge-brand svg\{[^}]*background:#fff[^}]*\}/,name+' keeps a white logo plate in both color schemes');
 assert.match(html,/--bg:#fff7f1;--card:#fffdfb;--text:#332330/);
 assert.match(html,/@media\(prefers-color-scheme:dark\)/);
 assert.ok(!/<(?:img|link)\b[^>]*(?:src|href)=["']https?:/i.test(html),'device branding needs no external asset fetch');
}
console.log('Device branding: approved inline SVG, warm palette, dark-mode contrast plate and offline assets verified');
