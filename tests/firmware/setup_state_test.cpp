#include "../../firmware/IPhoneAutomationHarness/src/SetupState.h"
#include <cassert>
#include <cstdio>
#include <string>
using namespace iah;
int main(){
 SetupDeadline d;assert(!d.finish(true,false,0));assert(!d.due(true,9999));d.opened();assert(d.finish(true,true,100));assert(!d.due(true,2099));assert(d.due(true,2100));
 assert(d.finish(true,true,200));assert(d.due(true,2100));d.closed();assert(!d.due(true,9999));
 assert(d.finish(false,true,5000));d.opened();assert(!d.due(true,99999));
 assert(d.finish(true,true,100));d.opened();assert(!d.due(true,99999));assert(d.finish(true,true,10000));assert(!d.due(true,11999));assert(d.due(true,12000));

 SavedNetworkRetry retry;
 assert(!retry.due(true,false,0));assert(retry.intervalMs()==15000);assert(!retry.due(true,false,14999));assert(retry.due(true,false,15000));assert(retry.attempts()==1&&retry.nextAt()==45000&&retry.intervalMs()==30000);assert(!retry.due(true,false,44999));assert(retry.due(true,false,45000));assert(retry.attempts()==2&&retry.intervalMs()==60000);assert(!retry.due(true,false,104999));assert(retry.due(true,false,105000));assert(retry.due(true,false,165000));assert(retry.due(true,false,3600000));assert(retry.attempts()==5&&retry.nextAt()==3660000);
 assert(!retry.due(true,true,3600001));assert(retry.attempts()==0&&retry.nextAt()==0&&retry.intervalMs()==15000);assert(!retry.due(true,false,3600002));assert(retry.due(true,false,3615002));
 assert(!retry.due(false,false,3615003));assert(!retry.due(false,false,3700000));assert(retry.attempts()==0);assert(!retry.due(true,false,3700001));assert(retry.due(true,false,3715001));
 WifiJoinState join;
 // Existing association cannot be mistaken for the just-submitted candidate.
 join.begin(100,7);assert(join.poll(true,true,true,7,101)==WifiJoinState::Decision::None);assert(!join.canFinish(true,true,true));
 assert(join.poll(true,false,true,8,200)==WifiJoinState::Decision::None);assert(join.poll(true,true,false,8,201)==WifiJoinState::Decision::None);
 assert(join.poll(true,true,true,8,202)==WifiJoinState::Decision::Commit);assert(!join.canFinish(true,true,true));assert(join.poll(true,true,true,8,203)==WifiJoinState::Decision::None);
 assert(join.committed(true));assert(join.canFinish(true,true,true));assert(!join.canFinish(true,false,true));assert(!join.canFinish(true,true,false));
 // A failed join never enters the commit phase; last-good storage stays untouched.
 std::string lastGood="working-network";join.begin(1000,8);auto decision=join.poll(false,false,false,8,31000);if(decision==WifiJoinState::Decision::Commit)lastGood="bad-candidate";assert(decision==WifiJoinState::Decision::Fail);assert(lastGood=="working-network");assert(!join.canFinish(true,true,true));
 assert(join.candidateFailed());join.restoredPrevious();assert(join.phase()==WifiJoinState::Phase::Idle);assert(join.canFinish(true,true,true));assert(std::string(join.name())=="failed");assert(join.candidateFailed());assert(!join.canFinish(false,true,true));
 // A retry requires a fresh IP event; a failed persistence readback still cannot finish.
 join.begin(32000,9);assert(!join.candidateFailed());assert(join.poll(true,true,true,9,32001)==WifiJoinState::Decision::None);assert(join.poll(true,true,true,10,32002)==WifiJoinState::Decision::Commit);assert(!join.committed(false));assert(!join.canFinish(true,true,true));join.restoredPrevious();assert(join.canFinish(true,true,true));assert(join.candidateFailed());
 join.begin(40000,10);assert(join.poll(true,true,true,11,40001)==WifiJoinState::Decision::Commit);assert(join.committed(true));assert(join.canFinish(true,true,true));assert(!join.candidateFailed());assert(std::string(join.name())=="connected");
 // Failed saved-network boot and later disconnect reopen setup after a bounded wait.
 WifiJoinState recovery;assert(!recovery.recoveryDue(false,false,0));assert(!recovery.recoveryDue(false,false,29999));assert(recovery.recoveryDue(false,false,30000));assert(!recovery.recoveryDue(false,true,40000));assert(!recovery.recoveryDue(true,false,50000));assert(!recovery.recoveryDue(false,false,51000));assert(recovery.recoveryDue(false,false,81000));
 recovery.begin(82000,1);assert(!recovery.recoveryDue(false,false,120000));assert(recovery.poll(false,false,false,1,120000)==WifiJoinState::Decision::Fail);assert(recovery.recoveryDue(false,false,120001));
 std::puts("Setup deadlines, Wi-Fi candidate commit/rollback/retry/recovery scenarios passed");
}
