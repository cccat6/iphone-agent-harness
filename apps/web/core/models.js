import {modelReasoningMetadata,normalizeReasoningEffort} from './reasoning.js';
export function modelContextMetadata(model={}){
  const capacity=model.contextWindowTokens??model.context_window??model.contextWindow??model.context_length??model.max_input_tokens;
  return Number.isSafeInteger(capacity)&&capacity>=1024&&capacity<=10000000?{contextWindowTokens:capacity}:{};
}
export function modelSelectionParts(value){
  const raw=String(value||'');
  const split=raw.indexOf('::');
  return split<0?{providerId:raw,modelId:''}:{providerId:raw.slice(0,split),modelId:raw.slice(split+2)};
}
export function profileModels(profile){
  const models=new Map();
  for(const entry of Array.isArray(profile.models)?profile.models:[]){
    const id=typeof entry==='string'?entry:entry?.id;
    if(typeof id==='string'&&id.trim()){
      const metadata=typeof entry==='object'?entry:{};
      models.set(id,{id,name:metadata.name||id,...modelContextMetadata(metadata),...modelReasoningMetadata(metadata)});
    }
  }
  if(profile.model&&!models.has(profile.model))models.set(profile.model,{id:profile.model,name:profile.model});
  return [...models.values()];
}
export function getDefaultModelSelection(settings){
  const profiles=Array.isArray(settings.providers)?settings.providers:[];
  const {providerId,modelId}=modelSelectionParts(settings.defaultModelSelection);
  if(modelId&&profiles.some(profile=>profile.id===providerId&&profileModels(profile).some(model=>model.id===modelId))){
    return settings.defaultModelSelection;
  }
  // Old installs persisted the provider and its model separately. Keep that
  // choice when available, then pick the first available model after removal.
  const legacy=profiles.find(profile=>profile.id===settings.activeProviderId);
  for(const profile of legacy?[legacy,...profiles.filter(item=>item!==legacy)]:profiles){
    const model=profile.model||profileModels(profile)[0]?.id;
    if(model)return profile.id+'::'+model;
  }
  return '';
}
export function resolveModelSelection(settings,selection){
  const {providerId,modelId}=modelSelectionParts(selection||getDefaultModelSelection(settings));
  const profile=(settings.providers||[]).find(p=>p.id===providerId);
  if(!profile)throw new Error('请先在设置中添加并选择模型后端');
  const selected=modelId||profile.model||profileModels(profile)[0]?.id;if(!selected)throw new Error('请选择此账号的模型');
  const entry=profile.models?.find(item=>item.id===selected)||{};
  const metadata={...modelContextMetadata(entry),...modelReasoningMetadata(entry)};
  const resolved={...profile,...metadata,model:selected,accountId:profile.protocol==='codex'?(profile.accountId||profile.id):profile.id};const key=profile.id+'::'+selected;return {...resolved,reasoningEffort:normalizeReasoningEffort(resolved,settings.reasoningEfforts?.[key]??profile.reasoningEffort)};
}
