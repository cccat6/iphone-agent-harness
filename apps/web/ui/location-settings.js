import {t as translate} from '../i18n.js';

export async function mountLocationSettings(root,{store,access,t=translate,onSave=()=>{},onError=()=>{}}={}){
  root.innerHTML='<label class="check-field"><input id="location-enabled" type="checkbox"><span id="location-label" data-i18n="location.enable"></span></label><p id="location-help" data-i18n="location.help" class="quiet-note"></p><p id="location-permission" class="quiet-note" role="status"></p><p id="location-denied-help" data-i18n="location.deniedHelp" class="quiet-note" hidden></p>';
  const input=root.querySelector('#location-enabled'),status=root.querySelector('#location-permission'),help=root.querySelector('#location-denied-help');
  root.querySelector('#location-label').textContent=t('location.enable');
  root.querySelector('#location-help').textContent=t('location.help');
  help.textContent=t('location.deniedHelp');
  let revision=0,savedSettings=await store.getSettings();
  async function render(settings){
    const current=++revision;
    input.checked=settings.locationEnabled===true;input.disabled=!access.supported();
    const permission=await access.permission();
    if(current!==revision)return;
    const key='location.'+(!access.supported()?'unsupported':!input.checked?'off':permission==='unknown'?'on':permission);
    status.setAttribute?.('data-i18n',key);status.textContent=t(key);
    help.hidden=!input.checked||permission!=='denied';
  }
  input.onchange=async()=>{
    const enabled=input.checked;
    if(!enabled)access.cancel();
    input.disabled=true;
    try{savedSettings=await store.saveSettings({locationEnabled:enabled});onSave(savedSettings);await render(savedSettings);}
    catch(error){onError(error);await render(savedSettings);}
  };
  await render(savedSettings);
}
