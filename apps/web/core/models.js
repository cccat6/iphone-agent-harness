export function modelContextMetadata(model={}){
  const capacity=model.contextWindowTokens??model.context_window??model.contextWindow??model.context_length??model.max_input_tokens;
  return Number.isSafeInteger(capacity)&&capacity>=1024&&capacity<=10000000?{contextWindowTokens:capacity}:{};
}
export function resolveModelSelection(settings,selection){
  const value=String(selection||settings.activeProviderId||''),split=value.indexOf('::');
  const id=split<0?value:value.slice(0,split),model=split<0?null:value.slice(split+2);
  const profile=(settings.providers||[]).find(p=>p.id===id);
  if(!profile)throw new Error('请先在设置中添加并选择模型后端');
  const selected=model||profile.model;if(!selected)throw new Error('请选择此账号的模型');
  const metadata=modelContextMetadata(profile.models?.find(item=>item.id===selected)||{});
  return {...profile,...metadata,model:selected,accountId:profile.accountId||profile.id};
}
