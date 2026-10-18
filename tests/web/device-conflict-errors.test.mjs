import test from 'node:test';
import assert from 'node:assert/strict';
import {DeviceClient,DeviceError} from '../../apps/web/core/device.js';
import {deviceErrorDetails} from '../../apps/web/ui/device-panel.js';
import {DEVICE_MESSAGES} from '../../apps/web/locales/device.js';
import {ERROR_CATALOG} from '../../apps/web/core/error-catalog.js';
import {localizeError,setLocale} from '../../apps/web/i18n.js';

const fingerprint='a'.repeat(64),identity={boardId:'board-a',bootId:'boot-a',hostname:'igent.local',publicKeyFingerprint:fingerprint};

test('HTTP 409 distinguishes bridge enrollment, availability, target and lease failures',async()=>{
 const cases=[
  ['client_capacity','DEVICE_CLIENT_CAPACITY'],['board_busy','DEVICE_BOARD_BUSY'],
  ['target_busy','DEVICE_TARGET_BUSY'],['target_not_ready','DEVICE_TARGET_NOT_READY'],
  ['lease_conflict','DEVICE_WRITER_BUSY'],['lease_expired','DEVICE_LEASE_EXPIRED'],
  ['binding_in_progress','DEVICE_BOARD_BUSY'],['binding_conflict','DEVICE_BINDING_UNVERIFIED'],
  ['stale_boot','DEVICE_REBOOTED'],['result_unknown','DEVICE_RESULT_UNKNOWN'],
  ['segment_rejected','DEVICE_CONFLICT'],['clipboard_chunk_conflict','DEVICE_CONFLICT'],
  ['future_firmware_reason','DEVICE_CONFLICT'],[null,'DEVICE_CONFLICT'],['__proto__','DEVICE_CONFLICT']
 ];
 for(const[reason,code]of cases){
  const client=new DeviceClient({baseUrl:'http://igent.local',fetchImpl:async()=>Response.json({error:reason},{status:409})});
  await assert.rejects(client.get('/v1/binding'),error=>error.code===code&&error.status===409&&error.unknown===(code==='DEVICE_RESULT_UNKNOWN'),reason||'missing reason');
 }
});

test('full enrollment response reports capacity without creating credentials or retrying',async()=>{
 const calls=[],client=new DeviceClient({baseUrl:'http://igent.local',fetchImpl:async(url,options)=>{calls.push({path:url.pathname,method:options.method});return url.pathname==='/v1/identity'?Response.json(identity):Response.json({error:'client_capacity'},{status:409});}});
 await assert.rejects(client.pair({clientId:'new-browser',expectedFingerprint:fingerprint}),error=>error.code==='DEVICE_CLIENT_CAPACITY'&&error.status===409&&!error.unknown);
 assert.deepEqual(calls.map(value=>value.path),['/v1/identity','/v1/pair']);assert.equal(client.paired,false);assert.equal(client.identityVerified,false);assert.equal(client.bindingVerified,false);
});

test('HTTP status still takes precedence over a reason from a different status class',async()=>{
 const client=new DeviceClient({baseUrl:'http://igent.local',fetchImpl:async()=>Response.json({error:'client_capacity'},{status:401})});
 await assert.rejects(client.get('/v1/binding'),error=>error.code==='DEVICE_AUTH_EXPIRED'&&error.status===401);
});

test('bridge conflicts keep distinct messages in all eight languages',()=>{
 try{for(const locale of ['en','zh-Hans','zh-Hant','ja','ru','de','fr','es']){
  setLocale(locale);const messages=['DEVICE_CLIENT_CAPACITY','DEVICE_BOARD_BUSY','DEVICE_TARGET_BUSY','DEVICE_CONFLICT','DEVICE_WRITER_BUSY'].map(code=>{
   const expected=ERROR_CATALOG[code][locale];assert.ok(typeof expected==='string'&&expected.length>8);assert.equal(localizeError(Object.assign(new Error('raw firmware response'),{code,status:409})),expected);return expected;
  });assert.equal(new Set(messages).size,messages.length,locale);
 }}finally{setLocale('auto');}
 assert.match(ERROR_CATALOG.DEVICE_CLIENT_CAPACITY['zh-Hans'],/浏览器.*上限/);assert.match(ERROR_CATALOG.DEVICE_BOARD_BUSY['zh-Hans'],/桥正忙/);assert.doesNotMatch(ERROR_CATALOG.DEVICE_CONFLICT['zh-Hans'],/另一项任务/);
});

test('identity and browser authorization recovery use the current information-first connection flow',()=>{
 const identityCodes=['DEVICE_IDENTITY_UNVERIFIED','DEVICE_IDENTITY_MISMATCH','DEVICE_CREDENTIAL_MISMATCH'],authCodes=['DEVICE_PAIRING_REQUIRED','DEVICE_AUTH_EXPIRED','DEVICE_ACCESS_DENIED'];
 const obsolete=/USB|certificate|fingerprint|owner|证书|憑證|指纹|指紋|所有者|擁有者|証明書|所有者|сертификат|отпечаток|владельц|Zertifikat|Fingerabdruck|Eigentümer|certificat|empreinte|propriétaire|certificado|huella|propietario/i;
 try{for(const locale of ['en','zh-Hans','zh-Hant','ja','ru','de','fr','es']){
  setLocale(locale);for(const code of [...identityCodes,...authCodes]){const message=localizeError(Object.assign(new Error('legacy raw message'),{code}));assert.equal(message,ERROR_CATALOG[code][locale]);assert.doesNotMatch(message,obsolete,locale+' '+code);}
 }}finally{setLocale('auto');}
 assert.match(ERROR_CATALOG.DEVICE_IDENTITY_MISMATCH['zh-Hans'],/重新获取连接信息/);assert.match(ERROR_CATALOG.DEVICE_AUTH_EXPIRED['zh-Hans'],/重新连接 ESP32 桥/);
});

test('firmware diagnostics preserve only whitelisted identifiers, never raw error content',async()=>{
 const cases=[['client_capacity','client_capacity'],['credential_persistence_failed','credential_persistence_failed'],['future_firmware_reason',undefined],['Bearer secret-token',undefined],['<script>alert(1)</script>',undefined],['invalid_client_credential\nAuthorization: secret',undefined],['a'.repeat(65),undefined],[{token:'secret'},undefined]];
 for(const[reason,expected]of cases){const client=new DeviceClient({baseUrl:'http://igent.local',fetchImpl:async()=>Response.json({error:reason,token:'sensitive-response',body:'sensitive-request'},{status:409})});
  await assert.rejects(client.get('/v1/binding'),error=>{assert.equal(error.serverCode,expected);const details=deviceErrorDetails(error);assert.equal(details,['DEVICE_'+(reason==='client_capacity'?'CLIENT_CAPACITY':'CONFLICT'),'HTTP 409',expected].filter(Boolean).join('\n'));assert.doesNotMatch(details,/secret|sensitive|<script>|Bearer/);return true;});
 }
});

test('connection error details validate every field and remain language-independent protocol diagnostics',()=>{
 const error=new DeviceError('DEVICE_CLIENT_CAPACITY','raw secret message',{status:409,serverCode:'client_capacity'});assert.equal(deviceErrorDetails(error),'DEVICE_CLIENT_CAPACITY\nHTTP 409\nclient_capacity');
 assert.equal(deviceErrorDetails({code:'DEVICE_SECRET\nsecret',status:'409',serverCode:'token_secret',message:'secret'}),'');assert.equal(deviceErrorDetails({code:'DEVICE_'+ 'X'.repeat(65),status:200,serverCode:'Bearer secret'}),'');
 const expectedLabels=['Error details','错误详情','錯誤詳情','エラーの詳細','Подробности ошибки','Fehlerdetails','Détails de l’erreur','Detalles del error'];assert.deepEqual(Object.values(DEVICE_MESSAGES).map(messages=>messages.errorDetails),expectedLabels);
});
