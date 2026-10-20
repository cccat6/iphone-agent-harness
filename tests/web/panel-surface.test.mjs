import test from 'node:test';
import assert from 'node:assert/strict';
import {showPanelSurface} from '../../apps/web/ui/panel-surface.js';
function fixture({width=390,userAgent='iPhone'}={}){
 const classes=new Set(),background=[{inert:false},{inert:true}],scrolls=[],focus=[];
 const button={isConnected:true,closest:()=>null,focus:options=>focus.push(options)};
 const doc={documentElement:{clientWidth:width},body:{classList:{add:n=>classes.add(n),remove:n=>classes.delete(n)}},activeElement:button,querySelectorAll:()=>background};
 const win={innerWidth:width,navigator:{userAgent},scrollX:0,scrollY:30,scrollTo:(...p)=>scrolls.push(p)};
 const dialog=Object.assign(new EventTarget(),{open:false,shown:0,modals:0,show(){this.shown++;this.open=true;},showModal(){this.modals++;this.open=true;},close(){this.open=false;this.dispatchEvent(new Event('close'));},contains:()=>false});
 return {dialog,doc,win,classes,background,scrolls,focus,show:()=>showPanelSurface(dialog,{window:win,document:doc})};
}
test('mobile settings use document scrolling and restore background/focus on close',()=>{const f=fixture();f.show();assert.equal(f.dialog.shown,1);assert.equal(f.dialog.modals,0);assert.ok(f.classes.has('panel-route'));assert.ok(f.background.every(n=>n.inert));f.show();assert.equal(f.dialog.shown,1);f.dialog.close();assert.ok(!f.classes.has('panel-route'));assert.deepEqual(f.background.map(n=>n.inert),[false,true]);assert.deepEqual(f.scrolls.at(-1),[0,30]);assert.deepEqual(f.focus,[{preventScroll:true}]);});
test('landscape iPhone stays a scrolling page while wide desktop uses a native modal',()=>{const phone=fixture({width:844});phone.show();assert.equal(phone.dialog.shown,1);phone.dialog.close();const desktop=fixture({width:1000,userAgent:'Macintosh'});desktop.show();assert.equal(desktop.dialog.modals,1);assert.ok(!desktop.classes.has('panel-route'));assert.deepEqual(desktop.background.map(n=>n.inert),[false,true]);});
test('delayed close event cannot tear down a reopened mobile panel',()=>{const f=fixture();f.show();f.dialog.open=false;f.show();f.dialog.dispatchEvent(new Event('close'));assert.ok(f.classes.has('panel-route'));assert.ok(f.background.every(n=>n.inert));f.dialog.close();assert.ok(!f.classes.has('panel-route'));assert.deepEqual(f.background.map(n=>n.inert),[false,true]);});
test('Escape closes mobile panel but leaves composition and consumed key events alone',()=>{const f=fixture();f.show();const event=composition=>{const e=new Event('keydown',{cancelable:true});Object.assign(e,{key:'Escape',isComposing:composition});return e;};f.dialog.dispatchEvent(event(true));assert.equal(f.dialog.open,true);const consumed=event(false);consumed.preventDefault();f.dialog.dispatchEvent(consumed);assert.equal(f.dialog.open,true);f.dialog.dispatchEvent(event(false));assert.equal(f.dialog.open,false);});
test('failed opening restores the original background and scroll',()=>{const f=fixture();f.dialog.show=()=>{throw Error('synthetic show failure');};assert.throws(f.show,/synthetic/);assert.ok(!f.classes.has('panel-route'));assert.deepEqual(f.background.map(n=>n.inert),[false,true]);});
