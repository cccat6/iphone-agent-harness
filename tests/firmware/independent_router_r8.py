#!/usr/bin/env python3
"""Independent R8 position/failure review of extracted product BleSink + Core.

The finite scheduling adapter is retained from R7; all cases below are new.
No radio, Arduino build, serial port or network is used. Unlike the implementation
suite, this adapter can stop the host task after validation has completed, before
the Sending CAS, and can delay the completion semaphore after the Done CAS.
"""
from pathlib import Path
import os
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
main = (ROOT / 'firmware/IPhoneAutomationHarness/main.cpp').read_text()
peers = (main[main.index('struct Peer {'):main.index('enum class BleEventKind:')] + main[main.index('bool peerRouteMatches('):main.index('class BleSink:public Sink {')])
sink = main[main.index('class BleSink:public Sink {'):main.index('} sink;') + 1] + ';'
source = r'''

#include <atomic>
#include <cassert>
#include <condition_variable>
#include <cstdio>
#include <cstring>
#include <functional>
#include <mutex>
#include <string>
#include <thread>
#include <vector>
#include "CORE_HEADER"
using namespace iah;
thread_local bool host=false;
uint64_t now=0;
int64_t esp_timer_get_time(){return now*1000;}
struct Gate {
 std::mutex mutex;std::condition_variable cv;bool reached=false,opened=false;
 void pause(){std::unique_lock<std::mutex> lock(mutex);reached=true;cv.notify_all();cv.wait(lock,[&]{return opened;});}
 void wait(){std::unique_lock<std::mutex> lock(mutex);cv.wait(lock,[&]{return reached;});}
 void open(){std::lock_guard<std::mutex> lock(mutex);opened=true;cv.notify_all();}
 void reset(){reached=opened=false;}
} gate;
enum class Schedule {Immediate,Queued,AfterValidation,InNotify,BeforeSignal};
Schedule schedule=Schedule::Immediate;
bool pauseExit=false,pauseNotify=false,pauseSignal=false,failNotify=false;
std::thread runner;
std::function<void()> beforeJob;
struct ble_npl_event{void(*fn)(ble_npl_event*)=nullptr;void* arg=nullptr;};
struct ble_npl_eventq{} eventq;ble_npl_event* queued=nullptr;
void drain(){if(!queued)return;auto event=queued;queued=nullptr;host=true;if(beforeJob){auto hook=beforeJob;beforeJob={};hook();}event->fn(event);host=false;}
void ble_npl_event_init(ble_npl_event* e,void(*fn)(ble_npl_event*),void* arg){e->fn=fn;e->arg=arg;}
void* ble_npl_event_get_arg(ble_npl_event* e){return e->arg;}
ble_npl_eventq* nimble_port_get_dflt_eventq(){return &eventq;}
void ble_npl_eventq_put(ble_npl_eventq*,ble_npl_event* e){assert(!queued);queued=e;}
struct Semaphore{std::atomic_bool signalled{false};};using SemaphoreHandle_t=Semaphore*;
SemaphoreHandle_t xSemaphoreCreateBinary(){return new Semaphore;}
#define pdTRUE 1
#define pdMS_TO_TICKS(x) (x)
int xSemaphoreGive(Semaphore* s){if(pauseSignal){pauseSignal=false;gate.pause();}s->signalled=true;return 1;}
int xSemaphoreTake(Semaphore* s,uint64_t wait){
 if(wait&&queued){
  auto chosen=schedule;schedule=Schedule::Immediate;
  if(chosen==Schedule::Immediate)drain();
  else if(chosen!=Schedule::Queued){
   pauseExit=chosen==Schedule::AfterValidation;pauseNotify=chosen==Schedule::InNotify;pauseSignal=chosen==Schedule::BeforeSignal;
   runner=std::thread(drain);gate.wait();return 0;
  }
 }
 return s->signalled.exchange(false)?pdTRUE:0;
}
using portMUX_TYPE=int;
#define portMUX_INITIALIZER_UNLOCKED 0
#define portENTER_CRITICAL(x) ((void)(x))
void leave(){if(host&&pauseExit){pauseExit=false;gate.pause();}}
#define portEXIT_CRITICAL(x) leave()
struct Packet{std::string identity;uint16_t handle;Kind kind;bool pressed;uint16_t x,y;bool accepted;};
std::vector<Packet> packets;std::string physicalIdentity="id-a";
struct NimBLECharacteristic {
 bool notify(const uint8_t* d,size_t n,uint16_t handle){
  assert(host);if(pauseNotify){pauseNotify=false;gate.pause();}
  auto kind=n==8?Kind::Keyboard:n==7?Kind::Pointer:Kind::Consumer;
  bool down=n==8?(d[0]||d[2]):n==7?d[0]:(d[0]||d[1]);
  uint16_t x=n==7?static_cast<uint16_t>(d[1]|(d[2]<<8)):0,y=n==7?static_cast<uint16_t>(d[3]|(d[4]<<8)):0;
  packets.push_back({handle==22?"id-b":physicalIdentity,handle,kind,down,x,y,!failNotify});return !failNotify;
 }
} characteristic;
NimBLECharacteristic *mouseReport=&characteristic,*keyboardReport=&characteristic,*consumerReport=&characteristic;
PEERS_BODY
SINK_BODY
void publish(const char* identity,uint32_t epoch,uint8_t reports=7){
 peers[0]=Peer{};peers[0].handle=11;peers[0].epoch=epoch;
 peers[0].bonded=peers[0].encrypted=true;peers[0].reports=reports;
 std::snprintf(peers[0].identity,sizeof(peers[0].identity),"%s",identity);physicalIdentity=identity;
}
Event key(){Event e;e.kind=Kind::Keyboard;e.count=1;e.usages[0]=4;return e;}
void join(){gate.open();runner.join();gate.reset();}
struct Fixture {
 BleSink sink;Core core{"board","boot",sink};
 Fixture(){assert(!runner.joinable());queued=nullptr;beforeJob={};now=0;schedule=Schedule::Immediate;failNotify=false;publish("id-a",1);sink.beginRouting();assert(core.registerBond("a","id-a")==Code::Accepted);assert(core.registerBond("b","id-b")==Code::Accepted);assert(core.bindClient("client-a","a")==Code::Accepted);assert(core.connect("id-a",11,true,true,true,1)==Code::Accepted);assert(core.lease("a","client-a","lease-a",15000,0)==Code::Accepted);packets.clear();}
 Segment segment(){Segment s;s.boardId="board";s.bootId="boot";s.targetId="a";s.clientId="client-a";s.leaseId="lease-a";s.segmentId="segment-a";s.planId="plan-a";s.payloadHash=std::string(64,'a');s.ttlMs=1000;s.count=2;s.events[0]=key();s.events[1].kind=Kind::Keyboard;s.events[1].atMs=1;return s;}
};

Event pointer(uint16_t x,uint16_t y=3456){Event e;e.buttons=1;e.x=x;e.y=y;return e;}
void remembered(uint16_t x,uint16_t y=3456){uint16_t px=0,py=0;assert(peerPointerPosition(11,1,"id-a",px,py));assert(px==x&&py==y);}
void pointerUpsAt(size_t start,uint16_t x,uint16_t y=3456){for(size_t i=start;i<packets.size();i++)if(packets[i].kind==Kind::Pointer)assert(!packets[i].pressed&&packets[i].x==x&&packets[i].y==y);}
Segment drag(Fixture& f){auto s=f.segment();s.count=3;s.events[0]=pointer(5000);s.events[1]=pointer(9999,6789);s.events[1].atMs=1;s.events[2]=s.events[1];s.events[2].buttons=0;s.events[2].atMs=2;return s;}
int main(){int checks=0;
 // A failed notify attempt must not replace the last accepted position.
 {Fixture f;assert(f.sink.submit(11,pointer(5000)));assert(f.sink.submit(11,pointer(6000,4567)));
  failNotify=true;assert(!f.sink.submit(11,pointer(9999,6789)));remembered(6000,4567);
  failNotify=false;Input stale;stale.x=100;stale.y=200;size_t start=packets.size();assert(f.sink.release(11,stale));pointerUpsAt(start,6000,4567);checks++;}
 // Release notify failure cannot overwrite position either, and remains false.
 {Fixture f;assert(f.sink.submit(11,pointer(6000,4567)));failNotify=true;Input stale;stale.x=1;
  assert(!f.sink.release(11,stale));remembered(6000,4567);failNotify=false;
  size_t start=packets.size();assert(f.sink.release(11,stale));pointerUpsAt(start,6000,4567);checks++;}
 // Actual Core abandons before Sending, both while Queued and after validation.
 for(auto where:{Schedule::Queued,Schedule::AfterValidation}){
  Fixture f;auto s=drag(f);assert(f.core.accept(s,0)==Code::Accepted);f.core.tick(0);now=1;schedule=where;f.core.tick(1);
  auto r=f.core.result("client-a","segment-a");assert(r&&r->status==Status::TransportFailed&&r->submitted==1&&!r->releaseSubmitted);
  assert(packets.size()==1);if(where==Schedule::Queued)drain();else join();
  assert(packets.size()==4);pointerUpsAt(1,5000);remembered(5000);
  assert(f.core.target("a")->releasePending);assert(f.core.connect("id-a",11,true,true,true,1)==Code::Accepted);
  pointerUpsAt(1,5000);checks++;
 }
 // Already-Sending success after Core timeout records the actual position and
 // cleanup uses it; the later Core all-up must not roll back to its older input.
 {Fixture f;auto s=drag(f);assert(f.core.accept(s,0)==Code::Accepted);f.core.tick(0);now=1;schedule=Schedule::InNotify;f.core.tick(1);
  auto r=f.core.result("client-a","segment-a");assert(r&&r->status==Status::TransportFailed&&r->submitted==1&&!r->releaseSubmitted);
  join();assert(packets.size()==5&&packets[1].pressed&&packets[1].accepted&&packets[1].x==9999);
  pointerUpsAt(2,9999,6789);remembered(9999,6789);assert(f.core.connect("id-a",11,true,true,true,1)==Code::Accepted);
  pointerUpsAt(2,9999,6789);assert(!f.core.target("a")->releasePending);checks++;}
 // Already-Sending failure after timeout keeps the older successful position.
 {Fixture f;auto s=drag(f);assert(f.core.accept(s,0)==Code::Accepted);f.core.tick(0);now=1;failNotify=true;schedule=Schedule::InNotify;f.core.tick(1);
  auto r=f.core.result("client-a","segment-a");assert(r&&r->status==Status::TransportFailed&&r->submitted==1&&!r->releaseSubmitted);
  join();assert(packets.size()==5&&!packets[1].accepted);pointerUpsAt(2,5000);remembered(5000);
  failNotify=false;assert(f.core.connect("id-a",11,true,true,true,1)==Code::Accepted);pointerUpsAt(2,5000);checks++;}
 // Completion published before its signal remains unknown, but remembered
 // transport position still guides the recovery release after slot reclamation.
 {Fixture f;auto s=drag(f);assert(f.core.accept(s,0)==Code::Accepted);f.core.tick(0);now=1;schedule=Schedule::BeforeSignal;f.core.tick(1);
  auto r=f.core.result("client-a","segment-a");assert(r&&r->status==Status::TransportFailed&&r->submitted==1&&!r->releaseSubmitted);
  assert(packets.size()==2&&packets[1].x==9999);join();assert(f.core.connect("id-a",11,true,true,true,1)==Code::Accepted);
  pointerUpsAt(2,9999,6789);checks++;}
 // A lost pointer subscription suppresses the old queued cleanup channel,
 // without replacing its coordinates when the same epoch subscribes again.
 {Fixture f;assert(f.sink.submit(11,pointer(5000)));schedule=Schedule::Queued;assert(!f.sink.submit(11,pointer(9999)));
  peers[0].reports=2;drain();assert(packets.size()==2&&packets.back().kind==Kind::Keyboard);remembered(5000);
  peers[0].reports=7;Input stale;size_t start=packets.size();assert(f.sink.release(11,stale));pointerUpsAt(start,5000);checks++;}
 // A different epoch, including the same bonded identity, cannot inherit
 // coordinates or receive delayed old-epoch cleanup.
 for(auto identity:{"id-a","id-b"}){
  Fixture f;assert(f.sink.submit(11,pointer(7000,8000)));schedule=Schedule::Queued;assert(!f.sink.submit(11,pointer(9999)));
  publish(identity,2);drain();assert(packets.size()==1);uint16_t x=1,y=2;assert(!peerPointerPosition(11,2,identity,x,y));
  f.core.disconnect(11,1);assert(f.core.connect(identity,11,true,true,true,2)==Code::Accepted);
  assert(packets.size()==4);pointerUpsAt(1,5000,5000);checks++;
 }

 // The two independently routed peers retain separate last accepted positions.
 {Fixture f;peers[1]=Peer{};peers[1].handle=22;peers[1].epoch=2;peers[1].encrypted=peers[1].bonded=true;peers[1].reports=7;
  std::snprintf(peers[1].identity,sizeof(peers[1].identity),"id-b");assert(f.core.connect("id-b",22,true,true,true,2)==Code::Accepted);packets.clear();
  assert(f.sink.submit(11,pointer(6000,7000)));assert(f.sink.submit(22,pointer(8000,9000)));
  Input stale;assert(f.sink.release(11,stale));assert(f.sink.release(22,stale));
  for(size_t i=2;i<packets.size();i++)if(packets[i].kind==Kind::Pointer){const auto& p=packets[i];assert(!p.pressed);
   if(p.handle==11)assert(p.identity=="id-a"&&p.x==6000&&p.y==7000);else assert(p.handle==22&&p.identity=="id-b"&&p.x==8000&&p.y==9000);}
  checks++;}
 std::printf("%d independent R8 position/failure/epoch scheduling cases passed\n",checks);
}
'''
source = source.replace('CORE_HEADER', str(ROOT / 'firmware/IPhoneAutomationHarness/src/Core.h')).replace('PEERS_BODY', peers).replace('SINK_BODY', sink)

with tempfile.TemporaryDirectory(prefix='iah-independent-r8-') as directory:
    path = Path(directory)
    cpp, binary = path / 'router.cpp', path / 'router'
    cpp.write_text(source)
    compiler = os.environ.get('CXX')
    flags = []
    if not compiler:
        clt = Path('/Library/Developer/CommandLineTools')
        compiler = str(clt / 'usr/bin/clang++') if clt.exists() else 'c++'
        if clt.exists():
            sdk = clt / 'SDKs/MacOSX.sdk'
            flags = ['-isysroot', str(sdk), '-nostdinc++', '-isystem', str(sdk / 'usr/include/c++/v1')]
    subprocess.run([compiler, '-std=c++17', '-pthread', *flags, '-Wall', '-Wextra', '-Werror', '-pedantic', str(cpp), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True, timeout=20)
