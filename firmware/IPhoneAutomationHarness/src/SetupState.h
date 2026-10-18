#pragma once
#include <cstdint>
#include <cstring>
#include <initializer_list>
namespace iah {
class SetupDeadline {
 uint64_t at_=0;
 public:
 void opened(){at_=0;}
 bool finish(bool active,bool configured,uint64_t now){if(!configured)return false;if(!active){at_=0;return true;}if(!at_)at_=now+2000;return true;}
 bool due(bool active,uint64_t now)const{return active&&at_&&now>=at_;}
 void closed(){at_=0;}
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
inline bool certificateTimeValid(const char* from,const char* until,const char* now){
 for(const auto text:{from,until,now}){if(!text||std::strlen(text)!=14)return false;for(size_t i=0;i<14;i++)if(text[i]<'0'||text[i]>'9')return false;}
 return std::strcmp(from,until)<=0&&std::strcmp(from,now)<=0&&std::strcmp(now,until)<=0;
}
}
