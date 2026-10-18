// Safari clipboard writes need a foreground, focused document and a fresh user
// gesture. Requesting text only queues it; only copyPending(), called directly
// from a click handler, touches the system clipboard. No clipboard reads.
const failure=code=>Object.assign(new Error(code),{code});
export function createClipboardController({navigator:nav=globalThis.navigator,document:doc=globalThis.document,isSecureContext=()=>globalThis.isSecureContext,now=()=>Date.now(),id=()=>crypto.randomUUID(),onChange=()=>{},isCurrent=()=>true}={}){
  let pending=null,last=null,writing=false;
  const listeners=new Set();
  const snapshot=()=>pending?{id:pending.id,requestId:pending.id,sessionId:pending.sessionId,targetId:pending.targetId,status:writing?'copying':'awaiting_user_action',characters:pending.text.length,requestedAt:pending.requestedAt,errorCode:pending.errorCode||null}:last?{...last}:null;
  const emit=()=>{for(const listener of [onChange,...listeners])try{listener(snapshot());}catch{/* UI observers cannot change clipboard outcomes. */}};
  const clear=item=>{item.signal?.removeEventListener('abort',item.abort);item.text='';if(pending===item)pending=null;};
  function cancel(reason=failure('CLIPBOARD_CANCELLED')){
    if(!pending)return;
    const item=pending;last={id:item.id,requestId:item.id,sessionId:item.sessionId,targetId:item.targetId,status:'cancelled',characters:item.text.length};clear(item);item.reject(reason);emit();
  }
  return {
    getSnapshot:snapshot,
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    getPendingText(){return pending?.text||'';},
    completeExternal(receipt){
      const item=pending;
      if(!item||writing||receipt?.status!=='copied'||receipt.source!=='shortcut'||receipt.requestId!==item.id||receipt.sessionId!==item.sessionId||receipt.targetId!==item.targetId||!Number.isFinite(receipt.copiedAt))throw failure('CLIPBOARD_TARGET_CHANGED');
      if(!isCurrent({sessionId:item.sessionId,targetId:item.targetId})){const error=failure('CLIPBOARD_TARGET_CHANGED');cancel(error);throw error;}
      const result={id:item.id,requestId:item.id,sessionId:item.sessionId,targetId:item.targetId,status:'copied',characters:item.text.length,copiedAt:receipt.copiedAt,source:'shortcut',requiresTargetRefocus:true,systemClipboardUnchanged:false};
      last=result;clear(item);item.resolve({...result});emit();return {...result};
    },
    request({text,sessionId,targetId,signal}={}){
      if(typeof text!=='string'||!text.length) return Promise.reject(failure('CLIPBOARD_TEXT_INVALID'));
      if(typeof sessionId!=='string'||!sessionId)return Promise.reject(failure('CLIPBOARD_SESSION_REQUIRED'));
      if(typeof targetId!=='string'||!targetId)return Promise.reject(failure('CLIPBOARD_TARGET_REQUIRED'));
      if(signal?.aborted)return Promise.reject(signal.reason||failure('CLIPBOARD_CANCELLED'));
      if(pending||writing)return Promise.reject(failure('CLIPBOARD_BUSY'));
      last=null;
      return new Promise((resolve,reject)=>{
        const item={id:id(),text,sessionId,targetId,signal,resolve,reject,requestedAt:now(),abort:()=>cancel(signal.reason||failure('CLIPBOARD_CANCELLED'))};pending=item;
        signal?.addEventListener('abort',item.abort,{once:true});emit();
      });
    },
    prepare(options){
      // prepare is the non-blocking harness API. Failed or cancelled requests
      // never leave an unhandled rejection while the model run has stopped.
      if(pending||writing)throw failure('CLIPBOARD_BUSY');
      if(typeof options?.text!=='string'||!options.text.length)throw failure('CLIPBOARD_TEXT_INVALID');
      if(typeof options.sessionId!=='string'||!options.sessionId)throw failure('CLIPBOARD_SESSION_REQUIRED');
      if(typeof options.targetId!=='string'||!options.targetId)throw failure('CLIPBOARD_TARGET_REQUIRED');
      if(options.signal?.aborted)throw options.signal.reason||failure('CLIPBOARD_CANCELLED');
      this.request(options).catch(()=>{});
      return snapshot();
    },
    // This method intentionally reaches writeText before any asynchronous work.
    async copyPending(){
      const item=pending;if(!item)throw failure('CLIPBOARD_NOT_PENDING');
      if(writing)throw failure('CLIPBOARD_BUSY');
      if(!isCurrent({sessionId:item.sessionId,targetId:item.targetId})){const error=failure('CLIPBOARD_TARGET_CHANGED');cancel(error);throw error;}
      try{
        if(!isSecureContext()||typeof nav?.clipboard?.writeText!=='function')throw failure('CLIPBOARD_UNAVAILABLE');
        if(doc?.visibilityState!=='visible'||doc?.hasFocus?.()!==true)throw failure('CLIPBOARD_FOREGROUND_REQUIRED');
        if(nav.userActivation&&nav.userActivation.isActive!==true)throw failure('CLIPBOARD_USER_GESTURE_REQUIRED');
        // Set the lock before calling the browser. Do not render or await first.
        writing=true;
        const operation=nav.clipboard.writeText(item.text);
        emit();
        await operation;
        if(pending!==item)throw failure('CLIPBOARD_CANCELLED');
        if(!isCurrent({sessionId:item.sessionId,targetId:item.targetId})){const error=failure('CLIPBOARD_TARGET_CHANGED');cancel(error);throw error;}
        const receipt={id:item.id,requestId:item.id,sessionId:item.sessionId,targetId:item.targetId,status:'copied',characters:item.text.length,copiedAt:now(),requiresTargetRefocus:true,systemClipboardUnchanged:false};
        last=receipt;clear(item);item.resolve({...receipt});return {...receipt};
      }catch(error){
        const exposed=error?.code?error:failure(error?.name==='NotAllowedError'?'CLIPBOARD_PERMISSION_DENIED':'CLIPBOARD_WRITE_FAILED');
        if(pending===item)item.errorCode=exposed.code;
        throw exposed;
      }finally{writing=false;emit();}
    },
    cancel,
    clear(){cancel();last=null;emit();},
  };
}
