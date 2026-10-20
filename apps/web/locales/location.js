const keys=['title','enable','help','off','on','prompt','granted','denied','unsupported','deniedHelp','located','disabledError','deniedError','unavailableError','timeoutError','unsupportedError'];
const rows={
 en:[
  'Location','Allow the agent to get your location',
  'When enabled, each explicit location tool call reads your position once. Your browser asks for permission on first use, and the result is provided to the current model.',
  'Off','Enabled','Ask on use','Allowed','Denied','Not supported',
  'Allow location in this website’s permissions, then try again.','Current location obtained',
  'Enable Location in Settings to let the agent get your position.',
  'Location access was denied. Allow it in this website’s permissions and try again.',
  'Your location is unavailable right now. Try again shortly.',
  'Getting your location timed out. Try again.',
  'This browser does not support location access.'
 ],
 'zh-Hans':[
  '定位','允许智能体获取位置',
  '开启后，只有智能体明确调用定位工具时才读取一次位置。首次调用时浏览器会请求授权，结果提供给当前模型。',
  '已关闭','已开启','使用时询问','已允许','已拒绝','不支持定位',
  '请在浏览器的网站权限设置中允许定位，然后重试。','已获取当前位置',
  '请在设置中开启定位，允许智能体获取位置。',
  '定位授权被拒绝。请在浏览器的网站权限设置中允许定位后重试。',
  '暂时无法获取当前位置，请稍后重试。',
  '获取位置超时，请重试。',
  '此浏览器不支持定位。'
 ],
 'zh-Hant':[
  '定位','允許智慧體取得位置',
  '開啟後，只有智慧體明確呼叫定位工具時才讀取一次位置。首次呼叫時瀏覽器會要求授權，結果提供給目前模型。',
  '已關閉','已開啟','使用時詢問','已允許','已拒絕','不支援定位',
  '請在瀏覽器的網站權限設定中允許定位，再試一次。','已取得目前位置',
  '請在設定中開啟定位，允許智慧體取得位置。',
  '定位授權遭拒。請在瀏覽器的網站權限設定中允許定位後重試。',
  '暫時無法取得目前位置，請稍後再試。',
  '取得位置逾時，請重試。',
  '此瀏覽器不支援定位。'
 ],
 ja:[
  '位置情報','エージェントによる位置情報の取得を許可',
  '有効にすると、エージェントが位置情報ツールを呼び出すたびに一度だけ位置を取得します。初回はブラウザーが許可を求め、結果は現在のモデルに渡されます。',
  'オフ','有効','使用時に確認','許可済み','拒否済み','非対応',
  'ブラウザーのこのサイトの権限設定で位置情報を許可し、もう一度お試しください。','現在地を取得しました',
  '設定で位置情報を有効にすると、エージェントが現在地を取得できます。',
  '位置情報へのアクセスが拒否されました。このサイトの権限設定で許可してから再試行してください。',
  '現在地を取得できません。しばらくしてからお試しください。',
  '位置情報の取得がタイムアウトしました。再試行してください。',
  'このブラウザーは位置情報の取得に対応していません。'
 ],
 ru:[
  'Местоположение','Разрешить агенту получать местоположение',
  'После включения агент получает позицию один раз при каждом явном вызове инструмента геолокации. При первом использовании браузер запросит разрешение, а результат будет передан текущей модели.',
  'Выключено','Включено','Спрашивать при использовании','Разрешено','Отклонено','Не поддерживается',
  'Разрешите геолокацию в настройках доступа этого сайта и повторите попытку.','Текущее местоположение получено',
  'Включите местоположение в настройках, чтобы агент мог получить вашу позицию.',
  'Доступ к местоположению отклонён. Разрешите его в настройках этого сайта и повторите попытку.',
  'Сейчас определить местоположение не удалось. Попробуйте чуть позже.',
  'Время ожидания местоположения истекло. Повторите попытку.',
  'Этот браузер не поддерживает получение местоположения.'
 ],
 de:[
  'Standort','Dem Agenten den Standortzugriff erlauben',
  'Wenn aktiviert, ruft der Agent deinen Standort bei jedem ausdrücklichen Aufruf des Standortwerkzeugs einmal ab. Beim ersten Mal fragt der Browser nach Erlaubnis; das Ergebnis geht an das aktuelle Modell.',
  'Aus','Aktiviert','Bei Verwendung fragen','Erlaubt','Abgelehnt','Nicht unterstützt',
  'Erlaube den Standortzugriff in den Website-Berechtigungen und versuche es erneut.','Aktueller Standort ermittelt',
  'Aktiviere Standort in den Einstellungen, damit der Agent deine Position abrufen kann.',
  'Der Standortzugriff wurde abgelehnt. Erlaube ihn in den Website-Berechtigungen und versuche es erneut.',
  'Dein Standort ist gerade nicht verfügbar. Versuche es gleich noch einmal.',
  'Die Standortabfrage hat zu lange gedauert. Versuche es erneut.',
  'Dieser Browser unterstützt keinen Standortzugriff.'
 ],
 fr:[
  'Localisation','Autoriser l’agent à obtenir votre position',
  'Une fois activée, la position est lue une seule fois à chaque appel explicite de l’outil de localisation. Le navigateur demande votre accord à la première utilisation et transmet le résultat au modèle actuel.',
  'Désactivée','Activée','Demander à l’utilisation','Autorisée','Refusée','Non prise en charge',
  'Autorisez la localisation dans les permissions de ce site, puis réessayez.','Position actuelle obtenue',
  'Activez la localisation dans les réglages pour permettre à l’agent d’obtenir votre position.',
  'L’accès à votre position a été refusé. Autorisez-le dans les permissions de ce site, puis réessayez.',
  'Votre position est indisponible pour le moment. Réessayez dans quelques instants.',
  'La recherche de position a expiré. Réessayez.',
  'Ce navigateur ne prend pas en charge la localisation.'
 ],
 es:[
  'Ubicación','Permitir que el agente obtenga tu ubicación',
  'Al activarla, la posición se obtiene una vez por cada llamada explícita a la herramienta de ubicación. El navegador pide permiso al usarla por primera vez y el resultado se envía al modelo actual.',
  'Desactivada','Activada','Preguntar al usar','Permitida','Denegada','No compatible',
  'Permite la ubicación en los permisos de este sitio y vuelve a intentarlo.','Ubicación actual obtenida',
  'Activa Ubicación en Ajustes para que el agente pueda obtener tu posición.',
  'Se ha denegado el acceso a tu ubicación. Permítelo en los permisos de este sitio y vuelve a intentarlo.',
  'Tu ubicación no está disponible ahora. Vuelve a intentarlo en un momento.',
  'Se agotó el tiempo para obtener tu ubicación. Vuelve a intentarlo.',
  'Este navegador no admite el acceso a la ubicación.'
 ]
};
export const LOCATION_MESSAGES=Object.fromEntries(Object.entries(rows).map(([locale,values])=>[locale,Object.fromEntries(keys.map((key,index)=>['location.'+key,values[index]]))]));
