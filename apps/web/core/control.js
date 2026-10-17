export const abortError=reason=>reason instanceof Error?reason:new DOMException(typeof reason==='string'?reason:'任务已停止','AbortError');
export function checkAbort(signal){if(signal?.aborted)throw abortError(signal.reason);}
export function abortable(promise,signal){
  if(!signal)return Promise.resolve(promise);if(signal.aborted){Promise.resolve(promise).catch(()=>{});return Promise.reject(abortError(signal.reason));}
  return new Promise((resolve,reject)=>{const abort=()=>{signal.removeEventListener('abort',abort);reject(abortError(signal.reason));};signal.addEventListener('abort',abort,{once:true});Promise.resolve(promise).then(value=>{signal.removeEventListener('abort',abort);if(signal.aborted)reject(abortError(signal.reason));else resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});});
}
export function delay(ms,signal){checkAbort(signal);return new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(abortError(signal.reason));};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},Math.max(0,ms));signal?.addEventListener('abort',abort,{once:true});});}
export function validateArguments(value,schema,root=schema,path='$'){
  if(schema.$ref){const parts=schema.$ref.split('/').slice(1);let target=root;for(const key of parts)target=target?.[key];if(!target)throw new Error(`Unknown schema reference: ${path}`);return validateArguments(value,target,root,path);}
  if(schema.oneOf){let count=0;for(const branch of schema.oneOf)try{validateArguments(value,branch,root,path);count++;}catch{}if(count!==1)throw new Error(`${path}: arguments do not match exactly one supported operation`);return;}
  if('const'in schema&&value!==schema.const)throw new Error(`${path}: incorrect constant`);
  if(schema.enum&&!schema.enum.includes(value))throw new Error(`${path}: unsupported value`);
  const type=schema.type;
  if(type==='object'){
    if(!value||Array.isArray(value)||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new Error(`${path}: expected object`);
    if(Object.keys(value).length>(schema.maxProperties??Infinity))throw new Error(`${path}: too many properties`);
    for(const key of schema.required||[])if(!Object.hasOwn(value,key))throw new Error(`${path}: missing ${key}`);
    for(const [key,child] of Object.entries(value)){if(schema.propertyNames?.pattern&&!new RegExp(schema.propertyNames.pattern).test(key))throw new Error(`${path}: invalid property name`);if(['__proto__','constructor','prototype'].includes(key))throw new Error(`${path}: forbidden property`);if(!Object.hasOwn(schema.properties||{},key)){if(schema.additionalProperties===false)throw new Error(`${path}: unknown ${key}`);if(schema.additionalProperties&&typeof schema.additionalProperties==='object')validateArguments(child,schema.additionalProperties,root,path+'.'+key);}else validateArguments(child,schema.properties[key],root,path+'.'+key);}
  }else if(type==='array'){
    if(!Array.isArray(value))throw new Error(`${path}: expected array`);if(value.length<(schema.minItems||0)||value.length>(schema.maxItems??1000))throw new Error(`${path}: invalid array length`);for(const child of value)validateArguments(child,schema.items,root,path+'[]');
  }else if(type==='string'){
    if(typeof value!=='string'||value.length<(schema.minLength||0)||value.length>(schema.maxLength??100000)||schema.pattern&&!new RegExp(schema.pattern).test(value))throw new Error(`${path}: invalid string`);
  }else if(type==='integer'||type==='number'){
    if(typeof value!=='number'||!Number.isFinite(value)||type==='integer'&&!Number.isInteger(value)||value<(schema.minimum??-Infinity)||value>(schema.maximum??Infinity))throw new Error(`${path}: invalid number`);
  }else if(type==='boolean'&&typeof value!=='boolean')throw new Error(`${path}: expected boolean`);
}
