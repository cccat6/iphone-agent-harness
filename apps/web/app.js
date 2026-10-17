import { getBrowserCompatibility } from './core/compatibility.js';
import { SITE_CONFIG } from './site-config.js';
import { t, getLocale, getLocalePreference, setLocale, subscribe, SUPPORTED_LOCALES, translateText, translationKey, localizeError, registerErrorCatalog, skillMetadata } from './i18n.js';
import { openStore } from './core/store.js';
import { readImportFile, sessionBackupBlob, SESSION_BACKUP_BYTES, BACKUP_ERRORS } from './core/backup-files.js';
import { createHarness, chatExecutionContext } from './core/harness.js';
import { setCredential, hasCredential, getCredential } from './core/credentials.js';
import { createDevicePanel } from './ui/device-panel.js';
import { mountUsbSetup } from './ui/usb-setup.js';
import { setLocalizedText, refreshLocalizedText } from './ui/localized-status.js';
import { screenCapture } from './core/capture.js';
import { sealCredentials, unsealCredentials } from './core/auth.js';
import { createMCPAccess } from './core/mcp.js';
import { createMCPSettings } from './ui/mcp-settings.js';
import { discoverModels } from './core/providers.js';
import { installBuiltinSkills, downloadSkill } from './core/skills.js';
import { openCreatorIdentity, importCreatorIdentity } from './community/identity.js';
import { createAuthoredSkill, updateAuthoredSkill, isOwnedAuthored } from './community/authoring.js';
import { CommunityClient } from './community/client.js';
import { canFlash, loadFirmwareManifest, flashFirmware, readDeviceSetup } from './core/flasher.js';
import { startCodexLogin, completeCodexLogin, discoverCodexModels, getCodexAccount, registerCodexAccount, hasCodexAccount, removeCodexAccount, setCodexTokenObserver } from './core/codex.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const state = { store:null, harness:null, device:null, devicePanel:null, mcpAccess:null, mcpPanel:null, settings:{}, sessions:[], current:null, messages:[], messageLimit:80, hasOlder:false, archived:false, running:false, submitting:false, runGeneration:0, pending:null, skills:[], catalog:[], skillTab:'local', providerEdit:null, providerModels:[], drafts:new Map(), abort:null, lastError:null };
const capture = screenCapture;
registerErrorCatalog(BACKUP_ERRORS);
const vaultPassphrases=new Map();let vaultWrite=Promise.resolve();
setCodexTokenObserver(({id,event})=>{
  if(event!=='refreshed'||!vaultPassphrases.has(id)||!state.store)return;
  vaultWrite=vaultWrite.catch(()=>{}).then(async()=>{
    const passphrase=vaultPassphrases.get(id),account=getCodexAccount(id);if(!passphrase||!account)return;
    const encrypted=await sealCredentials(account.exportTokens(),passphrase),latest=await state.store.getSettings();
    if(vaultPassphrases.get(id)!==passphrase||!latest.providers?.some(profile=>profile.id===id&&profile.protocol==='codex'))return;
    state.settings=await state.store.saveSettings({credentialVault:{...latest.credentialVault,[id]:encrypted}});
  }).catch(error=>toast(()=>t('auth.vaultRefreshFailed',{detail:localizeError(error)})));
});
let toastTimer,toastNode;
const modeNames = {chat:'对话',plan:'计划',task:'任务'};
const modeDescriptions={chat:'mode.chatDescription',plan:'mode.planDescription',task:'mode.taskDescription'};
const modeLabel=mode=>t('mode.'+(['chat','plan','task'].includes(mode)?mode:'chat'));

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
function communityEndpoint(){if(Object.hasOwn(state.settings,'communityEndpoint'))return state.settings.communityEndpoint||'';return location.origin==='https://igent.cc'?SITE_CONFIG.communityEndpoint||'':'';}
function providers() { return Array.isArray(state.settings.providers) ? state.settings.providers : []; }
function selectionParts(value) {
  const raw=String(value||'');const separator=raw.indexOf('::');
  return separator<0?{providerId:raw,modelId:''}:{providerId:raw.slice(0,separator),modelId:raw.slice(separator+2)};
}
function profileModels(profile) {
  const models=new Map();
  for(const entry of Array.isArray(profile.models)?profile.models:[]) {
    const id=typeof entry==='string'?entry:entry?.id;
    if(typeof id==='string'&&id.trim())models.set(id,{id,name:typeof entry==='object'?(entry.name||id):id});
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
function activeSkills() { return state.skills.filter(skill=>skill.enabled!==false); }
function systemTextHTML(key,variables={}) {return `<span data-no-i18n data-i18n="${escapeHTML(key)}" data-i18n-vars="${escapeHTML(JSON.stringify(variables))}">${escapeHTML(t(key,variables))}</span>`;}
function isBuiltinCatalog(url){try{return new URL(url,location.href).href===new URL('./skills/catalog.json',import.meta.url).href;}catch{return false;}}
function skillTextHTML(skill,field,{trustedCatalog=false,catalog=false}={}){
  const metadata=skillMetadata(skill,{trustedCatalog,catalog}),value=field==='name'?metadata.name:metadata.description;
  const key=(field==='name'?metadata.nameKey:metadata.descriptionKey)||(!value&&field==='description'?'common.noDescription':null);
  return key?systemTextHTML(key):`<span data-no-i18n>${escapeHTML(value)}</span>`;
}

async function refreshSessions() { state.sessions=await state.store.listSessions({archived:state.archived,search:$('#session-search').value}); renderSessions(); }
function renderSessions() {
  $('#archive-toggle').textContent=state.archived?'返回会话':'查看归档'; $('#list-label').textContent=state.archived?'已归档':'你的会话';
  const sessions=[...state.sessions].sort((a,b)=>Number(b.pinned)-Number(a.pinned) || new Date(b.updatedAt)-new Date(a.updatedAt));
  $('#sessions').innerHTML=sessions.length?sessions.map(session=>`<button class="session-row ${state.current?.id===session.id?'active':''}" data-session="${escapeHTML(session.id)}"><span class="row-title"><span>${escapeHTML(session.title||t('session.new'))}</span>${session.pinned?`<span class="row-pin">${t('session.pinned')}</span>`:''}</span><small>${escapeHTML(modeLabel(session.mode)||'对话')} · ${dateLabel(session.updatedAt)}</small></button>`).join(''):`<div class="list-empty">${state.archived?'暂无归档会话。':$('#session-search').value?'没有找到相关会话。':'还没有会话。<br>从一个想法，或一项任务开始。'}</div>`;
  $$('[data-session]').forEach(button=>button.onclick=guard(()=>openSession(button.dataset.session)));
}
function renderModelOptions() {
  const current=state.current?.modelId||state.settings.activeProviderId||'';
  const parts=selectionParts(current);const profile=providers().find(item=>item.id===parts.providerId);
  const selected=profile?`${profile.id}::${parts.modelId||profile.model||profileModels(profile)[0]?.id||''}`:'';
  $('#model-select').innerHTML=`<option value="">${t('session.chooseModel')}</option>`+providers().map(item=>`<optgroup label="${escapeHTML(item.name||t('provider.unnamed'))}">${profileModels(item).map(model=>`<option value="${escapeHTML(item.id+'::'+model.id)}">${escapeHTML(model.name)} · ${escapeHTML(item.name||t('provider.account'))}</option>`).join('')}</optgroup>`).join('');
  $('#model-select').value=selected;$('#model-select').setAttribute('aria-label',t('session.model'));
  const resolved=selectedProvider();$('#model-select').title=resolved?`${resolved.name} · ${selectionParts($('#model-select').value).modelId}`:t('provider.chooseAccountModel');
}
function updateModeDescription() { $('#mode-description').textContent=t(modeDescriptions[$('#mode-select').value]); }
async function newSession({fromSubmit=false}={}) { if((state.running||state.submitting)&&!fromSubmit)throw new Error('请先停止当前任务，再切换会话。');const session=await state.store.createSession({title:t('session.new'),mode:$('#mode-select').value||'chat',modelId:$('#model-select').value||state.settings.activeProviderId||providers()[0]?.id||''}); await refreshSessions(); await openSession(session.id,{fromSubmit}); $('#message-input').focus(); }
async function openSession(id,{fromSubmit=false}={}) { if(state.submitting&&!fromSubmit)throw new Error('请先停止当前任务，再切换会话。'); if(state.current)state.drafts.set(state.current.id,$('#message-input').value); if(state.running && state.current?.id!==id)throw new Error('请先停止当前任务，再切换会话。'); state.current=await state.store.getSession(id); if(!state.current)throw new Error('未找到这条会话。'); state.messages=await state.store.getMessages(id,{limit:80,includeImages:false,includeInternal:false}); state.hasOlder=state.messages.length===80;state.messageLimit=80; state.lastError=null; state.pending=null; $('#app').classList.add('in-conversation'); $('#session-title').textContent=state.current.title||t('session.new'); $('#session-subtitle').textContent=t('session.savedHere',{mode:modeLabel(state.current.mode||'chat')}); $('#session-menu').hidden=false; $('#mode-select').value=state.current.mode||'chat'; $('#message-input').value=state.drafts.get(id)||'';resizeInput(); renderModelOptions(); updateModeDescription(); renderSessions(); renderMessages(); }
function welcome() { return `<section class="welcome"><div class="welcome-icon" aria-hidden="true">⌘</div><div class="eyebrow">IPHONE AGENT HARNESS</div><h2>从想法，到手机上的行动。</h2><p>连接你自己的模型。用对话制定计划，借助设备完成操作。会话与 Skills 留在你的浏览器里。</p><div class="welcome-cards"><button class="welcome-card" data-welcome="chat"><span>↗</span><strong>先聊聊你的想法</strong><small>梳理需求，或把目标变成计划</small></button><button class="welcome-card" data-welcome="devices"><span>▣</span><strong>连接你的设备</strong><small>查看输入桥与屏幕共享设置</small></button></div></section>`; }
function renderMessages() {
  const region=$('#conversation');
  region.innerHTML=state.messages.length?(state.hasOlder?'<button id="load-older-messages" class="secondary-button" style="display:block;margin:0 auto 25px">加载较早的消息</button>':'')+state.messages.slice(-state.messageLimit).map(message=>`<article class="message ${escapeHTML(message.role)}"><div class="message-label">${escapeHTML(({user:'你',assistant:'Harness',system:'系统',tool:'操作记录'})[message.role]||message.role)}</div><div class="message-body">${escapeHTML(message.text)}</div></article>`).join(''):welcome();
  if($('#load-older-messages'))$('#load-older-messages').onclick=guard(async()=>{const height=region.scrollHeight;const older=await state.store.getMessages(state.current.id,{beforeSeq:state.messages[0]?.seq,limit:80,includeImages:false,includeInternal:false});state.hasOlder=older.length===80;state.messages=[...older,...state.messages];state.messageLimit=state.messages.length;renderMessages();region.scrollTop=region.scrollHeight-height;});
  if(state.pending!==null) { const article=document.createElement('article'); article.className='message assistant pending'; article.innerHTML='<div class="message-label">Harness</div><div class="message-body"></div>'; $('.message-body',article).textContent=state.pending; region.append(article); }
  if(state.lastError) { const node=document.createElement('div');node.className='error-notice';setLocalizedText(node,()=>localizeError(state.lastError));region.append(node); }
  $$('[data-welcome]').forEach(button=>button.onclick=guard(async()=>{if(button.dataset.welcome==='devices')return showDevices();if(!state.current)await newSession();$('#message-input').focus();}));
  region.scrollTop=region.scrollHeight;
}
function setRunning(running) { state.running=running; $('#send-message').hidden=running; $('#stop-run').hidden=!running; $('#mode-select').disabled=running; $('#model-select').disabled=running; $('#run-status').hidden=!running; if(!running)$('#run-status').textContent=''; }
function onHarnessEvent(event) {
  if(event.internal||event.message?.internal)return;
  if(event.type==='status') { $('#run-status').textContent=({awaiting_model:'正在等待模型回复…',compacting:'正在整理上下文…',executing:'正在处理工具请求…',completed:'本轮已完成',needs_user:'需要补充信息或连接设备',unknown:'操作结果待核对',budget_exhausted:'达到本轮预算，进度已保存',cancelled:'已停止',failed:'本轮未完成'})[event.status]||event.status; }
  if(event.type==='delta') { state.pending=(state.pending||'')+event.text; renderMessages(); }
  if(event.type==='message' && event.message) { const message=event.message;if(!state.messages.some(existing=>existing.id===message.id))state.messages.push(message);if(message.role==='assistant')state.pending=null;renderMessages(); }
  if(event.type==='error') { state.lastError=localizeError(event.message);renderMessages(); }
}
async function sendMessage(event) {
  event.preventDefault();if(!getBrowserCompatibility().supportedForHarness){renderPlatform();return;}const text=$('#message-input').value.trim();if(!text||state.running||state.submitting)return;
  state.submitting=true;let generation=null,sessionId=null,controller=null;
  try{
    if(!selectedProvider()){await showSettings();toast(t('status.configureModel'));return;}
    const mode=$('#mode-select').value,modelId=$('#model-select').value;
    if(!state.current)await newSession({fromSubmit:true});
    sessionId=state.current.id;await state.store.updateSession(sessionId,{mode,modelId});
    generation=++state.runGeneration;controller=new AbortController();state.abort=controller;state.lastError=null;state.pending=null;setRunning(true);$('#run-status').textContent=t('status.preparing');
    $('#message-input').value='';state.drafts.delete(sessionId);resizeInput();
    await state.harness.run({sessionId,text,mode,modelId,signal:controller.signal});
  }catch(error){
    if(generation!==null&&generation===state.runGeneration)state.lastError=error;
    else report(error);
  }finally{
    try{
      if(generation!==null&&generation===state.runGeneration){
        const messages=await state.store.getMessages(sessionId,{limit:80,includeImages:false,includeInternal:false}),session=await state.store.getSession(sessionId);
        if(generation===state.runGeneration&&state.current?.id===sessionId){state.pending=null;state.messages=messages;state.hasOlder=messages.length===80;state.messageLimit=80;state.current=session;$('#session-title').textContent=session.title;await refreshSessions();renderMessages();}
      }
    }finally{if(generation!==null&&generation===state.runGeneration){state.abort=null;setRunning(false);}state.submitting=false;}
  }
}

function resizeInput() { const input=$('#message-input');input.style.height='auto';input.style.height=Math.min(input.scrollHeight,180)+'px'; }
function panel(title,subtitle,body,metadata={}) { state.devicePanel?.dispose();state.mcpPanel?.disposeView();const titleKey=Object.hasOwn(metadata,'titleKey')?metadata.titleKey:translationKey(title),subtitleKey=Object.hasOwn(metadata,'subtitleKey')?metadata.subtitleKey:translationKey(subtitle);$('#panel-content').innerHTML=`<div class="panel-header"><div><h2 data-no-i18n${titleKey?` data-i18n="${escapeHTML(titleKey)}"`:''}>${escapeHTML(title)}</h2><p data-no-i18n${subtitleKey?` data-i18n="${escapeHTML(subtitleKey)}"`:''}>${escapeHTML(subtitle)}</p></div><button class="icon-button" id="close-panel" aria-label="关闭">×</button></div><div class="panel-body">${body}</div>`;$('#close-panel').onclick=()=>{state.codexAbort?.abort();state.modelsAbort?.abort();$('#panel-dialog').close();};if(!$('#panel-dialog').open)$('#panel-dialog').showModal(); }
function setPanelStatus(message,bad=false) { const box=$('#panel-status');if(box){setLocalizedText(box,()=>localizeError(message));box.classList.toggle('bad',bad);box.hidden=false;} }

async function showSessionMenu() {
  if(!state.current)return;const session=state.current;
  $('#action-content').innerHTML=`<h3 data-no-i18n data-i18n="session.actions">${t('session.actions')}</h3><button class="action-item" data-action="rename">重命名</button><button class="action-item" data-action="pin">${session.pinned?'取消置顶':'置顶会话'}</button><button class="action-item" data-action="copy">复制会话 ID</button><button class="action-item" data-action="export">导出会话</button><button class="action-item" data-action="archive">${session.archived?'取消归档':'归档会话'}</button><button class="action-item danger" data-action="delete">删除会话</button><button class="action-item" data-action="cancel">取消</button>`;
  $$('[data-action]').forEach(button=>button.onclick=guard(async()=>{ $('#action-dialog').close();const action=button.dataset.action;
    if(action==='rename'){showRenameDialog(session);return;}
    if(action==='pin')await state.store.updateSession(session.id,{pinned:!session.pinned});
    if(action==='archive')await state.store.updateSession(session.id,{archived:!session.archived});
    if(action==='copy'){await navigator.clipboard.writeText(session.id);toast('会话 ID 已复制。');}
    if(action==='export'){download(sessionBackupBlob(await state.store.exportSession(session.id)),`session-${session.id}.json`);toast('会话已导出。');}
    if(action==='delete'){if(!confirm(t('confirm.deleteSession')))return;if(state.running)throw new Error('请先停止任务。');await state.store.deleteSession(session.id);state.drafts.delete(session.id);$('#message-input').value='';resizeInput();state.current=null;state.messages=[];$('#session-menu').hidden=true;$('#session-title').textContent='iPhone Agent Harness';$('#session-subtitle').textContent='你的设备，你的模型，你的会话。';renderMessages();}
    await refreshSessions();if(state.current)await openSession(session.id);
  }));$('#action-dialog').showModal();
}

function showRenameDialog(session) {
  $('#action-content').innerHTML=`<form id="rename-form" style="padding:8px 12px 13px"><h3 style="margin-left:0" data-no-i18n data-i18n="session.renameTitle">${t('session.renameTitle')}</h3><label class="field"><span>名称</span><input id="rename-input" value="${escapeHTML(session.title)}" maxlength="160" required></label><div class="panel-actions"><button class="primary" type="submit">保存</button><button id="cancel-rename" type="button" class="secondary-button">取消</button></div></form>`;
  $('#cancel-rename').onclick=()=>$('#action-dialog').close();
  $('#rename-form').onsubmit=guard(async event=>{event.preventDefault();const title=$('#rename-input').value.trim();if(!title)return;await state.store.updateSession(session.id,{title});$('#action-dialog').close();await refreshSessions();await openSession(session.id);});
  $('#action-dialog').showModal();$('#rename-input').focus();$('#rename-input').select();
}

async function showSettings() {
  if(!state.store)throw state.bootError||new Error(t('settings.storageRequired'));
  const list=providers();state.providerEdit=null;const context={autoCompact:true,triggerTokens:24000,targetTokens:8000,reserveTokens:4000,maxImages:8,strategy:'model',...state.settings.context};const images={maxSide:1280,quality:0.72,...state.settings.images};
  panel('设置','模型连接与本地数据，始终由你掌握。',`
    ${languageField()}
    <div class="section-heading"><h3>账号与模型</h3><button id="add-provider">＋ 添加账号</button></div>
    ${list.length?list.map(provider=>`<div class="provider-card"><div class="card-title">${escapeHTML(provider.name||provider.model)}${state.settings.activeProviderId===provider.id?'<span class="tag">默认</span>':''}</div><div class="card-detail">${systemTextHTML(provider.protocol==='codex'?'provider.codex':provider.protocol==='anthropic'?'provider.anthropic':'provider.openai')} · ${provider.model?`${systemTextHTML('common.default')} <span data-no-i18n>${escapeHTML(provider.model)}</span> · `:""}${systemTextHTML('provider.modelCount',{count:profileModels(provider).length})}<br>${escapeHTML(provider.baseUrl)}<br>${(provider.protocol==='codex'?hasCodexAccount(provider.id):hasCredential(provider.id))?'账号凭据已在当前页面就绪':state.settings.credentialVault?.[provider.id]?'本地凭据已加密保存，待解锁':'尚未提供凭据'}</div><div class="card-actions"><button data-provider-edit="${escapeHTML(provider.id)}">编辑</button><button data-provider-default="${escapeHTML(provider.id)}">设为默认</button><button class="danger" data-provider-delete="${escapeHTML(provider.id)}">移除</button></div></div>`).join(''):'<div class="empty-card">添加你自己的模型账号。<br>每个账号可保存多个模型，分别管理凭据。</div>'}
    <div id="provider-editor"></div>
    <div class="section-heading"><h3>ChatGPT 账户登录</h3><span class="tag">设备码</span></div><p class="quiet-note">添加 Codex 订阅账号后，在对应账号里主动开始登录。浏览器跨域与服务可用性以实际返回为准；登录结果默认保留在当前页面，也可用口令加密保存。</p>
    <div id="mcp-settings"></div>
    <details class="settings-section"><summary>上下文与图片</summary><form id="context-form"><label class="check-field"><input name="autoCompact" type="checkbox" ${context.autoCompact?'checked':''}> 自动压缩较长上下文</label><div class="field-row"><label class="field"><span>触发阈值 · token</span><input name="triggerTokens" type="number" min="2048" max="2000000" step="1" value="${escapeHTML(context.triggerTokens)}" required></label><label class="field"><span>压缩目标 · token</span><input name="targetTokens" type="number" min="512" max="1000000" step="1" value="${escapeHTML(context.targetTokens)}" required></label></div><div class="field-row"><label class="field"><span>输出预留 · token</span><input name="reserveTokens" type="number" min="0" max="1000000" step="1" value="${escapeHTML(context.reserveTokens)}" required></label><label class="field"><span>上下文图片上限</span><input name="maxImages" type="number" min="1" max="24" step="1" value="${escapeHTML(context.maxImages)}" required></label></div><label class="field"><span>压缩方式</span><select name="strategy"><option value="model" ${context.strategy==='model'?'selected':''}>模型摘要</option><option value="extractive" ${context.strategy==='extractive'?'selected':''}>本地提取</option></select><small>模型摘要会使用当前账号请求后端；本地提取不额外调用模型。上下文用量为估算值，完整会话仍留在本地。</small></label><div class="field-row"><label class="field"><span>新截图最长边 · 像素</span><input name="maxSide" type="number" min="320" max="4096" step="1" value="${escapeHTML(images.maxSide)}" required></label><label class="field"><span>JPEG 质量 · 0.1–1</span><input name="quality" type="number" min="0.1" max="1" step="0.01" value="${escapeHTML(images.quality)}" required></label></div><p class="quiet-note">图片压缩设置用于后续截图与会话附件；低质量可能影响文字识别。不会重写已保存的会话图片。</p><button class="secondary-button" type="submit">保存上下文与图片设置</button><div id="context-result" class="quiet-note"></div></form></details>
    <div class="section-heading"><h3>本地存储</h3></div><div id="storage-status" class="quiet-note">正在读取存储状态…</div><div class="storage-meter"><span id="storage-fill"></span></div><div class="panel-actions"><button id="request-persistence" class="secondary-button">请求持久存储</button><button id="import-session" class="secondary-button">导入会话</button></div><p class="quiet-note">会话保存在此浏览器。清除网站数据或使用隐私浏览可能丢失记录，请主动导出重要会话。API 密钥默认仅存页面内存。可在模型连接中选择口令加密保存，刷新后主动解锁；口令不会保存。</p>
    <div id="panel-status" class="status-box" hidden></div>`);
  wireLanguageSelector();
  $('#context-form').onsubmit=guard(async event=>{event.preventDefault();const values=new FormData(event.target);const context={autoCompact:values.has('autoCompact'),triggerTokens:Number(values.get('triggerTokens')),targetTokens:Number(values.get('targetTokens')),reserveTokens:Number(values.get('reserveTokens')),maxImages:Number(values.get('maxImages')),strategy:values.get('strategy')};if(context.targetTokens+context.reserveTokens>=context.triggerTokens)throw new Error('压缩目标与输出预留之和必须小于触发阈值。');const images={maxSide:Number(values.get('maxSide')),quality:Number(values.get('quality'))};state.settings=await state.store.saveSettings({context,images});$('#context-result').textContent='设置已保存，下次请求和截图时生效。';});
  state.mcpPanel.mount($('#mcp-settings'),{endpoint:state.settings.mcpEndpoint||''});
  $('#add-provider').onclick=()=>renderProviderForm();
  $$('[data-provider-edit]').forEach(button=>button.onclick=()=>renderProviderForm(list.find(provider=>provider.id===button.dataset.providerEdit)));
  $$('[data-provider-default]').forEach(button=>button.onclick=guard(async()=>{state.settings=await state.store.saveSettings({activeProviderId:button.dataset.providerDefault});renderModelOptions();await showSettings();}));
  $$('[data-provider-delete]').forEach(button=>button.onclick=guard(async()=>{if(!confirm(t('confirm.removeProvider')))return;const remaining=providers().filter(provider=>provider.id!==button.dataset.providerDelete);const credentialVault={...state.settings.credentialVault};delete credentialVault[button.dataset.providerDelete];state.settings=await state.store.saveSettings({credentialVault,providers:remaining,activeProviderId:state.settings.activeProviderId===button.dataset.providerDelete?remaining[0]?.id||'':state.settings.activeProviderId});setCredential(button.dataset.providerDelete,'');removeCodexAccount(button.dataset.providerDelete);vaultPassphrases.delete(button.dataset.providerDelete);renderModelOptions();await showSettings();}));
  $('#import-session').onclick=()=>chooseFile('.json,application/json',async text=>{const session=await state.store.importSession(JSON.parse(text),{titleSuffix:t('session.importSuffix'),fallbackTitle:t('session.importFallback')});$('#panel-dialog').close();await refreshSessions();await openSession(session.id);toast('会话已导入。');},SESSION_BACKUP_BYTES);
  $('#request-persistence').onclick=guard(async()=>{if(!navigator.storage?.persist)throw new Error('当前浏览器未提供持久存储申请。');const granted=await navigator.storage.persist();setPanelStatus(granted?'浏览器已允许持久存储。仍建议导出重要会话。':'浏览器尚未授予持久存储。可添加到主屏幕后重试。');await renderStorage();});
  await renderStorage();
}
async function renderStorage() { const node=$('#storage-status');if(!node)return;try{const estimate=await navigator.storage?.estimate?.();const persisted=await navigator.storage?.persisted?.();const mb=value=>(value/1024/1024).toFixed(1)+' MB';node.textContent=estimate?t('settings.storageEstimate',{used:mb(estimate.usage||0),quota:mb(estimate.quota||0),mode:t(persisted?'settings.storagePersistent':'settings.storageBestEffort')}):t('settings.storageUnavailable');const fill=$('#storage-fill');if(fill&&estimate?.quota)fill.style.width=Math.min(100,100*estimate.usage/estimate.quota)+'%';}catch{node.textContent=t('settings.storageUnavailable');} }
function renderProviderForm(provider={}) {
  state.codexAbort?.abort();state.modelsAbort?.abort();state.providerEditorToken=shortId();const editorToken=state.providerEditorToken;let modelSequence=0;state.providerEdit=provider.id||null;state.providerModels=profileModels(provider);
  let login=null;
  const isCodex=()=>$('#provider-form')?.elements.protocol.value==='codex';
  const loginStatus=message=>setLocalizedText($('#codex-login-status'),()=>localizeError(message));
  const modelsStatus=({key,variables={},error,fallback=false})=>setLocalizedText($('#models-status'),()=>error?t('common.failed',{detail:localizeError(error)})+(fallback?' '+t('provider.modelsFallback'):''):t(key,variables));
  $('#provider-editor').innerHTML=`<form id="provider-form" class="provider-form"><div class="section-heading"><h3>${provider.id?'编辑模型账号':'添加模型账号'}</h3></div><p class="quiet-note" data-no-i18n data-i18n="provider.visionHelp">${t('provider.visionHelp')}</p><label class="field"><span>显示名称</span><input name="name" placeholder="例如：DeepSeek · 个人账号" value="${escapeHTML(provider.name)}" required maxlength="80"></label><label class="field"><span>账号接口</span><select name="protocol"><option value="openai" ${!['anthropic','codex'].includes(provider.protocol)?'selected':''}>OpenAI 风格 API</option><option value="anthropic" ${provider.protocol==='anthropic'?'selected':''}>Anthropic 风格 API</option><option value="codex" ${provider.protocol==='codex'?'selected':''}>Codex 订阅账号</option></select></label><label class="field" id="provider-endpoint-field"><span>API 基础地址</span><input name="baseUrl" type="url" inputmode="url" autocapitalize="none" spellcheck="false" placeholder="https://api.example.com/v1" value="${escapeHTML(provider.baseUrl)}"><small>浏览器直接请求此地址，对方需要允许跨域访问。不要在网址里填写密钥。</small></label><div id="codex-controls"><p class="quiet-note">先保存订阅账号，再开始登录。验证将在 OpenAI 官方页面完成；本页只显示服务实际签发的设备码。</p><div class="panel-actions"><button id="start-codex-login" class="secondary-button" type="button">开始设备码登录</button><button id="cancel-codex-login" class="secondary-button" type="button" hidden>取消登录</button></div><div id="codex-login-status" class="quiet-note">${provider.id&&hasCodexAccount(provider.id)?'该账号已在当前页面登录。':'该账号尚未在当前页面登录。'}</div><div id="codex-verification"></div><button id="complete-codex-login" class="secondary-button" type="button" hidden>我已完成验证，继续</button></div><label class="field"><span>默认模型 ID</span><input name="model" autocapitalize="none" spellcheck="false" placeholder="可获取模型列表，或手动填写" value="${escapeHTML(provider.model)}"></label><div class="panel-actions" style="margin-top:-4px"><button id="discover-models" class="secondary-button" type="button">获取模型</button></div><label id="discovered-models-field" class="field" hidden><span>接口返回的模型</span><select id="discovered-models" data-no-i18n></select></label><div id="models-status" class="quiet-note">${state.providerModels.length?systemTextHTML('provider.modelsSaved',{count:state.providerModels.length}):systemTextHTML('provider.modelsHint')}</div><label class="field" id="provider-secret-field"><span>API 密钥</span><input name="secret" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="${provider.id&&hasCredential(provider.id)?'已在内存中设置，留空保留':'粘贴你自己的 API 密钥'}"><small>默认仅在页面内存中使用，不进入会话或导出文件。</small></label><label class="check-field"><input name="encrypt" type="checkbox"> 用口令加密保存账号凭据到本地</label><label class="field"><span>本地解锁口令</span><input name="passphrase" type="password" autocomplete="off" placeholder="口令不会保存，丢失后需重新登录或输入 API 密钥"><small>${systemTextHTML('provider.vaultHelp')} ${systemTextHTML(state.settings.credentialVault?.[provider.id]?'provider.vaultPresent':'provider.unlockEachTime')}</small></label>${state.settings.credentialVault?.[provider.id]?'<button id="unlock-provider" type="button" class="secondary-button">解锁已有凭据</button>':''}<label class="check-field" id="provider-stream-field"><input name="stream" type="checkbox" ${provider.stream!==false?'checked':''}> 流式接收回复</label><div class="panel-actions"><button class="primary" type="submit">保存账号</button><button id="cancel-provider" class="secondary-button" type="button">取消</button></div></form>`;
  const editorForm=$('#provider-form');const editorActive=()=>state.providerEditorToken===editorToken&&$('#provider-form')===editorForm&&$('#panel-dialog').open;
  const invalidateModels=()=>{modelSequence++;state.modelsAbort?.abort();state.providerModels=[];if($('#discover-models'))$('#discover-models').disabled=false;modelsStatus({key:'provider.modelsHint'});if($('#discovered-models-field'))$('#discovered-models-field').hidden=true;};
  editorForm.elements.baseUrl.addEventListener('input',invalidateModels);
  const protocolChanged=(initial=false)=>{if(!initial)invalidateModels();state.codexAbort?.abort();login=null;const codex=isCodex(),form=$('#provider-form');$('#provider-endpoint-field').hidden=codex;form.elements.baseUrl.required=!codex;form.elements.baseUrl.disabled=codex;form.elements.model.required=!codex;$('#provider-secret-field').hidden=codex;form.elements.secret.disabled=codex;$('#provider-stream-field').hidden=codex;$('#codex-controls').hidden=!codex;$('#complete-codex-login').hidden=true;$('#cancel-codex-login').hidden=true;$('#codex-verification').replaceChildren();$('#start-codex-login').disabled=!provider.id;};
  $('#provider-form').elements.protocol.onchange=()=>protocolChanged(false);protocolChanged(true);
  const applyModels=async list=>{if(!editorActive())return;if(!Array.isArray(list)||!list.length)throw new Error('接口没有返回可用模型，可继续手动填写。');state.providerModels=list.map(model=>({id:model.id,name:model.name||model.id}));const form=$('#provider-form');if(!form)return;if(provider.id&&(isCodex()||(form.elements.protocol.value===provider.protocol&&safeURL(form.elements.baseUrl.value.trim())===safeURL(provider.baseUrl)))){state.settings=await state.store.saveSettings({providers:providers().map(item=>item.id===provider.id?{...item,models:state.providerModels,model:item.model||state.providerModels[0].id}:item)});renderModelOptions();}$('#discovered-models').innerHTML=`<option value="">${t('provider.chooseReturned')}</option>`+state.providerModels.map(model=>`<option value="${escapeHTML(model.id)}">${escapeHTML(model.name)}</option>`).join('');$('#discovered-models-field').hidden=false;if(!form.elements.model.value)form.elements.model.value=state.providerModels[0].id;modelsStatus({key:'provider.modelsFetched',variables:{count:state.providerModels.length}});setLocalizedText($('#discovered-models').options[0],()=>t('provider.chooseReturned'));};
  $('#discover-models').onclick=guard(async()=>{const button=$('#discover-models'),form=editorForm;state.modelsAbort?.abort();const controller=new AbortController();state.modelsAbort=controller;const sequence=++modelSequence;button.disabled=true;modelsStatus({key:'provider.modelsLoading'});$('#discovered-models-field').hidden=true;try{const list=isCodex()?await discoverCodexModels({accountId:provider.id,signal:controller.signal}):await discoverModels({protocol:form.elements.protocol.value,baseUrl:safeURL(form.elements.baseUrl.value.trim()),credential:form.elements.secret.value.trim()||getCredential(provider.id),signal:controller.signal});if(!editorActive()||sequence!==modelSequence||controller.signal.aborted)return;await applyModels(list);}catch(error){if(editorActive()&&sequence===modelSequence&&!controller.signal.aborted)modelsStatus({error,fallback:true});}finally{if(editorActive()&&sequence===modelSequence)button.disabled=false;}});
  $('#discovered-models').onchange=()=>{if($('#discovered-models').value)$('#provider-form').elements.model.value=$('#discovered-models').value;};
  $('#start-codex-login').onclick=guard(async()=>{if(!provider.id)throw new Error('请先保存订阅账号。');state.codexAbort?.abort();const controller=new AbortController();state.codexAbort=controller;const button=$('#start-codex-login');button.disabled=true;$('#cancel-codex-login').hidden=false;loginStatus('正在向 OpenAI 请求设备码…');try{login=await startCodexLogin({method:'device-code',flow:'codex',signal:controller.signal});if(controller.signal.aborted)return;const url=new URL(login.verification_url||login.verificationUrl);if(url.origin!=='https://auth.openai.com')throw new Error('验证链接不是预期的官方地址。');$('#codex-verification').innerHTML=`<div class="status-box">${systemTextHTML('auth.deviceCode')}: <strong>${escapeHTML(login.user_code)}</strong><br><a href="${escapeHTML(url.href)}" target="_blank" rel="noopener noreferrer">打开 OpenAI 验证页 ↗</a></div>`;$('#complete-codex-login').hidden=false;loginStatus('在官方页面确认这个设备码，再返回这里继续。');}catch(error){loginStatus(controller.signal.aborted?'登录已取消。':error);button.disabled=false;}});
  $('#cancel-codex-login').onclick=()=>{state.codexAbort?.abort();login=null;$('#codex-verification').replaceChildren();$('#complete-codex-login').hidden=true;$('#cancel-codex-login').hidden=true;$('#start-codex-login').disabled=!provider.id;loginStatus('登录已取消。');};
  $('#complete-codex-login').onclick=guard(async()=>{if(!login)throw new Error('请先开始设备码登录。');const controller=state.codexAbort,button=$('#complete-codex-login');button.disabled=true;loginStatus('正在等待 OpenAI 验证结果，可随时取消…');try{await completeCodexLogin(login,{accountId:provider.id,label:$('#provider-form').elements.name.value||provider.name,signal:controller.signal});login=null;$('#codex-verification').replaceChildren();button.hidden=true;$('#cancel-codex-login').hidden=true;$('#start-codex-login').disabled=false;loginStatus('该账号已登录。可用口令加密保存凭据。');try{await applyModels(await discoverCodexModels({accountId:provider.id,signal:controller.signal}));}catch(error){modelsStatus({error});}}catch(error){loginStatus(controller.signal.aborted?'登录已取消。':error);}finally{button.disabled=false;}});
  $('#cancel-provider').onclick=()=>{state.codexAbort?.abort();state.modelsAbort?.abort();$('#provider-editor').replaceChildren();};
  if($('#unlock-provider'))$('#unlock-provider').onclick=guard(async()=>{const form=$('#provider-form');try{const value=await unsealCredentials(state.settings.credentialVault[provider.id],form.elements.passphrase.value);if(isCodex()){registerCodexAccount(provider.id,value);vaultPassphrases.set(provider.id,form.elements.passphrase.value);loginStatus('该订阅账号已解锁到当前页面。');}else{if(!value.apiKey)throw new Error('凭据内容无效');setCredential(provider.id,value.apiKey);}form.elements.passphrase.value='';toast('账号凭据已解锁到当前页面内存。');}catch{const error=new Error('CREDENTIAL_UNLOCK_FAILED');error.code='CREDENTIAL_UNLOCK_FAILED';throw error;}});
  $('#provider-form').onsubmit=guard(async event=>{event.preventDefault();const values=new FormData(event.target),id=state.providerEdit||shortId(),codex=values.get('protocol')==='codex';const updated={id,name:String(values.get('name')).trim(),protocol:values.get('protocol'),baseUrl:codex?'':safeURL(String(values.get('baseUrl')).trim()),model:String(values.get('model')||'').trim(),models:state.providerModels,stream:codex?true:values.has('stream'),...(codex?{accountId:id}:{})};updated.models=profileModels(updated);const list=providers().filter(item=>item.id!==id);list.push(updated);const secret=String(values.get('secret')||'').trim();if(!codex&&secret)setCredential(id,secret);event.target.elements.secret.value='';let credentialVault=state.settings.credentialVault||{};if(values.has('encrypt')){const passphrase=String(values.get('passphrase')||'');if(!passphrase)throw new Error('请输入本地解锁口令。');const account=codex?getCodexAccount(id):null;if(codex&&!account)throw new Error('请先完成此订阅账号登录。');if(!codex&&!secret&&!getCredential(id))throw new Error('请先填写或解锁此账号的 API 密钥。');credentialVault={...credentialVault,[id]:await sealCredentials(codex?account.exportTokens():{apiKey:secret||getCredential(id)},passphrase)};if(codex)vaultPassphrases.set(id,passphrase);}event.target.elements.passphrase.value='';state.settings=await state.store.saveSettings({providers:list,activeProviderId:state.settings.activeProviderId||id,credentialVault});renderModelOptions();await showSettings();toast('账号已保存，尚未发起模型请求。');});
  $('#provider-form input').focus();
}

async function showDevices() {
  if(!state.store)throw state.bootError||new Error(t('settings.storageRequired'));
  if(!getBrowserCompatibility().supportedForHarness){$('#panel-dialog').close();navigate('harness');return;}
  await state.devicePanel.open();
}
// The Harness owns each run's writer ID; the UI never creates a perpetual lease.
const runDevices=new Map();
function activeInputBridge(){return state.devicePanel?.getDevice()||null;}
function requireInputBridge(){const device=activeInputBridge();if(!device){const error=new Error('DEVICE_BINDING_UNVERIFIED');error.code='DEVICE_BINDING_UNVERIFIED';throw error;}return device;}
const deviceAdapter={
  submitSegment:(...args)=>requireInputBridge().submitSegment(...args),
  getResult:(...args)=>requireInputBridge().getResult(...args),
  release:(...args)=>requireInputBridge().release(...args),
  endRun:async options=>{const device=runDevices.get(options.writerId);runDevices.delete(options.writerId);return device?device.endRun(options):{status:'not_owned',leaseInvalidated:false};},
};
async function deviceContext(meta){
  if(meta.mode==='chat')return chatExecutionContext();
  const device=activeInputBridge();
  if(!device)return {identityVerified:false,bindingVerified:false,leaseVerified:false,executionEnabled:false,inputState:'unknown',orientationEpoch:capture.orientationEpoch};
  runDevices.set(meta.runId,device);
  return device.getExecutionContext({orientationEpoch:capture.orientationEpoch,writerId:meta.runId,allowClaim:meta.allowClaim===true,renewLease:true,signal:meta.signal});
}

async function creatorIdentity(){if(!state.identity)state.identity=await openCreatorIdentity();return state.identity;}
function ownedSkill(skill){return Boolean(state.identity&&isOwnedAuthored(skill,state.identity.creatorId));}
function sourceLabel(skill){return t(ownedSkill(skill)?'skills.sourceOwned':skill.source==='builtin'?'skills.sourceBuiltin':skill.source==='community'?'skills.sourceCommunity':'skills.sourceOther');}
async function showSkills(tab=state.skillTab) {
  if(!state.store)throw state.bootError||new Error(t('settings.storageRequired'));
  state.skillTab=tab;state.skills=await state.store.listSkills();await creatorIdentity();const local=tab==='local';
  panel(t('nav.skills'),t('skills.description'),`
    <div class="panel-tabs"><button id="skills-local" class="${local?'active':''}">${t('skills.mine')} · ${state.skills.length}</button><button id="skills-catalog" class="${!local?'active':''}">${t('skills.catalog')}</button></div>
    ${local?`<div class="section-heading"><h3>${t('skills.local')}</h3><button id="create-skill">＋ ${t('skills.create')}</button></div><div class="panel-actions"><button id="import-skill" class="secondary-button">${t('skills.import')}</button><button id="creator-identity" class="secondary-button">${t('community.identity')}</button></div><div id="skill-list">${state.skills.length?state.skills.map(skill=>`<div class="skill-card"><div class="card-title">${skillTextHTML(skill,'name')}<span class="tag" data-no-i18n>${escapeHTML(skill.version||'local')}</span></div><div class="card-detail">${skillTextHTML(skill,'description')}<br><span class="skill-source">${sourceLabel(skill)}</span><br>${t(skill.enabled===false?'skills.disabled':'skills.enabled')}</div><div class="card-actions"><button data-skill-view="${escapeHTML(skill.id)}">${t('common.view')}</button>${ownedSkill(skill)?`<button data-skill-edit="${escapeHTML(skill.id)}">${t('common.edit')}</button>`:''}<button data-skill-toggle="${escapeHTML(skill.id)}">${t(skill.enabled===false?'common.enable':'common.disable')}</button><button data-skill-share="${escapeHTML(skill.id)}">${t('skills.share')}</button><button class="danger" data-skill-delete="${escapeHTML(skill.id)}">${t('common.remove')}</button></div></div>`).join(''):`<div class="empty-card">${t('community.empty')}</div>`}</div>`:`<label class="field"><span>${t('skills.catalogUrl')}</span><input id="catalog-url" type="url" value="${escapeHTML(state.settings.skillCatalogUrl||new URL('./skills/catalog.json',location.href).href)}" autocapitalize="none" spellcheck="false"></label><div class="panel-actions"><button id="load-catalog" class="primary">${t('skills.loadCatalog')}</button></div><div id="catalog-list" style="margin-top:16px"></div>`}
    <details class="settings-section"><summary>${t('settings.advanced')}</summary><label class="field"><span>${t('community.endpoint')}</span><input id="skill-publish-url" type="url" value="${escapeHTML(communityEndpoint())}" placeholder="https://community.example/api" autocapitalize="none" spellcheck="false"><small>${t('community.endpointHelp')}</small></label><button id="save-publish-url" class="secondary-button">${t('community.saveEndpoint')}</button></details><div id="panel-status" class="status-box" hidden></div>`);
  $('#skills-local').onclick=guard(()=>showSkills('local'));$('#skills-catalog').onclick=guard(()=>showSkills('catalog'));
  $('#save-publish-url').onclick=guard(async()=>{const value=$('#skill-publish-url').value.trim();state.settings=await state.store.saveSettings({communityEndpoint:value?safeURL(value):''});toast(t('common.save'));});
  if(local) {
    $('#create-skill').onclick=guard(()=>showSkillEditor());$('#creator-identity').onclick=guard(showCreatorIdentity);
    $('#import-skill').onclick=()=>chooseFile('.json,.md,.txt,text/markdown,application/json',async(text,name)=>{const imported=name.endsWith('.json')?JSON.parse(text):{name:name.replace(/\.[^.]+$/,''),content:text,version:'local'};validateSkill(imported);const skill={id:'imported-'+shortId(),name:String(imported.name||imported.title||name),description:String(imported.description||''),content:imported.content,version:String(imported.version||'local'),resources:imported.resources||{},enabled:true,source:'community',readonly:true,provenance:{kind:'community',originalId:typeof imported.id==='string'?imported.id:'',importedAt:Date.now()}};await state.store.saveSkill(skill);await showSkills('local');toast(t('skills.saved'));});
    $$('[data-skill-delete]').forEach(button=>button.onclick=guard(async()=>{if(!confirm(t('confirm.removeSkill')))return;await state.store.deleteSkill(button.dataset.skillDelete);await showSkills('local');}));
    $$('[data-skill-toggle]').forEach(button=>button.onclick=guard(async()=>{const skill=state.skills.find(item=>item.id===button.dataset.skillToggle);await state.store.saveSkill({...skill,enabled:skill.enabled===false});await showSkills('local');}));
    $$('[data-skill-view]').forEach(button=>button.onclick=()=>viewSkill(state.skills.find(item=>item.id===button.dataset.skillView)));
    $$('[data-skill-edit]').forEach(button=>button.onclick=guard(()=>showSkillEditor(state.skills.find(item=>item.id===button.dataset.skillEdit))));
    $$('[data-skill-share]').forEach(button=>button.onclick=()=>shareSkill(state.skills.find(item=>item.id===button.dataset.skillShare)));
  } else $('#load-catalog').onclick=guard(async()=>{const button=$('#load-catalog');button.disabled=true;try{const url=safeURL($('#catalog-url').value.trim());const result=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});if(!result.ok)throw new Error(`HTTP ${result.status}`);const value=await result.json();state.catalog=Array.isArray(value)?value:value.skills;if(!Array.isArray(state.catalog))throw new Error('Invalid Skill catalog');state.settings=await state.store.saveSettings({skillCatalogUrl:url});renderCatalog(url);}catch(error){setPanelStatus(error,true);}finally{button.disabled=false;}});
}
async function showSkillEditor(skill=null){
  if(!state.store)throw state.bootError||new Error(t('settings.storageRequired'));
  const identity=await creatorIdentity();if(skill&&!isOwnedAuthored(skill,identity.creatorId))throw Object.assign(new Error('SKILL_READ_ONLY'),{code:'SKILL_READ_ONLY'});
  panel(t(skill?'skills.editOwn':'skills.create'),t('skills.readOnlyHelp'),`<form id="skill-editor"><label class="field"><span>${t('skills.name')}</span><input name="name" value="${escapeHTML(skill?.name||'')}" required maxlength="120"></label><label class="field"><span>${t('skills.slug')}</span><input name="slug" value="${escapeHTML(skill?.provenance.slug||'')}" pattern="[a-z0-9][a-z0-9-]{0,63}" ${skill?'readonly':''} required autocapitalize="none" spellcheck="false"><small>${t('skills.slugHelp')}</small></label><label class="field"><span>${t('skills.summary')}</span><input name="description" value="${escapeHTML(skill?.description||'')}" maxlength="1000"></label><label class="field"><span>${t('skills.body')}</span><textarea name="content" rows="14" required data-no-i18n>${escapeHTML(skill?.content||'')}</textarea></label><div class="panel-actions"><button class="primary" type="submit">${t('common.save')}</button><button id="cancel-skill-editor" type="button" class="secondary-button">${t('common.cancel')}</button></div></form>`);
  $('#cancel-skill-editor').onclick=guard(()=>showSkills('local'));
  $('#skill-editor').onsubmit=guard(async event=>{event.preventDefault();const values=new FormData(event.target),input={name:String(values.get('name')).trim(),description:String(values.get('description')||'').trim(),content:String(values.get('content'))};if(skill)await updateAuthoredSkill({store:state.store,identity,id:skill.id,patch:input});else await createAuthoredSkill({store:state.store,identity,input:{...input,slug:String(values.get('slug')).trim()}});await showSkills('local');toast(t('skills.saved'));});
}
async function showCreatorIdentity(){
  const identity=await creatorIdentity();panel(t('community.identity'),t('community.identityHelp'),`<div class="status-box" data-no-i18n>${escapeHTML(identity.creatorId)}</div><label class="field"><span>${t('community.identityPassphrase')}</span><input id="creator-passphrase" type="password" autocomplete="off"></label><div class="panel-actions"><button id="export-identity" class="secondary-button">${t('community.backupIdentity')}</button><button id="import-identity" class="secondary-button">${t('community.restoreIdentity')}</button><button id="back-creator" class="secondary-button">${t('common.back')}</button></div><div id="panel-status" class="status-box" hidden></div>`);
  $('#back-creator').onclick=guard(()=>showSkills('local'));
  $('#export-identity').onclick=guard(async()=>{const passphrase=$('#creator-passphrase').value;const encrypted=await identity.exportEncrypted(passphrase);$('#creator-passphrase').value='';download(encrypted,'iah-creator-encrypted.json');});
  $('#import-identity').onclick=()=>{const passphrase=$('#creator-passphrase').value;chooseFile('.json,application/json',async text=>{if(!confirm(t('community.restoreConfirm')))return;state.identity=await importCreatorIdentity(JSON.parse(text),passphrase);await showCreatorIdentity();toast(t('community.identityRestored'));});};
}

function validateSkill(skill) { if(!skill||typeof skill!=='object'||Array.isArray(skill))throw new Error('Skill 文件必须是对象。');const content=skill.content||skill.instructions||skill.body;if(typeof content!=='string'||!content.trim())throw new Error('Skill 需要非空的 content、instructions 或 body 文本。');if(content.length>500000)throw new Error('Skill 内容超过大小限制。');skill.content=content; }
function viewSkill(skill) {
  const metadata=skillMetadata(skill);
  panel(metadata.name,metadata.description,`<div class="quiet-note"><span data-no-i18n>${escapeHTML(skill.version||'local')}</span> · <span data-no-i18n>${escapeHTML(skill.id)}</span><br>${sourceLabel(skill)}</div><pre class="diagnostic-json" data-no-i18n>${escapeHTML(skill.content||skill.instructions||skill.body||'')}</pre><div class="panel-actions"><button id="back-skills" class="secondary-button">${t('skills.back')}</button>${ownedSkill(skill)?`<button id="edit-viewed-skill" class="secondary-button">${t('common.edit')}</button>${getBrowserCompatibility().supportedForHarness?`<button id="refine-viewed-skill" class="secondary-button">${t('skills.refineChat')}</button>`:''}`:''}</div>`,{titleKey:metadata.nameKey,subtitleKey:metadata.descriptionKey});
  $('#back-skills').onclick=guard(()=>showSkills('local'));if($('#edit-viewed-skill'))$('#edit-viewed-skill').onclick=guard(()=>showSkillEditor(skill));if($('#refine-viewed-skill'))$('#refine-viewed-skill').onclick=guard(async()=>{$('#panel-dialog').close();navigate('harness');await newSession();$('#mode-select').value='chat';await state.store.updateSession(state.current.id,{mode:'chat'});$('#message-input').value=t('skills.refineDraft',{name:skill.name,id:skill.id});resizeInput();});
}
function shareSkill(skill) {
  const owned=ownedSkill(skill),endpoint=communityEndpoint();
  panel(t('skills.shareTitle'),t('community.localFirst'),`<div class="status-box">${skillTextHTML(skill,'name')}<br>${sourceLabel(skill)}</div><div class="panel-actions"><button id="export-skill" class="primary">${t('skills.export')}</button>${owned&&endpoint?`<button id="publish-skill" class="secondary-button">${t('skills.publish')}</button>`:''}<button id="back-skills" class="secondary-button">${t('common.back')}</button></div><p class="quiet-note">${owned?(endpoint?t('skills.publish'):t('community.exportOnly')):t('skills.readOnlyHelp')}</p><div id="panel-status" class="status-box" hidden></div>`);
  const shared={id:skill.id,name:skill.name,description:skill.description,version:skill.version,content:skill.content||skill.instructions||skill.body,resources:skill.resources};$('#export-skill').onclick=()=>download(shared,`${String(skill.id).replace(/[^a-zA-Z0-9_-]/g,'_')}.skill.json`);$('#back-skills').onclick=guard(()=>showSkills('local'));
  if($('#publish-skill'))$('#publish-skill').onclick=guard(async()=>{if(!confirm(t('confirm.publishSkill')))return;const button=$('#publish-skill');button.disabled=true;try{const client=new CommunityClient({baseUrl:endpoint,identity:await creatorIdentity()});await client.publish(skill,{explicit:true});setPanelStatus(t('community.published'));}catch(error){setPanelStatus(error,true);}finally{button.disabled=false;}});
}

function catalogInstalled(entry,catalogUrl){const sourceUrl=new URL(entry.manifestUrl||entry.url,catalogUrl).href;return state.skills.some(skill=>skill.sourceUrl===sourceUrl||(skill.packageId===entry.id&&skill.provenance?.sourceUrl===sourceUrl));}
function renderCatalog(catalogUrl) { $('#catalog-list').innerHTML=state.catalog.length?state.catalog.map((skill,index)=>`<div class="skill-card"><div class="card-title">${skillTextHTML(skill,'name',{trustedCatalog:isBuiltinCatalog(catalogUrl),catalog:true})}<span class="tag" data-no-i18n>${escapeHTML(skill.version||'')}</span></div><div class="card-detail">${skillTextHTML(skill,'description',{trustedCatalog:isBuiltinCatalog(catalogUrl),catalog:true})}</div><div class="card-actions"><button data-catalog-add="${index}">${catalogInstalled(skill,catalogUrl)?t('skills.update'):t('skills.addLocal')}</button></div></div>`).join(''):'<div class="empty-card">目录暂时没有 Skill。</div>';$$('[data-catalog-add]').forEach(button=>button.onclick=guard(async()=>{button.disabled=true;try{const entry=state.catalog[Number(button.dataset.catalogAdd)];let skill=await downloadSkill(entry,catalogUrl);validateSkill(skill);if(state.skills.some(item=>item.id===skill.id)&&!confirm(t('confirm.updateSkill')))return;await state.store.saveSkill({...skill,id:skill.id||shortId(),enabled:true});state.skills=await state.store.listSkills();toast('Skill 已保存到本地。');renderCatalog(catalogUrl);}finally{button.disabled=false;}})); }

function languageField() {
  return `<label class="field language-field"><span>${t('language.label')}</span><select class="language-select" data-no-i18n>${`<option value="auto">${t('language.auto')}</option>`+SUPPORTED_LOCALES.map(locale=>`<option value="${locale.code}">${locale.name}</option>`).join('')}</select><small>${t('language.description')}</small></label>`;
}
function wireLanguageSelector() {
  $$('.language-select').forEach(select=>{select.value=getLocalePreference();select.onchange=()=>setLocale(select.value);});
}
function showLanguageSettings(){panel(t('language.label'),t('language.description'),languageField());wireLanguageSelector();}
const localizedNodes=new WeakMap();
const localizedAttributes=new WeakMap();
let localizing=false;
const viewObserverOptions={subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','title']};
function localizeView(root=document.body) {
  if(localizing)return;localizing=true;viewObserver.disconnect();
  try{
  for(const option of root.querySelectorAll('#mode-select option'))if(['chat','plan','task'].includes(option.value)){option.dataset.i18n='mode.'+option.value;option.dataset.noI18n='';}
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
subscribe(()=>{refreshLocalizedText(document);localizeView();renderSessions();renderModelOptions();updateModeDescription();if(state.current)$('#session-subtitle').textContent=t('session.savedHere',{mode:modeLabel(state.current.mode)});wireLanguageSelector();renderPlatform();if($('#storage-status'))renderStorage();});

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
  if(url.pathname!==pathname||url.hash!==location.hash){url.pathname=pathname;history.replaceState({route},'',url);}
  return route;
}
function rememberRouteDraft(){if(state.current)state.drafts.set(state.current.id,$('#message-input').value);}
function navigate(route,{replace=false}={}){
  if(!Object.hasOwn(canonicalRoutes,route))return;
  if(state.flashing){toast(t('flash.runningNavigation'));return;}
  rememberRouteDraft();const url=new URL(routeHref(route),location.origin);
  if(url.href!==location.href)history[replace?'replaceState':'pushState']({route},'',url);
  renderPlatform();
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
window.addEventListener('popstate',()=>{rememberRouteDraft();renderPlatform();});
window.addEventListener('hashchange',()=>{rememberRouteDraft();renderPlatform();});
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
  const showHarness=ios&&!state.bootError&&route==='harness';
  $('#app').hidden=!showHarness;$('#app').inert=!showHarness||!state.harness;$('#app').setAttribute('aria-hidden',String(!showHarness));$('#site').hidden=showHarness;$('#site').inert=false;$('#site-notice').hidden=!state.bootError;if(state.bootError)$('#site-notice').textContent=t('settings.storageRequired')+' '+localizeError(state.bootError);
  $('.sidebar .brand').href=routeHref('main');
  if(showHarness){document.title='iPhone Agent Harness';return;}
  const page=['skills','flash'].includes(route)?route:'main';
  $$('#site [data-route]').forEach(link=>{link.href=routeHref(link.dataset.route);link.classList.toggle('active',link.dataset.route===page);if(link.dataset.route==='flash')link.hidden=ios;});
  $('.site-brand').href=routeHref('main');$('.sidebar .brand').href=routeHref('main');
  $('#site-language').textContent=SUPPORTED_LOCALES.find(locale=>locale.code===getLocale())?.name||'English';
  $('#site-language').onclick=showLanguageSettings;for(const link of $$('.repository-link'))link.href=SITE_CONFIG.repository;
  if(page==='skills'){renderCommunityPage();return;}
  if(page==='flash'){renderFlashPage();return;}
  $('#site-main').innerHTML=`<section class="site-hero"><div class="eyebrow">IPHONE AGENT HARNESS</div><h1>${t('home.heroTitle')}</h1><p>${t('home.subtitle')}</p><div class="site-cta">${ios?`<a class="primary" href="${routeHref('harness')}">${t('home.openHarness')} ↗</a>`:`<a class="primary" href="${routeHref('skills')}">${t('home.exploreSkills')} ↗</a>`}<a class="secondary-button" href="${routeHref(ios?'skills':'flash')}">${t(ios?'home.exploreSkills':'home.setupBridge')}</a></div>${!ios?`<p class="site-platform-note">${t('home.phoneRequirement')}</p>`:''}</section><section class="site-feature-grid"><article><span>▣</span><h2>${t('home.featureScreen')}</h2><p>${t('home.featureScreenDescription')}</p></article><article><span>◇</span><h2>${t('home.featureSkills')}</h2><p>${t('home.featureSkillsDescription')}</p></article><article><span>⌂</span><h2>${t('home.featureLocal')}</h2><p>${t('home.featureLocalDescription')}</p></article></section><section class="site-how"><h2>${t('home.setupTitle')}</h2><ol><li>${t('home.stepFlash')}</li><li>${t('home.stepWifi')}</li><li>${t('home.stepHarness')}</li></ol></section>`;
}
async function renderCommunityPage(){
  const generation=(state.communityGeneration||0)+1;state.communityGeneration=generation;
  $('#site-main').innerHTML=`<section class="site-page-heading"><div class="eyebrow">SKILLS</div><h1>${t('community.title')}</h1><p>${t('community.description')}</p><div class="panel-actions"><button id="site-own-skills" class="primary" ${state.store?'':'disabled'}>${t('skills.mine')}</button><button id="site-create-skill" class="secondary-button" ${state.store?'':'disabled'}>${t('skills.create')}</button><button id="site-identity" class="secondary-button" ${state.store?'':'disabled'}>${t('community.identity')}</button></div></section><details class="settings-section"><summary>${t('settings.advanced')}</summary><label class="field"><span>${t('community.endpoint')}</span><input id="community-endpoint" type="url" value="${escapeHTML(communityEndpoint())}" placeholder="https://community.example/api" autocapitalize="none" spellcheck="false"><small>${t('community.endpointHelp')}</small></label><button id="site-save-community" class="secondary-button" ${state.store?'':'disabled'}>${t('community.saveEndpoint')}</button></details><div id="community-status" class="quiet-note">${t(communityEndpoint()?'community.loading':'community.notConfigured')}</div><div id="community-cards" class="community-grid"></div>`;
  $('#site-own-skills').onclick=guard(()=>showSkills('local'));$('#site-create-skill').onclick=guard(()=>showSkillEditor());$('#site-identity').onclick=guard(showCreatorIdentity);$('#site-save-community').onclick=guard(async()=>{const value=$('#community-endpoint').value.trim();state.settings=await state.store.saveSettings({communityEndpoint:value?safeURL(value):''});await renderCommunityPage();});
  const endpoint=communityEndpoint();
  try{
    let entries,catalogUrl;
    if(endpoint){const client=new CommunityClient({baseUrl:endpoint});const result=await client.list();entries=result.items||[];}else{catalogUrl=new URL('./skills/catalog.json',location.href).href;const response=await fetch(catalogUrl,{credentials:'omit'});if(!response.ok)throw new Error('HTTP '+response.status);const catalog=await response.json();entries=catalog.skills||catalog;}
    if(generation!==state.communityGeneration||routeForPath(location.pathname)!=='skills'||!$('#community-cards'))return;
    if(endpoint)$('#community-status').textContent=entries.length?'':t('community.empty');else $('#community-status').textContent=t('community.notConfigured');
    $('#community-cards').innerHTML=entries.map((skill,index)=>`<article class="skill-card"><div class="card-title">${skillTextHTML(skill,'name',{trustedCatalog:!endpoint&&isBuiltinCatalog(catalogUrl),catalog:true})}<span class="tag" data-no-i18n>${escapeHTML(skill.version||'')}</span></div><p class="card-detail">${skillTextHTML(skill,'description',{trustedCatalog:!endpoint&&isBuiltinCatalog(catalogUrl),catalog:true})}</p><p class="card-detail">${endpoint?escapeHTML((skill.creatorId||'').slice(0,12)):t('community.bundled')}</p><button class="secondary-button" data-community-install="${index}" ${state.store?'':'disabled'}>${t('skills.addLocal')}</button></article>`).join('');
    $$('[data-community-install]').forEach(button=>button.onclick=guard(async()=>{button.disabled=true;try{const entry=entries[Number(button.dataset.communityInstall)];const skill=endpoint?await new CommunityClient({baseUrl:endpoint}).download(entry.creatorId,entry.slug):await downloadSkill(entry,catalogUrl);await state.store.saveSkill(skill);toast(t('skills.saved'));}finally{button.disabled=false;}}));
  }catch(error){if(generation===state.communityGeneration&&routeForPath(location.pathname)==='skills'&&$('#community-status'))$('#community-status').textContent=localizeError(error);}
}

async function renderFlashPage(){
  $('#site-main').innerHTML=`<section class="site-page-heading"><div class="eyebrow">ESP32 BRIDGE</div><h1>${t('flash.title')}</h1><p>${t('flash.description')}</p></section><div id="flash-stage" class="status-box" hidden></div><div id="flash-status" class="quiet-note">${isIOSPlatform()?t('flash.desktopRequired'):t('flash.loading')}</div><div id="flash-controls"></div><div id="usb-setup-controls"></div>`;
  if(isIOSPlatform())return;
  state.usbSetup=mountUsbSetup({container:$('#usb-setup-controls'),readSetup:readDeviceSetup,canRead:canFlash,isBusy:()=>state.flashing,setBusy:busy=>{state.flashing=busy;$('#site').classList.toggle('flashing',busy);$('#site-language').disabled=busy;if($('#flash-profile'))$('#flash-profile').disabled=busy;if($('#flash-install'))$('#flash-install').disabled=busy||!canFlash();}});
  try{
    const manifest=await loadFirmwareManifest();if(!$('#flash-controls')||routeForPath(location.pathname)!=='flash')return;
    if(manifest.stage==='diagnostic-framework'||manifest.executionEnabled===false){$('#flash-stage').hidden=false;$('#flash-stage').textContent=t('flash.diagnostic');}
    if(!manifest.profiles.length){$('#flash-status').textContent=t('flash.noProfiles');return;}
    $('#flash-status').textContent=t(canFlash()?'flash.ready':'flash.unsupported');
    $('#flash-controls').innerHTML=`<label class="field"><span>${t('flash.board')}</span><select id="flash-profile">${manifest.profiles.map(profile=>`<option value="${escapeHTML(profile.id)}">${escapeHTML(profile.label||profile.board||profile.id)}</option>`).join('')}</select></label><div id="flash-profile-detail" class="quiet-note" data-no-i18n></div><div class="panel-actions"><button id="flash-install" class="primary" ${canFlash()?'':'disabled'}>${t('flash.install')}</button></div><progress id="flash-progress" max="100" value="0" hidden></progress><details class="settings-section"><summary>${t('flash.log')}</summary><pre id="flash-log" class="diagnostic-json" data-no-i18n></pre></details>`;
    const showProfile=()=>{const profile=manifest.profiles.find(item=>item.id===$('#flash-profile').value);$('#flash-profile-detail').textContent=`${profile.chip} · ${profile.minFlashMB} MB · ${manifest.firmwareVersion||''}`;};$('#flash-profile').onchange=showProfile;showProfile();
    $('#flash-install').onclick=guard(async()=>{const profile=manifest.profiles.find(item=>item.id===$('#flash-profile').value),button=$('#flash-install'),progress=$('#flash-progress'),status=$('#flash-status'),log=$('#flash-log');button.disabled=true;state.flashing=true;$('#site').classList.add('flashing');$('#site-language').disabled=true;$('#flash-profile').disabled=true;progress.hidden=false;log.textContent='';try{const result=await flashFirmware({profile,manifestUrl:manifest.manifestUrl,onProgress:({percent})=>{progress.value=percent;status.textContent=t('flash.writing',{percent:Math.round(percent)});},onLog:text=>{log.textContent=(log.textContent+'\n'+text).slice(-20000);}});if(result.status==='flashed'&&result.verified){progress.value=100;status.textContent=t('flash.verified');}else throw new Error('Firmware operation did not return verification');}catch(error){status.textContent=localizeError(error);}finally{state.flashing=false;$('#site').classList.remove('flashing');$('#site-language').disabled=false;button.disabled=!canFlash();if($('#flash-profile'))$('#flash-profile').disabled=false;}});
  }catch(error){if($('#flash-status'))$('#flash-status').textContent=localizeError(error);}
}



async function boot() {
  renderPlatform();
  state.store=await openStore();await installBuiltinSkills(state.store);state.settings=await state.store.getSettings()||{};state.skills=await state.store.listSkills();
  state.devicePanel=createDevicePanel({store:state.store,capture,openPanel:panel,getPanelRoot:()=>$('#panel-content .panel-body'),onDeviceChange:device=>{state.device=device;$('#device-indicator').classList.toggle('verified',Boolean(device));},onSettingsChange:settings=>{state.settings=settings;},isBusy:()=>state.running||state.submitting,onToast:toast});
  state.mcpAccess=createMCPAccess();state.mcpPanel=createMCPSettings({access:state.mcpAccess,store:state.store,onSettingsChange:settings=>{state.settings=settings;}});
  state.harness=createHarness({store:state.store,onEvent:onHarnessEvent,capture,device:deviceAdapter,getContext:deviceContext,mcp:state.mcpAccess});
  $('#new-session').onclick=guard(newSession);$('#session-search').oninput=guard(refreshSessions);$('#archive-toggle').onclick=guard(async()=>{state.archived=!state.archived;await refreshSessions();});
  $('#back-sessions').onclick=()=>$('#app').classList.remove('in-conversation');$('#session-menu').onclick=guard(showSessionMenu);
  $('#open-settings').onclick=guard(showSettings);$('#open-devices').onclick=guard(showDevices);$('#open-skills').onclick=guard(()=>showSkills());$('#composer-skills').onclick=guard(()=>showSkills());
  $('#composer').onsubmit=guard(sendMessage);$('#message-input').oninput=resizeInput;$('#stop-run').onclick=()=>{state.harness.stop();state.abort?.abort();$('#run-status').textContent='正在停止…';};
  $('#mode-select').onchange=guard(async()=>{updateModeDescription();if(state.current){await state.store.updateSession(state.current.id,{mode:$('#mode-select').value});state.current.mode=$('#mode-select').value;$('#session-subtitle').textContent=t('session.savedHere',{mode:modeLabel(state.current.mode)});await refreshSessions();}});
  $('#model-select').onchange=guard(async()=>{const resolved=selectedProvider();$('#model-select').title=resolved?`${resolved.name} · ${selectionParts($('#model-select').value).modelId}`:t('provider.chooseAccountModel');if(state.current){await state.store.updateSession(state.current.id,{modelId:$('#model-select').value});state.current.modelId=$('#model-select').value;}});
  $('#panel-dialog').addEventListener('close',()=>{state.codexAbort?.abort();state.modelsAbort?.abort();state.mcpPanel?.disposeView();});
  $$('dialog').forEach(dialog=>dialog.addEventListener('close',()=>{if(dialog.contains(toastNode))hideToast(toastNode);}));
  $$('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}}));
  const resizeViewport=()=>{if(window.visualViewport?.scale===1)document.documentElement.style.setProperty('--viewport-height',window.visualViewport.height+'px');};window.visualViewport?.addEventListener('resize',resizeViewport);resizeViewport();
  renderModelOptions();renderMessages();await refreshSessions();$('#app').inert=false;localizeView();renderPlatform();
  const params=new URLSearchParams(location.search);const sessionId=params.get('session');if(sessionId)await openSession(sessionId);
}
boot().catch(error=>{console.error(error);state.bootError=error;$('#app').inert=true;renderPlatform();toast(localizeError(error));});
