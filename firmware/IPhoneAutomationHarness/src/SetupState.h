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
inline bool certificateTimeValid(const char* from,const char* until,const char* now){
 for(const auto text:{from,until,now}){if(!text||std::strlen(text)!=14)return false;for(size_t i=0;i<14;i++)if(text[i]<'0'||text[i]>'9')return false;}
 return std::strcmp(from,until)<=0&&std::strcmp(from,now)<=0&&std::strcmp(now,until)<=0;
}
}
