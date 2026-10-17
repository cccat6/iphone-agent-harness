#include "../../firmware/IPhoneAutomationHarness/src/Admission.h"
#include <cassert>
#include <iostream>
using namespace iah;
int main(){size_t cases=0;
 {Admission a;assert(a.install("client",std::string(64,'a'),"https://igent.cc"));assert(a.authenticate(std::string(64,'a'),"https://igent.cc"));assert(!a.authenticate(std::string(64,'b'),"https://igent.cc"));assert(!a.authenticate(std::string(64,'a'),"https://evil.example"));cases++;}
 {Admission a;a.install("client",std::string(64,'a'),"https://igent.cc");assert(a.begin("client","phone-a","challenge-a","12345678",100));assert(!a.confirm("client","phone-a","challenge-a","12345678",110));a.typed();assert(!a.confirm("client","phone-b","challenge-a","12345678",120));assert(!a.confirm("client","phone-a","different","12345678",120));assert(a.confirm("client","phone-a","challenge-a","12345678",120));assert(a.client("client")->targetId=="phone-a");assert(!a.confirm("client","phone-a","challenge-a","12345678",121));cases++;}
 {Admission a;a.install("client",std::string(64,'a'),"https://igent.cc");assert(a.begin("client","phone-a","challenge-a","87654321",100));a.typed();assert(!a.confirm("client","phone-a","challenge-a","00000000",120));assert(!a.confirm("client","phone-a","challenge-a","00000000",121));assert(!a.confirm("client","phone-a","challenge-a","00000000",122));assert(!a.active(123));assert(!a.confirm("client","phone-a","challenge-a","87654321",123));cases++;}
 {Admission a;a.install("client",std::string(64,'a'),"https://igent.cc");assert(a.begin("client","phone-a","challenge-a","11111111",100));a.typed();assert(!a.confirm("client","phone-a","challenge-a","11111111",30101));assert(!a.begin("client","phone-b","challenge-b","11111111",200));assert(a.begin("client","phone-b","challenge-b","22222222",30200));cases++;}
 {Admission a;a.install("client-a",std::string(64,'a'),"https://igent.cc");a.install("client-b",std::string(64,'b'),"https://igent.cc");assert(a.begin("client-a","phone-a","challenge-a","12345678",100));a.typed();assert(!a.confirm("client-b","phone-a","challenge-a","12345678",120));assert(a.confirm("client-a","phone-a","challenge-a","12345678",120));assert(!a.begin("client-a","phone-b","challenge-b","12345678",40000));cases++;}
 {Admission a;for(int i=0;i<8;i++)assert(a.install("client-"+std::to_string(i),std::string(64,'a'+i),"https://igent.cc"));assert(!a.install("ninth",std::string(64,'z'),"https://igent.cc"));assert(a.install("client-0",std::string(64,'f'),"https://igent.cc"));assert(!a.authenticate(std::string(64,'a'),"https://igent.cc"));cases++;}
 {assert(constantEqual("secret","secret"));assert(!constantEqual("secret","secreu"));assert(!constantEqual("secret","secret-long"));assert(!constantEqual("","x"));cases++;}
 std::cout<<cases<<" admission scenarios passed\n";
}
