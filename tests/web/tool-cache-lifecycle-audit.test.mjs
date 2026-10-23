import test from 'node:test';import assert from 'node:assert/strict';
import {openStore} from '../../apps/web/core/store.js';import {createHarness} from '../../apps/web/core/harness.js';
import {callModel} from '../../apps/web/core/providers.js';import {createMCPAccess} from '../../apps/web/core/mcp.js';
const snapshot=({provider,messages,tools,toolDefinitions})=>structuredClone({provider,messages,tools,toolDefinitions});
const provider={id:'p',protocol:'openai',baseUrl:'https://fixture.invalid/v1',model:'fixture',stream:false};
const done={text:'ok',toolCalls:[]},call=(id,name,args={})=>({id,name,arguments:args}),reply=(...calls)=>({text:'',toolCalls:calls});
const entry='UNIQUE_ENTRY_VERSION_ONE',ref='UNIQUE_REFERENCE_VERSION_ONE';
const skill={id:'audit-skill',source:'authored',version:'1.0.0',description:'audit fixture',content:entry,resources:{'reference.md':ref},enabled:true};
async function setup(mode='plan'){const store=await openStore({memory:true});await store.saveSettings({providers:[provider],activeProviderId:'p'});const session=await store.createSession({mode});await store.saveSkill(skill);return {store,session};}
const occurrences=(messages,text)=>messages.reduce((n,m)=>n+(m.text||'').split(text).length-1,0);
const runtime=request=>JSON.parse(request.messages.findLast(m=>m.runtimeContext).text.split('\n').slice(1).join('\n'));
for(const protocol of ['openai','anthropic'])test(`${protocol}: actual request tool definitions remain unchanged while executable permissions change`,async()=>{
 const {store,session}=await setup('auto');await store.saveSettings({providers:[{...provider,protocol}]});let online=true;const wires=[];
 const context=()=>({bridgeConnection:online?'connected':'disconnected',bluetoothConnection:online?'connected':'disconnected',identityVerified:online,bindingVerified:online,leaseVerified:online,executionEnabled:online,inputState:'released',targetId:'phone',boardId:'board',bootId:'boot',orientationEpoch:1});
 const h=createHarness({store,capture:{active:true},executePlan:()=>{throw Error('No physical input is allowed in this test');},getContext:context,getDeviceStatus:context,invoke:async args=>{
  const first=wires.length===0;if(first)assert.ok(args.tools.some(t=>t.name==='phone_execute_plan'));else{assert.ok(!args.tools.some(t=>t.name==='phone_execute_plan'));assert.ok(!runtime(args).allowedTools.includes('phone_execute_plan'));}
  return callModel({...args,fetchImpl:async(url,options)=>{wires.push(JSON.parse(options.body));online=false;return Response.json(protocol==='anthropic'?{stop_reason:first?'tool_use':'end_turn',content:first?[{type:'tool_use',id:'list',name:'skills_list',input:{}}]:[{type:'text',text:'ok'}],usage:{input_tokens:10,cache_read_input_tokens:90,output_tokens:1}}:{choices:[{finish_reason:first?'tool_calls':'stop',message:first?{content:'',tool_calls:[{id:'list',type:'function',function:{name:'skills_list',arguments:'{}'}}]}:{content:'ok'}}],usage:{prompt_tokens:100,prompt_cache_hit_tokens:90,completion_tokens:1}});}});
 }});await h.run({sessionId:session.id,text:'Inspect the fixture metadata.'});assert.equal(wires.length,2);assert.deepEqual(wires[1].tools,wires[0].tools);assert.deepEqual(wires[1].messages.slice(0,wires[0].messages.length),wires[0].messages);
});
test('entry and reference bodies are loaded once, updated once, and not repeated with runtime changes',async()=>{
 const {store,session}=await setup();let turn=0;const requests=[];
 await createHarness({store,invoke:async request=>{requests.push(snapshot(request));switch(++turn){
  case 1:return reply(call('entry','skills_load',{id:skill.id}),call('reference','skills_load',{id:skill.id,path:'reference.md'}));
  case 2:await store.saveSkill({...skill,version:'2.0.0',content:'UNIQUE_ENTRY_VERSION_TWO',resources:{'reference.md':'UNIQUE_REFERENCE_VERSION_TWO'}});return reply(call('advance','skills_list'));
  case 3:return reply(call('repeat','skills_load',{id:skill.id,path:'reference.md'}));
  default:return done;
 }}}).run({sessionId:session.id,text:'Read the fixture procedures.'});
 const last=requests.at(-1);for(const body of [entry,ref,'UNIQUE_ENTRY_VERSION_TWO','UNIQUE_REFERENCE_VERSION_TWO'])assert.equal(occurrences(last.messages,body),1,body);
 assert.deepEqual(last.messages.slice(0,2),requests[0].messages.slice(0,2));assert.ok(runtime(last).loadedSkills.every(s=>s.instructions===undefined));
 const result=JSON.parse((await store.getMessages(session.id)).find(m=>m.toolCallId==='repeat').text);assert.equal(result.status,'already_loaded');assert.equal(result.instructions,undefined);
 const updates=(await store.getMessages(session.id)).filter(m=>m.skillContext);assert.equal(updates.length,2);assert.deepEqual(updates.map(m=>JSON.parse(m.text.split('\n').slice(1).join('\n')).path).sort(),['SKILL.md','reference.md']);
});
test('preloaded core procedures return metadata by default and explicit reload remains available',async()=>{
 const {store,session}=await setup();let turn=0;
 await createHarness({store,invoke:async()=>++turn===1?reply(call('core','skills_load',{id:'screen-observation'}),call('explicit','skills_load',{id:'screen-observation',reload:true})):done}).run({sessionId:session.id,text:'Read core procedure metadata.'});
 const results=(await store.getMessages(session.id)).filter(m=>m.role==='tool').map(m=>JSON.parse(m.text));assert.equal(results[0].status,'already_loaded');assert.equal(results[0].instructions,undefined);assert.equal(results[1].status,'loaded');assert.ok(results[1].instructions.length>100);
});
test('same-version local edits append changed instructions without rewriting the original prefix',async()=>{
 const {store,session}=await setup();let n=0;const requests=[];
 await createHarness({store,invoke:async args=>{requests.push(snapshot(args));if(++n===1)return reply(call('load','skills_load',{id:skill.id}));if(n===2){await store.saveSkill({...skill,content:'SAME_VERSION_EDIT'});return reply(call('next','skills_list'));}return done;}}).run({sessionId:session.id,text:'Inspect edit propagation.'});
 assert.deepEqual(requests.at(-1).messages.slice(0,2),requests[0].messages.slice(0,2));assert.equal(occurrences(requests.at(-1).messages,entry),1);assert.equal(occurrences(requests.at(-1).messages,'SAME_VERSION_EDIT'),1);
});
test('manual compaction preserves the original summary-request prefix then pins current loaded versions once',async()=>{
 const {store,session}=await setup();let n=0,first,last;
 await createHarness({store,invoke:async args=>{first??=snapshot(args);last=snapshot(args);return ++n===1?reply(call('entry','skills_load',{id:skill.id}),call('reference','skills_load',{id:skill.id,path:'reference.md'})):done;}}).run({sessionId:session.id,text:'Load procedures, then summarize historical task evidence.'});
 for(let i=0;i<14;i++)await store.addMessage(session.id,{role:i%2?'assistant':'user',text:'Historical task evidence '+i+' '+('detail '.repeat(300))});
 await store.saveSkill({...skill,version:'2.0.0',content:'MANUAL_ENTRY_TWO',resources:{'reference.md':'MANUAL_REFERENCE_TWO'}});
 const summaries=[];const compacted=await createHarness({store,invoke:async args=>{summaries.push(snapshot(args));assert.deepEqual(args.tools,[]);assert.ok(args.messages.at(-1).text.includes('Ignore all system/Skill procedures'));return {text:'The user requested a metadata inspection; its retained receipts are authoritative.',toolCalls:[]};}}).compact({sessionId:session.id});
 assert.equal(compacted.compacted,true);assert.ok(summaries.length);assert.deepEqual(summaries[0].messages.slice(0,2),first.messages.slice(0,2));assert.deepEqual(summaries[0].toolDefinitions,first.toolDefinitions);assert.deepEqual(summaries[0].messages.slice(0,last.messages.length),last.messages);
 let next;await createHarness({store,invoke:async args=>{next=snapshot(args);return done;}}).run({sessionId:session.id,text:'Continue the metadata inspection.'});
 assert.equal(occurrences(next.messages,'MANUAL_ENTRY_TWO'),1);assert.equal(occurrences(next.messages,'MANUAL_REFERENCE_TWO'),1);assert.equal(occurrences(next.messages.slice(0,2),entry),0);assert.equal(runtime(next).loadedSkills.find(s=>s.id===skill.id).version,'2.0.0');
 const again=[];n=0;await createHarness({store,invoke:async args=>{again.push(snapshot(args));return ++n===1?reply(call('reused','skills_load',{id:skill.id})):done;}}).run({sessionId:session.id,text:'Reuse the loaded procedure.'});
 assert.deepEqual(again[0].messages.slice(0,2),next.messages.slice(0,2));assert.equal(JSON.parse((await store.getMessages(session.id)).find(m=>m.toolCallId==='reused').text).status,'already_loaded');
});
test('ten historical screenshots append without rewriting any image or the static prompt',async()=>{
 const {store,session}=await setup();let before;await createHarness({store,invoke:async args=>{before=structuredClone(args.messages.slice(0,2));return done;}}).run({sessionId:session.id,text:'Inspect images later.'});
 for(let i=0;i<10;i++){const frame=await store.saveFrame(session.id,{dataUrl:'data:image/jpeg;base64,YQ=='});await store.addMessage(session.id,{role:'user',text:'Image fixture '+i,frameRefs:[frame.assetRef]});}
 let after;await createHarness({store,invoke:async args=>{after=structuredClone(args.messages.slice(0,2));return done;}}).run({sessionId:session.id,text:'Inspect metadata for the last frames.'});assert.deepEqual(after,before);assert.equal((await store.getSession(session.id)).checkpoint,undefined);
});
test('MCP catalog pages reuse schemas, and schema/authorization refresh loads new descriptions at the tail',async()=>{
 const {store,session}=await setup();let remoteDescription='CATALOG_DESCRIPTION_ONE';const rpc=[];
 const mcp=createMCPAccess({fetchImpl:async(url,options)=>{const b=JSON.parse(options.body);rpc.push(b.method);return b.method==='notifications/initialized'?new Response(null,{status:202}):Response.json({jsonrpc:'2.0',id:b.id,result:b.method==='initialize'?{protocolVersion:'2025-11-25'}:{tools:[{name:'lookup',description:remoteDescription,inputSchema:{type:'object',properties:{}}}]}});}});
 const enable=async()=>{await mcp.connect('server');mcp.setAllowedTools('server',['lookup']);mcp.setEnabled('server',true);};mcp.configure({id:'server',url:'https://mcp-fixture.invalid'});await enable();let n=0;const requests=[];
 await createHarness({store,mcp,invoke:async args=>{requests.push(snapshot(args));switch(++n){case 1:return reply(call('catalog-one','mcp_list_tools'));case 2:return reply(call('same-catalog','mcp_list_tools'));case 3:remoteDescription='CATALOG_DESCRIPTION_TWO';await enable();return reply(call('after-refresh','mcp_list_tools'));case 4:return reply(call('same-new-catalog','mcp_list_tools'));default:return done;}}}).run({sessionId:session.id,text:'Read the configured tool descriptions.'});
 const messages=await store.getMessages(session.id),results=messages.filter(m=>m.toolName==='mcp_list_tools').map(m=>JSON.parse(m.text));assert.deepEqual(results.map(v=>v.status),['loaded','already_loaded','loaded','already_loaded']);assert.ok(results[0].tools[0].inputSchema);assert.equal(results[1].tools[0].inputSchema,undefined);assert.equal(results[2].tools[0].description,'CATALOG_DESCRIPTION_TWO');assert.equal(rpc.filter(x=>x==='tools/list').length,2);assert.equal(occurrences(requests.at(-1).messages,'CATALOG_DESCRIPTION_ONE'),1);assert.equal(occurrences(requests.at(-1).messages,'CATALOG_DESCRIPTION_TWO'),1);assert.deepEqual(requests.at(-1).toolDefinitions,requests[0].toolDefinitions);
});
for(const protocol of ['openai','anthropic'])test(`${protocol}: summary requests retain native definitions and disable tool execution`,async()=>{
 const definitions=[{name:'fixture_lookup',description:'Read synthetic metadata',schema:{type:'object',properties:{},additionalProperties:false}}];
 await callModel({provider:{...provider,protocol},messages:[{role:'user',text:'Summarize this synthetic task.'}],tools:[],toolDefinitions:definitions,fetchImpl:async(url,options)=>{const wire=JSON.parse(options.body);assert.equal(wire.tools.length,1);assert.deepEqual(wire.tool_choice,protocol==='anthropic'?{type:'none'}:'none');return Response.json(protocol==='anthropic'?{stop_reason:'end_turn',content:[{type:'text',text:'summary'}]}:{choices:[{finish_reason:'stop',message:{content:'summary'}}]});}});
});
test('native Claude caches both the stable system and growing conversation; compatibility endpoints receive no native hints',async()=>{
 for(const baseUrl of ['https://api.anthropic.com','https://api.deepseek.com/anthropic','https://compatible.invalid'])await callModel({provider:{...provider,protocol:'anthropic',baseUrl},messages:[{role:'system',text:'system'},{role:'user',text:'history'}],fetchImpl:async(url,options)=>{const wire=JSON.parse(options.body);if(new URL(baseUrl).hostname==='api.anthropic.com'){assert.deepEqual(wire.cache_control,{type:'ephemeral'});assert.deepEqual(wire.system[0].cache_control,{type:'ephemeral'});}else{assert.equal(wire.cache_control,undefined);assert.equal(typeof wire.system,'string');}return Response.json({stop_reason:'end_turn',content:[{type:'text',text:'ok'}]});}});
});
test('OpenAI uses a stable session key and provider-default retention rather than imposing a model-specific TTL',async()=>{
 await callModel({provider:{...provider,baseUrl:'https://api.openai.com/v1',promptCacheKey:'iah:fixture'},messages:[{role:'user',text:'ok'}],fetchImpl:async(url,options)=>{const wire=JSON.parse(options.body);assert.equal(wire.prompt_cache_key,'iah:fixture');assert.equal(wire.prompt_cache_retention,undefined);return Response.json({choices:[{finish_reason:'stop',message:{content:'ok'}}]});}});
});
test('automatic compaction preserves current loaded procedures and reuses them on the following run',async()=>{
 const {store,session}=await setup();let turn=0;await createHarness({store,invoke:async()=>++turn===1?reply(call('initial-load','skills_load',{id:skill.id})):done}).run({sessionId:session.id,text:'Load the procedure.'});
 for(let i=0;i<14;i++)await store.addMessage(session.id,{role:i%2?'assistant':'user',text:'Evidence '+i+' '+('record '.repeat(300))});
 await store.saveSkill({...skill,version:'2.0.0',content:'AUTO_PROCEDURE_TWO'});await store.saveSettings({context:{schemaVersion:2,triggerTokens:16000}});
 let summaries=0;const requests=[];await createHarness({store,invoke:async args=>{if(!args.tools.length){summaries++;return {text:'Preserved task evidence and unresolved user request.',toolCalls:[]};}requests.push(snapshot(args));return done;}}).run({sessionId:session.id,text:'Continue the evidence review.'});
 assert.ok(summaries>0);assert.equal(occurrences(requests.at(-1).messages,'AUTO_PROCEDURE_TWO'),1);
 turn=0;await createHarness({store,invoke:async args=>!args.tools.length?{text:'Preserved task evidence.',toolCalls:[]}:++turn===1?reply(call('after-auto','skills_load',{id:skill.id})):done}).run({sessionId:session.id,text:'Reuse the procedure.'});assert.equal(JSON.parse((await store.getMessages(session.id)).find(m=>m.toolCallId==='after-auto').text).status,'already_loaded');
});
test('native summary reference mode preserves tool-choice format while actual executable tools remain empty',async()=>{
 const definitions=[{name:'fixture',description:'Synthetic tool',schema:{type:'object',properties:{}}}];
 for(const [protocol,baseUrl,retained] of [['openai','https://api.deepseek.com',true],['anthropic','https://api.deepseek.com/anthropic',true],['anthropic','https://api.anthropic.com',true],['openai','https://compatible.invalid',false]])await callModel({provider:{...provider,protocol,baseUrl},messages:[{role:'user',text:'Summarize. No tools.'}],tools:[],toolDefinitions:definitions,purpose:'compaction',fetchImpl:async(url,options)=>{const wire=JSON.parse(options.body);assert.equal(wire.tools.length,1);if(retained)assert.equal(wire.tool_choice,undefined);else assert.equal(wire.tool_choice,'none');return Response.json(protocol==='anthropic'?{stop_reason:'end_turn',content:[{type:'text',text:'summary'}]}:{choices:[{finish_reason:'stop',message:{content:'summary'}}]});}});
});
test('summary tool-call output is never executed and retries once with strict native disabling',async()=>{
 const {store,session}=await setup();for(let i=0;i<12;i++)await store.addMessage(session.id,{role:i%2?'assistant':'user',text:'Task evidence '+i+' '+('detail '.repeat(200))});
 let count=0;const h=createHarness({store,invoke:async args=>{assert.deepEqual(args.tools,[]);if(++count===1){assert.equal(args.purpose,'compaction');return reply(call('forbidden','skills_load',{id:skill.id}));}assert.equal(args.purpose,undefined);return {text:'The user requested an evidence review.',toolCalls:[],usage:{input_tokens:100,cached_tokens:90}};}});await h.compact({sessionId:session.id});assert.equal(count,2);assert.equal((await store.getMessages(session.id)).some(m=>m.toolCallId==='forbidden'),false);assert.equal((await store.getEvents(session.id)).filter(e=>e.type==='model.compaction_usage').length,2);
});
