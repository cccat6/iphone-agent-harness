// Explicit live deployment test: only a disposable, non-sensitive public Skill.
import {writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {openStore} from '../apps/web/core/store.js';
import {openCreatorIdentity} from '../apps/web/community/identity.js';
import {createAuthoredSkill,updateAuthoredSkill} from '../apps/web/community/authoring.js';
import {CommunityClient} from '../apps/web/community/client.js';
const require=createRequire(import.meta.url),{fetch,EnvHttpProxyAgent}=require('undici');
const dispatcher=new EnvHttpProxyAgent(),origin='https://igent.cc',checks=[];
const request=(url,options={})=>fetch(url,{...options,dispatcher,signal:AbortSignal.timeout(30000)});
let testCreatorId='',slug='deployment-check-'+Date.now();
function check(name,value){checks.push({name,passed:Boolean(value)});if(!value)throw new Error('Verification failed: '+name);}
try{
 for(const path of ['/','/main','/skills','/flash']){const r=await request(origin+path);check('HTML '+path,r.status===200&&(r.headers.get('content-type')||'').includes('text/html')&&(await r.text()).includes('iPhone Agent Harness'));}
 const missing=await request(origin+'/core/not-a-real-module.js');check('Missing module stays 404',missing.status===404);
 const models=await request(origin+'/firmware/manifest.json'),manifest=await models.json();check('Four firmware profiles',models.status===200&&manifest.profiles?.length===4);
 const options=await request(origin+'/api/skills',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});check('Community OPTIONS',options.status===204&&options.headers.get('access-control-allow-origin')===origin);
 const identity=await openCreatorIdentity({memory:true}),store=await openStore({memory:true});testCreatorId=identity.creatorId;
 const skill=await createAuthoredSkill({store,identity,input:{slug,name:'Temporary deployment verification',description:'Disposable integration test; no user data.',content:'# Deployment verification\nTemporary signed test package. No user data, credentials or screenshots.'}});
 const client=new CommunityClient({baseUrl:origin+'/api',identity,fetchImpl:request});const before=await client.list();check('Community list',Array.isArray(before.items));
 const first=await client.publish(skill,{explicit:true});check('Signed publish',first.revision===1);
 const downloaded=await client.download(identity.creatorId,slug);check('Verified readonly download',downloaded.content===skill.content&&downloaded.readonly===true);
 let rejected=false;try{await client.publish(downloaded,{explicit:true});}catch(e){rejected=e.code==='SKILL_NOT_OWNED';}check('Downloaded package cannot be republished',rejected);
 const updated=await updateAuthoredSkill({store,identity,id:skill.id,patch:{description:'Disposable second revision; no user data.'}});const second=await client.publish(updated,{explicit:true});check('Immutable next revision',second.revision===2);
 const listed=await client.list({limit:50});check('Published item in catalog',listed.items.some(s=>s.creatorId===identity.creatorId&&s.slug===slug));
}catch(error){checks.push({name:'Live run error',passed:false,message:String(error.message)});process.exitCode=1;}
finally{await dispatcher.close();}
const report={checkedAt:new Date().toISOString(),origin,checks,testCreatorId,slug,cleanupPending:Boolean(testCreatorId),containsUserData:false};
await writeFile(new URL('../docs/research/deployment-verification.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
