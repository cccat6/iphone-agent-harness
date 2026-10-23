// Rebuild a lost connection's context without generating intermediate answers.
// Keep assistant calls and all their results in the same input batch.
export async function warmupReplay({messages,inputFor,payload,socket,events,signal,batchBytes=8000000}){
 const size=value=>new TextEncoder().encode(JSON.stringify(value)).length;
 let input=[],bytes=0,id=null,requests=0,wireBytes=0;
 const flush=async()=>{
  if(!input.length)return;if(signal?.aborted)throw signal.reason;
  const body={...payload,input,generate:false,...(id?{previous_response_id:id}:{})};if(!id)delete body.previous_response_id;
  wireBytes+=size(body);const response=await socket.request(body,{signal});
  if(!response.ok){await response.body?.cancel();throw Object.assign(Error('Provider context warmup unavailable'),{code:'CONTEXT_TRANSPORT_LIMIT'});}
  let completed=null;for await(const event of events(response.body,signal)){
   if(event.type==='error'||['response.failed','response.incomplete'].includes(event.type))throw Object.assign(Error('Provider context warmup failed'),{code:'CONTEXT_TRANSPORT_LIMIT'});
   if(event.type==='response.completed')completed=event.response;
   if(event.type==='response.output_item.added'||event.type==='response.output_text.delta')throw Error('Context warmup unexpectedly generated output');
  }
  if(completed?.status!=='completed'||!/^resp_[A-Za-z0-9_-]+$/.test(completed.id||'')||(completed.output?.length||0)!==0)throw Error('Invalid context warmup completion');
  id=completed.id;requests++;input=[];bytes=0;
 };
 for(let i=0;i<messages.length;i++){
  const group=[messages[i]];if(messages[i].role==='assistant'&&messages[i].toolCalls?.length)while(messages[i+1]?.role==='tool')group.push(messages[++i]);
  const next=await inputFor(group),cost=size(next);if(input.length&&bytes+cost>batchBytes)await flush();
  input.push(...next);bytes+=cost;
 }
 await flush();if(!id)throw Error('Empty context replay');return {responseId:id,requests,wireBytes};
}
