#pragma once
#include <array>
#include <string>
namespace iah {
template<size_t Peers,size_t Clients,size_t Targets> class RtcPeerOwnership {
 struct Lease {std::string target,id;};
 std::array<std::array<std::string,Clients>,Peers> clients_{};
 std::array<std::array<Lease,Targets>,Peers> leases_{};
 public:
 void rememberClient(size_t peer,const std::string& id){if(peer>=Peers)return;for(const auto& current:clients_[peer])if(current==id)return;for(auto& current:clients_[peer])if(current.empty()){current=id;return;}}
 bool hasClient(const std::string& id)const{for(const auto& peer:clients_)for(const auto& current:peer)if(!current.empty()&&current==id)return true;return false;}
 void forgetTarget(const std::string& target){for(auto& peer:leases_)for(auto& lease:peer)if(lease.target==target)lease=Lease{};}
 void claim(size_t peer,const std::string& target,const std::string& id){
  forgetTarget(target);if(peer>=Peers||target.empty()||id.empty())return;
  for(auto& lease:leases_[peer])if(lease.target.empty()){lease={target,id};return;}
 }
 bool owns(size_t peer,const std::string& target,const std::string& id)const{if(peer>=Peers||id.empty())return false;for(const auto& lease:leases_[peer])if(lease.target==target&&lease.id==id)return true;return false;}
 void clear(size_t peer){if(peer>=Peers)return;for(auto& id:clients_[peer])id.clear();for(auto& lease:leases_[peer])lease=Lease{};}
};
}
