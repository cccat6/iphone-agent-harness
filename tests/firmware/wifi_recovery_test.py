#!/usr/bin/env python3
"""Exercise production Wi-Fi recovery methods without a radio or credentials."""
from pathlib import Path
import os, subprocess, tempfile

ROOT = Path(__file__).resolve().parents[2]
service = (ROOT / 'firmware/IPhoneAutomationHarness/src/SecureService.h').read_text()
main = (ROOT / 'firmware/IPhoneAutomationHarness/main.cpp').read_text()

def function(source, signature):
    start = source.index(signature)
    brace = source.index('{', start)
    depth = 1
    end = brace + 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start:end]

methods = '\n'.join(function(service, signature) for signature in [
    'bool hasNetworkAddress()const', 'void restorePreviousNetwork()', 'void updateNetwork()',
    'bool finishSetup()', 'bool networkReady()const',
])
loader = function(main, 'void savedNetwork(String& ssid,String& password)')
# Startup, recovery and provisioning snapshots must share the same loader.
assert 'wifiGotIps,savedNetwork)' in main
assert 'if(!previousCredentialsOverride_){previousNetwork_=prefs_.getString("network","");loadSavedNetwork_(previousSsid_,previousPassword_);}' in service
assert 'reply["status"]=wifiJoin_.candidateFailed()?"failed":connected?"connected":wifiJoin_.name();reply["configured"]=connected&&!wifiJoin_.candidateFailed();' in service
start_server = service[service.index('if(httpd_start(&http_,&cfg)'):]
assert start_server.index('httpd_register_uri_handler') < start_server.index('httpReady_.store(true)')
stop_server = function(service, 'void openSetup()')
assert stop_server.index('httpReady_.store(false)') < stop_server.index('httpd_stop(http_)')
assert function(service, 'bool networkReady()const') == 'bool networkReady()const{return httpReady_.load();}'

source = r'''
#include <atomic>
#include <cassert>
#include <cstdio>
#include <map>
#include <string>
#include <utility>
#include <vector>
#include "STATE_HEADER"
using namespace iah;
struct String:std::string{using std::string::string;using std::string::operator=;String(const std::string& s):std::string(s){}bool isEmpty()const{return empty();}};
struct Preferences{
 std::map<std::string,String> values;bool failCommit=false,failRollback=false;unsigned writes=0;
 String getString(const char* key,const char* fallback){auto found=values.find(key);return found==values.end()?String(fallback):found->second;}
 size_t putString(const char* key,const String& value){++writes;if(failCommit&&value=="candidate-json"){values[key]=value;return 0;}if(failRollback&&value=="saved-json")return 0;values[key]=value;return value.length();}
 bool remove(const char* key){++writes;if(failRollback)return false;return values.erase(key)>0;}
}preferences;
struct JsonDocument{std::map<std::string,String> values;struct Value{String value;const char* operator|(const char* fallback)const{return value.empty()?fallback:value.c_str();}};Value operator[](const char* key){return {values[key]};}};
int deserializeJson(JsonDocument& json,const String& value){if(value=="saved-json"){json.values={{"ssid","json-network"},{"password","json-secret"}};return 0;}if(value=="candidate-json"){json.values={{"ssid","candidate-network"},{"password","candidate-secret"}};return 0;}return 1;}
#define IAH_WIFI_SSID "build-network"
#define IAH_WIFI_PASSWORD "build-secret"
LOADER
struct IP{unsigned operator[](unsigned index)const{return index==0?192:1;}};
constexpr int WL_CONNECTED=3,WL_DISCONNECTED=6;
struct Wifi{
 bool connected=false;String ssid;std::vector<std::pair<String,String>> starts;unsigned disconnects=0;
 int status()const{return connected?WL_CONNECTED:WL_DISCONNECTED;}
 IP localIP()const{return {};}
 String SSID()const{return ssid;}
 void persistent(bool){}
 void disconnect(bool,bool){++disconnects;connected=false;}
 void begin(const char* name,const char* password){ssid=name;starts.emplace_back(name,password);}
}WiFi;
struct Fixture{
 Preferences& prefs_=preferences;std::atomic<uint32_t> wifiEpoch_{0};void (&loadSavedNetwork_)(String&,String&)=savedNetwork;
 WifiJoinState wifiJoin_;SavedNetworkRetry savedRetry_;SetupDeadline setupDeadline_;
 String candidateNetwork_,candidateSsid_,candidatePassword_,candidateOrigin_,previousNetwork_,previousSsid_,previousPassword_,origin_;
 bool startCandidate_=false,previousCredentialsOverride_=false,configComplete_=true,apActive_=false,recoverySetup_=false;std::atomic_bool httpReady_{false};uint64_t clock=0;unsigned setupOpens=0;
 Fixture(){preferences=Preferences{};WiFi=Wifi{};}
 uint64_t now()const{return clock;}
 void openSetup(){setupDeadline_.opened();httpReady_=false;apActive_=true;recoverySetup_=false;++setupOpens;}
 void candidate(){if(!previousCredentialsOverride_){previousNetwork_=prefs_.getString("network","");loadSavedNetwork_(previousSsid_,previousPassword_);}candidateNetwork_="candidate-json";candidateSsid_="candidate-network";candidatePassword_="candidate-secret";candidateOrigin_="https://fixture.invalid";startCandidate_=true;wifiJoin_.begin(now(),wifiEpoch_.load());}
 METHODS
};
int main(){
 // A saved network retries forever at 15, 30, then 60 second intervals.
 {Fixture f;preferences.values["network"]="saved-json";f.updateNetwork();for(uint64_t at:{15000ULL,45000ULL,105000ULL,165000ULL,3600000ULL}){f.clock=at;f.updateNetwork();assert(WiFi.starts.back().first=="json-network");}assert(WiFi.starts.size()==5);assert(f.savedRetry_.attempts()==5);assert(f.apActive_&&f.recoverySetup_);WiFi.connected=true;f.clock=3600100;f.updateNetwork();assert(!f.recoverySetup_);assert(f.setupDeadline_.due(true,f.clock+2000));assert(f.savedRetry_.attempts()==0&&f.savedRetry_.nextAt()==0);}
 // Recovery uses the exact startup precedence: JSON, legacy keys, then build defaults.
 for(int kind:{0,1,2}){Fixture f;if(kind==0)preferences.values["network"]="saved-json";if(kind==1)preferences.values={{"network","invalid-json"},{"ssid","legacy-network"},{"password","legacy-secret"}};String expectedName,expectedPassword;savedNetwork(expectedName,expectedPassword);f.updateNetwork();f.clock=15000;f.updateNetwork();assert(WiFi.starts.size()==1);assert(WiFi.starts[0]==std::make_pair(expectedName,expectedPassword));}
 // Explicit candidate setup owns the radio, including the entire 30s timeout.
 {Fixture f;preferences.values["network"]="saved-json";f.candidate();f.updateNetwork();assert(WiFi.starts.size()==1&&WiFi.starts[0].first=="candidate-network");f.clock=15000;f.updateNetwork();assert(WiFi.starts.size()==1);f.clock=29999;f.updateNetwork();assert(WiFi.starts.size()==1);f.clock=30000;f.updateNetwork();assert(WiFi.starts.size()==2&&WiFi.starts.back().first=="json-network");assert(f.wifiJoin_.phase()==WifiJoinState::Phase::Idle&&f.wifiJoin_.candidateFailed());assert(std::string(f.wifiJoin_.name())=="failed");f.clock=45000;f.updateNetwork();assert(WiFi.starts.size()==3&&WiFi.starts.back().first=="json-network");WiFi.connected=true;assert(f.finishSetup());assert(f.wifiJoin_.candidateFailed());}
 // A failed candidate on the build-default path restores that exact startup network.
 {Fixture f;f.candidate();f.updateNetwork();f.clock=30000;f.updateNetwork();assert(WiFi.starts.back().first=="build-network");assert(f.wifiJoin_.candidateFailed());assert(f.previousPassword_.empty());}
 // Failed durable commit plus failed rollback cannot retry the dirty candidate.
 {Fixture f;preferences.values["network"]="saved-json";preferences.failCommit=preferences.failRollback=true;f.candidate();f.updateNetwork();WiFi.connected=true;++f.wifiEpoch_;f.clock=10;f.updateNetwork();assert(f.previousCredentialsOverride_);assert(preferences.getString("network","")=="candidate-json");assert(WiFi.starts.back().first=="json-network");f.clock=15010;f.updateNetwork();assert(WiFi.starts.back().first=="json-network");f.clock=45010;f.updateNetwork();assert(WiFi.starts.back().first=="json-network");assert(f.previousNetwork_=="saved-json");preferences.failCommit=preferences.failRollback=false;f.candidate();f.updateNetwork();WiFi.connected=true;++f.wifiEpoch_;f.clock=45020;f.updateNetwork();assert(!f.previousCredentialsOverride_);assert(!f.wifiJoin_.candidateFailed());assert(f.previousPassword_.empty());}
 // Deleting a failed first candidate can fail too; preserve legacy/default credentials.
 {Fixture f;preferences.failCommit=preferences.failRollback=true;f.candidate();f.updateNetwork();WiFi.connected=true;++f.wifiEpoch_;f.clock=10;f.updateNetwork();assert(f.previousCredentialsOverride_);assert(WiFi.starts.back().first=="build-network");f.clock=15010;f.updateNetwork();assert(WiFi.starts.back().first=="build-network");}
 // The RTC reader consumes an independent atomic flag, not the mutable HTTP handle.
 {Fixture f;assert(!f.networkReady());f.httpReady_=true;assert(f.networkReady());f.openSetup();assert(!f.networkReady());}
 std::puts("Production Wi-Fi recovery, startup credential precedence, rollback and atomic readiness scenarios passed");
}
'''.replace('STATE_HEADER', str(ROOT / 'firmware/IPhoneAutomationHarness/src/SetupState.h')).replace('LOADER', loader).replace('METHODS', methods)

with tempfile.TemporaryDirectory(prefix='iah-wifi-recovery-') as directory:
    cpp = Path(directory) / 'test.cpp'
    binary = Path(directory) / 'test'
    cpp.write_text(source)
    compiler = os.environ.get('CXX')
    flags = ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-pedantic']
    clt = Path('/Library/Developer/CommandLineTools')
    if not compiler and (clt / 'usr/bin/clang++').exists():
        compiler = str(clt / 'usr/bin/clang++')
        flags += ['-isysroot', str(clt / 'SDKs/MacOSX.sdk'), '-nostdinc++', '-isystem', str(clt / 'SDKs/MacOSX.sdk/usr/include/c++/v1')]
    subprocess.run([compiler or 'c++', *flags, str(cpp), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
