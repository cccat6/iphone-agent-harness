import {abortable} from '../core/control.js';
import {readText} from '../core/http.js';
import {fail,bytes,LIMITS,verifyEnvelope} from './common.js';
import {toSkillPackage} from './authoring.js';
import {sealInstalledSkill} from './installed.js';
export class CommunityClient{
 constructor({baseUrl,identity,fetchImpl=fetch,timeoutMs=10000}){let u;try{u=new URL(baseUrl);}catch{fail('COMMUNITY_NOT_CONFIGURED');}if(u.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(u.hostname)||u.username||u.password||u.search||u.hash||/[?#]/.test(String(baseUrl)))fail('COMMUNITY_NOT_CONFIGURED');this.baseUrl=u.origin+u.pathname.replace(/\/+/g,'/').replace(/\/$/,'');this.audience=u.origin;this.identity=identity;this.fetchImpl=fetchImpl;this.timeoutMs=Number.isFinite(timeoutMs)&&timeoutMs>0?Math.min(timeoutMs,30000):10000;}
 async request(path,options={}){
  const controller=new AbortController(),signal=options.signal?AbortSignal.any([options.signal,controller.signal]):controller.signal,timer=setTimeout(()=>controller.abort(),this.timeoutMs);
  const networkError=()=>fail(options.signal?.aborted?'REQUEST_CANCELLED':'COMMUNITY_UNREACHABLE');
  try{
   let response;try{response=await abortable(this.fetchImpl.call(globalThis,this.baseUrl+path,{...options,signal,credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store'}),signal);}catch{networkError();}
   let value;try{value=JSON.parse(await abortable(readText(response,{maxBytes:LIMITS.packageBytes+16000,signal}),signal));}catch(error){if(signal.aborted)networkError();if(error.code==='RESPONSE_TOO_LARGE')fail('PACKAGE_TOO_LARGE');fail('COMMUNITY_BAD_RESPONSE');}
   if(!response.ok)fail(value?.error?.code||'COMMUNITY_REQUEST_FAILED');return value;
  }finally{clearTimeout(timer);}
 }

 list({cursor='',limit=30,signal}={}){return this.request('/skills?'+new URLSearchParams({cursor,limit:String(limit)}),{signal});}
 async download(creatorId,slug,{signal}={}){if(!/^[a-f0-9]{64}$/.test(creatorId)||!(/^[a-z0-9][a-z0-9-]{0,63}$/).test(slug))fail('INVALID_SLUG');const record=await this.request(`/skills/${creatorId}/${slug}`,{signal});const proof=await verifyEnvelope(record.envelope);if(proof.creatorId!==creatorId||proof.package.slug!==slug||record.digest!==proof.digest||record.revision!==proof.revision)fail('BAD_SIGNATURE');const pkg=proof.package;return sealInstalledSkill({id:`community:${creatorId}/${slug}`,name:pkg.name,description:pkg.description,version:pkg.version,content:pkg.files['SKILL.md'],resources:pkg.files,source:'community',sourceUrl:this.baseUrl+`/skills/${creatorId}/${slug}`,readonly:true,enabled:true,provenance:{kind:'community',creatorId,slug,revision:record.revision,digest:proof.digest},publication:record});}
 async publish(skill,{explicit=false,signal}={}){if(explicit!==true)fail('PUBLISH_REQUIRES_USER_ACTION');if(!this.identity)fail('IDENTITY_REQUIRED');const pkg=toSkillPackage(skill,this.identity.creatorId);let previous;try{previous=await this.request(`/skills/${pkg.creatorId}/${pkg.slug}`,{signal});}catch(e){if(e.code!=='SKILL_NOT_FOUND')throw e;}const now=Date.now(),payload={format:'iah-publication/1',action:'publish',audience:this.audience,creatorId:pkg.creatorId,nonce:crypto.randomUUID().replaceAll('-',''),issuedAt:now,expiresAt:now+120000,expectedRevision:previous?.revision||0,previousDigest:previous?.digest||'',package:pkg};const envelope={publicKey:this.identity.publicKey,payload,signature:await this.identity.sign(payload)};return this.request('/skills',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(envelope),signal});}
}
