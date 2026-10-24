import test from 'node:test';
import assert from 'node:assert/strict';
import {keyboardInput,NAMED_KEYS} from '../../apps/web/core/keyboard.js';
import {compileGesture,executePhonePlan,validatePlan,actionSettleMs} from '../../apps/web/core/plan.js';
import {containsPasteInput,assertClipboardPasteReady} from '../../apps/web/core/clipboard-plan.js';
import {validateArguments} from '../../apps/web/core/control.js';
import {PLAN_SCHEMA} from '../../apps/web/core/assets.js';
const key=(value,id='key')=>({id,op:'key',key:value,modifiers:0,holdMs:60});
test('literal search letters resolve to the intended HID keys without model arithmetic',()=>{
  assert.deepEqual([... 'clock'].map(value=>keyboardInput(key(value)).usage),[6,15,18,6,14]);
  for(let i=0;i<26;i++){assert.deepEqual(keyboardInput(key(String.fromCharCode(97+i))),{usage:4+i,modifiers:0});assert.deepEqual(keyboardInput(key(String.fromCharCode(65+i))),{usage:4+i,modifiers:2});}
  assert.deepEqual([...'1234567890'].map(value=>keyboardInput(key(value)).usage),[30,31,32,33,34,35,36,37,38,39]);
});
test('literal and numeric key forms compile identically on both bridge encodings',()=>{
  for(const segmentEncoding of ['gesture-v2',undefined])for(const value of ['o','O','0',' ','Enter','ArrowLeft']){
    const input=key(value),legacy={...input,...keyboardInput(input)};delete legacy.key;
    assert.deepEqual(compileGesture(input,{capabilities:{segmentEncoding}}),compileGesture(legacy,{capabilities:{segmentEncoding}}));
    validateArguments(input,PLAN_SCHEMA.$defs.key,PLAN_SCHEMA);validateArguments(legacy,PLAN_SCHEMA.$defs.key,PLAN_SCHEMA);
  }
  for(const value of NAMED_KEYS)validateArguments(key(value),PLAN_SCHEMA.$defs.key,PLAN_SCHEMA);
});
test('literal keys preserve the clipboard copy gate for paste shortcuts',()=>{
  for(const input of [{...key('v'),modifiers:8},{...key('V'),modifiers:16},{...key('Insert'),modifiers:2}]){
    assert.equal(containsPasteInput({steps:[input]}),true);
    assert.throws(()=>assertClipboardPasteReady({status:'pending'},{sessionId:'s',targetId:'p'},{steps:[input]}),{code:'CLIPBOARD_COPY_REQUIRED'});
    assert.doesNotThrow(()=>assertClipboardPasteReady({status:'copied',sessionId:'s',targetId:'p'},{sessionId:'s',targetId:'p'},{steps:[input]}));
  }
});
test('ambiguous and unsupported keys are rejected before any device submission',async()=>{
  for(const input of [{...key('o'),usage:12},key('时钟'),key('oo'),key('__proto__'),key(''),{...key('o'),modifiers:-1}])assert.throws(()=>compileGesture(input));
  assert.throws(()=>validateArguments({...key('o'),usage:12},PLAN_SCHEMA.$defs.key,PLAN_SCHEMA));
});
test('literal text keys remain one released batch rather than separate device round trips',async()=>{
  const context={boardId:'board',bootId:'boot',targetId:'phone',clientId:'client',leaseId:'lease',orientationEpoch:1,mode:'task',identityVerified:true,bindingVerified:true,leaseVerified:true,executionEnabled:true,inputState:'released',knownFrames:new Map([['frame',{targetId:'phone',orientationEpoch:1}]]),capabilities:{operations:['key'],segmentEncoding:'gesture-v2'},pollIntervalMs:0};
  const plan={version:1,planId:'literal-input',sessionId:'session',boardId:'board',targetId:'phone',basedOnFrameId:'frame',orientationEpoch:1,ttlMs:15000,maxExecutionMs:15000,steps:[...'clock'].map((value,i)=>key(value,'key-'+i))};
  assert.equal(validatePlan(plan,context).valid,true);validateArguments(plan,PLAN_SCHEMA,PLAN_SCHEMA);
  const sent=[];const device={async submitSegment(s){sent.push(s);return {...s,status:'hid_submitted',releaseSubmitted:true};},async getResult(){throw Error('No polling needed');},async release(){throw Error('No failure cleanup needed');}};
  const result=await executePhonePlan(plan,{context,device,sleep:async()=>{}});assert.equal(result.status,'completed');assert.equal(result.inputState,'released');assert.equal(sent.length,1);
  assert.deepEqual(sent[0].gesture[1].filter(event=>event[1]===1&&event[3].length).map(event=>event[3][0]),[6,15,18,6,14]);assert.deepEqual(sent[0].gesture[1].at(-1).slice(1),[1,0,[]]);
});
test('schema timing guidance matches the actual Home default',()=>{
  for(const definition of Object.values(PLAN_SCHEMA.$defs))for(const branch of definition.oneOf||[definition])if(branch.properties?.settleMs)assert.ok(branch.properties.settleMs.description.includes('home '+actionSettleMs({op:'home'})));
});
