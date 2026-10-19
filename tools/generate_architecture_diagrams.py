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
'IndexedDB · no session upload to host', 'iOS screen + other apps',
'Apps, controls and clipboard', 'AssistiveTouch receives pointer input',
'Screen sharing', 'observed locally', 'Website / self-host',
'Static HTML, JS and firmware', 'Public skill sharing',
'No sessions, screenshots or keys', 'Pages', 'Public skills',
'Chosen AI / MCP service', 'Your account or API endpoint',
'Receives selected task context', 'Connected directly from Safari', 'HTTPS',
'ESP32 bridge', 'Timed input execution', 'Bluetooth keyboard', 'and pointer',
'Powered anywhere nearby', 'WebRTC', 'Commands', '+ receipts', 'Bluetooth HID',
'Optional clipboard Shortcut:', 'local HTTP text retrieval',
'USB is needed only for initial firmware installation. No phone cable, cloud command relay or companion iOS app.',
]
TEXT = {
'zh-Hans': [
'iPhone Agent Harness', '浏览器推理 · 本地设备控制 · 自选模型',
'同一局域网 Wi-Fi · 手机使用原来的网络', 'iPhone / iPad', 'Safari · 网页 Harness',
'Agent 循环、提示词与技能', '会话、图片、密钥：本地保存',
'IndexedDB · 会话不上传网站主机', 'iOS 屏幕与其他 App', '应用、控件与剪贴板',
'辅助触控接收指针输入', '屏幕共享', '本地观察', '网站／自托管',
'静态 HTML、JS 与固件', '公开技能分享', '不接收会话、截图或密钥', '网页', '公开技能',
'所选 AI／MCP 服务', '自有账号或 API 端点', '接收选中的任务上下文',
'由 Safari 直接连接', 'HTTPS', 'ESP32 桥', '定时执行输入', '蓝牙键盘', '与指针',
'附近供电即可', 'WebRTC', '命令', '与回执', '蓝牙 HID',
'可选剪贴板快捷指令：', '通过本地 HTTP 获取文字',
'USB 仅用于首次安装固件。手机无需线缆、云端指令中继或配套 iOS App。',
],
'zh-Hant': [
'iPhone Agent Harness', '瀏覽器推理 · 本機裝置控制 · 自選模型',
'同一區域網路 Wi-Fi · 手機使用原來的網路', 'iPhone / iPad', 'Safari · 網頁 Harness',
'Agent 迴圈、提示詞與技能', '會話、圖片、金鑰：本機儲存',
'IndexedDB · 會話不上傳網站主機', 'iOS 畫面與其他 App', '應用、控件與剪貼簿',
'輔助觸控接收指標輸入', '畫面共享', '本機觀察', '網站／自行託管',
'靜態 HTML、JS 與韌體', '公開技能分享', '不接收會話、截圖或金鑰', '網頁', '公開技能',
'所選 AI／MCP 服務', '自有帳號或 API 端點', '接收選定的任務上下文',
'由 Safari 直接連接', 'HTTPS', 'ESP32 橋', '定時執行輸入', '藍牙鍵盤', '與指標',
'附近供電即可', 'WebRTC', '命令', '與回執', '藍牙 HID',
'選用剪貼簿快捷指令：', '透過本機 HTTP 取得文字',
'USB 僅用於首次安裝韌體。手機無需線纜、雲端指令中繼或配套 iOS App。',
],
'ja': [
'iPhone Agent Harness', 'ブラウザーで推論 · ローカル操作 · モデルを選択',
'同じLAN Wi-Fi · 電話は普段のネットワークを使用', 'iPhone / iPad', 'Safari · Web Harness',
'Agentループ・指示・スキル', '会話・画像・キーはローカル',
'IndexedDB · 会話をホストへ送信しない', 'iOS画面とほかのアプリ', 'アプリ・操作部品・クリップボード',
'AssistiveTouchがポインター入力を受信', '画面共有', 'ローカルで観察', 'サイト／自己ホスト',
'静的HTML・JS・ファームウェア', '公開スキルの共有', '会話・画像・キーは受け取らない', 'ページ', '公開スキル',
'選択したAI / MCP', '自分のアカウントかAPI', '選択したタスク情報を受信',
'Safariから直接接続', 'HTTPS', 'ESP32ブリッジ', '時刻に沿った入力', 'Bluetoothキーボード', 'とポインター',
'近くで給電して設置', 'WebRTC', 'コマンド', 'と応答記録', 'Bluetooth HID',
'任意のコピー用ショートカット：', 'ローカルHTTPでテキスト取得',
'USBは初回の書き込みに使用。電話ケーブル、クラウド操作中継、専用iOSアプリは不要。',
],
'ru': [
'iPhone Agent Harness', 'Логика в браузере · локальное управление · выбор модели',
'ОБЩИЙ WI-FI · телефон остаётся в обычной сети', 'iPhone / iPad', 'Safari · Web Harness',
'Цикл агента, промпты, навыки', 'Разговоры, снимки, ключи: локально',
'IndexedDB · разговоры не уходят хосту', 'Экран iOS и приложения', 'Приложения, элементы, буфер обмена',
'AssistiveTouch принимает указатель', 'Трансляция', 'локальное чтение', 'Сайт / свой хостинг',
'Статические HTML, JS, прошивка', 'Обмен публичными навыками', 'Без разговоров, снимков, ключей', 'Страницы', 'Публичные\nнавыки',
'Выбранные ИИ / MCP', 'Ваш аккаунт или API', 'Получает выбранный контекст',
'Прямое соединение с Safari', 'HTTPS', 'Мост ESP32', 'Ввод по таймеру', 'Bluetooth-клавиатура', 'и указатель',
'Питание рядом с телефоном', 'WebRTC', 'Команды', '+ квитанции', 'Bluetooth HID',
'Необязательный Shortcut:', 'получение текста по HTTP в LAN',
'USB только для первой прошивки. Без кабеля к телефону, облачного реле команд и отдельного iOS-приложения.',
],
'de': [
'iPhone Agent Harness', 'Browserlogik · lokale Steuerung · freie Modellwahl',
'GLEICHES WLAN · Telefon bleibt im gewohnten Netzwerk', 'iPhone / iPad', 'Safari · Web Harness',
'Agent-Schleife, Prompts, Skills', 'Chats, Bilder, Schlüssel: lokal',
'IndexedDB · kein Chat-Upload zum Host', 'iOS-Bildschirm + Apps', 'Apps, Regler, Zwischenablage',
'AssistiveTouch empfängt Zeigereingaben', 'Bildschirm teilen', 'lokal beobachten', 'Website / selbst hosten',
'Statisches HTML, JS, Firmware', 'Öffentliche Skills teilen', 'Keine Chats, Bilder oder Schlüssel', 'Seiten', 'Öffentliche\nSkills',
'Gewählte KI / MCP', 'Eigenes Konto oder API', 'Erhält gewählten Task-Kontext',
'Direkt aus Safari verbunden', 'HTTPS', 'ESP32-Bridge', 'Getaktete Eingaben', 'Bluetooth-Tastatur', 'und Zeiger',
'Vor Ort mit Strom versorgt', 'WebRTC', 'Befehle', '+ Belege', 'Bluetooth HID',
'Optionaler Kopier-Kurzbefehl:', 'Text über lokales HTTP abrufen',
'USB nur zur Erstinstallation. Kein Kabel zum Telefon, keine Cloud-Befehlsvermittlung oder zusätzliche iOS-App.',
],
'fr': [
'iPhone Agent Harness', 'Raisonnement web · contrôle local · choix du modèle',
'MÊME WI-FI LOCAL · le téléphone garde son réseau habituel', 'iPhone / iPad', 'Safari · Web Harness',
'Boucle, instructions, compétences', 'Conversations, images, clés : local',
'IndexedDB · pas de conversation à l’hôte', 'Écran iOS + autres apps', 'Apps, contrôles et presse-papiers',
'AssistiveTouch reçoit le pointeur', 'Partage d’écran', 'observé en local', 'Site / auto-hébergement',
'HTML, JS et firmware statiques', 'Partage de compétences', 'Ni conversations, captures ni clés', 'Pages', 'Compétences\npubliques',
'IA / MCP choisis', 'Votre compte ou API', 'Reçoit le contexte sélectionné',
'Connexion directe depuis Safari', 'HTTPS', 'Pont ESP32', 'Entrées temporisées', 'Clavier Bluetooth', 'et pointeur',
'Alimenté à proximité', 'WebRTC', 'Commandes', '+ reçus', 'Bluetooth HID',
'Raccourci de copie facultatif :', 'texte par HTTP local',
'USB pour installer le firmware. Aucun câble au téléphone, relais de commandes cloud ou app iOS dédiée.',
],
'es': [
'iPhone Agent Harness', 'Razonamiento web · control local · modelo a tu elección',
'MISMA WI-FI LOCAL · el teléfono sigue en su red habitual', 'iPhone / iPad', 'Safari · Web Harness',
'Ciclo, instrucciones y habilidades', 'Chats, imágenes, claves: local',
'IndexedDB · sin enviar chats al host', 'Pantalla iOS + otras apps', 'Apps, controles y portapapeles',
'AssistiveTouch recibe el puntero', 'Compartir pantalla', 'observación local', 'Sitio / autoalojamiento',
'HTML, JS y firmware estáticos', 'Compartir habilidades', 'Sin chats, capturas ni claves', 'Páginas', 'Habilidades\npúblicas',
'IA / MCP elegidos', 'Tu cuenta o API', 'Recibe el contexto elegido',
'Conexión directa desde Safari', 'HTTPS', 'Puente ESP32', 'Entradas temporizadas', 'Teclado Bluetooth', 'y puntero',
'Alimentación cerca', 'WebRTC', 'Órdenes', '+ recibos', 'Bluetooth HID',
'Atajo de copia opcional:', 'texto mediante HTTP local',
'USB solo para instalar firmware. Sin cable al teléfono, relé de comandos en la nube ni app iOS adicional.',
],
}
ACCESSIBLE = {
'zh-Hans': ('iPhone Agent Harness 架构', '网站提供静态网页与公开技能。Safari 在本地保存会话和密钥，将选中上下文直接发送给所选 AI 服务，并经局域网 WebRTC 与 ESP32 交换命令及回执。ESP32 用蓝牙 HID 操作同一手机。手机无需 USB 线或云端指令中继。'),
'zh-Hant': ('iPhone Agent Harness 架構', '網站提供靜態網頁與公開技能。Safari 在本機儲存會話與金鑰，將選定內容直接傳給所選 AI，透過區域網路 WebRTC 與 ESP32 交換命令和回執。ESP32 用藍牙 HID 操作同一手機。無需手機 USB 線或雲端指令中繼。'),
'ja': ('iPhone Agent Harnessの構成', 'サイトは静的ページと公開スキルを配信。Safariは会話とキーをローカルに保存し、選択した内容をAIへ直接送り、ローカルWebRTCでESP32とコマンド・応答を交換します。ESP32はBluetooth HIDで同じ電話を操作。電話USBケーブルやクラウド中継は不要です。'),
'ru': ('Архитектура iPhone Agent Harness', 'Сайт раздаёт статические страницы и публичные навыки. Safari хранит разговоры и ключи локально, передаёт выбранный контекст ИИ напрямую и обменивается командами и квитанциями с ESP32 по локальному WebRTC. ESP32 управляет тем же телефоном через Bluetooth HID. USB к телефону и облачное реле команд не нужны.'),
'de': ('Architektur von iPhone Agent Harness', 'Die Website liefert statische Seiten und öffentliche Skills. Safari speichert Chats und Schlüssel lokal, sendet gewählten Kontext direkt an die KI und tauscht Befehle und Belege lokal per WebRTC mit ESP32 aus. ESP32 bedient dasselbe Telefon über Bluetooth HID. Kein Telefon-USB-Kabel oder Cloud-Befehlsrelay nötig.'),
'fr': ('Architecture de iPhone Agent Harness', 'Le site fournit des pages statiques et des compétences publiques. Safari garde conversations et clés en local, envoie le contexte choisi directement à l’IA et échange commandes et reçus avec ESP32 via WebRTC local. ESP32 pilote le même téléphone par Bluetooth HID, sans câble USB au téléphone ni relais cloud.'),
'es': ('Arquitectura de iPhone Agent Harness', 'El sitio sirve páginas estáticas y habilidades públicas. Safari guarda chats y claves localmente, envía contexto elegido directamente a la IA e intercambia comandos y recibos con ESP32 por WebRTC local. ESP32 opera el mismo teléfono con Bluetooth HID. Sin USB al teléfono ni relé de comandos en la nube.'),
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
            size = SMALLER.get(locale, {}).get(index)
            if size:
                element.set('style', f'font-size:{size}px')
        target = BASE.with_name(f'architecture.{locale}.svg')
        ET.ElementTree(svg).write(target, encoding='unicode', xml_declaration=False)
        with target.open('a') as stream:
            stream.write('\n')
        print(target.relative_to(ROOT))

if __name__ == '__main__':
    generate()
