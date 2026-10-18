#!/usr/bin/env python3
"""Execute production BLE callbacks and initialization against a host adapter.

No radio/serial calls: verifies pairing admission, identity timing and packet sizing.
"""
from pathlib import Path
import os, subprocess, tempfile
ROOT=Path(__file__).resolve().parents[2]
main=(ROOT/'firmware/IPhoneAutomationHarness/main.cpp').read_text()
callbacks=main[main.index('class ServerCallbacks:'):main.index('class DeviceCallbacks:')]
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
struct Addr{int type=1;std::string text="random-before-identity";int getType(){return type;}std::string toString(){return text;}};
struct NimBLEConnInfo{uint16_t handle=7;bool encrypted=false,bonded=false;Addr addr;uint16_t getConnHandle(){return handle;}Addr getIdAddress(){return addr;}bool isEncrypted(){return encrypted;}bool isBonded(){return bonded;}};
struct Peer{uint16_t handle=InvalidHandle;};Peer peers[2];int peersMux=0;std::atomic_bool bondStateDirty{false};
#define portENTER_CRITICAL(x) ((void)(x))
#define portEXIT_CRITICAL(x) ((void)(x))
char knownIdentities[2][32]{};
struct Gate{bool pairingAllowed(){return false;}};std::atomic<Gate*> bleService{nullptr};
int updates=0,newConnections=0;void updatePeer(NimBLEConnInfo&,bool fresh=false){updates++;if(fresh)newConnections++;}
struct NimBLEServer;
struct NimBLEServerCallbacks{virtual ~NimBLEServerCallbacks()=default;virtual void onConnect(NimBLEServer*,NimBLEConnInfo&){};virtual void onAuthenticationComplete(NimBLEConnInfo&){};virtual void onIdentity(NimBLEConnInfo&){};virtual void onDisconnect(NimBLEServer*,NimBLEConnInfo&,int){}};
struct NimBLECharacteristic{void setCallbacks(void*){}};NimBLECharacteristic *mouseReport=nullptr,*keyboardReport=nullptr,*consumerReport=nullptr;
struct ReportCallbacks{explicit ReportCallbacks(int){}};
struct Advertising{bool scan=false;int advBytes=3,scanBytes=0,starts=0;std::string name;void setAppearance(int){advBytes+=4;}void addServiceUUID(int){advBytes+=4;}void enableScanResponse(bool value){scan=value;}bool setName(const char* value){name=value;(scan?scanBytes:advBytes)+=name.size()+2;return advBytes<=31&&scanBytes<=31;}bool start(){assert(advBytes<=31&&scanBytes<=31);starts++;return true;}};
struct NimBLEServer{int count=1,disconnects=0;NimBLEServerCallbacks* cb=nullptr;int getConnectedCount(){return count;}void disconnect(uint16_t){disconnects++;}void updateConnParams(uint16_t,int,int,int,int){}void setCallbacks(NimBLEServerCallbacks* value){cb=value;}void advertiseOnDisconnect(bool){}void start(){}};
NimBLEServer server;Advertising advertising;
struct DeviceCallbacks{};
struct NimBLEDevice{static void setDeviceCallbacks(DeviceCallbacks*){}static inline std::string name;static void init(const char* value){name=value;}static void setSecurityAuth(bool bond,bool mitm,bool sc){assert(bond&&!mitm&&sc);}static void setSecurityIOCap(int){}static NimBLEServer* createServer(){return &server;}static NimBLEServer* getServer(){return &server;}static Advertising* getAdvertising(){return &advertising;}};
struct Service{int getUUID(){return 0x1812;}};
struct NimBLEHIDDevice{explicit NimBLEHIDDevice(NimBLEServer*){}NimBLECharacteristic* getInputReport(int){return new NimBLECharacteristic;}void getOutputReport(int){}void setManufacturer(const char*){}void setPnp(int,int,int,int){}void setHidInfo(int,int){}void setReportMap(const uint8_t*,size_t){}void setBatteryLevel(int){}Service* getHidService(){static Service service;return &service;}};
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
 std::puts("BLE production callbacks: admission, 2-peer capacity, late identity, failed auth, disconnect and advertising name passed");
}
'''.replace('CALLBACKS',callbacks).replace('START',start)
with tempfile.TemporaryDirectory(prefix='iah-ble-pairing-') as temp:
 path=Path(temp);cpp=path/'test.cpp';binary=path/'test';cpp.write_text(source)
 compiler=os.environ.get('CXX');flags=[]
 if not compiler:
  clt=Path('/Library/Developer/CommandLineTools');compiler=str(clt/'usr/bin/clang++') if clt.exists() else 'c++'
  if clt.exists():
   sdk=clt/'SDKs/MacOSX.sdk';flags=['-isysroot',str(sdk),'-nostdinc++','-isystem',str(sdk/'usr/include/c++/v1')]
 subprocess.run([compiler,'-std=c++17',*flags,'-Wall','-Wextra','-Werror','-pedantic',str(cpp),'-o',str(binary)],check=True)
 subprocess.run([str(binary)],check=True)
