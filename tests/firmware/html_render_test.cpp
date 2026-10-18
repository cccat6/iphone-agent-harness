#include <cassert>
#include <fstream>
#include <cstdio>
#include <string>
#include "../../firmware/IPhoneAutomationHarness/src/LanBridgePage.h"
#include "../../firmware/IPhoneAutomationHarness/src/WifiSetupPage.h"
#include "../../firmware/IPhoneAutomationHarness/src/BridgeSettingsPage.h"
#include "../../firmware/IPhoneAutomationHarness/src/BridgeSettings.h"
#if ARDUINOJSON_VERSION_MAJOR != 7 || ARDUINOJSON_VERSION_MINOR != 4 || ARDUINOJSON_VERSION_REVISION != 3
#error Pinned ArduinoJson 7.4.3 required
#endif
static size_t count(const std::string& text,const std::string& needle){size_t n=0,at=0;while((at=text.find(needle,at))!=std::string::npos){n++;at+=needle.size();}return n;}
static void completePage(const std::string& page){assert(page.rfind("<!doctype html>",0)==0);assert(count(page,"<script>")==1);assert(count(page,"</script>")==1);}
static void roundTrip(const std::string& page,const std::string& marker,const std::string& expected){auto start=page.find(marker);assert(start!=std::string::npos);start+=marker.size();auto end=page.find(';',start);assert(end!=std::string::npos);JsonDocument doc;assert(!deserializeJson(doc,page.substr(start,end-start)));assert(doc.as<std::string>()==expected);}
int main(int argc,char** argv){
 const auto defaults=iah::readBridgeSettings("");assert(defaults.hostname=="igent"&&!defaults.pairingCodeRequired);
 const auto changed=iah::readBridgeSettings(R"({"hostname":"my-bridge","pairingCodeRequired":true})");assert(changed.hostname=="my-bridge"&&changed.pairingCodeRequired);
 for(const auto& value:{"", "-x", "x-", "UPPER", "a.b", "a/b", "https:x"})assert(!iah::validBridgeHostname(value));
 assert(!iah::validBridgeHostname(std::string(64,'a')));assert(iah::validBridgeHostname(std::string(63,'a')));
 for(const auto& value:{"{", "{}", R"({"hostname":"evil.local","pairingCodeRequired":true})", R"({"hostname":"ok","pairingCodeRequired":"false"})"}){const auto fallback=iah::readBridgeSettings(value);assert(fallback.hostname=="igent"&&!fallback.pairingCodeRequired);}
 std::string settings=iah::renderBridgeSettingsPage();completePage(settings);assert(settings.find("/v1/settings")!=std::string::npos);
 // Reproduce the actual ArduinoJson 7 destination replacement that caused the board bug.
 JsonDocument value;value.set("https://igent.cc");std::string broken="<!doctype html><script>const harnessOrigin=";serializeJson(value,broken);assert(broken=="\"https://igent.cc\"");
 auto helper=iah::renderLanBridgePage(std::string("https://igent.cc"));completePage(helper);assert(helper.find("id=\"back\"")!=std::string::npos);roundTrip(helper,"const harnessOrigin=","https://igent.cc");
 auto setup=iah::renderWifiSetupPage(std::string(64,'a'));completePage(setup);assert(setup.find("<form id=\"f\">")!=std::string::npos);assert(setup.find("name=\"ssid\"")!=std::string::npos);assert(setup.find("name=\"password\"")!=std::string::npos);assert(setup.find("f.onsubmit=async")!=std::string::npos);roundTrip(setup,"const owner=",std::string(64,'a'));
 const std::string escaped="quote\" slash\\ newline\n tab\t </script><script>injected</script>";
 for(const auto& page:{iah::renderLanBridgePage(escaped),iah::renderWifiSetupPage(escaped)}){completePage(page);assert(page.find("</script><script>")==std::string::npos);assert(page.find("\\u003c/script>")!=std::string::npos);}
 roundTrip(iah::renderLanBridgePage(escaped),"const harnessOrigin=",escaped);roundTrip(iah::renderWifiSetupPage(escaped),"const owner=",escaped);
 if(argc==2){std::ofstream(std::string(argv[1])+"/helper.html")<<helper;std::ofstream(std::string(argv[1])+"/setup.html")<<setup;std::ofstream(std::string(argv[1])+"/settings.html")<<settings;}
 std::puts("Actual ArduinoJson HTML rendering passed: replacement regression, complete helper/setup pages, script-boundary escaping and JSON round trip");
}
