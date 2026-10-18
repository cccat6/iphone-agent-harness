import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../../apps/web/core/store.js';
import {DeviceClient} from '../../apps/web/core/device.js';
import {createDevicePanel} from '../../apps/web/ui/device-panel.js';
import {mountUsbSetup} from '../../apps/web/ui/usb-setup.js';
import {createMCPSettings} from '../../apps/web/ui/mcp-settings.js';
import {getLocalePreference,setLocale,SUPPORTED_LOCALES} from '../../apps/web/i18n.js';
import {DEVICE_MESSAGES} from '../../apps/web/locales/device.js';
import {ERROR_CATALOG} from '../../apps/web/core/error-catalog.js';

const endpoint='https://identity-r9.local',fingerprint='d'.repeat(64);
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function patch(t,key,value){const old=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});t.after(()=>old?Object.defineProperty(globalThis,key,old):delete globalThis[key]);}

// Deliberately small DOM adapter: tests production panel handlers and their
// asynchronous ownership, not rendering, native events or browser IndexedDB.
function panelFixture(t,store,clientFactory){
 const fields=new Map();
 const field=selector=>{if(!fields.has(selector))fields.set(selector,{value:'',checked:false,dataset:{},classList:{toggle(){}},addEventListener(){},replaceChildren(){},append(){}});return fields.get(selector);};
 const root={isConnected:true,querySelector:field,querySelectorAll:()=>[],closest:()=>null};
 const holder={querySelector:()=>root,contains:element=>element===root};
 patch(t,'document',{documentElement:{},querySelector:()=>({}),createElement:()=>({}),head:{append(){}}});
 const panel=createDevicePanel({store,clientFactory,bridgeFactory:()=>({open:async()=>{},close(){}}),capture:{active:false},openPanel(){},getPanelRoot:()=>holder});
 const fill=()=>{field('[data-address]').value=endpoint;field('[data-fingerprint]').value=fingerprint;field('[data-pin-confirmed]').checked=true;};
 t.after(()=>panel.dispose());return {panel,field,fill};
}

test('independent R9: canonical aliases converge while settings writers retain encrypted vaults and public metadata',async()=>{
 const store=await openStore({memory:true}),vault={version:1,salt:[1],iv:[2],data:[3]};
 await store.saveSettings({credentialVault:{'device:retained':vault},providers:[{id:'provider',key:'must-not-persist'}]});
 const [first,second]=await Promise.all([store.ensureDeviceClientId('https://IDENTITY-R9.local:443/'),store.ensureDeviceClientId(endpoint),store.saveSettings({locale:'ja'})]);
 assert.equal(first,second);assert.notEqual(await store.ensureDeviceClientId(endpoint+':444'),first);
 const settings=await store.getSettings();assert.deepEqual(settings.credentialVault,{'device:retained':vault});assert.deepEqual(settings.providers,[{id:'provider'}]);assert.equal(settings.locale,'ja');
 settings.deviceClientIds[endpoint]='mutated-return-value';assert.equal(await store.ensureDeviceClientId(endpoint),first);
 const before=await store.getSettings();for(const invalid of ['http://identity-r9.example','https://user@identity-r9.local','https://identity-r9.local:444/pair','https://identity-r9.local?','https://identity-r9.local#'])await assert.rejects(store.ensureDeviceClientId(invalid));
 assert.deepEqual(await store.getSettings(),before);
});

test('independent R9: closing the panel during local ID allocation prevents owner pairing and clears its password field',async t=>{
 const store=await openStore({memory:true}),entered=deferred(),allocated=deferred();let factories=0;
 store.ensureDeviceClientId=async()=>{entered.resolve();return allocated.promise;};
 const f=panelFixture(t,store,()=>{factories++;throw new Error('must not create a network client');});await f.panel.open();f.fill();
 const pending=f.field('[data-pair]').onclick();await entered.promise;f.panel.dispose();allocated.resolve('existing-public-id');await pending;
 assert.equal(factories,0);assert.equal(f.panel.getDevice(),null);assert.equal((await store.getSettings()).deviceEndpoint,undefined);
});

for(const preexisting of [false,true])test(`independent R9: saved local credential ${preexisting?'respects an existing ID':'keeps a stable ID'} after clearing the saved credential`,async t=>{
 const store=await openStore({memory:true}),legacyId='restored-r9-client',storedId=preexisting?await store.ensureDeviceClientId(endpoint):null;
 const record={format:'iah-device-credential/1',baseUrl:endpoint,expectedFingerprint:fingerprint,publicKeyFingerprint:fingerprint,boardId:'board-r9',clientId:legacyId,token:'legacy-token-r9-1234567890',hostname:'identity-r9.local'};
 await store.saveLocalCredential('device:'+endpoint,record);
 const pairs=[],clients=[];const fetchImpl=async(url,options={})=>{
  const identity={boardId:'board-r9',bootId:'boot-r9',hostname:'identity-r9.local',publicKeyFingerprint:fingerprint};
  if(url.pathname==='/v1/identity')return Response.json(identity);
  if(url.pathname==='/v1/pair'){const body=JSON.parse(options.body);pairs.push(body);return Response.json({...identity,clientId:body.clientId,token:'fresh-token-r9-1234567890'});}
  assert.equal(url.pathname,'/v1/binding');const owner=options.headers.Authorization.includes('legacy-token')?legacyId:pairs.at(-1).clientId;
  return Response.json({...identity,clientId:owner,bindingVerified:false,targetId:null,targets:[]});
 };
 const f=panelFixture(t,store,options=>{const client=new DeviceClient({...options,fetchImpl});clients.push(client);return client;});await f.panel.open();f.fill();
 await f.field('[data-pair]').onclick();assert.equal(clients.length,1);assert.equal(clients[0].clientId,legacyId);assert.equal(f.panel.getDevice(),null);
 const retainedId=await store.ensureDeviceClientId(endpoint);await store.deleteLocalCredential('device:'+endpoint);await f.field('[data-pair]').onclick();assert.equal(pairs.length,1);assert.equal(pairs[0].clientId,storedId||retainedId);assert.equal(await store.ensureDeviceClientId(endpoint),storedId||retainedId);assert.equal(clients[1].bindingVerified,false);assert.equal(f.panel.getDevice(),null);
 const settings=await store.getSettings();assert.equal((await store.getLocalCredential('device:'+endpoint)).token,'fresh-token-r9-1234567890');assert.equal(settings.deviceEndpoint,endpoint);assert.equal(JSON.stringify(settings).includes(record.token),false);assert.equal(JSON.stringify(settings).includes('synthetic-owner-r9'),false);
});

test('independent R9: displayed device form validation detail follows locale without another action',async t=>{
 const prior=getLocalePreference();t.after(()=>setLocale(prior));setLocale('en');const store=await openStore({memory:true}),f=panelFixture(t,store,()=>{throw new Error('no request expected');});
 await f.panel.open();f.fill();f.field('[data-fingerprint]').value='invalid';await f.field('[data-pair]').onclick();
 assert.ok(f.field('[data-device-status]').textContent.includes(DEVICE_MESSAGES.en.invalidFingerprint));
 for(const {code} of SUPPORTED_LOCALES){setLocale(code);assert.ok(f.field('[data-device-status]').textContent.includes(DEVICE_MESSAGES[code].invalidFingerprint),code+': '+f.field('[data-device-status]').textContent);assert.equal(f.field('[data-fingerprint]').value,'invalid');}
});

test('USB setup link stays masked and localized without extra serial reads or certificate downloads',async t=>{
 const prior=getLocalePreference();t.after(()=>setLocale(prior));setLocale('en');const fields=new Map();let reads=0;
 const container={isConnected:true,dataset:{},innerHTML:'',querySelector:selector=>{if(!fields.has(selector))fields.set(selector,{});return fields.get(selector);},replaceChildren(){}};
 const view=mountUsbSetup({container,canRead:()=>true,readSetup:async()=>{reads++;return {boardId:'board-r9',apSsid:'synthetic',apPassword:'synthetic',setupPassword:'c'.repeat(64),httpUrl:'http://identity-r9.local',caReady:false,publicKeyFingerprint:fingerprint};}});t.after(()=>view.dispose());
 await container.querySelector('[data-usb-read]').onclick();
 for(const {code} of SUPPORTED_LOCALES){setLocale(code);assert.ok(container.innerHTML.includes(DEVICE_MESSAGES[code].setupLink),code);assert.ok(container.innerHTML.includes('type="password"'));assert.ok(!container.innerHTML.includes('data-usb-profile'));}assert.equal(reads,1);
 await container.querySelector('[data-usb-clear]').onclick();assert.ok(!container.innerHTML.includes('data-usb-information'));
});

test('independent R9: MCP retains an error code for all eight locale changes without reconnecting',async t=>{
 const prior=getLocalePreference();t.after(()=>setLocale(prior));setLocale('en');let connects=0;
 // Structural adapter only; the native-DOM companion fixture exercises clicks,
 // card creation, focus, multiple servers and locale rendering in a browser.
 const element=()=>{const fields=new Map();return {isConnected:true,dataset:{},style:{},children:[],value:'',classList:{toggle(){}},
  querySelector(selector){if(!fields.has(selector))fields.set(selector,element());return fields.get(selector);},
  querySelectorAll(selector){return selector==='[data-mcp-row]'?this.children.filter(child=>child.dataset.mcpRow):[];},append(child){this.children.push(child);child.remove=()=>this.children.splice(this.children.indexOf(child),1);},focus(){},};};
 const container=element();patch(t,'document',{documentElement:{},createElement:element,head:{append(){}}});
 const error=Object.assign(new Error('synthetic unlocalized diagnostic'),{code:'MCP_INVALID_ENDPOINT'}),access={getSnapshot:()=>[],disconnect(){},configure(){},async connect(){connects++;throw error;}};
 const view=createMCPSettings({access,store:await openStore({memory:true})});view.mount(container,{servers:[{id:'r9',name:'R9',endpoint:'https://mcp-r9.invalid/mcp'}]});t.after(()=>view.disposeView());const card=container.querySelector('[data-mcp-servers]').querySelectorAll('[data-mcp-row]')[0];card.querySelector('[data-mcp-token]').value='synthetic-token-r9';await card.querySelector('[data-mcp-connect]').onclick();
 for(const {code} of SUPPORTED_LOCALES){setLocale(code);assert.equal(card.querySelector('[data-mcp-status]').textContent,ERROR_CATALOG.MCP_INVALID_ENDPOINT[code]);}assert.equal(connects,1);assert.equal(card.querySelector('[data-mcp-token]').value,'');
});
