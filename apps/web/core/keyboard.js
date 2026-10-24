const named=Object.freeze({Enter:40,Escape:41,Backspace:42,Tab:43,Space:44,Insert:73,Home:74,PageUp:75,Delete:76,End:77,PageDown:78,ArrowRight:79,ArrowLeft:80,ArrowDown:81,ArrowUp:82});
export const NAMED_KEYS=Object.freeze(Object.keys(named));
export function keyboardInput(step){
  const invalid=()=>{throw Object.assign(new Error('Invalid keyboard input'),{code:'invalid_plan'});};
  if(!Number.isInteger(step?.modifiers)||step.modifiers<0||step.modifiers>255)return invalid();
  const hasName=Object.hasOwn(step,'key'),hasUsage=Object.hasOwn(step,'usage');
  if(hasName===hasUsage)return invalid();
  let usage=step.usage,modifiers=step.modifiers;
  if(hasName){
    const key=step.key;
    if(typeof key!=='string')return invalid();
    if(/^[a-z]$/.test(key))usage=key.charCodeAt(0)-93;
    else if(/^[A-Z]$/.test(key)){usage=key.charCodeAt(0)-61;modifiers|=2;}
    else if(/^[1-9]$/.test(key))usage=Number(key)+29;
    else if(key==='0')usage=39;
    else if(key===' ')usage=44;
    else if(Object.hasOwn(named,key))usage=named[key];
    else return invalid();
  }
  if(!Number.isInteger(usage)||usage<4||usage>231)return invalid();
  return {usage,modifiers};
}
