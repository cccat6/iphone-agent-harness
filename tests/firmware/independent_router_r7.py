#!/usr/bin/env python3
"""Independent finite host scheduling review of extracted product BleSink + Core.

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
peers = main[main.index('struct Peer {'):main.index('class BleSink:public Sink {')]
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
struct Packet{std::string identity;uint16_t handle;Kind kind;bool pressed;uint16_t x,y;};
std::vector<Packet> packets;std::string physicalIdentity="id-a";
struct NimBLECharacteristic {
 bool notify(const uint8_t* d,size_t n,uint16_t handle){
  assert(host);if(pauseNotify){pauseNotify=false;gate.pause();}
  auto kind=n==8?Kind::Keyboard:n==7?Kind::Pointer:Kind::Consumer;
  bool down=n==8?(d[0]||d[2]):n==7?d[0]:(d[0]||d[1]);
  uint16_t x=n==7?static_cast<uint16_t>(d[1]|(d[2]<<8)):0,y=n==7?static_cast<uint16_t>(d[3]|(d[4]<<8)):0;
  packets.push_back({physicalIdentity,handle,kind,down,x,y});return !failNotify;
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
int main(){int checks=0;
 // Queued work cancelled before delivery, followed by a reused handle: neither
 // the original key nor its cancellation cleanup can reach the replacement.
 for(auto identity:{"id-b","id-a"}){
  Fixture f;schedule=Schedule::Queued;assert(!f.sink.submit(11,key()));
  publish(identity,2);drain();assert(packets.empty());
  f.core.disconnect(11,0);assert(f.core.connect(identity,11,true,true,true,2)==Code::Accepted);
  assert(packets.size()==3);for(const auto& p:packets)assert(p.identity==identity&&!p.pressed);
  checks++;
 }
 // The host task has finished matching the old identity but is preempted before
 // the Sending CAS. A timeout must win without ever emitting a pressed report.
 {Fixture f;schedule=Schedule::AfterValidation;assert(!f.sink.submit(11,key()));
  assert(packets.empty());assert(!f.sink.submit(11,key()));join();
  assert(packets.size()==3);for(const auto& p:packets)assert(!p.pressed&&p.identity=="id-a");
  assert(f.sink.submit(11,key()));assert(packets.size()==4&&packets.back().pressed);checks++;}
 // Done is already published but its semaphore has not yet been given. A caller
 // timeout cannot turn that uncertainty into success or reuse the job storage.
 {Fixture f;schedule=Schedule::BeforeSignal;assert(!f.sink.submit(11,key()));
  assert(packets.size()==1&&packets[0].pressed);assert(!f.sink.submit(11,key()));
  join();assert(f.sink.submit(11,key()));assert(packets.size()==2);checks++;}
 // A sent key may return late. Core reports uncertainty, and host-side cleanup
 // releases it before the single slot becomes reusable. No completed receipt.
 {Fixture f;auto s=f.segment();assert(f.core.accept(s,0)==Code::Accepted);
  schedule=Schedule::InNotify;f.core.tick(0);auto r=f.core.result("client-a","segment-a");
  assert(r&&r->status==Status::TransportFailed&&!r->releaseSubmitted&&r->submitted==0);
  assert(packets.empty());join();assert(packets.size()==4&&packets[0].pressed);
  for(size_t i=1;i<packets.size();i++)assert(!packets[i].pressed);
  assert(f.core.target("a")->releasePending);assert(f.core.connect("id-a",11,true,true,true,1)==Code::Accepted);
  assert(!f.core.target("a")->releasePending);checks++;}
 // Old queued cleanup is fenced even if Core route A is unbound and route B
 // is installed while the original physical host event remains unprocessed.
 {Fixture f;schedule=Schedule::Queued;assert(!f.sink.submit(11,key()));
  f.core.disconnect(11,0);publish("id-b",2);assert(f.core.connect("id-b",11,true,true,true,2)==Code::NotReady);
  assert(packets.empty());drain();assert(packets.empty());
  assert(f.core.connect("id-b",11,true,true,true,2)==Code::Accepted);assert(packets.size()==3);
  for(const auto& p:packets){assert(p.identity=="id-b"&&!p.pressed);}checks++;}
 // The host queue may see a subscription change before the pending job. Input
 // requires all reports, but release still uses each available report channel.
 {Fixture f;beforeJob=[](){publish("id-a",1,2);};assert(!f.sink.submit(11,key()));assert(packets.empty());
  Input previous;assert(!f.sink.release(11,previous));assert(packets.size()==1&&packets[0].kind==Kind::Keyboard&&!packets[0].pressed);checks++;}
 // Deadline expires in the actual queued host job: no pressed input; receipt
 // is failure even though same-target all-up cleanup succeeds.
 {Fixture f;auto s=f.segment();assert(f.core.accept(s,0)==Code::Accepted);beforeJob=[](){now=41;};f.core.tick(0);
  auto r=f.core.result("client-a","segment-a");assert(r&&r->status==Status::TransportFailed&&r->submitted==0&&r->releaseSubmitted);
  assert(packets.size()==3);for(const auto& p:packets){assert(!p.pressed);}checks++;}
 // NimBLE's boolean failure is retained as failure after the host job returns.
 {Fixture f;auto s=f.segment();assert(f.core.accept(s,0)==Code::Accepted);failNotify=true;f.core.tick(0);
  auto r=f.core.result("client-a","segment-a");assert(r&&r->status==Status::TransportFailed&&!r->releaseSubmitted);checks++;}
 std::printf("%d independent extracted BleSink/Core scheduling cases passed\n",checks);
 CANCEL_POSITION_CASE
}
'''.replace('CORE_HEADER', str(ROOT / 'firmware/IPhoneAutomationHarness/src/Core.h')).replace('PEERS_BODY', peers).replace('SINK_BODY', sink)

# Opt-in review counterexample deliberately fails on the reviewed pre-fix source.
# Uses Core's real scheduler/finish path, rather than submitting Sink events only.
position_case = r'''
 {Fixture f;auto s=f.segment();s.count=3;s.events[0]=Event{};s.events[0].buttons=1;s.events[0].x=5000;
  s.events[1]=s.events[0];s.events[1].atMs=1;s.events[1].x=9999;
  s.events[2]=s.events[1];s.events[2].atMs=2;s.events[2].buttons=0;
  assert(f.core.accept(s,0)==Code::Accepted);f.core.tick(0);
  assert(packets.size()==1&&packets[0].pressed&&packets[0].x==5000);
  now=1;schedule=Schedule::Queued;f.core.tick(1);
  auto receipt=f.core.result("client-a","segment-a");
  assert(receipt&&receipt->status==Status::TransportFailed&&!receipt->releaseSubmitted&&receipt->submitted==1);
  assert(packets.size()==1);drain();
  assert(packets.size()==4&&!packets[1].pressed&&packets[1].kind==Kind::Pointer);
  if(packets[1].x!=5000){
   std::printf("R7-F1 REPRODUCED: Core submitted pointer-down at 5000, queued move 9999 never notified, cancelled host cleanup released at %u; receipt=%s, releaseSubmitted=%s\n",packets[1].x,statusName(receipt->status),receipt->releaseSubmitted?"true":"false");return 1;
  }
 }
'''
source = source.replace('CANCEL_POSITION_CASE', position_case if os.environ.get('IAH_R7_CANCEL_POSITION_REPRO') else '')

with tempfile.TemporaryDirectory(prefix='iah-independent-r7-') as directory:
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
