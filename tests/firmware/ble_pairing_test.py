#!/usr/bin/env python3
"""Execute production BLE callbacks and initialization against a host adapter.

No radio/serial calls: verifies pairing admission, identity timing and packet sizing.
"""
from pathlib import Path
import os, subprocess, tempfile
ROOT=Path(__file__).resolve().parents[2]
main=(ROOT/'firmware/IPhoneAutomationHarness/main.cpp').read_text()
callbacks=main[main.index('class ServerCallbacks:'):main.index('class DeviceCallbacks:')]
peer_state=main[main.index('struct Peer {'):main.index('// Diagnostics contain')]
update_peer=main[main.index('void updatePeer('):main.index('class ServerCallbacks:')].replace('void updatePeer(', 'void updatePeerState(')
report_callbacks=main[main.index('class ReportCallbacks:'):main.index('std::string findOrRegisterBond(')]
diagnostics=main[main.index('enum class BleEventKind:'):main.index('bool peerRouteMatches(')]
start=main[main.index('void startBle(){'):main.index('// Wi-Fi callbacks')]
source=r'''
#include <atomic>
#include <cassert>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
constexpr int MaxTargets=2,InvalidHandle=65535,HID_MOUSE=962,BLE_HS_IO_NO_INPUT_OUTPUT=3;
struct Addr{int type=1;std::string text="random-before-identity";int getType(){return type;}std::string toString(){return text;}bool isPublic(){return type==0;}bool isStatic(){return type==1;}};
struct NimBLEConnInfo{uint16_t handle=7;bool encrypted=false,bonded=false;Addr addr;uint16_t getConnHandle()const{return handle;}uint16_t getConnInterval()const{return 24;}uint16_t getConnLatency()const{return 0;}Addr getIdAddress(){return addr;}bool isEncrypted()const{return encrypted;}bool isBonded()const{return bonded;}bool isAuthenticated()const{return false;}uint8_t getSecKeySize()const{return encrypted?16:0;}};
using portMUX_TYPE=int;
#define portMUX_INITIALIZER_UNLOCKED 0
#define portENTER_CRITICAL(x) ((void)(x))
#define portEXIT_CRITICAL(x) ((void)(x))
PEER_STATE
uint32_t testTime=0;uint32_t millis(){return testTime++;}
DIAGNOSTICS
char knownIdentities[2][32]{};
struct Gate{bool pairingAllowed(){return false;}};std::atomic<Gate*> bleService{nullptr};
UPDATE_PEER
int updates=0,newConnections=0;void updatePeer(NimBLEConnInfo& info,bool fresh=false){updates++;if(fresh)newConnections++;updatePeerState(info,fresh);}
struct NimBLEServer;
struct NimBLEServerCallbacks{virtual ~NimBLEServerCallbacks()=default;virtual void onConnect(NimBLEServer*,NimBLEConnInfo&){};virtual void onAuthenticationComplete(NimBLEConnInfo&){};virtual void onIdentity(NimBLEConnInfo&){};virtual void onDisconnect(NimBLEServer*,NimBLEConnInfo&,int){}};
struct NimBLECharacteristic{void setCallbacks(void*){}void setValue(const uint8_t*,size_t){}};NimBLECharacteristic *mouseReport=nullptr,*keyboardReport=nullptr,*consumerReport=nullptr;
struct NimBLECharacteristicCallbacks{virtual ~NimBLECharacteristicCallbacks()=default;virtual void onSubscribe(NimBLECharacteristic*,NimBLEConnInfo&,uint16_t){}virtual void onStatus(NimBLECharacteristic*,NimBLEConnInfo&,int){}virtual void onStatus(NimBLECharacteristic*,int){}};
REPORT_CALLBACKS
struct Advertising{bool scan=false;int advBytes=3,scanBytes=0,starts=0;std::string name;void setAppearance(int){advBytes+=4;}void addServiceUUID(int){advBytes+=4;}void enableScanResponse(bool value){scan=value;}bool setName(const char* value){name=value;(scan?scanBytes:advBytes)+=name.size()+2;return advBytes<=31&&scanBytes<=31;}bool start(){assert(advBytes<=31&&scanBytes<=31);starts++;return true;}};
struct NimBLEServer{int count=1,disconnects=0;NimBLEServerCallbacks* cb=nullptr;int getConnectedCount(){return count;}void disconnect(uint16_t){disconnects++;}void updateConnParams(uint16_t,int,int,int,int){}void setCallbacks(NimBLEServerCallbacks* value){cb=value;}void advertiseOnDisconnect(bool){}void start(){}};
NimBLEServer server;Advertising advertising;
struct DeviceCallbacks{};
struct NimBLEDevice{static void setDeviceCallbacks(DeviceCallbacks*){}static inline std::string name;static void init(const char* value){name=value;}static void setSecurityAuth(bool bond,bool mitm,bool sc){assert(bond&&!mitm&&sc);}static void setSecurityIOCap(int){}static NimBLEServer* createServer(){return &server;}static NimBLEServer* getServer(){return &server;}static Advertising* getAdvertising(){return &advertising;}};
struct Service{int getUUID(){return 0x1812;}};
struct NimBLEHIDDevice{explicit NimBLEHIDDevice(NimBLEServer*){}NimBLECharacteristic* getInputReport(int){return new NimBLECharacteristic;}void getOutputReport(int){}void setManufacturer(const char*){}void setPnp(int,int,int,int){}void setHidInfo(int,int){}NimBLECharacteristic* getReportMap(){static NimBLECharacteristic report;return &report;}void setBatteryLevel(int){}Service* getHidService(){static Service service;return &service;}};
namespace iah{constexpr uint8_t reportMap[]={0};}
CALLBACKS
START
int main(){
 startBle();assert(NimBLEDevice::name=="iPhone Agent Bridge");assert(advertising.name==NimBLEDevice::name);assert(advertising.scanBytes==21&&advertising.advBytes==11);
 NimBLEConnInfo info;
 // New phone connects before browser registration, after restart or any delay.
 server.cb->onConnect(&server,info);assert(server.disconnects==0&&newConnections==1);
 assert(advertising.starts==2);
 server.count=2;server.cb->onConnect(&server,info);assert(server.disconnects==0&&advertising.starts==2);
 server.count=3;server.cb->onConnect(&server,info);assert(server.disconnects==1&&newConnections==2);
 server.count=1;info.encrypted=info.bonded=true;int before=updates;server.cb->onAuthenticationComplete(info);assert(updates==before+1&&server.disconnects==1);
 // An identity may resolve after the encryption event, without another subscribe.
 before=updates;server.cb->onIdentity(info);assert(updates==before+1);
 // A failed SMP negotiation must release the radio slot for a fresh attempt.
 info.encrypted=false;server.cb->onAuthenticationComplete(info);assert(server.disconnects==2);
 peers[0].handle=info.handle;server.cb->onDisconnect(&server,info,0);assert(peers[0].handle==InvalidHandle);
 assert(bleEventSequence==7&&bleEventCount==7);
 assert(bleEvents[0].kind==BleEventKind::Connect&&bleEvents[0].handle==info.handle);
 assert(bleEvents[3].kind==BleEventKind::Authentication&&bleEvents[3].encrypted&&bleEvents[3].bonded&&bleEvents[3].keySize==16);
 assert(bleEvents[4].kind==BleEventKind::Identity);
 assert(bleEvents[5].kind==BleEventKind::Authentication&&!bleEvents[5].encrypted&&bleEvents[5].keySize==0);
 assert(bleEvents[6].kind==BleEventKind::Disconnect&&bleEvents[6].reason==0);
 // Execute the actual fixed-ring writer through more than its capacity. Every
 // retained slot must correspond to the latest 16 events, with original flags.
 bleEventNext=bleEventCount=bleEventSequence=0;testTime=100;
 for(int sequence=1;sequence<=20;sequence++){
  info.handle=sequence;info.encrypted=sequence%2;info.bonded=sequence%3;
  recordBleEvent(BleEventKind::Subscription,info,400+sequence,4,sequence%3);
 }
 assert(bleEventCount==16&&bleEventNext==4&&bleEventSequence==20);
 for(int sequence=5;sequence<=20;sequence++){
  const auto& event=bleEvents[(sequence-1)%BleDiagnosticCapacity];
  assert(event.sequence==static_cast<uint32_t>(sequence)&&event.handle==sequence&&event.atMs==static_cast<uint32_t>(99+sequence));
  assert(event.kind==BleEventKind::Subscription&&event.reportBit==4&&event.value==sequence%3&&event.reason==400+sequence);
  assert(event.encrypted==static_cast<bool>(sequence%2)&&event.bonded==static_cast<bool>(sequence%3));
  assert(!event.authenticated&&event.keySize==(sequence%2?16:0));
 }
 std::puts("BLE diagnostic ring: real callback flags, newest 16 events, wraparound and original event fields passed");
 // Replay the observed startup order: restored auth/CCCD before connect.
 for(auto& peer:peers)peer=Peer{};server.count=1;info.handle=1;info.encrypted=info.bonded=true;info.addr.text="static-a";
 ReportCallbacks pointer(1),keyboard(2),consumer(3);pointer.onStatus(nullptr,0);pointer.onStatus(nullptr,9);assert(bleTxStats[0].completed==1&&bleTxStats[0].failed==1);auto subscribe=[&](ReportCallbacks& callback,NimBLEConnInfo& peer,uint16_t value){static_cast<NimBLECharacteristicCallbacks&>(callback).onSubscribe(nullptr,peer,value);};
 server.cb->onAuthenticationComplete(info);const auto earlyEpoch=peers[0].epoch;assert(earlyEpoch&&!peers[0].connectSeen);
 subscribe(pointer,info,1);subscribe(keyboard,info,1);subscribe(consumer,info,1);assert(peers[0].reports==7);
 server.cb->onConnect(&server,info);assert(peers[0].reports==7&&peers[0].epoch==earlyEpoch&&peers[0].connectSeen);
 // A second phone retains its own restored reports and epoch.
 NimBLEConnInfo second=info;second.handle=2;second.addr.text="static-b";server.count=2;
 server.cb->onAuthenticationComplete(second);subscribe(pointer,second,1);subscribe(keyboard,second,1);subscribe(consumer,second,1);const auto secondEpoch=peers[1].epoch;
 server.cb->onConnect(&server,second);assert(peers[1].epoch==secondEpoch&&peers[1].reports==7&&peers[0].reports==7&&peers[0].epoch==earlyEpoch);
 // A genuine new connect on an established slot invalidates old routing state.
 peers[0].pointerKnown=true;server.cb->onConnect(&server,info);assert(peers[0].epoch!=earlyEpoch&&peers[0].reports==0&&!peers[0].pointerKnown&&peers[0].connectSeen);assert(peers[1].epoch==secondEpoch&&peers[1].reports==7);
 const auto previousEpoch=peers[0].epoch;server.cb->onDisconnect(&server,info,0);assert(peers[0].handle==InvalidHandle&&!peers[0].connectSeen);
 // Reused handles also support early callbacks without reusing an old epoch.
 info.addr.text="static-c";server.cb->onAuthenticationComplete(info);subscribe(keyboard,info,1);const auto reusedEpoch=peers[0].epoch;assert(reusedEpoch!=previousEpoch&&peers[0].reports==2&&!peers[0].connectSeen);
 server.cb->onConnect(&server,info);assert(peers[0].epoch==reusedEpoch&&peers[0].reports==2&&peers[0].connectSeen);subscribe(keyboard,info,0);assert(peers[0].reports==0&&peers[1].reports==7);
 // Normal connect-first order still builds the same complete subscription set.
 server.cb->onDisconnect(&server,info,0);server.cb->onConnect(&server,info);const auto normalEpoch=peers[0].epoch;server.cb->onAuthenticationComplete(info);subscribe(pointer,info,1);subscribe(keyboard,info,1);subscribe(consumer,info,1);assert(peers[0].epoch==normalEpoch&&peers[0].reports==7&&peers[0].connectSeen);
 std::puts("BLE peer lifecycle: early restored auth/subscriptions, delayed first connect, dual peers, fresh connect, unsubscribe and handle reuse passed");
 std::puts("BLE production callbacks: admission, 2-peer capacity, late identity, failed auth, disconnect and advertising name passed");
}
'''.replace('PEER_STATE',peer_state).replace('UPDATE_PEER',update_peer).replace('REPORT_CALLBACKS',report_callbacks).replace('DIAGNOSTICS',diagnostics).replace('CALLBACKS',callbacks).replace('START',start)
with tempfile.TemporaryDirectory(prefix='iah-ble-pairing-') as temp:
 path=Path(temp);cpp=path/'test.cpp';binary=path/'test';cpp.write_text(source)
 compiler=os.environ.get('CXX');flags=[]
 if not compiler:
  clt=Path('/Library/Developer/CommandLineTools');compiler=str(clt/'usr/bin/clang++') if clt.exists() else 'c++'
  if clt.exists():
   sdk=clt/'SDKs/MacOSX.sdk';flags=['-isysroot',str(sdk),'-nostdinc++','-isystem',str(sdk/'usr/include/c++/v1')]
 subprocess.run([compiler,'-std=c++17',*flags,'-Wall','-Wextra','-Werror','-pedantic',str(cpp),'-o',str(binary)],check=True)
 subprocess.run([str(binary)],check=True)
