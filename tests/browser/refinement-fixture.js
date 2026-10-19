// Disposable local acceptance fixture: production app, synthetic providers/capture.
import {openStore} from '/apps/web/core/store.js';
import {screenCapture} from '/apps/web/core/capture.js';
import {saveProviderCredential} from '/apps/web/core/credentials.js';
const store=await openStore();
if(!(await store.listSessions()).length){
 await store.saveSettings({providers:[{id:'fixture',name:'Test API',protocol:'openai',baseUrl:'https://model.example/v1',model:'synthetic-flash',models:[{id:'synthetic-flash'},{id:'synthetic-pro'}],stream:true}],activeProviderId:'fixture'});
 await saveProviderCredential(store,'fixture',{kind:'api',apiKey:'synthetic-not-a-real-key'});
 const session=await store.createSession({title:'交互验收',mode:'auto',modelId:'fixture::synthetic-flash'});
 const canvas=new OffscreenCanvas(390,844),ctx=canvas.getContext('2d');ctx.fillStyle='#edf3ef';ctx.fillRect(0,0,390,844);ctx.fillStyle='#173e36';ctx.font='28px system-ui';ctx.fillText('Screen fixture',60,200);const blob=await canvas.convertToBlob({type:'image/jpeg'});const frame=await store.saveFrame(session.id,{blob,frameId:'fixture-frame',width:390,height:844});
 await store.addMessage(session.id,{role:'user',text:'请检查一下屏幕。'});
 await store.addMessage(session.id,{role:'assistant',text:'我会先查看当前屏幕。'});
 await store.addMessage(session.id,{role:'tool',toolName:'phone_observe',text:JSON.stringify({status:'captured',frames:[{frameId:'fixture-frame'}]}),frameRefs:[frame.assetRef]});
 await store.addMessage(session.id,{role:'user',text:'Harness runtime context: debug-only fixture',internal:true});
 await store.addMessage(session.id,{role:'assistant',text:'屏幕已查看。你可以继续提问或让我制定计划。'});
}
await store.saveSettings({deviceEndpoint:'http://fixture.local',deviceBoardId:'fixture-board',deviceRTC:{ip:'192.168.0.200',port:18948,fingerprint:'ab'.repeat(32)}});
store.close();
let track;screenCapture.start=async()=>{track={readyState:'live',stop(){this.readyState='ended';}};screenCapture.stream={getVideoTracks:()=>[track],getTracks:()=>[track]};qa.captureStarts=(qa.captureStarts||0)+1;return screenCapture.stream;};
const originalFetch=window.fetch;window.fetch=async(input,options={})=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href);
 if(url.hostname==='model.example'&&url.pathname.endsWith('/chat/completions')){
  const request=JSON.parse(options.body),text=request.messages.filter(m=>m.role==='user').map(m=>typeof m.content==='string'?m.content:'').join('\n');
  const proposal=text.includes('计划'),message=proposal?{role:'assistant',content:'可以，先制定计划，等你选择执行。',tool_calls:[{id:'proposal-'+Date.now(),type:'function',function:{name:'task_plan',arguments:JSON.stringify({goal:'设置明天早上七点的闹钟',steps:['打开时钟的闹钟页面','优先使用数字输入设置七点','确认明天和七点后保存']})}}]}:{role:'assistant',content:'可以。我可以先说明方法，也可以在你明确要求执行后操作手机。'};
  if(!request.stream)return Response.json({choices:[{message,finish_reason:proposal?'tool_calls':'stop'}]});
  const encoder=new TextEncoder(),chunks=message.tool_calls?[{choices:[{index:0,delta:{content:message.content,tool_calls:message.tool_calls.map((c,index)=>({...c,index}))},finish_reason:null}]}]:message.content.match(/.{1,7}/gu).map(content=>({choices:[{index:0,delta:{content},finish_reason:null}]}));
  return new Response(new ReadableStream({async start(controller){for(const chunk of chunks){if(options.signal?.aborted){controller.error(new DOMException('Aborted','AbortError'));return;}controller.enqueue(encoder.encode('data: '+JSON.stringify(chunk)+'\n\n'));await new Promise(r=>setTimeout(r,40));}controller.enqueue(encoder.encode('data: '+JSON.stringify({choices:[{index:0,delta:{},finish_reason:proposal?'tool_calls':'stop'}]})+'\n\ndata: [DONE]\n\n'));controller.close();}}),{headers:{'content-type':'text/event-stream'}});
 }
 return originalFetch(input,options);
};
await import('/apps/web/app.js');
