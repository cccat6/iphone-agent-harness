import {imageData} from '../core/attachments.js';
export async function showImagePreview({store,ref,document:doc=globalThis.document,label='Screenshot',closeLabel='Close'}={}){
 const frame=await store.getFrame(ref);if(!frame)return;
 const source=await imageData(frame);if(!source)return;
 const dialog=doc.createElement('dialog');dialog.className='image-preview';
 const button=doc.createElement('button');button.type='button';button.className='icon-button image-preview-close';button.textContent='×';button.setAttribute('aria-label',closeLabel);
 const image=doc.createElement('img');image.src=source;image.alt=label;dialog.append(button,image);doc.body.append(dialog);
 const close=()=>dialog.close();button.onclick=close;dialog.addEventListener('click',event=>{if(event.target===dialog)close();});dialog.addEventListener('close',()=>{image.removeAttribute('src');dialog.remove();},{once:true});dialog.showModal();button.focus({preventScroll:true});return dialog;
}
