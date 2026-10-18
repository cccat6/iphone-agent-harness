# iPhone Agent Harness

[English](../../README.md) · [简体中文](zh-Hans.md) · **繁體中文** · [日本語](ja.md) · [Русский](ru.md) · [Deutsch](de.md) · [Français](fr.md) · [Español](es.md)

透過瀏覽器介面與 ESP32 藍牙鍵鼠橋接器，讓 AI 跨 App 操作 iPhone 和 iPad 的開源 Harness。

目標平台為 **iOS/iPadOS 27 以上的 Safari**。手機和平板預設進入 Harness；桌面使用者會看到專案首頁、Skill 社群及 ESP32 設定／韌體頁面。目前不開發原生 App 或 Android 版本。

## 目前進度

Web 應用程式、具驗證機制的區域網路韌體通訊與裝置設定介面已實作。[igent.cc](https://igent.cc) 網站與簽章 Skill 社群已部署。產品韌體的實機驗收仍在進行；編譯、主機測試及瀏覽器模擬無法證明手機操作正確，或 Safari 已能直接連線區域網路裝置。

獨立的 iPhone 12／iOS 27.0.1 實驗已確認跨 App 擷取畫面、背景延遲與串流請求，以及兩種協定的四次真實 DeepSeek 短請求；早期實驗韌體曾驗證鍵盤、Home、指標與滑動。這些結果不代表新產品已通過驗收，也不保證無限背景執行。[實驗記錄](../research/background-api.md)及[韌體限制](../architecture/firmware-implementation.md)保留了完整邊界。

## 功能

- **本機對話：**IndexedDB 對話、附件、匯入匯出、對話／規劃／任務模式及取消。選定的內容和圖片會傳送給使用者設定的 AI 後端；專案不營運雲端對話資料庫。
- **模型與帳號：**OpenAI／Anthropic 相容介面、模型目錄及多帳號。Codex 訂閱的裝置碼、更新權杖與 Responses 適配已實作；Safari 真實登入與舊 Codex 端點 CORS 仍待驗證，不會假裝連線成功。
- **上下文與圖片：**可設定壓縮門檻、目標、回覆預留與圖片數量，選擇模型摘要或摘錄；token 為估算。圖片最長邊及 JPEG 品質可調整，保留縮放和時間資料。快取統計依後端回報，不能保證命中。
- **10 個內建 Skill：**畫面觀察、連續觀察、任務規劃、手機導覽、文字輸入、清單捲動、拖放、復原、驗證挑戰路由、Skill 創作。工具固定，不自動安裝可執行外掛。
- **創作與社群：**本機 P-256 作者身分、加密備份與跨裝置還原。只能修改自己的 authored Skill；社群下載項目唯讀。公開發佈必須由使用者明確操作；選配社群 API **已在官網部署**，只儲存主動公開的 Skill。

憑證預設留在記憶體；可選擇本機加密儲存並以密碼解鎖，不納入靜態網站產物。[訂閱接入說明](../research/codex-subscription.md)列出實際限制。

## 專案與執行

兩個產品部分為 `apps/web/` 與 `firmware/IPhoneAutomationHarness/`；社群及選配 API 都屬於 Web。提示詞、規格、測試和文件是共用工程資料。靜態網站可自行託管，本機使用不需要社群伺服器。橋接器規劃採首次熱點設定 Wi-Fi、目標綁定與 mDNS 重連；mDNS 不會自動處理 HTTPS 或認證。

使用 Node.js 22.13 以上：

```sh
npm ci
npm test
npm run build
npm run preview
```

桌面可透過 localhost 預覽；手機擷取畫面需要 **HTTPS**。`build/site` 可部署至 Cloudflare 或已設定[頁面路由](../architecture/deployment.md#self-hosted-page-routing)的自有 HTTPS 主機，不包含私人對話和測試金鑰。[Arduino 指南](../../firmware/IPhoneAutomationHarness/README.md)提供工具鏈說明。

[系統架構](../architecture/system-blueprint.md) · [手勢與截圖同步](../architecture/actions.md) · [執行環境](../architecture/runtime.md) · [社群歸屬](../architecture/skill-community.md) · [多語系](../architecture/localization.md)

Safari 到區域網路 ESP32 的直接連線、安全設定與目標證明、慣性滑動及單一 C3 控制兩台手機的隔離，仍需實機驗收。

完整驗收清單：[简体中文](../acceptance/zh-Hans.md) · [English](../acceptance/README.md)。逐項涵蓋全部功能與內容，列出電腦證據與暫緩的手機步驟；電腦準備及最終發布核驗由專案團隊完成。

Mac已通過真實C3的CA／DNS驗證HTTPS及產品用戶端擁有者配對，未傳送手機輸入；最終映像核驗與Safari／手機驗收仍須分別完成。見[實機用戶端記錄](../research/device-client-live-verification.json)。

手動發布：一般推送不會觸發 Actions。明確要求後才執行，重用未變更的韌體，編譯變更的 ESP32／C3／S3／C6 韌體，將二進位檔發布至 Release，並隨網站部署同一批檔案。[發布流程與憑證設定](../architecture/manual-release.md)。

[MIT License](../../LICENSE) · [Third-party notices](../../THIRD_PARTY_NOTICES.md)
