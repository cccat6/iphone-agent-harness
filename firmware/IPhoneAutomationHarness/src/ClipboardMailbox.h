#pragma once
#include <cstdint>
#include <cstring>
#include <memory>
#include <new>
#include <string>
#include <utility>

namespace iah {
// One 1 KiB producer slot; the browser owns the full text. Callers serialize
// access with their Core mutex. Never hold that mutex during HTTP writes/waits.
class ClipboardMailbox {
 public:
  static constexpr size_t ChunkBytes=1024;
  static constexpr uint64_t MaxTotalBytes=9007199254740991ULL;
  static constexpr uint32_t DefaultTtlMs=120000,MaxTtlMs=300000;
  enum class Result {Ok,Invalid,Busy,NotFound,Denied,Expired,AlreadyDelivered,NotDelivered,Unavailable,Waiting,Complete,Conflict};
  enum class State {Empty,Pending,Streaming,Delivered,Copied,Cancelled,Expired};
  struct View {std::string requestId,clientId,sessionId,targetId;State state=State::Empty;uint64_t expiresAtDeviceMs=0,copiedAtDeviceMs=0,totalBytes=0,nextOffset=0;bool chunkPending=false;};
  using Allocator=char*(*)(size_t);using Releaser=void(*)(char*);
 private:
  static char* allocateText(size_t size){return new(std::nothrow)char[size];}
  static void releaseText(char* text){delete[] text;}
  std::unique_ptr<char[],Releaser> chunk_;size_t bytes_=0;Allocator allocator_;
  std::string token_;View view_;uint32_t idleTtlMs_=DefaultTtlMs;
  static bool id(const std::string& s){if(s.empty()||s.size()>80)return false;for(char c:s)if(!((c>='a'&&c<='z')||(c>='A'&&c<='Z')||(c>='0'&&c<='9')||c=='.'||c=='_'||c==':'||c=='-'))return false;return true;}
  static bool token(const std::string& s){if(s.size()!=64)return false;for(char c:s)if(!((c>='a'&&c<='f')||(c>='0'&&c<='9')))return false;return true;}
  static bool equal(const std::string& a,const std::string& b){unsigned diff=unsigned(a.size()^b.size());size_t n=a.size()>b.size()?a.size():b.size();for(size_t i=0;i<n;i++)diff|=unsigned((i<a.size()?a[i]:0)^(i<b.size()?b[i]:0));return !diff;}
  void wipeChunk(){if(chunk_){volatile char* p=chunk_.get();for(size_t i=0;i<=bytes_;i++)p[i]=0;chunk_.reset();}bytes_=0;view_.chunkPending=false;}
  void wipeToken(){for(char& c:token_)c=0;token_.clear();}
  void refresh(uint64_t now){view_.expiresAtDeviceMs=now>UINT64_MAX-idleTtlMs_?UINT64_MAX:now+idleTtlMs_;}
  void expire(uint64_t now){if(view_.state!=State::Empty&&view_.state!=State::Cancelled&&view_.state!=State::Expired&&now>=view_.expiresAtDeviceMs){wipeChunk();wipeToken();view_.state=State::Expired;}}
  Result match(const std::string& requestId,const std::string& secret,uint64_t now){expire(now);if(view_.state==State::Empty||requestId!=view_.requestId)return Result::NotFound;if(view_.state==State::Expired)return Result::Expired;if(view_.state==State::Cancelled||!token(secret)||!equal(secret,token_))return Result::Denied;return Result::Ok;}
  Result owner(const std::string& requestId,const std::string& clientId,const std::string& targetId,uint64_t now){expire(now);if(view_.state==State::Empty||requestId!=view_.requestId)return Result::NotFound;if(view_.clientId!=clientId||view_.targetId!=targetId)return Result::Denied;return Result::Ok;}
 public:
  static const char* stateName(State state){switch(state){case State::Pending:return "pending";case State::Streaming:return "streaming";case State::Delivered:return "delivered";case State::Copied:return "copied";case State::Cancelled:return "cancelled";case State::Expired:return "expired";default:return "empty";}}
  explicit ClipboardMailbox(Allocator allocator=allocateText,Releaser releaser=releaseText):chunk_(nullptr,releaser?releaser:releaseText),allocator_(allocator?allocator:allocateText){}
  ~ClipboardMailbox(){wipeChunk();wipeToken();}
  ClipboardMailbox(const ClipboardMailbox&)=delete;ClipboardMailbox& operator=(const ClipboardMailbox&)=delete;
  Result put(const std::string& requestId,const std::string& clientId,const std::string& sessionId,const std::string& targetId,uint64_t totalBytes,const std::string& jobToken,uint64_t now,uint32_t ttlMs=DefaultTtlMs){
   expire(now);if(!id(requestId)||!id(clientId)||!id(sessionId)||!id(targetId)||!token(jobToken)||!totalBytes||totalBytes>MaxTotalBytes||!ttlMs||ttlMs>MaxTtlMs||now>UINT64_MAX-ttlMs)return Result::Invalid;
   if(view_.state!=State::Empty&&view_.state!=State::Expired&&view_.state!=State::Cancelled&&view_.clientId!=clientId)return Result::Busy;
#if defined(__cpp_exceptions)
   try {
#endif
    View next{requestId,clientId,sessionId,targetId,State::Pending,now+ttlMs,0,totalBytes,0,false};std::string nextToken(jobToken);
    wipeChunk();wipeToken();token_.swap(nextToken);view_=std::move(next);idleTtlMs_=ttlMs;return Result::Ok;
#if defined(__cpp_exceptions)
   }catch(const std::bad_alloc&){return Result::Unavailable;}
#endif
  }
  Result status(const std::string& requestId,const std::string& clientId,const std::string& targetId,uint64_t now,View& out){auto r=owner(requestId,clientId,targetId,now);if(r==Result::Ok)out=view_;return r;}
  // nextOffset advances only after HTTP has flushed this slot, never on upload.
  Result push(const std::string& requestId,const std::string& clientId,const std::string& targetId,uint64_t offset,const std::string& text,uint64_t now,View& out){
   auto r=owner(requestId,clientId,targetId,now);if(r!=Result::Ok)return r;if(view_.state==State::Expired)return Result::Expired;if(view_.state==State::Cancelled)return Result::Denied;
   if(text.empty()||text.size()>ChunkBytes||offset>view_.totalBytes||text.size()>view_.totalBytes-offset)return Result::Invalid;
   if(offset<view_.nextOffset){out=view_;return Result::Ok;}
   if(offset!=view_.nextOffset||(view_.state!=State::Pending&&view_.state!=State::Streaming))return Result::Conflict;
   if(chunk_){if(bytes_!=text.size()||std::memcmp(chunk_.get(),text.data(),bytes_))return Result::Conflict;out=view_;return Result::Ok;}
   std::unique_ptr<char[],Releaser> next(allocator_(text.size()+1),chunk_.get_deleter());if(!next)return Result::Unavailable;
   std::memcpy(next.get(),text.data(),text.size());next[text.size()]=0;chunk_=std::move(next);bytes_=text.size();view_.chunkPending=true;refresh(now);out=view_;return Result::Ok;
  }
  Result beginStream(const std::string& requestId,const std::string& jobToken,uint64_t now,View& out){auto r=match(requestId,jobToken,now);if(r!=Result::Ok)return r;if(view_.state!=State::Pending)return Result::AlreadyDelivered;view_.state=State::Streaming;if(idleTtlMs_>DefaultTtlMs)idleTtlMs_=DefaultTtlMs;refresh(now);out=view_;return Result::Ok;}
  Result peek(const std::string& requestId,const std::string& jobToken,uint64_t now,uint64_t& offset,char* output,size_t capacity,size_t& size){
   size=0;auto r=match(requestId,jobToken,now);if(r!=Result::Ok)return r;if(view_.state!=State::Streaming)return Result::NotDelivered;
   offset=view_.nextOffset;if(offset==view_.totalBytes)return Result::Complete;if(!chunk_)return Result::Waiting;if(!output||capacity<bytes_)return Result::Invalid;std::memcpy(output,chunk_.get(),bytes_);size=bytes_;return Result::Ok;
  }
  Result consume(const std::string& requestId,const std::string& jobToken,uint64_t offset,size_t size,uint64_t now){auto r=match(requestId,jobToken,now);if(r!=Result::Ok)return r;if(view_.state!=State::Streaming||!chunk_||offset!=view_.nextOffset||size!=bytes_)return Result::Conflict;view_.nextOffset+=bytes_;wipeChunk();refresh(now);return Result::Ok;}
  Result finishStream(const std::string& requestId,const std::string& jobToken,uint64_t now){auto r=match(requestId,jobToken,now);if(r!=Result::Ok)return r;if(view_.state!=State::Streaming||view_.nextOffset!=view_.totalBytes||chunk_)return Result::NotDelivered;view_.state=State::Delivered;refresh(now);return Result::Ok;}
  Result acknowledge(const std::string& requestId,const std::string& jobToken,const std::string& sessionId,const std::string& targetId,uint64_t now,View& out){
   auto r=match(requestId,jobToken,now);if(r!=Result::Ok)return r;if(view_.sessionId!=sessionId||view_.targetId!=targetId)return Result::Denied;if(view_.state!=State::Delivered&&view_.state!=State::Copied)return Result::NotDelivered;
   if(view_.state==State::Delivered){view_.state=State::Copied;view_.copiedAtDeviceMs=now;refresh(now);}out=view_;return Result::Ok;
  }
  Result abortStream(const std::string& requestId,const std::string& jobToken,uint64_t now){auto r=match(requestId,jobToken,now);if(r!=Result::Ok)return r;wipeChunk();wipeToken();view_.state=State::Cancelled;return Result::Ok;}
  Result cancel(const std::string& requestId,const std::string& clientId,const std::string& targetId,uint64_t now){auto r=owner(requestId,clientId,targetId,now);if(r!=Result::Ok)return r;wipeChunk();wipeToken();view_.state=State::Cancelled;return Result::Ok;}
  void clear(){wipeChunk();wipeToken();view_=View{};}
  void tick(uint64_t now){expire(now);}
  bool hasPending(uint64_t now){expire(now);return view_.state==State::Pending;}
  size_t allocatedTextBytes()const{return chunk_?bytes_+1:0;}
};
}
