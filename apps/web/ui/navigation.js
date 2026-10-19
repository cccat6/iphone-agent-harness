// One document owns device/capture lifetimes. UI history contains only view IDs.
export function createViewNavigation({history,location,urlForView,applyView,initialView}={}){
 let restoring=0,generation=0,current=history.state?.iahView||structuredClone(initialView),depth=Number.isInteger(history.state?.iahDepth)?history.state.iahDepth:0;
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const write=(view,replace)=>{current=structuredClone(view);if(!replace)depth++;history[replace?'replaceState':'pushState']({...history.state,iahView:current,iahDepth:depth},'',urlForView(current));};
 write(current,true);
 async function restore(view){const request=++generation;restoring++;try{const adjusted=await applyView(structuredClone(view),{isCurrent:()=>request===generation});if(request===generation&&adjusted)write({...view,...adjusted},true);}finally{restoring--;}}
 return {
  get current(){return structuredClone(current);},get restoring(){return restoring>0;},async restoreCurrent(){await restore(current);},
  go(patch,{replace=false}={}){if(restoring)return false;const view={...current,...patch};if(same(view,current))return false;write(view,replace);return true;},
  async back(fallback={panel:null,action:null}){if(depth>0&&history.state?.iahView){history.back();return;}write({...current,...fallback},true);await restore(current);},
  async dismissPanel(){if(!current.panel)return;if(!restoring)await this.back({panel:null,action:null});},
  async dismissAction(){if(!current.action)return;if(!restoring)await this.back({action:null});},
  async pop(event){const view=event.state?.iahView||{...initialView,panel:null,action:null};current=structuredClone(view);depth=Number.isInteger(event.state?.iahDepth)?event.state.iahDepth:0;await restore(view);},
 };
}
