# iPhone Agent Harness

[English](../../README.md) · [简体中文](zh-Hans.md) · [繁體中文](zh-Hant.md) · **日本語** · [Русский](ru.md) · [Deutsch](de.md) · [Français](fr.md) · [Español](es.md)

ブラウザーとESP32 Bluetoothコントローラーを使い、AIがアプリをまたいでiPhoneやiPadを操作するオープンソースのHarnessです。

対象は **iOS／iPadOS 27以降のSafari**。iPhoneとiPadではHarnessが開き、パソコンではプロジェクト紹介、スキルコミュニティ、ESP32の書き込み画面を利用できます。

使い方：[English](../acceptance/README.md) · [简体中文](../acceptance/zh-Hans.md)。主な画面と普段の操作を説明しています。

公式サイトは [igent.cc](https://igent.cc) です。Harness は **WebRTC Direct** を使い、同じページからローカルネットワーク上の ESP32 ブリッジに接続します。別の接続タブ、接続コード、証明書のインストールは不要です。最初に USB 設定リンクまたはデバイス設定ページから接続情報を取り込み、以後は Harness から接続できます。RTC と Bluetooth を統合した製品ファームウェアは実機検証中です。[接続ガイドと記録](../architecture/secure-lan.md)を参照してください。

## 機能

- **会話：**メッセージと画像のローカル保存、検索、名前変更、固定、アーカイブ、ファイルのインポート／エクスポート。同じ会話で相談、計画、実行を行えます。計画を依頼しただけでは操作を開始しません。最初の依頼から会話名を自動生成します。手動で付けた名前やインポートした会話名は変更しません。
- **アカウント・API：**複数の接続先、OpenAI／Anthropic互換API、モデル一覧の取得と切り替え。ChatGPTサブスクリプションの接続処理とログイン画面は実装済みで、Safariでの実際のログインは確認中です。対応モデルでは推論の強度を選択でき、アカウントとモデルごとに保存されます。
- **コンテキスト：**現在のモデルが過去のメッセージを自動要約します。開始しきい値は既定で **750,000トークン**、設定で変更できます。元の履歴は端末に残ります。
- **画像：**元のサイズを保ってJPEGで圧縮保存。ファイルサイズ優先・バランス・高画質の3段階です。
- **スキル：**10個の内蔵スキル、自作スキルの編集、コミュニティからの追加と公開。公式コミュニティの接続先は設定済みです。Harnessとの対話で自作スキルを改善できます。
- **MCP：**複数のStreamable HTTPサーバーを追加し、使うツールを個別に選び、実行時に承認済みのツールを利用できます。

会話はブラウザーに保存され、選択したメッセージと画像は利用するモデルサービスに送信されます。APIキーとログイン情報は、会話やエクスポートとは別にこのブラウザーに保存されます。解除パスワードは不要です。サイトデータを消去すると認証情報も削除されます。

API エンドポイントは `https://api.example.com/v1` のようなベース URL、または `/chat/completions` の完全な URL を指定できます。Anthropic 互換では `/v1/messages` も使えます。入力欄の説明に従ってプレフィックスを指定してください。モデル一覧を取得した後、同じ欄で既定のモデルを選択または入力できます。取得したすべてのモデルは会話内でも選択できます。

## 構成とローカル実行

製品は `apps/web/`（Web、Harness、スキルコミュニティ）と `firmware/IPhoneAutomationHarness/`（Arduinoファームウェア）の2部分です。サイトはセルフホストも可能です。

Node.js 22.13以降を使用します：

```sh
npm ci
npm test
npm run build
npm run preview
```

パソコンのプレビューはlocalhostで動作し、端末の画面共有にはHTTPSが必要です。`build/site` は[ページルーティング](../architecture/deployment.md#self-hosted-page-routing)に従って配置します。対応ボードとビルド手順は [Arduinoガイド](../../firmware/IPhoneAutomationHarness/README.md)を参照してください。

**手動リリース：**通常のpushではGitHub Actionsは起動しません。依頼時だけ、変更のないファームウェアを再利用し、変更分をESP32／C3／S3／C6向けにビルドします。同じバイナリをReleaseとWebサイトに公開します。[リリース設定](../architecture/manual-release.md)。

[構成](../architecture/system-blueprint.md) · [操作と撮影の同期](../architecture/actions.md) · [アカウントとMCP](../architecture/auth-and-backends.md) · [スキルの帰属](../architecture/skill-community.md) · [多言語対応](../architecture/localization.md)

[MIT License](../../LICENSE) · [Third-party notices](../../THIRD_PARTY_NOTICES.md)
