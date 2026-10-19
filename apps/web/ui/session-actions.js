// Session metadata actions leave the active conversation and run state intact.
export function createSessionActions({store,isBusy,confirmDelete,copy,exportSession,onMetadata,onDeleted,onDeleting=()=>{},refresh}) {
  const deleting=new Set();
  function check(id){if(isBusy(id)||deleting.has(id))throw Object.assign(new Error('SESSION_BUSY'),{code:'SESSION_BUSY'});}
  return {
    isDeleting:id=>deleting.has(id),
    async perform(action,session){
      if(action==='cancel')return;
      if(action==='copy'){await copy(session.id);return;}
      if(action==='export'){await exportSession(session.id);return;}
      if(action==='delete'){
        check(session.id);
        if(!await confirmDelete())return;
        check(session.id);deleting.add(session.id);onDeleting(session.id,true);
        try{await store.deleteSession(session.id);await onDeleted(session.id);await refresh();}
        finally{deleting.delete(session.id);onDeleting(session.id,false);}
        return;
      }
      const patch=action==='pin'?{pinned:!session.pinned}:action==='archive'?{archived:true}:action==='restore'?{archived:false}:null;
      if(!patch)return;
      const updated=await store.updateSession(session.id,patch);
      await onMetadata(session.id,patch,updated);await refresh();
    }
  };
}
