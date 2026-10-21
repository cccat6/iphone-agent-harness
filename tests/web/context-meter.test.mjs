import test from 'node:test';
import assert from 'node:assert/strict';
import {contextMeterValues,mountContextMeter} from '../../apps/web/ui/context-meter.js';
import {CONTEXT_METER_MESSAGES} from '../../apps/web/locales/context-meter.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(options={}){
 const elements=new Map(),listeners=new Map(),events=[],rect={left:20,top:600,width:60,height:30},node=selector=>{if(!elements.has(selector))elements.set(selector,{hidden:selector==='.context-meter-popup',style:{},classList:{toggle(){}},setAttribute(key,value){this[key]=value;},getBoundingClientRect:()=>selector==='.context-meter-popup'?{width:292,height:240}:rect,focus(){this.focused=true;}});return elements.get(selector);};
 const doc={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},win={innerWidth:390,innerHeight:844,addEventListener(){},removeEventListener(){}},root={ownerDocument:doc,getBoundingClientRect:()=>rect,closest:()=>options.composer,innerHTML:'',querySelector:node,classList:{toggle(){}},contains:target=>[...elements.values()].includes(target),replaceChildren(){this.innerHTML='';}};
 Object.assign(doc,options.document);Object.assign(win,options.window);
 let reads=0,compactions=0;const meter=mountContextMeter(root,{inspect:async args=>{reads++;return options.inspect?options.inspect(args):{usedTokens:2500,capacityTokens:10000,source:'estimated'};},compact:async args=>{compactions++;return options.compact?options.compact(args):{compacted:true,metrics:{usedTokens:1000,capacityTokens:10000,source:'estimated'}};},onBusy:flag=>events.push(flag),t:(key,args={})=>Object.entries(args).reduce((s,[k,v])=>s.replace('{'+k+'}',v),CONTEXT_METER_MESSAGES.en[key]),locale:()=> 'en',document:doc,window:win});return {meter,node,listeners,events,root,rect,get reads(){return reads;},get compactions(){return compactions;}};
}
test('capacity comes only from model metadata; estimates never substitute the compression threshold',()=>{
 assert.deepEqual(contextMeterValues({usedTokens:5000,triggerTokens:750000}),{used:5000,capacity:null,remaining:null,percent:null,estimated:true});assert.equal(contextMeterValues({usedTokens:12000,capacityTokens:10000}).percent,120);assert.equal(contextMeterValues({usedTokens:12000,capacityTokens:10000}).remaining,0);
});
test('unknown capacity shows token count and unknown total while the popup closes outside without an X',async()=>{
 const f=fixture({inspect:async()=>({usedTokens:5000,capacityTokens:null,source:'estimated'})});f.meter.setContext({sessionId:'s',modelId:'p::m',busy:false});await tick();assert.equal(f.node('.context-meter-progress').style.strokeDasharray,'0 100');assert.equal(f.node('[data-context-used]').textContent,'≈5,000 tokens');assert.equal(f.node('[data-context-capacity]').textContent,'—');assert.equal(f.node('[data-context-remaining]').textContent,'—');assert.equal(f.node('[data-context-unknown]').hidden,false);f.node('.context-meter-button').onclick();assert.equal(f.node('.context-meter-popup').hidden,false);f.listeners.get('pointerdown')({target:f.node('.context-compact-button')});assert.equal(f.node('.context-meter-popup').hidden,false);f.listeners.get('pointerdown')({target:{}});assert.equal(f.node('.context-meter-popup').hidden,true);assert.doesNotMatch(f.root.innerHTML,/close-button|>×<|data-context-label|data-context-tokens/);assert.equal(f.node('[data-context-compact-label]').textContent,'Compact now');f.meter.dispose();
});
test('window occupancy is estimated and actual prior input stays a separate labeled detail',async()=>{
 const f=fixture();f.meter.setContext({sessionId:'s',modelId:'p::m',busy:false});await tick();f.meter.accept({sessionId:'s',snapshot:{source:'last_request',usedTokens:2000,lastRequestInputTokens:2000,capacityTokens:10000}});assert.equal(f.node('.context-meter-progress').style.strokeDasharray,'25 100');assert.equal(f.node('[data-context-source]').textContent,'Estimated');assert.match(f.node('[data-context-remaining]').textContent,/7,500 tokens · 75%/);assert.equal(f.node('[data-context-used]').textContent,'≈2,500 tokens · 25%');assert.match(f.node('[data-context-last]').textContent,/Last request input: 2,000/);f.meter.accept({sessionId:'other',snapshot:{usedTokens:9000,capacityTokens:10000}});assert.equal(f.node('.context-meter-progress').style.strokeDasharray,'25 100');f.meter.dispose();
});
test('busy or draft context cannot compact; a successful explicit click updates the snapshot once',async()=>{
 const f=fixture();f.meter.setContext({sessionId:null,modelId:'p::m',busy:false});await tick();assert.equal(f.node('.context-compact-button').disabled,true);f.meter.setContext({sessionId:'s',modelId:'p::m',busy:true});await tick();assert.equal(f.node('.context-compact-button').disabled,true);await f.node('.context-compact-button').onclick();assert.equal(f.compactions,0);f.meter.setContext({sessionId:'s',modelId:'p::m',busy:false});await tick();await f.node('.context-compact-button').onclick();assert.equal(f.compactions,1);assert.deepEqual(f.events,[true,false]);assert.equal(f.node('.context-meter-progress').style.strokeDasharray,'10 100');f.meter.dispose();
});
test('compaction failure preserves displayed data and allows retry',async()=>{
 const f=fixture({compact:async()=>{throw Error('Synthetic failure');}});f.meter.setContext({sessionId:'s',modelId:'p::m',busy:false});await tick();await f.node('.context-compact-button').onclick();assert.equal(f.node('.context-meter-progress').style.strokeDasharray,'25 100');assert.match(f.node('[data-context-status]').textContent,/Synthetic failure/);assert.equal(f.node('.context-compact-button').disabled,false);f.meter.dispose();
});
test('changing sessions aborts pending work and rejects late snapshots',async()=>{
 const gate=deferred();let signal;const f=fixture({inspect:args=>{signal=args.signal;return gate.promise;}});f.meter.setContext({sessionId:'s',modelId:'p::m',busy:false});const previous=signal;f.meter.setContext({sessionId:'next',modelId:'p::m',busy:false});assert.equal(previous.aborted,true);f.meter.dispose();gate.resolve({usedTokens:999,capacityTokens:1000});await tick();assert.equal(f.root.innerHTML,'');assert.equal(f.listeners.size,0);
});
test('all eight languages expose the same nonempty context labels',()=>{const keys=Object.keys(CONTEXT_METER_MESSAGES.en);assert.equal(Object.keys(CONTEXT_METER_MESSAGES).length,8);for(const row of Object.values(CONTEXT_METER_MESSAGES)){assert.deepEqual(Object.keys(row),keys);assert.ok(Object.values(row).every(value=>typeof value==='string'&&value.length));}});

test('popup remains anchor-relative while the app animates beyond stale keyboard viewport bounds',async()=>{
 let onLayout,disconnected=false;const observed=[];
 const bounds={left:0,top:0,width:402,height:383},app={getBoundingClientRect:()=>bounds},composer={};
 const f=fixture({composer,document:{getElementById:()=>app},window:{visualViewport:{height:383,width:402,addEventListener(){},removeEventListener(){}},ResizeObserver:class{constructor(fn){onLayout=fn;}observe(node){observed.push(node);}disconnect(){disconnected=true;}}}});
 f.rect.top=330;f.meter.setContext({sessionId:'s',modelId:'m'});await tick();f.node('.context-meter-button').onclick();
 const popup=f.node('.context-meter-popup');assert.equal(popup.style.left,'0px');assert.equal(popup.style.maxHeight,'308px');assert.equal(popup.style.top,undefined);
 for(const height of [450,520,630,714]){bounds.height=height;f.rect.top=height-53;onLayout();assert.equal(popup.style.maxHeight,(height-75)+'px');assert.equal(popup.style.top,undefined);}
 // A panned app keeps the same available space in its own coordinate system.
 bounds.top=-100;f.rect.top-=100;onLayout();assert.equal(popup.style.maxHeight,'639px');
 // Narrow / landscape layouts constrain the card instead of clipping its content.
 bounds.width=260;bounds.top=0;f.rect.top=160;f.rect.left=220;onLayout();assert.equal(popup.style.width,'236px');assert.equal(popup.style.left,'-208px');assert.equal(popup.style.maxHeight,'138px');
 f.meter.hide();f.rect.top=200;onLayout();assert.equal(popup.style.maxHeight,'138px');
 assert.deepEqual(observed,[app,composer,f.root]);f.meter.dispose();assert.equal(disconnected,true);onLayout();
});
