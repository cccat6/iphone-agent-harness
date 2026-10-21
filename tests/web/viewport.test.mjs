import test from 'node:test';
import assert from 'node:assert/strict';
import {viewportGeometry,mountViewport} from '../../apps/web/ui/viewport.js';
const phone={layoutWidth:844,layoutHeight:390,userAgent:'Mozilla/5.0 (iPhone) Version/27.0.1 Safari/604.1'};
test('responsive mode follows layout width, never the zoomed visual viewport',()=>{
 assert.equal(viewportGeometry({...phone,width:844,height:390}).compact,true);
 assert.equal(viewportGeometry({...phone,userAgent:'iPad',width:422,height:195,scale:2}).compact,false);
 assert.equal(viewportGeometry({...phone,userAgent:'iPad',layoutWidth:700,width:700,height:390}).compact,true);
});
test('pinch and pan preserve document geometry rather than shrinking and chasing the screen',()=>{
 assert.deepEqual(viewportGeometry({...phone,width:422,height:195,top:40,left:90,scale:2,editing:true}),{width:844,height:390,top:0,left:0,scale:2,compact:true,short:true,keyboard:false});
 const portrait=viewportGeometry({layoutWidth:390,layoutHeight:844,width:390,height:300,top:70,editing:true});
 assert.equal(portrait.keyboard,true);assert.equal(portrait.short,false);assert.equal(portrait.top,70);
});
test('invalid transient measurements fall back and offsets stay within layout',()=>{
 const r=viewportGeometry({...phone,width:0,height:NaN,top:-10,scale:0});
 assert.equal(r.width,844);assert.equal(r.height,390);assert.equal(r.left,0);assert.equal(r.top,0);assert.equal(r.scale,1);
 assert.equal(viewportGeometry({...phone,height:200,top:900}).top,190);
});
function fixture(){
 const styles=new Map(),classes=new Set(),writes=[],frames=new Map();let nextFrame=0,layouts=0;
 const view=Object.assign(new EventTarget(),{width:390,height:844,offsetTop:0,offsetLeft:0,scale:1});
 const win=Object.assign(new EventTarget(),{visualViewport:view,innerWidth:390,innerHeight:844,navigator:{userAgent:phone.userAgent},requestAnimationFrame:fn=>{frames.set(++nextFrame,fn);return nextFrame;},cancelAnimationFrame:id=>frames.delete(id)});
 const doc=Object.assign(new EventTarget(),{activeElement:null,documentElement:{style:{setProperty:(k,v)=>{styles.set(k,v);writes.push([k,v]);}}},body:{classList:{toggle:(k,v)=>v?classes.add(k):classes.delete(k),contains:k=>classes.has(k)}}});
 const dispose=mountViewport({window:win,document:doc,onLayout:()=>layouts++});
 return {styles,classes,view,win,doc,dispose,writes,frames,get layouts(){return layouts;},flush(){const callbacks=[...frames.values()];frames.clear();for(const fn of callbacks)fn();}};
}
test('keyboard event burst is applied once per frame with no repeated layout writes',()=>{
 const f=fixture(),initial=f.writes.length;
 f.doc.activeElement={tagName:'INPUT'};Object.assign(f.view,{height:430,offsetTop:70});
 f.doc.dispatchEvent(new Event('focusin'));f.view.dispatchEvent(new Event('resize'));f.view.dispatchEvent(new Event('scroll'));
 assert.equal(f.frames.size,1);assert.equal(f.writes.length,initial);f.flush();
 assert.ok(f.classes.has('keyboard-visible'));assert.equal(f.styles.get('--viewport-top'),'70px');assert.equal(f.styles.get('--viewport-width'),'390px');assert.ok(!f.classes.has('short-viewport'));
 const writes=f.writes.length,layouts=f.layouts;f.view.dispatchEvent(new Event('scroll'));f.flush();assert.equal(f.writes.length,writes);assert.equal(f.layouts,layouts);
 Object.assign(f.view,{height:844,offsetTop:0});f.doc.activeElement=null;f.doc.dispatchEvent(new Event('focusout'));f.flush();assert.ok(!f.classes.has('keyboard-visible'));assert.equal(f.styles.get('--viewport-top'),'0px');
});
test('rotate, zoom and restore do not leave stale geometry; disposal cancels pending frame',()=>{
 const f=fixture();Object.assign(f.win,{innerWidth:844,innerHeight:390});Object.assign(f.view,{width:844,height:390});f.win.dispatchEvent(new Event('resize'));f.flush();
 assert.equal(f.styles.get('--viewport-height'),'390px');assert.ok(f.classes.has('compact-viewport'));
 Object.assign(f.view,{width:422,height:195,offsetTop:40,offsetLeft:90,scale:2});f.view.dispatchEvent(new Event('resize'));f.flush();
 assert.equal(f.styles.get('--viewport-width'),'844px');assert.equal(f.styles.get('--viewport-left'),'0px');assert.equal(f.styles.get('--viewport-height'),'390px');
 f.view.height=100;f.view.dispatchEvent(new Event('resize'));f.dispose();assert.equal(f.frames.size,0);f.flush();assert.equal(f.styles.get('--viewport-height'),'390px');
});
test('no visualViewport uses normal resize',()=>{
 const f=fixture();f.dispose();f.win.visualViewport=null;const dispose=mountViewport({window:f.win,document:f.doc});f.win.innerWidth=620;f.win.innerHeight=500;f.win.dispatchEvent(new Event('resize'));f.flush();assert.equal(f.styles.get('--viewport-width'),'620px');assert.equal(f.styles.get('--viewport-height'),'500px');dispose();
});
test('Safari pinch prevention is scoped to application, excluding image viewer and public pages',()=>{
 const f=fixture();const pinch=selector=>{const event=new Event('gesturestart',{cancelable:true});Object.defineProperty(event,'target',{value:{closest:s=>s===selector?{}:null}});f.doc.dispatchEvent(event);return event.defaultPrevented;};
 assert.equal(pinch(null),false);f.classes.add('harness-surface');assert.equal(pinch(null),true);assert.equal(pinch('.image-preview'),false);f.classes.delete('harness-surface');assert.equal(pinch('.panel-dialog,.action-dialog'),true);f.dispose();assert.equal(pinch('.panel-dialog,.action-dialog'),false);
});

test('keyboard occlusion remains detectable after browser zoom outside the app',()=>{const r=viewportGeometry({layoutWidth:390,layoutHeight:844,width:195,height:220,scale:2,editing:true,top:100});assert.equal(r.width,390);assert.equal(r.height,440);assert.equal(r.keyboard,true);assert.equal(r.top,0);assert.equal(r.short,false);});

test('Safari keyboard shrinks innerHeight but retains layout height and a 331px pan',()=>{
 const f=fixture();f.doc.documentElement.clientWidth=402;f.doc.documentElement.clientHeight=714;
 f.win.innerWidth=402;f.win.innerHeight=383;f.doc.activeElement={tagName:'TEXTAREA'};
 Object.assign(f.view,{width:402,height:383,offsetTop:331});f.view.dispatchEvent(new Event('resize'));f.flush();
 assert.equal(f.styles.get('--viewport-height'),'383px');assert.equal(f.styles.get('--viewport-top'),'331px');
 assert.ok(f.classes.has('keyboard-visible'));assert.ok(!f.classes.has('short-viewport'));
 // The fixed app is translated by Safari's 331px pan; its top is now visible.
 assert.equal(Number.parseInt(f.styles.get('--viewport-top'))-331,0);
 f.doc.activeElement=null;f.win.innerHeight=714;Object.assign(f.view,{height:714,offsetTop:0});
 f.view.dispatchEvent(new Event('resize'));f.flush();assert.equal(f.styles.get('--viewport-top'),'0px');assert.equal(f.styles.get('--viewport-height'),'714px');assert.ok(!f.classes.has('keyboard-visible'));
 f.doc.documentElement.clientWidth=874;f.doc.documentElement.clientHeight=342;f.win.innerWidth=874;f.win.innerHeight=342;Object.assign(f.view,{width:874,height:342});f.win.dispatchEvent(new Event('orientationchange'));f.flush();assert.equal(f.styles.get('--viewport-width'),'874px');assert.equal(f.styles.get('--viewport-height'),'342px');f.dispose();
});
