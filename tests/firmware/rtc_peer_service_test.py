#!/usr/bin/env python3
"""Exercise production peer-disconnect handlers with real Core and Admission state."""
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
source = (ROOT / 'firmware/IPhoneAutomationHarness/src/SecureService.h').read_text()

def method(name):
    start = source.index(' ' + name)
    brace = source.index('{', start)
    depth = 1
    end = brace + 1
    while depth:
        if source[end] == '{': depth += 1
        if source[end] == '}': depth -= 1
        end += 1
    return source[start:end]

program = r'''
#include "firmware/IPhoneAutomationHarness/src/Core.h"
#include "firmware/IPhoneAutomationHarness/src/Admission.h"
#include "firmware/IPhoneAutomationHarness/src/RtcPeerOwnership.h"
#include <cassert>
#include <vector>
using namespace iah;
struct CoreLock { explicit CoreLock(void*){} };
struct FakeSink:Sink {
 std::vector<uint16_t> released;
 bool submit(uint16_t,const Event&)override{return true;}
 bool release(uint16_t handle,const Input&)override{released.push_back(handle);return true;}
};
struct Service {
 FakeSink sink;Core core_{"board","boot",sink};Admission auth_;
 RtcPeerOwnership<2,8,2> rtcOwners_;void* mutex_=nullptr;
 int rtcChallengePeer_=-1,clipboardPeer_=-1;bool maintenance_=false;
 unsigned challengeReleases=0,clipboardClears=0;uint64_t at=100;
 uint64_t now(){return at;}
 void releaseChallenge(){challengeReleases++;}
 void invalidateChallenge(){auth_.invalidate();rtcChallengePeer_=-1;}
 void clearClipboard(){clipboardClears++;clipboardPeer_=-1;}
 Service(){
  for(const auto& suffix:{std::string("a"),std::string("b")}){
   assert(core_.registerBond("phone-"+suffix,"bond-"+suffix)==Code::Accepted);
   assert(core_.connect("bond-"+suffix,suffix=="a"?11:22,true,true,true)==Code::Accepted);
   assert(core_.bindClient("browser-"+suffix,"phone-"+suffix)==Code::Accepted);
   assert(auth_.install("browser-"+suffix,std::string(64,suffix[0]),"https://igent.cc","phone-"+suffix));
  }
  sink.released.clear();
 }
 HANDLERS
};
int main(){
 {Service s;
  assert(s.core_.lease("phone-a","browser-a","lease-a",1000,100)==Code::Accepted);s.rtcOwners_.claim(0,"phone-a","lease-a");
  assert(s.core_.lease("phone-b","browser-b","lease-b",1000,100)==Code::Accepted);s.rtcOwners_.claim(1,"phone-b","lease-b");
  assert(!s.rtcCanReplace(0)&&!s.rtcCanReplace(1));s.rtcDisconnected(0);
  assert(s.core_.target("phone-a")->lease.id.empty());assert(s.core_.target("phone-b")->lease.id=="lease-b");
  assert(s.sink.released==std::vector<uint16_t>{11});assert(s.rtcCanReplace(0)&&!s.rtcCanReplace(1));
  assert(s.core_.lease("phone-b","browser-b","lease-b",1000,101)==Code::Accepted);
 }
 {Service s;
  assert(s.core_.lease("phone-a","browser-a","shared-lease",1000,100)==Code::Accepted);
  s.rtcOwners_.claim(0,"phone-a","shared-lease");s.rtcOwners_.claim(1,"phone-a","shared-lease");s.rtcDisconnected(0);
  assert(s.core_.target("phone-a")->lease.id=="shared-lease");assert(s.sink.released.empty());s.rtcDisconnected(1);
  assert(s.core_.target("phone-a")->lease.id.empty());assert(s.sink.released==std::vector<uint16_t>{11});
 }
 {Service s;s.clipboardPeer_=1;
  assert(s.auth_.begin("browser-b","phone-b","challenge","12345678",100));s.rtcChallengePeer_=1;
  assert(s.rtcCanReplace(0)&&!s.rtcCanReplace(1));s.rtcDisconnected(0);
  assert(s.auth_.active(100)&&s.challengeReleases==0&&s.clipboardClears==0);
  s.rtcDisconnected(1);assert(!s.auth_.active(100)&&s.challengeReleases==1&&s.clipboardClears==1);
 }
 {Service s;
  assert(s.core_.lease("phone-a","browser-a","short",10,100)==Code::Accepted);s.rtcOwners_.claim(0,"phone-a","short");
  assert(s.core_.lease("phone-b","browser-b","long",1000,100)==Code::Accepted);s.rtcOwners_.claim(1,"phone-b","long");
  s.at=111;assert(s.rtcCanReplace(0)&&!s.rtcCanReplace(1));
  s.maintenance_=true;assert(!s.rtcCanReplace(0));s.rtcDisconnected(99);assert(s.sink.released.empty());
 }
}
'''.replace('HANDLERS', method('void rtcDisconnected(') + '\n' + method('bool rtcCanReplace('))

with tempfile.TemporaryDirectory(prefix='iah-rtc-peer-service-') as temporary:
    folder = Path(temporary)
    cpp = folder / 'test.cpp'; binary = folder / 'test'
    cpp.write_text(program)
    compiler = Path('/Library/Developer/CommandLineTools/usr/bin/clang++')
    sdk = Path('/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk')
    if compiler.exists() and (sdk/'usr/include/c++/v1').exists():
        command = [str(compiler), '-isysroot', str(sdk), '-nostdinc++', '-isystem', str(sdk/'usr/include/c++/v1')]
    else:
        command = ['c++']
    subprocess.run([*command, '-std=c++17', '-Wall', '-Wextra', '-Werror', '-pedantic', '-I', str(ROOT), str(cpp), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print('Production RTC peer disconnect/replacement: separate leases, same-client handoff, challenge, clipboard and expiry passed')
