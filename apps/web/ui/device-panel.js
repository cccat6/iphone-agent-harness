import {DeviceWindowTransport} from '../core/device-window.js';
import {parseDeviceSetupLink,takeDeviceSetupLink} from '../core/device-setup.js';
import {DeviceClient} from '../core/device.js';
import {sealCredentials, unsealCredentials} from '../core/auth.js';
import {getLocale, subscribe, localizeError} from '../i18n.js';
import {DEVICE_MESSAGES} from '../locales/device.js';

const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const normalizedFingerprint=value=>String(value||'').replace(/[\s:]/g,'').toLowerCase();
const sameProof=(proof,client)=>Boolean(proof&&client?.identityVerified&&client.bindingVerified&&['boardId','bootId','clientId','targetId'].every(key=>proof[key]===client[key]));
/** Only native, focused key events can contribute to this page's input proof. */
export function trustedNonceDigit(event){
  if(event?.isTrusted!==true||event.repeat||event.ctrlKey||event.metaKey||event.altKey)return null;
  const code=/^(?:Digit|Numpad)([0-9])$/.exec(event.code||'');
  return code?code[1]:/^[0-9]$/.test(event.key||'')?event.key:null;
}

/** Fixed device onboarding UI. No network request or input is sent before a user action. */
export function createDevicePanel({store,capture,openPanel,getPanelRoot,onDeviceChange=()=>{},onSettingsChange=()=>{},isBusy=()=>false,onToast=()=>{},clientFactory=options=>new DeviceClient(options),bridgeFactory=options=>new DeviceWindowTransport(options)}={}){
  let transport=null;
  let client=null,proof=null,targets=[],targetId='',root=null,dialog=null,controller=null,operation=0,working=false;
  let challenge=null,nonce='',armed=false,challengeTimer=null,unsubscribe=null,settings={},statusKey='notPaired',statusDetail='',checkedAt=null;
  let assistive=false,keyboard=false,pendingSetup=null;
  try{pendingSetup=takeDeviceSetupLink();}catch{}
  const componentError=key=>Object.assign(new Error('DEVICE_UI_'+key),{deviceMessageKey:key});
  const copy=(key,params={})=>Object.entries(params).reduce((text,[name,value])=>text.replaceAll('{'+name+'}',String(value)),(DEVICE_MESSAGES[getLocale()]||DEVICE_MESSAGES.en)[key]||key);
  const node=selector=>root?.querySelector(selector);
  const mounted=()=>Boolean(root?.isConnected&&getPanelRoot()?.contains(root));
  const setStatus=(key,detail='')=>{statusKey=key;statusDetail=detail;renderStatus();};
  const publish=()=>onDeviceChange(sameProof(proof,client)&&assistive&&keyboard?client:null);
  function invalidateProof(){proof=null;publish();}
  function resetChallenge(){clearTimeout(challengeTimer);challengeTimer=null;challenge=null;nonce='';armed=false;const input=node('[data-nonce]');if(input)input.value='';}
  function renderStatus(){if(!mounted())return;const output=node('[data-device-status]');output.textContent=copy(statusKey,statusKey==='operationFailed'?{detail:statusDetail?.deviceMessageKey?copy(statusDetail.deviceMessageKey):localizeError(statusDetail)}:{count:nonce.length});output.classList.toggle('error',statusKey==='operationFailed');}
  function renderState(){
    if(!mounted())return;
    const heading=root.closest('#panel-content')?.querySelector('.panel-header');if(heading){for(const [selector,key] of [['h2','title'],['p','subtitle']]){const element=heading.querySelector(selector);if(element){element.dataset.noI18n='';element.textContent=copy(key);}}}
    for(const element of root.querySelectorAll('[data-device-text]'))element.textContent=copy(element.dataset.deviceText);
    renderStatus();
    const verified=sameProof(proof,client),ready=verified&&assistive&&keyboard;
    const entered=node('[data-address]').value.trim();node('[data-legacy-pin]').hidden=!entered.startsWith('https:')||entered.includes('#device=');
    node('[data-target]').replaceChildren(...targets.map(target=>{const option=document.createElement('option');option.value=target.targetId;option.textContent=copy('targetLabel',{id:target.targetId})+' · '+copy(target.connected&&target.encrypted&&target.hidSubscribed?'targetReady':'targetUnavailable');option.disabled=!(target.connected&&target.encrypted&&target.hidSubscribed);return option;}));
    if(!targets.length){const option=document.createElement('option');option.value='';option.textContent=copy('noTargets');node('[data-target]').append(option);}
    node('[data-target]').value=targetId;
    node('[data-target]').disabled=working||isBusy()||!client?.paired;
    node('[data-assistive]').disabled=working||isBusy();node('[data-keyboard]').disabled=working||isBusy();
    const selected=targets.find(target=>target.targetId===targetId),available=selected?.connected&&selected.encrypted&&selected.hidSubscribed;
    node('[data-direct]').disabled=working||isBusy();node('[data-disconnect]').disabled=working||isBusy()||!client?.paired;
    node('[data-pair]').disabled=working||isBusy();node('[data-refresh]').disabled=working||isBusy()||!client?.paired;
    node('[data-start-challenge]').disabled=working||isBusy()||!available;
    node('[data-confirm-challenge]').disabled=working||isBusy()||!challenge||nonce.length!==8;
    node('[data-start-sharing]').disabled=working||isBusy()||!ready||capture.active;
    node('[data-stop-sharing]').disabled=working||isBusy()||!capture.active;
    node('[data-save-vault]').disabled=working||isBusy()||!client?.paired;
    node('[data-restore-vault]').disabled=working||isBusy();
    node('[data-control-check]').disabled=working||isBusy()||!ready;
    node('[data-sharing-state]').textContent=copy(capture.active?'sharingReady':'sharingOff');
    node('[data-binding-state]').textContent=copy(verified?'bound':client?.paired?'needsFreshChallenge':'notPaired');
    const snapshot=client?.status();node('[data-device-metadata]').textContent=snapshot?[copy('boardLabel')+': '+(snapshot.boardId||'—'),copy('targetLabelShort')+': '+(snapshot.targetId||'—'),checkedAt?copy('lastChecked')+': '+new Intl.DateTimeFormat(getLocale(),{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(checkedAt):''].filter(Boolean).join('\n'):'';
  }
  async function savePublicSettings(patch){settings=await store.saveSettings(patch);onSettingsChange(settings);}
  function values(){
    const entered=node('[data-address]').value.trim();
    if(entered.includes('#device=')){try{return {...parseDeviceSetupLink(entered),expectedFingerprint:''};}catch{throw componentError('invalidAddress');}}
    let baseUrl;try{baseUrl=DeviceClient.createURL(entered);}catch{throw componentError('invalidAddress');}
    if(baseUrl.startsWith('http:'))return {baseUrl,expectedFingerprint:node('[data-pin-confirmed]').checked?normalizedFingerprint(node('[data-fingerprint]').value):''};
    const expectedFingerprint=normalizedFingerprint(node('[data-fingerprint]').value);
    if(!/^[a-f0-9]{64}$/.test(expectedFingerprint))throw componentError('invalidFingerprint');
    if(!node('[data-pin-confirmed]').checked)throw componentError('verificationRequired');
    return {baseUrl,expectedFingerprint};
  }
  function begin(){if(working||isBusy())throw componentError('busy');working=true;controller?.abort();controller=new AbortController();const current=++operation;renderState();return {signal:controller.signal,current};}
  function valid(current){return mounted()&&current===operation&&!controller?.signal.aborted;}
  async function action(work){let current;try{const started=begin();current=started.current;await work(started);if(valid(current))renderState();}catch(error){if(mounted()&&(current===undefined||current===operation)&&error.name!=='AbortError')setStatus('operationFailed',error);}finally{if(current===operation){working=false;if(mounted())renderState();}}}
  function close(){operation++;controller?.abort();controller=null;working=false;resetChallenge();unsubscribe?.();unsubscribe=null;dialog?.removeEventListener('close',close);root=null;dialog=null;}
  async function refresh(signal){
    await client.identity({signal});const binding=await client.getBinding({signal});targets=binding.targets;checkedAt=new Date();
    if(!sameProof(proof,client))invalidateProof();
    if(!targets.some(target=>target.targetId===targetId&&target.connected&&target.encrypted&&target.hidSubscribed))targetId=targets.find(target=>target.connected&&target.encrypted&&target.hidSubscribed)?.targetId||'';
  }
  async function open(){
    close();const opening=operation;settings=await store.getSettings();if(opening!==operation)return;
    statusKey=sameProof(proof,client)?'bound':client?.paired?'needsFreshChallenge':'notPaired';
    if(!document.querySelector('link[data-device-panel-style]')){const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('./device-panel.css',import.meta.url).href;style.dataset.devicePanelStyle='';document.head.append(style);}
    openPanel(copy('title'),copy('subtitle'),`<div class="device-onboarding" data-no-i18n>
      <details class="device-step"><summary data-device-text="prepareTitle"></summary><ol><li data-device-text="prepareUsb"></li><li data-device-text="prepareWifi"></li><li data-device-text="prepareCa"></li></ol></details>
      <section class="device-step"><h3 data-device-text="pairTitle"></h3><label class="field"><span data-device-text="address"></span><input data-address type="url" inputmode="url" autocapitalize="none" autocomplete="off" spellcheck="false" placeholder="http://harness-abcdef.local" value="${escapeHTML(pendingSetup?.baseUrl||settings.deviceEndpoint||'')}"></label><label class="field"><span data-device-text="ownerPassword"></span><input data-owner-password type="password" autocomplete="off" autocapitalize="none" spellcheck="false" value="${escapeHTML(pendingSetup?.setupPassword||'')}"></label><details data-legacy-pin><summary data-device-text="advanced"></summary><label class="field"><span data-device-text="fingerprint"></span><textarea data-fingerprint rows="2" autocapitalize="none" autocomplete="off" spellcheck="false">${escapeHTML(settings.deviceFingerprint||'')}</textarea></label><label class="device-check"><input data-pin-confirmed type="checkbox"><span data-device-text="fingerprintConfirmed"></span></label></details><div class="panel-actions"><button type="button" class="primary" data-pair data-device-text="pair"></button><button type="button" class="secondary-button" data-disconnect data-device-text="disconnect"></button></div></section>
      <section class="device-step"><h3 data-device-text="bindTitle"></h3><p class="quiet-note" data-binding-state></p><label class="field"><span data-device-text="target"></span><select data-target></select></label><button type="button" class="secondary-button" data-refresh data-device-text="refresh"></button><label class="field device-nonce-field"><span data-device-text="nonceLabel"></span><input data-nonce type="text" readonly inputmode="none" autocomplete="off" autocapitalize="none" spellcheck="false" aria-describedby="device-nonce-help"><small id="device-nonce-help" data-device-text="nonceHelp"></small></label><div class="panel-actions"><button type="button" class="secondary-button" data-start-challenge data-device-text="startChallenge"></button><button type="button" class="primary" data-confirm-challenge data-device-text="confirmChallenge"></button></div></section>
      <section class="device-step"><h3 data-device-text="settingsTitle"></h3><label class="device-check"><input data-assistive type="checkbox" ${assistive?'checked':''}><span data-device-text="assistive"></span></label><label class="device-check"><input data-keyboard type="checkbox" ${keyboard?'checked':''}><span data-device-text="keyboard"></span></label><p class="quiet-note" data-device-text="settingsHelp"></p><div class="panel-actions"><button type="button" class="primary" data-start-sharing data-device-text="startSharing"></button><button type="button" class="secondary-button" data-stop-sharing data-device-text="stopSharing"></button></div><p class="quiet-note" data-sharing-state></p></section>
      <details class="device-step"><summary data-device-text="vaultTitle"></summary><label class="field"><span data-device-text="passphrase"></span><input data-vault-password type="password" autocomplete="off"></label><p class="quiet-note" data-device-text="vaultHelp"></p><div class="panel-actions"><button type="button" class="secondary-button" data-save-vault data-device-text="saveVault"></button><button type="button" class="secondary-button" data-restore-vault data-device-text="restoreVault"></button></div></details>
      <details class="device-step"><summary data-device-text="advanced"></summary><label class="device-check"><input data-direct type="checkbox"><span data-device-text="directConnection"></span></label><pre data-device-metadata></pre><button type="button" class="secondary-button" data-control-check data-device-text="checkControl"></button></details><div class="status-box device-status" data-device-status role="status" aria-live="polite"></div></div>`);
    root=getPanelRoot().querySelector('.device-onboarding');node('[data-address]').addEventListener('input',()=>{node('[data-fingerprint]').value='';node('[data-pin-confirmed]').checked=false;renderState();});dialog=root.closest('dialog');dialog?.addEventListener('close',close);unsubscribe=subscribe(renderState);
    function connection(configuration,signal){
      resetChallenge();invalidateProof();
      transport?.close();transport=null;
      if(!configuration.baseUrl.startsWith('http:')||node('[data-direct]').checked)return {bridge:null,ready:Promise.resolve()};
      setStatus('windowOpening');
      const bridge=bridgeFactory({baseUrl:configuration.baseUrl,locale:getLocale(),onDisconnect:()=>{invalidateProof();resetChallenge();setStatus('windowDisconnected');renderState();}});
      const ready=bridge.open({signal});ready.catch(()=>{});return {bridge,ready};
    }
    node('[data-disconnect]').onclick=()=>{if(working||isBusy())return;transport?.close();transport=null;client?.clearCredentials();client=null;targets=[];targetId='';resetChallenge();invalidateProof();setStatus('notPaired');renderState();};
    node('[data-pair]').onclick=()=>action(async({signal,current})=>{
      const configuration=values(),passwordInput=node('[data-owner-password]'),setupPassword=configuration.setupPassword||passwordInput.value;passwordInput.value='';pendingSetup=null;
      const preferredId=client?.paired&&client.baseUrl?.origin===configuration.baseUrl?client.clientId:undefined;
      // Open before the first await so Safari can associate this window with the Connect click.
      const {bridge,ready}=connection(configuration,signal);let retained=false;
      try{
       const clientId=await store.ensureDeviceClientId(configuration.baseUrl,{preferredId});await ready;if(!valid(current))return;
       resetChallenge();invalidateProof();client=null;targets=[];targetId='';setStatus('pairing');
       const candidate=clientFactory({...configuration,...(bridge?{fetchImpl:bridge.fetch}:{})});await candidate.pair({...configuration,clientId,setupPassword},{signal});if(configuration.boardId&&candidate.boardId!==configuration.boardId){candidate.clearCredentials();throw componentError('invalidAddress');}
       if(!valid(current)){candidate.clearCredentials();return;}client=candidate;transport=bridge;await refresh(signal);if(!valid(current))return;
       await savePublicSettings({deviceEndpoint:configuration.baseUrl,deviceFingerprint:client.status().publicKeyFingerprint});retained=true;setStatus('paired');
      }finally{if(!retained){bridge?.close();if(transport===bridge)transport=null;}}
    });
    node('[data-refresh]').onclick=()=>action(async({signal,current})=>{await refresh(signal);if(valid(current))setStatus(sameProof(proof,client)?'bound':'needsFreshChallenge');});
    node('[data-target]').onchange=()=>{if(working||isBusy()){renderState();return;}resetChallenge();invalidateProof();targetId=node('[data-target]').value;setStatus('needsFreshChallenge');renderState();};
    node('[data-nonce]').addEventListener('keydown',event=>{
      if(!armed||document.activeElement!==event.currentTarget||nonce.length>=8)return;
      const digit=trustedNonceDigit(event);if(digit===null)return;event.preventDefault();nonce+=digit;event.currentTarget.value='●'.repeat(nonce.length);setStatus(nonce.length===8?'nonceReady':'receiving');renderState();
    });
    node('[data-nonce]').addEventListener('paste',event=>event.preventDefault());
    node('[data-start-challenge]').onclick=()=>{
      if(working||isBusy())return;resetChallenge();invalidateProof();armed=true;
      const field=node('[data-nonce]');field.focus({preventScroll:true});
      if(document.activeElement!==field){armed=false;setStatus('focusNonce');return;}
      setStatus('receiving');const selected=targetId;
      challengeTimer=setTimeout(()=>{resetChallenge();if(mounted()){setStatus('needsFreshChallenge');renderState();}},30000);
      return action(async({signal,current})=>{try{const result=await client.startChallenge(selected,{signal});if(!valid(current)||selected!==targetId)return;challenge=result;setStatus(nonce.length===8?'nonceReady':'receiving');}catch(error){resetChallenge();throw error;}});
    };
    node('[data-confirm-challenge]').onclick=()=>action(async({signal,current})=>{
      if(!challenge||nonce.length!==8)throw componentError('nonceIncomplete');
      const selected=targetId,observedNonce=nonce,challengeId=challenge.challengeId;armed=false;setStatus('confirming');
      const result=await client.confirmChallenge(selected,{challengeId,observedNonce},{signal});
      if(!valid(current)||selected!==targetId)return;if(result.bindingVerified!==true||!client.bindingVerified)throw componentError('needsFreshChallenge');
      proof=Object.fromEntries(['boardId','bootId','clientId','targetId'].map(key=>[key,client[key]]));checkedAt=new Date();resetChallenge();publish();setStatus('bound');
    });
    for(const name of ['assistive','keyboard'])node('[data-'+name+']').onchange=event=>{if(working||isBusy()){event.target.checked=name==='assistive'?assistive:keyboard;return;}if(name==='assistive')assistive=event.target.checked;else keyboard=event.target.checked;publish();renderState();};
    node('[data-start-sharing]').onclick=()=>{
      if(working||isBusy()||!sameProof(proof,client)||!assistive||!keyboard)return;
      // Invoke synchronously inside the user gesture, before any storage/network await.
      let started;try{started=capture.start();}catch(error){setStatus('operationFailed',error);return;}
      return action(async({current})=>{await started;if(valid(current))setStatus('sharingReady');});
    };
    node('[data-stop-sharing]').onclick=()=>{if(working||isBusy())return;capture.stop();setStatus('sharingOff');renderState();};
    node('[data-save-vault]').onclick=()=>action(async({current})=>{
      const field=node('[data-vault-password]'),passphrase=field.value;field.value='';if(!passphrase)throw componentError('passphrase');
      const record=client.exportCredentials(),encrypted=await sealCredentials(record,passphrase);if(!valid(current))return;
      const latest=await store.getSettings();await savePublicSettings({credentialVault:{...latest.credentialVault,['device:'+record.expectedFingerprint]:encrypted}});if(valid(current)){setStatus('vaultSaved');onToast(copy('vaultSaved'));}
    });
    node('[data-restore-vault]').onclick=()=>action(async({signal,current})=>{
      const configuration=values();if(!configuration.expectedFingerprint)configuration.expectedFingerprint=normalizedFingerprint(node('[data-fingerprint]').value);const field=node('[data-vault-password]'),passphrase=field.value;field.value='';
      const {bridge,ready}=connection(configuration,signal);let retained=false;
      try{
       const latest=await store.getSettings(),encrypted=latest.credentialVault?.['device:'+configuration.expectedFingerprint];if(!encrypted)throw componentError('noVault');
       const record=await unsealCredentials(encrypted,passphrase);await ready;if(!valid(current))return;
       if(record.expectedFingerprint!==configuration.expectedFingerprint||record.baseUrl!==configuration.baseUrl)throw componentError('verificationRequired');
       const candidate=clientFactory({...configuration,...(bridge?{fetchImpl:bridge.fetch}:{})});candidate.restoreCredentials(record);await candidate.pinIdentity(configuration.expectedFingerprint,{signal});if(!valid(current)){candidate.clearCredentials();return;}
       resetChallenge();invalidateProof();client=candidate;transport=bridge;await refresh(signal);if(valid(current)){retained=true;setStatus('needsFreshChallenge');}
      }finally{if(!retained){bridge?.close();if(transport===bridge)transport=null;}}
    });
    node('[data-control-check]').onclick=()=>action(async({signal,current})=>{
      if(!sameProof(proof,client)||!assistive||!keyboard)throw componentError('settingsRequired');
      const tested=client,writerId='ui:'+crypto.randomUUID();let claimed=false;
      try{await tested.claimLease({writerId},{signal});claimed=true;await tested.endRun({writerId});claimed=false;if(valid(current)){checkedAt=new Date();setStatus('controlChecked');}}
      finally{if(claimed){try{await tested.endRun({writerId});}catch{invalidateProof();}}}
    });
    renderState();
  }
  return {open,dispose:close,getDevice:()=>sameProof(proof,client)&&assistive&&keyboard?client:null};
}
