import test from 'node:test';
import assert from 'node:assert/strict';
import {mountSessionSwipe} from '../../apps/web/ui/session-swipe.js';
function fixture(){
 const listeners=new Map(),rows=[];
 function row(id,count){const classes=new Set(),props={},actions={inert:false,attrs:{},getBoundingClientRect:()=>({width:count*78}),setAttribute(k,v){this.attrs[k]=v;}};
  const value={dataset:{sessionRow:id},style:{setProperty(k,v){props[k]=v;}},classList:{toggle(k,v){v?classes.add(k):classes.delete(k);},add:k=>classes.add(k),remove:k=>classes.delete(k)},querySelector:()=>actions,querySelectorAll:()=>Array(count).fill({}),classes,props,actions};
  value.closest=selector=>selector==='[data-session-row]'?value:null;
  value.front={closest:selector=>selector==='[data-session-row]'?value:selector==='[data-session]'?value.front:null};
  value.action=action=>({dataset:{sessionAction:action},closest:selector=>selector==='[data-session-row]'?value:selector==='[data-session-action]'?value.actionButton:null});
  rows.push(value);return value;
 }
 const one=row('one',2),two=row('archived',3),calls=[];
 const root={querySelectorAll:()=>rows,addEventListener(name,handler,options){const key=name+(options?.capture?':capture':'');listeners.set(key,handler);},removeEventListener(){}};
 const controller=mountSessionSwipe({root,onAction:async(action,id)=>calls.push([action,id]),now:()=>100});
 function event(target,point={clientX:100,clientY:100,identifier:1}){return {target,touches:[point],detail:1,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},stopPropagation(){this.stopped=true;}};}
 const touch=(name,target,x,y)=>{const e=event(target,{clientX:x,clientY:y,identifier:1});listeners.get(name)(e);return e;};
 return {controller,one,two,calls,listeners,event,touch};
}
test('independent swipe: vertical list movement and browser-edge gestures do not expose actions or mutate',()=>{
 const f=fixture();f.touch('touchstart',f.one.front,110,100);const moved=f.touch('touchmove',f.one.front,105,150);f.touch('touchend',f.one.front,105,150);
 assert.equal(moved.prevented,undefined);assert.equal(f.one.actions.inert,true);assert.deepEqual(f.calls,[]);
 f.touch('touchstart',f.one.front,20,100);f.touch('touchmove',f.one.front,0,100);f.touch('touchend',f.one.front,0,100);assert.equal(f.one.actions.inert,true);f.controller.destroy();
});
test('independent swipe: reveal suppresses the synthetic row-opening click and only one row remains open',()=>{
 const f=fixture();f.touch('touchstart',f.one.front,220,100);const move=f.touch('touchmove',f.one.front,100,101);f.touch('touchend',f.one.front,100,101);
 assert.equal(move.prevented,true);assert.equal(f.one.actions.inert,false);assert.equal(f.one.props['--session-swipe-x'],'-156px');assert.deepEqual(f.calls,[]);
 const click=f.event(f.one.front);f.listeners.get('click:capture')(click);assert.equal(click.prevented,true);assert.equal(click.stopped,true);
 f.controller.open(f.two);assert.equal(f.one.actions.inert,true);assert.equal(f.two.actions.inert,false);assert.equal(f.two.props['--session-swipe-x'],'-234px');f.controller.destroy();
});
test('independent swipe: archive-list action dispatch has the exact archived row identity and closes actions',async()=>{
 const f=fixture();f.controller.open(f.two);const button=f.two.action('restore');f.two.actionButton=button;
 f.listeners.get('click')(f.event(button));await Promise.resolve();assert.deepEqual(f.calls,[['restore','archived']]);assert.equal(f.two.actions.inert,true);assert.equal(f.two.props['--session-swipe-x'],'0px');f.controller.destroy();
});
