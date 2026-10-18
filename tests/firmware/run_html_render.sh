#!/usr/bin/env sh
set -eu
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
json_include=${ARDUINOJSON_INCLUDE:-${1:-}}
if [ -z "$json_include" ] && [ -f "$HOME/Documents/Arduino/libraries/ArduinoJson/src/ArduinoJson.h" ]; then
 json_include="$HOME/Documents/Arduino/libraries/ArduinoJson/src"
fi
if [ ! -f "$json_include/ArduinoJson.h" ]; then
 echo 'Set ARDUINOJSON_INCLUDE to the pinned ArduinoJson 7.4.3 src directory.' >&2
 exit 2
fi
binary_path=$(mktemp "${TMPDIR:-/tmp}/iah-html-render-test.XXXXXX")
render_path=$(mktemp -d "${TMPDIR:-/tmp}/iah-html-output.XXXXXX")
trap 'rm -f "$binary_path"; rm -rf "$render_path"' EXIT HUP INT TERM
source_path="$project_root/tests/firmware/html_render_test.cpp"
if [ -n "${CXX:-}" ]; then
 "$CXX" -std=c++17 -Wall -Wextra -Werror -pedantic -I "$json_include" "$source_path" -o "$binary_path"
elif [ -x /Library/Developer/CommandLineTools/usr/bin/clang++ ] && [ -d /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/c++/v1 ]; then
 /Library/Developer/CommandLineTools/usr/bin/clang++ -std=c++17 \
  -isysroot /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk -nostdinc++ \
  -isystem /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/c++/v1 \
  -Wall -Wextra -Werror -pedantic -I "$json_include" "$source_path" -o "$binary_path"
else
 c++ -std=c++17 -Wall -Wextra -Werror -pedantic -I "$json_include" "$source_path" -o "$binary_path"
fi
"$binary_path" "$render_path"
node --input-type=commonjs - "$render_path" <<'JS'
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const locales=['en','zh-Hans','zh-Hant','ja','ru','de','fr','es'];
for(const name of ['helper','setup']){
 const html=fs.readFileSync(path.join(process.argv[2],name+'.html'),'utf8');if(process.env.HTML_RENDER_CAPTURE){fs.mkdirSync(process.env.HTML_RENDER_CAPTURE,{recursive:true});fs.writeFileSync(path.join(process.env.HTML_RENDER_CAPTURE,name+'.html'),html);}const script=html.match(/<script>([\s\S]*)<\/script>/)[1];new vm.Script(script);assert.ok(Buffer.byteLength(html)<10000,'local page must remain below 10 KB');
 for(const locale of locales){
  const fields=new Map();const element=selector=>{if(!fields.has(selector))fields.set(selector,{textContent:'',querySelector:sub=>element(selector+' '+sub)});return fields.get(selector);};
  const context={navigator:{languages:[locale],language:locale},window:{opener:{postMessage(){},focus(){}}},location:{hash:'#nonce='+('c'.repeat(32)),pathname:'/harness-link'},history:{replaceState(){}},document:{documentElement:{},querySelector:element,addEventListener(){}},crypto:require('node:crypto').webcrypto,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,AbortController,addEventListener(){},setTimeout,clearTimeout,f:element('form'),back:element('#back'),out:element('#out')};
  vm.createContext(context);vm.runInContext(script,context);assert.equal(context.document.documentElement.lang,locale);assert.equal(element('h1').textContent,vm.runInContext('pageMessages[language][0]',context));
  const keys=vm.runInContext('Object.keys(pageMessages)',context);assert.deepEqual(Array.from(keys).sort(),locales.toSorted());assert.ok(vm.runInContext('Object.values(pageMessages).every(row=>row.length==='+ (name==='helper'?5:7) +'&&row.every(text=>typeof text===\'string\'&&text.length))',context));
 }
 console.log(name+': actual rendered HTML script and eight localized DOMs pass, '+Buffer.byteLength(html)+' bytes');
}

(async()=>{
 const html=fs.readFileSync(path.join(process.argv[2],'setup.html'),'utf8'),script=html.match(/<script>([\s\S]*)<\/script>/)[1];
 for(const scenario of ['success','success-protected','join-failed','join-timeout','finish-refused']){
  let now=0,polls=0;const calls=[],fields=new Map(),element=selector=>{if(!fields.has(selector))fields.set(selector,{textContent:'',hidden:true,disabled:false,querySelector:sub=>element(selector+' '+sub)});return fields.get(selector);};
  const context={navigator:{languages:['en']},document:{documentElement:{},querySelector:element},Date:{now:()=>now},URLSearchParams,AbortController,FormData:class {*[Symbol.iterator](){yield ['ssid','fixture-network'];yield ['password','fixture-password'];}},Object,JSON,btoa,fetch:async(path,options)=>{calls.push(path);if(path==='/configure')return Response.json({accepted:true,status:'connecting'},{status:202});if(path==='/finish')return Response.json({configured:scenario!=='finish-refused'},{status:scenario==='finish-refused'?409:200});assert.equal(path,'/connection-status');polls++;if(scenario==='join-failed')return Response.json({status:'failed',configured:false});if(scenario==='join-timeout'||polls<2)return Response.json({status:'connecting',configured:false});return Response.json({status:'connected',configured:true,httpUrl:'http://fixture.local',boardId:'fixture-board',pairingCodeRequired:scenario==='success-protected'});},setTimeout(handler,delay){if(delay===800){now+=800;queueMicrotask(handler);}return 1;},clearTimeout(){}};
  vm.createContext(context);vm.runInContext(script,context);await vm.runInContext('f.onsubmit({preventDefault(){}})',context);
  if(scenario.startsWith('success')){assert.equal(calls.filter(p=>p==='/finish').length,1);assert.equal(polls,2);assert.equal(element('#back').hidden,false);assert.ok(element('#back').href.startsWith('https://igent.cc/#device='));const link=JSON.parse(Buffer.from(element('#back').href.split('#device=')[1],'base64url').toString());assert.equal(link.pairingCodeRequired,false);assert.equal(Object.hasOwn(link,'owner'),false);}
  else {assert.equal(element('#back').hidden,true);assert.equal(element('#f button').disabled,false);if(scenario!=='finish-refused')assert.equal(calls.includes('/finish'),false);}
 }
 console.log('Actual rendered Wi-Fi form: join-before-finish, failed join, bounded timeout and refused finish all pass');
})().catch(error=>{console.error(error);process.exitCode=1;});

JS

node "$project_root/tests/firmware/bridge_settings_page_test.mjs" "$render_path/settings.html"
