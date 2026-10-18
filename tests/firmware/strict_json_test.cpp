#include <cassert>
#include <string>
#include <array>
#include "../../firmware/IPhoneAutomationHarness/src/StrictJson.h"
using namespace std::string_literals;
int main(){
 for(const std::string& input:std::initializer_list<std::string>{"{\"probe\":true}trailing","{\"probe\":true}{}","[]","{\"probe\":true}\0junk"s}){JsonDocument doc;assert(!iah::strictJsonObject(doc,input.data(),input.size()));}
 for(const std::string& input:std::initializer_list<std::string>{"{\"probe\":true}"," \n{\"text\":\"你好\\n\\\"\\\\\"}\r\n"}){JsonDocument doc;assert(iah::strictJsonObject(doc,input.data(),input.size()));}
 JsonDocument doc;std::string embedded="{\"path\":\"/v1/identity\\u0000other\"}";assert(iah::strictJsonObject(doc,embedded.data(),embedded.size()));assert(!iah::plainJsonString(doc["path"]));
}
