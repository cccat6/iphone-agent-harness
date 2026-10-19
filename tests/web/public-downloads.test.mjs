import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('the clipboard tutorial download points to a present nonempty installation file',async()=>{
 const page=new URL('../../apps/web/shortcuts/clipboard.html',import.meta.url),html=await readFile(page,'utf8');
 const href=html.match(/id="download" href="([^"]+)"/)?.[1];assert.ok(href);
 const target=new URL(href,page);assert.ok(target.pathname.endsWith('.shortcut'));
 const data=await readFile(target);assert.ok(data.length>256,'The tutorial must include its actual installable download, not an empty placeholder');
});
