#include "../../firmware/IPhoneAutomationHarness/src/HttpHtmlResponse.h"
#include "../../firmware/IPhoneAutomationHarness/src/BridgeSettingsPage.h"
#include <cassert>
#include <string>
#include <vector>
#include <iostream>
using namespace iah;
static constexpr int Timeout=-3;
int main(){
 size_t cases=0;const std::string page=renderBridgeSettingsPage(std::string(R"({"hostname":"igent.local","boardId":"host-http-test","harnessURL":"https://igent.cc/","rtc":{"ip":"192.168.0.125","port":18948,"fingerprint":"ABABABABABABABABABABABABABABABABABABABABABABABABABABABABABABABAB"}})"));assert(page.size()>15000);
 for(size_t limit:{size_t{1},size_t{7},size_t{1024}}){
  std::string output;uint64_t now=0;std::vector<size_t> writes;
  const auto result=sendHttpHtmlResponse(page.data(),page.size(),[&](const char* data,size_t count){assert(count<=1024);writes.push_back(count);const size_t accepted=std::min(count,limit);output.append(data,accepted);return HttpHtmlAttempt{static_cast<int>(accepted),0};},[&]{return now;},[]{assert(false);},Timeout);
  assert(result.complete&&result.bodyBytes==page.size()&&result.durationMs==0);const size_t end=output.find("\r\n\r\n");assert(end!=std::string::npos&&result.headerBytes==end+4);assert(output.substr(end+4)==page);assert(output.find("Content-Length: "+std::to_string(page.size())+"\r\n")!=std::string::npos);assert(output.find("Cache-Control: no-store\r\n")!=std::string::npos);assert(output.find("Connection: close\r\n")!=std::string::npos);assert(output.find("Content-Security-Policy:")!=std::string::npos);assert(writes[0]==end+4);cases++;
 }
 // The first sink call carries the complete response header, not separate fields.
 {std::string output;std::vector<size_t> writes;auto result=sendHttpHtmlResponse(page.data(),page.size(),[&](const char* data,size_t count){writes.push_back(count);output.append(data,count);return HttpHtmlAttempt{static_cast<int>(count),0};},[]{return uint64_t{0};},[]{assert(false);},Timeout);assert(result.complete);assert(writes.size()==1+(page.size()+1023)/1024);assert(output.find("\r\n\r\n")+4==writes[0]);cases++;}
 for(int failure:{0,-1,-2,1025}){
  size_t calls=0;auto result=sendHttpHtmlResponse(page.data(),page.size(),[&](const char*,size_t count){calls++;return calls==1?HttpHtmlAttempt{static_cast<int>(count),0}:HttpHtmlAttempt{failure,123};},[]{return uint64_t{0};},[]{assert(false);},Timeout);
  assert(!result.complete&&std::string(result.stage)=="body"&&result.headerBytes>0&&result.bodyBytes==0&&result.code==failure&&result.errorNumber==123&&calls==2);cases++;
 }
 {size_t calls=0;auto result=sendHttpHtmlResponse(page.data(),page.size(),[&](const char*,size_t){return ++calls==1?HttpHtmlAttempt{17,0}:HttpHtmlAttempt{-1,104};},[]{return uint64_t{0};},[]{assert(false);},Timeout);assert(!result.complete&&std::string(result.stage)=="headers"&&result.headerBytes==17&&result.bodyBytes==0&&result.errorNumber==104&&calls==2);cases++;}
 // Timeout may retry only the unsent suffix, including after positive short writes.
 {size_t calls=0;uint64_t now=0;std::string output;auto result=sendHttpHtmlResponse(page.data(),page.size(),[&](const char* data,size_t count){calls++;if(calls==2||calls==4){now+=2000;return HttpHtmlAttempt{Timeout,11};}const size_t accepted=std::min(count,size_t{19});output.append(data,accepted);return HttpHtmlAttempt{static_cast<int>(accepted),0};},[&]{return now;},[&]{now+=1;},Timeout);assert(result.complete&&result.durationMs==4002);const auto end=output.find("\r\n\r\n");assert(output.substr(end+4)==page);assert(result.bodyBytes==page.size());cases++;}
 // An unresponsive sink is bounded by the total deadline, even if it returns
 // timeout immediately rather than waiting for the socket's two-second limit.
 {uint64_t now=0;size_t calls=0;auto result=sendHttpHtmlResponse(page.data(),page.size(),[&](const char*,size_t){calls++;return HttpHtmlAttempt{Timeout,11};},[&]{return now;},[&]{now+=1000;},Timeout);assert(!result.complete&&calls==10&&result.durationMs==10000&&result.headerBytes==0&&result.bodyBytes==0);cases++;}
 {uint64_t now=0;size_t calls=0;auto result=sendHttpHtmlResponse(page.data(),page.size(),[&](const char*,size_t count){calls++;now+=5000;return HttpHtmlAttempt{static_cast<int>(count),0};},[&]{return now;},[]{assert(false);},Timeout);assert(!result.complete&&calls==2&&result.durationMs==10000&&result.bodyBytes==1024);cases++;}
 {size_t calls=0;auto result=sendHttpHtmlResponse(nullptr,1,[&](const char*,size_t){calls++;return HttpHtmlAttempt{0,0};},[]{return uint64_t{0};},[]{},Timeout);assert(!result.complete&&calls==0);cases++;}
 const std::string information=R"({"hostname":"igent.local","boardId":"host-http-test","harnessURL":"https://igent.cc/","rtc":{"ip":"192.168.0.125","port":18948,"fingerprint":"ABABABABABABABABABABABABABABABABABABABABABABABABABABABABABABABAB"}})";
 const auto parts=bridgeSettingsPageParts();std::string injection;assert(buildBridgeInformationInjection(information,injection,[](std::string& value,size_t count){value.reserve(count);return true;}));assert(injection==renderHtmlJson("const bridgeInformation=JSON.parse(",information,");"));
 assert(parts.prefix&&parts.suffix);const HttpHtmlSegment segments[]={{parts.prefix,parts.prefixLength},{injection.data(),injection.size()},{parts.suffix,parts.suffixLength}};
 assert(std::string(parts.prefix,parts.prefixLength)+injection+std::string(parts.suffix,parts.suffixLength)==page);
 // No complete page buffer is passed to production's segmented sender. The
 // contiguous renderer remains an oracle for exactly the same HTTP body bytes.
 for(size_t limit:{size_t{7},size_t{1024}}){std::string output;uint64_t now=0;bool retried=false;
  const auto result=sendHttpHtmlSegments(segments,3,[&](const char* data,size_t count){if(data==injection.data()&&!retried){retried=true;now+=2000;return HttpHtmlAttempt{Timeout,11};}assert(count<=1024);const auto n=std::min(count,limit);output.append(data,n);return HttpHtmlAttempt{static_cast<int>(n),0};},[&]{return now;},[&]{now++;},Timeout);
  assert(result.complete&&result.bodyBytes==page.size()&&retried);const auto end=output.find("\r\n\r\n");assert(output.substr(end+4)==page);assert(output.find("Content-Length: "+std::to_string(page.size())+"\r\n")!=std::string::npos);cases++;
 }
 {size_t body=0;bool header=true;auto result=sendHttpHtmlSegments(segments,3,[&](const char*,size_t count){if(header){header=false;return HttpHtmlAttempt{static_cast<int>(count),0};}if(body==parts.prefixLength+5)return HttpHtmlAttempt{-1,104};const size_t n=std::min(count,parts.prefixLength+5-body);body+=n;return HttpHtmlAttempt{static_cast<int>(n),0};},[]{return uint64_t{0};},[]{assert(false);},Timeout);assert(!result.complete&&result.bodyBytes==parts.prefixLength+5&&std::string(result.stage)=="body");cases++;}
 {const HttpHtmlSegment empty[]={{nullptr,0},{"x",1},{nullptr,0}};std::string output;auto result=sendHttpHtmlSegments(empty,3,[&](const char* data,size_t count){output.append(data,count);return HttpHtmlAttempt{static_cast<int>(count),0};},[]{return uint64_t{0};},[]{},Timeout);assert(result.complete&&result.bodyBytes==1&&output.back()=='x');cases++;}
 {const HttpHtmlSegment overflow[]={{"x",std::numeric_limits<size_t>::max()},{"y",1}};size_t calls=0;auto result=sendHttpHtmlSegments(overflow,2,[&](const char*,size_t){calls++;return HttpHtmlAttempt{0,0};},[]{return uint64_t{0};},[]{},Timeout);assert(!result.complete&&calls==0);cases++;}
 {const HttpHtmlSegment invalid[]={{nullptr,1}};size_t calls=0;auto result=sendHttpHtmlSegments(invalid,1,[&](const char*,size_t){calls++;return HttpHtmlAttempt{0,0};},[]{return uint64_t{0};},[]{},Timeout);assert(!result.complete&&calls==0);cases++;}
 {const std::string hostile=R"({"hostname":"quote\" slash\\ </script><script>unsafe</script>"})";std::string output;assert(buildBridgeInformationInjection(hostile,output,[](std::string& value,size_t count){value.reserve(count);return true;}));assert(output==renderHtmlJson("const bridgeInformation=JSON.parse(",hostile,");"));assert(output.find("</script>")==std::string::npos);JsonDocument decoded;const auto start=output.find('(')+1;assert(!deserializeJson(decoded,output.substr(start,output.size()-start-2)));assert(decoded.as<std::string>()==hostile);cases++;}
 for(size_t failAt:{size_t{1},size_t{2}}){std::string output;size_t reserves=0;assert(!buildBridgeInformationInjection(information,output,[&](std::string& value,size_t count){if(++reserves==failAt)return false;value.reserve(count);return true;}));assert(output.empty());cases++;}
 {std::string output;size_t reserves=0;assert(!buildBridgeInformationInjection(std::string(1025,'x'),output,[&](std::string&,size_t){reserves++;return true;}));assert(output.empty()&&reserves==0);cases++;}
 std::cout<<cases<<" HTTP HTML send scenarios passed: one header block, exact rendered page, <=1KB slices, short writes, explicit timeout retry and deadline\n";
}
