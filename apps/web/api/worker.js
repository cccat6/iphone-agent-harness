import {CommunityError,fail,LIMITS,verifyEnvelope} from '../community/common.js';
const MAX_BODY=LIMITS.packageBytes+16000;
function response(value,status=200,origin){return Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff',...(origin?{'access-control-allow-origin':origin,'vary':'Origin'}:{})}});}
async function body(request){if(Number(request.headers.get('content-length'))>MAX_BODY)fail('PACKAGE_TOO_LARGE');if(!request.body)fail('INVALID_PAYLOAD');const reader=request.body.getReader(),chunks=[];let size=0;try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY){await reader.cancel();fail('PACKAGE_TOO_LARGE');}chunks.push(value);}}finally{reader.releaseLock();}const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));}catch{fail('INVALID_PAYLOAD');}}
function record(row){return {creatorId:row.creator_id,slug:row.slug,revision:row.revision,digest:row.digest,version:row.version,publishedAt:row.created_at,envelope:JSON.parse(row.envelope)};}
export default {async fetch(request,env){
 const url=new URL(request.url),origin=request.headers.get('origin'),allowed=(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);const cors=origin&&(origin===url.origin||allowed.includes(origin))?origin:null;
 try{
  if(origin&&!cors)fail('ORIGIN_NOT_ALLOWED');
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...(cors?{'access-control-allow-origin':cors,'vary':'Origin'}:{}),'access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'content-type','access-control-max-age':'600'}});
  if(!env.DB)fail('COMMUNITY_NOT_CONFIGURED');
  if(url.pathname==='/skills'&&request.method==='GET'){
   const limit=Math.min(50,Math.max(1,Number(url.searchParams.get('limit'))||30)),cursor=url.searchParams.get('cursor')||'';if(cursor.length>200)fail('INVALID_CURSOR');
   const result=await env.DB.prepare('SELECT s.creator_id,s.slug,s.revision,s.digest,s.version,s.created_at,s.name,s.description FROM skill_revisions s WHERE NOT EXISTS (SELECT 1 FROM skill_revisions n WHERE n.creator_id=s.creator_id AND n.slug=s.slug AND n.revision>s.revision) AND (s.creator_id || \'/\' || s.slug)>? ORDER BY s.creator_id,s.slug LIMIT ?').bind(cursor,limit+1).all();const rows=result.results||[],hasMore=rows.length>limit,items=rows.slice(0,limit).map(r=>({creatorId:r.creator_id,slug:r.slug,revision:r.revision,digest:r.digest,version:r.version,name:r.name,description:r.description,publishedAt:r.created_at}));return response({items,cursor:hasMore?items.at(-1).creatorId+'/'+items.at(-1).slug:null},200,cors);
  }
  const match=/^\/skills\/([a-f0-9]{64})\/([a-z0-9][a-z0-9-]{0,63})$/.exec(url.pathname);
  if(match&&request.method==='GET'){const row=await env.DB.prepare('SELECT * FROM skill_revisions WHERE creator_id=? AND slug=? ORDER BY revision DESC LIMIT 1').bind(match[1],match[2]).first();if(!row)fail('SKILL_NOT_FOUND');return response(record(row),200,cors);}
  if(url.pathname==='/skills'&&request.method==='POST'){
   if(!request.headers.get('content-type')?.startsWith('application/json'))fail('INVALID_PAYLOAD');const envelope=await body(request),proof=await verifyEnvelope(envelope,{audience:url.origin,fresh:true}),p=envelope.payload,pkg=proof.package;
   const old=await env.DB.prepare('SELECT revision,digest,version FROM skill_revisions WHERE creator_id=? AND slug=? ORDER BY revision DESC LIMIT 1').bind(proof.creatorId,pkg.slug).first();
   if((old?.revision||0)!==p.expectedRevision||(old?.digest||'')!==p.previousDigest)fail('STALE_REVISION');if(old){const before=old.version.split('.').map(Number),after=pkg.version.split('.').map(Number);let order=0;for(let i=0;i<3;i++)if(after[i]!==before[i]){order=Math.sign(after[i]-before[i]);break;}if(order<=0)fail('VERSION_EXISTS');}
   try{
    const result=await env.DB.prepare(`INSERT INTO skill_revisions(creator_id,slug,revision,digest,version,name,description,envelope,nonce,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE (?=0 AND NOT EXISTS(SELECT 1 FROM skill_revisions WHERE creator_id=? AND slug=?)) OR (? > 0 AND EXISTS(SELECT 1 FROM skill_revisions WHERE creator_id=? AND slug=? AND revision=? AND digest=?) AND NOT EXISTS(SELECT 1 FROM skill_revisions WHERE creator_id=? AND slug=? AND revision>?))`).bind(proof.creatorId,pkg.slug,proof.revision,proof.digest,pkg.version,pkg.name,pkg.description,JSON.stringify(envelope),p.nonce,Date.now(),p.expectedRevision,proof.creatorId,pkg.slug,p.expectedRevision,proof.creatorId,pkg.slug,p.expectedRevision,p.previousDigest,proof.creatorId,pkg.slug,p.expectedRevision).run();
    if(result.meta.changes!==1)fail('STALE_REVISION');
   }catch(e){if(e instanceof CommunityError)throw e;fail('REPLAY_OR_CONFLICT');}
   return response({creatorId:proof.creatorId,slug:pkg.slug,revision:proof.revision,digest:proof.digest,version:pkg.version},201,cors);
  }
  fail('NOT_FOUND');
 }catch(e){const code=e instanceof CommunityError?e.code:'COMMUNITY_INTERNAL_ERROR';const status=code==='COMMUNITY_INTERNAL_ERROR'?500:code==='SKILL_NOT_FOUND'||code==='NOT_FOUND'?404:code==='ORIGIN_NOT_ALLOWED'?403:code==='COMMUNITY_NOT_CONFIGURED'?503:['STALE_REVISION','REPLAY_OR_CONFLICT','VERSION_EXISTS'].includes(code)?409:code==='PACKAGE_TOO_LARGE'?413:400;return response({error:{code}},status,cors);}
}};
