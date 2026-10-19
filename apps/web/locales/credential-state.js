// Status describes local credential storage, never just the profile card.
const keys=['saved','temporary','locked','missing','unavailable'];
const rows={
 en:['Credentials saved in this browser','Available only in this page — save this account or API to keep it','Earlier encrypted credentials need to be unlocked once','No saved credentials — sign in or enter an API key','Could not read saved credentials. Try again.'],
 'zh-Hans':['凭据已保存在此浏览器','仅当前页面可用，请保存账号或 API 以便下次使用','旧版加密凭据需解锁一次','尚未保存凭据，请登录或填写 API 密钥','无法读取已保存的凭据，请重试'],
 'zh-Hant':['憑證已儲存在此瀏覽器','僅目前頁面可用，請儲存帳號或 API 以便下次使用','舊版加密憑證需解鎖一次','尚未儲存憑證，請登入或填寫 API 金鑰','無法讀取已儲存的憑證，請重試'],
 ja:['認証情報はこのブラウザに保存されています','このページでのみ利用可能です。次回も使うにはアカウントまたはAPIを保存してください','以前の暗号化された認証情報を一度解除してください','認証情報が未保存です。ログインするかAPIキーを入力してください','保存済みの認証情報を読み込めませんでした。再試行してください'],
 ru:['Учётные данные сохранены в этом браузере','Доступно только на этой странице. Сохраните аккаунт или API для следующего раза','Ранее зашифрованные данные нужно один раз разблокировать','Нет сохранённых данных. Войдите или укажите ключ API','Не удалось прочитать сохранённые данные. Повторите попытку.'],
 de:['Zugangsdaten sind in diesem Browser gespeichert','Nur auf dieser Seite verfügbar. Konto oder API für die nächste Nutzung speichern','Früher verschlüsselte Zugangsdaten müssen einmal entsperrt werden','Keine Zugangsdaten gespeichert. Anmelden oder API-Schlüssel eingeben','Gespeicherte Zugangsdaten konnten nicht gelesen werden. Erneut versuchen.'],
 fr:['Identifiants enregistrés dans ce navigateur','Disponible uniquement dans cette page. Enregistrez ce compte ou cette API pour la prochaine fois','Les anciens identifiants chiffrés doivent être déverrouillés une fois','Aucun identifiant enregistré. Connectez-vous ou saisissez une clé API','Impossible de lire les identifiants enregistrés. Réessayez.'],
 es:['Credenciales guardadas en este navegador','Disponible solo en esta página. Guarda esta cuenta o API para la próxima vez','Las credenciales cifradas anteriormente deben desbloquearse una vez','No hay credenciales guardadas. Inicia sesión o introduce una clave API','No se pudieron leer las credenciales guardadas. Vuelve a intentarlo.'],
};
export const CREDENTIAL_STATE_MESSAGES=Object.fromEntries(Object.entries(rows).map(([locale,values])=>[locale,Object.fromEntries(keys.map((key,index)=>['providerCredential.'+key,values[index]]))]));
