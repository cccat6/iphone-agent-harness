export async function imageData(frame){
  if(frame?.dataUrl)return frame.dataUrl;if(!frame?.blob)return null;
  const bytes=new Uint8Array(await frame.blob.arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return `data:${frame.blob.type||'image/jpeg'};base64,${btoa(text)}`;
}
