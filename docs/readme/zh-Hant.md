# iPhone Agent Harness

[English](../../README.md) · [简体中文](zh-Hans.md) · **繁體中文** · [日本語](ja.md) · [Русский](ru.md) · [Deutsch](de.md) · [Français](fr.md) · [Español](es.md)

透過瀏覽器和 ESP32 藍牙控制器，讓 AI 跨 App 操作 iPhone 與 iPad 的開源 Harness。

適用於 **iOS/iPadOS 27 以上的 Safari**。iPhone 和 iPad 預設進入 Harness；電腦端提供專案首頁、技能社群及 ESP32 線上燒錄。

使用說明：[简体中文](../acceptance/zh-Hans.md) · [English](../acceptance/README.md)。介紹主要畫面與日常操作。

官網為 [igent.cc](https://igent.cc)。連接裝置後，請切回 Harness，並保持「裝置連接」分頁開啟；不需要安裝憑證，操作指令也不經雲端轉送。Safari 27.0.1 實機已通過約 21 秒的五輪 GET／POST 測試，包括錄製螢幕期間兩個分頁都在背景的請求。這不代表能無限期在背景執行，也不等於完整手機操作已驗收。詳見[連接結果](../architecture/lan-connection.md)。

## 功能

- **對話：**訊息和圖片保存在本機，支援搜尋、重新命名、置頂、封存及檔案匯入匯出；提供對話、計畫、任務三種模式。
- **帳號或 API：**新增多個連線，支援 OpenAI 與 Anthropic 相容的 API 端點，取得並切換模型。ChatGPT 訂閱接入及登入介面已實作，實際 Safari 訂閱登入仍待驗證。
- **上下文：**由模型自動摘要較早的訊息，預設門檻為 **750,000 token**，可在設定中調整；完整對話保存在裝置上。
- **圖片：**保留原始尺寸，以 JPEG 壓縮，提供節省空間、均衡、高畫質三種選項。
- **技能：**包含十個內建技能，支援創作、編輯、下載及社群發布。官網社群位址已內建，也可以透過對話讓 Harness 協助編寫或修改自己的技能。
- **MCP：**新增多個 Streamable HTTP 伺服器，分別選擇工具，在任務模式中使用。

對話儲存在目前瀏覽器，選取的訊息和圖片會傳送至你選擇的模型服務。API 金鑰和登入資訊預設暫存於目前頁面，也可選擇加密儲存在裝置上。

## 程式碼與本機執行

專案分為 `apps/web/`（網頁、Harness 和技能社群）與 `firmware/IPhoneAutomationHarness/`（Arduino 韌體）兩部分。網站也支援自行託管。

需要 Node.js 22.13 以上：

```sh
npm ci
npm test
npm run build
npm run preview
```

電腦端可使用 localhost 預覽，手機螢幕分享需要 HTTPS。部署 `build/site` 時請依[頁面路由說明](../architecture/deployment.md#self-hosted-page-routing)設定。支援的開發板與編譯方式見 [Arduino 說明](../../firmware/IPhoneAutomationHarness/README.md)。

**手動發布：**一般推送不觸發 GitHub Actions。明確要求後才執行，重用未變更的韌體，編譯變更的 ESP32／C3／S3／C6 版本，將二進位檔發布至 Release，並隨網站部署同一批檔案。[發布設定](../architecture/manual-release.md)。

[系統架構](../architecture/system-blueprint.md) · [操作與截圖同步](../architecture/actions.md) · [帳號與 MCP](../architecture/auth-and-backends.md) · [技能歸屬](../architecture/skill-community.md) · [多語系](../architecture/localization.md)

[MIT License](../../LICENSE) · [Third-party notices](../../THIRD_PARTY_NOTICES.md)
