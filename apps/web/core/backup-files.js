// Separate bounds for session images and small Skill/identity documents. Session
// export and import share the same UTF-8 byte limit, so a successful export fits.
export const DOCUMENT_IMPORT_BYTES=10*1024*1024;
export const SESSION_BACKUP_BYTES=64*1024*1024;
export const BACKUP_ERRORS={
  BACKUP_TOO_LARGE:{
    en:'Session backups are limited to 64 MiB. Existing data in this browser is unchanged.',
    'zh-Hans':'会话备份上限为 64 MiB。当前浏览器中的原有数据保持不变。',
    'zh-Hant':'對話備份上限為 64 MiB。目前瀏覽器中的原有資料維持不變。',
    ja:'セッションのバックアップ上限は 64 MiB です。ブラウザ内の既存データは変更されません。',
    ru:'Размер резервной копии сеанса ограничен 64 МиБ. Существующие данные в этом браузере не изменены.',
    de:'Sitzungssicherungen sind auf 64 MiB begrenzt. Vorhandene Daten in diesem Browser bleiben unverändert.',
    fr:'Les sauvegardes de conversation sont limitées à 64 Mio. Les données existantes de ce navigateur sont inchangées.',
    es:'Las copias de conversaciones tienen un límite de 64 MiB. Los datos existentes en este navegador no se han modificado.'
  },
  IMPORT_TOO_LARGE:{
    en:'This file exceeds the 10 MiB import limit for Skills and creator identities.',
    'zh-Hans':'此文件超过 Skill 和创作者身份文件的 10 MiB 导入上限。',
    'zh-Hant':'此檔案超過 Skill 與創作者身分檔案的 10 MiB 匯入上限。',
    ja:'このファイルは Skill と作成者 ID のインポート上限（10 MiB）を超えています。',
    ru:'Файл превышает лимит импорта Skill и профилей автора: 10 МиБ.',
    de:'Diese Datei überschreitet die Importgrenze von 10 MiB für Skills und Erstelleridentitäten.',
    fr:'Ce fichier dépasse la limite d’importation de 10 Mio pour les Skills et les identités de créateur.',
    es:'Este archivo supera el límite de importación de 10 MiB para Skills e identidades de creador.'
  }
};
function checkSize(size,maxBytes){if(size>maxBytes)throw Object.assign(new Error(maxBytes===SESSION_BACKUP_BYTES?'BACKUP_TOO_LARGE':'IMPORT_TOO_LARGE'),{code:maxBytes===SESSION_BACKUP_BYTES?'BACKUP_TOO_LARGE':'IMPORT_TOO_LARGE'});}
export async function readImportFile(file,{maxBytes=DOCUMENT_IMPORT_BYTES}={}){checkSize(file.size,maxBytes);return file.text();}
export function sessionBackupBlob(value){const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'});checkSize(blob.size,SESSION_BACKUP_BYTES);return blob;}
