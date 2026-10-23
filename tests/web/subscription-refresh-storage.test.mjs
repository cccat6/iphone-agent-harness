import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import * as auth from '../../apps/web/core/codex.js';
const tokens=(extra={})=>({access_token:'fixture-access',refresh_token:'fixture-refresh',expiresAt:0,clientId:'oaiapp_fixture',accountId:'',flow:'chatgpt-plan',identityVerified:true,scopes:['chatgpt.tokens.use.direct'],...extra});
const register=(module=auth,extra={})=>module.registerCodexAccount('profile',tokens(extra));
const tick=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
afterEach(()=>{auth.clearCodexAccounts();auth.setCodexRefreshStorage(null);});
test('rotated credentials are persisted before any concurrent caller receives access',async()=>{
 let release,entered;const waiting=new Promise(r=>release=r),ready=new Promise(r=>entered=r);let requests=0,saved,finished=false;
 auth.setCodexRefreshStorage({load:async()=>null,save:async(id,value)=>{saved=value;entered();await waiting;}});
 const a=register(),fetchImpl=async()=>{requests++;return Response.json({access_token:'new-access',refresh_token:'rotated-refresh',expires_in:3600});};
 const first=a.accessToken({fetchImpl}).then(v=>{finished=true;return v;}),second=a.accessToken({fetchImpl});await ready;await tick();assert.equal(finished,false);assert.equal(requests,1);assert.equal(saved.refresh_token,'rotated-refresh');release();assert.deepEqual(await Promise.all([first,second]),['new-access','new-access']);
});
test('failed local save retries persistence without reusing the consumed refresh token',async()=>{
 let saves=0,requests=0,stored;
 auth.setCodexRefreshStorage({load:async()=>null,save:async(id,value)=>{if(++saves===1)throw Error('storage unavailable');stored=value;}});
 const a=register(),fetchImpl=async()=>{requests++;return Response.json({access_token:'new-access',refresh_token:'rotated-refresh',expires_in:3600});};
 await assert.rejects(a.accessToken({fetchImpl}),{code:'SUBSCRIPTION_SAVE_FAILED'});assert.equal(await a.accessToken({fetchImpl}),'new-access');assert.equal(requests,1);assert.equal(saves,2);assert.equal(stored.refresh_token,'rotated-refresh');
});
test('two page runtimes serialize refresh and the second loads the replacement from local storage',async()=>{
 const other=await import('../../apps/web/core/codex.js?refresh-storage-two-tabs');let chain=Promise.resolve(),saved=tokens(),requests=0;
 const locks={request(name,options,work){assert.equal(name,'iah-subscription-refresh:profile');assert.equal(options.mode,'exclusive');const result=chain.then(work);chain=result.catch(()=>{});return result;}};
 const storage={locks,load:async()=>saved,save:async(id,value)=>{saved=structuredClone(value);}};auth.setCodexRefreshStorage(storage);other.setCodexRefreshStorage(storage);
 try{const a=register(),b=register(other),fetchImpl=async()=>{requests++;return Response.json({access_token:'new-access',refresh_token:'rotated-refresh',expires_in:3600});};assert.deepEqual(await Promise.all([a.accessToken({fetchImpl}),b.accessToken({fetchImpl})]),['new-access','new-access']);assert.equal(requests,1);assert.equal(b.exportTokens().refresh_token,'rotated-refresh');}finally{other.clearCodexAccounts();other.setCodexRefreshStorage(null);}
});
test('invalid grant requests sign-in once and never logs or exposes raw provider content',async()=>{
 const a=register();let requests=0;const fetchImpl=async()=>{requests++;return Response.json({error:'invalid_grant',error_description:'private-token-detail'},{status:400});};
 for(let i=0;i<2;i++)await assert.rejects(a.accessToken({fetchImpl}),e=>e.code==='SUBSCRIPTION_RELOGIN_REQUIRED'&&e.status===400&&!e.message.includes('private-token-detail'));
 assert.equal(requests,1);const fresh=register(auth,{expiresAt:Date.now()+3600000,access_token:'signed-in-again'});assert.equal(await fresh.accessToken({fetchImpl}),'signed-in-again');
});
test('saved credentials for a different issued client never replace this registration',async()=>{
 auth.setCodexRefreshStorage({load:async()=>tokens({clientId:'different-client',expiresAt:Date.now()+3600000,access_token:'other-account'}),save:async()=>{}});
 let requests=0;const a=register();assert.equal(await a.accessToken({fetchImpl:async(url,init)=>{requests++;assert.equal(new URLSearchParams(init.body).get('refresh_token'),'fixture-refresh');return Response.json({access_token:'correct-new-access',expires_in:3600});}}),'correct-new-access');assert.equal(requests,1);
});
