"""Host-only counterexample for R6-F1; exit 1 means wrong-target delivery reproduced.

Compiles the actual Core.h and extracts the actual BleSink class from main.cpp.
The finite transport adapter routes a numeric handle to its current physical peer.
It models callbacks replacing that peer after loop's syncPeers, before tick. This
is an integration counterexample, not a real NimBLE/radio measurement.
"""
from pathlib import Path
import os
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]
main = (ROOT / 'firmware/IPhoneAutomationHarness/main.cpp').read_text()
sink = main[main.index('class BleSink:public Sink {'):main.index('} sink;') + 1] + ';'
source = r'''
#include <cassert>
#include <cstdio>
#include <string>
#include <vector>
#include "CORE_HEADER"
using namespace iah;
std::string physicalIdentity="id-a";
std::vector<std::string> recipients;
struct NimBLECharacteristic {
 bool notify(const uint8_t*,size_t,uint16_t handle){
  assert(handle==11);recipients.push_back(physicalIdentity);return true;
 }
};
NimBLECharacteristic characteristic;
NimBLECharacteristic *mouseReport=&characteristic,*keyboardReport=&characteristic,*consumerReport=&characteristic;
SINK_BODY
int main(){
 BleSink sink;Core core("board","boot",sink);
 assert(core.registerBond("a","id-a")==Code::Accepted);
 assert(core.registerBond("b","id-b")==Code::Accepted);
 assert(core.bindClient("client-a","a")==Code::Accepted);
 assert(core.connect("id-a",11,true,true,true)==Code::Accepted);
 assert(core.lease("a","client-a","lease-a",15000,0)==Code::Accepted);
 recipients.clear();
 Segment s;s.boardId="board";s.bootId="boot";s.targetId="a";s.clientId="client-a";
 s.leaseId="lease-a";s.segmentId="segment-a";s.planId="plan-a";
 s.payloadHash=std::string(64,'a');s.ttlMs=1000;s.count=2;
 s.events[0].kind=Kind::Keyboard;s.events[0].count=1;s.events[0].usages[0]=4;
 s.events[1].kind=Kind::Keyboard;s.events[1].atMs=1;
 assert(core.accept(s,0)==Code::Accepted);
 // NimBLE callbacks publish disconnect A / reconnect known bonded B with
 // handle 11 after syncPeers. They do not touch Core. The scheduler may
 // preempt after tick's nowMs argument is evaluated, so lateness is no fence.
 physicalIdentity="id-b";
 core.tick(0);core.tick(1);
 bool wrong=false;for(const auto& recipient:recipients)wrong|=recipient!="id-a";
 auto r=core.result("client-a","segment-a");
 if(wrong){
  printf("R6-F1 REPRODUCED: %zu old-target notifications reached replacement id-b; target-a receipt=%s, releaseSubmitted=%s\n",
   recipients.size(),r?statusName(r->status):"missing",r&&r->releaseSubmitted?"true":"false");
  return 1;
 }
 return 0;
}
'''.replace('CORE_HEADER', str(ROOT / 'firmware/IPhoneAutomationHarness/src/Core.h')).replace('SINK_BODY', sink)
with tempfile.TemporaryDirectory(prefix='iah-r6-repro-') as temporary:
    path = Path(temporary)
    cpp, binary = path / 'repro.cpp', path / 'repro'
    cpp.write_text(source)
    compiler = os.environ.get('CXX')
    flags = []
    if not compiler:
        clt = Path('/Library/Developer/CommandLineTools')
        compiler = str(clt / 'usr/bin/clang++') if clt.exists() else 'c++'
        if clt.exists():
            sdk = clt / 'SDKs/MacOSX.sdk'
            flags = ['-isysroot', str(sdk), '-nostdinc++', '-isystem', str(sdk / 'usr/include/c++/v1')]
    subprocess.run([compiler, '-std=c++17', *flags, '-Wall', '-Wextra', '-Werror', '-pedantic', str(cpp), '-o', str(binary)], check=True)
    raise SystemExit(subprocess.run([str(binary)]).returncode)
