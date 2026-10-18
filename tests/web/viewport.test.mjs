import test from 'node:test';
import assert from 'node:assert/strict';
import {viewportGeometry,mountViewport} from '../../apps/web/ui/viewport.js';
const phone={layoutWidth:844,layoutHeight:390,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) Version/27.0.1 Mobile/15E148 Safari/604.1'};
test('iPhone remains one surface in landscape, wide iPad can use two columns',()=>{
 assert.equal(viewportGeometry({...phone,width:844,height:390}).compact,true);
 assert.equal(viewportGeometry({...phone,userAgent:'iPad',width:844,height:390}).compact,false);
 assert.equal(viewportGeometry({...phone,userAgent:'iPad',width:700,height:390}).compact,true);
});
test('pinch updates every dimension and pan without being mistaken for keyboard',()=>{
 assert.deepEqual(viewportGeometry({...phone,width:422,height:195,top:40,left:90,scale:2,editing:true}),{width:422,height:195,top:40,left:90,scale:2,compact:true,short:true,keyboard:false});
 assert.equal(viewportGeometry({...phone,width:844,height:200,editing:true}).keyboard,true);
 assert.equal(viewportGeometry({...phone,width:844,height:200,editing:false}).keyboard,false);
});
test('invalid transient measurements fall back without NaN or negative offsets',()=>{
 const r=viewportGeometry({...phone,width:0,height:NaN,top:-10,left:NaN,scale:0});
 assert.equal(r.width,844);assert.equal(r.height,390);assert.equal(r.left,0);assert.equal(r.top,0);assert.equal(r.scale,1);
});
function fixture(){
 const styles=new Map(),classes=new Set(),view=Object.assign(new EventTarget(),{width:390,height:844,offsetTop:0,offsetLeft:0,scale:1});
 const win=Object.assign(new EventTarget(),{visualViewport:view,innerWidth:390,innerHeight:844,navigator:{userAgent:phone.userAgent}});
 const doc=Object.assign(new EventTarget(),{activeElement:null,documentElement:{style:{setProperty:(k,v)=>styles.set(k,v)}},body:{classList:{toggle:(k,v)=>v?classes.add(k):classes.delete(k)}}});
 const dispose=mountViewport({window:win,document:doc});return {styles,classes,view,win,doc,dispose};
}
test('rotate then zoom then keyboard restore never leaves stale geometry',()=>{
 const f=fixture();Object.assign(f.win,{innerWidth:844,innerHeight:390});Object.assign(f.view,{width:844,height:390});f.win.dispatchEvent(new Event('resize'));
 assert.equal(f.styles.get('--viewport-height'),'390px');assert.ok(f.classes.has('compact-viewport'));
 Object.assign(f.view,{width:422,height:195,offsetTop:40,offsetLeft:90,scale:2});f.view.dispatchEvent(new Event('resize'));
 assert.equal(f.styles.get('--viewport-width'),'422px');assert.equal(f.styles.get('--viewport-left'),'90px');assert.equal(f.styles.get('--viewport-height'),'195px');assert.ok(!f.classes.has('keyboard-visible'));
 Object.assign(f.win,{innerWidth:390,innerHeight:844});Object.assign(f.view,{width:390,height:430,offsetTop:70,offsetLeft:0,scale:1});f.doc.activeElement={tagName:'INPUT'};f.doc.dispatchEvent(new Event('focusin'));
 assert.ok(f.classes.has('keyboard-visible'));assert.equal(f.styles.get('--viewport-top'),'70px');
 Object.assign(f.view,{height:844,offsetTop:0});f.view.dispatchEvent(new Event('scroll'));assert.ok(!f.classes.has('keyboard-visible'));
 f.dispose();f.view.height=100;f.view.dispatchEvent(new Event('resize'));assert.equal(f.styles.get('--viewport-height'),'844px');
});
test('missing visualViewport follows normal resize and preserves accessible layout',()=>{
 const f=fixture();f.dispose();f.win.visualViewport=null;const dispose=mountViewport({window:f.win,document:f.doc});f.win.innerWidth=620;f.win.innerHeight=500;f.win.dispatchEvent(new Event('resize'));assert.equal(f.styles.get('--viewport-width'),'620px');assert.equal(f.styles.get('--viewport-height'),'500px');dispose();
});
