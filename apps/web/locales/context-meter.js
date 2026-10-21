const keys=['title','used','remaining','capacity','estimated','lastRequest','unknown','compact','compacting','compacted','unchanged','failed','loading','readFailed'];
const rows={
 en:['Context','Used','Remaining','Window size','Estimated','Last request input','The model has not provided its context window size.','Compact now','Compacting…','Context compacted','Nothing to compact','Compaction failed: {detail}','Checking context…'],
 'zh-Hans':['上下文','已用','剩余','窗口总量','估算','上次请求输入','模型未提供上下文窗口大小。','立即压缩','正在压缩…','上下文已压缩','暂无需要压缩的内容','压缩失败：{detail}','正在读取上下文…'],
 'zh-Hant':['上下文','已用','剩餘','視窗總量','估算','上次請求輸入','模型未提供上下文視窗大小。','立即壓縮','正在壓縮…','上下文已壓縮','暫無需要壓縮的內容','壓縮失敗：{detail}','正在讀取上下文…'],
 ja:['コンテキスト','使用済み','残り','ウィンドウ容量','推定','前回リクエストの入力','モデルのコンテキスト容量は提供されていません。','今すぐ圧縮','圧縮中…','圧縮しました','圧縮する内容はありません','圧縮に失敗しました：{detail}','コンテキストを確認中…'],
 ru:['Контекст','Использовано','Осталось','Размер окна','Оценка','Вход предыдущего запроса','Модель не сообщила размер контекстного окна.','Сжать сейчас','Сжатие…','Контекст сжат','Сжимать пока нечего','Ошибка сжатия: {detail}','Проверка контекста…'],
 de:['Kontext','Verwendet','Verbleibend','Fenstergröße','Geschätzt','Eingabe der letzten Anfrage','Das Modell hat keine Größe für das Kontextfenster angegeben.','Jetzt komprimieren','Wird komprimiert…','Kontext komprimiert','Nichts zu komprimieren','Komprimierung fehlgeschlagen: {detail}','Kontext wird geprüft…'],
 fr:['Contexte','Utilisé','Restant','Taille de la fenêtre','Estimation','Entrée de la dernière requête','Le modèle n’a pas fourni la taille de sa fenêtre de contexte.','Compresser maintenant','Compression…','Contexte compressé','Aucun contenu à compresser','Échec de la compression : {detail}','Vérification du contexte…'],
 es:['Contexto','Usado','Restante','Tamaño de ventana','Estimado','Entrada de la última solicitud','El modelo no ha indicado el tamaño de su ventana de contexto.','Comprimir ahora','Comprimiendo…','Contexto comprimido','No hay contenido que comprimir','Error al comprimir: {detail}','Consultando contexto…']
};
const readErrors={en:'Could not read context: {detail}','zh-Hans':'无法读取上下文：{detail}','zh-Hant':'無法讀取上下文：{detail}',ja:'コンテキストを取得できません：{detail}',ru:'Не удалось прочитать контекст: {detail}',de:'Kontext konnte nicht gelesen werden: {detail}',fr:'Impossible de lire le contexte : {detail}',es:'No se pudo leer el contexto: {detail}'};
for(const [locale,values]of Object.entries(rows))values.push(readErrors[locale]);
export const CONTEXT_METER_MESSAGES=Object.fromEntries(Object.entries(rows).map(([locale,values])=>[locale,Object.fromEntries(keys.map((key,i)=>['contextMeter.'+key,values[i]]))]));
