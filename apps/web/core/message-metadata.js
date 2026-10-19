// Conversation presentation metadata has a small fixed shape; it grants no authority.
export function validateMessageMetadata(message){
 if(message.toolName!==undefined&&(typeof message.toolName!=='string'||!/^[-A-Za-z0-9_]{1,100}$/.test(message.toolName)))throw new Error('Invalid message tool name');
 if(message.taskPlan!==undefined){const plan=message.taskPlan;
  if(message.role!=='assistant'||!plan||typeof plan!=='object'||Array.isArray(plan)||typeof plan.id!=='string'||plan.id.length>200||typeof plan.goal!=='string'||!plan.goal.length||plan.goal.length>2000||!Array.isArray(plan.steps)||plan.steps.length<1||plan.steps.length>20||plan.steps.some(step=>typeof step!=='string'||!step.length||step.length>1000)||plan.status!=='proposed')throw new Error('Invalid proposed plan');
 }
 return message;
}
