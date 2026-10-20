import {createLocationAccess} from './core/location.js';
import {loadComposerDraft,saveComposerDraft,clearComposerDraft} from './ui/composer-draft.js';
import {mountCodexLogin,loadPendingCodexLogin,prepareCodexSignInProfile} from './ui/codex-login.js';
import {mountLocationSettings} from './ui/location-settings.js';
import {createSessionActions} from './ui/session-actions.js';
import {mountSessionSwipe} from './ui/session-swipe.js';
import {createViewNavigation} from './ui/navigation.js';
import {reasoningOptions,normalizeReasoningEffort,modelReasoningMetadata} from './core/reasoning.js';
import {messagePresentation,createConversationFollow} from './ui/message-presentation.js';
import {showImagePreview} from './ui/image-preview.js';
import {pendingDeviceSetupReturn} from './core/device-setup.js';
import { getBrowserCompatibility } from './core/compatibility.js';
import { SITE_CONFIG } from './site-config.js';
import { t, getLocale, getLocalePreference, setLocale, subscribe, SUPPORTED_LOCALES, translateText, translationKey, localizeError, registerErrorCatalog, skillMetadata } from './i18n.js';
import { openStore } from './core/store.js';
import { importSessionFile as restoreSessionFile, exportSessionFile } from './core/session-files.js';
import { createHistoryWindow } from './core/history-window.js';
import { createHistoryImages } from './ui/history-images.js';
import { readImportFile, BACKUP_ERRORS } from './core/backup-files.js';
import { createHarness, chatExecutionContext } from './core/harness.js';
import { setCredential, hasCredential, getCredential, saveProviderCredential, removeProviderCredential, restoreProviderCredentials, resolveProviderCredential, inspectProviderCredential } from './core/credentials.js';
import { createDevicePanel } from './ui/device-panel.js';
import { mountUsbSetup } from './ui/usb-setup.js';
import { setLocalizedText, refreshLocalizedText } from './ui/localized-status.js';
import { createClipboardController } from './core/clipboard.js';
import { createDeviceClipboard } from './core/device-clipboard.js';
import { mountClipboardPanel } from './ui/clipboard.js';
import { screenCapture, normalizeImageSettings } from './core/capture.js';
import { normalizeContextSettings } from './core/context.js';
import { modelContextMetadata, resolveModelSelection } from './core/models.js';
import { unsealCredentials } from './core/auth.js';
import { createMCPAccess } from './core/mcp.js';
import { mountSessionSearch } from './ui/session-search.js';
import { mountViewport } from './ui/viewport.js';
import { showPanelSurface } from './ui/panel-surface.js';
import { createMCPSettings } from './ui/mcp-settings.js';
import { discoverModels, normalizeProviderEndpoint } from './core/providers.js';
import { installBuiltinSkills, loadCommunityCatalog, readCatalogSkill, installCatalogSkill, syncInstalledCommunitySkills, publicBuiltinSkills } from './core/skills.js';
import { openCreatorIdentity, importCreatorIdentity } from './community/identity.js';
import { createAuthoredSkill, updateAuthoredSkill, isOwnedAuthored, importOwnSkillFile } from './community/authoring.js';
import { CommunityClient } from './community/client.js';
import { canFlash, loadFirmwareManifest, flashFirmware, readDeviceSetup, firmwareInstallerChoices } from './core/flasher.js';
import { startCodexLogin, validateCodexCallback, completeCodexLogin, discoverCodexModels, normalizeSubscriptionRelay, getCodexAccount, registerCodexAccount, hasCodexAccount, removeCodexAccount, setCodexTokenObserver } from './core/codex.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const state = { store:null, harness:null, device:null, devicePanel:null, mcpAccess:null, mcpPanel:null, settings:{}, sessions:[], current:null, composerDraft:null, composerDraftActive:false, messages:[], messageLimit:80, hasOlder:false, archived:false, running:false, submitting:false, runGeneration:0, pending:null, skills:[], catalog:[], skillTab:'local', providerEdit:null, providerModels:[], drafts:new Map(), abort:null, lastError:null };
const capture = screenCapture;
const clipboard=createClipboardController({isCurrent:({sessionId,targetId})=>state.current?.id===sessionId&&deviceStatus().targetBound&&deviceStatus().targetId===targetId});
const deviceClipboard=createDeviceClipboard({getDevice:()=>activeInputBridge(),isCurrent:({sessionId,targetId})=>state.current?.id===sessionId&&deviceStatus().targetBound&&deviceStatus().targetId===targetId});
clipboard.subscribe(snapshot=>{if(!snapshot||snapshot.status!=='awaiting_user_action')deviceClipboard.cancel();});
registerErrorCatalog(BACKUP_ERRORS);
let vaultWrite=Promise.resolve();
setCodexTokenObserver(({id,event})=>{
  if(event!=='refreshed'||!state.store)return;
  vaultWrite=vaultWrite.catch(()=>{}).then(async()=>{
    const latest=await state.store.getSettings(),account=getCodexAccount(id);
    if(!account||!latest.providers?.some(profile=>profile.id===id&&profile.protocol==='codex'))return;
    await saveProviderCredential(state.store,id,{kind:'codex',tokens:account.exportTokens()});
  }).catch(error=>toast(()=>t('providerRefinement.credentialSaveFailed',{detail:localizeError(error)})));
});
let toastTimer,toastNode;
const modeLabel=()=>t('interaction.assistant');

function hideToast(node){if(typeof node?.hidePopover==='function'&&node.matches(':popover-open'))node.hidePopover();if(node)node.hidden=true;}
function toast(message) {
  clearTimeout(toastTimer);hideToast(toastNode);
  const host=$$('dialog[open]').at(-1)||document.body;
  let node=$('#toast');if(!node){node=document.createElement('div');node.id='toast';node.className='toast';node.setAttribute('role','status');}
  if(node.parentElement!==host)host.append(node);
  node.setAttribute('aria-live','polite');node.setAttribute('aria-atomic','true');
  setLocalizedText(node,()=>typeof message==='function'?message():localizeError(message));node.hidden=false;
  if(typeof node.showPopover==='function'){node.setAttribute('popover','manual');node.showPopover();}
  toastNode=node;toastTimer=setTimeout(()=>hideToast(node),3500);
}
function report(error) { console.error(error); toast(error); }
function guard(fn) { return async (...args) => { try { await fn(...args); } catch(error) { report(error); } }; }
function communityEndpoint(){return SITE_CONFIG.communityEndpoint||'';}
function providers() { return Array.isArray(state.settings.providers) ? state.settings.providers : []; }
function selectionParts(value) {
  const raw=String(value||'');const separator=raw.indexOf('::');
  return separator<0?{providerId:raw,modelId:''}:{providerId:raw.slice(0,separator),modelId:raw.slice(separator+2)};
}
function profileModels(profile) {
  const models=new Map();
  for(const entry of Array.isArray(profile.models)?profile.models:[]) {
    const id=typeof entry==='string'?entry:entry?.id;
    if(typeof id==='string'&&id.trim())models.set(id,{id,name:typeof entry==='object'?(entry.name||id):id,...modelContextMetadata(typeof entry==='object'?entry:{}),...modelReasoningMetadata(typeof entry==='object'?entry:{})});
  }
  if(profile.model&&!models.has(profile.model))models.set(profile.model,{id:profile.model,name:profile.model});
  return [...models.values()];
}
function selectedProvider() { const {providerId}=selectionParts($('#model-select').value);return providers().find(provider=>provider.id===providerId); }
function dateLabel(value) { const date=new Date(value); return Number.isNaN(+date)?'':new Intl.DateTimeFormat(getLocale(),{month:'short',day:'numeric'}).format(date); }
function shortId() { return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function download(value,name,type='application/json') { const blob=value instanceof Blob?value:new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
function chooseFile(accept,callback,maxBytes) { const input=$('#file-input'); input.value=''; input.accept=accept; input.onchange=guard(async()=>{const file=input.files[0]; if(!file)return; await callback(await readImportFile(file,{maxBytes}),file.name);}); input.click(); }
function safeURL(value) { const url=new URL(value,location.href); if(!['http:','https:'].includes(url.protocol))throw new Error('仅支持 HTTP 或 HTTPS 地址。'); if(url.username||url.password)throw new Error('请不要把凭据写入网址。'); return url.href; }
function systemTextHTML(key,variables={}) {return `<span data-no-i18n data-i18n="${escapeHTML(key)}" data-i18n-vars="${escapeHTML(JSON.stringify(variables))}">${escapeHTML(t(key,variables))}</span>`;}
function skillTextHTML(skill,field,{trustedCatalog=false,catalog=false}={}){
  const metadata=skillMetadata(skill,{trustedCatalog,catalog}),value=field==='name'?metadata.name:metadata.description;
  const key=(field==='name'?metadata.nameKey:metadata.descriptionKey)||(!value&&field==='description'?'common.noDescription':null);
  return key?systemTextHTML(key):`<span data-no-i18n>${escapeHTML(value)}</span>`;
}

function deviceSessionAvailable(){const value=state.devicePanel?.getState?.();return Boolean(value?.ready??(value?.connected&&value?.inputVerified));}
function renderDeviceStatus(){
  const value=state.devicePanel?.getState?.()||state.deviceStatus||{},ready=value.ready??value.inputVerified,key=value.status==='connecting'?'connecting':value.checking?'checking':!value.connected?'offline':value.bluetoothConnected===false?'phone':value.phoneInputReady===false?'input':!ready?'target':value.sharing?'sharing':'ready';
  $('#home-device-status').textContent=t('device.state.'+key);$('#home-device-detail').textContent=t(value.connected?'device.manage':'device.connectHint');$('#device-indicator').classList.toggle('verified',Boolean(ready));
  $('#conversation-device').textContent=t('device.state.'+key);$('#conversation-device').classList.toggle('connected',Boolean(ready));
  $('#new-session').setAttribute('aria-label',t('session.new'));$('#new-session').setAttribute('aria-describedby','home-device-status');
}
async function refreshSessions() { state.sessionListCursors=[];state.sessionListBefore=null;const request=state.sessionListGeneration=(state.sessionListGeneration||0)+1;const sessions=await state.store.listSessions({archived:state.archived,search:$('#session-search').value,limit:81});if(request!==state.sessionListGeneration)return;state.sessions=sessions.slice(0,80);state.libraryCommittedArchived=state.archived;state.sessionListMore=sessions.length>80;renderSessions(); }
async function switchSessionLibrary(value){if(state.libraryCommittedArchived===undefined)state.libraryCommittedArchived=state.archived;const previous=state.libraryCommittedArchived,generation=state.libraryGeneration=(state.libraryGeneration||0)+1;state.archived=value==='archived';$('#sessions').setAttribute('aria-busy','true');try{await refreshSessions();if(generation===state.libraryGeneration)state.libraryCommittedArchived=state.archived;}catch(error){if(generation===state.libraryGeneration){state.archived=previous;renderSessions();}throw error;}finally{if(generation===state.libraryGeneration)$('#sessions').setAttribute('aria-busy','false');}}
async function pageSessions(back=false){const cursor=back?state.sessionListCursors.at(-1):state.sessions.at(-1);if(!back&&!state.sessionListMore||back&&!state.sessionListCursors.length)return;const request=state.sessionListGeneration=(state.sessionListGeneration||0)+1,sessions=await state.store.listSessions({archived:state.archived,search:$('#session-search').value,limit:81,before:cursor});if(request!==state.sessionListGeneration)return;if(back)state.sessionListCursors.pop();else state.sessionListCursors.push(state.sessionListBefore);state.sessionListBefore=cursor;state.sessions=sessions.slice(0,80);state.sessionListMore=sessions.length>80;renderSessions();$('#sessions').scrollTop=0;}

function renderSessions() {
  const library=$('#list-label');library.value=state.archived?'archived':'active';library.setAttribute('aria-label',t('library.switch'));library.options[0].textContent=t('session.listTitle');library.options[1].textContent=t('session.archived');const caption=$('#session-list-caption');if(caption)caption.textContent=t(state.archived?'session.archived':'session.listTitle');
  const sessions=[...state.sessions].sort((a,b)=>Number(b.pinned)-Number(a.pinned) || new Date(b.updatedAt)-new Date(a.updatedAt));
  state.sessionSwipe?.destroy();$('#sessions').innerHTML=sessions.length?sessions.map(session=>`<div class="session-swipe ${state.current?.id===session.id?'active':''}" data-session-row="${escapeHTML(session.id)}"><div class="session-swipe-actions" data-swipe-actions>${(session.archived?['rename','restore','delete']:['rename','archive']).map(action=>`<button type="button" class="session-swipe-action ${action==='delete'?'danger-action':''}" data-session-action="${action}">${escapeHTML(t({rename:'session.renameTitle',restore:'session.unarchive',delete:'session.delete',archive:'session.archive'}[action]))}</button>`).join('')}</div><div class="session-swipe-front"><button class="session-row ${state.current?.id===session.id?'active':''}" data-session="${escapeHTML(session.id)}"><span class="row-title"><span>${escapeHTML(session.title||t('session.new'))}</span>${session.pinned?`<span class="row-pin">${t('session.pinned')}</span>`:''}</span><small>${dateLabel(session.updatedAt)}</small></button><button type="button" class="session-row-menu icon-button" data-session-menu="${escapeHTML(session.id)}" aria-label="${escapeHTML(t('session.actions'))}"><span class="ui-icon ui-icon-more" aria-hidden="true"></span></button></div></div>`).join(''):`<div class="list-empty"><strong>${escapeHTML(t(state.archived?'session.noArchive':$('#session-search').value?'session.noMatch':'session.emptyTitle'))}</strong>${!state.archived&&!$('#session-search').value?`<p>${escapeHTML(t(deviceSessionAvailable()?'session.empty':'session.connectStart'))}</p>`:''}</div>`;
  if(state.sessionListCursors?.length)$('#sessions').insertAdjacentHTML('afterbegin',`<button class="secondary-button history-page" id="sessions-previous">${escapeHTML(t('session.previousPage'))}</button>`);
  if(state.sessionListMore)$('#sessions').insertAdjacentHTML('beforeend',`<button class="secondary-button history-page" id="sessions-next">${escapeHTML(t('session.nextPage'))}</button>`);
  if($('#sessions-previous'))$('#sessions-previous').onclick=guard(()=>pageSessions(true));if($('#sessions-next'))$('#sessions-next').onclick=guard(()=>pageSessions(false));
  $$('[data-session]').forEach(button=>button.onclick=guard(()=>openSession(button.dataset.session)));state.sessionSwipe=mountSessionSwipe({root:$('#sessions'),onAction:sessionRowAction,onError:report});$$('[data-session-menu]').forEach(button=>button.onclick=()=>{const row=button.closest('[data-session-row]');state.sessionSwipe.open(row);});
}
function sessionActions(){
  return state.sessionActions||(state.sessionActions=createSessionActions({
    store:state.store,
    isBusy:id=>state.current?.id===id&&(state.running||state.submitting),
    confirmDelete:()=>confirm(t('confirm.deleteSession')),
    copy:async id=>{await navigator.clipboard.writeText(id);toast('会话 ID 已复制。');},
    exportSession:async id=>{download(await exportSessionFile(state.store,id),`session-${id}.json`);toast('会话已导出。');},
    onDeleting:()=>renderRunControls(),
    onMetadata:(id,patch,updated)=>{if(state.current?.id===id)Object.assign(state.current,patch,{updatedAt:updated.updatedAt});},
    onDeleted:id=>{
      state.drafts.delete(id);
      if(state.current?.id!==id)return;
      state.current=null;historyWindow().clear();state.messages=[];state.pending=null;state.lastError=null;state.capturePaused=false;state.hasOlder=false;state.hasNewer=false;
      $('#message-input').value='';resizeInput();$('#session-menu').hidden=true;$('#session-title').textContent='iPhone Agent Harness';$('#session-subtitle').textContent='';renderMessages();
      state.navigation?.go({screen:'list',sessionId:null,action:null},{replace:true});$('#app').classList.remove('in-conversation');
    },
    refresh:refreshSessions
  }));
}
async function performSessionAction(action,session){
  try{await sessionActions().perform(action,session);}
  catch(error){if(error.code==='SESSION_BUSY')throw new Error(t('session.stopBeforeDelete'));throw error;}
}
async function sessionRowAction(action,id){
  const session=await state.store.getSession(id);if(!session)return;
  if(action==='rename'){showRenameDialog(session,{fromList:true});return;}
  if(action==='delete'&&!session.archived)return;
  await performSessionAction(action,session);
}
function renderModelOptions() {
  const current=state.current?.modelId||(state.composerDraftActive?state.composerDraft?.modelId:'')||state.settings.activeProviderId||'';
  const parts=selectionParts(current);const profile=providers().find(item=>item.id===parts.providerId);
  const selected=profile?`${profile.id}::${parts.modelId||profile.model||profileModels(profile)[0]?.id||''}`:'';
  $('#model-select').innerHTML=(providers().some(item=>profileModels(item).length)?'':`<option value="" disabled>${t('status.configureModel')}</option>`)+providers().map(item=>`<optgroup label="${escapeHTML(item.name||t('provider.unnamed'))}">${profileModels(item).map(model=>`<option value="${escapeHTML(item.id+'::'+model.id)}">${escapeHTML(model.name)} · ${escapeHTML(item.name||t('provider.account'))}</option>`).join('')}</optgroup>`).join('');
  $('#model-select').value=selected||$('#model-select').options[0]?.value||'';if(!$('#model-select').value&&$('#model-select').options.length)$('#model-select').value=$('#model-select').options[0].value;$('#model-select').setAttribute('aria-label',t('session.model'));
  const resolved=selectedProvider();$('#model-select').title=resolved?`${resolved.name} · ${selectionParts($('#model-select').value).modelId}`:t('provider.chooseAccountModel');renderReasoningOptions();
}
function renderReasoningOptions(){
  const select=$('#reasoning-select');if(!select)return;const profile=selectedProvider(),model=selectionParts($('#model-select').value).modelId||profile?.model;
  const provider=profile?{...profile,model}:{};const options=reasoningOptions(provider),key=profile?profile.id+'::'+model:'';
  const selected=normalizeReasoningEffort(provider,state.current?.reasoningEfforts?.[key]??(state.composerDraftActive?state.composerDraft?.reasoningEfforts?.[key]:undefined)??state.settings.reasoningEfforts?.[key]??profile?.reasoningEffort);
  select.hidden=!options.length;select.disabled=state.running||state.submitting;select.setAttribute('aria-label',t('reasoning.label'));select.title=t('reasoning.label');
  select.innerHTML=['auto',...options].map(value=>`<option value="${value}">${escapeHTML(t('reasoning.'+value))}</option>`).join('');select.value=selected;
}
function updateModeDescription() { $('#mode-description').textContent=t(capture.active?'interaction.sharing':'interaction.notSharing'); }
async function changeReasoningSelection(){const profile=selectedProvider();if(!profile)return;const model=selectionParts($('#model-select').value).modelId||profile.model,key=profile.id+'::'+model,value=normalizeReasoningEffort({...profile,model},$('#reasoning-select').value);if(state.current){const id=state.current.id,reasoningEfforts={...state.current.reasoningEfforts,[key]:value};await state.store.updateSession(id,{reasoningEfforts});if(state.current?.id===id)state.current.reasoningEfforts=reasoningEfforts;}else if(state.composerDraftActive&&state.composerDraft){state.composerDraft.reasoningEfforts={...state.composerDraft.reasoningEfforts,[key]:value};rememberComposerDraft();}else state.settings=await state.store.saveSettings({reasoningEfforts:{...state.settings.reasoningEfforts,[key]:value}});renderReasoningOptions();}
async function changeModelSelection(){const selection=$('#model-select').value,resolved=selectedProvider();$('#model-select').title=resolved?`${resolved.name} · ${selectionParts(selection).modelId}`:t('provider.chooseAccountModel');renderReasoningOptions();if(state.current){const id=state.current.id;await state.store.updateSession(id,{modelId:selection});if(state.current?.id===id)state.current.modelId=selection;}else if(state.composerDraftActive&&state.composerDraft){state.composerDraft.modelId=selection;rememberComposerDraft();}}
function rememberComposerDraft(){if(!state.composerDraftActive||state.current||!state.composerDraft)return;state.composerDraft.text=$('#message-input').value;saveComposerDraft(state.composerDraft);}
function openComposerDraft({focus=false,navigation=true}={}){
  if(state.running||state.submitting)throw new Error(t('session.stopBeforeImport'));
  rememberRouteDraft();state.sessionOpenGeneration=(state.sessionOpenGeneration||0)+1;
  state.composerDraft ||= loadComposerDraft()||{text:'',modelId:$('#model-select').value||state.settings.activeProviderId||providers()[0]?.id||'',reasoningEfforts:{}};
  state.current=null;state.composerDraftActive=true;state.messages=[];state.hasOlder=state.hasNewer=false;state.history?.clear();state.pending=null;state.lastError=null;state.capturePaused=false;
  clipboard.clear();state.clipboardView?.destroy();$('#clipboard-panel').replaceChildren();$('#app').classList.add('in-conversation');$('#session-title').textContent=t('session.new');$('#session-subtitle').textContent='';$('#session-menu').hidden=true;
  $('#message-input').value=state.composerDraft.text;resizeInput();renderModelOptions();renderSessions();renderMessages({forceFollow:true});saveComposerDraft(state.composerDraft);
  if(navigation)state.navigation?.go({route:'harness',screen:'draft',sessionId:null,panel:null,action:null});if(focus)$('#message-input').focus();return state.composerDraft;
}
async function newSession(){
  if(state.running||state.submitting)throw new Error(t('session.stopBeforeImport'));if(state.draftOpening)return state.draftOpening;
  const request=state.sessionOpenGeneration=(state.sessionOpenGeneration||0)+1;
  const task=(async()=>{const ready=await state.devicePanel?.ensureReady?.();if(request!==state.sessionOpenGeneration)return null;if(!ready){await showDevices();toast(t('device.startHint'));return null;}return openComposerDraft({focus:true});})().finally(()=>{if(state.draftOpening===task)state.draftOpening=null;});state.draftOpening=task;return task;
}
function historyWindow(){return state.history||(state.history=createHistoryWindow(state.store,{includeInternal:!!state.settings.developerMode}));}
async function refreshConversationPresentation(){state.history?.clear();state.history=null;if(state.current){applyHistory(await historyWindow().load(state.current.id));}renderMessages();}
function applyHistory(page){if(!page)return false;state.messages=page.messages;state.hasOlder=page.hasOlder;state.hasNewer=page.hasNewer;state.messageLimit=page.messages.length;return true;}
async function openSession(id,{fromSubmit=false,replaceDraft=false}={}) {
  if(state.submitting&&!fromSubmit)throw new Error('请先停止当前任务，再切换会话。');
  if(state.current)state.drafts.set(state.current.id,$('#message-input').value);else if(state.composerDraftActive)rememberComposerDraft();
  if(state.running&&state.current?.id!==id)throw new Error('请先停止当前任务，再切换会话。');
  const request=state.sessionOpenGeneration=(state.sessionOpenGeneration||0)+1;
  const switching=state.current?.id!==id;const session=await state.store.getSession(id);if(request!==state.sessionOpenGeneration)return;
  if(!session){if(state.navigation?.restoring){$('#app').classList.remove('in-conversation');return null;}throw new Error('未找到这条会话。');}
  const page=await historyWindow().load(id);if(request!==state.sessionOpenGeneration||!page)return;
  // The composer stays editable while the saved session/history are loaded.
  // Refreshing the current conversation must retain text typed during either await.
  if(state.current?.id===id)state.drafts.set(id,$('#message-input').value);
  if(state.current?.id!==id)clipboard.clear();state.current=session;state.composerDraftActive=false;state.capturePaused=false;applyHistory(page);
  state.lastError=null;state.pending=null;$('#app').classList.add('in-conversation');$('#session-title').textContent=session.title||t('session.new');$('#session-subtitle').textContent='';$('#session-menu').hidden=false;$('#message-input').value=state.drafts.get(id)||'';resizeInput();renderModelOptions();updateModeDescription();renderSessions();renderClipboard();renderMessages({forceFollow:switching});state.navigation?.go({route:'harness',screen:'session',sessionId:id,panel:null,action:null},{replace:replaceDraft});
  return session;
}
async function pageHistory(direction){
  if(direction==='older')conversationFollow().pause();
  const region=$('#conversation'),first=[...region.querySelectorAll('[data-message-id]')].find(node=>node.offsetTop+node.offsetHeight>=region.scrollTop),anchor=first?{id:first.dataset.messageId,offset:first.offsetTop-region.scrollTop}:null;
  const id=state.current?.id,page=await historyWindow().page(direction);if(!page||state.current?.id!==id)return;
  applyHistory(page);renderMessages({scrollToEnd:false});
  if(anchor){const node=[...region.querySelectorAll('[data-message-id]')].find(item=>item.dataset.messageId===anchor.id);if(node)region.scrollTop=node.offsetTop-anchor.offset;}
}
function welcome() { return `<section class="welcome"><h2>${escapeHTML(t('interaction.welcome'))}</h2><p>${escapeHTML(t('interaction.welcomeHelp'))}</p></section>`; }
function conversationFollow(){return state.conversationFollow||(state.conversationFollow=createConversationFollow({region:$('#conversation'),onChange:following=>{renderLatestControl();if(following&&state.hasNewer&&!state.latestLoading)void showLatestConversation().catch(report);}}));}
function renderLatestControl(){const button=$('#conversation-latest');if(button){button.hidden=(state.conversationFollow?.following!==false&&!state.hasNewer);button.textContent=t('interaction.latest');}}
async function showLatestConversation(){if(!state.current||state.latestLoading)return;const id=state.current.id;state.latestLoading=true;try{const page=await historyWindow().load(id);if(!page||state.current?.id!==id)return;applyHistory(page);conversationFollow().follow();renderMessages({forceFollow:true});}finally{state.latestLoading=false;renderLatestControl();}}
function renderMessages({scrollToEnd=true,forceFollow=false}={}) {
  const region=$('#conversation'),follow=conversationFollow();const wasFollowing=follow.beforeRender({force:forceFollow});const anchor=!wasFollowing?[...region.querySelectorAll('[data-message-id]')].find(node=>node.offsetTop+node.offsetHeight>=region.scrollTop):null,anchorPosition=anchor?{id:anchor.dataset.messageId,offset:anchor.offsetTop-region.scrollTop}:null;
  const renderGeneration=state.historyRenderGeneration=(state.historyRenderGeneration||0)+1;state.historyScrollPause=true;requestAnimationFrame(()=>{if(state.historyRenderGeneration===renderGeneration)state.historyScrollPause=false;});
  const earlier=state.hasOlder?`<button id="load-older-messages" class="secondary-button history-page">${escapeHTML(t('session.older'))}</button>`:'';
  const later=state.hasNewer?`<button id="load-newer-messages" class="secondary-button history-page">${escapeHTML(t('session.newer'))}</button>`:'';
  state.historyImages?.destroy();
  const rendered=state.messages.map(message=>{
    const view=messagePresentation(message,{developerMode:!!state.settings.developerMode,t});if(!view)return '';
    return `<article data-message-id="${escapeHTML(message.id)}" class="message ${escapeHTML(message.role)} ${view.kind}"><div class="message-label">${escapeHTML(message.role==='assistant'?'Harness':t(message.role==='user'?'session.you':'interaction.toolResult'))}</div>${view.text?`<div class="message-body">${escapeHTML(view.text)}</div>`:''}${message.textLength>message.text.length&&message.role!=='tool'?`<div class="message-text-paging"><button class="secondary-button" data-text-page="previous" data-offset="0" hidden>${escapeHTML(t('session.previousText'))}</button><button class="secondary-button" data-text-page="next" data-offset="0">${escapeHTML(t('session.nextText'))}</button></div>`:''}${view.plan?`<section class="task-plan"><strong>${escapeHTML(t('interaction.plan'))}</strong><p>${escapeHTML(view.plan.goal)}</p><ol>${view.plan.steps.map(step=>`<li>${escapeHTML(typeof step==='string'?step:step.description||step.title||'')}</li>`).join('')}</ol><button class="secondary-button" data-execute-plan="${escapeHTML(message.id)}" ${state.running?'disabled':''}>${escapeHTML(t('interaction.executePlan'))}</button></section>`:''}${view.frameRefs.length?`<div class="message-images">${view.frameRefs.map(ref=>`<button type="button" class="screenshot-thumbnail" data-preview-frame="${escapeHTML(ref)}" aria-label="${escapeHTML(t('session.screenshot'))}"><img data-frame-ref="${escapeHTML(ref)}" alt="${escapeHTML(t('session.screenshot'))}" decoding="async"></button>`).join('')}</div>`:''}${view.detail?`<details class="message-debug"><summary>${escapeHTML(t('interaction.details'))}</summary><pre>${escapeHTML(view.detail)}</pre></details>`:''}</article>`;
  }).join('');
  region.innerHTML=state.messages.length?earlier+rendered+later:welcome();
  if($('#load-older-messages'))$('#load-older-messages').onclick=guard(()=>pageHistory('older'));
  if($('#load-newer-messages'))$('#load-newer-messages').onclick=guard(()=>pageHistory('newer'));
  $$('[data-preview-frame]',region).forEach(button=>button.onclick=guard(()=>showImagePreview({store:state.store,ref:button.dataset.previewFrame,label:t('session.screenshot'),closeLabel:t('common.close')})));
  $$('[data-execute-plan]',region).forEach(button=>button.onclick=guard(()=>{const proposal=state.messages.find(m=>m.id===button.dataset.executePlan)?.taskPlan;if(proposal)return sendMessage({preventDefault(){}},t('interaction.executeRequest',{goal:proposal.goal})+'\n'+proposal.steps.map((step,index)=>(index+1)+'. '+(typeof step==='string'?step:step.description||step.title||'')).join('\n'),'auto');}));
  $$('[data-text-page]',region).forEach(button=>button.onclick=guard(async()=>{const article=button.closest('[data-message-id]'),id=article.dataset.messageId,offset=Math.max(0,Number(button.dataset.offset)+(button.dataset.textPage==='next'?32768:-32768));button.disabled=true;try{const page=await state.store.getMessageText(id,{offset});if(!article.isConnected||!page)return;$('.message-body',article).textContent=page.text;const previous=$('[data-text-page="previous"]',article),next=$('[data-text-page="next"]',article);for(const control of [previous,next])control.dataset.offset=String(offset);previous.hidden=offset===0;next.hidden=offset+page.text.length>=page.textLength;article.scrollIntoView({block:'start'});}finally{button.disabled=false;}}));
  region.onscroll=()=>{if(!state.historyScrollPause&&region.scrollTop<100&&state.hasOlder)void pageHistory('older').catch(report);};
  if(state.pending!==null&&!state.hasNewer){const article=document.createElement('article');article.className='message assistant pending';article.innerHTML='<div class="message-label">Harness</div><div class="message-body"></div>';$('.message-body',article).textContent=state.pending;region.append(article);}
  if(state.lastError){const node=document.createElement('div');node.className='error-notice';setLocalizedText(node,()=>[state.lastErrorProfile?.name,state.lastErrorProfile?.model].filter(Boolean).join(' · ')+(state.lastErrorProfile?.name?'\n':'')+localizeError(state.lastError));region.append(node);}
  if(anchorPosition){const previous=[...region.querySelectorAll('[data-message-id]')].find(node=>node.dataset.messageId===anchorPosition.id);if(previous)region.scrollTop=previous.offsetTop-anchorPosition.offset;}
  if(scrollToEnd&&!state.hasNewer)follow.afterRender();renderLatestControl();
  state.historyImages=createHistoryImages({store:state.store,root:region,onImageReady:()=>{if(!state.hasNewer)follow.afterRender();}});state.historyImages.mount();renderRunControls();
}
function renderRunControls(){const deleting=!!state.current&&!!state.sessionActions?.isDeleting(state.current.id);$('#send-message').disabled=state.submitting||deleting;for(const action of $$('[data-execute-plan]'))action.disabled=state.running||state.submitting||deleting;const paused=Boolean(state.current?.promptState?.runResume||(!!state.current?.id&&state.capturePaused===state.current.id));const button=$('#resume-run');button.hidden=state.running||!paused;button.disabled=state.submitting||deleting;button.textContent=t(capture.active?'interaction.resume':'interaction.startSharing');$('#run-status').hidden=!state.running&&!paused;if(!state.running&&paused)$('#run-status').textContent=t('interaction.paused');updateModeDescription();}
function setRunning(running) { state.running=running;if($('#reasoning-select'))$('#reasoning-select').disabled=running||state.submitting; $('#send-message').hidden=running; $('#stop-run').hidden=!running; $('#model-select').disabled=running; if(!running)$('#run-status').textContent='';renderRunControls(); }
function onHarnessEvent(event) {
  if(event.type==='session.title'){if(state.current?.id===event.sessionId){state.current.title=event.title;$('#session-title').textContent=event.title;}void refreshSessions().catch(report);return;}
  if((event.internal||event.message?.internal)&&!state.settings.developerMode)return;
  if(event.type==='status') { if(event.status==='paused')state.capturePaused=state.current?.id;$('#run-status').textContent=event.status==='paused'?t('interaction.paused'):event.status==='returning_to_harness'?t('taskSettings.returning'):({awaiting_model:'正在等待模型回复…',compacting:'正在整理上下文…',executing:'正在处理工具请求…',completed:'本轮已完成',needs_user:'需要补充信息或连接设备',unknown:'操作结果待核对',budget_exhausted:'达到本轮预算，进度已保存',cancelled:'已停止',failed:'本轮未完成'})[event.status]||event.status; }
  if(event.type==='delta') { state.pending=(state.pending||'')+event.text;if(state.hasNewer){renderLatestControl();return;}const body=$('.message.pending .message-body');if(body){body.textContent=state.pending;conversationFollow().afterRender();}else renderMessages(); }
  if(event.type==='message' && event.message) { const message=event.message;if(message.role==='assistant')state.pending=null;if(message.role==='user'&&!message.internal)conversationFollow().follow();if(!conversationFollow().following&&(message.role!=='user'||message.internal)){applyHistory(historyWindow().deferNewer());renderLatestControl();return;}applyHistory(historyWindow().append(message));renderMessages(); }
  if(event.type==='error') { state.lastError=localizeError(event.message);renderMessages(); }
}
async function resumeRun(){
  if(state.running||state.submitting||!state.current||state.sessionActions?.isDeleting(state.current.id))return;
  // Start capture directly from this trusted click before storage/network awaits.
  const sharing=capture.active?Promise.resolve():capture.start();
  state.submitting=true;let resolveCompletion;state.runCompletion=new Promise(resolve=>{resolveCompletion=resolve;});let generation=null;const sessionId=state.current.id;
  try{await sharing;if(!await state.devicePanel.ensureReady()){await showDevices();return;}generation=++state.runGeneration;state.abort=new AbortController();state.lastError=null;state.capturePaused=false;setRunning(true);await state.harness.resume({sessionId,modelId:$('#model-select').value,signal:state.abort.signal});}
  catch(error){state.lastError=error;}
  finally{try{if(generation===null||generation===state.runGeneration){const session=await state.store.getSession(sessionId);if((generation===null||generation===state.runGeneration)&&state.current?.id===sessionId){state.current=session;applyHistory(historyWindow().snapshot());renderMessages();}}}finally{if(generation===null||generation===state.runGeneration){state.abort=null;state.submitting=false;setRunning(false);}renderRunControls();renderReasoningOptions();resolveCompletion?.();}}
}
async function sendMessage(event,textOverride=null,modeOverride=null) {
  event.preventDefault();if(!getBrowserCompatibility().supportedForHarness){renderPlatform();return;}const text=(textOverride===null?$('#message-input').value:textOverride).trim();if(!text||state.running||state.submitting||(state.current&&state.sessionActions?.isDeleting(state.current.id)))return;
  const draftGeneration=state.current?null:state.sessionOpenGeneration;
  const sharing=capture.active||!deviceSessionAvailable()||!selectedProvider()?Promise.resolve():capture.start();
  if(state.composerDraftActive)rememberComposerDraft();state.submitting=true;renderRunControls();let resolveCompletion;state.runCompletion=new Promise(resolve=>{resolveCompletion=resolve;});let generation=null,sessionId=null,controller=null,firstMessageId=null,firstSendGeneration=draftGeneration;
  const startupCurrent=()=>draftGeneration===null||(firstSendGeneration===state.sessionOpenGeneration&&(sessionId?state.current?.id===sessionId:!state.current));
  try{
    await sharing;if(!startupCurrent())return;const ready=await state.devicePanel?.ensureReady?.();if(!startupCurrent())return;if(!state.current&&!ready){await showDevices();toast(t('device.startHint'));return;}
    if(!selectedProvider()){await showSettings('accounts');toast(t('status.configureModel'));return;}
    if(!state.current&&(draftGeneration!==state.sessionOpenGeneration||!capture.active)){if(draftGeneration===state.sessionOpenGeneration)toast(t('interaction.startSharing'));return;}
    const mode='auto',modelId=$('#model-select').value;
    if(!state.current){
      const draft=state.composerDraft||{reasoningEfforts:{}};
      const created=await state.store.createSessionWithMessage({title:t('session.new'),titleState:'pending',mode,modelId,reasoningEfforts:{...draft.reasoningEfforts}},text);
      // The first message already exists durably. Remember its session before
      // any view/storage work that can fail; retry must never create it again.
      sessionId=created.session.id;firstMessageId=created.message.id;state.current=created.session;state.composerDraftActive=false;state.composerDraft=null;state.archived=false;clearComposerDraft();state.messages=[created.message];state.hasOlder=state.hasNewer=false;
      const remaining=textOverride===null&&$('#message-input').value.trim()!==text?$('#message-input').value:'';$('#message-input').value=remaining;state.drafts.set(sessionId,remaining);resizeInput();
      if(draftGeneration!==state.sessionOpenGeneration){await refreshSessions();return;}
      const opening=openSession(sessionId,{fromSubmit:true,replaceDraft:true});firstSendGeneration=state.sessionOpenGeneration;
      const opened=await opening;if(opened?.id!==sessionId||!startupCurrent())return;
      await refreshSessions();if(!startupCurrent())return;
    }
    if(!state.current||!startupCurrent())return;
    sessionId=state.current.id;if(state.hasNewer){await showLatestConversation();if(!startupCurrent())return;}conversationFollow().follow();await state.store.updateSession(sessionId,{mode,modelId});if(!startupCurrent())return;
    state.capturePaused=false;generation=++state.runGeneration;controller=new AbortController();state.abort=controller;state.lastError=null;state.lastErrorProfile={name:selectedProvider()?.name||selectedProvider()?.id||'',model:selectionParts($('#model-select').value).modelId};state.pending=null;setRunning(true);$('#run-status').textContent=t('status.preparing');
    if(textOverride===null&&$('#message-input').value.trim()===text){$('#message-input').value='';state.drafts.delete(sessionId);resizeInput();}
    await state.skillSync;if(!startupCurrent())return;await state.harness.run({sessionId,text,mode,modelId,...(firstMessageId?{firstMessageId}:{}),signal:controller.signal});
  }catch(error){
    if(generation!==null&&generation===state.runGeneration||firstMessageId&&startupCurrent()){state.lastError=error;if(generation===null){$('#session-title').textContent=state.current.title;$('#session-menu').hidden=false;state.navigation?.go({route:'harness',screen:'session',sessionId,panel:null,action:null},{replace:true});await refreshSessions().catch(report);if(startupCurrent())renderMessages();}}
    else report(error);
  }finally{
    try{
      if(generation!==null&&generation===state.runGeneration){
        const session=await state.store.getSession(sessionId);
        if(generation===state.runGeneration&&state.current?.id===sessionId){state.pending=null;applyHistory(historyWindow().snapshot());state.current=session;$('#session-title').textContent=session.title;await refreshSessions();renderMessages();}
      }
    }finally{if(generation!==null&&generation===state.runGeneration){state.abort=null;state.submitting=false;setRunning(false);}state.submitting=false;renderRunControls();renderReasoningOptions();resolveCompletion?.();}
  }
}

function renderClipboard(){
  state.clipboardView?.destroy();if(!state.current)return;
  state.clipboardView=mountClipboardPanel($('#clipboard-panel'),{controller:clipboard,deviceClipboard,sessionId:state.current.id,continueAfterCopy:true,onCopied:async receipt=>{
    try{
      await state.store.addEvent(receipt.sessionId,{type:'clipboard.copied',payload:receipt});
      const completion=state.runCompletion;if(completion)await completion;
      if(state.current?.id!==receipt.sessionId||clipboard.getSnapshot()?.requestId!==receipt.requestId||deviceStatus().targetId!==receipt.targetId)return;
      await sendMessage({preventDefault(){}},t('clipboard.continueTask'),'task');
    }catch(error){report(error);throw error;}
  }});
}
function resizeInput() { const input=$('#message-input');input.style.height='auto';input.style.height=Math.min(input.scrollHeight,180)+'px'; }
function discardProviderDraft(){state.providerSaveAbort?.abort();state.providerSaveAbort=null;state.codexLoginUI?.dispose();state.codexLoginUI=null;const id=state.providerDraftId;if(id&&!providers().some(profile=>profile.id===id)){removeCodexAccount(id);setCredential(id,'');}state.providerDraftId=null;}
function panel(title,subtitle,body,metadata={}) { state.navigation?.go({panel:state.nextPanelView||{kind:'settings',section:'home'},action:null},{replace:state.nextPanelView?.kind==='skills'&&state.navigation?.current.panel?.kind==='skills'});state.nextPanelView=null; state.panelGeneration=(state.panelGeneration||0)+1;state.codexAbort?.abort();state.modelsAbort?.abort();discardProviderDraft(); state.devicePanel?.dispose();state.mcpPanel?.disposeView();const titleKey=Object.hasOwn(metadata,'titleKey')?metadata.titleKey:translationKey(title),subtitleKey=Object.hasOwn(metadata,'subtitleKey')?metadata.subtitleKey:translationKey(subtitle);$('#panel-content').innerHTML=`<div class="panel-header"><div><h2 data-no-i18n${titleKey?` data-i18n="${escapeHTML(titleKey)}"`:''}>${escapeHTML(title)}</h2>${subtitle?`<p data-no-i18n${subtitleKey?` data-i18n="${escapeHTML(subtitleKey)}"`:''}>${escapeHTML(subtitle)}</p>`:''}</div><button class="icon-button" id="close-panel" aria-label="关闭"><span class="ui-icon ui-icon-close" aria-hidden="true"></span></button></div><div class="panel-body">${body}</div>`;$('#close-panel').onclick=()=>{state.panelGeneration=(state.panelGeneration||0)+1;state.devicePanel?.dispose();state.codexAbort?.abort();state.modelsAbort?.abort();if(state.navigation)void state.navigation.back({panel:null,action:null});else $('#panel-dialog').close();};showPanelSurface($('#panel-dialog'));if(document.body.classList.contains('panel-route'))window.scrollTo(0,0);$('.panel-body').scrollTop=0;$('#close-panel').focus({preventScroll:true}); }
function setPanelStatus(message,bad=false) { const box=$('#panel-status');if(box){setLocalizedText(box,()=>localizeError(message));box.classList.toggle('bad',bad);box.hidden=false;} }

async function showSessionMenu() {
  if(!state.current)return;const session=state.current;state.navigation?.go({action:{kind:'session-menu'},panel:null});
  $('#action-content').innerHTML=`<h3 data-no-i18n data-i18n="session.actions">${t('session.actions')}</h3><button class="action-item" data-action="rename">重命名</button><button class="action-item" data-action="pin">${session.pinned?'取消置顶':'置顶会话'}</button><button class="action-item" data-action="copy">复制会话 ID</button><button class="action-item" data-action="export">导出会话</button><button class="action-item" data-action="archive">${session.archived?'取消归档':'归档会话'}</button><button class="action-item danger" data-action="delete">删除会话</button><button class="action-item" data-action="cancel">取消</button>`;
  $$('[data-action]').forEach(button=>button.onclick=guard(async()=>{ const action=button.dataset.action;closeNavigationDialog($('#action-dialog'));if(action!=='rename'&&state.navigation)await state.navigation.back({action:null});
    if(action==='rename'){showRenameDialog(session);return;}
    await performSessionAction(action==='archive'&&session.archived?'restore':action,session);
  }));$('#action-dialog').showModal();
}

function showRenameDialog(session,{fromList=false}={}) {
  state.navigation?.go({action:{kind:'rename',sessionId:session.id,fromList},panel:null},{replace:state.navigation?.current.action?.kind==='session-menu'});
  $('#action-content').innerHTML=`<form id="rename-form" style="padding:8px 12px 13px"><h3 style="margin-left:0" data-no-i18n data-i18n="session.renameTitle">${t('session.renameTitle')}</h3><label class="field"><span>名称</span><input id="rename-input" value="${escapeHTML(session.title)}" maxlength="160" required></label><div class="panel-actions"><button class="primary" type="submit">保存</button><button id="cancel-rename" type="button" class="secondary-button">取消</button></div></form>`;
  $('#cancel-rename').onclick=()=>$('#action-dialog').close();
  $('#rename-form').onsubmit=guard(async event=>{event.preventDefault();const title=$('#rename-input').value.trim();if(!title)return;await state.store.updateSession(session.id,{title,titleState:'manual'});if(state.navigation){closeNavigationDialog($('#action-dialog'));await state.navigation.back({action:null});}else $('#action-dialog').close();if(state.current?.id===session.id){state.current.title=title;$('#session-title').textContent=title;}await refreshSessions();if(!fromList&&state.current?.id!==session.id)await openSession(session.id);});
  $('#action-dialog').showModal();$('#rename-input').focus();$('#rename-input').select();
}

async function requestStorageProtection({notify=false}={}) {
  if(!navigator.storage?.persist)return false;
  try {const granted=await navigator.storage.persisted?.()||await navigator.storage.persist();if(notify)toast(()=>t(granted?'settings.persistGranted':'settings.persistDenied'));return granted;}
  catch(error){if(notify)toast(error);return false;}
}
function importSessionFile(){
  if(state.running||state.submitting){toast(t('session.stopBeforeImport'));return;}
  const input=$('#file-input');input.value='';input.accept='.json,application/json';input.onchange=guard(async()=>{const file=input.files[0];if(!file)return;const session=await restoreSessionFile(state.store,file,{titleSuffix:t('session.importSuffix'),fallbackTitle:t('session.importFallback')});await refreshSessions();await openSession(session.id);toast(t('status.sessionImported'));});input.click();
}
function panelBack(action){
  const header=$('.panel-header');const close=$('#close-panel');if(close)close.hidden=true;header.insertAdjacentHTML('afterbegin',`<button type="button" id="panel-back" class="icon-button" aria-label="${escapeHTML(t('common.back'))}"><span class="ui-icon ui-icon-back" aria-hidden="true"></span></button>`);$('#panel-back').onclick=guard(()=>state.navigation?state.navigation.back({panel:{kind:'settings',section:'home'},action:null}):action());
}
async function showSettings(section='home') {
  if(typeof section!=='string')section='home';
  state.codexAbort?.abort();state.modelsAbort?.abort();discardProviderDraft();
  if(!state.store)throw state.bootError||new Error(t('settings.storageRequired'));
  const navigation=state.panelGeneration=(state.panelGeneration||0)+1;const settings=await state.store.getSettings();if(navigation!==state.panelGeneration)return;state.settings=settings;const list=providers();const credentialStates=section==='accounts'?new Map(await Promise.all(list.map(async profile=>[profile.id,await inspectProviderCredential(state.store,profile,{settings,accountReady:hasCodexAccount(profile.id)})]))):new Map();if(navigation!==state.panelGeneration)return;state.nextPanelView={kind:'settings',section};state.providerEdit=null;
  const row=(id,key)=>`<button type="button" class="settings-row" id="${id}">${systemTextHTML(key)}<span class="ui-icon ui-icon-next" aria-hidden="true"></span></button>`;
  if(section==='home'){
    panel(t('nav.settings'),'',`<nav class="settings-navigation">
      <div class="settings-group">${row('settings-accounts','settings.accounts')}${row('settings-devices','nav.devices')}${row('open-skills','nav.skills')}${row('settings-mcp','mcp.title')}</div>
      <div class="settings-group">${row('settings-context','context.title')}${row('settings-location','location.title')}${row('settings-language','language.label')}${row('settings-storage','settings.localStorage')}</div>
      <div class="settings-group">${row('settings-behavior','taskSettings.title')}${row('import-session','session.import')}</div><label class="check-field"><input id="developer-mode" type="checkbox" ${settings.developerMode===true?'checked':''}>${systemTextHTML('providerRefinement.developer')}</label>
    </nav>`);
    $('#developer-mode').onchange=guard(async event=>{state.settings=await state.store.saveSettings({developerMode:event.target.checked});await refreshConversationPresentation();});
    for(const page of ['accounts','mcp','context','language','storage','behavior','location'])$('#settings-'+page).onclick=guard(()=>showSettings(page));
    $('#settings-devices').onclick=guard(async()=>{const opened=await showDevices();if(opened?.isConnected&&$('#panel-dialog').open&&$('#panel-content').contains(opened))panelBack(()=>showSettings());});
    $('#open-skills').onclick=guard(async()=>{state.skillsFromSettings=true;await showSkills();});
    $('#import-session').onclick=()=>{if(state.running||state.submitting){toast(t('session.stopBeforeImport'));return;}$('#panel-dialog').close();importSessionFile();};
    return;
  }
  if(section==='accounts'){
    panel(t('settings.accounts'),'',`    <div class="panel-actions" style="margin-top:8px"><button id="add-provider" class="secondary-button">${systemTextHTML('settings.addAccount')}</button></div>
    ${list.length?list.map(provider=>`<div class="provider-card"><div class="card-title"><span data-no-i18n>${escapeHTML(provider.name||provider.model||t('provider.unnamed'))}</span></div><div class="card-detail">${systemTextHTML(provider.protocol==='codex'?(provider.flow==='chatgpt-plan'?'siwc.accountType':'provider.codex'):provider.protocol==='anthropic'?'provider.anthropic':'provider.openai')} · <span data-model-count>${systemTextHTML('provider.modelCount',{count:profileModels(provider).length})}</span>${provider.baseUrl?`<br><span data-no-i18n>${escapeHTML(provider.baseUrl)}</span>`:''}${credentialStates.get(provider.id)?.status==='saved'?'':`<br>${systemTextHTML(credentialStates.get(provider.id)?.messageKey||'provider.noCredential')}`}</div><div class="provider-model-chips">${profileModels(provider).map(model=>`<span class="provider-model-chip" data-no-i18n title="${escapeHTML(model.id)}">${escapeHTML(model.name||model.id)}</span>`).join('')}</div><div class="provider-card-status quiet-note" data-provider-status="${escapeHTML(provider.id)}" role="status"></div><div class="card-actions"><button data-provider-edit="${escapeHTML(provider.id)}">${systemTextHTML('common.edit')}</button><button data-provider-refresh="${escapeHTML(provider.id)}">${systemTextHTML('providerRefinement.refreshModels')}</button><button class="danger" data-provider-delete="${escapeHTML(provider.id)}">${systemTextHTML('common.remove')}</button></div></div>`).join(''):`<div class="empty-card">${systemTextHTML('settings.noAccounts')}</div>`}
    <div id="provider-editor"></div>
<div id="panel-status" class="status-box" hidden></div>`);
  const accountsGeneration=state.panelGeneration;
  $('#add-provider').onclick=()=>renderProviderForm();
  $$('[data-provider-edit]').forEach(button=>button.onclick=()=>renderProviderForm(providers().find(provider=>provider.id===button.dataset.providerEdit)));
  $$('[data-provider-refresh]').forEach(button=>button.onclick=guard(async()=>{
    if(button.disabled)return;state.modelsAbort?.abort();const controller=new AbortController();state.modelsAbort=controller;
    const id=button.dataset.providerRefresh,profile=providers().find(item=>item.id===id),card=button.closest('.provider-card'),status=card.querySelector('[data-provider-status]');
    const current=()=>accountsGeneration===state.panelGeneration&&button.isConnected&&$('#panel-dialog').open&&!controller.signal.aborted;
    button.disabled=true;setLocalizedText(status,()=>t('provider.modelsLoading'));
    try{
      const credential=profile.protocol==='codex'?'':await resolveProviderCredential(state.store,profile,{settings:state.settings});if(!current())return;
      const found=profile.protocol==='codex'?await discoverCodexModels({accountId:profile.id,relayUrl:profile.subscriptionRelayUrl,signal:controller.signal}):await discoverModels({protocol:profile.protocol,baseUrl:profile.baseUrl,credential,signal:controller.signal});
      if(!current())return;if(!Array.isArray(found)||!found.length)throw new Error(t('providerRefinement.noModels'));
      const latest=(await state.store.getSettings()).providers?.find(item=>item.id===id);if(!current())return;
      const connection=value=>JSON.stringify([value?.protocol,value?.baseUrl||'',value?.flow||'',value?.clientId||'',value?.subscriptionRelayUrl||'']);
      if(!latest||connection(latest)!==connection(profile))return;
      const models=found.map(model=>({id:model.id,name:model.name||model.id,...modelContextMetadata(model),...modelReasoningMetadata(model)}));
      const settings=await state.store.updateProviderModels(id,models,{expectedConnection:profile});if(!current())return;state.settings=settings;if(connection(settings.providers?.find(item=>item.id===id))!==connection(profile))throw new Error(t('providerRefinement.connectionChanged'));renderModelOptions();const catalog=profileModels(settings.providers.find(item=>item.id===id));card.querySelector('.provider-model-chips').innerHTML=catalog.map(model=>`<span class="provider-model-chip" data-no-i18n title="${escapeHTML(model.id)}">${escapeHTML(model.name||model.id)}</span>`).join('');setLocalizedText(card.querySelector('[data-model-count]'),()=>t('provider.modelCount',{count:catalog.length}));setLocalizedText(status,()=> '');
    }catch(error){if(current())setLocalizedText(status,()=>t('common.failed',{detail:localizeError(error)}));}
    finally{if(button.isConnected){button.disabled=false;if(controller.signal.aborted&&accountsGeneration===state.panelGeneration)setLocalizedText(status,()=> '');}}
  }));
  $$('[data-provider-delete]').forEach(button=>button.onclick=guard(async()=>{if(!confirm(t('confirm.removeProvider')))return;state.settings=await state.store.removeProvider(button.dataset.providerDelete);setCredential(button.dataset.providerDelete,'');removeCodexAccount(button.dataset.providerDelete);renderModelOptions();if(accountsGeneration===state.panelGeneration)await showSettings('accounts');}));
  }else if(section==='mcp'){
    panel(t('mcp.title'),'','<div id="mcp-settings" class="standalone-mcp"></div>');
    state.mcpPanel.mount($('#mcp-settings'),{servers:state.settings.mcpServers,endpoint:state.settings.mcpEndpoint||''});$('#mcp-settings details').open=true;
  }else if(section==='location'){
    panel(t('location.title'),'','<div id="location-settings"></div>');
    state.locationAccess ||= createLocationAccess({getSettings:()=>state.store.getSettings()});
    await mountLocationSettings($('#location-settings'),{store:state.store,access:state.locationAccess,onSave:settings=>{state.settings=settings;},onError:toast});
    if(navigation!==state.panelGeneration)return;
  }else if(section==='behavior'){
    panel(t('taskSettings.title'),'',`<label class="check-field"><input id="return-to-harness" type="checkbox" ${settings.returnToHarness!==false?'checked':''}>${systemTextHTML('taskSettings.return')}</label>`);
    $('#return-to-harness').onchange=guard(async event=>{state.settings=await state.store.saveSettings({returnToHarness:event.target.checked});});
  }else if(section==='context'){
    const context=normalizeContextSettings(state.settings.context),images=normalizeImageSettings(state.settings.images);
    panel(t('context.title'),'',`<form id="context-form">
      <label class="check-field"><input name="autoCompact" type="checkbox" ${context.autoCompact?'checked':''}>${systemTextHTML('context.auto')}</label>
      <label class="field"><span>${systemTextHTML('context.trigger')}</span><input name="triggerTokens" type="number" min="2048" max="2000000" step="1" value="${escapeHTML(context.triggerTokens)}" required></label>
      <label class="field"><span>${systemTextHTML('context.quality')}</span><select name="qualityPreset">${['compact','balanced','high'].map(value=>`<option data-no-i18n data-i18n="images.${value}" value="${value}" ${images.qualityPreset===value?'selected':''}>${t('images.'+value)}</option>`).join('')}</select></label>
      <button class="primary" type="submit">${systemTextHTML('common.save')}</button><div id="context-result" class="quiet-note" role="status"></div>
    </form>`);
  const contextForm=$('#context-form'),contextResult=$('#context-result');contextForm.onsubmit=guard(async event=>{event.preventDefault();const values=new FormData(event.target);const context={schemaVersion:2,autoCompact:values.has('autoCompact'),triggerTokens:Number(values.get('triggerTokens'))};normalizeContextSettings(context);const images=normalizeImageSettings({qualityPreset:values.get('qualityPreset')});state.settings=await state.store.saveSettings({context,images});if($('#context-form')===contextForm)setLocalizedText(contextResult,()=>t('context.saved'));});
  }else if(section==='language'){
    panel(t('language.label'),'',languageField());wireLanguageSelector();
  }else if(section==='storage'){
    panel(t('settings.localStorage'),'',`<div id="storage-status" class="quiet-note"></div><div class="storage-meter"><span id="storage-fill"></span></div><button id="request-persistence" class="secondary-button" hidden>${systemTextHTML('settings.persist')}</button>`);
    $('#request-persistence').onclick=guard(async()=>{await requestStorageProtection({notify:true});await renderStorage();});
    panelBack(()=>showSettings());await renderStorage();return;
  }
  panelBack(()=>showSettings());
}
async function renderStorage() {
  const node=$('#storage-status');if(!node)return;
  try {const estimate=await navigator.storage?.estimate?.(),persisted=await navigator.storage?.persisted?.();const mb=value=>(value/1024/1024).toFixed(1)+' MB';if($('#storage-status')!==node)return;node.textContent=estimate?t('settings.storageEstimate',{used:mb(estimate.usage||0),quota:mb(estimate.quota||0),mode:t(persisted?'settings.storagePersistent':'settings.storageBestEffort')}):t('settings.storageUnavailable');const fill=$('#storage-fill');if(fill&&estimate?.quota)fill.style.width=Math.min(100,100*estimate.usage/estimate.quota)+'%';const retry=$('#request-persistence');if(retry)retry.hidden=Boolean(persisted)||!navigator.storage?.persist;}
  catch{node.textContent=t('settings.storageUnavailable');}
}
function renderProviderForm(provider={}) {
  discardProviderDraft();state.codexAbort?.abort();state.modelsAbort?.abort();state.providerEditorToken=shortId();const editorToken=state.providerEditorToken;let modelSequence=0,unlockGeneration=0;state.providerEdit=provider.id||null;state.providerModels=profileModels(provider);
  const isCodex=()=>$('#provider-form')?.elements.protocol.value==='codex';
  const loginStatus=message=>{if(editorActive())setLocalizedText($('#codex-login-status'),()=>localizeError(message));};
  const modelsStatus=({key,variables={},error})=>{if(editorActive())setLocalizedText($('#models-status'),()=>error?t('common.failed',{detail:localizeError(error)}):key?t(key,variables):'');};
  state.nextPanelView={kind:'provider',id:provider.id||null};panel(t(provider.id?'provider.edit':'provider.add'),'', '<div id="provider-editor"></div>');
  $('#provider-editor').innerHTML=`<form id="provider-form" class="provider-form" autocomplete="off"><label class="field"><span>显示名称</span><input name="name" placeholder="例如：DeepSeek · 个人账号" value="${escapeHTML(provider.name)}" required maxlength="80"></label><label class="field"><span>账号接口</span><select name="protocol"><option value="openai" ${!['anthropic','codex'].includes(provider.protocol)?'selected':''}>OpenAI 风格 API</option><option value="anthropic" ${provider.protocol==='anthropic'?'selected':''}>Anthropic 风格 API</option><option value="codex" ${provider.protocol==='codex'?'selected':''}>${systemTextHTML('siwc.accountType')}</option></select></label><label class="field" id="provider-endpoint-field"><span>${systemTextHTML('providerRefinement.endpoint')}</span><input name="baseUrl" type="url" inputmode="url" autocapitalize="none" spellcheck="false" placeholder="https://api.example.com/v1" value="${escapeHTML(provider.baseUrl)}"></label><div id="codex-controls" class="provider-auth-section"><p class="quiet-note" id="codex-legacy-note" hidden>${systemTextHTML('siwc.legacy')}</p><div class="provider-auth-overview"><div class="panel-actions provider-auth-actions"><button id="start-codex-login" class="secondary-button" type="button">${systemTextHTML('siwc.start')}</button><button id="cancel-codex-login" class="secondary-button" type="button" hidden>${systemTextHTML('siwc.cancel')}</button></div><div id="codex-login-status" class="quiet-note provider-auth-status" role="status">${systemTextHTML(provider.id&&hasCodexAccount(provider.id)?'auth.loggedIn':'auth.loggedOut')}</div></div><div id="codex-verification"></div><label class="field" id="codex-callback-field" hidden><span id="codex-callback-label"></span><textarea id="codex-callback" rows="3" maxlength="32768" autocomplete="off" autocapitalize="none" spellcheck="false"></textarea><small id="codex-callback-help"></small></label><button id="complete-codex-login" class="secondary-button" type="button" hidden>${systemTextHTML('siwc.finish')}</button><div id="subscription-relay-settings" class="provider-advanced-settings"><details><summary>${systemTextHTML('siwc.relayAdvanced')}</summary><p class="quiet-note">${systemTextHTML('siwc.relayHelp')}</p><label class="field"><span>${systemTextHTML('siwc.relayLabel')}</span><input name="subscriptionRelayUrl" type="url" inputmode="url" autocapitalize="none" spellcheck="false" value="${escapeHTML(provider.subscriptionRelayUrl)}" placeholder="${escapeHTML(SITE_CONFIG.subscriptionRelayUrl)}"></label></details></div></div><label class="field"><span>${systemTextHTML('providerRefinement.defaultModel')}</span><div class="provider-model-picker"><input name="model" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="${escapeHTML(t('providerRefinement.modelPlaceholder'))}" value="${escapeHTML(provider.model)}"><select id="provider-model-choice" name="modelChoice" class="provider-model-choice" aria-label="${escapeHTML(t('providerRefinement.chooseModel'))}" ${state.providerModels.length?'':'disabled'}><option value="">${systemTextHTML('providerRefinement.chooseModel')}</option>${state.providerModels.map(model=>`<option data-no-i18n value="${escapeHTML(model.id)}" ${model.id===provider.model?'selected':''}>${escapeHTML(model.name||model.id)}</option>`).join('')}</select><span class="provider-model-arrow" aria-hidden="true"></span></div></label><div class="panel-actions" style="margin-top:-4px"><button id="discover-models" class="secondary-button" type="button">获取模型</button></div><div id="models-status" class="quiet-note" role="status"></div><label class="field" id="provider-secret-field"><span>API 密钥</span><input name="secret" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="${provider.id&&hasCredential(provider.id)?t('providerRefinement.secretSaved'):t('providerRefinement.secretPlaceholder')}"></label>${state.settings.credentialVault?.[provider.id]&&!hasCredential(provider.id)&&!hasCodexAccount(provider.id)?`<details class="provider-legacy"><summary>${systemTextHTML('providerRefinement.legacyHelp')}</summary><label class="field"><span>本地解锁口令</span><input name="passphrase" type="password" autocomplete="off"></label><button id="unlock-provider" type="button" class="secondary-button">解锁已有凭据</button></details>`:''}<label class="check-field" id="provider-stream-field"><input name="stream" type="checkbox" ${provider.stream!==false?'checked':''}> 流式接收回复</label><div class="panel-actions"><button class="primary" type="submit">${systemTextHTML('providerRefinement.save')}</button></div></form>`;
  const editorForm=$('#provider-form');editorForm.addEventListener('submit',event=>event.preventDefault());const editorActive=()=>state.providerEditorToken===editorToken&&$('#provider-form')===editorForm&&$('#panel-dialog').open;
  editorForm.elements.modelChoice.onchange=()=>{if(editorForm.elements.modelChoice.value)editorForm.elements.model.value=editorForm.elements.modelChoice.value;};editorForm.elements.model.oninput=()=>{editorForm.elements.modelChoice.value=state.providerModels.some(model=>model.id===editorForm.elements.model.value)?editorForm.elements.model.value:'';};
  const invalidateModels=()=>{modelSequence++;state.modelsAbort?.abort();state.providerModels=[];if($('#discover-models'))$('#discover-models').disabled=isCodex()&&(!provider.id||!hasCodexAccount(provider.id));modelsStatus({});editorForm.elements.modelChoice.innerHTML=`<option value="">${escapeHTML(t('providerRefinement.chooseModel'))}</option>`;editorForm.elements.modelChoice.disabled=true;};
  editorForm.elements.baseUrl.addEventListener('input',invalidateModels);editorForm.elements.subscriptionRelayUrl.addEventListener('input',invalidateModels);
  const protocolChanged=(initial=false)=>{if(!initial){invalidateModels();unlockGeneration++;if($('#unlock-provider'))$('#unlock-provider').disabled=false;}if(!initial)state.codexLoginUI?.cancel({quiet:true});state.codexAbort?.abort();const codex=isCodex(),form=$('#provider-form');$('#provider-endpoint-field').hidden=codex;form.elements.baseUrl.placeholder=form.elements.protocol.value==='anthropic'?'https://api.example.com':'https://api.example.com/v1';form.elements.baseUrl.required=!codex;form.elements.baseUrl.disabled=codex;form.elements.model.required=!codex;form.elements.subscriptionRelayUrl.disabled=!codex;$('#subscription-relay-settings').hidden=!codex||Boolean(provider.id&&providers().some(item=>item.id===provider.id)&&(getCodexAccount(provider.id)?.flow||provider.flow)!=='chatgpt-plan');form.elements.subscriptionRelayUrl.disabled=$('#subscription-relay-settings').hidden;$('#provider-secret-field').hidden=codex;form.elements.secret.disabled=codex;$('#provider-stream-field').hidden=codex;$('#codex-controls').hidden=!codex;$('#discover-models').disabled=codex&&(!provider.id||!hasCodexAccount(provider.id));$('#complete-codex-login').hidden=true;$('#cancel-codex-login').hidden=true;$('#codex-verification').replaceChildren();$('#start-codex-login').disabled=false;};
  $('#provider-form').elements.protocol.onchange=()=>protocolChanged(false);protocolChanged(true);
  const applyModels=async (list,{sequence=modelSequence,relayUrl}={})=>{
    const current=()=>editorActive()&&sequence===modelSequence&&(relayUrl===undefined||editorForm.elements.subscriptionRelayUrl.value===relayUrl);if(!current())return;
    if(!Array.isArray(list)||!list.length)throw new Error('接口没有返回可用模型，可继续手动填写。');
    const models=list.map(model=>({id:model.id,name:model.name||model.id,...modelContextMetadata(model),...modelReasoningMetadata(model)}));
    const form=editorForm;
    const savedProfile=providers().find(item=>item.id===provider.id),protocol=form.elements.protocol.value;
    const sameConnection=savedProfile&&protocol===savedProfile.protocol&&(protocol==='codex'?((getCodexAccount(provider.id)?.flow||provider.flow)==='chatgpt-plan'?normalizeSubscriptionRelay(form.elements.subscriptionRelayUrl.value)===normalizeSubscriptionRelay(savedProfile.subscriptionRelayUrl):true):normalizeProviderEndpoint(form.elements.baseUrl.value.trim())===normalizeProviderEndpoint(savedProfile.baseUrl));
    if(sameConnection){
      state.settings=await state.store.updateProviderModels(provider.id,models,{expectedConnection:savedProfile});
      if(!current())return;const latest=state.settings.providers?.find(item=>item.id===provider.id);if(!latest||['protocol','baseUrl','flow','clientId','subscriptionRelayUrl'].some(key=>(latest[key]||'')!==(savedProfile[key]||'')))throw new Error(t('providerRefinement.connectionChanged'));renderModelOptions();
    }
    if(!current())return;state.providerModels=models;
    if(!form.elements.model.value)form.elements.model.value=models[0].id;
    if(form.elements.modelChoice){form.elements.modelChoice.innerHTML=`<option value="">${escapeHTML(t('providerRefinement.chooseModel'))}</option>`+models.map(model=>`<option data-no-i18n value="${escapeHTML(model.id)}">${escapeHTML(model.name||model.id)}</option>`).join('');form.elements.modelChoice.disabled=false;form.elements.modelChoice.value=models.some(model=>model.id===form.elements.model.value)?form.elements.model.value:'';}
    modelsStatus({});
  };
  $('#discover-models').onclick=guard(async()=>{if(isCodex()&&(!provider.id||!hasCodexAccount(provider.id)))return;const button=$('#discover-models'),form=editorForm;state.modelsAbort?.abort();const controller=new AbortController();state.modelsAbort=controller;const sequence=++modelSequence,relayUrl=editorForm.elements.subscriptionRelayUrl.value;button.disabled=true;modelsStatus({key:'provider.modelsLoading'});try{const list=isCodex()?await discoverCodexModels({accountId:provider.id,signal:controller.signal,relayUrl}):await discoverModels({protocol:form.elements.protocol.value,baseUrl:safeURL(form.elements.baseUrl.value.trim()),credential:form.elements.secret.value.trim()||await resolveProviderCredential(state.store,{...provider,protocol:form.elements.protocol.value},{settings:state.settings}),signal:controller.signal});if(!editorActive()||sequence!==modelSequence||controller.signal.aborted)return;await applyModels(list,{sequence,relayUrl:isCodex()?relayUrl:undefined});}catch(error){if(editorActive()&&sequence===modelSequence&&!controller.signal.aborted)modelsStatus({error});}finally{if(editorActive()&&sequence===modelSequence)button.disabled=false;}});

  const legacyConnection=()=>Boolean(provider.id&&providers().some(item=>item.id===provider.id)&&(getCodexAccount(provider.id)?.flow||provider.flow)!=='chatgpt-plan');
  $('#codex-legacy-note').hidden=!legacyConnection();
  if(provider.id&&!providers().some(item=>item.id===provider.id))state.providerDraftId=provider.id;
  state.codexLoginUI=mountCodexLogin({root:editorForm,getProvider:()=>({...provider,name:editorForm.elements.name.value.trim()||provider.name}),isActive:()=>editorActive()&&isCodex(),isSignedIn:()=>Boolean(provider.id&&hasCodexAccount(provider.id)),status:loginStatus,onController:controller=>{state.codexAbort=controller;},start:startCodexLogin,validate:validateCodexCallback,complete:completeCodexLogin,onRegistration:clientId=>{provider={...provider,registrationClientId:clientId};},
    prepareProvider:async()=>{
      const prepared=prepareCodexSignInProfile({provider,account:provider.id?getCodexAccount(provider.id):null,saved:providers().some(item=>item.id===provider.id),label:editorForm.elements.name.value.trim(),newId:shortId});provider=prepared.provider;
      if(prepared.independent){
        invalidateModels();const id=provider.id;state.providerEdit=id;state.providerDraftId=id;state.providerModels=[];editorForm.elements.name.value=provider.name;editorForm.elements.model.value='';editorForm.elements.modelChoice.value='';editorForm.elements.modelChoice.disabled=true;$('#codex-legacy-note').hidden=true;$('#subscription-relay-settings').hidden=false;editorForm.elements.subscriptionRelayUrl.disabled=false;state.navigation?.go({panel:{kind:'provider',id},action:null},{replace:true});
      }
      return prepared;
    },
    onSuccess:async(account,signal)=>{$('#discover-models').disabled=false;provider={...provider,flow:account.flow,clientId:account.clientId};const sequence=modelSequence,relayUrl=editorForm.elements.subscriptionRelayUrl.value;try{const list=await discoverCodexModels({accountId:provider.id,signal,relayUrl});if(!editorActive()||signal.aborted||sequence!==modelSequence||editorForm.elements.subscriptionRelayUrl.value!==relayUrl)return;await applyModels(list,{sequence,relayUrl});}catch(error){if(editorActive()&&!signal.aborted&&sequence===modelSequence&&editorForm.elements.subscriptionRelayUrl.value===relayUrl)modelsStatus({error});}}
  });

  if($('#unlock-provider'))$('#unlock-provider').onclick=guard(async()=>{
    const form=editorForm,button=$('#unlock-provider');if(!editorActive()||button.disabled)return;
    const generation=++unlockGeneration,protocol=form.elements.protocol.value,passphrase=form.elements.passphrase.value,id=provider.id;
    const current=()=>editorActive()&&generation===unlockGeneration&&form.elements.protocol.value===protocol;
    button.disabled=true;
    try{
      const value=await unsealCredentials(state.settings.credentialVault[id],passphrase);if(!current())return;
      if(protocol!=='codex'&&!value.apiKey)throw new Error('凭据内容无效');
      await saveProviderCredential(state.store,id,protocol==='codex'?{kind:'codex',tokens:value}:{kind:'api',apiKey:value.apiKey});if(!current())return;
      if(protocol==='codex'){registerCodexAccount(id,value);loginStatus(t('providerRefinement.signedIn'));}
      else{if(!value.apiKey)throw new Error('凭据内容无效');setCredential(id,value.apiKey);}
      form.elements.passphrase.value='';toast(t('providerRefinement.saved'));
    }catch{if(current()){const error=new Error('CREDENTIAL_UNLOCK_FAILED');error.code='CREDENTIAL_UNLOCK_FAILED';throw error;}}
    finally{if(current())button.disabled=false;}
  });
  $('#provider-form').onsubmit=guard(async event=>{
    event.preventDefault();if(!editorActive()||state.providerSavingToken===editorToken)return;
    state.providerSavingToken=editorToken;const saveController=new AbortController();state.providerSaveAbort=saveController;const submit=editorForm.querySelector('[type=submit]');if(submit)submit.disabled=true;
    try{
      const values=new FormData(event.target),id=state.providerEdit||shortId(),codex=values.get('protocol')==='codex';
      const updated={id,name:String(values.get('name')).trim(),protocol:values.get('protocol'),baseUrl:codex?'':normalizeProviderEndpoint(String(values.get('baseUrl')).trim()),model:String(values.get('model')||'').trim(),models:state.providerModels,...(provider.reasoningEffort?{reasoningEffort:provider.reasoningEffort}:{}),stream:codex?true:values.has('stream'),...(codex?{accountId:id}:{})};
      updated.models=profileModels(updated);
      const secret=String(values.get('secret')||'').trim()||getCredential(id),account=codex?getCodexAccount(id):null;if(codex&&account){updated.flow=account.flow;updated.clientId=account.clientId;if(account.flow==='chatgpt-plan')updated.subscriptionRelayUrl=String(values.get('subscriptionRelayUrl')||'').trim()?normalizeSubscriptionRelay(String(values.get('subscriptionRelayUrl'))):'';}
      const credential=codex?(account?{kind:'codex',tokens:account.exportTokens()}:null):secret?{kind:'api',apiKey:secret}:null;
      if(!editorActive())return;
      // Profile and credentials commit together; cancellation cannot leave a
      // credential-only draft or roll back another editor's completed save.
      state.settings=await state.store.saveProvider(updated,credential,{signal:saveController.signal});
      if(state.providerSaveAbort===saveController)state.providerSaveAbort=null;
      if(credential?.kind==='api')setCredential(id,credential.apiKey);
      if(state.providerDraftId===id)state.providerDraftId=null;
      event.target.elements.secret.value='';if(event.target.elements.passphrase)event.target.elements.passphrase.value='';renderModelOptions();
      if(editorActive()){if(state.navigation){state.navigation.go({panel:{kind:'provider',id},action:null},{replace:true});await state.navigation.back({panel:{kind:'settings',section:'accounts'},action:null});}else await showSettings('accounts');toast(t('providerRefinement.saved'));}
    }catch(error){if(saveController.signal.aborted&&!editorActive())return;throw error;}
    finally{if(state.providerSaveAbort===saveController)state.providerSaveAbort=null;if(state.providerSavingToken===editorToken)state.providerSavingToken=null;if(editorActive()&&submit)submit.disabled=false;}
  });
  const header=$('.panel-header');header.insertAdjacentHTML('afterbegin',`<button type="button" id="provider-back" class="icon-button" aria-label="${escapeHTML(t('providerRefinement.back'))}"><span class="ui-icon ui-icon-back" aria-hidden="true"></span></button>`);$('#provider-back').onclick=guard(()=>state.navigation?state.navigation.back({panel:{kind:'settings',section:'accounts'},action:null}):showSettings('accounts'));const close=header.querySelector('#close-panel');if(close)close.hidden=true;$('#provider-back').focus({preventScroll:true});$('.panel-body').scrollTop=0;
}

async function showDevices() {
  if(!state.store)throw state.bootError||new Error(t('settings.storageRequired'));
  if(!getBrowserCompatibility().supportedForHarness){$('#panel-dialog').close();navigate('harness');return;}
  const navigation=state.panelGeneration=(state.panelGeneration||0)+1;return state.devicePanel.open({isCurrent:()=>navigation===state.panelGeneration});
}
// The Harness owns each run's writer ID; the UI never creates a perpetual lease.
const runDevices=new Map();
function activeInputBridge(){return state.devicePanel?.getDevice()||null;}
function deviceStatus(){const value=state.devicePanel?.getState?.()||{};return {bridgeConnection:value.connected?'connected':'disconnected',bluetoothConnection:value.connected?(value.bluetoothConnected?'connected':'disconnected'):'unknown',inputVerified:Boolean(value.inputVerified),targetBound:Boolean(value.targetBound??value.ready??value.inputVerified),boardId:value.boardId||null,targetId:value.targetId||null};}
function requireInputBridge(){const device=activeInputBridge();if(!device){const status=deviceStatus(),code=status.bridgeConnection!=='connected'?'DEVICE_BRIDGE_UNAVAILABLE':status.bluetoothConnection!=='connected'?'DEVICE_BLUETOOTH_UNAVAILABLE':'DEVICE_BINDING_UNVERIFIED';const error=new Error(code);error.code=code;throw error;}return device;}
const deviceAdapter={
  submitSegment:(...args)=>requireInputBridge().submitSegment(...args),
  getResult:(...args)=>requireInputBridge().getResult(...args),
  release:(...args)=>requireInputBridge().release(...args),
  endRun:async options=>{const device=runDevices.get(options.writerId);runDevices.delete(options.writerId);return device?device.endRun(options):{status:'not_owned',leaseInvalidated:false};},
};
async function deviceContext(meta){
  const status=deviceStatus(),blocked={...status,identityVerified:false,bindingVerified:false,leaseVerified:false,executionEnabled:false,inputState:'unknown',orientationEpoch:capture.orientationEpoch};
  if(meta.mode==='chat')return {...chatExecutionContext(),...status};
  const device=activeInputBridge();if(!device)return blocked;
  runDevices.set(meta.runId,device);
  try{return {...await device.getExecutionContext({orientationEpoch:capture.orientationEpoch,writerId:meta.runId,allowClaim:meta.allowClaim===true,renewLease:true,signal:meta.signal}),...deviceStatus()};}
  catch(error){if(meta.signal?.aborted)throw error;await state.devicePanel?.ensureReady?.();return {...blocked,...deviceStatus(),executionError:error.code||'DEVICE_STATE_UNAVAILABLE'};}
}

async function creatorIdentity(){if(!state.identity)state.identity=await openCreatorIdentity();return state.identity;}
function ownedSkill(skill){return Boolean(state.identity&&isOwnedAuthored(skill,state.identity.creatorId));}
function sourceLabel(skill){return t(ownedSkill(skill)?'skills.sourceOwned':skill.source==='builtin'?'skills.sourceBuiltin':skill.source==='community'?'skills.sourceCommunity':'skills.sourceOther');}
async function showSkills(tab=state.skillTab) {
  if(!state.store)throw state.bootError||new Error(t('settings.storageRequired'));
  const navigation=state.panelGeneration=(state.panelGeneration||0)+1;state.skillTab=tab;const skills=await state.store.listSkills();await creatorIdentity();if(navigation!==state.panelGeneration)return;state.skills=skills;const local=tab==='local';
  state.nextPanelView={kind:'skills',tab};panel(t('nav.skills'),'',`
    <div class="panel-tabs"><button id="skills-local" class="${local?'active':''}">${t('skills.mine')} · ${state.skills.length}</button><button id="skills-catalog" class="${!local?'active':''}">${t('skills.catalog')}</button></div>
    ${local?`<div class="section-heading"><h3>${t('skills.local')}</h3><button id="create-skill">＋ ${t('skills.create')}</button></div><div class="panel-actions"><button id="import-skill" class="secondary-button">${t('skills.import')}</button><button id="creator-identity" class="secondary-button">${t('community.identity')}</button></div><div id="skill-list">${state.skills.length?state.skills.map(skill=>`<div class="skill-card"><div class="card-title">${skillTextHTML(skill,'name')}<span class="tag" data-no-i18n>${escapeHTML(skill.version||'local')}</span></div><div class="card-detail">${skillTextHTML(skill,'description')}<br><span class="skill-source">${sourceLabel(skill)}</span><br>${t(skill.enabled===false?'skills.disabled':'skills.enabled')}</div><div class="card-actions"><button data-skill-view="${escapeHTML(skill.id)}">${t('common.view')}</button>${ownedSkill(skill)?`<button data-skill-edit="${escapeHTML(skill.id)}">${t('common.edit')}</button>`:''}<button data-skill-toggle="${escapeHTML(skill.id)}">${t(skill.enabled===false?'common.enable':'common.disable')}</button><button data-skill-share="${escapeHTML(skill.id)}">${t('skills.share')}</button><button class="danger" data-skill-delete="${escapeHTML(skill.id)}">${t('common.remove')}</button></div></div>`).join(''):`<div class="empty-card">${t('community.empty')}</div>`}</div>`:`<div id="catalog-list"><p class="quiet-note">${t('community.loading')}</p></div>`}
    <div id="panel-status" class="status-box" hidden></div>`);
  if(state.skillsFromSettings)panelBack(()=>showSettings());
  $('#skills-local').onclick=guard(()=>showSkills('local'));$('#skills-catalog').onclick=guard(()=>showSkills('catalog'));
  if(local) {
    $('#create-skill').onclick=guard(()=>showSkillEditor());$('#creator-identity').onclick=guard(showCreatorIdentity);
    $('#import-skill').onclick=()=>chooseFile('.json,.md,.txt,text/markdown,application/json',async(text,name)=>{await importSkillFileToLibrary(text,name);await showSkills('local');toast(t('skills.saved'));});
    $$('[data-skill-delete]').forEach(button=>button.onclick=guard(async()=>{if(!confirm(t('confirm.removeSkill')))return;await state.store.deleteSkill(button.dataset.skillDelete);await showSkills('local');}));
    $$('[data-skill-toggle]').forEach(button=>button.onclick=guard(async()=>{const skill=state.skills.find(item=>item.id===button.dataset.skillToggle);await state.store.saveSkill({...skill,enabled:skill.enabled===false});await showSkills('local');}));
    $$('[data-skill-view]').forEach(button=>button.onclick=()=>viewSkill(state.skills.find(item=>item.id===button.dataset.skillView)));
    $$('[data-skill-edit]').forEach(button=>button.onclick=guard(()=>showSkillEditor(state.skills.find(item=>item.id===button.dataset.skillEdit))));
    $$('[data-skill-share]').forEach(button=>button.onclick=()=>shareSkill(state.skills.find(item=>item.id===button.dataset.skillShare)));
  } else await loadSkillMarket();
}
async function importSkillFileToLibrary(text,name){
  const identity=await creatorIdentity();
  try{return await importOwnSkillFile({store:state.store,identity,text,fileName:name});}
  catch(error){if(error.code!=='SKILL_NOT_OWNED')throw error;}
  const imported=/\.json$/i.test(name)?JSON.parse(text):{name:name.replace(/\.[^.]+$/,''),content:text};
  imported.content=imported.content||imported.instructions||imported.body;validateSkill(imported);
  const skill={id:'imported-'+shortId(),name:String(imported.name||imported.title||name),description:String(imported.description||''),content:imported.content,version:String(imported.version||'local'),resources:imported.resources||{},enabled:true,source:'community',readonly:true,provenance:{kind:'community',originalId:typeof imported.id==='string'?imported.id:'',importedAt:Date.now()}};
  await state.store.saveSkill(skill);return skill;
}
async function returnFromSkillPanel(){if(!isIOSPlatform()&&routeForPath(location.pathname)==='skills'){closeNavigationDialog($('#panel-dialog'));if(state.navigation)state.navigation.go({panel:null,action:null},{replace:true});await renderCommunityPage();return;}if(state.navigation)await state.navigation.back({panel:{kind:'skills',tab:'local'},action:null});else await showSkills('local');}
async function showSkillEditor(skill=null){
  if(!state.store)throw state.bootError||new Error(t('settings.storageRequired'));
  const identity=await creatorIdentity();if(skill&&!isOwnedAuthored(skill,identity.creatorId))throw Object.assign(new Error('SKILL_READ_ONLY'),{code:'SKILL_READ_ONLY'});
  state.nextPanelView={kind:'skill-editor',id:skill?.id||null};panel(t(skill?'skills.editOwn':'skills.create'),'',`<form id="skill-editor"><label class="field"><span>${t('skills.name')}</span><input name="name" value="${escapeHTML(skill?.name||'')}" required maxlength="120"></label><label class="field"><span>${t('skills.slug')}</span><input name="slug" value="${escapeHTML(skill?.provenance.slug||'')}" pattern="[a-z0-9][a-z0-9-]{0,63}" ${skill?'readonly':''} required autocapitalize="none" spellcheck="false"><small>${t('skills.slugHelp')}</small></label><label class="field"><span>${t('skills.summary')}</span><input name="description" value="${escapeHTML(skill?.description||'')}" maxlength="1000"></label><label class="field"><span>${t('skills.body')}</span><textarea name="content" rows="14" required data-no-i18n>${escapeHTML(skill?.content||'')}</textarea></label><div class="panel-actions"><button class="primary" type="submit">${t('common.save')}</button><button id="cancel-skill-editor" type="button" class="secondary-button">${t('common.cancel')}</button></div></form>`);
  $('#cancel-skill-editor').onclick=guard(returnFromSkillPanel);
  $('#skill-editor').onsubmit=guard(async event=>{event.preventDefault();const values=new FormData(event.target),input={name:String(values.get('name')).trim(),description:String(values.get('description')||'').trim(),content:String(values.get('content'))};if(skill)await updateAuthoredSkill({store:state.store,identity,id:skill.id,patch:input});else await createAuthoredSkill({store:state.store,identity,input:{...input,slug:String(values.get('slug')).trim()}});state.skills=await state.store.listSkills();await returnFromSkillPanel();toast(t('skills.saved'));});
}
async function showCreatorIdentity(){
  const identity=await creatorIdentity();state.nextPanelView={kind:'creator'};panel(t('community.identity'),t('community.identityHelp'),`<div class="status-box" data-no-i18n>${escapeHTML(identity.creatorId)}</div><label class="field"><span>${t('community.identityPassphrase')}</span><input id="creator-passphrase" type="password" autocomplete="off"></label><div class="panel-actions"><button id="export-identity" class="secondary-button">${t('community.backupIdentity')}</button><button id="import-identity" class="secondary-button">${t('community.restoreIdentity')}</button><button id="back-creator" class="secondary-button">${t('common.back')}</button></div><div id="panel-status" class="status-box" hidden></div>`);
  $('#back-creator').onclick=guard(returnFromSkillPanel);
  $('#export-identity').onclick=guard(async()=>{const passphrase=$('#creator-passphrase').value;const encrypted=await identity.exportEncrypted(passphrase);$('#creator-passphrase').value='';download(encrypted,'iah-creator-encrypted.json');});
  $('#import-identity').onclick=()=>{const passphrase=$('#creator-passphrase').value;chooseFile('.json,application/json',async text=>{if(!confirm(t('community.restoreConfirm')))return;state.identity=await importCreatorIdentity(JSON.parse(text),passphrase);await showCreatorIdentity();toast(t('community.identityRestored'));});};
}

function validateSkill(skill) { if(!skill||typeof skill!=='object'||Array.isArray(skill))throw new Error('Skill 文件必须是对象。');const content=skill.content||skill.instructions||skill.body;if(typeof content!=='string'||!content.trim())throw new Error('Skill 需要非空的 content、instructions 或 body 文本。');if(content.length>500000)throw new Error('Skill 内容超过大小限制。');skill.content=content; }
function viewSkill(skill) {
  const metadata=skillMetadata(skill);
  state.nextPanelView={kind:'skill-view',id:skill.id};panel(metadata.name,metadata.description,`<div class="quiet-note"><span data-no-i18n>${escapeHTML(skill.version||'local')}</span> · <span data-no-i18n>${escapeHTML(skill.id)}</span><br>${sourceLabel(skill)}</div><pre class="diagnostic-json" data-no-i18n>${escapeHTML(skill.content||skill.instructions||skill.body||'')}</pre><div class="panel-actions"><button id="back-skills" class="secondary-button">${t('skills.back')}</button>${ownedSkill(skill)?`<button id="edit-viewed-skill" class="secondary-button">${t('common.edit')}</button>${getBrowserCompatibility().supportedForHarness?`<button id="refine-viewed-skill" class="secondary-button">${t('skills.refineChat')}</button>`:''}`:''}</div>`,{titleKey:metadata.nameKey,subtitleKey:metadata.descriptionKey});
  $('#back-skills').onclick=guard(returnFromSkillPanel);if($('#edit-viewed-skill'))$('#edit-viewed-skill').onclick=guard(()=>showSkillEditor(skill));if($('#refine-viewed-skill'))$('#refine-viewed-skill').onclick=guard(async()=>{$('#panel-dialog').close();navigate('harness');const created=await newSession();if(!created)return;$('#message-input').value=t('skills.refineDraft',{name:skill.name,id:skill.id});resizeInput();rememberComposerDraft();});
}
function shareSkill(skill) {
  const owned=ownedSkill(skill),endpoint=communityEndpoint();
  state.nextPanelView={kind:'skill-share',id:skill.id};panel(t('skills.shareTitle'),'',`<div class="status-box">${skillTextHTML(skill,'name')}<br>${sourceLabel(skill)}</div><div class="panel-actions"><button id="export-skill" class="primary">${t('skills.export')}</button>${owned&&endpoint?`<button id="publish-skill" class="secondary-button">${t('skills.publish')}</button>`:''}<button id="back-skills" class="secondary-button">${t('common.back')}</button></div><div id="panel-status" class="status-box" hidden></div>`);
  const shared={id:skill.id,name:skill.name,description:skill.description,version:skill.version,content:skill.content||skill.instructions||skill.body,resources:skill.resources};$('#export-skill').onclick=()=>download(shared,`${String(skill.id).replace(/[^a-zA-Z0-9_-]/g,'_')}.skill.json`);$('#back-skills').onclick=guard(returnFromSkillPanel);
  if($('#publish-skill'))$('#publish-skill').onclick=guard(async()=>{if(!confirm(t('confirm.publishSkill')))return;const button=$('#publish-skill');button.disabled=true;try{const client=new CommunityClient({baseUrl:endpoint,identity:await creatorIdentity()});await client.publish(skill,{explicit:true});setPanelStatus(t('community.published'));}catch(error){setPanelStatus(error,true);}finally{button.disabled=false;}});
}

async function loadSkillMarket(){
  const container=$('#catalog-list');if(!container)return;const endpoint=communityEndpoint();let entries=publicBuiltinSkills(),cursor='',installed=await state.store.listSkills();
  const current=()=>container.isConnected&&$('#catalog-list')===container;
  function render(error=null){
    container.innerHTML=`${error?`<p class="quiet-note">${escapeHTML(t('communityRefinement.sourceError'))} ${escapeHTML(localizeError(error))}</p>`:''}${entries.map((skill,index)=>{const builtin=skill.source==='builtin',id=builtin?skill.id:`community:${skill.creatorId}/${skill.slug}`,added=installed.some(item=>item.id===id);return `<div class="skill-card"><div class="card-title">${skillTextHTML(skill,'name',{trustedCatalog:builtin,catalog:true})}<span class="tag" data-no-i18n>${escapeHTML(skill.version||'')}</span></div><p class="card-detail">${skillTextHTML(skill,'description',{trustedCatalog:builtin,catalog:true})}</p><div class="panel-actions"><button class="secondary-button" data-market-read="${index}">${t('communityRefinement.view')}</button><button class="secondary-button" data-market-add="${index}" ${added?'disabled':''}>${t(added?'communityRefinement.installed':'skills.addLocal')}</button></div><pre class="diagnostic-json" data-market-preview="${index}" data-no-i18n hidden></pre></div>`;}).join('')}${cursor?`<button class="secondary-button" data-market-more>${t('session.nextPage')}</button>`:''}`;
    $$('[data-market-read]',container).forEach(button=>button.onclick=guard(async()=>{button.disabled=true;try{const skill=await readCatalogSkill(entries[Number(button.dataset.marketRead)],{endpoint});if(!current()||!button.isConnected)return;const preview=$(`[data-market-preview="${button.dataset.marketRead}"]`,container);preview.textContent=skill.content;preview.hidden=false;button.hidden=true;}finally{if(button.isConnected)button.disabled=false;}}));
    $$('[data-market-add]',container).forEach(button=>button.onclick=guard(async()=>{button.disabled=true;try{await installCatalogSkill(state.store,entries[Number(button.dataset.marketAdd)],{endpoint});installed=await state.store.listSkills();state.skills=installed;if(current())render();toast(t('skills.saved'));}finally{if(button.isConnected)button.disabled=false;}}));
    const more=$('[data-market-more]',container);if(more)more.onclick=guard(async()=>{more.disabled=true;try{const result=await loadCommunityCatalog({endpoint,cursor});if(!current())return;if(result.error)throw result.error;entries.push(...result.entries);cursor=result.cursor||'';render();}finally{if(more.isConnected)more.disabled=false;}});
  }
  render();try{const result=await loadCommunityCatalog({endpoint});if(!current())return;entries=result.entries;cursor=result.cursor||'';render(result.error);}catch(error){if(current())render(error);}
}


function languageField() {
  return `<label class="field language-field"><span>${t('language.label')}</span><select class="language-select" data-no-i18n>${`<option value="auto">${t('language.auto')}</option>`+SUPPORTED_LOCALES.map(locale=>`<option value="${locale.code}">${locale.name}</option>`).join('')}</select></label>`;
}
function wireLanguageSelector() {
  $$('.language-select').forEach(select=>{select.value=getLocalePreference();select.onchange=()=>setLocale(select.value);});
}
function showLanguageSettings(){state.nextPanelView={kind:'language'};panel(t('language.label'),'',languageField());wireLanguageSelector();}
const localizedNodes=new WeakMap();
const localizedAttributes=new WeakMap();
let localizing=false;
const viewObserverOptions={subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','title']};
function localizeView(root=document.body) {
  if(localizing)return;localizing=true;viewObserver.disconnect();
  try{
  for(const element of root.querySelectorAll('[data-i18n]')) {
    let variables={};try{variables=JSON.parse(element.dataset.i18nVars||'{}');}catch{}
    const value=t(element.dataset.i18n,variables);if(element.textContent!==value)element.textContent=value;
  }
  const excluded='[data-no-i18n],script,style,pre,code,.message-body,.row-title,#session-title,.diagnostic-json,input,textarea,.panel-header h2,.panel-header p,#action-content h3';
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let node;while((node=walker.nextNode())) {
    if(!node.parentElement||node.parentElement.closest(excluded)||(node.parentElement.closest('.card-title')&&!node.parentElement.closest('.tag')))continue;
    const previous=localizedNodes.get(node);const source=previous&&node.nodeValue===previous.translated?previous.source:node.nodeValue;
    const translated=translateText(source);if(node.nodeValue!==translated)node.nodeValue=translated;
    localizedNodes.set(node,{source,translated});
  }
  for(const element of root.querySelectorAll('[placeholder],[aria-label],[title]')) {
    if(element.closest('[data-no-i18n]'))continue;
    let values=localizedAttributes.get(element);if(!values){values={};localizedAttributes.set(element,values);}
    for(const name of ['placeholder','aria-label','title'])if(element.hasAttribute(name)) {
      const value=element.getAttribute(name),previous=values[name],source=previous&&value===previous.translated?previous.source:value;
      const translated=translateText(source);if(value!==translated)element.setAttribute(name,translated);values[name]={source,translated};
    }
  }
  $$('.language-select').forEach(select=>{const auto=select.querySelector('option[value="auto"]');if(auto&&auto.textContent!==t('language.auto'))auto.textContent=t('language.auto');});
  }finally{localizing=false;viewObserver.observe(document.body,viewObserverOptions);}
}
let localeScheduled=false;
function scheduleLocalization(){if(localeScheduled)return;localeScheduled=true;setTimeout(()=>{localeScheduled=false;localizeView();},0);}
const viewObserver=new MutationObserver(scheduleLocalization);viewObserver.observe(document.body,viewObserverOptions);
subscribe(()=>{refreshLocalizedText(document);localizeView();renderDeviceStatus();renderSessions();renderModelOptions();updateModeDescription();if(state.current)$('#session-subtitle').textContent='';wireLanguageSelector();renderPlatform();if($('#storage-status'))renderStorage();});

function isIOSPlatform(){return getBrowserCompatibility().isIOS;}

const appBasePath=new URL('./',import.meta.url).pathname;
const canonicalRoutes={harness:'',main:'main',skills:'skills',flash:'flash'};
const legacyRoutes={home:'main',community:'skills',harness:'harness',sessions:'harness'};
function routeHref(route){return appBasePath+canonicalRoutes[route];}
function routeForPath(pathname){
  if(!pathname.startsWith(appBasePath))return null;
  const relative=pathname.slice(appBasePath.length).replace(/\/$/,'');
  if(relative===''||relative==='index.html')return 'harness';
  if(['main','skills','flash'].includes(relative))return relative;
  return legacyRoutes[relative]||null;
}
function canonicalizeLocation(){
  const url=new URL(location.href),hash=url.hash.slice(1).replace(/^\//,''),hashName=hash.split('?')[0];
  let route=routeForPath(url.pathname);
  if(Object.hasOwn(legacyRoutes,hashName)||['main','skills','flash'].includes(hashName)){
    route=legacyRoutes[hashName]||hashName;url.hash='';
  }else if(hash.startsWith('session=')){
    const sessionId=new URLSearchParams(hash).get('session');if(sessionId)url.searchParams.set('session',sessionId);route='harness';url.hash='';
  }
  route=route||'main';
  const compatibility=getBrowserCompatibility();
  if(route==='harness'&&(compatibility.platform==='desktop'||(state.bootError&&compatibility.supportedForHarness)))route='main';
  const pathname=routeHref(route);
  if(url.pathname!==pathname||url.hash!==location.hash){url.pathname=pathname;history.replaceState({...history.state,route},'',url);}
  return route;
}
function navigationURL(view){const url=new URL(routeHref(view.route||'harness'),location.origin),fixture=new URLSearchParams(location.search).get('fixture');if(fixture)url.searchParams.set('fixture',fixture);if(view.route==='harness'&&view.screen==='session'&&view.sessionId)url.searchParams.set('session',view.sessionId);if(view.route==='harness'&&view.screen==='draft')url.searchParams.set('draft','1');return url;}
function closeNavigationDialog(dialog){if(dialog?.open){dialog.navigationClosing=true;dialog.close();}}
async function applyNavigationView(view,{isCurrent=()=>true}={}){
  state.panelGeneration=(state.panelGeneration||0)+1;state.sessionOpenGeneration=(state.sessionOpenGeneration||0)+1;state.draftOpening=null;
  if(!view.panel)closeNavigationDialog($('#panel-dialog'));if(!view.action)closeNavigationDialog($('#action-dialog'));
  renderPlatform();if(!isCurrent())return;
  if(view.route==='harness'){
    if(view.screen==='draft'){
      if(state.running||state.submitting){toast(t('session.stopBeforeImport'));return {screen:state.current?'session':'list',sessionId:state.current?.id||null,panel:null,action:null};}
      openComposerDraft({navigation:false});
    }else if(view.screen==='session'&&view.sessionId){
      if((state.running||state.submitting)&&state.current?.id!==view.sessionId){$('#app').classList.remove('in-conversation');toast(t('session.stopBeforeImport'));return {screen:'list',sessionId:null,panel:null,action:null};}
      if(state.current?.id===view.sessionId)$('#app').classList.add('in-conversation');else {await openSession(view.sessionId);if(!isCurrent())return;if(state.current?.id!==view.sessionId)return {screen:'list',sessionId:null,panel:null,action:null};}
    }else $('#app').classList.remove('in-conversation');
  }
  const target=view.panel;
  if(target){
    if(target.kind==='settings')await showSettings(target.section||'home');
    else if(target.kind==='provider'){const profile=providers().find(item=>item.id===target.id),pending=loadPendingCodexLogin();renderProviderForm(profile||(pending?.provider.id===target.id?pending.provider:{}));}
    else if(target.kind==='devices')await showDevices();
    else if(target.kind==='skills'){state.skillsFromSettings=true;await showSkills(target.tab||'local');}
    else if(target.kind==='skill-editor')await showSkillEditor(state.skills.find(item=>item.id===target.id)||null);
    else if(target.kind==='skill-view'){const skill=state.skills.find(item=>item.id===target.id);if(skill)await viewSkill(skill);else await showSkills('local');}
    else if(target.kind==='skill-share'){const skill=state.skills.find(item=>item.id===target.id);if(skill)await shareSkill(skill);else await showSkills('local');}
    else if(target.kind==='creator')await showCreatorIdentity();
    else if(target.kind==='language')showLanguageSettings();
  }
  if(!isCurrent())return;
  refreshBridgeAfterNavigation();
  if(view.action?.kind==='session-menu')await showSessionMenu();
  else if(view.action?.kind==='rename'){const session=await state.store.getSession(view.action.sessionId||state.current?.id);if(session&&isCurrent())showRenameDialog(session,{fromList:!!view.action.fromList});}
}
function refreshBridgeAfterNavigation(){void state.devicePanel?.refreshConnection?.().catch(report);renderDeviceStatus();}
function rememberRouteDraft(){if(state.current)state.drafts.set(state.current.id,$('#message-input').value);else rememberComposerDraft();}
function navigate(route,{replace=false}={}){
  if(!Object.hasOwn(canonicalRoutes,route))return;
  if(state.flashing){toast(t('flash.runningNavigation'));return;}
  rememberRouteDraft();state.sessionOpenGeneration=(state.sessionOpenGeneration||0)+1;state.draftOpening=null;const url=new URL(routeHref(route),location.origin);
  if(state.navigation){state.navigation.go({route,panel:null,action:null},{replace});closeNavigationDialog($('#panel-dialog'));closeNavigationDialog($('#action-dialog'));}else if(url.href!==location.href)history[replace?'replaceState':'pushState']({route},'',url);
  renderPlatform();refreshBridgeAfterNavigation();
}
function onNavigationClick(event){
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const anchor=event.target.closest?.('a[href]');if(!anchor||anchor.target||anchor.hasAttribute('download'))return;
  const url=new URL(anchor.href,location.href);if(url.origin!==location.origin)return;
  const route=routeForPath(url.pathname);if(route===null)return;
  // Resource URLs are never treated as page routes. Legacy hash links are
  // handled by the dedicated compatibility listener rather than reloading.
  if(url.hash){const name=url.hash.slice(1).replace(/^\//,'').split('?')[0];if(Object.hasOwn(legacyRoutes,name)||['main','skills','flash'].includes(name)){event.preventDefault();navigate(legacyRoutes[name]||name);}return;}
  event.preventDefault();navigate(route);
}
function queueDeviceSetupImport({popEvent=null}={}){
  if(!state.devicePanel?.receiveSetupLink?.())return false;
  // A setup link can arrive in this document while a task owns the bridge.
  // Keep it pending until the device panel is opened after the task finishes.
  if(state.running||state.submitting||state.flashing)return true;
  const source=location.href;if(state.deviceSetupImportSource===source)return true;
  state.deviceSetupImportSource=source;const request=state.deviceSetupImportGeneration=(state.deviceSetupImportGeneration||0)+1,previous=state.deviceSetupImportTask||Promise.resolve();
  const current=()=>request===state.deviceSetupImportGeneration&&!state.running&&!state.submitting&&!state.flashing;
  const task=previous.catch(()=>{}).then(async()=>{if(!current())return;if(popEvent&&state.navigation)await state.navigation.pop(popEvent);if(current()&&state.devicePanel.hasPendingSetup())await showDevices();}).catch(report).finally(()=>{if(state.deviceSetupImportTask===task){state.deviceSetupImportTask=null;state.deviceSetupImportSource='';}});
  state.deviceSetupImportTask=task;return true;
}
window.addEventListener('popstate',event=>{rememberRouteDraft();if(queueDeviceSetupImport({popEvent:event}))return;if(state.navigation)void state.navigation.pop(event).catch(report);else renderPlatform();});
window.addEventListener('hashchange',()=>{rememberRouteDraft();if(!queueDeviceSetupImport())renderPlatform();});
document.addEventListener('click',onNavigationClick);
let compatibilityGateActive=false;
function setCompatibilityGate(compatibility=null){
  const gate=$('#compatibility-gate'),button=$('#compatibility-home');
  compatibilityGateActive=Boolean(compatibility&&!compatibility.supportedForHarness);
  if(!compatibilityGateActive){gate.hidden=true;document.body.classList.remove('compatibility-locked');$('#site').inert=false;return;}
  for(const dialog of $$('dialog[open]'))dialog.close();
  $('#app').hidden=true;$('#app').inert=true;$('#app').setAttribute('aria-hidden','true');$('#site').hidden=true;$('#site').inert=true;
  $('#compatibility-title').textContent=t('compat.title');$('#compatibility-description').textContent=t('compat.description');
  const reasonKey='compat.'+compatibility.reasonCode;const reason=t(reasonKey);$('#compatibility-reason').textContent=reason===reasonKey?t('compat.generic'):reason;
  const previousFocus=document.activeElement;button.textContent=t('compat.goHome');gate.hidden=false;document.body.classList.add('compatibility-locked');
  if(!gate.contains(previousFocus))button.focus({preventScroll:true});
}
$('#compatibility-home').onclick=()=>navigate('main',{replace:true});
document.addEventListener('keydown',event=>{
  if(!compatibilityGateActive)return;
  if(event.key==='Escape'||event.key==='Tab'){
    event.preventDefault();event.stopImmediatePropagation();$('#compatibility-home').focus({preventScroll:true});
  }
},true);
document.addEventListener('focusin',event=>{if(compatibilityGateActive&&!$('#compatibility-gate').contains(event.target))$('#compatibility-home').focus({preventScroll:true});},true);
function renderPlatform() {
  if(state.flashing){toast(t('flash.runningNavigation'));return;}
  state.usbSetup?.dispose();state.usbSetup=null;
  const description=$('meta[name="description"]');if(description)description.content=t('home.subtitle');
  const compatibility=getBrowserCompatibility(),ios=compatibility.isIOS,route=canonicalizeLocation();
  if(route==='harness'&&!compatibility.supportedForHarness){setCompatibilityGate(compatibility);return;}
  setCompatibilityGate();
  const showHarness=ios&&!state.bootError&&route==='harness';document.body.classList.toggle('harness-surface',showHarness);
  $('#app').hidden=!showHarness;$('#app').inert=!showHarness||!state.harness;$('#app').setAttribute('aria-hidden',String(!showHarness));$('#site').hidden=showHarness;$('#site').inert=false;$('#site-notice').hidden=!state.bootError;if(state.bootError)$('#site-notice').textContent=t('settings.storageRequired')+' '+localizeError(state.bootError);
  $('.sidebar .brand').href=routeHref('main');
  if(showHarness){document.title='iPhone Agent Harness';return;}
  const page=['skills','flash'].includes(route)?route:'main';
  $$('#site [data-route]').forEach(link=>{link.href=routeHref(link.dataset.route);link.classList.toggle('active',link.dataset.route===page);if(link.dataset.route==='flash')link.hidden=ios;if(link.dataset.route==='harness')link.hidden=!ios;});
  $('.site-brand').href=routeHref('main');$('.sidebar .brand').href=routeHref('main');
  $('#site-language').textContent=SUPPORTED_LOCALES.find(locale=>locale.code===getLocale())?.name||'English';
  $('#site-language').onclick=showLanguageSettings;for(const link of $$('.repository-link'))link.href=SITE_CONFIG.repository;
  if(page==='skills'){renderCommunityPage();return;}
  if(page==='flash'){renderFlashPage();return;}
  $('#site-main').innerHTML=`${homeHeroHTML(ios)}<section class="site-feature-grid"><article><span class="ui-icon ui-icon-cpu" aria-hidden="true"></span><h2>${t('home.featureScreen')}</h2><p>${t('home.featureScreenDescription')}</p></article><article><span class="ui-icon ui-icon-blocks" aria-hidden="true"></span><h2>${t('home.featureSkills')}</h2><p>${t('home.featureSkillsDescription')}</p></article><article><span class="ui-icon ui-icon-database" aria-hidden="true"></span><h2>${t('home.featureLocal')}</h2><p>${t('home.featureLocalDescription')}</p></article></section>${homeShowcaseHTML()}${homeGuideHTML(ios)}`;
}
function homeHeroHTML(ios){return `<section class="site-hero"><div class="site-hero-copy"><h1>${t('home.heroTitle')}</h1><p>${t('home.subtitle')}</p><div class="site-cta"><a class="primary" href="${routeHref(ios?'harness':'flash')}">${t(ios?'home.openHarness':'home.setupBridge')}<span class="ui-icon ui-icon-next" aria-hidden="true"></span></a><a class="secondary-button" href="${routeHref('skills')}">${t('home.exploreSkills')}</a></div>${!ios?`<p class="site-platform-note">${t('home.phoneRequirement')}</p>`:''}</div>${homeDemoHTML()}</section>`;}
function homeDemoHTML(){const media=name=>new URL('./media/'+name,import.meta.url).href;return `<div class="site-hero-media"><figure class="alarm-demo"><video controls playsinline preload="none" width="1080" height="1920" poster="${media('alarm-demo-poster.jpg')}" aria-label="${t('showcase.videoLabel')}"><source src="${media('alarm-demo.mp4')}" type="video/mp4"><a href="${media('alarm-demo.mp4')}">${t('showcase.openVideo')}</a></video><figcaption><div class="showcase-heading"><h2 id="alarm-demo-title">${t('showcase.title')}</h2><p>${t('showcase.description')}</p></div><span>${t('showcase.videoCaption')}</span><a href="${media('alarm-demo.mp4')}" target="_blank" rel="noopener">${t('showcase.openVideo')} ↗</a></figcaption></figure></div>`;}
function homeShowcaseHTML(){const media=name=>new URL('./media/'+name,import.meta.url).href;return `<section class="site-showcase" aria-labelledby="showcase-gallery-title"><div class="showcase-heading gallery-heading"><h2 id="showcase-gallery-title">${t('showcase.galleryTitle')}</h2><p>${t('showcase.galleryDescription')}</p></div><div class="showcase-gallery">${['sessions','conversation','skills'].map(name=>`<figure><a class="showcase-image-link" href="${media(name+'-example.jpg')}" target="_blank" rel="noopener" aria-label="${t('showcase.'+name+'Title')} · ${t('showcase.openImage')}"><img src="${media(name+'-example.jpg')}" alt="${t('showcase.'+name+'Alt')}" width="390" height="844" loading="lazy" decoding="async"></a><figcaption><h3>${t('showcase.'+name+'Title')}</h3><p>${t('showcase.'+name+'Caption')}</p></figcaption></figure>`).join('')}</div></section>`;}
function homeGuideHTML(ios){return `<section class="site-guide" id="get-started"><h2>${t('guide.title')}</h2><p>${t('guide.intro')}</p><ol>${['flash','connect','model','task','skills'].map(step=>`<li><h3>${t('guide.'+step+'Title')}</h3><p>${t('guide.'+step+'Body')}</p></li>`).join('')}</ol><div class="guide-links"><a class="secondary-button" href="${SITE_CONFIG.repository}/blob/main/docs/guide/${getLocale()==='en'?'README.md':getLocale()+'.md'}" target="_blank" rel="noopener">${t('guide.full')}</a>${ios?`<a class="primary" href="${routeHref('harness')}">${t('guide.start')}</a>`:`<a class="primary" href="${routeHref('flash')}">${t('home.setupBridge')}</a>`}<a class="secondary-button" href="${new URL('./shortcuts/clipboard.html',import.meta.url).href}">${t('guide.clipboard')}</a><a class="secondary-button" href="${SITE_CONFIG.repository}" target="_blank" rel="noopener">${t('guide.github')}</a></div></section><section class="site-architecture"><h2>${t('architecture.title')}</h2><p>${t('architecture.summary')}</p><a target="_blank" rel="noopener" aria-label="${t('architecture.open')}" href="${new URL('./media/architecture'+(getLocale()==='en'?'':'.'+getLocale())+'.svg',import.meta.url).href}"><img src="${new URL('./media/architecture'+(getLocale()==='en'?'':'.'+getLocale())+'.svg',import.meta.url).href}" alt="${t('architecture.alt')}" width="1200" height="720" loading="lazy"></a></section>`;}
async function renderCommunityPage(){
  const generation=(state.communityGeneration||0)+1;state.communityGeneration=generation;const endpoint=communityEndpoint();
  $('#site-main').innerHTML=`<section class="site-page-heading"><h1>${t('community.title')}</h1><p>${t('community.description')}</p></section><div class="site-community-layout"><section class="site-community-authoring site-content-card"><h2>${t('communityRefinement.workspace')}</h2><div class="panel-actions"><button id="site-create-skill" class="primary" ${state.store?'':'disabled'}>${t('skills.create')}</button><button id="site-import-own" class="secondary-button" ${state.store?'':'disabled'}>${t('communityRefinement.importOwn')}</button><button id="site-identity" class="secondary-button" ${state.store?'':'disabled'}>${t('community.identity')}</button></div><div id="community-authored" class="community-grid"></div></section><section class="site-community-browser site-content-card"><h2>${t('communityRefinement.browse')}</h2><div id="community-status" class="quiet-note">${t('community.loading')}</div><div id="community-cards" class="community-grid"></div><button id="community-more" class="secondary-button" hidden>${t('session.nextPage')}</button></section></div>`;
  const current=()=>generation===state.communityGeneration&&routeForPath(location.pathname)==='skills'&&!!$('#community-cards');
  $('#site-create-skill').onclick=guard(()=>{state.skillsFromSettings=false;return showSkillEditor();});$('#site-identity').onclick=guard(showCreatorIdentity);
  $('#site-import-own').onclick=()=>chooseFile('.md,.json,text/markdown,application/json',async(text,fileName)=>{try{const skill=await importOwnSkillFile({store:state.store,identity:await creatorIdentity(),text,fileName});state.skills=await state.store.listSkills();if(current())await showSkillEditor(skill);}catch(error){if(error.code==='SKILL_NOT_OWNED')throw new Error(t('communityRefinement.importNotOwned'));throw error;}});
  let installed=[],entries=publicBuiltinSkills(),cursor='';
  if(state.store){try{const identity=await creatorIdentity();installed=await state.store.listSkills();if(!current())return;const owned=installed.filter(skill=>isOwnedAuthored(skill,identity.creatorId));$('#community-authored').innerHTML=owned.length?owned.map((skill,index)=>`<article class="skill-card"><div class="card-title" data-no-i18n>${escapeHTML(skill.name)}<span class="tag">${escapeHTML(skill.version)}</span></div><p class="card-detail" data-no-i18n>${escapeHTML(skill.description||'')}</p><div class="panel-actions"><button class="secondary-button" data-authored-edit="${index}">${t('common.edit')}</button><button class="secondary-button" data-authored-publish="${index}">${t('skills.publish')}</button></div></article>`).join(''):`<p class="quiet-note">${t('communityRefinement.emptyAuthored')}</p>`;$$('[data-authored-edit]').forEach(button=>button.onclick=guard(()=>showSkillEditor(owned[Number(button.dataset.authoredEdit)])));$$('[data-authored-publish]').forEach(button=>button.onclick=()=>shareSkill(owned[Number(button.dataset.authoredPublish)]));}catch(error){if(current())$('#community-authored').textContent=localizeError(error);}}
  function renderCards(){
    $('#community-cards').innerHTML=entries.map((skill,index)=>{const builtin=skill.source==='builtin',id=builtin?skill.id:`community:${skill.creatorId}/${skill.slug}`,added=installed.some(item=>item.id===id);return `<article class="skill-card"><div class="card-title">${skillTextHTML(skill,'name',{trustedCatalog:builtin,catalog:true})}<span class="tag" data-no-i18n>${escapeHTML(skill.version||'')}</span></div><p class="card-detail">${skillTextHTML(skill,'description',{trustedCatalog:builtin,catalog:true})}</p><p class="card-detail">${t(builtin?'communityRefinement.builtin':'skills.sourceCommunity')}</p><div class="panel-actions"><button class="secondary-button" data-community-read="${index}">${t('communityRefinement.view')}</button>${isIOSPlatform()?`<button class="secondary-button" data-community-install="${index}" ${!state.store||added?'disabled':''}>${t(added?'communityRefinement.installed':'skills.addLocal')}</button>`: ''}</div><pre class="diagnostic-json" data-community-preview="${index}" data-no-i18n hidden></pre></article>`;}).join('');
    $$('[data-community-read]').forEach(button=>button.onclick=guard(async()=>{button.disabled=true;try{const skill=await readCatalogSkill(entries[Number(button.dataset.communityRead)],{endpoint});if(!current()||!button.isConnected)return;const preview=$(`[data-community-preview="${button.dataset.communityRead}"]`);preview.textContent=skill.content;preview.hidden=false;button.hidden=true;}finally{if(button.isConnected)button.disabled=false;}}));
    $$('[data-community-install]').forEach(button=>button.onclick=guard(async()=>{button.disabled=true;try{await installCatalogSkill(state.store,entries[Number(button.dataset.communityInstall)],{endpoint});installed=await state.store.listSkills();state.skills=installed;if(current())renderCards();toast(t('skills.saved'));}finally{if(button.isConnected)button.disabled=false;}}));
    $('#community-more').hidden=!cursor;
  }
  renderCards();try{const result=await loadCommunityCatalog({endpoint});if(!current())return;entries=result.entries;cursor=result.cursor||'';$('#community-status').textContent=result.error?t('communityRefinement.sourceError')+' '+localizeError(result.error):'';renderCards();}
  catch(error){if(current())$('#community-status').textContent=localizeError(error);}
  $('#community-more').onclick=guard(async()=>{const button=$('#community-more');button.disabled=true;try{const result=await loadCommunityCatalog({endpoint,cursor});if(!current())return;if(result.error)throw result.error;entries.push(...result.entries);cursor=result.cursor||'';renderCards();}finally{if(button.isConnected)button.disabled=false;}});
}

async function renderFlashPage(){
  $('#site-main').innerHTML=`<section class="site-page-heading"><h1>${t('flash.title')}</h1><p>${t('flash.description')}</p></section><div class="site-setup-grid"><section class="site-setup-card site-flash-card"><div id="flash-stage" class="status-box" hidden></div><div id="flash-status" class="quiet-note">${isIOSPlatform()?t('flash.desktopRequired'):t('flash.loading')}</div><div id="flash-controls"></div></section><section class="site-setup-card site-usb-card"><div id="usb-setup-controls"></div></section></div>`;
  if(isIOSPlatform())return;
  state.usbSetup=mountUsbSetup({container:$('#usb-setup-controls'),readSetup:readDeviceSetup,canRead:canFlash,isBusy:()=>state.flashing,setBusy:busy=>{state.flashing=busy;$('#site').classList.toggle('flashing',busy);$('#site-language').disabled=busy;if($('#flash-profile'))$('#flash-profile').disabled=busy;if($('#flash-install'))$('#flash-install').disabled=busy||!canFlash();}});
  try{
    const manifest=await loadFirmwareManifest();if(!$('#flash-controls')||routeForPath(location.pathname)!=='flash')return;
    if(manifest.stage==='diagnostic-framework'||manifest.executionEnabled===false){$('#flash-stage').hidden=false;$('#flash-stage').textContent=t('flash.diagnostic');}
    if(!manifest.profiles.length){$('#flash-status').textContent=t('flash.noProfiles');return;}
    $('#flash-status').textContent=canFlash()?'':t('flash.unsupported');
    $('#flash-controls').innerHTML=`<label class="field"><span>${t('flash.board')}</span><select id="flash-profile">${firmwareInstallerChoices(manifest.profiles).map(profile=>`<option value="${escapeHTML(profile.id)}">${escapeHTML(profile.chip==='esp32c2'?t('flash.c2Auto'):profile.label||profile.board||profile.id)}</option>`).join('')}</select></label><div id="flash-profile-detail" class="quiet-note" data-no-i18n></div><div class="panel-actions"><button id="flash-install" class="primary" ${canFlash()?'':'disabled'}>${t('flash.install')}</button></div><progress id="flash-progress" max="100" value="0" hidden></progress><details class="settings-section"><summary>${t('flash.log')}</summary><pre id="flash-log" class="diagnostic-json" data-no-i18n></pre></details>`;
    const showProfile=(actual=null)=>{const profile=actual||manifest.profiles.find(item=>item.id===$('#flash-profile').value);$('#flash-profile-detail').textContent=`${profile.chip} · ${profile.minFlashMB} MB · ${actual&&profile.xtalMHz?profile.xtalMHz+' MHz · ':''}${manifest.firmwareVersion||''}`;};$('#flash-profile').onchange=()=>showProfile();if(manifest.profiles.some(item=>item.id==='esp32c3'))$('#flash-profile').value='esp32c3';showProfile();
    $('#flash-install').onclick=guard(async()=>{const profile=manifest.profiles.find(item=>item.id===$('#flash-profile').value),button=$('#flash-install'),progress=$('#flash-progress'),status=$('#flash-status'),log=$('#flash-log');button.disabled=true;state.flashing=true;$('#site').classList.add('flashing');$('#site-language').disabled=true;$('#flash-profile').disabled=true;progress.hidden=false;log.textContent='';try{const result=await flashFirmware({profile,profiles:manifest.profiles,manifestUrl:manifest.manifestUrl,onProgress:({percent})=>{progress.value=percent;status.textContent=t('flash.writing',{percent:Math.round(percent)});},onLog:text=>{log.textContent=(log.textContent+'\n'+text).slice(-20000);}});if(result.status==='flashed'&&result.verified){const actual=manifest.profiles.find(item=>item.id===result.profileId);$('#flash-profile').value=actual.chip==='esp32c2'?firmwareInstallerChoices(manifest.profiles).find(item=>item.chip==='esp32c2').id:result.profileId;showProfile(actual);progress.value=100;status.textContent=t('flash.verified');}else throw new Error('Firmware operation did not return verification');}catch(error){status.textContent=localizeError(error);}finally{state.flashing=false;$('#site').classList.remove('flashing');$('#site-language').disabled=false;button.disabled=!canFlash();if($('#flash-profile'))$('#flash-profile').disabled=false;}});
  }catch(error){if($('#flash-status'))$('#flash-status').textContent=localizeError(error);}
}



async function boot() {
  const returningDeviceSetup=pendingDeviceSetupReturn({consume:true});
  const pendingDeviceSetup=location.hash.startsWith('#device=')||returningDeviceSetup;
  renderPlatform();
  state.store=await openStore();void requestStorageProtection();await installBuiltinSkills(state.store);state.settings=await state.store.getSettings()||{};await restoreProviderCredentials(state.store,providers(),{registerAccount:registerCodexAccount,onError:report});state.skills=await state.store.listSkills();state.skillSync=syncInstalledCommunitySkills(state.store,{endpoint:communityEndpoint(),signal:AbortSignal.timeout(10000)}).then(async result=>{state.skills=await state.store.listSkills();if(result.errors.length)toast(t('skills.updateUnavailable'));}).catch(error=>{console.warn('Skill update unavailable',error?.code||error?.name||'unknown');toast(t('skills.updateUnavailable'));});
  state.devicePanel=createDevicePanel({store:state.store,capture,openPanel:(...args)=>{state.nextPanelView={kind:'devices'};return panel(...args);},getPanelRoot:()=>$('#panel-content .panel-body'),onDeviceChange:(device,summary)=>{state.device=device;state.deviceStatus=summary;const pending=clipboard.getSnapshot();if(pending&&(!summary.ready||summary.targetId!==pending.targetId))clipboard.clear();renderDeviceStatus();},onSettingsChange:settings=>{state.settings=settings;},isBusy:()=>state.running||state.submitting,onToast:toast});
  state.mcpAccess=createMCPAccess();state.mcpPanel=createMCPSettings({access:state.mcpAccess,store:state.store,onSettingsChange:settings=>{state.settings=settings;}});
  void state.mcpPanel.restore({servers:state.settings.mcpServers,endpoint:state.settings.mcpEndpoint||''}).catch(report);
  state.locationAccess ||= createLocationAccess({getSettings:()=>state.store.getSettings()});
  state.harness=createHarness({store:state.store,locationAccess:state.locationAccess,onEvent:onHarnessEvent,capture,device:deviceAdapter,getContext:deviceContext,getDeviceStatus:deviceStatus,getHarnessState:({sessionId})=>({visible:document.visibilityState==='visible'&&document.hasFocus()&&routeForPath(location.pathname)==='harness'&&state.current?.id===sessionId&&$('#app').classList.contains('in-conversation')&&!$('#panel-dialog').open&&!$('#action-dialog').open,sessionId:state.current?.id||null,origin:location.origin,url:new URL(routeHref('harness')+'?session='+encodeURIComponent(sessionId),location.origin).href}),clipboard,mcp:state.mcpAccess});
  $('#new-session').onclick=guard(newSession);state.sessionSearch=mountSessionSearch({surface:$('.sidebar'),scrollArea:$('#sessions'),field:$('#session-search-wrap'),input:$('#session-search'),toggle:$('#toggle-session-search'),cancel:$('#cancel-session-search'),onQueryChange:guard(refreshSessions)});$('#list-label').onchange=guard(event=>switchSessionLibrary(event.target.value));
  $('#back-sessions').onclick=guard(()=>state.navigation?state.navigation.back({screen:'list',sessionId:null,panel:null,action:null}):$('#app').classList.remove('in-conversation'));$('#session-menu').onclick=guard(showSessionMenu);
  $('#conversation-device').onclick=guard(showDevices);$('#open-settings').onclick=guard(showSettings);$('#open-devices').onclick=guard(showDevices);
  $('#conversation-latest').onclick=guard(showLatestConversation);
  $('#resume-run').onclick=guard(resumeRun);capture.subscribe(event=>{state.deviceStatus=state.devicePanel?.getState?.();updateModeDescription();renderDeviceStatus();if(event.type==='stopped'&&state.running){$('#run-status').textContent=t('interaction.shareStopped');}renderRunControls();});
  $('#composer').onsubmit=guard(sendMessage);$('#message-input').oninput=()=>{resizeInput();rememberComposerDraft();};$('#stop-run').onclick=()=>{state.harness.stop();state.abort?.abort();$('#run-status').textContent='正在停止…';};
  $('#reasoning-select').onchange=guard(changeReasoningSelection);
  $('#model-select').onchange=guard(changeModelSelection);
  $('#panel-dialog').addEventListener('close',()=>{const historyClose=$('#panel-dialog').navigationClosing;$('#panel-dialog').navigationClosing=false;if($('#panel-dialog').open)return;if(!historyClose&&state.navigation&&!state.navigation.restoring)void state.navigation.dismissPanel().catch(report);state.panelGeneration=(state.panelGeneration||0)+1;state.devicePanel?.dispose();discardProviderDraft();state.codexAbort?.abort();state.modelsAbort?.abort();state.mcpPanel?.disposeView();});
  $('#action-dialog').addEventListener('close',()=>{if($('#action-dialog').navigationClosing){$('#action-dialog').navigationClosing=false;return;}if($('#action-dialog').open)return;if(state.navigation&&!state.navigation.restoring)void state.navigation.dismissAction().catch(report);});
  $$('dialog').forEach(dialog=>dialog.addEventListener('close',()=>{if(dialog.contains(toastNode))hideToast(toastNode);}));
  $$('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}}));
  mountViewport({onLayout:()=>state.conversationFollow?.afterRender()});
  renderDeviceStatus();renderModelOptions();renderMessages();await refreshSessions();$('#app').inert=false;localizeView();renderPlatform();
  const params=new URLSearchParams(location.search);const sessionId=params.get('session'),draftRequested=!sessionId&&(params.get('draft')==='1'||history.state?.iahView?.screen==='draft');if(sessionId)await openSession(sessionId);else if(draftRequested)openComposerDraft({navigation:false});state.navigation=createViewNavigation({history,location,urlForView:navigationURL,applyView:applyNavigationView,initialView:{route:routeForPath(location.pathname)||'main',screen:sessionId?'session':draftRequested?'draft':'list',sessionId:sessionId||null,panel:null,action:null}});if(pendingDeviceSetup)await showDevices();else if(state.navigation.current.panel||state.navigation.current.action)await state.navigation.restoreCurrent();
  const pendingLogin=loadPendingCodexLogin();if(pendingLogin&&!pendingDeviceSetup){await showSettings('accounts');if($('#provider-editor')&&!$('#provider-form')&&$('#panel-dialog').open){const profile=providers().find(item=>item.id===pendingLogin.provider.id);if(!profile||profile.protocol==='codex')renderProviderForm(profile||pendingLogin.provider);}}
  window.addEventListener('pagehide',rememberRouteDraft);window.addEventListener('pageshow',event=>{refreshBridgeAfterNavigation();if(event.persisted&&pendingDeviceSetupReturn({consume:true}))void showDevices().catch(report);});window.addEventListener('focus',refreshBridgeAfterNavigation);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshBridgeAfterNavigation();});
}
boot().catch(error=>{console.error(error);state.bootError=error;$('#app').inert=true;renderPlatform();toast(localizeError(error));});
