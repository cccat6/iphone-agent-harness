#pragma once
#include <ArduinoJson.h>
#include <cmath>
#include "Core.h"
namespace iah {
inline bool compactInt(JsonVariantConst v,int low,int high){return v.is<int>()&&v.as<int>()>=low&&v.as<int>()<=high;}
inline bool expandGesture(JsonArrayConst g,Segment& s){
 s.count=0;auto push=[&](Event e){if(s.count>=MaxEvents||e.atMs>MaxSegmentMs)return false;s.events[s.count++]=e;return true;};
 auto pointer=[&](int t,int b,int x,int y){Event e;e.atMs=t;e.buttons=b;e.x=x;e.y=y;return push(e);};
 if(g.isNull()||!g[0].is<const char*>())return false;
 const auto name=g[0].as<JsonString>();
 if(name=="home"){if(g.size()!=1)return false;Event e;e.kind=Kind::Consumer;e.usage=64;if(!push(e))return false;e.atMs=100;e.usage=0;return push(e);}
 if(name=="tap")return g.size()==5&&compactInt(g[1],0,10000)&&compactInt(g[2],0,10000)&&compactInt(g[3],8,500)&&compactInt(g[4],40,1200)&&pointer(0,0,g[1],g[2])&&pointer(g[3],1,g[1],g[2])&&pointer(g[3].as<int>()+g[4].as<int>(),0,g[1],g[2]);
 if(name=="key"){
  if(g.size()!=4||!compactInt(g[1],0,255)||!compactInt(g[2],4,231)||!compactInt(g[3],40,1200))return false;
  Event e;e.kind=Kind::Keyboard;e.modifiers=g[1];e.count=1;e.usages[0]=g[2];if(!push(e))return false;e.atMs=g[3];e.modifiers=0;e.count=0;e.usages[0]=0;return push(e);
 }
 if(name=="path"){
  if(g.size()!=6||!compactInt(g[1],8,500)||!compactInt(g[2],8,100)||!compactInt(g[3],1,3000)||!compactInt(g[4],0,3000)||!g[5].is<JsonArrayConst>())return false;
  auto points=g[5].as<JsonArrayConst>();if(points.size()<2||points.size()>64)return false;
  int previous=-1;for(auto value:points){auto p=value.as<JsonArrayConst>();if(p.size()!=3||!compactInt(p[0],0,10000)||!compactInt(p[1],0,10000)||!compactInt(p[2],0,3000)||p[2].as<int>()<=previous)return false;previous=p[2];}
  if(points[0][2]!=0||g[3].as<int>()+g[4].as<int>()>static_cast<int>(MaxHoldMs))return false;
  const int settle=g[1],interval=g[2],duration=g[3],hold=g[4],end=points[points.size()-1][2];
  if(!pointer(0,0,points[0][0],points[0][1])||!pointer(settle,1,points[0][0],points[0][1]))return false;
  size_t at=0,next=1;int cadence=interval;
  while(next<points.size()||cadence<=end){int t=next<points.size()?points[next][2].as<int>():end+1;if(cadence<=end)t=std::min(t,cadence);if(next<points.size()&&points[next][2]==t)next++;if(cadence==t)cadence+=interval;
   while(at+1<points.size()&&points[at+1][2].as<int>()<t)at++;
   auto a=points[at],b=points[std::min(at+1,points.size()-1)];const double f=double(t-a[2].as<int>())/(b[2].as<int>()-a[2].as<int>());
   const int x=std::floor(a[0].as<int>()+(b[0].as<int>()-a[0].as<int>())*f+0.5),y=std::floor(a[1].as<int>()+(b[1].as<int>()-a[1].as<int>())*f+0.5);
   if(!pointer(settle+int(std::floor(double(t)*duration/end+0.5)),1,x,y))return false;
  }
  return pointer(settle+duration+hold,0,points[points.size()-1][0],points[points.size()-1][1]);
 }
 if(name=="reports"){
  if(g.size()!=2||!g[1].is<JsonArrayConst>()||g[1].size()<1||g[1].size()>MaxEvents)return false;
  for(auto value:g[1].as<JsonArrayConst>()){auto p=value.as<JsonArrayConst>();if(!compactInt(p[0],0,5000)||!compactInt(p[1],0,2))return false;Event e;e.atMs=p[0];e.kind=static_cast<Kind>(p[1].as<int>());
   if(e.kind==Kind::Pointer){if(p.size()!=5||!compactInt(p[2],0,1)||!compactInt(p[3],0,10000)||!compactInt(p[4],0,10000))return false;e.buttons=p[2];e.x=p[3];e.y=p[4];}
   else if(e.kind==Kind::Keyboard){if(p.size()!=4||!compactInt(p[2],0,255)||!p[3].is<JsonArrayConst>()||p[3].size()>6)return false;e.modifiers=p[2];for(auto u:p[3].as<JsonArrayConst>()){if(!compactInt(u,4,231))return false;e.usages[e.count++]=u;}}
   else{if(p.size()!=3||!compactInt(p[2],0,64)||(p[2]!=0&&p[2]!=64))return false;e.usage=p[2];}if(!push(e))return false;
  }return true;
 }return false;
}
}
