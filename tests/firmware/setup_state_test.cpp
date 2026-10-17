#include "../../firmware/IPhoneAutomationHarness/src/SetupState.h"
#include <cassert>
#include <cstdio>
using namespace iah;
int main(){
 SetupDeadline d;assert(!d.finish(true,false,0));assert(!d.due(true,9999));d.opened();assert(d.finish(true,true,100));assert(!d.due(true,2099));assert(d.due(true,2100));
 assert(d.finish(true,true,200));assert(d.due(true,2100));d.closed();assert(!d.due(true,9999));
 assert(d.finish(false,true,5000));d.opened();assert(!d.due(true,99999));
 assert(d.finish(true,true,100));d.opened();assert(!d.due(true,99999));assert(d.finish(true,true,10000));assert(!d.due(true,11999));assert(d.due(true,12000));
 assert(certificateTimeValid("20261017000000","20271018000000","20261018000000"));
 assert(!certificateTimeValid("20261020000000","20271021000000","20261018000000"));
 assert(!certificateTimeValid("20251017000000","20261017000000","20261018000000"));
 assert(certificateTimeValid("20261018000000","20261018000001","20261018000000"));assert(certificateTimeValid("20261018000000","20261018000001","20261018000001"));
 assert(!certificateTimeValid("bad","20261018000001","20261018000000"));
 std::puts("9 setup deadline and certificate-time scenarios passed");
}
