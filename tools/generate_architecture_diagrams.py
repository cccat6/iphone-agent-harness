#!/usr/bin/env python3
"""Generate editable locale SVGs from the English diagram; no network/translation service."""
from copy import deepcopy
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'docs/media/architecture.svg'
NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)
# Stable source strings make source edits explicit instead of silently translating new text.
SOURCE = [
'iPhone Agent Harness',
'Browser reasoning · local device control · your choice of model',
'SAME LOCAL WI-FI · phone stays on its usual network',
'iPhone / iPad', 'Safari · Web Harness',
'Agent loop, prompts and skills', 'Sessions, images, keys: local',
'IndexedDB · persistent local records', 'iOS screen + other apps',
'Apps, controls and clipboard', 'AssistiveTouch receives pointer input',
'Screen sharing', 'observed locally', 'Website / self-host',
'Static HTML, JS and firmware', 'Public skill sharing',
'Relay application: no data storage', 'Pages', 'Public skills',
'Chosen AI / MCP service', 'Your account or API endpoint',
'Receives selected task context', 'API / MCP direct · plan via relay', 'API',
'ESP32 bridge', 'Timed input execution', 'Bluetooth keyboard', 'and pointer',
'Powered anywhere nearby', 'WebRTC', 'Commands', '+ receipts', 'Bluetooth HID',
'Optional clipboard Shortcut:', 'local HTTP text retrieval',
'USB for firmware installation. Phone control uses local WebRTC and Bluetooth; no companion iOS app.',
'ChatGPT · stateless relay', 'Selected context + access token', 'Images and model output',
]
TEXT = {
'zh-Hans': [
'iPhone Agent Harness', '浏览器推理 · 本地设备控制 · 自选模型',
'同一局域网 Wi-Fi · 手机使用原来的网络', 'iPhone / iPad', 'Safari · 网页 Harness',
'Agent 循环、提示词与技能', '会话、图片、密钥：本地保存',
'IndexedDB · 持久本地记录', 'iOS 屏幕与其他 App', '应用、控件与剪贴板',
'辅助触控接收指针输入', '屏幕共享', '本地观察', '网站／自托管',
'静态 HTML、JS 与固件', '公开技能分享', '转发程序不持久存储数据', '网页', '公开技能',
'所选 AI／MCP 服务', '自有账号或 API 端点', '接收选中的任务上下文',
'API／MCP 直连；订阅经转发', 'HTTPS', 'ESP32 桥', '定时执行输入', '蓝牙键盘', '与指针',
'附近供电即可', 'WebRTC', '命令', '与回执', '蓝牙 HID',
'可选剪贴板快捷指令：', '通过本地 HTTP 获取文字',
'USB 用于安装固件；手机操作经局域网 WebRTC 与蓝牙，无需配套 iOS App。',
'ChatGPT · 无状态转发', '选定内容与短期访问令牌', '图片与模型输出',
],
'zh-Hant': [
'iPhone Agent Harness', '瀏覽器推理 · 本機裝置控制 · 自選模型',
'同一區域網路 Wi-Fi · 手機使用原來的網路', 'iPhone / iPad', 'Safari · 網頁 Harness',
'Agent 迴圈、提示詞與技能', '會話、圖片、金鑰：本機儲存',
'IndexedDB · 持續本機儲存', 'iOS 畫面與其他 App', '應用、控件與剪貼簿',
'輔助觸控接收指標輸入', '畫面共享', '本機觀察', '網站／自行託管',
'靜態 HTML、JS 與韌體', '公開技能分享', '轉送程式不持續儲存資料', '網頁', '公開技能',
'所選 AI／MCP 服務', '自有帳號或 API 端點', '接收選定的任務上下文',
'API／MCP 直連；訂閱經轉送', 'HTTPS', 'ESP32 橋', '定時執行輸入', '藍牙鍵盤', '與指標',
'附近供電即可', 'WebRTC', '命令', '與回執', '藍牙 HID',
'選用剪貼簿快捷指令：', '透過本機 HTTP 取得文字',
'USB 用於安裝韌體；手機操作透過區域網路 WebRTC 與藍牙，無需配套 iOS App。',
'ChatGPT · 無狀態轉送', '選定內容與短期存取權杖', '圖片與模型輸出',
],
'ja': [
'iPhone Agent Harness', 'ブラウザーで推論 · ローカル操作 · モデルを選択',
'同じLAN Wi-Fi · 電話は普段のネットワークを使用', 'iPhone / iPad', 'Safari · Web Harness',
'Agentループ・指示・スキル', '会話・画像・キーはローカル',
'IndexedDB · 端末に永続保存', 'iOS画面とほかのアプリ', 'アプリ・操作部品・クリップボード',
'AssistiveTouchがポインター入力を受信', '画面共有', 'ローカルで観察', 'サイト／自己ホスト',
'静的HTML・JS・ファームウェア', '公開スキルの共有', '中継アプリはデータを保存しない', 'ページ', '公開スキル',
'選択したAI / MCP', '自分のアカウントかAPI', '選択したタスク情報を受信',
'API / MCP 直接・プランは中継', 'HTTPS', 'ESP32ブリッジ', '時刻に沿った入力', 'Bluetoothキーボード', 'とポインター',
'近くで給電して設置', 'WebRTC', 'コマンド', 'と応答記録', 'Bluetooth HID',
'任意のコピー用ショートカット：', 'ローカルHTTPでテキスト取得',
'USBは書き込み用。端末操作はローカルWebRTCとBluetoothを使用し、専用iOSアプリは不要。',
'ChatGPT · ステートレス中継', '選択情報・短期アクセストークン', '画像・モデル出力',
],
'ru': [
'iPhone Agent Harness', 'Логика в браузере · локальное управление · выбор модели',
'ОБЩИЙ WI-FI · телефон остаётся в обычной сети', 'iPhone / iPad', 'Safari · Web Harness',
'Цикл агента, промпты, навыки', 'Разговоры, снимки, ключи: локально',
'IndexedDB · локальное хранение', 'Экран iOS и приложения', 'Приложения, элементы, буфер обмена',
'AssistiveTouch принимает указатель', 'Трансляция', 'локальное чтение', 'Сайт / свой хостинг',
'Статические HTML, JS, прошивка', 'Обмен публичными навыками', 'Реле не сохраняет данные', 'Страницы', 'Публичные\nнавыки',
'Выбранные ИИ / MCP', 'Ваш аккаунт или API', 'Получает выбранный контекст',
'API / MCP прямо; план через реле', 'HTTPS', 'Мост ESP32', 'Ввод по таймеру', 'Bluetooth-клавиатура', 'и указатель',
'Питание рядом с телефоном', 'WebRTC', 'Команды', '+ квитанции', 'Bluetooth HID',
'Необязательный Shortcut:', 'получение текста по HTTP в LAN',
'USB для прошивки. Управление по локальным WebRTC и Bluetooth, без отдельного iOS-приложения.',
'ChatGPT · реле без состояния', 'Контекст и краткосрочный токен', 'Изображения и ответы модели',
],
'de': [
'iPhone Agent Harness', 'Browserlogik · lokale Steuerung · freie Modellwahl',
'GLEICHES WLAN · Telefon bleibt im gewohnten Netzwerk', 'iPhone / iPad', 'Safari · Web Harness',
'Agent-Schleife, Prompts, Skills', 'Chats, Bilder, Schlüssel: lokal',
'IndexedDB · dauerhaft lokal', 'iOS-Bildschirm + Apps', 'Apps, Regler, Zwischenablage',
'AssistiveTouch empfängt Zeigereingaben', 'Bildschirm teilen', 'lokal beobachten', 'Website / selbst hosten',
'Statisches HTML, JS, Firmware', 'Öffentliche Skills teilen', 'Relay speichert keine Daten', 'Seiten', 'Öffentliche\nSkills',
'Gewählte KI / MCP', 'Eigenes Konto oder API', 'Erhält gewählten Task-Kontext',
'API / MCP direkt; Plan über Relay', 'HTTPS', 'ESP32-Bridge', 'Getaktete Eingaben', 'Bluetooth-Tastatur', 'und Zeiger',
'Vor Ort mit Strom versorgt', 'WebRTC', 'Befehle', '+ Belege', 'Bluetooth HID',
'Optionaler Kopier-Kurzbefehl:', 'Text über lokales HTTP abrufen',
'USB für die Firmware. Telefonsteuerung per lokalem WebRTC und Bluetooth, ohne eigene iOS-App.',
'ChatGPT · zustandsloser Relay', 'Gewählter Kontext + Zugriffstoken', 'Bilder und Modellausgaben',
],
'fr': [
'iPhone Agent Harness', 'Raisonnement web · contrôle local · choix du modèle',
'MÊME WI-FI LOCAL · le téléphone garde son réseau habituel', 'iPhone / iPad', 'Safari · Web Harness',
'Boucle, instructions, compétences', 'Conversations, images, clés : local',
'IndexedDB · sauvegarde locale', 'Écran iOS + autres apps', 'Apps, contrôles et presse-papiers',
'AssistiveTouch reçoit le pointeur', 'Partage d’écran', 'observé en local', 'Site / auto-hébergement',
'HTML, JS et firmware statiques', 'Partage de compétences', 'Le relais ne conserve pas les données', 'Pages', 'Compétences\npubliques',
'IA / MCP choisis', 'Votre compte ou API', 'Reçoit le contexte sélectionné',
'API / MCP directs; plan via relais', 'HTTPS', 'Pont ESP32', 'Entrées temporisées', 'Clavier Bluetooth', 'et pointeur',
'Alimenté à proximité', 'WebRTC', 'Commandes', '+ reçus', 'Bluetooth HID',
'Raccourci de copie facultatif :', 'texte par HTTP local',
'USB pour le firmware. Contrôle local via WebRTC et Bluetooth, sans app iOS supplémentaire.',
'ChatGPT · relais sans état', 'Contexte choisi + jeton temporaire', 'Images et réponses du modèle',
],
'es': [
'iPhone Agent Harness', 'Razonamiento web · control local · modelo a tu elección',
'MISMA WI-FI LOCAL · el teléfono sigue en su red habitual', 'iPhone / iPad', 'Safari · Web Harness',
'Ciclo, instrucciones y habilidades', 'Chats, imágenes, claves: local',
'IndexedDB · guardado local', 'Pantalla iOS + otras apps', 'Apps, controles y portapapeles',
'AssistiveTouch recibe el puntero', 'Compartir pantalla', 'observación local', 'Sitio / autoalojamiento',
'HTML, JS y firmware estáticos', 'Compartir habilidades', 'El relé no almacena los datos', 'Páginas', 'Habilidades\npúblicas',
'IA / MCP elegidos', 'Tu cuenta o API', 'Recibe el contexto elegido',
'API / MCP directas; plan por relé', 'HTTPS', 'Puente ESP32', 'Entradas temporizadas', 'Teclado Bluetooth', 'y puntero',
'Alimentación cerca', 'WebRTC', 'Órdenes', '+ recibos', 'Bluetooth HID',
'Atajo de copia opcional:', 'texto mediante HTTP local',
'USB para el firmware. Control local por WebRTC y Bluetooth, sin app iOS adicional.',
'ChatGPT · relé sin estado', 'Contexto + token temporal', 'Imágenes y respuestas del modelo',
],
}
ACCESSIBLE = {
'zh-Hans': ('iPhone Agent Harness 架构', '会话、图片和凭据保存在浏览器中。普通 API 直连；ChatGPT 订阅通过无状态服务转发选定内容、图片、输出和短期访问令牌，不保存这些数据，也不记录正文或凭据。登录与刷新仍直连 OpenAI。'),
'zh-Hant': ('iPhone Agent Harness 架構', '對話、圖片與憑證儲存在瀏覽器。一般 API 直連；ChatGPT 訂閱透過無狀態服務轉送選定內容、圖片、輸出及短期存取權杖，不儲存這些資料，也不記錄本文或憑證。登入與更新仍直連 OpenAI。'),
'ja': ('iPhone Agent Harnessの構成', '会話・画像・認証情報はブラウザーに保存します。APIは直接接続し、ChatGPTサブスクリプションは選択した情報・画像・出力・短期アクセストークンをステートレス中継に通します。中継は保存せず、本文や認証情報も記録しません。ログインと更新はOpenAIへ直接接続します。'),
'ru': ('Архитектура iPhone Agent Harness', 'История, изображения и данные доступа хранятся в браузере. API подключаются напрямую; подписка ChatGPT передаёт выбранный контекст, изображения, ответы и краткосрочный токен через ретранслятор без состояния. Он не сохраняет данные и не журналирует содержимое или токены. Вход и обновление идут напрямую в OpenAI.'),
'de': ('Architektur von iPhone Agent Harness', 'Verlauf, Bilder und Zugangsdaten werden im Browser gespeichert. APIs verbinden sich direkt; ChatGPT-Abonnements nutzen einen zustandslosen Relay für gewählten Kontext, Bilder, Ausgaben und ein kurzlebiges Zugriffstoken. Er speichert sie nicht und protokolliert keine Inhalte oder Zugangsdaten. Anmeldung und Erneuerung gehen direkt an OpenAI.'),
'fr': ('Architecture de iPhone Agent Harness', 'Historique, images et identifiants sont enregistrés dans le navigateur. Les API sont directes ; ChatGPT utilise un relais sans état pour le contexte choisi, les images, les réponses et un jeton d’accès temporaire. Le relais ne les conserve pas et ne journalise ni contenus ni identifiants. Connexion et renouvellement restent directs vers OpenAI.'),
'es': ('Arquitectura de iPhone Agent Harness', 'El historial, las imágenes y las credenciales se guardan en el navegador. Las API son directas; ChatGPT usa un relé sin estado para el contexto seleccionado, imágenes, respuestas y un token temporal. El relé no los guarda ni registra contenidos o credenciales. El inicio de sesión y la renovación siguen directamente a OpenAI.'),
}
# Locale-specific type sizes stay explicit and editable. Shapes and paths are unchanged.
SMALLER = {
'ja': {7: 13, 9: 15, 10: 12, 14: 15, 16: 13, 33: 13, 34: 13},
'ru': {5: 16, 6: 15, 7: 13, 9: 14, 14: 15, 15: 15, 16: 13, 28: 13, 31: 13, 34: 13},
'de': {10: 13, 13: 20, 16: 13, 28: 13, 33: 13, 34: 13},
'fr': {5: 16, 6: 16, 7: 13, 9: 16, 13: 19, 16: 13, 30: 13, 33: 13},
'es': {5: 16, 7: 14, 13: 20},
}

def generate():
    source = ET.parse(BASE).getroot()
    original = [e.text for e in source.iter(f'{{{NS}}}text')]
    if original != SOURCE:
        raise SystemExit('English source text changed; update the explicit translations before regenerating.')
    for locale, strings in TEXT.items():
        if len(strings) != len(SOURCE):
            raise SystemExit(f'{locale}: expected {len(SOURCE)} labels, got {len(strings)}')
        svg = deepcopy(source)
        svg.set('lang', locale)
        svg.set('{http://www.w3.org/XML/1998/namespace}lang', locale)
        svg.find(f'{{{NS}}}title').text, svg.find(f'{{{NS}}}desc').text = ACCESSIBLE[locale]
        for index, (element, text) in enumerate(zip(svg.iter(f'{{{NS}}}text'), strings)):
            parts = text.split('\n')
            if len(parts) == 1:
                element.text = text
            else:
                element.text = None
                for line, part in enumerate(parts):
                    ET.SubElement(element, f'{{{NS}}}tspan', {'x': element.get('x'), 'dy': '0' if line == 0 else '17'}).text = part
            size = SMALLER.get(locale, {}).get(index) or (13 if index in [7, 16, 22, 37, 38] else 16 if index == 36 else None)
            if size:
                element.set('style', f'font-size:{size}px')
        target = BASE.with_name(f'architecture.{locale}.svg')
        ET.ElementTree(svg).write(target, encoding='unicode', xml_declaration=False)
        with target.open('a') as stream:
            stream.write('\n')
        print(target.relative_to(ROOT))

if __name__ == '__main__':
    generate()
