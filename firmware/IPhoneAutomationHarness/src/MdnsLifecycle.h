#pragma once
#include <cstdint>

namespace iah {
class MdnsLifecycle {
 public:
  static constexpr uint64_t AnnouncementIntervalMs=60000;
  enum class Action {None,Start,Stop,Restart,Announce};
  struct Network {bool connected=false;uint32_t ipv4=0,disconnectEpoch=0,gotIpEpoch=0;};
 private:
  Network network_{};
  bool observed_=false,active_=false,starting_=false;
  uint32_t failures_=0,starts_=0,announcements_=0;
  uint64_t nextAt_=0,lastAnnouncedAt_=0;
  static uint64_t after(uint64_t now,uint64_t delay){return now>UINT64_MAX-delay?UINT64_MAX:now+delay;}
  uint64_t retryDelay(){if(failures_<6)++failures_;return failures_>=6?30000:1000ULL<<(failures_-1);}
 public:
  Action poll(Network network,uint64_t now){
    const bool changed=observed_&&(network.connected!=network_.connected||network.ipv4!=network_.ipv4||network.disconnectEpoch!=network_.disconnectEpoch||network.gotIpEpoch!=network_.gotIpEpoch);
    observed_=true;network_=network;
    if(changed){failures_=0;nextAt_=0;}
    if(!network.connected||!network.ipv4){starting_=false;nextAt_=0;failures_=0;if(active_){active_=false;return Action::Stop;}return Action::None;}
    if(starting_)return Action::None;
    if(active_&&changed){active_=false;starting_=true;return Action::Restart;}
    if(now<nextAt_)return Action::None;
    if(!active_){starting_=true;return Action::Start;}
    return Action::Announce;
  }
  void started(bool success,uint64_t now){
    starting_=false;active_=success;++starts_;
    if(success){failures_=0;nextAt_=after(now,AnnouncementIntervalMs);}
    else nextAt_=after(now,retryDelay());
  }
  void announced(bool success,uint64_t now,bool serviceLost=false){
    if(success){++announcements_;failures_=0;lastAnnouncedAt_=now;nextAt_=after(now,AnnouncementIntervalMs);}
    else {if(serviceLost)active_=false;nextAt_=after(now,retryDelay());}
  }
  bool active()const{return active_;}
  uint32_t starts()const{return starts_;}
  uint32_t announcements()const{return announcements_;}
  uint32_t consecutiveFailures()const{return failures_;}
  uint64_t nextAt()const{return nextAt_;}
  uint64_t lastAnnouncedAt()const{return lastAnnouncedAt_;}
};
}
