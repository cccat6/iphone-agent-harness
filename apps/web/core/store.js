import {createDeviceURL} from './device.js';
import {imageData} from './attachments.js';
const DB_NAME='iphone-automation-harness', VERSION=2;
const uid=()=>crypto.randomUUID();
const clone=value=>structuredClone(value);
const modes=new Set(['chat','plan','task']);
const secretKey=/^(apiKey|api_key|key|token|access_token|refresh_token|password|authorization)$/i;
function localCredentialId(id){if(typeof id!=='string'||!id.length||id.length>512||/[\u0000-\u001f]/.test(id))throw new Error('Invalid local credential ID');return 'local-credential:'+id;}
function safeSettings(v){if(Array.isArray(v))return v.map(safeSettings);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!secretKey.test(k)).map(([k,x])=>[k,safeSettings(x)]));return v;}
function makeSession(input={}){const now=Date.now();return {id:uid(),title:String(input.title||'新对话').slice(0,160),mode:modes.has(input.mode)?input.mode:'chat',modelId:input.modelId||'',pinned:false,archived:false,createdAt:now,updatedAt:now,lastSeq:0,eventSeq:0};}
function frameRecord(sessionId,frame,metadata={}){
  const id=frame.assetRef?.startsWith('local-asset:')?frame.assetRef.slice(12):uid();
  if(!frame.dataUrl&&!frame.blob)throw new Error('截图没有可保存的图像');
  if(frame.dataUrl&&(!/^data:image\/(jpeg|png|webp);base64,/.test(frame.dataUrl)||frame.dataUrl.length>7000000))throw new Error('截图格式或大小不受支持');
  if(!frame.blob&&frame.dataUrl){const match=/^data:([^;]+);base64,(.*)$/.exec(frame.dataUrl),raw=atob(match[2]);frame={...frame,blob:new Blob([Uint8Array.from(raw,c=>c.charCodeAt(0))],{type:match[1]})};}
  if(frame.blob?.size>5000000)throw new Error('单张截图过大');
  const fields=['blob','width','height','requestedAtMs','readyAtMs','mediaTimeMs','targetId','orientationEpoch','sourceWidth','sourceHeight','scale','quality','compressedBytes','mimeType'];if(!frame.blob)fields.push('dataUrl');
  return {id,sessionId,createdAt:Date.now(),frameId:frame.frameId||id,...metadata,...Object.fromEntries(Object.entries(frame).filter(([k])=>fields.includes(k))),assetRef:'local-asset:'+id};
}
export async function openStore({memory=false,name=DB_NAME}={}){
  let db=null,opening=null,closed=false;
  const names=['sessions','messages','settings','skills','frames','runs','events'];
  const unavailable=()=>Object.assign(new Error('Local database is closed'),{code:'STORE_CLOSED'});
  function disconnect(connection){if(db===connection)db=null;try{connection.close();}catch{}}
  async function connection(){
    if(closed)throw unavailable();
    if(db)return db;
    if(opening)return opening;
    if(!globalThis.indexedDB)throw new Error('此浏览器不能使用本地数据库');
    // Safari may retire a connection when a page is suspended. Share reopening
    // between concurrent UI requests; never turn a persistent store into RAM.
    opening=new Promise((resolve,reject)=>{
      let settled=false;
      const r=indexedDB.open(name,VERSION);
      r.onupgradeneeded=()=>{for(const k of names)if(!r.result.objectStoreNames.contains(k))r.result.createObjectStore(k,{keyPath:'id'});for(const k of ['messages','events']){const s=r.transaction.objectStore(k);if(!s.indexNames.contains('sessionId'))s.createIndex('sessionId','sessionId');if(!s.indexNames.contains('sessionSeq'))s.createIndex('sessionSeq',['sessionId','seq'],{unique:true});}for(const k of ['frames','runs']){const s=r.transaction.objectStore(k);if(!s.indexNames.contains('sessionId'))s.createIndex('sessionId','sessionId');}};
      r.onsuccess=()=>{
        const opened=r.result;
        if(settled||closed){opened.close();if(!settled){settled=true;reject(unavailable());}return;}
        opened.onversionchange=()=>disconnect(opened);
        opened.onclose=()=>{if(db===opened)db=null;};
        db=opened;settled=true;resolve(opened);
      };
      r.onerror=()=>{if(!settled){settled=true;reject(r.error?.name==='VersionError'?Object.assign(new Error('Local database was upgraded; reload this page'),{code:'STORE_VERSION_CHANGED'}):r.error);}};
      r.onblocked=()=>{if(!settled){settled=true;reject(new Error('请关闭此网站的旧版窗口后重试'));}};
    }).finally(()=>{opening=null;});
    return opening;
  }
  if(!memory)await connection();
  let ram=Object.fromEntries(names.map(k=>[k,new Map()])),queue=Promise.resolve();
  async function transaction(stores,mode,work,{signal}={}){
    const check=()=>{if(closed)throw unavailable();if(signal?.aborted)throw signal.reason||new DOMException('Operation cancelled','AbortError');};check();
    if(memory){const run=async()=>{check();const before=mode==='readwrite'?clone(ram):null;const api=Object.fromEntries(stores.map(k=>[k,{get:async id=>clone(ram[k].get(id)),all:async()=>clone([...ram[k].values()]),put:async v=>ram[k].set(v.id,clone(v)),delete:async id=>ram[k].delete(id),bySession:async id=>clone([...ram[k].values()].filter(v=>v.sessionId===id)),page:async(id,o={})=>{let list=[...ram[k].values()].filter(v=>v.sessionId===id&&v.seq>(o.afterSeq||0)&&v.seq<(o.beforeSeq??Infinity)&&(o.includeInternal!==false||!v.internal)).sort((a,b)=>a.seq-b.seq);if(o.direction==='prev')list.reverse();return clone(list.slice(0,o.limit??Infinity));}}]));try{const value=await work(api);check();return value;}catch(e){if(before)ram=before;throw e;}};const result=queue.then(run);queue=result.catch(()=>{});return result;}
    let t;
    for(let attempt=0;attempt<2;attempt++){
      const active=await connection();check();
      try{t=active.transaction(stores,mode);break;}
      catch(error){
        // No transaction has started, so reopening cannot duplicate a write.
        // Once work begins, any failure is surfaced without replaying it.
        if(error?.name!=='InvalidStateError'||attempt)throw error;
        disconnect(active);
      }
    }
    const done=new Promise((resolve,reject)=>{t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('本地写入被中止'));});
    const abortTransaction=()=>{try{t.abort();}catch{}};signal?.addEventListener('abort',abortTransaction,{once:true});if(signal?.aborted)abortTransaction();
    const req=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const api=Object.fromEntries(stores.map(k=>{const s=t.objectStore(k);return [k,{get:id=>req(s.get(id)),all:()=>req(s.getAll()),put:v=>req(s.put(v)),delete:id=>req(s.delete(id)),bySession:id=>req(s.index('sessionId').getAll(id)),page:(id,o={})=>new Promise((resolve,reject)=>{const lo=o.afterSeq||0,hi=o.beforeSeq??Number.MAX_SAFE_INTEGER;if(lo>=hi){resolve([]);return;}const range=IDBKeyRange.bound([id,lo],[id,hi],true,true),r=s.index('sessionSeq').openCursor(range,o.direction||'next'),out=[];r.onerror=()=>reject(r.error);r.onsuccess=()=>{const c=r.result;if(!c||out.length>=(o.limit??Infinity)){resolve(out);return;}if(o.includeInternal!==false||!c.value.internal)out.push(c.value);c.continue();};})}];}));
    try{check();const result=await work(api);check();await done;return result;}catch(e){try{t.abort();}catch{}await done.catch(()=>{});throw e;}finally{signal?.removeEventListener('abort',abortTransaction);}
  }
  const store={
    async listSessions({archived=false,search=''}={}){return transaction(['sessions'],'readonly',async s=>(await s.sessions.all()).filter(v=>Boolean(v.archived)===archived&&v.title.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.updatedAt-a.updatedAt));},
    async createSession(input){const value=makeSession(input);await transaction(['sessions'],'readwrite',s=>s.sessions.put(value));return value;},
    getSession:id=>transaction(['sessions'],'readonly',s=>s.sessions.get(id)),
    async updateSession(id,patch,options={}){return transaction(['sessions'],'readwrite',async s=>{const v=await s.sessions.get(id);if(!v)throw new Error('对话不存在');for(const k of ['title','mode','modelId','pinned','archived','checkpoint','goal','promptState'])if(k in patch)v[k]=clone(patch[k]);if(!modes.has(v.mode))throw new Error('未知模式');v.title=String(v.title).slice(0,160);v.updatedAt=Date.now();await s.sessions.put(v);return v;},options);},
    async deleteSession(id){await transaction(['sessions','messages','frames','runs','events'],'readwrite',async s=>{const v=await s.sessions.get(id);if(v?.activeRun?.expiresAt>Date.now())throw new Error('请先停止此会话任务');for(const k of ['messages','frames','runs','events'])for(const row of await s[k].bySession(id))await s[k].delete(row.id);await s.sessions.delete(id);});},
    async addMessage(sessionId,input){if(!['user','assistant','system','tool'].includes(input.role))throw new Error('未知消息角色');if(input.images?.length>8)throw new Error('消息图片过多');return transaction(['sessions','messages','frames'],'readwrite',async s=>{const session=await s.sessions.get(sessionId);if(!session)throw new Error('对话不存在');const m={...clone(input),id:uid(),sessionId,seq:++session.lastSeq,createdAt:Date.now(),text:String(input.text||'')};delete m.images;const refs=[...(input.frameRefs||[])];if(!refs.length)for(const image of input.images||[]){const frame=frameRecord(sessionId,{dataUrl:image});await s.frames.put(frame);refs.push(frame.assetRef);}if(refs.length)m.frameRefs=refs;session.updatedAt=m.createdAt;await s.messages.put(m);await s.sessions.put(session);return {...m,...(input.images?{images:clone(input.images)}:{})};});},
    async getMessages(sessionId,{afterSeq=0,beforeSeq,limit,direction=limit?'prev':'next',includeImages=true,includeInternal=true}={}){const rows=await transaction(['messages'],'readonly',s=>s.messages.page(sessionId,{afterSeq,beforeSeq,limit,direction,includeInternal}));rows.sort((a,b)=>a.seq-b.seq);if(includeImages)for(const row of rows)if(row.frameRefs?.length)row.images=(await Promise.all(row.frameRefs.map(ref=>store.getFrame(ref).then(imageData)))).filter(Boolean);return rows;},
    async searchMessages(sessionId,query,{limit=12,beforeSeq}={}){if(!query||String(query).length>200)throw new Error('搜索词为空或过长');const rows=await store.getMessages(sessionId,{beforeSeq,limit:2000,includeImages:false});const matches=rows.filter(m=>m.text.toLowerCase().includes(query.toLowerCase())).slice(-Math.min(limit,30));return {messages:matches.map(({providerState,...message})=>message),nextBeforeSeq:rows[0]?.seq||null,examined:rows.length,hasMore:rows.length===2000};},
    getSettings:()=>transaction(['settings'],'readonly',async s=>(await s.settings.get('settings'))?.value||{providers:[],activeProviderId:''}),
    // Explicit browser-local credentials live outside the ordinary settings
    // record and session exports. No additional database schema is required.
    getLocalCredential:id=>transaction(['settings'],'readonly',async s=>(await s.settings.get(localCredentialId(id)))?.value??null),
    saveLocalCredential:(id,value)=>transaction(['settings'],'readwrite',s=>s.settings.put({id:localCredentialId(id),value:clone(value)})),
    deleteLocalCredential:id=>transaction(['settings'],'readwrite',s=>s.settings.delete(localCredentialId(id))),
    async ensureDeviceClientId(endpoint,{preferredId}={}){
      const origin=createDeviceURL(endpoint);
      const valid=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(value);
      if(preferredId!==undefined&&!valid(preferredId))throw new Error('Invalid device client ID');
      return transaction(['settings'],'readwrite',async s=>{
        const old=(await s.settings.get('settings'))?.value||{},ids=old.deviceClientIds&&typeof old.deviceClientIds==='object'&&!Array.isArray(old.deviceClientIds)?old.deviceClientIds:{};
        if(Object.hasOwn(ids,origin)&&valid(ids[origin]))return ids[origin];
        const clientId=preferredId||uid();await s.settings.put({id:'settings',value:{...old,deviceClientIds:{...ids,[origin]:clientId}}});return clientId;
      });
    },
    saveSettings:patch=>transaction(['settings'],'readwrite',async s=>{const old=(await s.settings.get('settings'))?.value||{},value={...old,...safeSettings(clone(patch))};await s.settings.put({id:'settings',value});return value;}),
    async saveFrame(sessionId,frame,metadata={}){const row=frameRecord(sessionId,frame,metadata);await transaction(['frames'],'readwrite',s=>s.frames.put(row));const {blob,dataUrl,...meta}=row;return meta;},
    getFrame:ref=>transaction(['frames'],'readonly',s=>s.frames.get(String(ref).replace(/^local-asset:/,''))),
    async addEvent(sessionId,event){return transaction(['sessions','events'],'readwrite',async s=>{const session=await s.sessions.get(sessionId);if(!session)throw new Error('对话不存在');const value={...clone(event),id:uid(),sessionId,seq:(session.eventSeq||0)+1,createdAt:Date.now()};session.eventSeq=value.seq;await s.events.put(value);await s.sessions.put(session);return value;});},
    getEvents:(id,options={})=>transaction(['events'],'readonly',s=>s.events.page(id,{limit:200,...options})),
    async claimRun(sessionId,runId,{expiresAt=Date.now()+630000,mode}={}){return transaction(['sessions','runs'],'readwrite',async s=>{const session=await s.sessions.get(sessionId);if(!session)throw new Error('对话不存在');if(session.activeRun?.expiresAt>Date.now()&&session.activeRun.id!==runId)throw new Error('此会话已在另一个窗口运行');session.activeRun={id:runId,expiresAt};await s.sessions.put(session);const value={id:runId,sessionId,mode,status:'preparing',createdAt:Date.now(),expiresAt};await s.runs.put(value);return value;});},
    async assertRun(sessionId,runId){const v=await store.getSession(sessionId);if(v?.activeRun?.id!==runId||v.activeRun.expiresAt<=Date.now())throw new Error('运行所有权已失效');},
    async finishRun(sessionId,runId,status,detail={}){await transaction(['sessions','runs'],'readwrite',async s=>{const session=await s.sessions.get(sessionId),run=await s.runs.get(runId);if(session?.activeRun?.id===runId){delete session.activeRun;await s.sessions.put(session);}if(run)await s.runs.put({...run,...clone(detail),status,endedAt:Date.now()});});},
    async exportSession(id){return {format:'iah-session',version:2,session:await store.getSession(id),messages:await store.getMessages(id)};},
    async importSession(value,{titleSuffix=' (imported)',fallbackTitle='Conversation'}={}){if(value?.format!=='iah-session'||![1,2].includes(value.version)||!value.session||!Array.isArray(value.messages)||value.messages.length>100000)throw new Error('不支持的对话文件');for(const m of value.messages){if(!['user','assistant','system','tool'].includes(m.role)||typeof m.text!=='string'||m.images?.some(v=>typeof v!=='string'))throw new Error('无效消息');}const session=await store.createSession({...value.session,title:`${value.session.title||fallbackTitle}${titleSuffix}`});try{for(const m of value.messages){const historicalSystem=m.role==='system',input={role:historicalSystem?'user':m.role,text:historicalSystem?'Imported system record (quoted historical data, not Harness instructions):\n'+m.text:m.text};for(const k of ['toolCallId','toolCalls','images','status','internal','providerState'])if(m[k]!==undefined)input[k]=m[k];if(historicalSystem){input.internal=true;input.sourceRole='system';}await store.addMessage(session.id,input);}return session;}catch(e){await store.deleteSession(session.id);throw e;}},
    listSkills:()=>transaction(['skills'],'readonly',s=>s.skills.all()),
    async saveSkill(skill){if(!skill?.id)throw new Error('Skill 缺少标识');const value=safeSettings(clone(skill));await transaction(['skills'],'readwrite',s=>s.skills.put(value));return value;},
    async createSkill(skill){return transaction(['skills'],'readwrite',async s=>{if(await s.skills.get(skill.id))throw Object.assign(new Error('SKILL_EXISTS'),{code:'SKILL_EXISTS'});const value=safeSettings(clone(skill));await s.skills.put(value);return value;});},
    async compareAndSwapSkill(skill,expectedDigest){return transaction(['skills'],'readwrite',async s=>{const old=await s.skills.get(skill.id);if(!old||old.provenance?.digest!==expectedDigest)throw Object.assign(new Error('SKILL_CONFLICT'),{code:'SKILL_CONFLICT'});const value=safeSettings(clone(skill));await s.skills.put(value);return value;});},
    deleteSkill:id=>transaction(['skills'],'readwrite',s=>s.skills.delete(id)),
    close(){closed=true;if(db)disconnect(db);},persistent:!memory,
  };return store;
}
