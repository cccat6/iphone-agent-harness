#include "../src/ProbeMessage.h"
#include <cassert>
#include <string>
int main(){
 char out[512]{};auto reply=[&](const std::string& s){return rtc_probe::makeReply(s.data(),s.size(),out,sizeof(out));};
 auto n=reply(R"({"probe":true,"nonce":"a123_-"})");assert(n>0);JsonDocument doc;assert(!deserializeJson(doc,out,n));assert(doc["probe"].as<bool>());assert(doc["nonce"]=="a123_-");assert(doc["phoneInputSent"].is<bool>()&&!doc["phoneInputSent"].as<bool>());
 assert(!reply(R"({"probe":false,"nonce":"a"})"));assert(!reply(R"({"probe":1,"nonce":"a"})"));assert(!reply(R"({"probe":true,"nonce":""})"));assert(!reply(R"({"probe":true,"nonce":"a\u0000b"})"));assert(!reply(R"({"probe":true,"nonce":"a","command":"home"})"));assert(!reply(R"({"probe":true,"nonce":"bad space"})"));
 assert(!reply("{\"probe\":true,\"nonce\":\""+std::string(129,'x')+"\"}"));assert(reply("{\"probe\":true,\"nonce\":\""+std::string(128,'x')+"\"}"));
 const std::string sample=R"({"probe":true,"nonce":"a"})";char tiny[8];assert(!rtc_probe::makeReply(sample.data(),sample.size(),tiny,sizeof(tiny)));
}
