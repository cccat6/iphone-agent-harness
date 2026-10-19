import {getLocale,setLocale,SUPPORTED_LOCALES,subscribe} from '../i18n.js';
export const COPY={
  "en": {
    "title": "Copy text with Shortcuts",
    "intro": "Copy long or multilingual text from Harness to your iPhone with Apple Shortcuts.",
    "download": "Download the shortcut",
    "steps": [
      "Open the download in Apple Shortcuts and add it as “iPhone Agent Clipboard”.",
      "Keep your iPhone and ESP32 bridge on the same Wi-Fi, with the bridge connected in Harness.",
      "When the text is ready, tap “Copy with Shortcuts”. Allow access to the bridge if iOS asks.",
      "After copying, return to Harness so the agent can paste into the intended field."
    ],
    "streaming": "Keep screen sharing running while the text transfers. Harness sends the text through the bridge in small chunks, and the shortcut copies the complete text to your clipboard.",
    "back": "Return to Harness",
    "pending": "",
    "failure": ""
  },
  "zh-Hans": {
    "title": "通过快捷指令复制文字",
    "intro": "使用苹果快捷指令，把 Harness 准备的长文本或多语言文字复制到 iPhone。",
    "download": "下载快捷指令",
    "steps": [
      "用苹果“快捷指令”打开下载文件，添加为“iPhone Agent Clipboard”。",
      "让手机和 ESP32 桥连接同一 Wi-Fi，并在 Harness 中连接桥。",
      "文字准备好后，点“用快捷指令复制”。系统询问是否允许访问桥时，选择允许。",
      "复制后回到 Harness，让智能体粘贴到目标输入框。"
    ],
    "streaming": "文字传输期间保持屏幕共享运行。Harness 将文字分块经过桥传输，快捷指令收到完整文字后复制到剪贴板。",
    "back": "返回 Harness",
    "pending": "",
    "failure": ""
  },
  "zh-Hant": {
    "title": "透過捷徑拷貝文字",
    "intro": "使用 Apple 捷徑，把 Harness 準備的長文字或多語言內容拷貝到 iPhone。",
    "download": "下載捷徑",
    "steps": [
      "用 Apple「捷徑」開啟下載檔案，加入為「iPhone Agent Clipboard」。",
      "讓手機與 ESP32 橋連接同一 Wi-Fi，並在 Harness 中連接橋。",
      "文字準備好後，點選「用捷徑拷貝」。系統詢問是否允許存取橋時，選擇允許。",
      "拷貝後回到 Harness，讓智慧體貼入目標欄位。"
    ],
    "streaming": "文字傳送期間保持螢幕共享運作。Harness 將文字分塊經過橋傳送，捷徑收到完整文字後拷貝到剪貼簿。",
    "back": "返回 Harness",
    "pending": "",
    "failure": ""
  },
  "ja": {
    "title": "ショートカットでテキストをコピー",
    "intro": "Appleのショートカットで、Harnessが用意した長文や多言語テキストをiPhoneにコピーします。",
    "download": "ショートカットをダウンロード",
    "steps": [
      "ダウンロードしたファイルをAppleの「ショートカット」で開き、「iPhone Agent Clipboard」として追加します。",
      "iPhoneとESP32ブリッジを同じWi-Fiにつなぎ、Harnessでブリッジに接続します。",
      "テキストの準備後に「ショートカットでコピー」を押します。ブリッジへのアクセスを求められたら許可します。",
      "コピー後にHarnessへ戻ると、エージェントが目的の欄へ貼り付けます。"
    ],
    "streaming": "転送中は画面共有を続けてください。Harnessがブリッジ経由でテキストを小分けに送り、ショートカットが全文をクリップボードにコピーします。",
    "back": "Harnessに戻る",
    "pending": "",
    "failure": ""
  },
  "ru": {
    "title": "Копирование через «Команды»",
    "intro": "Копируйте длинные и многоязычные тексты из Harness на iPhone с помощью приложения Apple «Команды».",
    "download": "Скачать команду",
    "steps": [
      "Откройте загруженный файл в приложении «Команды» и добавьте его как «iPhone Agent Clipboard».",
      "Подключите iPhone и мост ESP32 к одной сети Wi-Fi, затем подключите мост в Harness.",
      "Когда текст готов, нажмите «Копировать через „Команды“». Разрешите доступ к мосту, если iOS спросит.",
      "После копирования вернитесь в Harness, чтобы агент вставил текст в нужное поле."
    ],
    "streaming": "Оставьте трансляцию экрана включённой на время передачи. Harness отправляет текст через мост небольшими частями, а команда копирует полный текст в буфер обмена.",
    "back": "Вернуться в Harness",
    "pending": "",
    "failure": ""
  },
  "de": {
    "title": "Text mit Kurzbefehlen kopieren",
    "intro": "Kopiere lange oder mehrsprachige Texte aus Harness mit Apple Kurzbefehle auf dein iPhone.",
    "download": "Kurzbefehl herunterladen",
    "steps": [
      "Öffne die heruntergeladene Datei in Apple Kurzbefehle und füge sie als „iPhone Agent Clipboard“ hinzu.",
      "Verbinde iPhone und ESP32-Bridge mit demselben WLAN und die Bridge mit Harness.",
      "Tippe bei vorbereitetem Text auf „Mit Kurzbefehle kopieren“. Erlaube den Zugriff auf die Bridge, wenn iOS fragt.",
      "Kehre nach dem Kopieren zum Harness zurück, damit der Agent den Text ins gewünschte Feld einfügt."
    ],
    "streaming": "Lass die Bildschirmfreigabe während der Übertragung laufen. Harness sendet den Text in kleinen Teilen über die Bridge; der Kurzbefehl kopiert den vollständigen Text in die Zwischenablage.",
    "back": "Zurück zu Harness",
    "pending": "",
    "failure": ""
  },
  "fr": {
    "title": "Copier avec Raccourcis",
    "intro": "Copiez les textes longs ou multilingues de Harness sur votre iPhone avec Raccourcis d’Apple.",
    "download": "Télécharger le raccourci",
    "steps": [
      "Ouvrez le fichier téléchargé dans Raccourcis et ajoutez-le sous le nom « iPhone Agent Clipboard ».",
      "Connectez l’iPhone et le pont ESP32 au même Wi-Fi, puis le pont à Harness.",
      "Lorsque le texte est prêt, touchez « Copier avec Raccourcis ». Autorisez l’accès au pont si iOS le demande.",
      "Revenez dans Harness après la copie pour que l’agent colle le texte dans le champ choisi."
    ],
    "streaming": "Gardez le partage d’écran actif pendant le transfert. Harness transmet le texte par petits blocs via le pont, puis le raccourci copie le texte complet dans le presse-papiers.",
    "back": "Revenir à Harness",
    "pending": "",
    "failure": ""
  },
  "es": {
    "title": "Copiar con Atajos",
    "intro": "Copia textos largos o multilingües de Harness a tu iPhone con Atajos de Apple.",
    "download": "Descargar el atajo",
    "steps": [
      "Abre el archivo descargado en Atajos y añádelo con el nombre «iPhone Agent Clipboard».",
      "Conecta el iPhone y el puente ESP32 a la misma red Wi-Fi, y conecta el puente en Harness.",
      "Cuando el texto esté listo, pulsa «Copiar con Atajos». Permite el acceso al puente si iOS lo solicita.",
      "Vuelve a Harness tras copiar para que el agente pegue el texto en el campo elegido."
    ],
    "streaming": "Mantén la pantalla compartida durante la transferencia. Harness envía el texto en pequeños bloques por el puente y el atajo copia el texto completo al portapapeles.",
    "back": "Volver a Harness",
    "pending": "",
    "failure": ""
  }
};
if(globalThis.document){const select=document.querySelector('#language');for(const locale of SUPPORTED_LOCALES){const option=document.createElement('option');option.value=locale.code;option.textContent=locale.name;select.append(option);}const render=()=>{const locale=getLocale(),w=COPY[locale]||COPY.en;document.documentElement.lang=locale;document.title=w.title+' · iPhone Agent Harness';select.value=locale;for(const key of ['title','intro','download','streaming','pending','failure','back']){const node=document.getElementById(key);node.textContent=w[key];node.hidden=!w[key];}document.querySelector('#steps').replaceChildren(...w.steps.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));};select.onchange=()=>setLocale(select.value);subscribe(render);render();}
