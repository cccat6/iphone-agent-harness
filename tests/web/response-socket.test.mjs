import test from 'node:test';
import assert from 'node:assert/strict';
import {ResponseSocket} from '../../apps/web/core/response-socket.js';
class Socket extends EventTarget{
 static instances=[];sent=[];closed=false;
 constructor(url){super();this.url=url;Socket.instances.push(this);}
 send(data){this.sent.push(JSON.parse(data));}
 close(){this.closed=true;}
 event(type,value){this.dispatchEvent(Object.assign(new Event(type),type==='message'?{data:JSON.stringify(value)}:{}));}
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const make=()=>{const channel=new ResponseSocket({url:'wss://igent.cc/api/openai/responses',token:'synthetic',sessionId:'iah:test',Socket});return {channel,ws:channel.socket};};
async function ready(f){f.ws.event('open');assert.equal(f.ws.sent[0].authorization,'Bearer synthetic');f.ws.event('message',{type:'iah.ready'});await tick();}
test('one authenticated socket supplies successive streamed responses with store false',async()=>{const f=make();try{await ready(f);for(let i=0;i<2;i++){const pending=f.channel.request({model:'fixture',store:false,stream:true,input:[{role:'user',content:'new'}]});await tick();assert.equal(f.ws.sent.at(-1).type,'response.create');assert.equal(f.ws.sent.at(-1).stream,undefined);f.ws.event('message',{type:'response.output_text.delta',delta:'ok'});f.ws.event('message',{type:'response.completed',response:{id:'resp-'+i,status:'completed'}});const response=await pending,text=await response.text();assert.match(text,/response.completed/);assert.equal(f.channel.active,null);assert.equal(f.ws.closed,false);}}finally{f.channel.close();}});
test('aborting active response rejects reader and clears continuation state',async()=>{const f=make(),c=new AbortController();await ready(f);const pending=f.channel.request({input:[]},{signal:c.signal});await tick();f.ws.event('message',{type:'response.created'});const response=await pending,reader=response.body.getReader();await reader.read();f.channel.record={responseId:'old'};c.abort(new Error('stopped'));await assert.rejects(reader.read(),/stopped/);assert.equal(f.channel.record,null);assert.equal(f.ws.closed,true);});
test('uncached previous response is surfaced as a normal 400 for full replay',async()=>{const f=make();try{await ready(f);const pending=f.channel.request({input:[],previous_response_id:'missing'});await tick();f.ws.event('message',{type:'error',status:400,error:{code:'previous_response_not_found'}});const response=await pending;assert.equal(response.status,400);assert.equal((await response.json()).error.code,'previous_response_not_found');assert.equal(f.channel.active,null);}finally{f.channel.close();}});
test('cancel before authentication and mid-generation never leave a pending socket',async()=>{const f=make(),c=new AbortController(),request=f.channel.request({input:[]},{signal:c.signal});c.abort(new Error('cancelled'));await assert.rejects(request,/cancelled/);assert.equal(f.ws.closed,true);const g=make();await ready(g);const p=g.channel.request({input:[]});await tick();g.ws.event('message',{type:'response.created'});const response=await p;await response.body.cancel();assert.equal(g.ws.closed,true);});
test('heartbeat replies between responses preserve the continuation record and never enter model output',async()=>{const f=make();try{await ready(f);f.channel.record={responseId:'retained'};f.ws.event('message',{type:'iah.pong'});assert.equal(f.channel.closed,false);assert.equal(f.channel.active,undefined);assert.equal(f.channel.record.responseId,'retained');assert.ok(f.channel.lastPong>0);}finally{f.channel.close();}});
