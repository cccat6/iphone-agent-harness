import {getLocale,subscribe,localizeError} from '../i18n.js';
import {MCP_MESSAGES} from '../locales/mcp.js';
import {MCP_LIMITS} from '../core/mcp.js';
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function mcpEndpointForStorage(value){
  const url=new URL(value);
  if(url.username||url.password||url.hash||!['https:','http:'].includes(url.protocol)||(url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))){const error=new Error('MCP_INVALID_ENDPOINT');error.code='MCP_INVALID_ENDPOINT';throw error;}
  return url.origin+url.pathname;
}

// Saved entries contain public connection details only. Each live connection has
// its own cancellation generation, so editing one server cannot revive old work.
export function createMCPSettingsModel({access,store,onSettingsChange=()=>{},onChange=()=>{}}){
  let rows=[],writes=Promise.resolve(),localWrites=Promise.resolve();
  const localId=id=>'mcp:'+id;
  // Hydration and saves share an ordered queue. Capture only the requested
  // changes: a row may still hold its empty placeholder while IndexedDB loads.
  const saveLocal=(row,patch=row.local)=>{const changes=structuredClone(patch),revision=row.localRevision||0;return localWrites=localWrites.catch(()=>{}).then(async()=>{await row.ready;if((row.localRevision||0)!==revision)return;if(row.localLoadError)throw row.localLoadError;const value={...row.local,...changes};await store.saveLocalCredential(localId(row.id),value);row.local=value;});};
  const fail=(row,error)=>{row.failure=error;onChange();};
  const rowFor=id=>{const row=rows.find(row=>row.id===id);if(!row)throw new Error('MCP_NOT_CONFIGURED');return row;};
  const snapshot=id=>access.getSnapshot().find(value=>value.id===id);
  function stop(row){row.generation++;row.controller?.abort();row.controller=null;row.connecting=false;access.disconnect(row.id);row.failure=null;}
  function persist(){
    const servers=rows.flatMap(row=>row.saved?[{...row.saved}]:[]);
    const pending=writes.catch(()=>{}).then(async()=>{const settings=await store.saveSettings({mcpServers:servers,mcpEndpoint:''});onSettingsChange(settings);return settings;});
    writes=pending;return pending;
  }
  return {
    load({servers=[],endpoint=''}={}){
      const previousRows=rows;
      const source=Array.isArray(servers)&&servers.length?servers:endpoint?[{id:'default',name:'',endpoint}]:[];
      const ids=new Set();rows=[];
      for(const value of source.slice(0,MCP_LIMITS.servers)){
        if(!value||typeof value.endpoint!=='string')continue;
        const id=typeof value.id==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(value.id)&&!ids.has(value.id)?value.id:crypto.randomUUID();ids.add(id);
        let publicEndpoint;try{publicEndpoint=mcpEndpointForStorage(value.endpoint);}catch{continue;}
        const local={endpoint:value.endpoint,token:'',allowedTools:[],enabled:false,reconnect:false};
        const name=String(value.name||new URL(publicEndpoint).hostname).slice(0,120),live=snapshot(id);
        // Startup restoration belongs to the app, not the settings view. Keep
        // its row and cancellation generation when the same view is reopened.
        const restoring=previousRows.find(row=>row.backgroundRestore&&row.id===id&&row.name===name&&row.saved?.endpoint===publicEndpoint&&!row.editedEndpoint);
        if(restoring){rows.push(restoring);continue;}
        const row={id,name,endpoint:live?.url||local.endpoint,local,saved:{id,name,endpoint:publicEndpoint},generation:0,connecting:false,controller:null,failure:null};rows.push(row);
        row.ready=localWrites.catch(()=>{}).then(()=>store.getLocalCredential(localId(id))).then(saved=>{if(row.editedEndpoint)return;if(saved&&typeof saved.endpoint==='string'&&mcpEndpointForStorage(saved.endpoint)===publicEndpoint){row.local={endpoint:saved.endpoint,token:typeof saved.token==='string'?saved.token:'',allowedTools:Array.isArray(saved.allowedTools)?saved.allowedTools.filter(n=>typeof n==='string').slice(0,MCP_LIMITS.allowedTools):[],enabled:saved.enabled===true,reconnect:saved.reconnect===true};row.endpoint=live?.url||saved.endpoint;}onChange();}).catch(error=>{row.localLoadError=error;if(rows.includes(row))fail(row,error);});
      }
      for(const row of previousRows)if(!rows.includes(row)&&row.connecting)stop(row);
      return this.getRows();
    },
    getRows(){return rows.map(({controller,saved,local,ready,...row})=>({...row,hasToken:Boolean(local.token),saved:Boolean(saved),connection:snapshot(row.id)}));},
    async restore(options){
      this.load(options);const restoring=rows.map(row=>{row.backgroundRestore=true;return {row,generation:row.generation};});
      await Promise.all(restoring.map(async({row,generation})=>{try{await row.ready;if(rows.includes(row)&&row.generation===generation&&row.local.reconnect&&!snapshot(row.id)?.connected&&!row.connecting)await this.connect(row.id);}finally{row.backgroundRestore=false;}}));
      return this.getRows();
    },
    add(){if(rows.length>=MCP_LIMITS.servers)throw new Error('MCP_CONFIGURATION_INVALID');const row={id:crypto.randomUUID(),name:'',endpoint:'',local:{endpoint:'',token:'',allowedTools:[],enabled:false,reconnect:false},saved:null,generation:0,connecting:false,controller:null,failure:null};rows.push(row);onChange();return row.id;},
    edit(id,patch){const row=rowFor(id);stop(row);if('name'in patch)row.name=String(patch.name).slice(0,120);if('endpoint'in patch){const endpoint=String(patch.endpoint);if(endpoint!==row.endpoint){row.localRevision=(row.localRevision||0)+1;row.editedEndpoint=true;row.local={endpoint,token:'',allowedTools:[],enabled:false,reconnect:false};}row.endpoint=endpoint;}onChange();},
    async remove(id){const row=rowFor(id),position=rows.indexOf(row);row.localRevision=(row.localRevision||0)+1;stop(row);rows.splice(position,1);onChange();try{await persist();await localWrites.catch(()=>{});await store.deleteLocalCredential(localId(id));}catch(error){rows.splice(Math.min(position,rows.length),0,row);row.failure=error;onChange();throw error;}},
    async disconnect(id){const row=rowFor(id);stop(row);try{if(row.saved)await saveLocal(row,{reconnect:false});}catch(error){fail(row,error);}onChange();},
    async connect(id,token){
      const row=rowFor(id);stop(row);const generation=row.generation,controller=new AbortController();row.controller=controller;row.connecting=true;onChange();
      const current=()=>rows.includes(row)&&generation===row.generation&&!controller.signal.aborted;
      try{
        await row.ready;if(!current())return;if(row.localLoadError)throw row.localLoadError;
        const endpoint=mcpEndpointForStorage(row.endpoint.trim()),name=row.name.trim()||new URL(endpoint).hostname;
        const previous=row.saved;row.saved={id,name,endpoint};row.local={...row.local,endpoint:row.endpoint.trim(),...(token!==undefined?{token}:{}),reconnect:true};await saveLocal(row);if(!current())return;try{await persist();}catch(error){if(current())row.saved=previous;throw error;}
        if(!current())return;row.name=name;access.configure({id,name,url:row.endpoint.trim(),token:row.local.token||''});await access.connect(id,{signal:controller.signal});
        if(!current())return;const available=new Set(snapshot(id)?.tools.map(tool=>tool.name)||[]),allowed=(row.local.allowedTools||[]).filter(name=>available.has(name));access.setAllowedTools(id,allowed);access.setEnabled(id,Boolean(row.local.enabled&&allowed.length));row.failure=null;
      }catch(error){if(current()){access.disconnect(id);row.failure=error;}}
      finally{if(current()){row.connecting=false;row.controller=null;onChange();}}
    },
    async select(id,names){const row=rowFor(id);access.setAllowedTools(id,names);if(!names.length)access.setEnabled(id,false);row.failure=null;try{await saveLocal(row,{allowedTools:[...names],...(!names.length?{enabled:false}:{})});}catch(error){fail(row,error);}onChange();},
    async enable(id,enabled){const row=rowFor(id);access.setEnabled(id,enabled);row.failure=null;try{await saveLocal(row,{enabled});}catch(error){fail(row,error);}onChange();},
    cancelPending(){for(const row of rows)if(row.connecting&&!row.backgroundRestore)stop(row);},
  };
}

export function createMCPSettings({access,store,onSettingsChange=()=>{}}){
  let root=null,unsubscribe=null;
  const copy=(key,params={})=>(MCP_MESSAGES[getLocale()]||MCP_MESSAGES.en)[key].replace(/\{(\w+)\}/g,(match,name)=>params[name]===undefined?match:String(params[name]));
  const model=createMCPSettingsModel({access,store,onSettingsChange,onChange:paint});
  const live=()=>Boolean(root?.isConnected);
  function paint(){
    if(!live())return;
    const rows=model.getRows(),list=root.querySelector('[data-mcp-servers]');
    for(const existing of list.querySelectorAll('[data-mcp-row]'))if(!rows.some(row=>row.id===existing.dataset.mcpRow))existing.remove();
    for(const row of rows){
      let card=[...list.querySelectorAll('[data-mcp-row]')].find(element=>element.dataset.mcpRow===row.id);
      if(!card){
        card=document.createElement('details');card.dataset.mcpRow=row.id;card.className='mcp-server-card';card.open=!row.saved;
        card.innerHTML=`<summary><strong data-mcp-title></strong><span class="quiet-note" data-mcp-summary data-mcp-status role="status"></span></summary><div class="mcp-server-body"><label class="field"><span data-mcp-copy="name"></span><input data-mcp-name maxlength="120" autocomplete="off"></label><label class="field"><span data-mcp-copy="endpoint"></span><input data-mcp-endpoint type="url" inputmode="url" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="https://example.com/mcp"></label><label class="field"><span data-mcp-copy="token"></span><input data-mcp-token type="password" autocomplete="off" autocapitalize="none" spellcheck="false"></label><div class="panel-actions"><button type="button" data-mcp-connect class="primary" data-mcp-copy="connect"></button><button type="button" data-mcp-disconnect class="secondary-button" data-mcp-copy="disconnect"></button><button type="button" data-mcp-remove class="secondary-button" data-mcp-copy="remove"></button></div><div data-mcp-tools></div><label class="check-field"><input type="checkbox" data-mcp-enable><span data-mcp-copy="enable"></span></label></div>`;
        list.append(card);
        const find=selector=>card.querySelector(selector);
        find('[data-mcp-name]').value=row.name;find('[data-mcp-endpoint]').value=row.endpoint;
        find('[data-mcp-name]').oninput=event=>model.edit(row.id,{name:event.target.value});
        find('[data-mcp-endpoint]').oninput=event=>model.edit(row.id,{endpoint:event.target.value});
        find('[data-mcp-token]').oninput=()=>model.edit(row.id,{});
        find('[data-mcp-connect]').onclick=()=>{const token=find('[data-mcp-token]').value.trim()||undefined;find('[data-mcp-token]').value='';return model.connect(row.id,token);};
        find('[data-mcp-disconnect]').onclick=()=>{find('[data-mcp-token]').value='';model.disconnect(row.id);};
        find('[data-mcp-remove]').onclick=()=>model.remove(row.id).catch(()=>{});
        find('[data-mcp-enable]').onchange=event=>model.enable(row.id,event.target.checked);
      }
      const find=selector=>card.querySelector(selector),value=row.connection,allowed=new Set(value?.allowedTools||[]),enabled=value?.enabled===true;
      const nameField=find('[data-mcp-name]');if(nameField.value!==row.name)nameField.value=row.name;const endpointField=find('[data-mcp-endpoint]');if(document.activeElement!==endpointField&&endpointField.value!==row.endpoint)endpointField.value=row.endpoint;
      find('[data-mcp-connect]').disabled=row.connecting;find('[data-mcp-disconnect]').disabled=!value&&!row.connecting;
      const toggle=find('[data-mcp-enable]');toggle.checked=enabled;toggle.disabled=row.connecting||!value?.connected||!allowed.size;
      find('[data-mcp-title]').textContent=row.name||copy('newServer');find('[data-mcp-token]').placeholder=copy(row.hasToken?'tokenSaved':'tokenPlaceholder');
      const output=find('[data-mcp-status]');output.textContent=row.failure?localizeError(row.failure):copy(row.connecting?'connecting':enabled?'active':value?.connected?'connected':'disabled',{count:enabled?allowed.size:value?.tools?.length||0});output.classList.toggle('bad',Boolean(row.failure));find('[data-mcp-summary]').textContent=output.textContent;
      const tools=value?.connected?value.tools:[];
      find('[data-mcp-tools]').innerHTML=tools.length?`<h3 style="font-size:13px">${copy('allowTitle')}</h3>`+tools.map(tool=>`<label class="check-field mcp-tool-choice" style="align-items:flex-start;gap:10px;margin:12px 0"><input type="checkbox" data-mcp-tool="${escapeHTML(tool.name)}" ${allowed.has(tool.name)?'checked':''}><span style="min-width:0;overflow-wrap:anywhere"><strong>${escapeHTML(tool.name)}</strong><small style="display:block;font-weight:400;line-height:1.5">${escapeHTML(String(tool.description||copy('noDescription')).slice(0,1200))}</small></span></label>`).join(''):value?.connected?`<p class="quiet-note">${copy('empty')}</p>`:'';
      for(const checkbox of card.querySelectorAll('[data-mcp-tool]'))checkbox.onchange=()=>model.select(row.id,[...card.querySelectorAll('[data-mcp-tool]:checked')].map(input=>input.dataset.mcpTool));
    }
    for(const element of root.querySelectorAll('[data-mcp-copy]'))element.textContent=copy(element.dataset.mcpCopy);
    root.querySelector('[data-mcp-add]').disabled=rows.length>=MCP_LIMITS.servers;
  }
  function disposeView(){model.cancelPending();unsubscribe?.();unsubscribe=null;root=null;}
  function mount(container,options={}){
    disposeView();model.load(options);root=container;root.dataset.noI18n='';
    root.innerHTML='<details class="settings-section"><summary data-mcp-copy="settingsTitle"></summary><div data-mcp-servers></div><button type="button" class="secondary-button" data-mcp-add data-mcp-copy="add" style="margin-top:16px"></button></details>';
    root.querySelector('[data-mcp-add]').onclick=()=>{const id=model.add();[...root.querySelectorAll('[data-mcp-row]')].find(card=>card.dataset.mcpRow===id)?.querySelector('[data-mcp-name]').focus();};
    unsubscribe=subscribe(paint);paint();
  }
  return {mount,disposeView,restore:options=>model.restore(options)};
}
