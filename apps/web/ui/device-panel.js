import {validateRTCConfiguration,DeviceRTCTransport} from '../core/device-rtc.js';
import {parseDeviceSetupLink,takeDeviceSetupLink,bridgeImportURL,rememberDeviceSetupReturn} from '../core/device-setup.js';
import {DeviceClient,DeviceError,safeDeviceServerCode} from '../core/device.js';
import {getLocale, subscribe, localizeError} from '../i18n.js';
import {DEVICE_MESSAGES} from '../locales/device.js';

const DEFAULT_BRIDGE_URL='http://igent.local';
export function defaultBridgeEndpoint(value){return !value||/^http:\/\/harness-[a-f0-9]{12}\.local$/.test(value)?DEFAULT_BRIDGE_URL:value;}
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const normalizedFingerprint=value=>String(value||'').replace(/[\s:]/g,'').toLowerCase();
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
  let challenge=null,nonce='',armed=false,challengeTimer=null,unsubscribe=null,settings={},statusKey='notPaired',statusDetail='',checkedAt=null;
  let connectionActive=false,pendingSetup=null,connectionEpoch=0,monitorTimer=null,refreshTask=null,disposed=false;
  let importError=null,progressTimer=null,progressStarted=0,informationEdit=0,informationSaving=null;
  try{pendingSetup=takeDeviceSetupLink();}catch(error){importError=error;}
  const componentError=key=>Object.assign(new Error('DEVICE_UI_'+key),{deviceMessageKey:key});
  const copy=(key,params={})=>Object.entries(params).reduce((text,[name,value])=>text.replaceAll('{'+name+'}',String(value)),(DEVICE_MESSAGES[getLocale()]||DEVICE_MESSAGES.en)[key]||key);
  const node=selector=>root?.querySelector(selector);
  const mounted=()=>Boolean(root?.isConnected&&getPanelRoot()?.contains(root));
  const getState=()=>{const connected=Boolean(connectionActive&&client?.paired&&client.identityVerified),bluetoothConnected=Boolean(connected&&targets.some(target=>target.targetId===(proof?.targetId||targetId)&&target.connected&&target.encrypted&&target.hidSubscribed)),inputVerified=connected&&bluetoothConnected&&sameProof(proof,client),ready=Boolean(inputVerified);return {informationReady:!!information(),connected,bluetoothConnected,inputVerified,ready,sharing:Boolean(capture.active),boardId:connected?client.boardId:null,targetId:inputVerified?client.targetId:null,status:working?'connecting':ready?(capture.active?'sharing':'ready'):connected?'needs-input-test':'disconnected'};};
  const publish=()=>onDeviceChange(getState().ready?client:null,getState());
  const setStatus=(key,detail='')=>{statusKey=key;statusDetail=detail;renderStatus();publish();};
  function invalidateProof(){proof=null;publish();}
  function resetChallenge(){clearTimeout(challengeTimer);challengeTimer=null;challenge=null;nonce='';armed=false;const input=node('[data-nonce]');if(input)input.value='';}
  function information(){
    if(importError)return null;
    try{const candidate=pendingSetup?pendingSetup:{baseUrl:defaultBridgeEndpoint(settings.deviceEndpoint),boardId:settings.deviceBoardId,rtc:settings.deviceRTC};
      if(!candidate.rtc)return null;const rtc=validateRTCConfiguration(candidate.rtc);if(!rtc.ip)return null;
      return {...candidate,rtc};
    }catch{return null;}
  }
  async function saveInformation(value,{current=()=>true}={}){
    if(!value?.rtc||!validateRTCConfiguration(value.rtc).ip)throw componentError('importInvalid');
    const previous=informationSaving;let finish;const completed=new Promise(resolve=>finish=resolve);informationSaving=completed;
    try{
      if(previous)await previous;if(!current())return false;
      await savePublicSettings({deviceEndpoint:value.baseUrl,deviceRTC:value.rtc,...(value.boardId?{deviceBoardId:value.boardId}:{})});
      if(!current())return false;pendingSetup=null;importError=null;return true;
    }finally{finish();if(informationSaving===completed)informationSaving=null;}
  }
  function stopProgress(){clearInterval(progressTimer);progressTimer=null;}
  function startProgress(){stopProgress();progressStarted=Date.now();progressTimer=setInterval(()=>renderStatus(),1000);progressTimer?.unref?.();}
  function renderStatus(){
    if(!mounted())return;
    const message=statusKey==='operationFailed'?copy('connectionFailed',{detail:statusDetail?.deviceMessageKey?copy(statusDetail.deviceMessageKey):localizeError(statusDetail)}):copy(statusKey,{count:nonce.length});
    const output=node('[data-device-status]');output.textContent=message;output.hidden=working||statusKey==='operationFailed'||statusKey==='infoRequired'||statusKey==='infoSaved';output.classList.toggle('error',statusKey==='operationFailed');
    const progress=node('[data-connection-progress]');if(progress){progress.hidden=!working&&statusKey!=='operationFailed';node('[data-progress-message]').textContent=message;node('[data-progress-elapsed]').textContent=working?copy('progressElapsed',{seconds:Math.floor((Date.now()-progressStarted)/1000)}):'';}
    const details=node('[data-connection-error-details]');if(details){const text=statusKey==='operationFailed'&&!working?deviceErrorDetails(statusDetail):'';details.hidden=!text;node('[data-connection-error-content]').textContent=text;if(!text)details.open=false;}
  }
  function renderState(){
    if(!mounted())return;
    const heading=root.closest('#panel-content')?.querySelector('.panel-header');if(heading){for(const [selector,key] of [['h2','title'],['p','subtitle']]){const element=heading.querySelector(selector);if(element){element.dataset.noI18n='';element.textContent=copy(key);}}}
    for(const element of root.querySelectorAll('[data-device-text]'))element.textContent=copy(element.dataset.deviceText);
    renderStatus();
    const state=getState(),connected=state.connected,verified=state.inputVerified,ready=verified;
    node('[data-bridge-state]').textContent=copy(connected?'bridgeConnected':'bridgeDisconnected');
    node('[data-bridge-address]').textContent=connected?client.baseUrl.origin:defaultBridgeEndpoint(settings.deviceEndpoint);
    node('[data-bridge-settings]').hidden=!connected;node('[data-bridge-settings]').href=connected?client.baseUrl.origin+'/settings?lang='+encodeURIComponent(getLocale()):'#';
    const saved=information();node('[data-info-step]').hidden=!!saved;
    node('[data-connect-help]').hidden=connected;
    let importOrigin=DEFAULT_BRIDGE_URL;try{const entered=node('[data-address]').value.trim(),origin=entered.includes('#device=')?parseDeviceSetupLink(entered).baseUrl:DeviceClient.createURL(entered);if(origin.startsWith('http:'))importOrigin=origin;}catch{}
    const url=bridgeImportURL(importOrigin,getLocale());node('[data-import-connection]').href=url;node('[data-reimport-connection]').href=url;
    node('[data-information-state]').textContent=copy(saved?'infoSaved':'infoRequired');node('[data-connect-step]').dataset.unavailable=String(!saved);
    node('[data-test-controls]').hidden=!connected;
    const entered=node('[data-address]').value.trim();node('[data-legacy-pin]').hidden=!entered.startsWith('https:')||entered.includes('#device=');
    node('[data-target]').replaceChildren(...targets.map(target=>{const option=document.createElement('option');option.value=target.targetId;option.textContent=copy('targetLabel',{id:target.targetId})+' · '+copy(target.connected&&target.encrypted&&target.hidSubscribed?'targetReady':'targetUnavailable');option.disabled=!(target.connected&&target.encrypted&&target.hidSubscribed);return option;}));
    if(!targets.length){const option=document.createElement('option');option.value='';option.textContent=copy(connected?'noTargets':'bridgeRequired');node('[data-target]').append(option);}
    node('[data-target]').value=targetId;
    node('[data-target]').disabled=working||isBusy()||!connected||!targets.some(usableTarget);
    const selected=targets.find(target=>target.targetId===targetId),available=selected?.connected&&selected.encrypted&&selected.hidSubscribed;
    node('[data-disconnect]').disabled=working||isBusy()||!connected;
    node('[data-address]').disabled=working||isBusy();
    node('[data-pair]').textContent=copy(connected?'reconnect':'pair');node('[data-pair]').disabled=working||isBusy()||!information();node('[data-refresh]').disabled=working||isBusy()||!connected;
    node('[data-start-challenge]').disabled=working||isBusy()||!connected||!available;
    node('[data-confirm-challenge]').disabled=working||isBusy()||!challenge||nonce.length!==8;
    node('[data-start-sharing]').disabled=working||isBusy()||!ready||capture.active;
    node('[data-stop-sharing]').disabled=working||isBusy()||!capture.active;
    node('[data-control-check]').disabled=working||isBusy()||!ready;
    node('[data-sharing-state]').textContent=copy(capture.active?'sharingReady':'sharingOff');
    node('[data-binding-state]').textContent=copy(verified?'bound':!connected?'bridgeRequired':state.bluetoothConnected?'phoneConnectedNeedsTest':'noTargets');
    const snapshot=client?.status();node('[data-device-metadata]').textContent=snapshot?[copy('boardLabel')+': '+(snapshot.boardId||'—'),copy('targetLabelShort')+': '+(snapshot.targetId||'—'),checkedAt?copy('lastChecked')+': '+new Intl.DateTimeFormat(getLocale(),{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(checkedAt):''].filter(Boolean).join('\n'):'';
  }
  async function savePublicSettings(patch){settings=await store.saveSettings(patch);onSettingsChange(settings);}
  function values(){
    const entered=node('[data-address]').value.trim();
    if(entered.includes('#device=')){try{return {...parseDeviceSetupLink(entered),expectedFingerprint:''};}catch{throw componentError('invalidAddress');}}
    let baseUrl;try{baseUrl=DeviceClient.createURL(entered);}catch{throw componentError('invalidAddress');}
    if(baseUrl.startsWith('http:')){const saved=information(),imported=saved?.baseUrl===baseUrl?saved:null;return {baseUrl,...(imported?{boardId:imported.boardId}:{}),...(imported?.rtc?{rtc:imported.rtc}:defaultBridgeEndpoint(settings.deviceEndpoint)===baseUrl&&settings.deviceRTC?{rtc:settings.deviceRTC}:{}),expectedFingerprint:node('[data-pin-confirmed]').checked?normalizedFingerprint(node('[data-fingerprint]').value):''};}
    const expectedFingerprint=normalizedFingerprint(node('[data-fingerprint]').value);
    if(!/^[a-f0-9]{64}$/.test(expectedFingerprint))throw componentError('invalidFingerprint');
    if(!node('[data-pin-confirmed]').checked)throw componentError('verificationRequired');
    return {baseUrl,expectedFingerprint};
  }
  function begin(){if(working||isBusy())throw componentError('busy');working=true;startProgress();publish();controller?.abort();controller=new AbortController();const current=++operation;renderState();return {signal:controller.signal,current};}
  function valid(current){return mounted()&&current===operation&&!controller?.signal.aborted;}
  async function action(work){let current;try{const started=begin();current=started.current;await work(started);if(valid(current))renderState();}catch(error){if(mounted()&&(current===undefined||current===operation)&&error.name!=='AbortError')setStatus('operationFailed',error);}finally{if(current===operation){working=false;stopProgress();publish();if(mounted())renderState();}}}
  function close(){stopProgress();operation++;controller?.abort();controller=null;working=false;resetChallenge();unsubscribe?.();unsubscribe=null;dialog?.removeEventListener('close',close);root=null;dialog=null;publish();}
  const usableTarget=target=>target.connected&&target.encrypted&&target.hidSubscribed;
  function stopMonitor(){clearTimeout(monitorTimer);monitorTimer=null;}
  function startMonitor(){
    stopMonitor();if(disposed||!client?.paired||transport?.closed)return;
    monitorTimer=setTimeout(async()=>{monitorTimer=null;await checkConnection();startMonitor();},5000);
    monitorTimer?.unref?.();
  }
  async function checkConnection(){
    // A connection test owns the focused input and its countdown until confirmed.
    // Reading status must not rebuild that UI or disturb its in-flight challenge.
    if(disposed||working||armed||!client?.paired||transport?.closed)return false;
    try{await refresh();return getState().ready;}catch{return false;}
  }
  function foreground(){if(globalThis.document?.visibilityState==='visible')void checkConnection();}
  globalThis.document?.addEventListener?.('visibilitychange',foreground);
  async function refresh(signal,recoverExpiredCredential=null){
    const tested=client,epoch=connectionEpoch;
    if(!tested?.paired)return false;
    if(refreshTask?.client===tested&&refreshTask.epoch===epoch)return refreshTask.promise;
    let deadlineExpired=false;
    const abort=new AbortController(),cancel=()=>abort.abort(signal?.reason),timer=setTimeout(()=>{deadlineExpired=true;abort.abort();},8000);
    signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
    const current=()=>tested===client&&epoch===connectionEpoch&&!disposed;
    const task={client:tested,epoch};refreshTask=task;
    task.promise=(async()=>{
      try{
        await tested.identity({signal:abort.signal});
        let binding;
        try{binding=await tested.getBinding({signal:abort.signal});}
        catch(error){
          // Only an explicit reconnect may renew an expired saved credential.
          // Limit recovery to this read; never replay input, timeouts or denials.
          if(error.code!=='DEVICE_AUTH_EXPIRED'||error.status!==401||!recoverExpiredCredential||!current()||abort.signal.aborted)throw error;
          await recoverExpiredCredential(abort.signal);
          if(!current()||abort.signal.aborted)return false;
          binding=await tested.getBinding({signal:abort.signal});
        }
        if(!current()||abort.signal.aborted||armed)return false;
        targets=binding.targets;checkedAt=new Date();connectionActive=true;
        // A lost Bluetooth link invalidates this page's proof permanently. A later
        // reconnect must pass a new input test, even if the board retains a binding.
        if(!sameProof(proof,tested)||!targets.some(target=>target.targetId===proof?.targetId&&usableTarget(target)))proof=null;
        if(!targets.some(target=>target.targetId===targetId&&usableTarget(target)))targetId=targets.find(usableTarget)?.targetId||'';
        if(!armed&&!working)statusKey=getState().ready?'bound':'needsFreshChallenge';
        publish();if(!armed)renderState();return getState().ready;
      }catch(error){
        if(deadlineExpired&&!signal?.aborted)error=new DeviceError('DEVICE_TIMEOUT');
        if(current()){connectionActive=false;targets=[];proof=null;checkedAt=null;setStatus('operationFailed',error);if(!armed)renderState();}
        throw error;
      }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(refreshTask===task)refreshTask=null;}
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
    close();const opening=operation;settings=await store.getSettings();if(opening!==operation||!isCurrent())return null;
    legacyEndpoint=settings.deviceEndpoint&&defaultBridgeEndpoint(settings.deviceEndpoint)!==settings.deviceEndpoint?settings.deviceEndpoint:'';
    if(pendingSetup){try{await saveInformation(pendingSetup);}catch(error){importError=error;}}
    if(opening!==operation||!isCurrent())return null;
    statusKey=importError?'importInvalid':getState().ready?'bound':getState().connected?'needsFreshChallenge':information()?'infoSaved':'infoRequired';
    if(!document.querySelector('link[data-device-panel-style]')){const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('./device-panel.css',import.meta.url).href;style.dataset.devicePanelStyle='';document.head.append(style);}
    openPanel(copy('title'),copy('subtitle'),`<div class="device-onboarding" data-no-i18n>
      <section class="device-step device-info-step" data-info-step><h3 data-device-text="infoTitle"></h3><p class="quiet-note" data-device-text="infoHelp"></p><a class="primary device-settings-link" data-import-connection data-device-text="importConnection"></a><p class="quiet-note" data-import-help data-device-text="importConnectionHelp"></p></section>
      <section class="device-step device-bridge-card" data-connect-step><h3 data-device-text="pairTitle"></h3><p class="quiet-note" data-information-state></p><p class="device-bridge-state" data-bridge-state></p><p class="device-bridge-address" data-bridge-address></p><p class="quiet-note" data-connect-help data-device-text="connectHelp"></p>
      <details class="device-configuration" data-configuration><summary data-device-text="configureBridge"></summary><label class="field"><span data-device-text="address"></span><input data-address type="url" inputmode="url" autocapitalize="none" autocomplete="off" spellcheck="false" placeholder="http://igent.local" value="${escapeHTML(pendingSetup?.baseUrl||defaultBridgeEndpoint(settings.deviceEndpoint))}"></label><a class="device-settings-link" data-reimport-connection data-device-text="infoReload"></a><details data-legacy-pin><summary data-device-text="advanced"></summary><label class="field"><span data-device-text="fingerprint"></span><textarea data-fingerprint rows="2" autocapitalize="none" autocomplete="off" spellcheck="false">${escapeHTML(settings.deviceFingerprint||'')}</textarea></label><label class="device-check"><input data-pin-confirmed type="checkbox"><span data-device-text="fingerprintConfirmed"></span></label></details></details><div class="panel-actions"><button type="button" class="primary" data-pair data-device-text="pair"></button><button type="button" class="secondary-button" data-disconnect data-device-text="disconnect"></button></div><div class="device-progress" data-connection-progress role="status" aria-live="polite" hidden><span data-progress-message></span><span data-progress-elapsed aria-hidden="true"></span></div><details class="device-error-details" data-connection-error-details hidden><summary data-device-text="errorDetails"></summary><pre data-connection-error-content></pre></details><a class="device-settings-link" data-bridge-settings data-device-text="manageBridge"></a></section>
      <section class="device-step"><h3 data-device-text="bindTitle"></h3><p class="quiet-note" data-binding-state></p><div data-test-controls><label class="field"><span data-device-text="target"></span><select data-target></select></label><button type="button" class="secondary-button" data-refresh data-device-text="refresh"></button><label class="field device-nonce-field"><span data-device-text="nonceLabel"></span><input data-nonce type="text" readonly inputmode="none" autocomplete="off" autocapitalize="none" spellcheck="false" aria-describedby="device-nonce-help"><small id="device-nonce-help" data-device-text="nonceHelp"></small></label><div class="panel-actions"><button type="button" class="secondary-button" data-start-challenge data-device-text="startChallenge"></button><button type="button" class="primary" data-confirm-challenge data-device-text="confirmChallenge"></button></div></div></section>
      <section class="device-step"><h3 data-device-text="settingsTitle"></h3><p class="quiet-note" data-device-text="settingsHelp"></p><div class="panel-actions"><button type="button" class="primary" data-start-sharing data-device-text="startSharing"></button><button type="button" class="secondary-button" data-stop-sharing data-device-text="stopSharing"></button></div><p class="quiet-note" data-sharing-state></p></section>
      <details class="device-step"><summary data-device-text="prepareTitle"></summary><p class="quiet-note" data-device-text="wifiOptional"></p><ol><li data-device-text="prepareUsb"></li><li data-device-text="prepareWifi"></li><li data-device-text="prepareCa"></li></ol></details>
      <details class="device-step"><summary data-device-text="phoneGuide"></summary><ol><li data-device-text="prepareBluetooth"></li><li data-device-text="settingsHelp"></li></ol></details>
      <details class="device-step"><summary data-device-text="advanced"></summary><p class="quiet-note" data-device-text="connectionSaved"></p><pre data-device-metadata></pre><button type="button" class="secondary-button" data-control-check data-device-text="checkControl"></button></details><div class="status-box device-status" data-device-status role="status" aria-live="polite"></div></div>`);
    root=getPanelRoot().querySelector('.device-onboarding');node('[data-address]').addEventListener('input',async()=>{
      const edit=++informationEdit,value=node('[data-address]').value.trim();node('[data-fingerprint]').value='';node('[data-pin-confirmed]').checked=false;importError=null;
      if(value.includes('#device=')){
        pendingSetup={baseUrl:value};renderState();
        try{const imported=parseDeviceSetupLink(value);await saveInformation(imported,{current:()=>edit===informationEdit});}catch(error){if(edit===informationEdit)importError=error;}
      }else{try{pendingSetup=defaultBridgeEndpoint(settings.deviceEndpoint)===DeviceClient.createURL(value)?null:{baseUrl:value};}catch{pendingSetup={baseUrl:value};}}
      if(edit===informationEdit)renderState();
    });
    for(const key of ['[data-import-connection]','[data-reimport-connection]','[data-bridge-settings]'])node(key).onclick=()=>rememberDeviceSetupReturn();dialog=root.closest('dialog');dialog?.addEventListener('close',close);unsubscribe=subscribe(renderState);
    function connection(configuration,signal){
      resetChallenge();stopMonitor();connectionEpoch++;connectionActive=false;invalidateProof();
      const previous=transport;transport=null;previous?.close();
      setStatus('rtcOpening');
      const bridge=bridgeFactory({baseUrl:configuration.baseUrl,rtc:configuration.rtc,onProgress:value=>{if(working){const stages={configuration:'rtcOpening',network:'rtcNetwork',handshake:'rtcHandshake',channel:'rtcChannel',ready:'rtcReading'};setStatus(stages[value.phase]||'rtcOpening');}},onDisconnect:error=>{if(transport!==bridge)return;stopMonitor();connectionEpoch++;connectionActive=false;targets=[];invalidateProof();resetChallenge();setStatus('operationFailed',error||componentError('rtcDisconnected'));renderState();}});
      const ready=bridge.open({signal});ready.catch(()=>{});return {bridge,ready};
    }
    node('[data-disconnect]').onclick=()=>{if(working||isBusy())return;stopMonitor();connectionEpoch++;const previous=transport;transport=null;previous?.close();connectionActive=false;client?.clearCredentials();client=null;targets=[];targetId='';resetChallenge();invalidateProof();setStatus('notPaired');renderState();};
    const connect=()=>{if(working||isBusy())return;if(!node('[data-address]').value.trim()){node('[data-configuration]').open=true;node('[data-address]').focus();return;}return action(async({signal,current})=>{
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
       if(saved){candidate.restoreCredentials(saved);await candidate.pinIdentity(saved.expectedFingerprint,{signal});}
       else await enroll(clientId);
       if(configuration.boardId&&candidate.boardId!==configuration.boardId){candidate.clearCredentials();throw Object.assign(new Error('DEVICE_IDENTITY_MISMATCH'),{code:'DEVICE_IDENTITY_MISMATCH'});}
       if(!valid(current)){candidate.clearCredentials();return;}client=candidate;transport=bridge;connectionActive=true;
       setStatus('rtcChecking');await refresh(signal,saved?async recoverySignal=>{
        await store.deleteLocalCredential('device:'+configuration.baseUrl);
        if(!valid(current)||recoverySignal.aborted)return;
        await enroll(saved.clientId,recoverySignal,saved.expectedFingerprint||saved.publicKeyFingerprint);
       }:null);if(!valid(current))return;
       setStatus('rtcSaving');await store.saveLocalCredential('device:'+configuration.baseUrl,client.exportCredentials());
       const deviceRTC=bridge?.exportConfiguration?.();await savePublicSettings({deviceEndpoint:configuration.baseUrl,deviceFingerprint:client.status().publicKeyFingerprint,...(deviceRTC?{deviceRTC}:{})});retained=true;pendingSetup=null;node('[data-configuration]').open=false;setStatus(getState().bluetoothConnected?'phoneConnectedNeedsTest':'paired');startMonitor();
      }finally{if(!retained){bridge?.close();if(transport===bridge)transport=null;connectionActive=false;invalidateProof();}}
    });
    };
    node('[data-pair]').onclick=connect;
    node('[data-refresh]').onclick=()=>action(async({signal,current})=>{await refresh(signal);if(valid(current))setStatus(sameProof(proof,client)?'bound':'needsFreshChallenge');});
    node('[data-target]').onchange=()=>{if(working||isBusy()||!getState().connected){renderState();return;}resetChallenge();invalidateProof();targetId=node('[data-target]').value;setStatus('needsFreshChallenge');renderState();};
    node('[data-nonce]').addEventListener('keydown',event=>{
      if(!armed||document.activeElement!==event.currentTarget||nonce.length>=8)return;
      const digit=trustedNonceDigit(event);if(digit===null)return;event.preventDefault();nonce+=digit;event.currentTarget.value='●'.repeat(nonce.length);setStatus(nonce.length===8?'nonceReady':'receiving');renderState();
    });
    node('[data-nonce]').addEventListener('paste',event=>event.preventDefault());
    node('[data-start-challenge]').onclick=()=>{
      if(working||isBusy()||!getState().connected||!targets.some(target=>target.targetId===targetId&&usableTarget(target)))return;resetChallenge();invalidateProof();armed=true;
      const field=node('[data-nonce]');field.focus({preventScroll:true});
      if(document.activeElement!==field){armed=false;setStatus('focusNonce');return;}
      setStatus('receiving');const selected=targetId;
      challengeTimer=setTimeout(()=>{resetChallenge();if(mounted()){setStatus('needsFreshChallenge');renderState();}},30000);
      return action(async({signal,current})=>{try{if(refreshTask)await refreshTask.promise.catch(()=>{});if(!valid(current))return;if(!connectionActive)throw componentError('needsFreshChallenge');const result=await client.startChallenge(selected,{signal});if(!valid(current)||selected!==targetId)return;challenge=result;setStatus(nonce.length===8?'nonceReady':'receiving');}catch(error){resetChallenge();throw error;}});
    };
    node('[data-confirm-challenge]').onclick=()=>action(async({signal,current})=>{
      if(!challenge||nonce.length!==8)throw componentError('nonceIncomplete');
      const selected=targetId,observedNonce=nonce,challengeId=challenge.challengeId;armed=false;setStatus('confirming');
      const result=await client.confirmChallenge(selected,{challengeId,observedNonce},{signal});
      if(!valid(current)||selected!==targetId)return;if(result.bindingVerified!==true||!client.bindingVerified)throw componentError('needsFreshChallenge');
      proof=Object.fromEntries(['boardId','bootId','clientId','targetId'].map(key=>[key,client[key]]));checkedAt=new Date();resetChallenge();publish();setStatus('bound');
    });
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
  function destroy(){disposed=true;stopMonitor();connectionEpoch++;globalThis.document?.removeEventListener?.('visibilitychange',foreground);globalThis.removeEventListener?.('pagehide',suspend);close();transport?.close();transport=null;connectionActive=false;targets=[];invalidateProof();}
  function suspend(){stopMonitor();connectionEpoch++;close();const previous=transport;transport=null;previous?.close();connectionActive=false;targets=[];invalidateProof();}
  globalThis.addEventListener?.('pagehide',suspend);
  return {open,dispose:close,destroy,getDevice:()=>getState().ready?client:null,getState,ensureReady};
}
