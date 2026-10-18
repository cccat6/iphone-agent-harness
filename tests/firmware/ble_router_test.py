#!/usr/bin/env python3
"""Extract and test the real BleSink/Core with a deterministic host-queue adapter."""
from pathlib import Path
import os, subprocess, tempfile
ROOT=Path(__file__).resolve().parents[2]
main=(ROOT/'firmware/IPhoneAutomationHarness/main.cpp').read_text()
peers=(main[main.index('struct Peer {'):main.index('enum class BleEventKind:')] + main[main.index('bool peerRouteMatches('):main.index('class BleSink:public Sink {')])
sink=main[main.index('class BleSink:public Sink {'):main.index('} sink;')+1]+';'
source=r'''
#include <atomic>
#include <cassert>
#include <cstdio>
#include <cstring>
#include <functional>
#include <thread>
#include <string>
#include <vector>
#include "CORE_HEADER"
using namespace iah;
std::thread worker;std::atomic_bool asyncWait{false},blockFirst{false},inNotify{false},unblockNotify{false};
uint64_t fakeMs=0;bool holdQueue=false,onHost=false;std::function<void()> beforeNext;
int64_t esp_timer_get_time(){return fakeMs*1000;}
#define pdTRUE 1
#define pdMS_TO_TICKS(x) (x)
struct Sem{int count=0;};using SemaphoreHandle_t=Sem*;
struct ble_npl_event{void(*fn)(ble_npl_event*)=nullptr;void* arg=nullptr;};
struct ble_npl_eventq{};ble_npl_eventq queue;ble_npl_event* pending=nullptr;
void runOne(){if(!pending)return;auto e=pending;pending=nullptr;if(beforeNext){auto f=beforeNext;beforeNext={};f();}onHost=true;e->fn(e);onHost=false;}
SemaphoreHandle_t xSemaphoreCreateBinary(){return new Sem;}
int xSemaphoreGive(Sem* sem){sem->count++;return 1;}
int xSemaphoreTake(Sem* sem,uint64_t wait){if(wait&&asyncWait.exchange(false)&&pending){worker=std::thread(runOne);while(!inNotify)std::this_thread::yield();return 0;}if(!sem->count&&wait&&!holdQueue)runOne();if(sem->count){sem->count--;return 1;}return 0;}
void ble_npl_event_init(ble_npl_event* e,void(*fn)(ble_npl_event*),void* arg){e->fn=fn;e->arg=arg;}
void* ble_npl_event_get_arg(ble_npl_event* e){return e->arg;}
ble_npl_eventq* nimble_port_get_dflt_eventq(){return &queue;}
void ble_npl_eventq_put(ble_npl_eventq*,ble_npl_event* e){assert(!pending);pending=e;}
using portMUX_TYPE=int;
#define portMUX_INITIALIZER_UNLOCKED 0
#define portENTER_CRITICAL(x) ((void)(x))
#define portEXIT_CRITICAL(x) ((void)(x))
int downPackets=0,keyUps=0,lastPointerX=5000,lastButtons=0;std::string physicalIdentity="id-a";std::vector<std::string> recipients;
struct NimBLECharacteristic{bool notify(const uint8_t* value,size_t size,uint16_t handle){assert(onHost);if(blockFirst.exchange(false)){inNotify=true;while(!unblockNotify)std::this_thread::yield();}assert(handle==11);if(size==7){lastPointerX=value[1]|(value[2]<<8);lastButtons=value[0];}if(size==8){if(value[2])downPackets++;else keyUps++;}recipients.push_back(physicalIdentity);return true;}};
NimBLECharacteristic characteristic;NimBLECharacteristic *mouseReport=&characteristic,*keyboardReport=&characteristic,*consumerReport=&characteristic;
PEERS_BODY
SINK_BODY
void phone(const char* id,uint32_t epoch,uint8_t reports=7){peers[0]=Peer{};peers[0].handle=11;peers[0].epoch=epoch;peers[0].encrypted=peers[0].bonded=true;peers[0].reports=reports;snprintf(peers[0].identity,sizeof(peers[0].identity),"%s",id);physicalIdentity=id;}
struct Fixture{BleSink sink;Core core{"board","boot",sink};Fixture(){fakeMs=0;pending=nullptr;holdQueue=false;beforeNext={};phone("id-a",1);sink.beginRouting();assert(core.registerBond("a","id-a")==Code::Accepted);assert(core.registerBond("b","id-b")==Code::Accepted);assert(core.bindClient("client-a","a")==Code::Accepted);assert(core.connect("id-a",11,true,true,true,1)==Code::Accepted);assert(core.lease("a","client-a","lease-a",15000,0)==Code::Accepted);recipients.clear();downPackets=keyUps=0;}
 Segment plan(){Segment s;s.boardId="board";s.bootId="boot";s.targetId="a";s.clientId="client-a";s.leaseId="lease-a";s.segmentId="segment";s.planId="plan";s.payloadHash=std::string(64,'a');s.ttlMs=1000;s.count=2;s.events[0].kind=s.events[1].kind=Kind::Keyboard;s.events[0].count=1;s.events[0].usages[0]=4;s.events[1].atMs=1;return s;}};
int main(){
 {Fixture f;auto s=f.plan();assert(f.core.accept(s,0)==Code::Accepted);phone("id-b",2);f.core.tick(0);assert(recipients.empty());auto r=f.core.result("client-a","segment");assert(r&&r->status==Status::TransportFailed&&!r->releaseSubmitted);}
 {Fixture f;auto s=f.plan();assert(f.core.accept(s,0)==Code::Accepted);beforeNext=[](){phone("id-b",2);};f.core.tick(0);assert(recipients.empty());}
 {Fixture f;phone("id-a",2);Event e;assert(!f.sink.submit(11,e));assert(recipients.empty());f.core.disconnect(11,0);assert(f.core.connect("id-a",11,true,true,true,2)==Code::Accepted);assert(recipients.size()==3);}
 {Fixture f;Event e;e.kind=Kind::Keyboard;e.count=1;e.usages[0]=4;holdQueue=true;assert(!f.sink.submit(11,e));assert(!f.sink.submit(11,e));assert(pending);holdQueue=false;runOne();assert(recipients.size()==3&&downPackets==0&&keyUps==1);assert(f.sink.submit(11,e));assert(recipients.size()==4&&downPackets==1);}
 {Fixture f;Event e;beforeNext=[](){fakeMs=100;};assert(!f.sink.submitTimed(11,e,40));assert(recipients.empty());}
 {Fixture f;Event e;fakeMs=100;assert(!f.sink.submitTimed(11,e,99));assert(!pending);assert(recipients.empty());}
 {Fixture f;auto s=f.plan();s.count=1;s.events[0].count=0;assert(f.core.accept(s,0)==Code::Accepted);beforeNext=[](){fakeMs=5;};f.core.tick(0);auto r=f.core.result("client-a","segment");assert(r&&r->lastSubmittedAt==5&&r->endedAt>=5&&r->maxLatenessMs==5);}
 {Fixture f;phone("id-a",1,2);Event e;e.kind=Kind::Keyboard;assert(!f.sink.submit(11,e));assert(recipients.empty());Input previous;assert(!f.sink.release(11,previous));assert(recipients.size()==1);assert(recipients[0]=="id-a");}
 {Fixture f;assert(f.core.connect("id-b",11,true,true,true,2)==Code::Busy);}
 {Fixture f;auto s=f.plan();assert(f.core.accept(s,0)==Code::Accepted);asyncWait=true;blockFirst=true;inNotify=false;unblockNotify=false;f.core.tick(0);auto r=f.core.result("client-a","segment");assert(r&&r->status==Status::TransportFailed&&!r->releaseSubmitted);unblockNotify=true;worker.join();assert(recipients.size()==4&&downPackets==1&&keyUps==1);for(auto& id:recipients)assert(id=="id-a");Event e;assert(f.sink.submit(11,e));assert(recipients.size()==5);}
 std::puts("10 actual BLE router/epoch/deadline scenarios passed");
}
'''.replace('CORE_HEADER',str(ROOT/'firmware/IPhoneAutomationHarness/src/Core.h')).replace('PEERS_BODY',peers).replace('SINK_BODY',sink)
source=source.replace(' std::puts("10 actual BLE', r''' {Fixture f;Event e;e.buttons=1;e.x=5000;assert(f.sink.submit(11,e));holdQueue=true;e.x=9999;assert(!f.sink.submit(11,e));holdQueue=false;runOne();assert(lastButtons==0);assert(lastPointerX==5000);}
 {Fixture f;Event e;e.buttons=1;e.x=5000;assert(f.sink.submit(11,e));e.x=9999;asyncWait=true;blockFirst=true;inNotify=false;unblockNotify=false;assert(!f.sink.submit(11,e));unblockNotify=true;worker.join();assert(lastButtons==0&&lastPointerX==9999);Input old;old.x=5000;assert(f.sink.release(11,old));assert(lastPointerX==9999);}
 std::puts("12 actual BLE''')
with tempfile.TemporaryDirectory(prefix='iah-router-test-') as temp:
 path=Path(temp);cpp=path/'router.cpp';binary=path/'router';cpp.write_text(source)
 compiler=os.environ.get('CXX');flags=[]
 if not compiler:
  clt=Path('/Library/Developer/CommandLineTools');compiler=str(clt/'usr/bin/clang++') if clt.exists() else 'c++'
  if clt.exists():
   sdk=clt/'SDKs/MacOSX.sdk';flags=['-isysroot',str(sdk),'-nostdinc++','-isystem',str(sdk/'usr/include/c++/v1')]
 subprocess.run([compiler,'-std=c++17','-pthread',*flags,'-Wall','-Wextra','-Werror','-pedantic',str(cpp),'-o',str(binary)],check=True)
 subprocess.run([str(binary)],check=True)
 syntax=os.environ.get('IAH_GNU_SYNTAX_CXX')
 if syntax:subprocess.run([syntax,'-std=c++17','-Wall','-Wextra','-Werror','-pedantic','-fsyntax-only',str(cpp)],check=True)
