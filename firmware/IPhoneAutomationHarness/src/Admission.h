#pragma once
#include <array>
#include <string>
#include <cstdint>
#include "Core.h"
namespace iah {
inline bool constantEqual(const std::string& a,const std::string& b){size_t size=a.size()>b.size()?a.size():b.size();uint32_t difference=static_cast<uint32_t>(a.size()^b.size());for(size_t i=0;i<size;i++)difference|=(i<a.size()?static_cast<unsigned char>(a[i]):0)^(i<b.size()?static_cast<unsigned char>(b[i]):0);return difference==0;}
struct Grant {std::string clientId,tokenHash,origin,targetId;bool active=false;uint64_t lastChallengeAt=0;};
class Admission {
 std::array<Grant,MaxClients> grants_{};
 std::string challengeId_,challengeClient_,challengeTarget_,nonce_;
 uint64_t challengeUntil_=0;uint8_t attempts_=0;bool typing_=false;
 public:
 Grant* client(const std::string& id){for(auto& g:grants_)if(g.active&&g.clientId==id)return &g;return nullptr;}
 Grant* authenticate(const std::string& hash,const std::string& origin){for(auto& g:grants_)if(g.active&&constantEqual(g.tokenHash,hash)&&g.origin==origin)return &g;return nullptr;}
 bool install(const std::string& id,const std::string& hash,const std::string& origin,const std::string& target=""){
  if(!validId(id)||hash.size()!=64||origin.empty())return false;
  auto g=client(id);if(!g)for(auto& item:grants_)if(!item.active){g=&item;break;}if(!g)return false;auto oldTarget=g->targetId;*g={id,hash,origin,target.empty()?oldTarget:target,true,0};return true;
 }
 const std::array<Grant,MaxClients>& grants()const{return grants_;}
 bool begin(const std::string& id,const std::string& target,const std::string& challenge,const std::string& digits,uint64_t now){
  auto g=client(id);if(!g||!validId(target)||!validId(challenge)||digits.size()!=8)return false;
  for(char c:digits)if(c<'0'||c>'9')return false;
  if((challengeUntil_>now)||(g->lastChallengeAt&&now-g->lastChallengeAt<30000)||(!g->targetId.empty()&&g->targetId!=target))return false;
  g->lastChallengeAt=now?now:1;challengeId_=challenge;challengeClient_=id;challengeTarget_=target;nonce_=digits;challengeUntil_=now+30000;attempts_=0;typing_=true;return true;
 }
 bool active(uint64_t now)const{return challengeUntil_>now;}
 bool typing(uint64_t now)const{return typing_&&active(now);}
 const std::string& target()const{return challengeTarget_;}
 const std::string& challengeId()const{return challengeId_;}
 uint64_t expiresAt()const{return challengeUntil_;}
 char digit(size_t index)const{return index<nonce_.size()?nonce_[index]:'\0';}
 void typed(){typing_=false;}
 void invalidate(){challengeUntil_=0;typing_=false;nonce_.assign(nonce_.size(),'0');nonce_.clear();}
 bool confirm(const std::string& clientId,const std::string& target,const std::string& challenge,const std::string& observed,uint64_t now){
  if(!active(now)||typing_||clientId!=challengeClient_||target!=challengeTarget_||challenge!=challengeId_)return false;
  if(++attempts_>3){invalidate();return false;}
  if(!constantEqual(observed,nonce_)){if(attempts_>=3)invalidate();return false;}
  auto g=client(clientId);if(!g){invalidate();return false;}g->targetId=target;invalidate();return true;
 }
};
}
