import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createConversationFollow} from '../../apps/web/ui/message-presentation.js';
const source=await readFile(new URL('../../apps/web/app.js',import.meta.url),'utf8');
function fixture({height=1000,client=300,top=700,content=true}={}){
 const events=new Map(),frames=new Map(),changes=[],writes=[];let next=0,momentum=true,observed,disconnected=false,overflow='auto';
 const style={scrollBehavior:'auto',get overflow(){return overflow;},set overflow(v){writes.push(v);overflow=v;if(v==='hidden')momentum=false;}},region={scrollHeight:height,clientHeight:client,scrollTop:top,style,get offsetHeight(){return this.clientHeight;},addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
 class Observer{constructor(fn){observed=fn;}observe(node){assert.equal(node,region);}disconnect(){disconnected=true;}}
 const follow=createConversationFollow({region,hasContent:()=>content,onChange:value=>changes.push(value),ResizeObserver:Observer,requestFrame:fn=>{frames.set(++next,fn);return next;},cancelFrame:id=>frames.delete(id)});
 return {follow,region,events,changes,writes,resize(value){region.clientHeight=value;observed();},get disconnected(){return disconnected;},inertia(){if(momentum){region.scrollTop-=90;events.get('scroll')();}},flush(){for(const [id,fn]of [...frames]){frames.delete(id);fn();}}};
}
test('no-overflow gestures and an empty welcome never pause automatic following',()=>{
 for(const options of [{height:250,client:300,top:0},{height:500,client:300,top:0,content:false}]){const f=fixture(options);f.events.get('wheel')({deltaY:-30});f.events.get('touchstart')({touches:[{clientY:10}]});f.events.get('touchmove')({touches:[{clientY:30}]});f.events.get('touchend')();assert.equal(f.follow.following,true);assert.ok(!f.changes.includes(false));f.follow.destroy();}
});
test('reaching within 80px restores following without a new gesture or a six-pixel landing',()=>{
 const f=fixture();f.events.get('wheel')({deltaY:-20});assert.equal(f.follow.following,false);f.region.scrollTop=500;f.events.get('scroll')();f.region.scrollTop=630;f.events.get('scroll')();assert.equal(f.follow.following,true);assert.equal(f.region.scrollTop,630,'near-end recognition does not snap the scroller');f.follow.destroy();
});
test('touch near the bottom does not get cancelled or pulled down while the reader moves away',()=>{
 const f=fixture();f.events.get('touchstart')({touches:[{clientY:10}]});f.events.get('touchmove')({touches:[{clientY:40}]});f.region.scrollTop=670;f.events.get('scroll')();f.resize(260);f.follow.afterRender();f.flush();assert.equal(f.region.scrollTop,670);assert.equal(f.follow.following,false);f.events.get('touchend')();f.flush();assert.equal(f.region.scrollTop,670);f.follow.destroy();
});
test('an explicit jump resets native momentum then positions immediately, ordinary following does not',()=>{
 const f=fixture({top:300});f.events.get('wheel')({deltaY:-20});f.follow.follow({stopMomentum:true});assert.deepEqual(f.writes,['hidden','auto']);assert.equal(f.region.scrollTop,1000);f.inertia();assert.equal(f.region.scrollTop,1000);assert.equal(f.region.style.overflow,'auto');assert.equal(f.region.style.scrollBehavior,'auto');f.follow.afterRender();f.flush();assert.deepEqual(f.writes,['hidden','auto']);f.follow.destroy();
});
test('each ResizeObserver delivery follows before paint only when following and not touching',()=>{
 const f=fixture();f.resize(280);assert.equal(f.region.scrollTop,1000);f.region.scrollHeight=1100;f.resize(250);assert.equal(f.region.scrollTop,1100);f.region.scrollTop=850;f.resize(0);assert.equal(f.region.scrollTop,850,'hidden workspaces retain their reading position');f.events.get('scroll')();assert.equal(f.follow.following,true);f.follow.pause();f.region.scrollTop=200;f.resize(220);assert.equal(f.region.scrollTop,200);f.follow.follow();f.flush();f.events.get('touchstart')({touches:[{clientY:10}]});f.region.scrollTop=600;f.resize(200);assert.equal(f.region.scrollTop,600);f.follow.destroy();assert.equal(f.disconnected,true);f.resize(180);assert.equal(f.region.scrollTop,600);
});
function latestFixture({hasNewer=false}={}){
 const state={current:{id:'session'},messages:[{role:'user',text:'Existing'}],hasNewer,latestLoading:false},button={setAttribute(){},hidden:false},region={scrollHeight:1000,clientHeight:300,scrollTop:400},calls=[];let release;
 const loading=new Promise(resolve=>release=resolve),context=vm.createContext({state,$:s=>s==='#conversation'?region:button,t:k=>k,conversationFollow:()=>({follow:options=>calls.push(['follow',options])}),historyWindow:()=>({load:id=>{calls.push(['load',id]);return loading;}}),applyHistory:page=>{state.messages=page.messages;state.hasNewer=false;},renderMessages:options=>calls.push(['render',options])});const a=source.indexOf('function renderLatestControl()'),b=source.indexOf('\nfunction renderMessages(',a);vm.runInContext(source.slice(a,b),context);return {state,button,region,calls,run:()=>context.showLatestConversation(),render:()=>context.renderLatestControl(),release};
}
test('latest with a fully loaded tail does not read the database even under rapid repeated clicks',async()=>{
 const f=latestFixture();await Promise.all([f.run(),f.run(),f.run()]);assert.equal(f.calls.filter(call=>call[0]==='load').length,0);assert.ok(f.calls.every(call=>call[0]==='follow'&&call[1].stopMomentum));
});
test('a truncated historical tail loads once, stops momentum before its await, and ignores a late session switch',async()=>{
 const f=latestFixture({hasNewer:true}),first=f.run(),second=f.run();assert.deepEqual(f.calls.map(call=>call[0]),['follow','load']);assert.equal(f.calls[0][1].stopMomentum,true);f.state.current={id:'other'};f.release({messages:[]});await Promise.all([first,second]);assert.equal(f.calls.filter(call=>call[0]==='render').length,0);assert.equal(f.state.latestLoading,false);
});
test('latest hides for empty sessions and near-end content, but remains available for unloaded newer history',()=>{
 const f=latestFixture();f.state.messages=[];f.region.scrollTop=0;f.render();assert.equal(f.button.hidden,true);f.state.messages=[{text:'Content'}];f.region.scrollTop=630;f.render();assert.equal(f.button.hidden,true);f.region.scrollTop=619;f.render();assert.equal(f.button.hidden,false);f.region.scrollHeight=250;f.region.clientHeight=300;f.render();assert.equal(f.button.hidden,true);f.state.hasNewer=true;f.render();assert.equal(f.button.hidden,false);
});
