# iPhone Agent Harness

[English](../../README.md) · [简体中文](zh-Hans.md) · [繁體中文](zh-Hant.md) · **日本語** · [Русский](ru.md) · [Deutsch](de.md) · [Français](fr.md) · [Español](es.md)

ブラウザーとESP32 Bluetoothコントローラーを使い、AIがアプリをまたいでiPhoneやiPadを操作するオープンソースのHarnessです。

対象は **iOS／iPadOS 27以降のSafari**。iPhoneとiPadではHarnessが開き、パソコンではプロジェクト紹介、スキルコミュニティ、ESP32の書き込み画面を利用できます。

使い方：[English](../acceptance/README.md) · [简体中文](../acceptance/zh-Hans.md)。主な画面と普段の操作を説明しています。

公式サイトは [igent.cc](https://igent.cc) です。接続後は Harness に戻り、デバイス接続タブを開いたままにしてください。証明書のインストールも、クラウド経由の操作転送も不要です。Safari 27.0.1 の実機で、画面共有中に両方のタブをバックグラウンドにした場合を含め、約21秒間のGET／POSTリクエスト5回が成功しました。無期限のバックグラウンド動作や、端末操作全体の検証完了を示すものではありません。[接続の検証結果](../architecture/lan-connection.md)をご覧ください。

## 機能

- **会話：**メッセージと画像のローカル保存、検索、名前変更、固定、アーカイブ、ファイルのインポート／エクスポート。対話・計画・タスクの3モードがあります。
- **アカウント・API：**複数の接続先、OpenAI／Anthropic互換API、モデル一覧の取得と切り替え。ChatGPTサブスクリプションの接続処理とログイン画面は実装済みで、Safariでの実際のログインは確認中です。
- **コンテキスト：**現在のモデルが過去のメッセージを自動要約します。開始しきい値は既定で **750,000トークン**、設定で変更できます。元の履歴は端末に残ります。
- **画像：**元のサイズを保ってJPEGで圧縮保存。ファイルサイズ優先・バランス・高画質の3段階です。
- **スキル：**10個の内蔵スキル、自作スキルの編集、コミュニティからの追加と公開。公式コミュニティの接続先は設定済みです。Harnessとの対話で自作スキルを改善できます。
- **MCP：**複数のStreamable HTTPサーバーを追加し、使うツールを個別に選んでタスクモードで実行できます。

会話はブラウザーに保存され、選択したメッセージと画像は利用するモデルサービスに送信されます。APIキーとログイン情報は既定でページのメモリーに保持し、任意で端末に暗号化保存できます。

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
