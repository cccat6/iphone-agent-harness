import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
const scripts=Object.fromEntries(['helper','setup'].map(name=>[name,fs.readFileSync(`${process.argv[2]}/${name}.html`,'utf8').match(/<script>([\s\S]*)<\/script>/)[1]]));
function environment(languages=['en'],hash=''){
 const nodes=new Map();
 const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{hidden:true,disabled:false,textContent:'',querySelector:s=>node(selector+' '+s)});return nodes.get(selector);};
 const context={navigator:{languages},location:{hash,pathname:'/harness-link'},history:{replaceState(){}},window:{opener:{postMessage(){},focus(){}}},document:{documentElement:{},querySelector:node,addEventListener(){}},crypto:webcrypto,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,AbortController,setTimeout,clearTimeout,addEventListener(){},console};
 vm.createContext(context);return {context,node};
}
for(const [languages,expected] of [[['zh-TW'],'zh-Hant'],[['zh_HK'],'zh-Hant'],[['zh-CN'],'zh-Hans'],[['xx','de-AT'],'de'],[['xx'],'en'],[['fr-CA'],'fr']])for(const script of Object.values(scripts)){
 const {context}=environment(languages);vm.runInContext(script,context);assert.equal(context.document.documentElement.lang,expected);
}
for(const locale of ['en','zh-Hans','zh-Hant','ja','ru','de','fr','es']){
 const {context}=environment(['en'],`#nonce=${'a'.repeat(32)}&lang=${encodeURIComponent(locale)}`);vm.runInContext(scripts.helper,context);assert.equal(context.document.documentElement.lang,locale);
}
// Exercise production AP JS over a failed attempt followed by a fresh attempt.
// Responses are deliberately inconsistent until all success gates are present.
const {context,node}=environment(['zh-TW']);let now=1800000000000,attempt=0,poll=0,finish=0;
const calls=[];
Object.assign(context,{Date:{now:()=>now},btoa,FormData:class{*[Symbol.iterator](){yield ['ssid','fixture-r3'];yield ['password','fixture-only'];}},setTimeout(fn,delay){if(delay===800){now+=delay;queueMicrotask(fn);}return 1;},clearTimeout(){},fetch:async(path,options)=>{
 calls.push({path,options});assert.equal(options.cache,'no-store');assert.ok(options.signal instanceof AbortSignal);
 if(path==='/configure'){attempt++;poll=0;const body=JSON.parse(options.body);assert.equal(body.setupPassword,'b'.repeat(64));assert.equal(body.origin,'https://igent.cc');assert.equal(body.ssid,'fixture-r3');return Response.json({accepted:true},{status:202});}
 if(path==='/finish'){finish++;assert.equal(attempt,2);assert.equal(poll,5);assert.equal(JSON.parse(options.body).setupPassword,'b'.repeat(64));return Response.json({configured:true});}
 assert.equal(path,'/connection-status');poll++;
 if(attempt===1)return Response.json({status:'failed',configured:false});
 if(poll===1)throw Error('simulated temporary transport failure');
 if(poll===2)return Response.json({status:'connected',configured:true},{status:503});
 if(poll===3)return Response.json({status:'connected',configured:false});
 if(poll===4)return Response.json({status:'connecting',configured:true});
 return Response.json({status:'connected',configured:true,httpUrl:'http://r3.local',boardId:'iah-r3'});
}});
vm.runInContext(scripts.setup,context);
await vm.runInContext('f.onsubmit({preventDefault(){}})',context);assert.equal(finish,0);assert.equal(node('#back').hidden,true);assert.equal(node('#f button').disabled,false);
await vm.runInContext('f.onsubmit({preventDefault(){}})',context);assert.equal(finish,1);assert.equal(node('#back').hidden,false);
const url=new URL(node('#back').href);assert.equal(url.origin,'https://igent.cc');assert.deepEqual(JSON.parse(Buffer.from(url.hash.split('=')[1],'base64url')),{v:1,url:'http://r3.local',id:'iah-r3',owner:'b'.repeat(64)});
assert.equal(calls.filter(c=>c.path==='/configure').length,2);
console.log('R3: production rendered JS language aliases/fallback/8 forced locales and failed-then-successful AP retry with transient/inconsistent status responses passed');
