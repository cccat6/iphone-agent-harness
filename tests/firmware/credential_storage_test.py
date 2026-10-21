#!/usr/bin/env python3
"""Run production grant persistence and safe NVS diagnostics on the host."""
from pathlib import Path
import os,subprocess,tempfile
ROOT=Path(__file__).resolve().parents[2]
service=(ROOT/'firmware/IPhoneAutomationHarness/src/SecureService.h').read_text()
main=(ROOT/'firmware/IPhoneAutomationHarness/main.cpp').read_text()
def extract(source,signature):
 start=source.index(signature);brace=source.index('{',start);depth=1;end=brace+1
 while depth:
  depth+=(source[end]=='{')-(source[end]=='}');end+=1
 return source[start:end]
save=extract(service,'bool saveGrantAt(').replace('JsonDocument doc;','JsonDocument doc(&allocator);')
diagnostic=extract(main,'void nvsDiagnostic(')
setup=extract(main,'void setup()')
assert setup.index('preferences.begin(')<setup.index('removeObsoleteTlsStorage')<setup.index('WiFi.onEvent')<setup.index('WiFi.persistent(false)')<setup.index('WiFi.mode(')<setup.index('WiFi.begin(')<setup.index('startBle()')
assert 'nvsDiagnostic(out);' in extract(main,'void wifiDiagnostic()')
assert 'getString' not in diagnostic and 'put' not in diagnostic and 'remove' not in diagnostic
program=r'''
#include <ArduinoJson.h>
#include <cassert>
#include <cstdio>
#include <cstdlib>
#include <map>
#include <string>
#include "ADMISSION_HEADER"
using namespace iah;
bool failReserve=false,dropSerialization=false,failJson=false;
struct Allocator:ArduinoJson::Allocator{void* allocate(size_t n)override{return failJson?nullptr:std::malloc(n);}void deallocate(void* p)override{std::free(p);}void* reallocate(void* p,size_t n)override{return failJson?nullptr:std::realloc(p,n);}}allocator;
struct String:std::string{
 using std::string::string;using std::string::operator=;String()=default;String(const std::string& v):std::string(v){}explicit String(size_t n):std::string(std::to_string(n)){}
 bool reserve(size_t n){if(failReserve)return false;std::string::reserve(n);return true;}
 void push_back(char c){if(!dropSerialization)std::string::push_back(c);}String& append(const char* p){if(!dropSerialization)std::string::append(p);return *this;}String& append(const char* p,size_t n){if(!dropSerialization)std::string::append(p,n);return *this;}
};
struct Preferences{
 std::map<std::string,String> values;bool failWrite=false,partial=false,badRead=false;unsigned pointerWrites=0,byValueWrites=0,removes=0;
 String getString(const char* key,const char* fallback){if(badRead){badRead=false;return "bad-read";}auto found=values.find(key);return found==values.end()?String(fallback):found->second;}
 size_t putString(const char* key,const char* value){++pointerWrites;if(failWrite){if(partial)values[key]="partial";return 0;}values[key]=value;return std::strlen(value);}
 size_t putString(const char* key,const String value){++byValueWrites;return putString(key,value.c_str());}
 bool remove(const char* key){++removes;return values.erase(key)>0;}
};
struct Service{Preferences prefs_;SAVE};
using esp_err_t=int;constexpr esp_err_t ESP_OK=0;struct nvs_stats_t{size_t used_entries=0,free_entries=0,available_entries=0,total_entries=0,namespace_count=0;};esp_err_t statsError=0;unsigned statsReads=0;
esp_err_t nvs_get_stats(const char* partition,nvs_stats_t* out){assert(partition==nullptr);statsReads++;*out={100,530,404,630,4};return statsError;}
DIAGNOSTIC
int main(){
 Grant grant{"fixture-client",std::string(64,'a'),"https://igent.cc","phone",true,0};
 {Service s;s.prefs_.values={{"grant2","old"},{"owner","preserved"}};assert(s.saveGrantAt(2,grant));assert(s.prefs_.pointerWrites==1&&s.prefs_.byValueWrites==0);JsonDocument d;assert(!deserializeJson(d,s.prefs_.values.at("grant2")));assert(d["id"]==grant.clientId&&d["hash"]==grant.tokenHash&&d["target"]==grant.targetId);assert(s.prefs_.values.at("owner")=="preserved");}
 for(int failure:{0,1,2}){Service s;s.prefs_.values["grant0"]="old";failReserve=failure==0;dropSerialization=failure==1;failJson=failure==2;assert(!s.saveGrantAt(0,grant));assert(s.prefs_.pointerWrites==0&&s.prefs_.values.at("grant0")=="old");failReserve=dropSerialization=failJson=false;}
 {Service s;s.prefs_.values["grant0"]="old";s.prefs_.failWrite=true;assert(!s.saveGrantAt(0,grant));assert(s.prefs_.values.at("grant0")=="old"&&s.prefs_.byValueWrites==0);}
 {Service s;s.prefs_.failWrite=s.prefs_.partial=true;s.prefs_.values["owner"]="preserved";assert(!s.saveGrantAt(0,grant));assert(!s.prefs_.values.count("grant0")&&s.prefs_.removes==1&&s.prefs_.values.at("owner")=="preserved");}
 {Service s;assert(!s.saveGrantAt(MaxClients,grant));auto inactive=grant;inactive.active=false;assert(!s.saveGrantAt(0,inactive));assert(s.prefs_.pointerWrites==0);}
 {Service s;auto maximum=grant;maximum.clientId=std::string(80,'i');maximum.targetId=std::string(80,'t');maximum.origin="https://"+std::string(170,'h');assert(s.saveGrantAt(7,maximum));assert(s.prefs_.values.at("grant7").length()<1024&&s.prefs_.byValueWrites==0);}
 {JsonDocument d;nvsDiagnostic(d);assert(statsReads==1&&d["nvs"].size()==7&&d["nvs"]["ready"]==true&&d["nvs"]["usedEntries"]==100&&d["nvs"]["availableEntries"]==404&&d["nvs"]["namespaceCount"]==4);std::string text;serializeJson(d,text);assert(text.find("grant")==std::string::npos&&text.find("password")==std::string::npos&&text.find("token")==std::string::npos);statsError=123;JsonDocument failed;nvsDiagnostic(failed);assert(statsReads==2&&failed["nvs"].size()==2&&failed["nvs"]["ready"]==false&&failed["nvs"]["status"]==123);}
 std::puts("Production grant checked serialization, no String-value copy, NVS refusal and count-only diagnostics passed");
}
'''.replace('ADMISSION_HEADER',str(ROOT/'firmware/IPhoneAutomationHarness/src/Admission.h')).replace('SAVE',save).replace('DIAGNOSTIC',diagnostic)
with tempfile.TemporaryDirectory(prefix='iah-credential-storage-') as temp:
 folder=Path(temp);cpp=folder/'test.cpp';binary=folder/'test';cpp.write_text(program)
 compiler=os.environ.get('CXX');command=[compiler] if compiler else ['/Library/Developer/CommandLineTools/usr/bin/clang++','-isysroot','/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk','-nostdinc++','-isystem','/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/c++/v1']
 flags=['-std=c++17','-Wall','-Wextra','-Werror','-pedantic'];flags+=['-fsanitize=address,undefined','-fno-omit-frame-pointer'] if os.environ.get('RTC_SANITIZE')=='1' else []
 include=os.environ.get('ARDUINOJSON_INCLUDE',str(Path.home()/'Documents/Arduino/libraries/ArduinoJson/src'))
 subprocess.run([*command,*flags,'-I',include,str(cpp),'-o',str(binary)],check=True);subprocess.run([str(binary)],check=True)
