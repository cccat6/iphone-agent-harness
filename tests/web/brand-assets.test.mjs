import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
const file=path=>new URL('../../'+path,import.meta.url);
const read=path=>readFile(file(path));
test('approved vector is shared across the website and documentation without raster embedding',async()=>{
 const source=await read('design/logo-a/iphone-agent-harness-a.svg');
 for(const name of ['apps/web/icons/logo.svg','apps/web/icons/icon.svg','docs/media/logo.svg'])assert.deepEqual(await read(name),source);
 assert.doesNotMatch(source.toString(),/<image|<script|data:image|foreignObject/);
});
test('installation icons include opaque PNGs in native sizes and a separate maskable asset',async()=>{
 const manifest=JSON.parse(await read('apps/web/manifest.webmanifest'));
 for(const icon of manifest.icons)await access(file('apps/web/'+icon.src.replace('./','')));
 assert.ok(manifest.icons.some(i=>i.sizes==='192x192'&&i.type==='image/png'&&i.purpose==='any'));
 assert.ok(manifest.icons.some(i=>i.sizes==='512x512'&&i.purpose==='maskable'));
 assert.ok(!manifest.icons.some(i=>i.type==='image/svg+xml'&&i.purpose.includes('maskable')));
 for(const [name,size]of [['apple-touch-icon',180],['icon-192',192],['icon-512',512],['maskable-512',512]]){const png=await read(`apps/web/icons/${name}.png`);assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);}
 const maskable=(await read('apps/web/icons/maskable.svg')).toString();assert.match(maskable,/x="64" y="64" width="384" height="384"/);
});
test('favicon ICO contains four valid PNG frames and pages declare browser and Apple icons',async()=>{
 const ico=await read('apps/web/favicon.ico');assert.equal(ico.readUInt16LE(0),0);assert.equal(ico.readUInt16LE(2),1);assert.equal(ico.readUInt16LE(4),4);
 for(let i=0;i<4;i++){const offset=6+i*16,size=ico[offset],length=ico.readUInt32LE(offset+8),start=ico.readUInt32LE(offset+12);assert.equal(size,[16,32,48,64][i]);assert.ok(start+length<=ico.length);assert.equal(ico.subarray(start,start+8).toString('hex'),'89504e470d0a1a0a');assert.equal(ico.readUInt32BE(start+16),size);}
 const html=(await read('apps/web/index.html')).toString();assert.match(html,/rel="apple-touch-icon"[^>]*sizes="180x180"/);assert.match(html,/href="\.\/favicon.ico"/);assert.match(html,/compatibility-logo[^>]*icons\/logo.svg/);assert.doesNotMatch(html,/m81 95 11 11 22-24/);
});
test('primary orange and neutral text retain readable light-surface contrast',()=>{
 const l=hex=>{const v=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return v[0]*.2126+v[1]*.7152+v[2]*.0722;};
 for(const color of ['#be3e24','#776a70','#332330'])assert.ok((1.05)/(l(color)+.05)>=4.5);
});
