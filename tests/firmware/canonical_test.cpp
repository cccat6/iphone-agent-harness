#include <cassert>
#include <cstdio>
#include <string>
#include "../../firmware/IPhoneAutomationHarness/src/Canonical.h"
#if ARDUINOJSON_VERSION_MAJOR != 7 || ARDUINOJSON_VERSION_MINOR != 4 || ARDUINOJSON_VERSION_REVISION != 3
#error Pinned ArduinoJson 7.4.3 required
#endif
struct Writer {
 std::string text;size_t largest=0;bool reject=false;
 size_t write(uint8_t c){if(reject)return 0;text.push_back(static_cast<char>(c));largest=largest<1?1:largest;return 1;}
 size_t write(const uint8_t* p,size_t n){if(reject)return 0;text.append(reinterpret_cast<const char*>(p),n);if(n>largest)largest=n;return n;}
};
int main(){
 JsonDocument doc;assert(!deserializeJson(doc,R"({"z":2,"payloadHash":"ignored","a":[{"y":10000,"kind":"pointer","x":0,"buttons":0,"atMs":20},1,true,null,"a\"b"]})"));
 Writer output;assert(iah::writeCanonicalValidated(doc.as<JsonVariantConst>(),output));
 assert(output.text==R"({"a":[{"atMs":20,"buttons":0,"kind":"pointer","x":0,"y":10000},1,true,null,"a\"b"],"z":2})");
 // Object input order is irrelevant; arrays retain their exact order.
 JsonDocument reordered;assert(!deserializeJson(reordered,R"({"a":[{"buttons":0,"atMs":20,"kind":"pointer","x":0,"y":10000},1,true,null,"a\"b"],"z":2})"));
 Writer same;assert(iah::writeCanonicalValidated(reordered.as<JsonVariantConst>(),same));assert(same.text==output.text);
 Writer failed;failed.reject=true;assert(!iah::writeCanonicalValidated(doc.as<JsonVariantConst>(),failed));
 JsonDocument invalid;invalid["bad-key"]=1;Writer unused;assert(!iah::writeCanonicalValidated(invalid.as<JsonVariantConst>(),unused));
 invalid.clear();for(int i=0;i<13;i++)invalid[std::string("k")+std::to_string(i)]=i;assert(!iah::writeCanonicalValidated(invalid.as<JsonVariantConst>(),unused));
 JsonDocument large;auto events=large["events"].to<JsonArray>();for(int i=0;i<256;i++){auto event=events.add<JsonObject>();event["atMs"]=i*10;event["kind"]="pointer";event["buttons"]=0;event["x"]=i;event["y"]=10000-i;}
 Writer bounded;assert(iah::writeCanonicalValidated(large.as<JsonVariantConst>(),bounded));assert(bounded.text.size()>12000);assert(bounded.largest<=32);
 std::puts("6 canonical streaming scenarios passed");
}
