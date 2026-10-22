export const catalogPage=({serverId='',offset=0,limit=20}={})=>({serverId,offset,limit});
export const catalogPageKey=page=>JSON.stringify(catalogPage(page));
export function retainedCatalogPages(messages,revision){
 const pages=new Map();if(typeof revision!=='string'||!revision)return pages;
 for(const message of messages){if(message.role!=='tool'||message.toolName!=='mcp_list_tools')continue;let value;try{value=JSON.parse(message.text);}catch{continue;}
  if(value?.status!=='loaded'||value.catalogRevision!==revision||!Array.isArray(value.tools)||!value.page)continue;
  pages.set(catalogPageKey(value.page),{page:catalogPage(value.page),total:value.total,nextOffset:value.nextOffset,tools:value.tools.map(tool=>({serverId:tool.serverId,name:tool.name}))});
 }return pages;
}
