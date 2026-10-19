#pragma once
#include <cstdint>
namespace iah {
class SetupDeadline {
 uint64_t at_=0;
 public:
 void opened(){at_=0;}
 bool finish(bool active,bool configured,uint64_t now){if(!configured)return false;if(!active){at_=0;return true;}if(!at_)at_=now+2000;return true;}
 bool due(bool active,uint64_t now)const{return active&&at_&&now>=at_;}
 void closed(){at_=0;}
};
// A bounded restart recovers an association attempt stuck during BLE startup.
// Explicit provisioning owns the radio while it is joining a candidate network.
class SavedNetworkRetry {
 uint64_t next_=0;unsigned attempts_=0;
 public:
 bool due(bool eligible,bool connected,uint64_t now){
  if(connected||!eligible){next_=0;attempts_=0;return false;}
  if(attempts_>=3)return false;
  if(!next_){next_=now+15000;return false;}
  if(now<next_)return false;
  next_=now+15000;++attempts_;return true;
 }
};
// Candidate Wi-Fi is not saved until a fresh GOT_IP event confirms this attempt.
class WifiJoinState {
 public: enum class Phase {Idle,Joining,Committing,Connected,Failed};enum class Decision {None,Commit,Fail};
 private: Phase phase_=Phase::Idle;uint64_t deadline_=0,disconnectedAt_=0;uint32_t initialEpoch_=0;bool disconnectedClock_=false;
 public:
 void begin(uint64_t now,uint32_t epoch){phase_=Phase::Joining;deadline_=now+30000;initialEpoch_=epoch;}
 Decision poll(bool connected,bool validAddress,bool sameNetwork,uint32_t epoch,uint64_t now){
  if(phase_!=Phase::Joining)return Decision::None;
  if(now>=deadline_){phase_=Phase::Failed;return Decision::Fail;}
  if(connected&&validAddress&&sameNetwork&&epoch!=initialEpoch_){phase_=Phase::Committing;return Decision::Commit;}
  return Decision::None;
 }
 bool committed(bool ok){if(phase_!=Phase::Committing)return false;phase_=ok?Phase::Connected:Phase::Failed;return ok;}
 bool canFinish(bool configured,bool connected,bool validAddress)const{return configured&&connected&&validAddress&&(phase_==Phase::Idle||phase_==Phase::Connected);}
 bool recoveryDue(bool connected,bool apActive,uint64_t now){
  if(connected){disconnectedClock_=false;return false;}
  if(!disconnectedClock_){disconnectedAt_=now;disconnectedClock_=true;}
  return !apActive&&phase_!=Phase::Joining&&phase_!=Phase::Committing&&now-disconnectedAt_>=30000;
 }
 Phase phase()const{return phase_;}
 const char* name()const{switch(phase_){case Phase::Joining:case Phase::Committing:return "connecting";case Phase::Connected:return "connected";case Phase::Failed:return "failed";default:return "idle";}}
};
}
