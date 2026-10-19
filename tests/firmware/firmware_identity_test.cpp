#include "../../firmware/IPhoneAutomationHarness/src/FirmwareVersion.h"
#include <ArduinoJson.h>
#include <cassert>
#include <cstdio>
#include <string>
#ifndef EXPECTED_IAH_BUILD_ID
#define EXPECTED_IAH_BUILD_ID "local"
#endif
int main(){
 JsonDocument identity;
 identity["boardId"]="board-example";
 identity["bootId"]="boot-example";
 iah::firmware::addIdentity(identity);
 assert(identity["boardId"]=="board-example");
 assert(identity["bootId"]=="boot-example");
 assert(identity["firmwareVersion"]==iah::firmware::Version);
 assert(identity["buildId"]==EXPECTED_IAH_BUILD_ID);
 std::string encoded;serializeJson(identity,encoded);
 JsonDocument restored;assert(!deserializeJson(restored,encoded));
 assert(restored["firmwareVersion"]==iah::firmware::Version);
 assert(restored["buildId"]==EXPECTED_IAH_BUILD_ID);
 assert(identity.size()==4);
 std::puts("Firmware version/build identity serialization passed");
}
