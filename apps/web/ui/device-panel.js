import {validateRTCConfiguration,DeviceRTCTransport} from '../core/device-rtc.js';
import {parseDeviceSetupLink,takeDeviceSetupLink,bridgeImportURL,rememberDeviceSetupReturn} from '../core/device-setup.js';
import {DeviceClient,DeviceError,safeDeviceServerCode} from '../core/device.js';
import {getLocale, subscribe, localizeError} from '../i18n.js';
import {DEVICE_MESSAGES} from '../locales/device.js';

const DEFAULT_BRIDGE_URL='http://igent.local';
export function defaultBridgeEndpoint(value){
  if(!value||/^http:\/\/harness-[a-f0-9]{12}\.local$/.test(value))return DEFAULT_BRIDGE_URL;
  try{
    const url=new URL(value);
    // The RTC payload contains a DHCP snapshot. Keep it for the data path,
    // but never use it as the bridge discovery URL.
    if(url.protocol==='http:'&&/^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname))return DEFAULT_BRIDGE_URL;
  }catch{}
  return value;
}
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const sameProof=(proof,client)=>Boolean(proof&&client?.identityVerified&&client.bindingVerified&&['boardId','bootId','clientId','targetId'].every(key=>proof[key]===client[key]));
/** Only native, focused key events can contribute to this page's input proof. */
export function trustedNonceDigit(event){
  if(event?.isTrusted!==true||event.repeat||event.ctrlKey||event.metaKey||event.altKey)return null;
  const code=/^(?:Digit|Numpad)([0-9])$/.exec(event.code||'');
  return code?code[1]:/^[0-9]$/.test(event.key||'')?event.key:null;
}

/** Connection diagnostics are identifiers only; never render raw server text. */
export function deviceErrorDetails(error){
 const rows=[];if(typeof error?.code==='string'&&/^DEVICE_[A-Z0-9_]{1,64}$/.test(error.code))rows.push(error.code);
 if(Number.isInteger(error?.status)&&error.status>=400&&error.status<=599)rows.push('HTTP '+error.status);
 const reason=safeDeviceServerCode(error?.serverCode);if(reason)rows.push(reason);return rows.join('\n');
}

/** Fixed device onboarding UI. No network request or input is sent before a user action. */
export function createDevicePanel({store,capture,openPanel,getPanelRoot,onDeviceChange=()=>{},onSettingsChange=()=>{},isBusy=()=>false,onToast=()=>{},clientFactory=options=>new DeviceClient(options),bridgeFactory=options=>new DeviceRTCTransport(options)}={}){
  let transport=null,legacyEndpoint='';
  let client=null,proof=null,targets=[],targetId='',root=null,dialog=null,controller=null,operation=0,working=false;
  let challenge=null,nonce='',armed=false,challengeTimer=null,testWait=null,unsubscribe=null,settings={},statusKey='notPaired',statusDetail='',checkedAt=null;
  let legacyBinding=false,challengeCancellation=Promise.resolve(),bindingError=null,verifiedRTC=null,challengeMayExist=false,challengeRetryController=null;
  let connectionActive=false,pendingSetup=null,connectionEpoch=0,monitorTimer=null,refreshTask=null,disposed=false,lastRefreshStarted=0,reconnectTimer=null,reconnectAttempts=0,reconnecting=false;
  let importError=null,progressTimer=null,progressStarted=0,informationEdit=0,informationSaving=null,pendingSetupSource='';
  function receiveSetupLink(){
    const source=globalThis.location?.href;if(!source||!new URLSearchParams(globalThis.location.hash?.slice(1)||'').has('device'))return false;
    if(source===pendingSetupSource)return true;
    informationEdit++;pendingSetupSource=source;
    try{pendingSetup=parseDeviceSetupLink(source);importError=null;}catch(error){pendingSetup=null;importError=error;}
    return true;
  }
  receiveSetupLink();
  const componentError=key=>Object.assign(new Error('DEVICE_UI_'+key),{deviceMessageKey:key});
  const normalizedError=error=>error&&typeof error==='object'?error:Object.assign(new Error(String(error||'DEVICE_RTC_CONNECT_FAILED')),{code:String(error||'DEVICE_RTC_CONNECT_FAILED')});
  const copy=(key,params={})=>Object.entries(params).reduce((text,[name,value])=>text.replaceAll('{'+name+'}',String(value)),(DEVICE_MESSAGES[getLocale()]||DEVICE_MESSAGES.en)[key]||key);
  const node=selector=>root?.querySelector(selector);
  const mounted=()=>Boolean(root?.isConnected&&getPanelRoot()?.contains(root));
  const getState=()=>{const connected=Boolean(connectionActive&&client?.paired&&client.identityVerified),selected=targets.find(target=>target.targetId===(client?.targetId||targetId)),bluetoothConnected=Boolean(connected&&selected?.connected),phoneInputReady=Boolean(bluetoothConnected&&usableTarget(selected)),targetBound=Boolean(connected&&phoneInputReady&&client?.bindingVerified&&client.targetId===targetId),inputVerified=targetBound&&sameProof(proof,client),ready=targetBound;return {informationReady:!!information(),connected,bluetoothConnected,phoneInputReady,targetBound,inputVerified,ready,legacyInputTestRequired:Boolean(connected&&legacyBinding&&!targetBound),sharing:Boolean(capture.active),checking:Boolean(refreshTask?.visible),boardId:connected?client.boardId:null,targetId:ready?client.targetId:null,status:working||reconnecting?'connecting':statusKey==='operationFailed'?'error':ready?(capture.active?'sharing':'ready'):connected?'needs-target':'disconnected'};};
  const publish=()=>onDeviceChange(getState().ready?client:null,getState());
  const setStatus=(key,detail='')=>{statusKey=key;statusDetail=detail;renderStatus();publish();};
  function invalidateProof(){proof=null;publish();}
  function resetChallenge(){challengeRetryController?.abort();challengeRetryController=null;if(challengeMayExist&&client&&targetId){const tested=client,selected=targetId;challengeCancellation=challengeCancellation.catch(()=>{}).then(()=>tested.cancelChallenge?.(selected));challengeCancellation.catch(()=>{});}challengeMayExist=false;if(testWait){testWait.reject(componentError('needsFreshChallenge'));testWait=null;}clearTimeout(challengeTimer);challengeTimer=null;challenge=null;nonce='';armed=false;const input=node('[data-nonce]');if(input)input.value='';}
  function information(){
    if(importError||pendingSetupSource)return null;
    try{const candidate=pendingSetup?pendingSetup:{baseUrl:defaultBridgeEndpoint(settings.deviceEndpoint),boardId:settings.deviceBoardId,rtc:settings.deviceRTC};
      if(!candidate.rtc)return null;const rtc=validateRTCConfiguration(candidate.rtc);if(!rtc.ip)return null;
      return {...candidate,rtc};
    }catch{return null;}
  }
  async function saveInformation(value,{current}={}){
    if(!value?.rtc||!validateRTCConfiguration(value.rtc).ip)throw componentError('importInvalid');
    const edit=informationEdit,source=pendingSetupSource;current ||= ()=>edit===informationEdit;
    const previous=informationSaving;let finish;const completed=new Promise(resolve=>finish=resolve);informationSaving=completed;
    try{
      if(previous)await previous;if(!current())return false;
      await savePublicSettings({deviceEndpoint:value.baseUrl,deviceRTC:value.rtc,...(value.boardId?{deviceBoardId:value.boardId}:{})});
      if(!current())return false;pendingSetup=null;importError=null;if(source&&globalThis.location?.href===source)takeDeviceSetupLink();pendingSetupSource='';return true;
    }finally{finish();if(informationSaving===completed)informationSaving=null;}
  }
  function stopProgress(){clearInterval(progressTimer);progressTimer=null;}
  function startProgress(){stopProgress();progressStarted=Date.now();progressTimer=setInterval(()=>renderStatus(),1000);progressTimer?.unref?.();}
  function renderStatus(){
    if(!mounted())return;
    const message=statusKey==='operationFailed'?copy('connectionFailed',{detail:statusDetail?.deviceMessageKey?copy(statusDetail.deviceMessageKey):localizeError(normalizedError(statusDetail))}):copy(statusKey,{count:nonce.length,seconds:statusDetail?.seconds||0});
    const output=node('[data-device-status]');output.textContent=message;output.hidden=working||statusKey==='operationFailed'||statusKey==='infoRequired'||statusKey==='infoSaved';output.classList.toggle('error',statusKey==='operationFailed');
    const progress=node('[data-connection-progress]');if(progress){progress.hidden=!working&&statusKey!=='operationFailed';node('[data-progress-message]').textContent=message;node('[data-progress-elapsed]').textContent=working?copy('progressElapsed',{seconds:Math.floor((Date.now()-progressStarted)/1000)}):'';}
    const details=node('[data-connection-error-details]');if(details){const text=statusKey==='operationFailed'&&!working?deviceErrorDetails(statusDetail):'';details.hidden=!text;node('[data-connection-error-content]').textContent=text;details.open=Boolean(text);}
  }
  function renderAvailability(state=getState()){
    if(!mounted())return;
    const busy=working||isBusy(),connected=state.connected,selected=targets.find(target=>target.targetId===targetId),available=selected&&usableTarget(selected);
    for(const [selector,disabled]of [
      ['[data-target]',busy||!connected||!targets.some(usableTarget)],['[data-disconnect]',busy||!connected],['[data-address]',busy],
      ['[data-pair]',busy||!information()],['[data-refresh]',busy||!connected],['[data-start-challenge]',busy||!connected||!available],
      ['[data-start-sharing]',busy||!state.ready||capture.active],['[data-stop-sharing]',busy||!capture.active],['[data-control-check]',busy||!state.ready]
    ])node(selector).disabled=Boolean(disabled);
  }
  function refreshUI(){
    if(disposed||!mounted())return;
    // External task/submission state may change without a device event. Only
    // update availability here; keep the selected target and focused nonce intact.
    renderAvailability();
    if(working||isBusy()||informationSaving||importError||!pendingSetup?.rtc)return;
    const edit=informationEdit,currentOperation=operation,value=pendingSetup;
    const current=()=>!disposed&&mounted()&&operation===currentOperation&&informationEdit===edit&&!working&&!isBusy();
    void saveInformation(value,{current}).then(saved=>{if(!current())return;if(saved)statusKey='infoSaved';renderState();}).catch(error=>{if(!current())return;importError=error;statusKey='importInvalid';renderState();});
  }
  function renderState(){
    if(!mounted())return;
    const heading=root.closest('#panel-content')?.querySelector('.panel-header');if(heading){for(const [selector,key] of [['h2','title']]){const element=heading.querySelector(selector);if(element){element.dataset.noI18n='';element.textContent=copy(key);}}}
    for(const element of root.querySelectorAll('[data-device-text]'))element.textContent=copy(element.dataset.deviceText);
    renderStatus();
    const state=getState(),connected=state.connected,verified=state.inputVerified,ready=state.ready;
    node('[data-bridge-state]').textContent=copy(connected?'bridgeConnected':'bridgeDisconnected');
    node('[data-bridge-address]').textContent=connected?client.baseUrl.origin:defaultBridgeEndpoint(settings.deviceEndpoint);
    node('[data-bridge-settings]').hidden=!connected;node('[data-bridge-settings]').href=connected?client.baseUrl.origin+'/settings?lang='+encodeURIComponent(getLocale()):'#';
    const saved=information();node('[data-information-complete]').textContent=copy('infoSaved');node('[data-info-step]').hidden=false;node('[data-info-step]').dataset.complete=String(!!saved);node('[data-information-complete]').hidden=!saved;node('[data-import-help]').hidden=!!saved;node('[data-import-connection]').textContent=copy(saved?'infoReload':'importConnection');
    // Reacquire through the configured local name; rtc.ip is a DHCP snapshot
    // for the data channel, not a stable address for discovery or settings.
    const url=bridgeImportURL(DEFAULT_BRIDGE_URL,getLocale());node('[data-import-connection]').href=url;node('[data-reimport-connection]').href=url;
    node('[data-information-state]').textContent=saved?'':copy('infoRequired');node('[data-information-state]').hidden=!!saved;node('[data-connect-step]').dataset.unavailable=String(!saved);
    node('[data-test-controls]').hidden=!connected;
    node('[data-target]').replaceChildren(...targets.map(target=>{const option=document.createElement('option');option.value=target.targetId;option.textContent=copy('targetLabel',{id:target.targetId})+' · '+copy(target.connected&&target.encrypted&&target.hidSubscribed?'targetReady':'targetUnavailable');option.disabled=!(target.connected&&target.encrypted&&target.hidSubscribed);return option;}));
    if(!targets.length){const option=document.createElement('option');option.value='';option.textContent=copy(connected?'noTargets':'bridgeRequired');node('[data-target]').append(option);}
    node('[data-target]').value=targetId;
    node('[data-pair]').textContent=copy(connected?'reconnect':'pair');renderAvailability(state);
    node('[data-sharing-state]').textContent=copy(capture.active?'sharingReady':'sharingOff');
    node('[data-binding-state]').textContent=copy(verified?'bound':!connected?'bridgeRequired':state.targetBound?'inputTestOptional':legacyBinding?'legacyInputTest':state.bluetoothConnected?'phoneSelect':'noTargets');
    node('[data-test-success]').hidden=!verified;node('[data-binding-state]').hidden=verified||state.targetBound;
    const snapshot=client?.status();node('[data-device-metadata]').textContent=snapshot?[copy('boardLabel')+': '+(snapshot.boardId||'—'),copy('targetLabelShort')+': '+(snapshot.targetId||'—'),checkedAt?copy('lastChecked')+': '+new Intl.DateTimeFormat(getLocale(),{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(checkedAt):''].filter(Boolean).join('\n'):'';
  }
  async function savePublicSettings(patch){settings=await store.saveSettings(patch);onSettingsChange(settings);}
  function values(){
    const entered=node('[data-address]')?.value.trim()||defaultBridgeEndpoint(settings.deviceEndpoint)||DEFAULT_BRIDGE_URL;
    if(entered.includes('#device=')){try{return {...parseDeviceSetupLink(entered),expectedFingerprint:''};}catch{throw componentError('invalidAddress');}}
    let baseUrl;try{baseUrl=DeviceClient.createURL(entered);}catch{throw componentError('invalidAddress');}
    const saved=information();if(!saved||saved.baseUrl!==baseUrl)throw componentError('infoRequired');
    return {...saved,expectedFingerprint:''};
  }
  function begin(){if(working||isBusy())throw componentError('busy');working=true;startProgress();publish();controller?.abort();controller=new AbortController();const current=++operation;renderState();return {signal:controller.signal,current};}
  function valid(current){return !disposed&&current===operation&&!controller?.signal.aborted;}
  async function action(work){let current;try{const started=begin();current=started.current;await work(started);if(valid(current))renderState();}catch(rawError){const error=normalizedError(rawError);if((mounted()||current===operation)&&(current===undefined||current===operation)&&error.name!=='AbortError')setStatus('operationFailed',error);}finally{if(current===operation){working=false;stopProgress();publish();if(mounted())renderState();}}}
  function close({abort=false}={}){const preserve=working&&!armed&&!abort,keepConnection=Boolean(client?.paired&&transport&&!transport.closed);if(!preserve){stopProgress();operation++;controller?.abort();controller=null;working=false;resetChallenge();}unsubscribe?.();unsubscribe=null;dialog?.removeEventListener('close',close);root=null;dialog=null;publish();if(keepConnection)startMonitor();}
  const usableTarget=target=>target.connected&&target.encrypted&&target.hidSubscribed;
  function stopMonitor(){clearTimeout(monitorTimer);monitorTimer=null;}
  function startMonitor(){
    stopMonitor();if(disposed||!client?.paired||transport?.closed)return;
    // A running task already checks context and renews its lease. Avoid adding
    // a second periodic identity/binding read to the same serial RTC channel.
    monitorTimer=setTimeout(async()=>{monitorTimer=null;if(!isBusy())await checkConnection();startMonitor();},5000);
    monitorTimer?.unref?.();
  }
  function clearReconnect(){clearTimeout(reconnectTimer);reconnectTimer=null;reconnectAttempts=0;reconnecting=false;}
  function scheduleReconnect(){
    if(disposed||working||isBusy()||reconnectTimer||reconnectAttempts>=4||!information())return;
    reconnecting=true;setStatus('rtcOpening');
    const delay=[500,1200,2500,5000][reconnectAttempts++];
    reconnectTimer=setTimeout(()=>{
      reconnectTimer=null;
      if(disposed||working||isBusy()||!information()){reconnecting=false;publish();return;}
      Promise.resolve(connect({automatic:true})).then(()=>{
        if(getState().connected){clearReconnect();startMonitor();}
        else scheduleReconnect();
      }).catch(()=>scheduleReconnect());
    },delay);
    reconnectTimer?.unref?.();
  }
  async function checkConnection(){
    // A connection test owns the focused input and its countdown until confirmed.
    // Reading status must not rebuild that UI or disturb its in-flight challenge.
    if(disposed||working||armed)return false;
    return refreshConnection({force:true});
  }
  async function refreshConnection({force=false}={}){
    if(disposed||working||armed)return getState().ready;
    if(refreshTask)return refreshTask.promise.catch(()=>false);
    if(!client?.paired||!transport||transport.closed){if(connectionActive){connectionActive=false;targets=[];proof=null;checkedAt=null;publish();renderState();}return false;}
    if(!force&&Date.now()-lastRefreshStarted<300)return getState().ready;
    try{return await refresh();}catch{return false;}
  }
  function foreground(){if(globalThis.document?.visibilityState==='hidden'&&armed)resetChallenge();else if(globalThis.document?.visibilityState==='visible')void refreshConnection();}
  globalThis.document?.addEventListener?.('visibilitychange',foreground);
  async function associate(tested,selected,signal){
    try{await tested.bindTarget(selected,{signal});legacyBinding=false;}
    catch(error){
      // Older firmware has no association endpoint. Keep its authenticated
      // connection usable for the existing optional-test path; all other
      // errors remain errors, including denial, busy, timeout and network loss.
      if(error?.code!=='DEVICE_HTTP_ERROR'||error.status!==404)throw error;
      legacyBinding=true;
    }
  }
  async function refresh(signal,recoverExpiredCredential=null,{allowAssociate=false}={}){
    const tested=client,epoch=connectionEpoch;
    if(!tested?.paired)return false;
    if(refreshTask?.client===tested&&refreshTask.epoch===epoch)return refreshTask.promise;
    let deadlineExpired=false;
    const abort=new AbortController(),cancel=()=>abort.abort(signal?.reason),timer=setTimeout(()=>{deadlineExpired=true;abort.abort();},8000);
    signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
    const current=()=>tested===client&&epoch===connectionEpoch&&!disposed;
    // Heartbeat and navigation reads retain the last confirmed visible state.
    // Explicit device actions already own visible progress via working.
    lastRefreshStarted=Date.now();
    const task={client:tested,epoch,visible:working};refreshTask=task;publish();
    task.promise=(async()=>{
      try{
        const identity=await tested.identity({signal:abort.signal});
        if(identity?.rtc&&identity.boardId===tested.boardId&&current()&&!pendingSetup){const rtc=validateRTCConfiguration(identity.rtc);verifiedRTC=rtc;if(rtc.ip&&JSON.stringify(rtc)!==JSON.stringify(settings.deviceRTC)&&defaultBridgeEndpoint(settings.deviceEndpoint)===tested.baseUrl.origin)await savePublicSettings({deviceRTC:rtc,deviceBoardId:identity.boardId});}
        let binding;
        try{binding=await tested.getBinding({signal:abort.signal});}
        catch(error){
          // Renew only an explicit expired credential after identity was verified.
          // Never replay input, timeouts or denials, or renew during a user task.
          if(error.code!=='DEVICE_AUTH_EXPIRED'||error.status!==401||error.serverCode!=='invalid_client_credential'||!current()||abort.signal.aborted||isBusy())throw error;
          if(recoverExpiredCredential)await recoverExpiredCredential(abort.signal);
          else{const saved=tested.exportCredentials();await tested.pair({clientId:saved.clientId,expectedFingerprint:saved.expectedFingerprint||saved.publicKeyFingerprint,setupPassword:''},{signal:abort.signal});if(!current()||abort.signal.aborted)return false;await store.saveLocalCredential('device:'+tested.baseUrl.origin,tested.exportCredentials());}
          if(!current()||abort.signal.aborted)return false;
          binding=await tested.getBinding({signal:abort.signal});
        }
        if(!current()||abort.signal.aborted||armed)return false;
        targets=binding.targets;checkedAt=new Date();connectionActive=true;
        // Association is independent from the optional keyboard test. A saved
        // association stays fixed; only a single unambiguous new target is automatic.
        const available=targets.filter(usableTarget);
        if(binding.targetId){targetId=binding.targetId;if(binding.bindingVerified===true||tested.bindingVerified)legacyBinding=false;}
        else if(available.length===1){targetId=available[0].targetId;if(allowAssociate&&!legacyBinding&&typeof tested.bindTarget==='function'){try{await associate(tested,targetId,abort.signal);}catch(error){if(!['DEVICE_TARGET_BUSY','DEVICE_BOARD_BUSY','DEVICE_WRITER_BUSY'].includes(error.code))throw error;bindingError=error;}if(!current()||abort.signal.aborted)return false;}}

        // A lost Bluetooth link invalidates this page's proof permanently. A later
        // reconnect must pass a new input test, even if the board retains a binding.
        if(!sameProof(proof,tested)||!targets.some(target=>target.targetId===proof?.targetId&&usableTarget(target)))proof=null;
        if(!binding.targetId&&!targets.some(target=>target.targetId===targetId&&usableTarget(target)))targetId=targets.filter(usableTarget).length===1?targets.find(usableTarget).targetId:'';
        if(!armed&&!working&&!(statusKey==='operationFailed'&&Number.isInteger(statusDetail?.status)&&statusDetail.status!==401))statusKey=getState().inputVerified?'bound':getState().ready?'inputTestOptional':legacyBinding?'legacyInputTest':targets.some(usableTarget)?'phoneSelect':'noTargets';
        publish();if(!armed)renderState();return getState().ready;
      }catch(error){
        if(deadlineExpired&&!signal?.aborted)error=new DeviceError('DEVICE_TIMEOUT');
        if(current()){connectionActive=false;targets=[];proof=null;checkedAt=null;setStatus('operationFailed',error);if(!armed)renderState();}
        throw error;
      }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(refreshTask===task){refreshTask=null;publish();}}
    })();
    return task.promise;
  }
  async function ensureReady(){
    // The caller must await a current board response, not authorize from a cached
    // green badge. These reads never submit or retry any HID input.
    if(!getState().ready||working||armed||disposed)return false;
    try{await refresh();return getState().ready;}catch{return false;}
  }
  async function open({isCurrent=()=>true}={}){
    receiveSetupLink();
    close();const opening=operation,loadedSettings=await store.getSettings();if(opening!==operation||!isCurrent())return null;settings=loadedSettings;
    legacyEndpoint=settings.deviceEndpoint&&defaultBridgeEndpoint(settings.deviceEndpoint)!==settings.deviceEndpoint?settings.deviceEndpoint:'';
    if(pendingSetup&&!isBusy()){const edit=informationEdit;try{await saveInformation(pendingSetup,{current:()=>edit===informationEdit&&opening===operation&&isCurrent()&&!isBusy()});}catch(error){if(edit===informationEdit)importError=error;}}
    if(opening!==operation||!isCurrent())return null;
    statusKey=statusKey==='operationFailed'?'operationFailed':importError?'importInvalid':getState().ready?'bound':getState().connected?'paired':information()?'infoSaved':'infoRequired';
    if(!document.querySelector('link[data-device-panel-style]')){const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('./device-panel.css',import.meta.url).href;style.dataset.devicePanelStyle='';document.head.append(style);}
    openPanel(copy('title'),'',`<div class="device-onboarding" data-no-i18n>
      <section class="device-step device-info-step" data-info-step><h3 data-device-text="infoTitle"></h3><p class="device-information-complete" data-information-complete hidden></p><a class="primary device-settings-link" data-import-connection data-device-text="importConnection"></a><p class="quiet-note" data-import-help data-device-text="importConnectionHelp"></p></section>
      <section class="device-step device-bridge-card" data-connect-step><h3 data-device-text="pairTitle"></h3><p class="quiet-note" data-information-state></p><p class="device-bridge-state" data-bridge-state></p><p class="device-bridge-address" data-bridge-address></p>
      <details class="device-configuration" data-configuration><summary data-device-text="configureBridge"></summary><label class="field"><span data-device-text="address"></span><input data-address type="url" inputmode="url" autocapitalize="none" autocomplete="off" spellcheck="false" placeholder="http://igent.local" value="${escapeHTML(pendingSetup?.baseUrl||defaultBridgeEndpoint(settings.deviceEndpoint))}"></label><a class="device-settings-link" data-reimport-connection data-device-text="infoReload"></a></details><div class="panel-actions"><button type="button" class="primary" data-pair data-device-text="pair"></button><button type="button" class="secondary-button" data-disconnect data-device-text="disconnect"></button></div><div class="device-progress" data-connection-progress role="status" aria-live="polite" hidden><span data-progress-message></span><span data-progress-elapsed aria-hidden="true"></span></div><details class="device-error-details" data-connection-error-details hidden><summary data-device-text="errorDetails"></summary><pre data-connection-error-content></pre></details><a class="device-settings-link" data-bridge-settings data-device-text="manageBridge"></a></section>
      <section class="device-step"><h3 data-device-text="bindTitle"></h3><div class="device-test-success" data-test-success role="status" aria-live="polite" hidden><span class="device-test-success-icon" aria-hidden="true">✓</span><strong data-device-text="bound"></strong></div><p class="quiet-note" data-device-text="inputTestHelp"></p><p class="quiet-note" data-binding-state></p><div data-test-controls><label class="field"><span data-device-text="target"></span><select data-target></select></label><button type="button" class="secondary-button" data-refresh data-device-text="refresh"></button><label class="field device-nonce-field"><span data-device-text="nonceLabel"></span><input data-nonce type="text" readonly inputmode="none" autocomplete="off" autocapitalize="none" spellcheck="false" aria-describedby="device-nonce-help"><small id="device-nonce-help" data-device-text="nonceHelp"></small></label><div class="panel-actions"><button type="button" class="secondary-button" data-start-challenge data-device-text="startChallenge"></button></div></div></section>
      <section class="device-step"><h3 data-device-text="settingsTitle"></h3><div class="panel-actions"><button type="button" class="primary" data-start-sharing data-device-text="startSharing"></button><button type="button" class="secondary-button" data-stop-sharing data-device-text="stopSharing"></button></div><p class="quiet-note" data-sharing-state></p></section>
      <details class="device-step"><summary data-device-text="prepareTitle"></summary><ol><li data-device-text="prepareUsb"></li><li data-device-text="prepareWifi"></li><li data-device-text="prepareCa"></li></ol></details>
      <details class="device-step"><summary data-device-text="phoneGuide"></summary><ol><li data-device-text="prepareBluetooth"></li><li data-device-text="settingsHelp"></li></ol></details>
      <details class="device-step"><summary data-device-text="advanced"></summary><pre data-device-metadata></pre><button type="button" class="secondary-button" data-control-check data-device-text="checkControl"></button></details><div class="status-box device-status" data-device-status role="status" aria-live="polite"></div></div>`);
    root=getPanelRoot().querySelector('.device-onboarding');node('[data-address]').addEventListener('input',async()=>{
      const edit=++informationEdit,value=node('[data-address]').value.trim();importError=null;pendingSetupSource='';
      if(value.includes('#device=')){
        pendingSetup={baseUrl:value};renderState();
        try{const imported=parseDeviceSetupLink(value);await saveInformation(imported,{current:()=>edit===informationEdit});}catch(error){if(edit===informationEdit)importError=error;}
      }else{try{pendingSetup=defaultBridgeEndpoint(settings.deviceEndpoint)===DeviceClient.createURL(value)?null:{baseUrl:value};}catch{pendingSetup={baseUrl:value};}}
      if(edit===informationEdit)renderState();
    });
    for(const key of ['[data-import-connection]','[data-reimport-connection]','[data-bridge-settings]'])node(key).onclick=()=>rememberDeviceSetupReturn();dialog=root.closest('dialog');dialog?.addEventListener('close',close);unsubscribe=subscribe(renderState);
    function connection(configuration,signal){
      resetChallenge();stopMonitor();legacyBinding=false;bindingError=null;verifiedRTC=null;connectionEpoch++;connectionActive=false;invalidateProof();
      const previous=transport;transport=null;previous?.close();challengeCancellation=Promise.resolve();
      setStatus('rtcOpening');
      const bridge=bridgeFactory({baseUrl:configuration.baseUrl,rtc:configuration.rtc,onProgress:value=>{if(working){const stages={configuration:'rtcOpening',network:'rtcNetwork',handshake:'rtcHandshake',channel:'rtcChannel',ready:'rtcReading'};setStatus(stages[value.phase]||'rtcOpening');}},onDisconnect:rawError=>{if(transport!==bridge)return;const error=normalizedError(rawError||componentError('rtcDisconnected'));stopMonitor();connectionEpoch++;connectionActive=false;targets=[];invalidateProof();resetChallenge();setStatus('operationFailed',error);renderState();
        // A lost RTC transport is recoverable while no phone mutation is in
        // flight. Never replay an input operation or reconnect after an
        // explicit user disconnect/cancel.
        if(error?.code!=='DEVICE_REQUEST_CANCELLED'&&!working&&!isBusy()&&!disposed)scheduleReconnect();
      }});
      const ready=bridge.open({signal});ready.catch(()=>{});return {bridge,ready};
    }
    node('[data-disconnect]').onclick=()=>{if(working||isBusy())return;clearReconnect();stopMonitor();connectionEpoch++;const previous=transport;transport=null;previous?.close();connectionActive=false;client?.clearCredentials();client=null;targets=[];targetId='';resetChallenge();invalidateProof();setStatus('notPaired');renderState();};
    const connect=({automatic=false}={})=>{if(working||isBusy())return;const address=node('[data-address]')?.value.trim()||defaultBridgeEndpoint(settings.deviceEndpoint)||DEFAULT_BRIDGE_URL;if(!address){node('[data-configuration]')?.setAttribute('open','');node('[data-address]')?.focus();return;}if(!automatic)clearReconnect();return action(async({signal,current})=>{
      // Keep imported identity and RTC metadata across failed attempts; clear only after persistence succeeds.
      if(!information())throw componentError('infoRequired');
      const configuration=values();await saveInformation(configuration);
      const preferredId=client?.paired&&client.baseUrl?.origin===configuration.baseUrl?client.clientId:undefined;
      // Create the peer from the explicit Connect action; no auxiliary tab is opened.
      const {bridge,ready}=connection(configuration,signal);let retained=false;
      try{
       const clientId=await store.ensureDeviceClientId(configuration.baseUrl,{preferredId});await ready;if(!valid(current))return;
       resetChallenge();invalidateProof();client=null;targets=[];targetId='';setStatus('rtcReading');
       const candidate=clientFactory({...configuration,...(bridge?{fetchImpl:bridge.fetch}:{})});
       if(configuration.boardId){const identity=await candidate.identity({signal});if(identity.boardId!==configuration.boardId){candidate.clearCredentials();throw Object.assign(new Error('DEVICE_IDENTITY_MISMATCH'),{code:'DEVICE_IDENTITY_MISMATCH'});}}
       let saved=await store.getLocalCredential('device:'+configuration.baseUrl);
       // Preserve an existing board credential across the automatic hostname change.
       // pinIdentity below still checks the old board fingerprint before it is used.
       if(!saved&&legacyEndpoint&&configuration.baseUrl===DEFAULT_BRIDGE_URL){const previous=await store.getLocalCredential('device:'+legacyEndpoint);if(previous)saved={...previous,baseUrl:configuration.baseUrl};}
       if(!valid(current))return;
       const enroll=async(enrollmentId,enrollmentSignal=signal,expectedFingerprint=configuration.expectedFingerprint)=>{
        await candidate.pair({...configuration,clientId:enrollmentId,setupPassword:'',expectedFingerprint},{signal:enrollmentSignal});
       };
       setStatus('pairing');
       if(saved){candidate.restoreCredentials(saved);await candidate.pinIdentity(saved.expectedFingerprint||saved.publicKeyFingerprint,{signal});}
       else await enroll(clientId);
       if(configuration.boardId&&candidate.boardId!==configuration.boardId){candidate.clearCredentials();throw Object.assign(new Error('DEVICE_IDENTITY_MISMATCH'),{code:'DEVICE_IDENTITY_MISMATCH'});}
       if(!valid(current)){candidate.clearCredentials();return;}client=candidate;transport=bridge;connectionActive=true;
       setStatus('rtcChecking');await refresh(signal,saved?async recoverySignal=>{
        await store.deleteLocalCredential('device:'+configuration.baseUrl);
        if(!valid(current)||recoverySignal.aborted)return;
        await enroll(saved.clientId,recoverySignal,saved.expectedFingerprint||saved.publicKeyFingerprint);
       }:null,{allowAssociate:true});if(!valid(current))return;
       setStatus('rtcSaving');await store.saveLocalCredential('device:'+configuration.baseUrl,client.exportCredentials());
       const deviceRTC=verifiedRTC||bridge?.exportConfiguration?.();await savePublicSettings({deviceEndpoint:configuration.baseUrl,deviceFingerprint:client.status().publicKeyFingerprint,...(deviceRTC?{deviceRTC}: {})});retained=true;pendingSetup=null;const configurationNode=node('[data-configuration]');if(configurationNode){configurationNode.open=false;configurationNode.removeAttribute?.('open');}clearReconnect();if(bindingError)setStatus('operationFailed',bindingError);else setStatus(getState().ready?'inputTestOptional':legacyBinding?'legacyInputTest':'paired');startMonitor();
      }finally{if(!retained){bridge?.close();if(transport===bridge)transport=null;connectionActive=false;invalidateProof();}}
    });
    };
    node('[data-pair]').onclick=connect;
    node('[data-refresh]').onclick=()=>action(async({signal,current})=>{await refresh(signal);if(valid(current))setStatus(getState().ready?'inputTestOptional':legacyBinding?'legacyInputTest':getState().bluetoothConnected?'phoneSelect':'noTargets');});
    node('[data-target]').onchange=()=>{if(working||isBusy()||!getState().connected){renderState();return;}const selected=node('[data-target]').value;return action(async({signal,current})=>{const tested=client,previousProof=proof;resetChallenge();try{await challengeCancellation;if(!valid(current)||client!==tested)return;await associate(tested,selected,signal);}catch(error){if(valid(current)&&client===tested){targetId=tested.targetId||'';proof=sameProof(previousProof,tested)?previousProof:null;renderState();}throw error;}if(!valid(current)||client!==tested)return;invalidateProof();targetId=tested.targetId||selected;await refresh(signal);setStatus(getState().ready?'inputTestOptional':legacyBinding?'legacyInputTest':'phoneSelect');});};
    node('[data-nonce]').addEventListener('keydown',event=>{
      if(!armed||document.activeElement!==event.currentTarget||nonce.length>=8)return;
      const digit=trustedNonceDigit(event);if(digit===null)return;event.preventDefault();nonce+=digit;event.currentTarget.value='●'.repeat(nonce.length);setStatus('receiving');
    });
    node('[data-nonce]').addEventListener('keyup',event=>{if(armed&&nonce.length===8&&document.activeElement===event.currentTarget&&trustedNonceDigit(event)===nonce.at(-1))testWait?.resolve(nonce);});
    node('[data-nonce]').addEventListener('paste',event=>event.preventDefault());
    node('[data-nonce]').addEventListener('blur',()=>{if(armed)resetChallenge();});
    function startTest(){
      if(working||isBusy()||!getState().connected||!targets.some(target=>target.targetId===targetId&&usableTarget(target)))return;resetChallenge();invalidateProof();armed=true;
      const field=node('[data-nonce]');field.focus({preventScroll:true});
      if(document.activeElement!==field){armed=false;setStatus('focusNonce');return;}
      const input=new Promise((resolve,reject)=>testWait={resolve,reject});input.catch(()=>{});
      setStatus('receiving');const selected=targetId;
      return action(async({signal,current})=>{try{
       await challengeCancellation;if(refreshTask)await refreshTask.promise.catch(()=>{});if(!valid(current)||!armed)return;if(!connectionActive)throw componentError('needsFreshChallenge');
       const tested=client;let result;
       for(let attempt=0;attempt<2;attempt++){
        challengeMayExist=true;
        try{result=await tested.startChallenge(selected);break;}
        catch(error){
         if(error.status===429&&error.serverCode==='challenge_busy_or_rate_limited'&&error.unknown!==true){
          challengeMayExist=false;
          if(attempt===0){
           const retry=new AbortController();challengeRetryController=retry;const cancel=()=>retry.abort();signal.addEventListener('abort',cancel,{once:true});
           try{for(let seconds=30;seconds>0;seconds--){if(!valid(current)||!armed||selected!==targetId||document.activeElement!==field)throw componentError('needsFreshChallenge');setStatus('challengeWaiting',{seconds});await new Promise((resolve,reject)=>{const aborted=()=>{clearTimeout(timer);reject(componentError('needsFreshChallenge'));},timer=setTimeout(()=>{retry.signal.removeEventListener('abort',aborted);resolve();},1000);retry.signal.addEventListener('abort',aborted,{once:true});if(retry.signal.aborted)aborted();});}}
           finally{signal.removeEventListener('abort',cancel);if(challengeRetryController===retry)challengeRetryController=null;}
           if(!valid(current)||!armed||selected!==targetId||document.activeElement!==field)throw componentError('needsFreshChallenge');continue;
          }
         }
         throw error;
        }
       }
       if(!valid(current)||selected!==targetId||!armed){await tested.cancelChallenge?.(selected).catch(()=>{});return;}challenge=result;setStatus('receiving');challengeTimer=setTimeout(()=>{resetChallenge();},30000);
       // HID may arrive before the start response. Await both, never expose the nonce.
       const observedNonce=await input;if(!valid(current)||selected!==targetId||!armed)return;
       armed=false;setStatus('confirming');const confirmed=await client.confirmChallenge(selected,{challengeId:challenge.challengeId,observedNonce},{signal});
       if(!valid(current)||selected!==targetId)return;if(confirmed.bindingVerified!==true||!client.bindingVerified)throw componentError('needsFreshChallenge');
       proof=Object.fromEntries(['boardId','bootId','clientId','targetId'].map(key=>[key,client[key]]));checkedAt=new Date();testWait=null;challenge=null;challengeMayExist=false;resetChallenge();publish();setStatus('bound');
      }catch(error){resetChallenge();if(valid(current)&&client?.paired&&transport&&!transport.closed){try{await refresh();}catch{}}throw error;}});
    }
    node('[data-start-challenge]').onclick=startTest;
    node('[data-start-sharing]').onclick=()=>{
      if(working||isBusy()||!getState().ready)return;
      // Invoke synchronously inside the user gesture, before any storage/network await.
      let started;try{started=capture.start();}catch(error){setStatus('operationFailed',error);return;}
      return action(async({current})=>{await started;if(valid(current))setStatus('sharingReady');});
    };
    node('[data-stop-sharing]').onclick=()=>{if(working||isBusy())return;capture.stop();setStatus('sharingOff');renderState();};
    node('[data-control-check]').onclick=()=>action(async({signal,current})=>{
      if(!getState().ready)throw componentError('settingsRequired');
      const tested=client,writerId='ui:'+crypto.randomUUID();let claimed=false;
      try{await tested.claimLease({writerId},{signal});claimed=true;await tested.endRun({writerId});claimed=false;if(valid(current)){checkedAt=new Date();setStatus('controlChecked');}}
      finally{if(claimed){try{await tested.endRun({writerId});}catch{invalidateProof();}}}
    });
    renderState();if(getState().connected)void checkConnection();return root;
  }
  function destroy(){disposed=true;clearReconnect();stopMonitor();connectionEpoch++;globalThis.document?.removeEventListener?.('visibilitychange',foreground);globalThis.removeEventListener?.('pagehide',suspend);close({abort:true});transport?.close();transport=null;connectionActive=false;targets=[];invalidateProof();}
  function suspend(){clearReconnect();stopMonitor();connectionEpoch++;close();const previous=transport;transport=null;previous?.close();connectionActive=false;targets=[];invalidateProof();}
  globalThis.addEventListener?.('pagehide',suspend);
  return {open,dispose:close,destroy,receiveSetupLink,hasPendingSetup:()=>Boolean(pendingSetup||importError),getDevice:()=>getState().ready?client:null,getState,ensureReady,refreshConnection,refreshUI};
}
