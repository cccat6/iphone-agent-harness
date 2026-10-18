import {getLocale,subscribe} from '../i18n.js';
import {SHORTCUT_COPY} from './clipboard-shortcut-copy.js';
export const CLIPBOARD_MESSAGES={
 en:{retryContinue:"Retry continue",retrySave:"Retry save",retrying:"Retrying…",copyContinue:"Copy and continue",hintContinue:"After copying, the agent will return to the target app, check the field, then paste.",copiedContinue:"Copied. The agent will return to the target app before pasting.",recordFailed:"Copied, but the session record could not be saved. Do not continue until it is saved.",title:'Copy text for the phone',hint:'Safari needs you to tap Copy here. Then return to the target app; copying does not paste.',copy:'Copy text',copying:'Copying…',copied:'Copied. Return to the target app before continuing.',cancel:'Cancel',failed:'Could not copy. Keep this page open and tap Copy again.',cancelled:'Copy cancelled.',count:'{count} characters'},
 'zh-Hans':{retryContinue:"重试继续",retrySave:"重试保存",retrying:"正在重试…",copyContinue:"复制并继续",hintContinue:"复制后，AI 会先返回目标 App、确认输入框，再粘贴。",copiedContinue:"已复制，AI 将先返回目标 App 再粘贴。",recordFailed:"已复制，但会话记录未能保存。请先处理保存错误，再继续。",title:'复制要输入的文字',hint:'请在这里点一下复制，再切回目标 App。复制不会自动粘贴。',copy:'复制文本',copying:'正在复制…',copied:'已复制。请切回目标 App 后再继续操作。',cancel:'取消',failed:'未能复制，请保持此页面在前台，再点一次复制。',cancelled:'已取消复制。',count:'{count} 个字符'},
 'zh-Hant':{retryContinue:"重試繼續",retrySave:"重試儲存",retrying:"正在重試…",copyContinue:"複製並繼續",hintContinue:"複製後，AI 會先返回目標 App、確認輸入欄位，再貼上。",copiedContinue:"已複製，AI 將先返回目標 App 再貼上。",recordFailed:"已複製，但無法儲存會話記錄。請先處理儲存錯誤，再繼續。",title:'複製要輸入的文字',hint:'請在這裡點一下複製，再切回目標 App。複製不會自動貼上。',copy:'複製文字',copying:'正在複製…',copied:'已複製。請切回目標 App 後再繼續操作。',cancel:'取消',failed:'無法複製，請保持此頁面在前景，再點一次複製。',cancelled:'已取消複製。',count:'{count} 個字元'},
 ja:{retryContinue:"続行を再試行",retrySave:"保存を再試行",retrying:"再試行中…",copyContinue:"コピーして続ける",hintContinue:"コピー後、AI が入力先のアプリに戻り、入力欄を確認してから貼り付けます。",copiedContinue:"コピーしました。AI が入力先のアプリに戻ってから貼り付けます。",recordFailed:"コピーしましたが、会話記録を保存できませんでした。保存の問題を解決してから続けてください。",title:'入力するテキストをコピー',hint:'ここでコピーを押してから、入力先のアプリに戻ってください。自動では貼り付けません。',copy:'テキストをコピー',copying:'コピー中…',copied:'コピーしました。続ける前に入力先のアプリに戻ってください。',cancel:'キャンセル',failed:'コピーできませんでした。このページを開いたまま、もう一度コピーを押してください。',cancelled:'コピーをキャンセルしました。',count:'{count} 文字'},
 ru:{retryContinue:"Повторить продолжение",retrySave:"Повторить сохранение",retrying:"Повторная попытка…",copyContinue:"Копировать и продолжить",hintContinue:"После копирования ИИ вернётся в нужное приложение, проверит поле и вставит текст.",copiedContinue:"Скопировано. ИИ вернётся в нужное приложение перед вставкой.",recordFailed:"Текст скопирован, но запись чата не сохранена. Устраните ошибку сохранения перед продолжением.",title:'Копировать текст для телефона',hint:'Нажмите «Копировать», затем вернитесь в нужное приложение. Текст не вставляется автоматически.',copy:'Копировать текст',copying:'Копирование…',copied:'Скопировано. Перед продолжением вернитесь в нужное приложение.',cancel:'Отмена',failed:'Не удалось скопировать. Оставьте страницу открытой и повторите попытку.',cancelled:'Копирование отменено.',count:'Символов: {count}'},
 de:{retryContinue:"Fortfahren erneut versuchen",retrySave:"Speichern erneut versuchen",retrying:"Erneuter Versuch…",copyContinue:"Kopieren und fortfahren",hintContinue:"Nach dem Kopieren wechselt die KI zur Ziel-App, prüft das Eingabefeld und fügt den Text ein.",copiedContinue:"Kopiert. Die KI wechselt vor dem Einfügen zur Ziel-App.",recordFailed:"Kopiert, aber der Chat-Eintrag konnte nicht gespeichert werden. Behebe vor dem Fortfahren den Speicherfehler.",title:'Text für das Telefon kopieren',hint:'Tippe hier auf Kopieren und wechsle dann zur Ziel-App. Der Text wird nicht automatisch eingefügt.',copy:'Text kopieren',copying:'Wird kopiert…',copied:'Kopiert. Wechsle vor dem Fortfahren zur Ziel-App.',cancel:'Abbrechen',failed:'Kopieren fehlgeschlagen. Lass diese Seite geöffnet und versuche es erneut.',cancelled:'Kopieren abgebrochen.',count:'{count} Zeichen'},
 fr:{retryContinue:"Réessayer de continuer",retrySave:"Réessayer l’enregistrement",retrying:"Nouvelle tentative…",copyContinue:"Copier et continuer",hintContinue:"Après la copie, l’IA reviendra dans l’application cible, vérifiera le champ, puis collera le texte.",copiedContinue:"Copié. L’IA reviendra dans l’application cible avant de coller le texte.",recordFailed:"Le texte est copié, mais l’enregistrement dans la conversation a échoué. Résolvez ce problème avant de continuer.",title:'Copier le texte pour le téléphone',hint:'Appuyez ici sur Copier, puis revenez dans l’application cible. Le texte n’est pas collé automatiquement.',copy:'Copier le texte',copying:'Copie en cours…',copied:'Copié. Revenez dans l’application cible avant de continuer.',cancel:'Annuler',failed:'Impossible de copier. Gardez cette page ouverte et réessayez.',cancelled:'Copie annulée.',count:'{count} caractères'},
 es:{retryContinue:"Reintentar continuar",retrySave:"Reintentar guardar",retrying:"Reintentando…",copyContinue:"Copiar y continuar",hintContinue:"Tras copiar, la IA volverá a la app de destino, comprobará el campo y pegará el texto.",copiedContinue:"Copiado. La IA volverá a la app de destino antes de pegar.",recordFailed:"El texto se copió, pero no se guardó en la conversación. Resuelve el error de guardado antes de continuar.",title:'Copiar texto para el teléfono',hint:'Pulsa Copiar aquí y vuelve a la app de destino. El texto no se pega automáticamente.',copy:'Copiar texto',copying:'Copiando…',copied:'Copiado. Vuelve a la app de destino antes de continuar.',cancel:'Cancelar',failed:'No se pudo copiar. Mantén esta página abierta e inténtalo de nuevo.',cancelled:'Copia cancelada.',count:'{count} caracteres'},
};
const continuationStates=new WeakMap();
export function mountClipboardPanel(root,{controller,sessionId=null,continueAfterCopy=false,onCopied=()=>{},deviceClipboard=null,navigate=url=>globalThis.location.assign(url)}){
 const doc=root.ownerDocument;
 let continuation=continuationStates.get(controller);
 if(!continuation){continuation={failedReceipt:null,callbackAttempt:null,views:new Set()};continuationStates.set(controller,continuation);}
 const notifyViews=()=>{for(const update of continuation.views)update();};
 const title=doc.createElement('strong'),hint=doc.createElement('p'),preview=doc.createElement('textarea'),status=doc.createElement('p'),actions=doc.createElement('div'),copy=doc.createElement('button'),cancel=doc.createElement('button'),retry=doc.createElement('button');
 root.dataset.noI18n='';root.classList.add('clipboard-panel');root.setAttribute('aria-live','polite');preview.readOnly=true;preview.rows=4;preview.setAttribute('aria-label','');preview.style.width='100%';copy.type=cancel.type=retry.type='button';actions.className='panel-actions';copy.className=retry.className='primary';cancel.className='secondary-button';actions.append(copy,cancel,retry);root.replaceChildren(title,hint,preview,status,actions);
 const shortcutArea=doc.createElement('div'),shortcut=doc.createElement('button'),shortcutStatus=doc.createElement('p'),guide=doc.createElement('a');let attemptedRequest=null,shortcutFault=false;
 shortcut.type='button';shortcut.className='secondary-button';guide.href='/shortcuts/clipboard.html';guide.target='_blank';guide.rel='noopener noreferrer';shortcutArea.append(shortcut,shortcutStatus,guide);if(deviceClipboard)root.append(shortcutArea);
 const words=()=>CLIPBOARD_MESSAGES[getLocale()]||CLIPBOARD_MESSAGES.en;
 const matches=(receipt,state=controller.getSnapshot())=>Boolean(receipt&&state&&state.status==='copied'&&state.requestId===receipt.requestId&&state.sessionId===receipt.sessionId&&state.targetId===receipt.targetId&&(!sessionId||state.sessionId===sessionId));
 const paint=()=>{
  const state=controller.getSnapshot(),w=words();
  if(!matches(continuation.failedReceipt,state))continuation.failedReceipt=null;
  if(continuation.callbackAttempt&&!matches(continuation.callbackAttempt.receipt,state))continuation.callbackAttempt=null;
  root.hidden=!state||(sessionId&&state.sessionId!==sessionId);
  const pending=Boolean(state&&['awaiting_user_action','copying'].includes(state.status)),canRetry=Boolean(continuation.failedReceipt);
  if(deviceClipboard){const w=SHORTCUT_COPY[getLocale()]||SHORTCUT_COPY.en,job=deviceClipboard.getSnapshot();shortcutArea.hidden=!pending||!deviceClipboard.available();shortcut.disabled=state?.status==='copying'||['preparing','waiting'].includes(job?.status);shortcut.textContent=job?.status==='failed'||shortcutFault?w.retry:w.button;guide.textContent=w.help;shortcutStatus.textContent=shortcutFault||job?.status==='failed'?w.failed:job?.status==='preparing'?w.preparing:job?.status==='waiting'?w.waiting:w.hint;}
  copy.hidden=cancel.hidden=!pending;retry.hidden=!canRetry;actions.hidden=!pending&&!canRetry;
  retry.disabled=Boolean(continuation.callbackAttempt);retry.textContent=continuation.callbackAttempt?w.retrying:continueAfterCopy?w.retryContinue:w.retrySave;
  if(root.hidden){preview.value='';return;}
  title.textContent=w.title;hint.textContent=continueAfterCopy?w.hintContinue:w.hint;preview.value=pending?controller.getPendingText():'';preview.hidden=!pending;preview.setAttribute('aria-label',w.title);copy.textContent=state.status==='copying'?w.copying:continueAfterCopy?w.copyContinue:w.copy;cancel.textContent=w.cancel;copy.disabled=state.status==='copying';status.textContent=canRetry?w.recordFailed:state.errorCode?w.failed:state.status==='copied'?(continueAfterCopy?w.copiedContinue:w.copied):state.status==='cancelled'?w.cancelled:w.count.replace('{count}',String(state.characters));
 };
 async function continueCopied(receipt){
  // A write already requested by the user survives a same-session view remount.
  // Receipt identity, rather than the lifetime of the old DOM, owns continuation.
  if(continuation.callbackAttempt||!matches(receipt))return;
  const attempt={receipt};continuation.callbackAttempt=attempt;notifyViews();
  try{await onCopied({...receipt});if(continuation.callbackAttempt===attempt&&matches(receipt))continuation.failedReceipt=null;}
  catch{if(continuation.callbackAttempt===attempt&&matches(receipt))continuation.failedReceipt={...receipt};}
  finally{if(continuation.callbackAttempt===attempt)continuation.callbackAttempt=null;notifyViews();}
 }
 copy.addEventListener('click',()=>{controller.copyPending().then(continueCopied,()=>{/* The controller renders write failures separately. */});});
 retry.addEventListener('click',()=>{if(continuation.failedReceipt)void continueCopied(continuation.failedReceipt);});
 cancel.addEventListener('click',()=>controller.cancel());
 let shortcutAttempt=0;
 function prepareShortcut(retry=false){
  const value=controller.getSnapshot();if(!deviceClipboard)return;if(!value||value.status!=='awaiting_user_action'){deviceClipboard.cancel();return;}if(!deviceClipboard.available()||(!retry&&attemptedRequest===value.requestId))return;
  attemptedRequest=value.requestId;shortcutFault=false;const attempt=++shortcutAttempt;
  void deviceClipboard.prepare({...value,text:controller.getPendingText()},{retry}).then(()=>{
   if(attempt!==shortcutAttempt)return;
   if(deviceClipboard.arm)return deviceClipboard.arm().then(receipt=>controller.completeExternal(receipt)).then(continueCopied);
  }).catch(()=>{if(attempt===shortcutAttempt){shortcutFault=true;paint();}});
 }
 shortcut.addEventListener('click',()=>{if(!deviceClipboard)return;if(deviceClipboard.getSnapshot()?.status!=='ready'){prepareShortcut(true);return;}try{const launch=deviceClipboard.start();if(!deviceClipboard.arm)launch.completion.then(receipt=>controller.completeExternal(receipt)).then(continueCopied,()=>paint());navigate(launch.url);}catch{shortcutFault=true;paint();}});
 continuation.views.add(paint);
 const unsubscribe=controller.subscribe(()=>{paint();prepareShortcut();}),unlocale=subscribe(paint),unshortcut=deviceClipboard?.subscribe(paint);paint();prepareShortcut();
 return {destroy(){continuation.views.delete(paint);unsubscribe();unlocale();unshortcut?.();root.replaceChildren();root.hidden=true;}};
}
