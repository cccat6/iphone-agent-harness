import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../../apps/web/core/store.js';
import {readImportFile,sessionBackupBlob,SESSION_BACKUP_BYTES,DOCUMENT_IMPORT_BYTES,BACKUP_ERRORS} from '../../apps/web/core/backup-files.js';
import {SUPPORTED_LOCALES,registerErrorCatalog,localizeError,setLocale} from '../../apps/web/i18n.js';
test('session images beyond the former 10 MiB gate export and restore with tools intact',async()=>{
 const store=await openStore({memory:true}),session=await store.createSession({title:'Image backup'});
 const image='data:image/jpeg;base64,'+'A'.repeat(4*1024*1024);
 await store.addMessage(session.id,{role:'assistant',text:'',toolCalls:[{id:'observe',name:'phone_observe',arguments:{}}]});
 await store.addMessage(session.id,{role:'tool',toolCallId:'observe',text:'three frames',images:[image,image,image]});
 const blob=sessionBackupBlob(await store.exportSession(session.id));assert.ok(blob.size>DOCUMENT_IMPORT_BYTES);assert.ok(blob.size<SESSION_BACKUP_BYTES);
 const restored=await store.importSession(JSON.parse(await readImportFile(blob,{maxBytes:SESSION_BACKUP_BYTES}))),messages=await store.getMessages(restored.id);
 assert.equal(messages[0].toolCalls[0].id,'observe');assert.equal(messages[1].toolCallId,'observe');assert.deepEqual(messages[1].images,[image,image,image]);await store.deleteSession(restored.id);assert.equal((await store.listSessions()).length,1);store.close();
});
test('both file bounds reject before allocating file text; exact session boundary is accepted',async()=>{
 for(const [maxBytes,code] of [[DOCUMENT_IMPORT_BYTES,'IMPORT_TOO_LARGE'],[SESSION_BACKUP_BYTES,'BACKUP_TOO_LARGE']]){
  let read=false;await assert.rejects(readImportFile({size:maxBytes+1,text(){read=true;throw Error('must not read');}},{maxBytes}),{code});assert.equal(read,false);
 }
 assert.equal(await readImportFile({size:SESSION_BACKUP_BYTES,text:async()=> 'boundary'},{maxBytes:SESSION_BACKUP_BYTES}),'boundary');
});
test('backup limit errors localize in every supported language',()=>{
 registerErrorCatalog(BACKUP_ERRORS);for(const locale of SUPPORTED_LOCALES){setLocale(locale.code);for(const code of Object.keys(BACKUP_ERRORS))assert.equal(localizeError({code,message:code}),BACKUP_ERRORS[code][locale.code]);}setLocale('auto');
});
