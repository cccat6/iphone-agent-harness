import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const html=fs.readFileSync(process.argv[2],'utf8');
const script=html.match(/<script>([\s\S]*)<\/script>/)[1];
new vm.Script(script);
async function scenario(locale,protectedMode=false,storedToken='',rejectSave=false){
 const fields=new Map(),calls=[];let saved;
 const element=id=>{if(!fields.has(id))fields.set(id,{value:'',textContent:'',hidden:true,disabled:false,checked:false});return fields.get(id);};
 const session=new Map([['iah-manager-token',storedToken]]),local=new Map();
 const storage=map=>({getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)});
 const context={navigator:{languages:[locale]},document:{documentElement:{},title:'',getElementById:element},crypto:webcrypto,sessionStorage:storage(session),localStorage:storage(local),AbortController,setTimeout,clearTimeout,Uint8Array,fetch:async(path,options)=>{
 calls.push({path,options});assert.equal(options.headers['X-Harness-Window'],'1');
 if(path==='/v1/identity')return Response.json({pairingCodeRequired:protectedMode});
 if(path==='/v1/pair'){const body=JSON.parse(options.body);assert.match(body.clientId,/^manager-[0-9a-f]{32}$/);if(protectedMode&&body.setupPassword!=='fixture-code')return Response.json({error:'connection_code_invalid'},{status:403});return Response.json({token:'a'.repeat(64)});}
 assert.equal(path,'/v1/settings');
 if(options.headers.Authorization==='Bearer stale')return Response.json({error:'invalid_client_credential'},{status:401});
 assert.equal(options.headers.Authorization,'Bearer '+'a'.repeat(64));
 if(options.method==='POST'){saved=JSON.parse(options.body);if(rejectSave)return Response.json({error:'board_busy'},{status:409});return Response.json({...saved,connectionCode:'fixture-code',newURL:'http://'+saved.hostname+'.local',restartRequired:saved.hostname!=='igent'});}
 return Response.json({hostname:'igent',pairingCodeRequired:protectedMode,connectionCode:protectedMode?'fixture-code':undefined});
 }};
 vm.createContext(context);vm.runInContext(script,context);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(context.document.documentElement.lang,locale);
 assert.equal(vm.runInContext('Object.keys(messages).length',context),8);
 if(protectedMode&&!storedToken){assert.equal(element('login').hidden,false);assert.equal(calls.filter(c=>c.path==='/v1/pair').length,0);element('code').value='wrong';await element('login').onsubmit({preventDefault(){}});assert.equal(element('status').textContent,vm.runInContext('m[12]',context));element('code').value='fixture-code';await element('login').onsubmit({preventDefault(){}});}
 assert.equal(element('settings').hidden,false);assert.equal(element('hostname').value,'igent');assert.equal(element('codeDisplay').hidden,!protectedMode);
 element('hostname').value='MY-BRIDGE';element('required').checked=true;await element('settings').onsubmit({preventDefault(){}});
 assert.deepEqual(saved,{hostname:'my-bridge',pairingCodeRequired:true});
 if(rejectSave){assert.equal(element('settings').hidden,false);assert.equal(element('status').textContent,vm.runInContext('m[10]',context));}
 else {assert.equal(element('settings').hidden,false);assert.equal(element('save').hidden,true);assert.equal(element('codeDisplay').hidden,false);assert.equal(element('next').href,'http://my-bridge.local/settings');assert.equal(element('savedCode').textContent,'fixture-code');}
}
for(const locale of ['en','zh-Hans','zh-Hant','ja','ru','de','fr','es'])await scenario(locale);
await scenario('en',true);await scenario('en',false,'stale');await scenario('en',false,'a'.repeat(64),true);
console.log('Bridge settings: eight locales, open default, protected login, wrong code, stale credential, hostname restart and busy refusal pass');
