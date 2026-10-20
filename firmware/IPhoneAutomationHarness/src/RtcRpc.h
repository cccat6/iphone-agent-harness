#pragma once
#include <ArduinoJson.h>
#include <array>
#include <cstdint>
#include <cstring>
#include <functional>
#include <string>
#include <utility>
#include "RtcSctp.h"
namespace iah { namespace rtc {
class Rpc {
 public:
  static constexpr size_t RequestLimit=12288,ResponseLimit=16384,Chunk=256;
  using Dispatch=std::function<std::string(std::string)>;
  void dispatch(Dispatch value){dispatch_=value;}
  void reset(){lastCompleted_=0;state_=State::Idle;release();}
  bool busy()const{return state_!=State::Idle;}
  uint32_t completed()const{return lastCompleted_;}
  bool input(const uint8_t* text,size_t size,uint32_t now){
   if(!size||size>512||state_==State::Sending)return false;
   JsonDocument frame;if(deserializeJson(frame,text,size)||!frame.is<JsonObject>()||frame.size()!=7||!frame["v"].is<unsigned>()||frame["v"].as<unsigned>()!=1||frame["type"]!="req"||!frame["id"].is<const char*>()||!frame["n"].is<uint32_t>()||!frame["seq"].is<unsigned>()||!frame["end"].is<bool>()||!frame["data"].is<const char*>())return false;
   auto id=frame["id"].as<JsonString>();uint32_t n=frame["n"].as<uint32_t>();unsigned seq=frame["seq"].as<unsigned>();bool end=frame["end"].as<bool>();auto encoded=frame["data"].as<JsonString>();
   if(!uuid(id.c_str(),id.size())||!n||n>0x7fffffff||seq>=48)return false;
   std::array<uint8_t,Chunk> decoded{};size_t length=0;if(!decode(encoded.c_str(),encoded.size(),decoded.data(),length)||!length||(!end&&length!=Chunk))return false;
   if(state_==State::Idle){if(seq!=0||lastCompleted_==0x7fffffff||n!=lastCompleted_+1)return false;id_.assign(id.c_str(),id.size());n_=n;sequence_=0;started_=now;state_=State::Collecting;}
   if(n!=n_||id_!=std::string(id.c_str(),id.size())||seq!=sequence_||request_.size()+length>RequestLimit)return false;
   request_.append(reinterpret_cast<const char*>(decoded.data()),length);++sequence_;if(!end)return true;
   // id/data JsonString views have been consumed. Release this frame's parser
   // storage before validating and dispatching the complete request.
   frame.clear();
   // Consume the monotonic request number BEFORE dispatch. No old number can
   // invoke a mutation again, including after an application error response.
   lastCompleted_=n_;
   if(!validRequest(request_))reply_=error(400,"invalid_rpc_request");
   else if(dispatch_)reply_=dispatch_(std::move(request_));else reply_=error(503,"bridge_not_ready");
   std::string().swap(request_);
   if(reply_.size()>ResponseLimit)reply_=error(502,"bridge_response_too_large");
   else if(!validResponse(reply_))reply_=error(500,"bridge_response_invalid");
   state_=State::Sending;offset_=0;sequence_=0;waiting_=false;started_=now;return true;
  }
  bool tick(Sctp& sctp,uint32_t now){
   if(state_==State::Idle)return true;if(int32_t(now-started_)>30000)return false;
   if(state_==State::Collecting)return true;
   if(waiting_){if(sctp.pending())return true;waiting_=false;}
   if(!sctp.idleToSend())return true;
   size_t size=reply_.size()-offset_;if(size>Chunk)size=Chunk;std::string encoded=encode(reinterpret_cast<const uint8_t*>(reply_.data()+offset_),size);
   JsonDocument frame;frame["v"]=1;frame["type"]="res";frame["id"]=id_;frame["n"]=n_;frame["seq"]=sequence_;frame["end"]=offset_+size==reply_.size();frame["data"]=encoded;
   char bytes[513];size_t length=serializeJson(frame,bytes,sizeof(bytes));if(length>512||length!=measureJson(frame))return false;
   if(sctp.sendText(reinterpret_cast<uint8_t*>(bytes),length,now)){
    offset_+=size;++sequence_;
    // SCTP owns a byte-for-byte retransmission copy now. Once the final frame
    // is queued, the next request may arrive before its SACK (even in the same
    // packet). Release this RPC immediately; the next response still waits for
    // idleToSend(), so the outstanding tail frame cannot be overwritten.
    if(offset_==reply_.size()){state_=State::Idle;release();}else waiting_=true;
   }return sctp.state()!=Sctp::State::Closed;
  }
  static std::string encode(const uint8_t* p,size_t size){static const char chars[]="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";std::string out;out.reserve((size+2)/3*4);for(size_t i=0;i<size;i+=3){unsigned v=unsigned(p[i])<<16;if(i+1<size)v|=unsigned(p[i+1])<<8;if(i+2<size)v|=p[i+2];out.push_back(chars[v>>18]);out.push_back(chars[v>>12&63]);out.push_back(i+1<size?chars[v>>6&63]:'=');out.push_back(i+2<size?chars[v&63]:'=');}return out;}
  static bool decode(const char* p,size_t size,uint8_t* out,size_t& written){
   written=0;if(!size||size%4||size>344)return false;
   auto value=[](char c)->int{if(c>='A'&&c<='Z')return c-'A';if(c>='a'&&c<='z')return c-'a'+26;if(c>='0'&&c<='9')return c-'0'+52;if(c=='+')return 62;if(c=='/')return 63;return -1;};
   for(size_t i=0;i<size;i+=4){int a=value(p[i]),b=value(p[i+1]);bool last=i+4==size;int c=p[i+2]=='='?-2:value(p[i+2]),d=p[i+3]=='='?-2:value(p[i+3]);if(a<0||b<0||c==-1||d==-1||(!last&&(c<0||d<0))||(c==-2&&d!=-2))return false;
    if(c==-2&&(b&15))return false;if(d==-2&&c>=0&&(c&3))return false;
    unsigned v=unsigned(a)<<18|unsigned(b)<<12|unsigned(c<0?0:c)<<6|unsigned(d<0?0:d);size_t n=c<0?1:d<0?2:3;if(written+n>Chunk)return false;out[written++]=v>>16;if(n>1)out[written++]=v>>8;if(n>2)out[written++]=v;
   }return true;
  }
 private:
  enum class State{Idle,Collecting,Sending};
  static bool uuid(const char* p,size_t n){if(n!=36)return false;for(size_t i=0;i<n;i++){if(i==8||i==13||i==18||i==23){if(p[i]!='-')return false;}else if(!((p[i]>='0'&&p[i]<='9')||(p[i]>='a'&&p[i]<='f')))return false;}return true;}
  static bool validRequest(const std::string& text){if(text.empty()||text.find('\0')!=std::string::npos)return false;JsonDocument d;if(deserializeJson(d,text)||!d.is<JsonObject>()||d.size()!=4||!d["method"].is<const char*>()||!d["path"].is<const char*>()||!d["headers"].is<JsonObject>()||!d["body"].is<const char*>())return false;for(JsonPairConst h:d["headers"].as<JsonObjectConst>())if(!h.value().is<const char*>())return false;return true;}
  static bool validResponse(const std::string& text){JsonDocument d;return !deserializeJson(d,text)&&d.is<JsonObject>()&&d.size()==2&&d["status"].is<int>()&&d["status"].as<int>()>=100&&d["status"].as<int>()<=599&&d["body"].is<const char*>();}
  static std::string error(int status,const char* code){JsonDocument body;body["error"]=code;std::string b;serializeJson(body,b);JsonDocument response;response["status"]=status;response["body"]=b;std::string result;serializeJson(response,result);return result;}
  void release(){std::string().swap(request_);std::string().swap(reply_);id_.clear();offset_=0;sequence_=0;waiting_=false;}
  Dispatch dispatch_;State state_=State::Idle;uint32_t lastCompleted_=0,n_=0,started_=0;unsigned sequence_=0;size_t offset_=0;bool waiting_=false;std::string request_,reply_,id_;
};
}}
