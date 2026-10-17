import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openStore} from '../../apps/web/core/store.js';
import {readImportFile,sessionBackupBlob,SESSION_BACKUP_BYTES,DOCUMENT_IMPORT_BYTES,BACKUP_ERRORS} from '../../apps/web/core/backup-files.js';
import {SUPPORTED_LOCALES,registerErrorCatalog,localizeError,setLocale} from '../../apps/web/i18n.js';

const app=readFileSync(new URL('../../apps/web/app.js',import.meta.url),'utf8');
const definition=name=>app.split('\n').find(line=>line.startsWith(`function ${name}(`));

test('R13 native Blob uses full UTF-8 pretty JSON and accepted small backup restores independently',async()=>{
  const store=await openStore({memory:true});
  try {
    const original=await store.createSession({title:'汉😀',mode:'task',modelId:'review-model'});
    await store.addMessage(original.id,{role:'assistant',text:'汉😀',toolCalls:[{id:'call-r13',name:'phone_observe',arguments:{}}]});
    await store.addMessage(original.id,{role:'tool',text:'frame',toolCallId:'call-r13',images:['data:image/png;base64,AAAA']});
    const value=await store.exportSession(original.id),blob=sessionBackupBlob(value),serialized=JSON.stringify(value,null,2);
    assert.equal(blob.size,new TextEncoder().encode(serialized).length);
    assert.ok(blob.size>serialized.length);
    assert.equal(blob.type,'application/json');
    assert.equal(await blob.text(),serialized);
    const restored=await store.importSession(JSON.parse(await readImportFile(blob,{maxBytes:SESSION_BACKUP_BYTES})));
    assert.notEqual(restored.id,original.id);
    assert.equal(restored.mode,'task');assert.equal(restored.modelId,'review-model');
    const messages=await store.getMessages(restored.id);
    assert.equal(messages[0].text,'汉😀');assert.equal(messages[0].toolCalls[0].id,'call-r13');
    assert.equal(messages[1].toolCallId,'call-r13');assert.deepEqual(messages[1].images,['data:image/png;base64,AAAA']);
    await store.deleteSession(restored.id);
    assert.deepEqual(await store.exportSession(original.id),value);
  } finally {store.close();}
});

test('R13 exact export bound fits import and +1 export stops before download without changing stored session',async()=>{
  const NativeBlob=globalThis.Blob,store=await openStore({memory:true});
  try {
    const session=await store.createSession({title:'Preserve'});
    await store.addMessage(session.id,{role:'user',text:'retained'});
    const before=await store.exportSession(session.id);
    let claimedSize=SESSION_BACKUP_BYTES,downloads=0;
    globalThis.Blob=class extends NativeBlob {get size(){return claimedSize;}};
    const exact=sessionBackupBlob(before);
    assert.equal(exact.size,SESSION_BACKUP_BYTES);
    assert.equal(await readImportFile(exact,{maxBytes:SESSION_BACKUP_BYTES}),JSON.stringify(before,null,2));
    claimedSize++;
    assert.throws(()=>{const blob=sessionBackupBlob(before);downloads++;return blob;},{code:'BACKUP_TOO_LARGE'});
    assert.equal(downloads,0);
    assert.deepEqual(await store.exportSession(session.id),before);
  } finally {globalThis.Blob=NativeBlob;store.close();}
});

test('R13 actual chooseFile rejects early at distinct bounds and actual download preserves Blob',async()=>{
  const input={value:'old',files:[],clicks:0,click(){this.clicks++;}},errors=[];
  const chooseFile=Function('$','guard','readImportFile',`${definition('chooseFile')};return chooseFile;`)(
    selector=>{assert.equal(selector,'#file-input');return input;},
    fn=>async()=>{try {await fn();}catch(error){errors.push(error);}},readImportFile);
  let reads=0,callbacks=0;
  for(const [limit,override,code] of [[DOCUMENT_IMPORT_BYTES,undefined,'IMPORT_TOO_LARGE'],[SESSION_BACKUP_BYTES,SESSION_BACKUP_BYTES,'BACKUP_TOO_LARGE']]){
    input.files=[{size:limit+1,text(){reads++;return 'invalid';}}];
    chooseFile('.json',()=>{callbacks++;},override);await input.onchange();
    assert.equal(errors.at(-1).code,code);
    input.files=[{size:limit,text(){reads++;return 'accepted';}}];
    chooseFile('.json',text=>{assert.equal(text,'accepted');callbacks++;},override);await input.onchange();
  }
  assert.equal(reads,2);assert.equal(callbacks,2);assert.equal(input.value,'');
  assert.equal(input.clicks,4);
  const handed=[],anchors=[],timers=[],revoked=[];
  const download=Function('Blob','URL','document','setTimeout',`${definition('download')};return download;`)(
    Blob,{createObjectURL(blob){handed.push(blob);return 'blob:review';},revokeObjectURL(url){revoked.push(url);}},
    {createElement(tag){assert.equal(tag,'a');const a={clicks:0,click(){this.clicks++;}};anchors.push(a);return a;}},
    (fn,ms)=>{timers.push({fn,ms});});
  const blob=sessionBackupBlob({text:'汉😀'});download(blob,'session.json');
  assert.equal(handed[0],blob);assert.equal(anchors[0].download,'session.json');
  assert.equal(anchors[0].href,'blob:review');assert.equal(anchors[0].clicks,1);
  assert.equal(timers[0].ms,1000);timers[0].fn();assert.deepEqual(revoked,['blob:review']);
  download({still:'JSON'},'object.json');assert.deepEqual(JSON.parse(await handed[1].text()),{still:'JSON'});
});

test('R13 real application wiring, corrected locale messages and bilingual S07 remain aligned',()=>{
  assert.match(app,/registerErrorCatalog\(BACKUP_ERRORS\)/);
  assert.match(app,/if\(action==='export'\)\{download\(sessionBackupBlob\(await state\.store\.exportSession\(session\.id\)\)/);
  const sessionImport=app.split('\n').find(line=>line.includes("$('#import-session').onclick="));
  assert.match(sessionImport,/,SESSION_BACKUP_BYTES\);$/);
  for(const id of ['import-skill','import-identity']){
    const line=app.split('\n').find(line=>line.includes(`$('#${id}').onclick=`));
    assert.ok(line.includes('chooseFile('));assert.ok(!line.includes('SESSION_BACKUP_BYTES'));
  }
  registerErrorCatalog(BACKUP_ERRORS);
  try {
    assert.deepEqual(Object.keys(BACKUP_ERRORS.BACKUP_TOO_LARGE).sort(),SUPPORTED_LOCALES.map(x=>x.code).sort());
    for(const {code:locale} of SUPPORTED_LOCALES){
      setLocale(locale);
      for(const code of Object.keys(BACKUP_ERRORS))assert.equal(localizeError({code,message:code}),BACKUP_ERRORS[code][locale]);
    }
    assert.match(BACKUP_ERRORS.BACKUP_TOO_LARGE.en,/Existing data in this browser is unchanged\./);
    assert.doesNotMatch(BACKUP_ERRORS.BACKUP_TOO_LARGE.en,/This session remains saved/);
    for(const path of ['README.md','zh-Hans.md']){
      const row=readFileSync(new URL(`../../docs/acceptance/${path}`,import.meta.url),'utf8').split('\n').find(line=>line.startsWith('| S07 |'));
      assert.ok(row.includes('64 MiB'));assert.ok(row.includes('10 MiB'));assert.ok(row.includes('UTF-8 JSON'));
      assert.ok(row.includes('backup-files.test.mjs'));
    }
  } finally {setLocale('auto');}
});
