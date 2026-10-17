// Explicit synthetic live smoke test. No screen, hardware, or response content is logged.
import {readFile,writeFile} from 'node:fs/promises';
import {openStore} from '../apps/web/core/store.js';
import {createHarness} from '../apps/web/core/harness.js';
import {callModel} from '../apps/web/core/providers.js';
import {setCredential,clearCredentials} from '../apps/web/core/credentials.js';
if(!process.argv.includes('--live'))throw new Error('Use --live only with an authorized local test credential');
const config=JSON.parse(await readFile(new URL('../research/background-api/credentials.local.json',import.meta.url),'utf8'));
if(!config.key)throw new Error('No local test credential');
const cases=[];
for(const protocol of ['openai','anthropic']){
  const store=await openStore({memory:true});const provider={id:'synthetic-smoke',protocol,baseUrl:protocol==='openai'?'https://api.deepseek.com':'https://api.deepseek.com/anthropic',model:'deepseek-flash',stream:true,maxTokens:4096,timeoutMs:60000};
  await store.saveSettings({providers:[provider],activeProviderId:provider.id});setCredential(provider.id,config.key);const session=await store.createSession({mode:'plan'});let requests=0;
  const harness=createHarness({store,maxSteps:5,maxDurationMs:120000,invoke:options=>{requests++;return callModel({...options,fetchImpl:(url,init)=>{const body=JSON.parse(init.body);return fetch(url,{...init,body:JSON.stringify(body)});}});}});
  const start=performance.now();try{
    await harness.run({sessionId:session.id,mode:'plan',text:'这是纯软件功能验收。先调用 skills_list 查看可用技能，然后调用 skills_load 加载 screen-observation，最后用一句中文说明该技能做什么。不要调用 phone_observe，不要请求共享，不操作设备。'});
    const messages=await store.getMessages(session.id),names=messages.flatMap(m=>(m.toolCalls||[]).map(c=>c.name));const valid=names.includes('skills_list')&&names.includes('skills_load')&&!names.includes('phone_execute_plan');
    cases.push({protocol,model:provider.model,passed:valid,modelRequests:requests,toolNames:names,elapsedMs:Math.round(performance.now()-start),messageCount:messages.length,opaqueStateMessages:messages.filter(m=>m.providerState).length});
  }catch{cases.push({protocol,passed:false,modelRequests:requests,elapsedMs:Math.round(performance.now()-start),error:'live_harness_smoke_failed'});process.exitCode=1;}
  clearCredentials();store.close();
}
const result={checkedAt:new Date().toISOString(),environment:'Mac Node; synthetic Skill workflow, not iPhone or HID',cases};
await writeFile(new URL('../docs/research/harness-live-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));if(cases.some(c=>!c.passed))process.exitCode=1;
