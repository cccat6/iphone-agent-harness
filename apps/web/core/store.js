const DB_NAME = 'iphone-automation-harness';
const uid = () => globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clone = value => structuredClone(value);
const modes = new Set(['chat','plan','task']);
const secretKey = /^(apiKey|api_key|key|token|access_token|refresh_token|password|authorization)$/i;
function safeSettings(value) {
  if (Array.isArray(value)) return value.map(safeSettings);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !secretKey.test(k)).map(([k,v]) => [k,safeSettings(v)]));
  return value;
}
function sessionValue(input = {}) {
  const now = Date.now();
  return {id:uid(),title:String(input.title || '新对话').slice(0,160),mode:modes.has(input.mode)?input.mode:'chat',modelId:input.modelId||'',pinned:false,archived:false,createdAt:now,updatedAt:now,lastSeq:0};
}
export async function openStore({memory = false, name = DB_NAME} = {}) {
  let db;
  if (!memory) {
    if (!globalThis.indexedDB) throw new Error('此浏览器不能使用本地数据库；请使用普通 Safari 窗口');
    db = await new Promise((resolve,reject) => {
      const r = indexedDB.open(name,1);
      r.onupgradeneeded = () => {
        const d=r.result;
        d.createObjectStore('sessions',{keyPath:'id'});
        d.createObjectStore('messages',{keyPath:'id'}).createIndex('sessionId','sessionId');
        d.createObjectStore('settings',{keyPath:'id'});
        d.createObjectStore('skills',{keyPath:'id'});
      };
      r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);
      r.onblocked=()=>reject(new Error('请关闭此网站的其他旧版窗口后重试'));
    });
  }
  const ram=Object.fromEntries(['sessions','messages','settings','skills'].map(k=>[k,new Map()]));
  async function tx(stores,mode,work) {
    if (!db) return work(Object.fromEntries(stores.map(k=>[k,{get:async id=>clone(ram[k].get(id)),all:async()=>clone([...ram[k].values()]),put:async v=>{ram[k].set(v.id,clone(v));},delete:async id=>{ram[k].delete(id);}}])));
    const t=db.transaction(stores,mode);
    const done=new Promise((resolve,reject)=>{t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('本地写入被中止'));});
    const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const api=Object.fromEntries(stores.map(k=>{const s=t.objectStore(k);return [k,{get:id=>request(s.get(id)),all:()=>request(s.getAll()),put:v=>request(s.put(v)),delete:id=>request(s.delete(id)),bySession:id=>request(s.index('sessionId').getAll(id))}];}));
    try {const value=await work(api);await done;return value;} catch(e){try{t.abort();}catch{}await done.catch(()=>{});throw e;}
  }
  const store={
    async listSessions({archived=false,search=''}={}) {return tx(['sessions'],'readonly',async s=>(await s.sessions.all()).filter(v=>Boolean(v.archived)===archived&&v.title.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.updatedAt-a.updatedAt));},
    async createSession(input) {const value=sessionValue(input);await tx(['sessions'],'readwrite',s=>s.sessions.put(value));return value;},
    async getSession(id){return tx(['sessions'],'readonly',s=>s.sessions.get(id));},
    async updateSession(id,patch){return tx(['sessions'],'readwrite',async s=>{const value=await s.sessions.get(id);if(!value)throw new Error('对话不存在');for(const k of ['title','mode','modelId','pinned','archived'])if(k in patch)value[k]=clone(patch[k]);if(!modes.has(value.mode))throw new Error('未知模式');value.title=String(value.title).slice(0,160);value.updatedAt=Date.now();await s.sessions.put(value);return value;});},
    async deleteSession(id){await tx(['sessions','messages'],'readwrite',async s=>{const msgs=s.messages.bySession?await s.messages.bySession(id):(await s.messages.all()).filter(v=>v.sessionId===id);for(const m of msgs)await s.messages.delete(m.id);await s.sessions.delete(id);});},
    async addMessage(sessionId,input){return tx(['sessions','messages'],'readwrite',async s=>{const session=await s.sessions.get(sessionId);if(!session)throw new Error('对话不存在');const message={...clone(input),id:uid(),sessionId,seq:++session.lastSeq,createdAt:Date.now(),text:String(input.text||'')};if(!['user','assistant','system','tool'].includes(message.role))throw new Error('未知消息角色');session.updatedAt=message.createdAt;await s.messages.put(message);await s.sessions.put(session);return message;});},
    async getMessages(sessionId){return tx(['messages'],'readonly',async s=>(s.messages.bySession?await s.messages.bySession(sessionId):(await s.messages.all()).filter(v=>v.sessionId===sessionId)).sort((a,b)=>a.seq-b.seq));},
    async getSettings(){return tx(['settings'],'readonly',async s=>(await s.settings.get('settings'))?.value||{providers:[],activeProviderId:''});},
    async saveSettings(patch){return tx(['settings'],'readwrite',async s=>{const old=(await s.settings.get('settings'))?.value||{};const value={...old,...safeSettings(clone(patch))};await s.settings.put({id:'settings',value});return value;});},
    async exportSession(id){return {format:'iah-session',version:1,session:await store.getSession(id),messages:await store.getMessages(id)};},
    async importSession(value){if(value?.format!=='iah-session'||value.version!==1||!value.session||!Array.isArray(value.messages)||value.messages.length>100000)throw new Error('不支持的对话文件');for(const m of value.messages)if(!['user','assistant','system','tool'].includes(m.role)||typeof m.text!=='string')throw new Error('无效消息');const session=await store.createSession({...value.session,title:`${value.session.title||'对话'}（导入）`});try{for(const m of value.messages)await store.addMessage(session.id,{role:m.role,text:m.text});return session;}catch(e){await store.deleteSession(session.id);throw e;}},
    async listSkills(){return tx(['skills'],'readonly',s=>s.skills.all());},
    async saveSkill(skill){if(!skill?.id)throw new Error('Skill 缺少标识');const value=safeSettings(clone(skill));await tx(['skills'],'readwrite',s=>s.skills.put(value));return value;},
    async deleteSkill(id){return tx(['skills'],'readwrite',s=>s.skills.delete(id));},
    close(){db?.close();},persistent:!memory,
  };
  return store;
}
