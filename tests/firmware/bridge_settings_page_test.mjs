import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const html=fs.readFileSync(process.argv[2],'utf8');
const script=html.match(/<script>([\s\S]*)<\/script>/)[1];
new vm.Script(script);
async function scenario(locale,storedToken='',rejectSave=false){
 const fields=new Map(),calls=[];let saved;
 const element=id=>{if(!fields.has(id))fields.set(id,{value:'',textContent:'',hidden:true,disabled:false,checked:false});return fields.get(id);};
 const session=new Map([['iah-manager-token',storedToken]]),local=new Map();
 const storage=map=>({getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)});
 const context={navigator:{languages:[locale]},document:{documentElement:{},title:'',getElementById:element},crypto:webcrypto,sessionStorage:storage(session),localStorage:storage(local),AbortController,setTimeout,clearTimeout,Uint8Array,fetch:async(path,options)=>{
 calls.push({path,options});assert.equal(options.headers['X-Harness-Window'],'1');
 if(path==='/v1/pair'){const body=JSON.parse(options.body);assert.match(body.clientId,/^manager-[0-9a-f]{32}$/);assert.deepEqual(Object.keys(body),['clientId']);return Response.json({token:'a'.repeat(64)});}
 assert.equal(path,'/v1/settings');
 if(options.headers.Authorization==='Bearer stale')return Response.json({error:'invalid_client_credential'},{status:401});
 assert.equal(options.headers.Authorization,'Bearer '+'a'.repeat(64));
 if(options.method==='POST'){saved=JSON.parse(options.body);if(rejectSave)return Response.json({error:'board_busy'},{status:409});return Response.json({...saved,newURL:'http://'+saved.hostname+'.local',restartRequired:saved.hostname!=='igent'});}
 return Response.json({hostname:'igent'});
 }};
 vm.createContext(context);vm.runInContext(script,context);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(context.document.documentElement.lang,locale);
 assert.equal(vm.runInContext('Object.keys(messages).length',context),8);
 assert.equal(element('settings').hidden,false);assert.equal(element('hostname').value,'igent');
 element('hostname').value='MY-BRIDGE';await element('settings').onsubmit({preventDefault(){}});
 assert.deepEqual(saved,{hostname:'my-bridge'});
 if(rejectSave){assert.equal(element('settings').hidden,false);assert.equal(element('status').textContent,vm.runInContext('m[6]',context));}
 else {assert.equal(element('settings').hidden,false);assert.equal(element('save').hidden,true);assert.equal(element('next').href,'http://my-bridge.local/settings');}
}
for(const locale of ['en','zh-Hans','zh-Hant','ja','ru','de','fr','es'])await scenario(locale);
await scenario('en','stale');await scenario('en','a'.repeat(64),true);
assert.doesNotMatch(html,/connectionCode|pairingCodeRequired|setupPassword|type="password"|type="checkbox"/);
console.log('Bridge settings: eight locales, code-free enrollment, stale credential, hostname restart and busy refusal pass');
