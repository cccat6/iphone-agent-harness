#pragma once
#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <limits>

namespace iah {
struct HttpHtmlAttempt {int count;int errorNumber;};
struct HttpHtmlSegment {const char* data;size_t length;};
struct HttpHtmlResult {
 bool complete=false;const char* stage="headers";size_t headerBytes=0,bodyBytes=0;
 int code=0,errorNumber=0;uint64_t durationMs=0;
};

// A page response uses one complete header block, followed by bounded slices of
// the existing page. Positive short writes advance; only explicit socket timeout
// may retry the remaining bytes. The caller closes this nonpersistent session.
template<class Send,class Clock,class Pause>
HttpHtmlResult sendHttpHtmlSegments(const HttpHtmlSegment* segments,size_t count,Send send,Clock clock,Pause pause,int timeoutCode,uint64_t deadlineMs=10000){
 HttpHtmlResult result;const uint64_t started=clock();
 auto finish=[&](bool complete){result.complete=complete;result.durationMs=clock()-started;return result;};
 size_t length=0;if((!segments&&count)||count>8)return finish(false);
 for(size_t i=0;i<count;i++){if((!segments[i].data&&segments[i].length)||segments[i].length>std::numeric_limits<size_t>::max()-length)return finish(false);length+=segments[i].length;}
 char head[768];
 const int headLength=std::snprintf(head,sizeof(head),
  "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: %zu\r\n"
  "Cache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nX-Frame-Options: DENY\r\n"
  "Content-Security-Policy: default-src 'none'; connect-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'\r\n"
  "Connection: close\r\n\r\n",length);
 if(headLength<0||static_cast<size_t>(headLength)>=sizeof(head))return finish(false);
 auto write=[&](const char* data,size_t size,size_t& total){
  size_t accepted=0;
  while(accepted<size){
   if(clock()-started>=deadlineMs){result.code=timeoutCode;return false;}
   const size_t requested=std::min(size-accepted,size_t{1024});
   const HttpHtmlAttempt attempt=send(data+accepted,requested);result.code=attempt.count;result.errorNumber=attempt.errorNumber;
   if(attempt.count>0){if(static_cast<size_t>(attempt.count)>requested)return false;accepted+=static_cast<size_t>(attempt.count);total+=static_cast<size_t>(attempt.count);}
   else if(attempt.count==timeoutCode){if(clock()-started>=deadlineMs)return false;pause();}
   else return false;
   if(clock()-started>=deadlineMs){result.code=timeoutCode;return false;}
  }
  return true;
 };
 if(!write(head,static_cast<size_t>(headLength),result.headerBytes))return finish(false);
 result.stage="body";
 for(size_t i=0;i<count;i++)if(!write(segments[i].data,segments[i].length,result.bodyBytes))return finish(false);
 return finish(true);
}
template<class Send,class Clock,class Pause>
HttpHtmlResult sendHttpHtmlResponse(const char* body,size_t length,Send send,Clock clock,Pause pause,int timeoutCode,uint64_t deadlineMs=10000){
 const HttpHtmlSegment segment{body,length};return sendHttpHtmlSegments(&segment,1,send,clock,pause,timeoutCode,deadlineMs);
}
}
