# iPhone Agent Harness

[English](../../README.md) · [简体中文](zh-Hans.md) · **繁體中文** · [日本語](ja.md) · [Русский](ru.md) · [Deutsch](de.md) · [Français](fr.md) · [Español](es.md)

透過瀏覽器及 ESP32 藍牙橋，讓 AI 跨 App 操作 iPhone 與 iPad 的開源 Harness。

[igent.cc](https://igent.cc) · [GitHub](https://github.com/cccat6/iphone-agent-harness)

![示範占位圖：瀏覽器、ESP32 橋與手機。操作影片／GIF 即將補上。](../../apps/web/media/demo-placeholder.svg)

示範占位圖：瀏覽器、ESP32 橋與手機。操作影片／GIF 即將補上。

## 五步開始使用

準備 iOS/iPadOS 27 以上的 Safari、至少 4 MB 快閃記憶體的 ESP32/C3/S3/C6、可傳資料的 USB 線、區域網路 2.4 GHz Wi-Fi，以及 AI 帳號或相容 API。網頁燒錄需使用電腦 Chrome 或 Edge。

1. **安裝橋接韌體.** 在電腦開啟燒錄頁，選擇開發板並安裝韌體，讀取裝置資訊，保留手機連線連結。新板子連接裝置設定 Wi-Fi，依頁面儲存常用網路，再讓手機回到該網路。

2. **連接手機.** 開啟提供的連結，或在 Harness 取得橋的資訊。儲存後返回並連接 ESP32 橋。在 iOS 藍牙配對 iPhone Agent Bridge，啟用輔助觸控，選擇已就緒手機。新韌體八位數字測試為選用，全鍵盤控制開關皆可。無需連線碼、安裝憑證或額外分頁。

3. **選擇 AI.** 在「設定 → 帳號或 API」加入端點／金鑰並取得模型，或依介面登入 ChatGPT。預設模型可選擇或輸入，全部取得的模型仍可切換。新增會話，選模型及支援的推理強度。

4. **共享並提出任務.** 開始共享畫面，先試測試鬧鐘等短任務。詢問能力會收到說明，要求計畫會顯示可檢查計畫，明確要求操作才執行。保持手機解鎖，觀察首次動作。停止會結束，失去共享則暫停，繼續時重新要求共享。

5. **檢查結果.** AI 應先核對結果才結束，預設隨後返回 Harness；可在「設定 → 任務完成」關閉返回，停留目標 App。重要操作請自行核對實際畫面。

## 日常操作

- 點會話列表標題選擇器切換會話／封存。普通列左滑可改名／封存，封存列可改名／還原／刪除，刪除需確認。下拉列表或點搜尋按鈕搜尋。

- 向上捲動逐頁讀取舊訊息，新回覆保留閱讀位置，點「最新訊息」才回到最新內容。會話選單匯出，設定匯入；含圖片檔案上限 64 MiB。

- 長文字可安裝剪貼簿教學的 iPhone Agent Clipboard，使用快捷指令複製或前景複製並繼續。任務等待複製確認、核對目標輸入欄後才貼上。

- 12 個內建技能涵蓋觀察、規劃、導航、文字、捲動、拖放、恢復、挑戰、創作、時鐘及手勢修正。精確控件支援時直接輸入數字，否則小幅修正並等穩定。

- 電腦或手機均可創作、編輯、發布自己的技能。作者歸屬使用瀏覽器產生的加密身分，不是 iOS 裝置 UID；更換瀏覽器前匯出加密備份。內建／下載技能唯讀，重新整理時檢查更新並保留啟用選擇，失敗保留原版本。

- 選用 MCP 支援多個可由瀏覽器存取的 Streamable HTTP 伺服器，逐項授權工具；伺服器須支援 CORS。不執行 stdio，也不提供完整遠端 OAuth 託管。

## 資料與限制

會話、圖片、API 金鑰及登入資料儲存在目前瀏覽器，憑據不隨會話匯出，也不需解鎖密碼。選定訊息／圖片會傳給模型服務。清除網站資料會刪除本機內容，請匯出重要會話。公開技能僅上傳明確選擇的套件。

實驗硬體功能請在觀察下使用。手機手勢、背景取屏、快捷指令及多手機仍需自行驗收，編譯與電腦檢查不代表實機通過。Safari 可能暫停背景工作。任務沒有預設整項步數／時間上限，各動作計畫仍有安全限制。Safari ChatGPT 訂閱登入與更新仍有相容邊界。橋目前僅一個活動 WebRTC 連線，多個保存的瀏覽器不代表同時控制。最新多用戶端註冊／匯入修正已準備在原始碼，尚未刷入實測。

## 開發與自行託管

需要 Node.js 22.13 以上。產品分為 apps/web 網頁與 firmware/IPhoneAutomationHarness 韌體；靜態網頁可搭配選用的簽名技能 API。手機共享需 HTTPS。

```sh
npm ci
npm test
npm run build
npm run preview
```

維護者手動觸發發布，普通推送不執行 GitHub Actions。韌體重用、下載與部署請見發布說明。

[手機指南](../acceptance/zh-Hans.md) · [Arduino 說明](../../firmware/IPhoneAutomationHarness/README.md) · [架構](../architecture/overview.md) · [自行託管](../architecture/deployment.md) · [手動發布](../architecture/manual-release.md) · [剪貼簿教學](https://igent.cc/shortcuts/clipboard.html)

[MIT License](../../LICENSE) · [Third-party notices](../../THIRD_PARTY_NOTICES.md)
