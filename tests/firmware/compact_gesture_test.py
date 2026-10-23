"""Compare production browser expansion with production MCU decoding."""
from pathlib import Path
import subprocess,tempfile,os
root=Path(__file__).resolve().parents[2]
js=r"""
import {compileGesture} from './apps/web/core/plan.js';
const steps=[{id:'a',op:'home'},{id:'a',op:'tap',point:{x:3900,y:9310},holdMs:80},{id:'a',op:'key',usage:4,modifiers:2,holdMs:100},...['swipe','drag'].flatMap(op=>[250,1000,op==='swipe'?3000:2700].map(t=>({id:'a',op,path:[{x:9000,y:7800,tMs:0},{x:5200,y:7000,tMs:Math.floor(t*.31)},{x:1000,y:7800,tMs:t}],...(op==='drag'?{endHoldMs:100}:{})})))];
const rows=[];for(const interval of [8,20,40,100])for(const step of steps){const r=compileGesture(step,{capabilities:{segmentEncoding:'gesture-v2',reportIntervalMs:interval,maxEvents:512}});rows.push(r);}console.log(JSON.stringify(rows));
"""
fixture=subprocess.check_output(['node','--input-type=module','-e',js],cwd=root)
source=r'''
#define IAH_MAX_EVENTS 512
#include "HEADER"
#include <fstream>
#include <cassert>
#include <iostream>
int main(int argc,char** argv){assert(argc==2);std::ifstream file(argv[1]);JsonDocument all;assert(!deserializeJson(all,file));unsigned cases=0;for(auto row:all.as<JsonArrayConst>()){iah::Segment s;assert(iah::expandGesture(row["gesture"],s));auto expected=row["events"].as<JsonArrayConst>();assert(s.count==expected.size());for(size_t i=0;i<s.count;i++){auto a=expected[i];auto& e=s.events[i];assert(e.atMs==a["atMs"].as<int>());if(a["kind"]=="pointer"){assert(e.kind==iah::Kind::Pointer&&e.buttons==a["buttons"].as<int>()&&e.x==a["x"].as<int>()&&e.y==a["y"].as<int>());}else if(a["kind"]=="keyboard"){assert(e.kind==iah::Kind::Keyboard&&e.modifiers==a["modifiers"].as<int>()&&e.count==a["usages"].size());for(size_t j=0;j<e.count;j++)assert(e.usages[j]==a["usages"][j].as<int>());}else assert(e.kind==iah::Kind::Consumer&&e.usage==a["usage"].as<int>());}cases++;}
for(const char* text:{R"(["path",100,0,250,20,[[0,0,0],[1,1,250]]])",R"(["path",100,40,250,20,[[0,0,0],[1,1,0]]])",R"(["tap",-1,500,100,80])",R"(["reports",[[0,0,2,500,500]]])",R"(["key",0,0,80])"}){JsonDocument d;assert(!deserializeJson(d,text));iah::Segment s;assert(!iah::expandGesture(d.as<JsonArrayConst>(),s));}std::cout<<cases<<" cross-language gesture vectors and malformed commands passed\n";}
'''.replace('HEADER',str(root/'firmware/IPhoneAutomationHarness/src/CompactGesture.h'))
with tempfile.TemporaryDirectory() as tmp:
 p=Path(tmp);(p/'a.cpp').write_text(source);(p/'a.json').write_bytes(fixture)
 cmd=['/Library/Developer/CommandLineTools/usr/bin/clang++','-std=c++17','-Wall','-Wextra','-Werror','-pedantic','-fsanitize=address,undefined','-isysroot','/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk','-nostdinc++','-isystem','/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/c++/v1','-I',str(Path.home()/'Documents/Arduino/libraries/ArduinoJson/src'),str(p/'a.cpp'),'-o',str(p/'a')]
 subprocess.run(cmd,check=True);subprocess.run([str(p/'a'),str(p/'a.json')],check=True)
