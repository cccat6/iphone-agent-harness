#include "../../firmware/IPhoneAutomationHarness/src/MdnsLifecycle.h"
#include <cassert>
#include <cstdio>
#include <initializer_list>
using State=iah::MdnsLifecycle;
using Action=State::Action;
int main(){
 const State::Network up{true,0x0100a8c0,0,1},down{false,0,1,1};
 State state;
 assert(state.poll({},0)==Action::None);
 assert(state.poll({true,0,0,0},1)==Action::None);
 assert(state.poll(up,100)==Action::Start);
 assert(state.poll(up,101)==Action::None);
 state.started(true,102);
 assert(state.active()&&state.starts()==1);
 assert(state.poll(up,60101)==Action::None);
 assert(state.poll(up,60102)==Action::Announce);
 state.announced(true,60103);
 assert(state.announcements()==1&&state.lastAnnouncedAt()==60103);
 assert(state.poll(up,120102)==Action::None);
 assert(state.poll(up,120103)==Action::Announce);state.announced(true,120104);
 // A large scheduler gap emits one announcement, then schedules from actual completion.
 assert(state.poll(up,UINT64_C(0x100000000)+500)==Action::Announce);
 state.announced(true,UINT64_C(0x100000000)+501);
 assert(state.poll(up,UINT64_C(0x100000000)+502)==Action::None);
 assert(state.poll(down,UINT64_C(0x100000000)+503)==Action::Stop);
 assert(!state.active());assert(state.poll(down,UINT64_C(0x100000000)+504)==Action::None);
 auto reconnected=up;reconnected.disconnectEpoch=1;reconnected.gotIpEpoch=2;
 assert(state.poll(reconnected,UINT64_C(0x100000000)+505)==Action::Start);state.started(true,UINT64_C(0x100000000)+506);
 // An entire disconnect/reconnect between loop iterations still refreshes mDNS.
 auto missed=reconnected;missed.disconnectEpoch=2;missed.gotIpEpoch=3;
 assert(state.poll(missed,UINT64_C(0x100000000)+507)==Action::Restart);state.started(true,UINT64_C(0x100000000)+508);
 // Address changes are detected even if event counters were missed.
 auto moved=missed;moved.ipv4++;
 assert(state.poll(moved,UINT64_C(0x100000000)+509)==Action::Restart);state.started(true,UINT64_C(0x100000000)+510);
 auto renewed=moved;renewed.gotIpEpoch++;
 assert(state.poll(renewed,UINT64_C(0x100000000)+511)==Action::Restart);state.started(true,UINT64_C(0x100000000)+512);
 assert(state.poll(renewed,UINT64_C(0x100000000)+513)==Action::None);
 // Initialization failures back off with a 30-second cap.
 State failed;uint64_t now=0;
 for(uint64_t delay:{1000ULL,2000ULL,4000ULL,8000ULL,16000ULL,30000ULL,30000ULL}){
  assert(failed.poll(up,now)==Action::Start);failed.started(false,now);assert(!failed.active());
  assert(failed.nextAt()==now+delay);assert(failed.poll(up,now+delay-1)==Action::None);now+=delay;
 }
 assert(failed.poll(up,now)==Action::Start);failed.started(true,now);assert(failed.consecutiveFailures()==0);
 // A transient announce error keeps the running responder and retries only the announce.
 now+=State::AnnouncementIntervalMs;assert(failed.poll(up,now)==Action::Announce);failed.announced(false,now);
 assert(failed.active());assert(failed.poll(up,now+999)==Action::None);assert(failed.poll(up,now+1000)==Action::Announce);
 failed.announced(false,now+1000);assert(failed.nextAt()==now+3000);
 assert(failed.poll(up,now+3000)==Action::Announce);failed.announced(true,now+3000);assert(failed.consecutiveFailures()==0);
 // A reported lost responder schedules explicit reinitialization rather than periodic restarting.
 now+=63000;assert(failed.poll(up,now)==Action::Announce);failed.announced(false,now,true);assert(!failed.active());
 assert(failed.poll(up,now+999)==Action::None);assert(failed.poll(up,now+1000)==Action::Start);failed.started(true,now+1000);
 // New network events cancel the previous retry delay; counter wrap also counts as a change.
 State retry;assert(retry.poll({true,1,UINT32_MAX,UINT32_MAX},0)==Action::Start);retry.started(false,0);
 assert(retry.poll({true,1,0,0},1)==Action::Start);retry.started(true,1);
 assert(retry.poll({false,0,0,0},2)==Action::Stop);
 assert(retry.poll({true,1,0,0},3)==Action::Start);retry.started(true,3);
 std::puts("mDNS lifecycle: startup, bounded retries, same-IP reconnect, missed events, IP changes, periodic announcements and 64-bit clock passed");
}
