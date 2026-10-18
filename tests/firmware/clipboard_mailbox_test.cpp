#include "../../firmware/IPhoneAutomationHarness/src/ClipboardMailbox.h"
#include <cassert>
#include <map>
#include <new>
#include <string>
#include <iostream>
using Box=iah::ClipboardMailbox;using R=Box::Result;using S=Box::State;
static bool refuseAllocation=false;static size_t allocations=0,releases=0;static std::map<char*,size_t> blocks;
static char* allocate(size_t size){if(refuseAllocation)return nullptr;char* p=new(std::nothrow)char[size];if(p){blocks[p]=size;++allocations;}return p;}
static void release(char* p){auto found=blocks.find(p);assert(found!=blocks.end());for(size_t i=0;i<found->second;i++)assert(p[i]==0);blocks.erase(found);++releases;delete[] p;}
int main(){
 static_assert(sizeof(Box)<1024,"idle mailbox must not reserve a text slot");
 Box::View view;std::string one(64,'a'),two(64,'b');char output[1024];size_t length=0;uint64_t offset=0;
 {
  Box box;assert(!box.hasPending(0));
  assert(box.put("empty-check","c","s","t",1,one,0,10)==R::Ok);
  assert(box.hasPending(1));assert(box.hasPending(9));
  // Reads do not extend the deadline; expired jobs are immediately empty.
  assert(!box.hasPending(10));assert(box.status("empty-check","c","t",10,view)==R::Ok&&view.state==S::Expired);
  assert(box.put("cancel-check","c","s","t",1,one,11)==R::Ok);
  assert(box.cancel("cancel-check","c","t",12)==R::Ok&&!box.hasPending(12));
  assert(box.put("consume-check","c","s","t",1,one,13)==R::Ok&&box.hasPending(13));
  assert(box.beginStream("consume-check",one,14,view)==R::Ok&&!box.hasPending(14));
  assert(box.push("consume-check","c","t",0,"x",15,view)==R::Ok);
  assert(box.consume("consume-check",one,0,1,16)==R::Ok);
  assert(box.finishStream("consume-check",one,17)==R::Ok&&!box.hasPending(17));
  assert(box.acknowledge("consume-check",one,"s","t",18,view)==R::Ok&&!box.hasPending(18));
  box.clear();assert(!box.hasPending(19));
 }
 {
  Box box(allocate,release);
  assert(box.put("r1","c1","s1","t1",1000000,one,0)==R::Ok&&box.allocatedTextBytes()==0&&allocations==0);
  assert(box.put("r2","c2","s2","t2",1,two,1)==R::Busy);
  assert(box.beginStream("r1",two,1,view)==R::Denied);
  assert(box.beginStream("r1",one,1,view)==R::Ok&&view.state==S::Streaming);
  assert(box.beginStream("r1",one,2,view)==R::AlreadyDelivered);
  assert(box.peek("r1",one,2,offset,output,sizeof(output),length)==R::Waiting);
  assert(box.push("r1","wrong","t1",0,"first",2,view)==R::Denied);
  refuseAllocation=true;assert(box.push("r1","c1","t1",0,"first",3,view)==R::Unavailable&&box.allocatedTextBytes()==0);
  refuseAllocation=false;assert(box.push("r1","c1","t1",0,"first",4,view)==R::Ok&&view.nextOffset==0&&view.chunkPending&&box.allocatedTextBytes()==6);
  refuseAllocation=true;assert(box.push("r1","c1","t1",0,"first",5,view)==R::Ok&&allocations==1);
  assert(box.push("r1","c1","t1",0,"other",5,view)==R::Conflict);
  assert(box.push("r1","c1","t1",5,"next",5,view)==R::Conflict);
  assert(box.peek("r1",one,6,offset,output,sizeof(output),length)==R::Ok&&offset==0&&length==5&&std::string(output,length)=="first");
  assert(box.consume("r1",one,1,length,7)==R::Conflict);
  assert(box.consume("r1",one,offset,length,7)==R::Ok&&box.allocatedTextBytes()==0&&releases==1);
  assert(box.push("r1","c1","t1",0,"first",8,view)==R::Ok&&view.nextOffset==5&&!view.chunkPending);
  assert(box.push("r1","c1","t1",5,"next",8,view)==R::Unavailable);
  assert(box.finishStream("r1",one,8)==R::NotDelivered);
  assert(box.acknowledge("r1",one,"s1","t1",8,view)==R::NotDelivered);
  refuseAllocation=false;assert(box.push("r1","c1","t1",5,"next",9,view)==R::Ok);
  assert(box.put("r2","c1","s2","t1",3,two,10)==R::Ok&&box.allocatedTextBytes()==0&&releases==2);
  assert(box.peek("r1",one,10,offset,output,sizeof(output),length)==R::NotFound);
  assert(box.abortStream("r1",one,10)==R::NotFound);
  assert(box.beginStream("r2",two,11,view)==R::Ok);
  assert(box.push("r2","c1","t1",0,std::string("a\0b",3),12,view)==R::Ok);
  assert(box.peek("r2",two,13,offset,output,sizeof(output),length)==R::Ok&&length==3&&output[1]==0);
  assert(box.consume("r2",two,offset,length,14)==R::Ok);
  assert(box.peek("r2",two,14,offset,output,sizeof(output),length)==R::Complete&&offset==3);
  assert(box.acknowledge("r2",two,"s2","t1",14,view)==R::NotDelivered);
  assert(box.finishStream("r2",two,15)==R::Ok);
  assert(box.acknowledge("r2",two,"wrong","t1",16,view)==R::Denied);
  assert(box.acknowledge("r2",two,"s2","t1",16,view)==R::Ok&&view.state==S::Copied&&view.copiedAtDeviceMs==16);
  assert(box.acknowledge("r2",two,"s2","t1",17,view)==R::Ok&&view.copiedAtDeviceMs==16);
  assert(box.put("r3","c1","s3","t1",10,one,18,10)==R::Ok);assert(box.push("r3","c1","t1",0,"x",19,view)==R::Ok);box.tick(29);assert(box.allocatedTextBytes()==0);assert(box.beginStream("r3",one,29,view)==R::Expired);
  assert(box.put("r4","c1","s4","t1",10,one,30)==R::Ok);assert(box.push("r4","c1","t1",0,"x",31,view)==R::Ok);assert(box.cancel("r4","c1","t1",32)==R::Ok&&box.allocatedTextBytes()==0);
  assert(box.put("r5","c1","s5","t1",10,one,33)==R::Ok);assert(box.push("r5","c1","t1",0,"x",34,view)==R::Ok);box.clear();assert(box.allocatedTextBytes()==0);
  assert(box.put("r6","c1","s6","t1",10,one,35)==R::Ok);assert(box.push("r6","c1","t1",0,"x",36,view)==R::Ok);
 }
 assert(blocks.empty()&&allocations==releases);
 {
  Box box;assert(box.put("long","c","s","t",102400,one,0,10)==R::Ok);assert(box.beginStream("long",one,1,view)==R::Ok);
  for(uint64_t n=0;n<100;n++){uint64_t now=2+n*8;assert(box.push("long","c","t",n*1024,std::string(1024,'x'),now,view)==R::Ok);assert(box.peek("long",one,now+1,offset,output,sizeof(output),length)==R::Ok);assert(box.consume("long",one,offset,length,now+2)==R::Ok);}
  assert(box.finishStream("long",one,797)==R::Ok);assert(box.acknowledge("long",one,"s","t",798,view)==R::Ok&&view.totalBytes==102400&&view.nextOffset==102400);
  assert(box.put("max","c","s","t",Box::MaxTotalBytes,one,800)==R::Ok);assert(box.put("bad","c","s","t",Box::MaxTotalBytes+1,one,800)==R::Invalid);assert(box.put("bad","c","s","t",0,one,800)==R::Invalid);
 }
 std::cout<<"Clipboard stream mailbox: one slot, allocation failure, idempotence, committed offsets, idle TTL, >100KB and ack fences passed\n";
}
