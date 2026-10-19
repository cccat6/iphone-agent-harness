#!/usr/bin/env python3
"""Run the production two-slot RTC scheduler with independent host transport doubles."""
from pathlib import Path
import os
import subprocess
import tempfile

root=Path(__file__).resolve().parents[3]
source=(root/'firmware/IPhoneAutomationHarness/main.cpp').read_text()
bridge=(root/'firmware/IPhoneAutomationHarness/src/RtcBridge.h').read_text()
assert 'explicit RtcBridge(uint16_t localPort=RtcIdentity::port):localPort_(localPort){}' in bridge
assert 'local.sin_port=htons(localPort_)' in bridge
assert 'const uint16_t localPort_;' in bridge
assert 'new(std::nothrow) iah::RtcBridge(iah::RtcBridge::port()+slot)' in source
scheduler=source[source.index('void rtcTask(void*){'):source.index('\nvoid rtcDiagnostic(',source.index('void rtcTask(void*){'))]
program=r'''
#include <array>
#include <cassert>
#include <cstdint>
#include <functional>
#include <string>
#include <stdexcept>
#include <cstdio>
using String=std::string;
constexpr size_t RtcPeerSlots=2;
constexpr int WL_CONNECTED=3;
static bool online=true;
static uint64_t clockMs=0;
static unsigned ticks=0,stopAt=0;
uint64_t esp_timer_get_time(){return clockMs*1000;}
void vTaskDelay(unsigned delay){assert(delay==1);clockMs+=1000;if(++ticks>=stopAt)throw std::runtime_error("end test turn");}
struct Wifi {int status()const{return online?WL_CONNECTED:0;}} WiFi;
struct Service {
 std::array<unsigned,2> dispatches{},disconnects{},replacements{};
 bool networkReady()const{return online;}
 String dispatchRtc(String body,const String& address,size_t slot){assert(slot<2);assert(body==std::to_string(slot));assert(address=="peer-"+std::to_string(slot));++dispatches[slot];return body;}
 void rtcDisconnected(size_t slot){assert(slot<2);++disconnects[slot];}
 bool rtcCanReplace(size_t slot){assert(slot<2);++replacements[slot];return slot==0;}
} service;
Service* secureService=&service;
struct RtcBridge {
 const uint16_t port;unsigned attempts=0,loops=0,stops=0;bool live=false,failFirst=false;
 std::function<String(String)> dispatch;std::function<void()> disconnected;std::function<bool()> canReplace;
 explicit RtcBridge(uint16_t value):port(value){}
 String peerAddress()const{return "peer-"+std::to_string(port-18948);}
 bool begin(std::function<String(String)> d,std::function<void()> c,std::function<bool()> r){dispatch=d;disconnected=c;canReplace=r;++attempts;if(failFirst&&attempts==1)return false;live=true;return true;}
 void stop(){assert(live);++stops;live=false;disconnected();}
 void loop(){assert(live);++loops;const size_t slot=port-18948;assert(dispatch(std::to_string(slot))==std::to_string(slot));assert(canReplace()==(slot==0));}
};
RtcBridge a(18948),b(18949);RtcBridge* rtcBridges[RtcPeerSlots]={&a,&b};
'''+scheduler+r'''
int main(){
 b.failFirst=true;stopAt=3;
 try{rtcTask(nullptr);}catch(const std::runtime_error&){}
 assert(a.attempts==1&&a.loops==3);assert(b.attempts==2&&b.loops==1);
 assert(service.dispatches[0]==3&&service.dispatches[1]==1);
 assert(service.replacements[0]==3&&service.replacements[1]==1);
 assert(a.port!=b.port&&a.live&&b.live);
 a.stop();assert(service.disconnects[0]==1&&service.disconnects[1]==0&&b.live);b.loop();assert(service.dispatches[1]==2);
 std::puts("RTC slots: independent ports/callback ownership and failed second-slot retry preserve first-slot progress");
}
'''
with tempfile.TemporaryDirectory(prefix='iah-rtc-slots-') as directory:
 path=Path(directory);cpp=path/'test.cpp';cpp.write_text(program);binary=path/'test'
 compiler=os.environ.get('CXX')
 command=[compiler] if compiler else ['/Library/Developer/CommandLineTools/usr/bin/clang++','-isysroot','/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk','-nostdinc++','-isystem','/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/c++/v1'] if Path('/Library/Developer/CommandLineTools/usr/bin/clang++').exists() else ['c++']
 subprocess.run(command+['-std=c++17','-Wall','-Wextra','-Werror','-pedantic',str(cpp),'-o',str(binary)],check=True)
 subprocess.run([str(binary)],check=True)
