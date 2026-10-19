import path from 'node:path';

export function isPublicWebAsset(source,root){
  const relative=path.relative(root,source);
  if(!relative)return true;
  const parts=relative.split(path.sep);
  if(['api','diagnostics','worker.js','worker-configuration.d.ts'].includes(parts[0]))return false;
  return !parts.some(name=>name.startsWith('.firmware-')||name==='.env'||name.startsWith('.env.')||name.includes('.local.')||name==='.DS_Store');
}
