import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const anchors=['accessibility','flash','wifi','bluetooth','open-harness','models','bridge','clipboard','install-skills','authoring','publish'];
const guides=['docs/guide/README.md',...['zh-Hans','zh-Hant','ja','ru','de','fr','es'].map(locale=>'docs/guide/'+locale+'.md')];
const readmes=['README.md',...['zh-Hans','zh-Hant','ja','ru','de','fr','es'].map(locale=>'docs/readme/'+locale+'.md')];
test('all eight full guides expose all eleven stable sections in setup order',async()=>{
 for(const path of guides){const text=await readFile(resolve(root,path),'utf8');let previous=-1;
  for(const anchor of anchors){const marker='<a id="'+anchor+'"></a>';assert.equal(text.split(marker).length,2,path+': '+anchor+' must be unique');const at=text.indexOf(marker);assert.ok(at>previous,path+': '+anchor+' is out of sequence');previous=at;}
  assert.equal((text.match(/^## \d+\./gm)||[]).length,11,path+' must retain eleven procedural sections');assert.match(text,/https:\/\/igent\.cc\/flash/);assert.match(text,/https:\/\/igent\.cc\/shortcuts\/clipboard\.html/);
 }
});
test('all eight README entry points retain setup links, an editable architecture and playable demonstration',async()=>{
 for(const path of readmes){const text=await readFile(resolve(root,path),'utf8'),links=[...text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map(match=>match[1]);
  for(const anchor of anchors){const target=links.find(href=>href.endsWith('#'+anchor));assert.ok(target,path+': missing '+anchor+' entry');const guide=await readFile(resolve(root,dirname(path),target.split('#')[0]),'utf8');assert.ok(guide.includes('<a id="'+anchor+'"></a>'),path+': broken '+anchor+' target');}
  const diagram=text.match(/```mermaid\n([\s\S]*?)\n```/);assert.ok(diagram,path+': Mermaid architecture is missing');
  for(const component of ['Harness','Apps','Storage','AI','Bridge'])assert.ok(diagram[1].includes(component),path+': architecture missing '+component);
  assert.match(text,/^https:\/\/github\.com\/user-attachments\/assets\/[a-f0-9-]+$/m,path+': native video attachment is missing');
  const images=[...text.matchAll(/<img src="([^"]+-example\.jpg)"/g)].map(match=>match[1]);assert.equal(images.length,3,path+': screenshot gallery is incomplete');
  for(const image of images){const bytes=await readFile(resolve(root,dirname(path),image));assert.equal(bytes.readUInt16BE(0),0xffd8,path+': screenshot is not JPEG');}

 }
});
