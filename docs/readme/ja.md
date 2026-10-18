# iPhone Agent Harness

[English](../../README.md) · [简体中文](zh-Hans.md) · [繁體中文](zh-Hant.md) · **日本語** · [Русский](ru.md) · [Deutsch](de.md) · [Français](fr.md) · [Español](es.md)

ブラウザー上の AI と ESP32 の Bluetooth HID ブリッジを使い、アプリをまたいで iPhone／iPad を操作するオープンソースの Harness です。

対象は **iOS／iPadOS 27 以降の Safari**。iPhone／iPad では Harness が標準画面になり、デスクトップではプロジェクトのホーム、Skill コミュニティ、ESP32 の設定・ファームウェアページを表示します。ネイティブアプリと Android 版は対象外です。

## 現在の状態

Web アプリ、認証付き LAN 通信とデバイス設定画面を実装しました。公式サイトと署名付き Skill コミュニティは [igent.cc](https://igent.cc) で公開済みです。製品用ファームウェアの実機検証は進行中です。コンパイル、ホスト上のテスト、ブラウザーの模擬試験だけでは、実際の操作や Safari から LAN への接続を確認したことにはなりません。

別の iPhone 12／iOS 27.0.1 の試験では、アプリ間の画面取得、バックグラウンドでの遅延応答・ストリーミング、両互換プロトコルによる実際の DeepSeek 短時間リクエスト4件を確認しました。以前の実験用ファームウェアではキーボード、Home、ポインター、スワイプも動作しました。これらは新製品の動作保証や無制限のバックグラウンド実行を意味しません。[試験記録](../research/background-api.md)と[ファームウェアの範囲](../architecture/firmware-implementation.md)を参照してください。

## 主な構成

- **ローカルの会話：**IndexedDB、添付画像、インポート／エクスポート、会話・計画・タスクの各モード、中断処理。選択された会話と画像は設定先の AI に送りますが、本プロジェクトはクラウド上の会話データベースを持ちません。
- **モデルとアカウント：**OpenAI／Anthropic 互換 API、モデル一覧取得、複数アカウント。Codex サブスクリプション用のデバイスコード、トークン更新、Responses アダプターも実装済みです。Safari での実際のログインと旧 Codex エンドポイントの CORS は未検証で、失敗を接続成功と表示しません。
- **コンテキストと画像：**圧縮の開始・目標・応答用予算、画像数、モデル要約／抜粋要約を設定できます。トークン数は推定値です。画像の最大辺と JPEG 品質も調整でき、倍率と時刻を記録します。キャッシュ使用量はバックエンドの報告に基づき、ヒットを保証しません。
- **10個の内蔵 Skill：**画面観察、連続観察、タスク計画、ナビゲーション、文字入力、リストのスクロール、ドラッグ＆ドロップ、復旧、認証チャレンジの振り分け、Skill 作成。ツールは固定され、実行可能なプラグインを追加する仕組みではありません。
- **作者とコミュニティ：**ローカルの P-256 作者鍵、暗号化バックアップと別端末への復元。編集できるのは自分で作成した Skill のみで、ダウンロードしたものは読み取り専用です。公開にはユーザーの明示操作が必要です。任意のコミュニティ API は**公式サイトにデプロイ済み**で、公開を選んだ Skill だけを保存します。

認証情報は標準ではメモリー内に保持します。任意で暗号化してローカル保存し、パスフレーズで解除できます。静的ビルドに鍵は含めません。[サブスクリプションの説明](../research/codex-subscription.md)も確認してください。

## 実行方法

製品は `apps/web/` と `firmware/IPhoneAutomationHarness/` の2部分です。コミュニティと任意の API は Web に含まれます。静的サイトはセルフホストでき、ローカル利用にコミュニティサーバーは不要です。

Node.js 22.13 以降で実行します。

```sh
npm ci
npm test
npm run build
npm run preview
```

デスクトップのプレビューは localhost を利用できますが、スマートフォンの画面共有には **HTTPS** が必要です。`build/site` は Cloudflare または[ページルーティング](../architecture/deployment.md#self-hosted-page-routing)を設定した HTTPS ホストに配置できます。[Arduino 手順](../../firmware/IPhoneAutomationHarness/README.md)にはツールチェーンの説明があります。

[システム設計](../architecture/system-blueprint.md) · [操作と撮影の同期](../architecture/actions.md) · [Skill の帰属](../architecture/skill-community.md) · [多言語対応](../architecture/localization.md)

初回 Wi-Fi 設定、端末の紐付け、mDNS 再接続は製品設計に含まれますが、安全な初期設定、Safari から LAN への通信、慣性スワイプ、1台の C3 と2台のスマートフォンの分離は実機検証が必要です。mDNS だけで HTTPS や認証は解決しません。

完全な受け入れチェックリスト：[English](../acceptance/README.md) · [简体中文](../acceptance/zh-Hans.md)。全機能とコンテンツ、デスクトップの検証証拠、後日行う実機手順を掲載しています。PC側の準備と最終リリース確認はプロジェクト側が担当します。

Macから実機C3へのCA・DNS検証付きHTTPSと製品クライアントの所有者ペアリングは成功しました。電話入力は送信していません。最終イメージの確認とSafari・電話実機の受け入れは別途必要です。[実機クライアント記録](../research/device-client-live-verification.json)。

手動リリース：通常の push では Actions は実行されません。明示的な依頼時だけ、未変更のファームウェアを再利用し、変更された ESP32／C3／S3／C6 をビルドして Release に公開し、同じバイナリを Web サイトへデプロイします。[手順と認証情報の設定](../architecture/manual-release.md)。

[MIT License](../../LICENSE) · [Third-party notices](../../THIRD_PARTY_NOTICES.md)
