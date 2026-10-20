import {createDeviceSetupLink} from '../core/device-setup.js';
import {getLocale,subscribe,localizeError} from '../i18n.js';
import {DEVICE_MESSAGES} from '../locales/device.js';
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
/** USB setup credentials remain inside this component and are never logged. */
export function mountUsbSetup({container,readSetup,canRead=()=>false,isBusy=()=>false,setBusy=()=>{}}){
  let information=null,revealed=false,working=false,disposed=false,controller=null,statusKey='',detail='';
  const copy=key=>(DEVICE_MESSAGES[getLocale()]||DEVICE_MESSAGES.en)[key]||key;
  function clear(){information=null;revealed=false;statusKey='';detail='';render();}
  async function action(work){
    if(working||isBusy()||disposed)return;working=true;setBusy(true);controller=new AbortController();render();
    try{await work(controller.signal);}catch(error){if(!disposed){detail=error;statusKey='';}}
    finally{working=false;controller=null;setBusy(false);if(!disposed)render();}
  }
  function render(){
    if(disposed||!container.isConnected)return;container.dataset.noI18n='';
    container.innerHTML=`<section class="settings-section usb-setup"><h2>${copy('usbTitle')}</h2><p class="quiet-note">${copy('usbHelp')}</p><div class="panel-actions"><button type="button" data-usb-read class="secondary-button" ${working||!canRead()?'disabled':''}>${copy('usbRead')}</button>${information?`<button type="button" data-usb-clear class="secondary-button" ${working?'disabled':''}>${copy('usbClear')}</button>`:''}</div><div class="quiet-note" role="status" data-usb-status>${escapeHTML(working?copy('usbReading'):statusKey?copy(statusKey):detail?.deviceMessageKey?copy(detail.deviceMessageKey):localizeError(detail))}</div>${information?`<div data-usb-information><label class="field"><span>${copy('boardLabel')}</span><input readonly value="${escapeHTML(information.boardId)}"></label><label class="field"><span>${copy('usbSsid')}</span><input readonly value="${escapeHTML(information.apSsid)}"></label><label class="field"><span>${copy('usbApPassword')}</span><input data-usb-secret readonly type="${revealed?'text':'password'}" autocomplete="off" value="${escapeHTML(information.apPassword)}"></label><button type="button" data-usb-reveal class="secondary-button" ${working?'disabled':''}>${copy(revealed?'usbHide':'usbShow')}</button><label class="field"><span>${copy('address')}</span><input readonly value="${escapeHTML(information.httpUrl)}"></label>${information.httpUrl?`<label class="field"><span>${copy('setupLink')}</span><input data-usb-secret readonly type="${revealed?'text':'password'}" autocomplete="off" value="${escapeHTML(createDeviceSetupLink(information))}"></label><p class="quiet-note">${copy('setupLinkHelp')}</p>`:`<p class="quiet-note">${copy('upgradeFirmware')}</p>`}</div>`:''}</section>`;
    container.querySelector('[data-usb-read]').onclick=()=>action(async signal=>{statusKey='usbReading';const result=await readSetup({signal});if(disposed||signal.aborted)return;information=result;revealed=false;statusKey='usbReady';detail='';});
    const clearButton=container.querySelector('[data-usb-clear]');if(clearButton)clearButton.onclick=clear;
    const revealButton=container.querySelector('[data-usb-reveal]');if(revealButton)revealButton.onclick=()=>{revealed=!revealed;render();};

  }
  const unsubscribe=subscribe(render);render();
  return {dispose(){disposed=true;controller?.abort();information=null;revealed=false;container.replaceChildren();unsubscribe();}};
}
