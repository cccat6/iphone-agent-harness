#!/usr/bin/env python3
"""Exercise production challenge/disconnect methods with real admission and lease state."""
from pathlib import Path
import os
import subprocess
import tempfile

root=Path(__file__).resolve().parents[2]
service=(root/'firmware/IPhoneAutomationHarness/src/SecureService.h').read_text()
def method(signature):
 start=service.index(signature);brace=service.index('{',start);depth=1;end=brace+1
 while depth:
  if service[end]=='{':depth+=1
  elif service[end]=='}':depth-=1
  end+=1
 return service[start:end]
methods='\n'.join(method(signature)for signature in [' void releaseChallenge(){',' void invalidateChallenge(){',' void expireChallenge(){',' template<class Action> esp_err_t lockedReply(',' void rtcDisconnected('])
program=r'''
#include <cassert>
#include <cstdio>
#include <string>
#include <vector>
#include <ArduinoJson.h>
#include "ADMISSION"
#include "OWNERS"
using namespace iah;
using String=std::string;
using esp_err_t=int;
uint64_t clockMs=10;
struct SinkMock:Sink {
 std::vector<uint16_t> released;
 bool submit(uint16_t,const Event&)override{return true;}
 bool release(uint16_t handle,const Input&)override{released.push_back(handle);return true;}
};
struct CoreLock {int* depth;explicit CoreLock(int* value):depth(value){++*depth;}~CoreLock(){--*depth;}};
struct Harness {
 SinkMock sink_;Core core_{"board","boot",sink_};Admission auth_;RtcPeerOwnership<2,MaxClients,MaxTargets> rtcOwners_;
 int lockDepth=0;int* mutex_=&lockDepth;
 int rtcChallengePeer_=-1,clipboardPeer_=-1;uint16_t challengeHandle_=InvalidHandle;uint64_t challengeNext_=0;size_t challengeEvent_=0;unsigned clipboardClears=0;
 struct Request{};struct Decision{int status;String error;};
 static uint64_t now(){return clockMs;}
 void clearClipboard(){++clipboardClears;clipboardPeer_=-1;}
 int send(Request*,int code,JsonDocument&){assert(lockDepth==0);return code;}
 int error(Request*,int code,const char*){assert(lockDepth==0);return code;}
 METHODS
 Harness(){
  clockMs=10;
  assert(core_.registerBond("phone-a","identity-a")==Code::Accepted);assert(core_.registerBond("phone-b","identity-b")==Code::Accepted);
  assert(core_.connect("identity-a",11,true,true,true)==Code::Accepted);assert(core_.connect("identity-b",22,true,true,true)==Code::Accepted);
  assert(core_.bindClient("client-a","phone-a")==Code::Accepted);assert(core_.bindClient("client-b","phone-b")==Code::Accepted);
  assert(auth_.install("client-a",std::string(64,'a'),"https://igent.cc","phone-a"));assert(auth_.install("client-b",std::string(64,'b'),"https://igent.cc","phone-b"));sink_.released.clear();
 }
 void challenge(size_t peer,const char* client,const char* target){
  assert(auth_.begin(client,target,"challenge","12345678",now()));rtcChallengePeer_=int(peer);challengeHandle_=core_.target(target)->connHandle;challengeNext_=now()+200;challengeEvent_=3;
 }
 void claim(size_t peer,const char* target,const char* client,const char* lease){assert(core_.lease(target,client,lease,1000,now())==Code::Accepted);rtcOwners_.claim(peer,target,lease);}
 void cleared()const{assert(!auth_.active(now())&&auth_.expiresAt()==0&&rtcChallengePeer_==-1&&challengeHandle_==InvalidHandle&&challengeNext_==0&&challengeEvent_==0);}
};
int main(){
 // Already-processed expiration followed by a new slot's lease: old disconnect is inert.
 {Harness h;h.challenge(0,"client-a","phone-a");clockMs=30011;h.expireChallenge();h.cleared();assert(h.sink_.released==std::vector<uint16_t>{11});h.sink_.released.clear();h.claim(1,"phone-a","client-a","new-lease");h.core_.target("phone-a")->input.buttons=1;h.rtcDisconnected(0);assert(h.sink_.released.empty());assert(h.core_.target("phone-a")->lease.id=="new-lease");assert(h.core_.target("phone-a")->input.buttons==1);}
 // The request lock expires an old challenge before the new claim action runs.
 {Harness h;h.challenge(0,"client-a","phone-a");clockMs=30011;Harness::Request request;bool acted=false;
  int status=h.lockedReply(&request,[&](JsonDocument&)->Harness::Decision{assert(h.lockDepth==1);h.cleared();assert(h.sink_.released==std::vector<uint16_t>{11});h.claim(1,"phone-a","client-a","next-lease");h.core_.target("phone-a")->input.buttons=1;acted=true;return {200,""};});
  assert(status==200&&acted);h.sink_.released.clear();h.rtcDisconnected(0);assert(h.sink_.released.empty()&&h.core_.target("phone-a")->lease.id=="next-lease");}
 // Stale metadata cannot release input protected by another slot's live lease.
 for(bool running:{false,true}){Harness h;h.challenge(0,"client-a","phone-a");clockMs=30011;h.claim(1,"phone-a","client-a","protected-lease");h.core_.target("phone-a")->running=running;h.rtcDisconnected(0);h.cleared();assert(h.sink_.released.empty());assert(h.core_.target("phone-a")->lease.id=="protected-lease");}
 // Slot 0 cancellation releases its own lease while slot 1's challenge survives.
 {Harness h;h.claim(0,"phone-a","client-a","lease-a");h.challenge(1,"client-b","phone-b");h.clipboardPeer_=1;h.rtcDisconnected(0);assert(h.sink_.released==std::vector<uint16_t>{11});assert(h.auth_.active(clockMs)&&h.rtcChallengePeer_==1&&h.challengeHandle_==22);assert(h.clipboardClears==0&&h.clipboardPeer_==1);}
 // An expired challenge with no newer lease still receives its final release.
 {Harness h;h.challenge(0,"client-a","phone-a");clockMs=30011;h.clipboardPeer_=0;h.rtcDisconnected(0);assert(h.sink_.released==std::vector<uint16_t>{11});h.cleared();assert(h.clipboardClears==1);h.rtcDisconnected(0);assert(h.sink_.released.size()==1&&h.clipboardClears==1);}
 std::puts("RTC challenge isolation: expired/active cleanup, request-before-claim ordering, stale-slot lease protection and independent clipboard/challenge owners passed");
}
'''.replace('METHODS',methods).replace('ADMISSION',str(root/'firmware/IPhoneAutomationHarness/src/Admission.h')).replace('OWNERS',str(root/'firmware/IPhoneAutomationHarness/src/RtcPeerOwnership.h'))
include=os.environ.get('ARDUINOJSON_INCLUDE') or str(root/'build/test-headers')
with tempfile.TemporaryDirectory(prefix='iah-challenge-isolation-') as directory:
 path=Path(directory);cpp=path/'test.cpp';cpp.write_text(program);binary=path/'test'
 compiler=os.environ.get('CXX')
 command=[compiler] if compiler else ['/Library/Developer/CommandLineTools/usr/bin/clang++','-isysroot','/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk','-nostdinc++','-isystem','/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/c++/v1'] if Path('/Library/Developer/CommandLineTools/usr/bin/clang++').exists() else ['c++']
 subprocess.run(command+['-std=c++17','-Wall','-Wextra','-Werror','-pedantic','-I',include,str(cpp),'-o',str(binary)],check=True)
 subprocess.run([str(binary)],check=True)
