// Loaded only by the local mobile-viewport fixture, never shipped with the app.
// This models keyboard viewport geometry; it is not a physical Safari keyboard.
const viewportFixture=new EventTarget();
Object.assign(viewportFixture,{width:390,height:844,offsetTop:0,offsetLeft:0,scale:1});
Object.defineProperty(window,'visualViewport',{value:viewportFixture,configurable:true});
addEventListener('message',event=>{
  if(event.source!==parent||event.data?.type!=='iah-test-viewport')return;
  viewportFixture.height=event.data.height;viewportFixture.width=event.data.width||innerWidth;viewportFixture.scale=event.data.scale||1;viewportFixture.offsetLeft=event.data.left||0;viewportFixture.offsetTop=event.data.top||0;
  viewportFixture.dispatchEvent(new Event('resize'));viewportFixture.dispatchEvent(new Event('scroll'));
});
