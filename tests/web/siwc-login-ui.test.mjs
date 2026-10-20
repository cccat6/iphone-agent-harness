import test from 'node:test';
import assert from 'node:assert/strict';
import {startCodexLogin,validateCodexCallback} from '../../apps/web/core/codex.js';
import {codexHostId,loadPendingCodexLogin,savePendingCodexLogin,clearPendingCodexLogin,prepareCodexSignInProfile,mountCodexLogin} from '../../apps/web/ui/codex-login.js';
import {SIWC_MESSAGES} from '../../apps/web/locales/siwc.js';
import {messages} from '../../apps/web/locales/messages.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function fixture(t,options={}){
 const previous=new Map(['document','localStorage','sessionStorage'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),local=new Map(),session=new Map(),fields=new Map(),calls={start:[],complete:[],success:[],status:[]};let active=true,controller,profile=options.profile||{id:'new-account',name:'Personal',protocol:'codex'};
 const element=()=>({value:'',textContent:'',hidden:false,disabled:false,children:[],append(...children){this.children.push(...children);},replaceChildren(...children){this.children=[...children];}}),field=id=>{if(!fields.has(id))fields.set(id,element());return fields.get(id);};
 for(const[key,value]of Object.entries({document:{createElement:element},localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)},sessionStorage:{getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)}}))Object.defineProperty(globalThis,key,{configurable:true,value});
 const translate=(key,args={})=>Object.entries(args).reduce((value,[name,text])=>value.replaceAll('{'+name+'}',text),SIWC_MESSAGES.en[key]||key);
 const mount=()=>mountCodexLogin({root:{querySelector:selector=>field(selector.slice(1))},getProvider:()=>profile,prepareProvider:async()=>({provider:profile,options:{}}),start:async value=>{calls.start.push(value);return options.start?options.start(value):startCodexLogin(value);},validate:validateCodexCallback,complete:async(login,value)=>{calls.complete.push({login,...value});return options.complete?options.complete(login,value):{id:profile.id,flow:'chatgpt-plan',clientId:'oaiapp-issued'};},onSuccess:async value=>calls.success.push(value),isActive:()=>active,onController:value=>controller=value,status:value=>calls.status.push(value),t:translate});
 const ui=mount();t.after(()=>{ui.dispose();for(const[key,value]of previous)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];});
 return {ui,mount,field,local,session,calls,get controller(){return controller;},setActive:value=>active=value,setProfile:value=>profile=value,callback(){const pending=loadPendingCodexLogin();return 'http://127.0.0.1:1455/auth/callback?code=synthetic-code&state='+pending.login.state+'&client_id=oaiapp-issued&scope=openid';}};
}
test('stable host and white-listed pending attempt survive refresh without storing callbacks, tokens or hints',async t=>{
 const f=fixture(t),host=codexHostId();assert.equal(codexHostId(),host);assert.match(host,/^urn:uuid:/);const login=await startCodexLogin({method:'authorization-code',hostId:host,clientId:'oaiapp-issued',idTokenHint:'synthetic-id-token',loginHint:'person@example.invalid'});
 savePendingCodexLogin({...login,callbackUrl:'http://127.0.0.1/?code=private-code',access_token:'synthetic-secret'}, {id:'new-account',name:'Account',apiKey:'synthetic-key'});const pending=loadPendingCodexLogin(),raw=[...f.session.values()].join('');assert.equal(pending.login.state,login.state);assert.equal(pending.provider.id,'new-account');assert.doesNotMatch(raw,/synthetic-secret|synthetic-key|private-code|synthetic-id-token|id_token_hint|login_hint/);assert.equal(pending.login.authorizationUrl.includes('id_token_hint'),false);
 const restored=f.mount();assert.equal(restored.pending(),true);assert.equal(f.calls.start.length,0);restored.dispose();
});
test('authorization uses an explicit official link after generation and completion consumes pending before await',async t=>{
 const gate=deferred(),f=fixture(t,{complete:()=>gate.promise});await f.field('start-codex-login').onclick();assert.equal(f.calls.start[0].method,'authorization-code');const link=f.field('codex-verification').children[0];assert.equal(new URL(link.href).origin,'https://auth.openai.com');assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');assert.equal(f.field('codex-verification').children[1].children.length,3);
 const callback=f.callback();f.field('codex-callback').value=callback;f.field('codex-callback').oninput();const first=f.field('complete-codex-login').onclick(),second=f.field('complete-codex-login').onclick();assert.equal(loadPendingCodexLogin(),null);assert.equal(f.field('codex-callback').value,'');assert.equal(f.calls.complete.length,1);assert.equal(f.calls.complete[0].callbackUrl,callback);assert.equal(f.calls.complete[0].accountId,'new-account');assert.doesNotMatch([...f.session.values()].join(''),/synthetic-code/);gate.resolve({flow:'chatgpt-plan',clientId:'oaiapp-issued'});await Promise.all([first,second]);assert.equal(f.calls.success.length,1);assert.equal(f.ui.pending(),false);
});
test('a pasted wrong callback remains correctable without exchanging or consuming its pending attempt',async t=>{
 const f=fixture(t);await f.field('start-codex-login').onclick();const original=loadPendingCodexLogin();f.field('codex-callback').value='http://127.0.0.1:1455/auth/callback?code=wrong&state=mismatch&client_id=oaiapp-issued';await f.field('complete-codex-login').onclick();assert.equal(f.calls.complete.length,0);assert.equal(loadPendingCodexLogin().login.state,original.login.state);assert.ok(f.field('codex-callback').value);
 f.field('codex-callback').value=f.callback();await f.field('complete-codex-login').onclick();assert.equal(f.calls.complete.length,1);assert.equal(loadPendingCodexLogin(),null);
});
test('exchange failure cannot restore or repeat an already consumed authorization code',async t=>{
 const f=fixture(t,{complete:async()=>{throw Error('Synthetic token exchange refused');}});await f.field('start-codex-login').onclick();f.field('codex-callback').value=f.callback();await f.field('complete-codex-login').onclick();assert.equal(f.calls.complete.length,1);assert.equal(f.ui.pending(),false);assert.equal(loadPendingCodexLogin(),null);await f.field('complete-codex-login').onclick();assert.equal(f.calls.complete.length,1);assert.equal(f.field('start-codex-login').disabled,false);assert.match(f.calls.status.at(-1),/Start again/);
});
test('cancel drops pending state and late asynchronous completion cannot update a replacement editor',async t=>{
 const gate=deferred(),f=fixture(t,{complete:()=>gate.promise});await f.field('start-codex-login').onclick();f.field('codex-callback').value=f.callback();const completing=f.field('complete-codex-login').onclick();f.ui.cancel();f.setActive(false);const count=f.calls.status.length;gate.reject(new Error('Late aborted exchange'));await completing;assert.equal(f.calls.status.length,count);assert.equal(f.calls.success.length,0);assert.equal(f.controller.signal.aborted,true);assert.equal(loadPendingCodexLogin(),null);
});
test('pending records expire within fifteen minutes and reject a changed authorization host',async t=>{
 const f=fixture(t);await f.field('start-codex-login').onclick();const [key,raw]=[...f.session][0],expired=JSON.parse(raw);expired.createdAt=Date.now()-900001;f.session.set(key,JSON.stringify(expired));assert.equal(loadPendingCodexLogin(),null);assert.equal(f.session.size,0);
 const login=await startCodexLogin({method:'authorization-code',hostId:codexHostId()});savePendingCodexLogin(login,{id:'new-account'});const broken=loadPendingCodexLogin();broken.login.authorizationUrl=broken.login.authorizationUrl.replace('auth.openai.com','evil.invalid');f.session.set(key,JSON.stringify(broken));assert.equal(loadPendingCodexLogin(),null);
});
test('legacy upgrades create an independent profile while verified returning accounts keep their registration and hints',()=>{
 const legacy={id:'legacy',name:'Existing',protocol:'codex',model:'old-model'},snapshot=structuredClone(legacy),next=prepareCodexSignInProfile({provider:legacy,account:{id:'legacy',flow:'codex',clientId:'old-client'},saved:true,newId:()=> 'separate-plan'});assert.equal(next.provider.id,'separate-plan');assert.equal(next.provider.model,'');assert.equal(next.options.clientId,undefined);assert.deepEqual(legacy,snapshot);
 const provider={id:'plan',flow:'chatgpt-plan',clientId:'oaiapp-kept'},account={id:'plan',flow:'chatgpt-plan',clientId:'oaiapp-kept',identityVerified:true,email:'person@example.invalid',exportTokens:()=>({id_token:'synthetic-hint',access_token:'not-forwarded'})},returning=prepareCodexSignInProfile({provider,account,saved:true,newId:()=>assert.fail()});assert.equal(returning.options.clientId,'oaiapp-kept');assert.equal(returning.options.idTokenHint,'synthetic-hint');assert.equal(returning.options.loginHint,account.email);assert.equal(returning.options.access_token,undefined);assert.throws(()=>prepareCodexSignInProfile({provider,account:{...account,id:'another'},saved:true,newId:()=>assert.fail()}),{code:'SIWC_ATTEMPT_INVALID'});
});
test('all eight languages expose matching sign-in steps and callback instructions',()=>{
 assert.deepEqual(Object.keys(SIWC_MESSAGES).sort(),['en','zh-Hans','zh-Hant','ja','ru','de','fr','es'].sort());const keys=Object.keys(SIWC_MESSAGES.en);for(const [locale,table]of Object.entries(SIWC_MESSAGES)){assert.deepEqual(Object.keys(table),keys);for(const key of keys){assert.ok(table[key]);assert.equal(messages[locale][key],table[key]);}assert.match(table['siwc.stepTwo'],/127\.0\.0\.1/);}
});

test('public-key failure offers in-page verification retry without another code exchange or stored tokens',async t=>{
 let retries=0,cancelled=0;const pending={expiresAt:Date.now()+60000,cancel(){cancelled++;},async retry(){retries++;return {flow:'chatgpt-plan',id:'new-account'};}};
 const f=fixture(t,{complete:async(login,options)=>{options.onVerificationPending(pending);throw Object.assign(Error('keys unavailable'),{code:'SIWC_KEYS_FETCH'});}});
 await f.field('start-codex-login').onclick();f.field('codex-callback').value=f.callback();await f.field('complete-codex-login').onclick();assert.equal(f.calls.success.length,0);assert.equal(f.ui.pending(),true);assert.equal(f.field('complete-codex-login').textContent,'Retry verification');assert.equal(f.field('complete-codex-login').disabled,false);assert.equal(f.field('codex-callback-field').hidden,true);assert.equal(f.session.size,0);assert.match(f.calls.status.at(-1),/Retry verification/);
 await f.field('complete-codex-login').onclick();assert.equal(retries,1);assert.equal(f.calls.complete.length,1);assert.equal(f.calls.success.length,1);assert.equal(f.ui.pending(),false);assert.equal(cancelled,1);
});
test('verification may retry another outage, while terminal failure clears the handle',async t=>{
 let retries=0,cancelled=0;const pending={expiresAt:Date.now()+60000,cancel(){cancelled++;},async retry(){throw Object.assign(Error('verification failed'),{code:++retries===1?'SIWC_KEYS_FETCH':'SIWC_ID_NONCE'});}};
 const f=fixture(t,{complete:async(login,options)=>{options.onVerificationPending(pending);throw Object.assign(Error('outage'),{code:'SIWC_KEYS_FETCH'});}});
 await f.field('start-codex-login').onclick();f.field('codex-callback').value=f.callback();await f.field('complete-codex-login').onclick();await f.field('complete-codex-login').onclick();assert.equal(cancelled,0);assert.equal(f.ui.pending(),true);await f.field('complete-codex-login').onclick();assert.equal(cancelled,1);assert.equal(f.ui.pending(),false);assert.equal(f.calls.success.length,0);assert.equal(f.calls.complete.length,1);
});
test('leaving the editor destroys its pending verification handle and late retries cannot save',async t=>{
 const gate=deferred();let cancelled=0;const pending={expiresAt:Date.now()+60000,cancel(){cancelled++;},retry:()=>gate.promise};
 const f=fixture(t,{complete:async(login,options)=>{options.onVerificationPending(pending);throw Object.assign(Error('outage'),{code:'SIWC_KEYS_FETCH'});}});
 await f.field('start-codex-login').onclick();f.field('codex-callback').value=f.callback();await f.field('complete-codex-login').onclick();const retry=f.field('complete-codex-login').onclick();f.ui.dispose();gate.resolve({flow:'chatgpt-plan'});await retry;assert.equal(cancelled,1);assert.equal(f.calls.success.length,0);assert.equal(f.ui.pending(),false);assert.equal(f.session.size,0);
});
test('expired or cancelled verification removes its retry button without persisting pending credentials',async t=>{
 const realSet=setTimeout,timers=[];t.mock.method(globalThis,'setTimeout',(fn,ms,...args)=>{if(ms>0&&ms<=60000){timers.push(fn);return {unref(){}};}return realSet(fn,ms,...args);});let cancelled=0;
 const f=fixture(t,{complete:async(login,options)=>{options.onVerificationPending({expiresAt:Date.now()+60000,cancel(){cancelled++;},retry:()=>assert.fail('expired retry')});throw Object.assign(Error('outage'),{code:'SIWC_KEYS_FETCH'});}});
 await f.field('start-codex-login').onclick();f.field('codex-callback').value=f.callback();await f.field('complete-codex-login').onclick();timers.at(-1)();assert.equal(cancelled,1);assert.equal(f.ui.pending(),false);assert.equal(f.field('complete-codex-login').hidden,true);assert.equal(f.field('cancel-codex-login').hidden,true);assert.equal(f.session.size,0);
});

test('an unsaved provider without an id and without pending login finishes mounting',t=>{
 const f=fixture(t,{profile:{name:'ChatGPT',protocol:'codex'}});assert.equal(loadPendingCodexLogin(),null);assert.equal(f.ui.pending(),false);assert.equal(f.field('complete-codex-login').hidden,true);assert.equal(f.field('cancel-codex-login').hidden,true);assert.equal(f.field('start-codex-login').disabled,false);assert.equal(typeof f.field('start-codex-login').onclick,'function');assert.equal(typeof f.ui.dispose,'function');
});
