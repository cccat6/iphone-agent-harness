import {t as translate,subscribe,localizeError} from '../i18n.js';
export function mountLocationRequest(root,{access,getSessionId,onAuthorized=()=>{},onError=()=>{},t=translate}={}){
 root.innerHTML='<div class="location-request-panel"><p data-location-request-text></p><div class="panel-actions"><button type="button" class="primary" data-location-authorize></button><button type="button" class="secondary-button" data-location-dismiss></button></div><p class="quiet-note" role="status" data-location-request-status hidden></p></div>';root.dataset.noI18n='';
 const q=s=>root.querySelector(s),button=q('[data-location-authorize]'),dismiss=q('[data-location-dismiss]'),status=q('[data-location-request-status]');let disposed=false,working=false,controller=null,generation=0,error=null,authorizedSession=null;
 function render(){if(disposed)return;const pending=access.getSnapshot();root.hidden=!pending||pending.sessionId!==getSessionId();if(root.hidden)authorizedSession=null;if(root.hidden&&working){generation++;controller?.abort();working=false;}q('[data-location-request-text]').textContent=t(pending?.code==='LOCATION_DENIED'?'location.deniedHelp':'location.requestHelp');button.textContent=t(working?'location.requesting':authorizedSession===pending?.sessionId?'interaction.resume':'location.authorizeContinue');button.disabled=working;dismiss.textContent=t('common.cancel');dismiss.disabled=working;status.textContent=error?localizeError(error):'';status.hidden=!error;}
 button.onclick=async()=>{const pending=access.getSnapshot();if(working||!pending||pending.sessionId!==getSessionId())return;const current=++generation;controller=new AbortController();working=true;error=null;render();try{
  const alreadyAuthorized=authorizedSession===pending.sessionId;
  if(!alreadyAuthorized){const grant=await access.authorize({signal:controller.signal});if(!grant.confirmed)throw Object.assign(new Error('LOCATION_PERMISSION_REQUIRED'),{code:'LOCATION_PERMISSION_REQUIRED'});}
  if(disposed||current!==generation||pending.sessionId!==getSessionId())return;
  authorizedSession=pending.sessionId;
  // When a second click is needed, call through immediately to preserve its user activation.
  const continued=await onAuthorized({...pending,userGesture:alreadyAuthorized});
  if(disposed||current!==generation||pending.sessionId!==getSessionId())return;
  working=false;if(continued!==false){authorizedSession=null;access.dismiss(pending.sessionId);}
 }catch(cause){if(!disposed&&current===generation&&cause.name!=='AbortError'){error=cause;onError(cause);}}finally{if(current===generation){working=false;render();}}};
 dismiss.onclick=()=>{authorizedSession=null;access.dismiss(getSessionId());error=null;render();};const unaccess=access.subscribe(render),unlocale=subscribe(render);render();return {refresh:render,dispose(){disposed=true;generation++;controller?.abort();unaccess();unlocale();root.replaceChildren();root.hidden=true;}};
}
