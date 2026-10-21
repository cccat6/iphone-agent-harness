// Catalog capabilities take priority. Known fallback IDs come from official model
// documentation; unknown compatible models receive no speculative parameters.
const LEVELS=Object.freeze(['none','minimal','low','medium','high','xhigh','max','ultra']);
function clean(values){return [...new Set(values.map(item=>typeof item==='string'?item:item?.effort??item?.reasoning_effort).filter(value=>LEVELS.includes(value)))];}
export function modelReasoningMetadata(model={}){
 const raw=model.supportedReasoningEfforts??model.supported_reasoning_efforts??model.supported_reasoning_levels;
 if(!Array.isArray(raw))return {};
 const supportedReasoningEfforts=clean(raw),candidate=model.defaultReasoningEffort??model.default_reasoning_level??model.default_reasoning_effort;
 return {supportedReasoningEfforts,...(supportedReasoningEfforts.includes(candidate)?{defaultReasoningEffort:candidate}:{})};
}
function hostname(provider){try{return new URL(provider.baseUrl).hostname;}catch{return '';}}
function knownClaude(model){
 if(/^claude-opus-4-5$/.test(model))return ['low','medium','high'];
 if(/^claude-(?:opus|sonnet)-4-6$/.test(model)||/^claude-mythos-preview$/.test(model))return ['low','medium','high','max'];
 if(/^claude-opus-4-[78]$/.test(model)||/^claude-(?:opus|sonnet)-5(?:-5)?$/.test(model)||/^claude-haiku-5-5$/.test(model)||/^claude-(?:fable|mythos)-5(?:-1)?$/.test(model))return ['low','medium','high','xhigh','max'];
 return [];
}
export function reasoningOptions(provider={}){
 const catalog=provider.models?.find(item=>item.id===provider.model),metadata=modelReasoningMetadata(catalog||provider);
 if(metadata.supportedReasoningEfforts)return metadata.supportedReasoningEfforts;
 const model=String(provider.model||'').toLowerCase().replace(/-(?:\d{8}|\d{4}-\d{2}-\d{2}|latest)$/,''),host=hostname(provider);
 if(host==='api.deepseek.com')return /^deepseek-(?:flash|v4(?:\.1)?(?:-flash|-pro)?)$/.test(model)?['none','low','high','max']:[];
 if(provider.protocol==='anthropic')return knownClaude(model);
 if(provider.protocol!=='openai'&&provider.protocol!=='codex')return [];
 if(/^gpt-6-(?:sol|luna)$/.test(model))return ['none','low','medium','high','xhigh','max'];
 if(model==='gpt-6-astra'||model==='gpt-6.1-sol')return ['low','medium','high','xhigh','max'];
 if(/^gpt-5\.[245](?:-mini|-nano)?$/.test(model))return ['none','low','medium','high','xhigh'];
 if(/^gpt-5\.1$/.test(model))return ['none','low','medium','high'];
 if(/^gpt-5(?:-mini|-nano)?(?:-\d{4}-\d{2}-\d{2})?$/.test(model))return ['minimal','low','medium','high'];
 if(/^(?:o1|o3|o3-mini|o4-mini)(?:-\d{4}-\d{2}-\d{2})?$/.test(model))return ['low','medium','high'];
 return [];
}
export function normalizeReasoningEffort(provider={},value=provider.reasoningEffort){
 const options=reasoningOptions(provider);if(!options.length)return '';if(options.includes(value))return value;
 const catalog=provider.models?.find(item=>item.id===provider.model),metadata=modelReasoningMetadata(catalog||provider);
 if(options.includes(metadata.defaultReasoningEffort))return metadata.defaultReasoningEffort;
 const model=String(provider.model||'').toLowerCase().replace(/-(?:\d{8}|\d{4}-\d{2}-\d{2}|latest)$/,'');
 // Older "auto" preferences omitted the parameter. Resolve them to an actual
 // catalog/documented default; otherwise choose only from advertised choices.
 let fallback='';
 if(hostname(provider)==='api.deepseek.com')fallback='high';
 else if(provider.protocol==='anthropic'&&knownClaude(model).length)fallback=/^claude-(?:opus|haiku)-5-5$/.test(model)?'medium':'high';
 else if(/^(?:gpt-6-(?:astra|sol|luna)|gpt-6\.1-sol|gpt-5(?:-mini|-nano)?|o1|o3|o3-mini|o4-mini)$/.test(model))fallback='medium';
 else if(/^gpt-5\.[124](?:-mini|-nano)?$/.test(model))fallback='none';
 return options.includes(fallback)?fallback:options[0];
}
export function reasoningParameters(provider={}){
 const effort=normalizeReasoningEffort(provider);if(!effort)return {};
 if(provider.protocol==='codex')return {reasoning:{effort,summary:'auto'}};
 if(hostname(provider)==='api.deepseek.com')return effort==='none'?{thinking:{type:'disabled'}}:provider.protocol==='anthropic'?{thinking:{type:'enabled'},output_config:{effort}}:{thinking:{type:'enabled'},reasoning_effort:effort};
 if(provider.protocol==='anthropic')return {output_config:{effort},...(/^claude-opus-4-5(?:-|$)/.test(provider.model)?{}:{thinking:{type:'adaptive'}})};
 return {reasoning_effort:effort};
}
