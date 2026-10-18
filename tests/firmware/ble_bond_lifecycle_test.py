#!/usr/bin/env python3
"""Run production bond eviction/retirement code with fault-injected host storage."""
from pathlib import Path
import os,re,subprocess,tempfile
ROOT=Path(__file__).resolve().parents[2]
main=(ROOT/'firmware/IPhoneAutomationHarness/main.cpp').read_text()
service=(ROOT/'firmware/IPhoneAutomationHarness/src/SecureService.h').read_text()
callbacks=main[main.index('class DeviceCallbacks:'):main.index('class ReportCallbacks:')]
retire=main[main.index('void retireMissingBonds(){'):main.index('void syncPeers(){')]
revoke=service[service.index(' bool inputBusy('):service.index(' bool configureFromSerial')]
boot=main[main.index(' for(size_t i=0;i<iah::MaxTargets;i++){'):main.index(' WiFi.onEvent(wifiEvent);')]
san=re.search(r'if\(!core_\.target\(target\)\)target\.clear\(\);',service).group()
source=r'''
#include <algorithm>
#include <atomic>
#include <cassert>
#include <cstdio>
#include <map>
#include <string>
#include <vector>
#include "ADMISSION_HEADER"
using namespace iah;
struct String:std::string{using std::string::string;String(const std::string& s):std::string(s){}String(size_t n):std::string(std::to_string(n)){}bool isEmpty()const{return empty();}};
struct Cut{};
struct Preferences{std::map<std::string,String> values;bool failRemove=false,cutAfterDelete=false;String getString(const char* key,const char* def){auto i=values.find(key);return i==values.end()?String(def):i->second;}bool remove(const char* key){if(failRemove)return false;bool had=values.erase(key);if(cutAfterDelete)throw Cut{};return had;}} preferences;
struct ble_addr_t{int type=1;std::string text;};
struct NimBLEAddress{ble_addr_t a;NimBLEAddress()=default;NimBLEAddress(ble_addr_t value):a(value){}int getType()const{return a.type;}std::string toString()const{return a.text;}bool operator==(const NimBLEAddress& b)const{return a.type==b.a.type&&a.text==b.a.text;}};
struct Info{NimBLEAddress id,ota;NimBLEAddress getIdAddress(){return id;}NimBLEAddress getAddress(){return ota;}};
struct Server{std::map<uint16_t,Info> online;std::vector<uint16_t> getPeerDevices(){std::vector<uint16_t> r;for(auto& p:online)r.push_back(p.first);return r;}Info getPeerInfoByHandle(uint16_t h){return online.at(h);}} server;
std::vector<ble_addr_t> bonds;bool failDelete=false,failRead=false;std::atomic_bool bondStateDirty{true};
struct NimBLEDevice{static Server* getServer(){return &server;}static int getNumBonds(){return bonds.size();}static NimBLEAddress getBondedAddress(int i){return NimBLEAddress(bonds.at(i));}static bool deleteBond(const NimBLEAddress& a){if(failDelete)return false;for(auto i=bonds.begin();i!=bonds.end();++i)if(NimBLEAddress(*i)==a){bonds.erase(i);return true;}return false;}};
int ble_store_util_bonded_peers(ble_addr_t* out,int* count,size_t capacity){if(failRead)return 1;assert(bonds.size()<=capacity);*count=bonds.size();std::copy(bonds.begin(),bonds.end(),out);return 0;}
constexpr int BLE_STORE_EVENT_FULL=1,BLE_STORE_EVENT_OVERFLOW=2,BLE_STORE_OBJ_TYPE_OUR_SEC=3,BLE_STORE_OBJ_TYPE_PEER_SEC=4,BLE_STORE_OBJ_TYPE_PEER_ADDR=5,BLE_STORE_OBJ_TYPE_CCCD=6,BLE_STORE_OBJ_TYPE_CSFC=7,BLE_HS_EUNKNOWN=8,BLE_HS_ESTORE_FAIL=9,BLE_HS_ESTORE_CAP=10;
struct Value{struct {ble_addr_t peer_addr;}sec,rpa_rec,cccd,csfc;};
struct ble_store_status_event{int event_code=BLE_STORE_EVENT_OVERFLOW;struct{int obj_type=BLE_STORE_OBJ_TYPE_OUR_SEC;Value* value=nullptr;}overflow;};
struct NimBLEDeviceCallbacks{virtual int onStoreStatus(ble_store_status_event*,void*)=0;virtual ~NimBLEDeviceCallbacks()=default;};
struct SinkMock:Sink{bool submit(uint16_t,const Event&)override{return true;}bool release(uint16_t,const Input&)override{return true;}}sink;
Core* core=nullptr;
struct SecureService{
 Admission auth_;Core& core_;uint16_t challengeHandle_=7;bool failSave=false;std::map<std::string,Grant> saved;
 explicit SecureService(Core& c):core_(c){}
 static uint64_t now(){return 2;}
 bool saveGrant(const Grant& grant){if(failSave)return false;saved[grant.clientId]=grant;return true;}
 REVOKE
 void restore(const Grant& g){auto target=g.targetId;SANITIZE auth_.install(g.clientId,g.tokenHash,g.origin,target);if(!target.empty())core_.bindClient(g.clientId,target);}
};SecureService* secureService=nullptr;
CALLBACKS
RETIRE
void loadMappings(){BOOT}
struct Fixture{
 Core c{"board","boot",sink};SecureService s{c};
 Fixture(){core=&c;secureService=&s;preferences=Preferences{};bonds={{1,"a"},{1,"b"}};server.online.clear();failDelete=failRead=false;bondStateDirty=true;preferences.values={{"bond0","1:a"},{"target0","old-a"},{"bond1","1:b"},{"target1","old-b"}};loadMappings();s.auth_.install("owner-a",std::string(64,'a'),"https://igent.cc","old-a");s.auth_.install("owner-b",std::string(64,'b'),"https://igent.cc","old-b");c.bindClient("owner-a","old-a");c.bindClient("owner-b","old-b");for(const auto& g:s.auth_.grants())if(g.active)s.saved[g.clientId]=g;}
};
int overflow(int kind=BLE_STORE_OBJ_TYPE_OUR_SEC,const char* incoming="c") {DeviceCallbacks cb;Value v;v.sec.peer_addr=v.rpa_rec.peer_addr=v.cccd.peer_addr=v.csfc.peer_addr={1,incoming};ble_store_status_event e;e.overflow={kind,&v};return static_cast<NimBLEDeviceCallbacks&>(cb).onStoreStatus(&e,nullptr);}
int main(){
 {Fixture f;server.online[11]={{ble_addr_t{1,"a"}},{ble_addr_t{1,"rotating-a"}}};assert(f.c.connect("1:a",11,true,true,true)==Code::Accepted);assert(overflow()==0);assert(bonds.size()==1&&bonds[0].text=="a");assert(f.s.auth_.begin("owner-b","old-b","challenge","12345678",1));f.s.auth_.typed();retireMissingBonds();assert(f.c.target("old-a")&&f.c.target("old-a")->connHandle==11);assert(!f.c.target("old-b"));assert(f.s.auth_.client("owner-b")->targetId.empty());assert(f.s.auth_.authenticate(std::string(64,'b'),"https://igent.cc"));assert(!f.s.auth_.active(2));assert(f.s.saved.at("owner-b").targetId.empty());assert(f.c.registerBond("new-c","1:c")==Code::Accepted);assert(f.c.connect("1:c",22,true,true,true)==Code::Accepted);assert(f.c.lease("new-c","owner-b","old-proof",1000,3)==Code::Unauthorized);}
 {Fixture f;server.online[1]={{ble_addr_t{1,"a"}},{ble_addr_t{1,"a"}}};server.online[2]={{ble_addr_t{1,"b"}},{ble_addr_t{1,"b"}}};assert(overflow()==BLE_HS_ESTORE_CAP);assert(bonds.size()==2);}
 {Fixture f;assert(overflow(BLE_STORE_OBJ_TYPE_CCCD,"a")==0);assert(bonds.size()==1&&bonds[0].text=="a");}
 {Fixture f;failDelete=true;assert(overflow()==BLE_HS_ESTORE_FAIL);assert(bonds.size()==2);}
 {Fixture f;bonds.erase(bonds.begin()+1);failRead=true;retireMissingBonds();assert(f.c.target("old-b")&&bondStateDirty);failRead=false;preferences.failRemove=true;retireMissingBonds();assert(f.c.target("old-b")&&f.s.auth_.client("owner-b")->targetId=="old-b"&&bondStateDirty);preferences.failRemove=false;retireMissingBonds();assert(!f.c.target("old-b"));}
 {Fixture f;bonds.erase(bonds.begin()+1);f.s.failSave=true;retireMissingBonds();assert(!f.c.target("old-b")&&f.s.auth_.client("owner-b")->targetId.empty());assert(f.s.saved.at("owner-b").targetId=="old-b");Core reboot{"board","reboot",sink};SecureService restarted{reboot};core=&reboot;loadMappings();restarted.restore(f.s.saved.at("owner-b"));assert(restarted.auth_.authenticate(std::string(64,'b'),"https://igent.cc"));assert(restarted.auth_.client("owner-b")->targetId.empty());}
 {Fixture f;bonds.erase(bonds.begin()+1);preferences.cutAfterDelete=true;try{retireMissingBonds();assert(false);}catch(const Cut&){}assert(f.s.saved.at("owner-b").targetId=="old-b");preferences.cutAfterDelete=false;Core reboot{"board","reboot",sink};SecureService restarted{reboot};core=&reboot;loadMappings();assert(!reboot.target("old-b"));restarted.restore(f.s.saved.at("owner-b"));assert(restarted.auth_.client("owner-b")->targetId.empty());assert(restarted.auth_.authenticate(std::string(64,'b'),"https://igent.cc"));}
 {Fixture f;assert(f.s.auth_.begin("owner-a","old-a","other-test","12345678",1));bonds.erase(bonds.begin()+1);retireMissingBonds();assert(f.s.auth_.active(2)&&f.s.challengeHandle_==7&&f.c.target("old-b")&&bondStateDirty);f.s.auth_.typed();retireMissingBonds();assert(!f.c.target("old-b")&&f.s.auth_.active(2));}
 {Fixture f;assert(f.c.connect("1:b",22,true,true,true)==Code::Accepted);bonds.erase(bonds.begin()+1);retireMissingBonds();assert(f.c.target("old-b"));f.c.disconnect(22,10);bondStateDirty=true;retireMissingBonds();assert(!f.c.target("old-b"));}
 {Fixture f;DeviceCallbacks cb;ble_store_status_event e;e.event_code=BLE_STORE_EVENT_FULL;assert(static_cast<NimBLEDeviceCallbacks&>(cb).onStoreStatus(&e,nullptr)==0&&bonds.size()==2);e.event_code=999;assert(static_cast<NimBLEDeviceCallbacks&>(cb).onStoreStatus(&e,nullptr)==BLE_HS_EUNKNOWN&&bonds.size()==2);}
 {Fixture f;bonds.erase(bonds.begin()+1);f.c.target("old-a")->running=true;retireMissingBonds();assert(f.c.target("old-b")&&preferences.values.count("bond1")&&bondStateDirty);f.c.target("old-a")->running=false;retireMissingBonds();assert(!f.c.target("old-b"));}
 std::puts("11 production bond lifecycle scenarios passed, including active-peer protection, storage failures and reboot revocation");
}
'''.replace('ADMISSION_HEADER',str(ROOT/'firmware/IPhoneAutomationHarness/src/Admission.h')).replace('REVOKE',revoke).replace('SANITIZE',san).replace('CALLBACKS',callbacks).replace('RETIRE',retire).replace('BOOT',boot)
with tempfile.TemporaryDirectory(prefix='iah-bond-lifecycle-') as temp:
 path=Path(temp);cpp=path/'test.cpp';binary=path/'test';cpp.write_text(source)
 compiler=os.environ.get('CXX');flags=[]
 if not compiler:
  clt=Path('/Library/Developer/CommandLineTools');compiler=str(clt/'usr/bin/clang++') if clt.exists() else 'c++'
  if clt.exists():
   sdk=clt/'SDKs/MacOSX.sdk';flags=['-isysroot',str(sdk),'-nostdinc++','-isystem',str(sdk/'usr/include/c++/v1')]
 subprocess.run([compiler,'-std=c++17',*flags,'-Wall','-Wextra','-Werror','-pedantic',str(cpp),'-o',str(binary)],check=True)
 subprocess.run([str(binary)],check=True)
