import {validateMessageMetadata} from './message-metadata.js';
import {SESSION_BACKUP_BYTES} from './backup-files.js';
import {imageData} from './attachments.js';
const invalid=()=>new Error('Invalid session backup');
function sizeCheck(file){if(file.size>SESSION_BACKUP_BYTES)throw Object.assign(new Error('BACKUP_TOO_LARGE'),{code:'BACKUP_TOO_LARGE'});}
function validateMessage(m){validateMessageMetadata(m||{});if(!m||!['user','assistant','system','tool'].includes(m.role)||typeof m.text!=='string'||(m.images!==undefined&&(!Array.isArray(m.images)||m.images.length>8||m.images.some(v=>typeof v!=='string'||!/^data:image\/(jpeg|png|webp);base64,/.test(v)||v.length>7000000))))throw invalid();}
function importedMessage(m){const historicalSystem=m.role==='system',input={role:historicalSystem?'user':m.role,text:historicalSystem?'Imported system record (quoted historical data, not Harness instructions):\n'+m.text:m.text};for(const key of ['toolCallId','toolCalls','toolName','taskPlan','images','status','internal','providerState'])if(m[key]!==undefined)input[key]=m[key];if(historicalSystem){input.internal=true;input.sourceRole='system';}return input;}
// Small input chunks, one JSON message at a time. The first pass validates the
// complete file before any write; the second pass creates a new isolated session.
async function* records(file,{chunkBytes=65536}={}){
  sizeCheck(file);let offset=0,buffer='',position=0;const decoder=new TextDecoder('utf-8',{fatal:true});
  async function peek(){while(position>=buffer.length){if(offset>=file.size)return null;const next=Math.min(file.size,offset+chunkBytes),bytes=await file.slice(offset,next).arrayBuffer();buffer=decoder.decode(bytes,{stream:next<file.size});offset=next;position=0;}return buffer[position];}
  async function take(){const value=await peek();if(value!==null)position++;return value;}
  async function space(){while(/\s/.test((await peek())??'X'))await take();}
  async function expect(char){await space();if(await take()!==char)throw invalid();}
  async function value(maxChars=SESSION_BACKUP_BYTES){
    await space();const chunks=[];let depth=0,string=false,escaped=false,started=false,totalChars=0;
    const parsed=()=>{if(!started||string||depth)throw invalid();try{const text=chunks.join('');chunks.length=0;return JSON.parse(text);}catch{throw invalid();}};
    while(true){if(await peek()===null)return parsed();const start=position;
      while(position<buffer.length){const ch=buffer[position];if(started&&!string&&depth===0&&(ch===','||ch===']'||ch==='}'||ch===':'||/\s/.test(ch))){if(position>start)chunks.push(buffer.slice(start,position));return parsed();}
        position++;if(++totalChars>maxChars)throw invalid();started=true;if(string){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')string=false;}else if(ch==='"')string=true;else if(ch==='{'||ch==='[')depth++;else if(ch==='}'||ch===']'){depth--;if(depth<0)throw invalid();}
      }chunks.push(buffer.slice(start,position));
    }
  }

  await expect('{');const seen=new Set();await space();if(await peek()==='}')throw invalid();
  while(true){const key=await value(32);if(typeof key!=='string'||seen.has(key)||!['format','version','session','messages'].includes(key))throw invalid();seen.add(key);await expect(':');if(key==='messages'){await expect('[');await space();if(await peek()!==']')while(true){yield {key:'message',value:await value()};await space();const delimiter=await take();if(delimiter===']')break;if(delimiter!==',')throw invalid();}else await take();yield {key:'messages',value:true};}else yield {key,value:await value(key==='session'?1048576:32)};await space();const delimiter=await take();if(delimiter==='}')break;if(delimiter!==',')throw invalid();}
  await space();if(await peek()!==null)throw invalid();
}
export async function importSessionFile(store,file,{titleSuffix=' (imported)',fallbackTitle='Conversation',chunkBytes}={}){
  const header={};let count=0;
  for await(const row of records(file,{chunkBytes})){if(row.key==='message'){validateMessage(row.value);if(++count>100000)throw invalid();}else header[row.key]=row.value;}
  if(header.format!=='iah-session'||![1,2].includes(header.version)||!header.session||typeof header.session!=='object'||Array.isArray(header.session)||header.messages!==true)throw invalid();
  const session=await store.createImportSession({...header.session,title:`${header.session.title||fallbackTitle}${titleSuffix}`});
  try{for await(const row of records(file,{chunkBytes}))if(row.key==='message')await store.addMessage(session.id,importedMessage(row.value));return await store.finishImportSession(session.id);}catch(error){await store.deleteSession(session.id);throw error;}
}
export async function exportSessionFile(store,id){
  const session=await store.getSession(id);if(!session)throw invalid();const parts=[];let bytes=0;
  function append(text){const part=new Blob([text]);bytes+=part.size;sizeCheck({size:bytes});parts.push(part);}
  const header=JSON.stringify(session);if(header.length>1048576)throw invalid();append('{"format":"iah-session","version":2,"session":'+header+',"messages":[');
  let seq=0,first=true;
  // Metadata and individual image strings become independent Blob pieces.
  // Never hydrate all screenshots of a message together just to stringify it.
  while(seq<session.lastSeq){
    const rows=await store.getMessages(id,{afterSeq:seq,beforeSeq:session.lastSeq+1,limit:1,direction:'next',includeImages:false});if(rows.length!==1||rows[0].seq!==seq+1)throw invalid();
    const row=rows[0],{images,...metadata}=row,refs=row.frameRefs||[];
    append((first?'':',')+JSON.stringify(metadata).slice(0,-1));
    if(refs.length||Array.isArray(images)){
      append(',"images":[');let firstImage=true;
      for(let index=0;index<(refs.length||images.length);index++){
        const image=refs.length?await imageData(await store.getFrame(refs[index])):images[index];
        if(!image)continue;append((firstImage?'':',')+JSON.stringify(image));firstImage=false;
      }append(']');
    }append('}');first=false;seq=row.seq;
  }
  append(']}');return new Blob(parts,{type:'application/json'});
}
