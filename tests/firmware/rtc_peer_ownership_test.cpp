#include <cassert>
#include "../../firmware/IPhoneAutomationHarness/src/RtcPeerOwnership.h"
int main(){
 iah::RtcPeerOwnership<2,8,2> owners;
 owners.rememberClient(0,"phone-a-browser");owners.rememberClient(1,"phone-b-browser");
 owners.claim(0,"phone-a","lease-a");owners.claim(1,"phone-b","lease-b");
 assert(owners.owns(0,"phone-a","lease-a"));assert(!owners.owns(0,"phone-b","lease-b"));
 owners.clear(0);assert(!owners.hasClient("phone-a-browser"));assert(owners.hasClient("phone-b-browser"));assert(owners.owns(1,"phone-b","lease-b"));
 owners.rememberClient(0,"same-browser");owners.rememberClient(1,"same-browser");owners.claim(0,"phone-a","same-lease");owners.claim(1,"phone-a","same-lease");
 assert(!owners.owns(0,"phone-a","same-lease"));assert(owners.owns(1,"phone-a","same-lease"));owners.clear(0);assert(owners.hasClient("same-browser"));assert(owners.owns(1,"phone-a","same-lease"));
 owners.forgetTarget("phone-a");assert(!owners.owns(1,"phone-a","same-lease"));assert(owners.owns(1,"phone-b","lease-b"));
 owners.claim(2,"phone-b","http-lease");assert(!owners.owns(1,"phone-b","lease-b"));assert(!owners.owns(2,"phone-b","http-lease"));owners.clear(99);
}
