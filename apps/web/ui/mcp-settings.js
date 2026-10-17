import {getLocale,subscribe,localizeError} from '../i18n.js';
import {MCP_MESSAGES} from '../locales/mcp.js';
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function mcpEndpointForStorage(value){
  const url=new URL(value);
  if(url.username||url.password||url.hash){const error=new Error('MCP_INVALID_ENDPOINT');error.code='MCP_INVALID_ENDPOINT';throw error;}
  return url.origin+url.pathname;
}
/** Fixed HTTP MCP permission editor; only real directory entries can be enabled. */
export function createMCPSettings({access,store,onSettingsChange=()=>{}}){
  const id='default';let root=null,controller=null,sequence=0,connecting=false,unsubscribe=null,savedEndpoint='',status='disabled',failure='';
  const copy=(key,params={})=>(MCP_MESSAGES[getLocale()]||MCP_MESSAGES.en)[key].replace(/\{(\w+)\}/g,(match,name)=>params[name]===undefined?match:String(params[name]));
  const snapshot=()=>access.getSnapshot().find(connection=>connection.id===id);
  const live=()=>Boolean(root?.isConnected);
  const find=selector=>root?.querySelector(selector);
  function disconnect(){sequence++;controller?.abort();controller=null;connecting=false;access.disconnect(id);status='disabled';failure='';}
  function paint(){
    if(!live())return;for(const element of root.querySelectorAll('[data-mcp-copy]'))element.textContent=copy(element.dataset.mcpCopy);
    const value=snapshot(),allowed=new Set(value?.allowedTools||[]),enabled=value?.enabled===true;
    find('[data-mcp-connect]').disabled=connecting;find('[data-mcp-disconnect]').disabled=!value&&!connecting;
    const toggle=find('[data-mcp-enable]');toggle.checked=enabled;toggle.disabled=connecting||!value?.connected||!allowed.size;
    const output=find('[data-mcp-status]');output.textContent=failure?localizeError(failure):copy(connecting?'connecting':enabled?'active':value?.connected?'connected':status,{name:value?.name||copy('server'),count:enabled?allowed.size:value?.tools?.length||0});output.classList.toggle('bad',Boolean(failure));
    const tools=value?.connected?value.tools:[];
    find('[data-mcp-tools]').innerHTML=tools.length?tools.map(tool=>`<label class="check-field mcp-tool-choice" style="align-items:flex-start;gap:10px;margin:14px 0"><input type="checkbox" data-mcp-tool="${escapeHTML(tool.name)}" ${allowed.has(tool.name)?'checked':''} ${connecting?'disabled':''}><span style="min-width:0;overflow-wrap:anywhere"><strong>${escapeHTML(tool.name)}</strong><small style="display:block;font-weight:400;line-height:1.7">${escapeHTML(String(tool.description||copy('noDescription')).slice(0,1200))}</small></span></label>`).join(''):value?.connected?`<p class="quiet-note">${copy('empty')}</p>`:'';
    for(const checkbox of root.querySelectorAll('[data-mcp-tool]'))checkbox.onchange=()=>{try{const names=[...root.querySelectorAll('[data-mcp-tool]:checked')].map(input=>input.dataset.mcpTool);access.setAllowedTools(id,names);if(!names.length)access.setEnabled(id,false);failure='';paint();}catch(error){failure=error;paint();}};
  }
  function disposeView(){if(connecting)disconnect();unsubscribe?.();unsubscribe=null;root=null;}
  function mount(container,{endpoint=''}={}){
    disposeView();root=container;savedEndpoint=endpoint;root.dataset.noI18n='';
    const value=snapshot();root.innerHTML=`<details class="settings-section"><summary data-mcp-copy="settingsTitle"></summary><p class="quiet-note" data-mcp-copy="help"></p><label class="field"><span data-mcp-copy="endpoint"></span><input data-mcp-endpoint type="url" inputmode="url" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="https://your-service.example/mcp" value="${escapeHTML(value?.url||endpoint)}"></label><label class="field"><span data-mcp-copy="token"></span><input data-mcp-token type="password" autocomplete="off" autocapitalize="none" spellcheck="false"></label><div class="panel-actions"><button type="button" data-mcp-connect class="secondary-button" data-mcp-copy="connect"></button><button type="button" data-mcp-disconnect class="secondary-button" data-mcp-copy="disconnect"></button></div><div class="quiet-note" data-mcp-status role="status" style="margin:14px 0;white-space:pre-wrap;overflow-wrap:anywhere"></div><h3 style="font-size:13px" data-mcp-copy="allowTitle"></h3><div data-mcp-tools></div><label class="check-field"><input type="checkbox" data-mcp-enable><span data-mcp-copy="enable"></span></label><p class="quiet-note" data-mcp-copy="modeHelp"></p><p class="quiet-note" data-mcp-copy="scopeHelp"></p><p class="quiet-note" data-mcp-copy="memoryHelp"></p><p class="quiet-note" data-mcp-copy="queryHelp"></p></details>`;
    for(const field of [find('[data-mcp-endpoint]'),find('[data-mcp-token]')])field.oninput=()=>{disconnect();paint();};
    find('[data-mcp-disconnect]').onclick=()=>{disconnect();find('[data-mcp-token]').value='';paint();};
    find('[data-mcp-enable]').onchange=event=>{try{access.setEnabled(id,event.target.checked);failure='';paint();}catch(error){failure=error;paint();}};
    find('[data-mcp-connect]').onclick=async()=>{
      if(connecting)return;const formRoot=root,urlText=find('[data-mcp-endpoint]').value.trim(),tokenField=find('[data-mcp-token]'),token=tokenField.value.trim();tokenField.value='';disconnect();const current=sequence;controller=new AbortController();const signal=controller.signal;connecting=true;paint();
      try{
        const url=new URL(urlText),publicEndpoint=mcpEndpointForStorage(url.href);
        access.configure({id,name:url.hostname,url:url.href,token});await access.connect(id,{signal});
        if(!live()||root!==formRoot||current!==sequence||signal.aborted)return;
        savedEndpoint=publicEndpoint;const settings=await store.saveSettings({mcpEndpoint:savedEndpoint});onSettingsChange(settings);status='connected';failure='';
      }catch(error){if(live()&&root===formRoot&&current===sequence&&!signal.aborted){access.disconnect(id);failure=error;}}
      finally{if(root===formRoot&&current===sequence){connecting=false;controller=null;paint();}}
    };
    unsubscribe=subscribe(paint);paint();
  }
  return {mount,disposeView};
}
