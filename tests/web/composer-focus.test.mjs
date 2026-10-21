import test from 'node:test';
import assert from 'node:assert/strict';
import {mountComposerFocus} from '../../apps/web/ui/composer-focus.js';

test('each new touch focus suppresses focus scrolling without cancelling native caret handling',()=>{
  const doc={activeElement:null},handlers=new Map(),calls=[];
  const input={focus(options){calls.push(options);doc.activeElement=this;},addEventListener(name,fn){handlers.set(name,fn);},removeEventListener(name,fn){assert.equal(handlers.get(name),fn);handlers.delete(name);}};
  const dispose=mountComposerFocus(input,{document:doc});
  const event={pointerType:'touch',isPrimary:true,preventDefault(){assert.fail('native selection must stay available');}};
  for(let n=0;n<3;n++){
    doc.activeElement=null;handlers.get('pointerdown')(event);
    assert.equal(calls.length,n+1);assert.deepEqual(calls.at(-1),{preventScroll:true});
    handlers.get('pointerdown')(event);assert.equal(calls.length,n+1);
  }
  doc.activeElement=null;
  handlers.get('pointerdown')({pointerType:'mouse'});
  handlers.get('pointerdown')({pointerType:'touch',isPrimary:false});
  input.disabled=true;handlers.get('pointerdown')(event);input.disabled=false;
  input.readOnly=true;handlers.get('pointerdown')(event);
  assert.equal(calls.length,3);dispose();assert.equal(handlers.size,0);
});
