# LINE Webhook設定ガイド（2024年統合版）

## 重要な変更点（2024年9月）

**2024年9月4日以降、LINE Developersコンソールの仕様が変更されました：**

- ❌ **変更前**: LINE DevelopersコンソールからMessaging APIチャネルを直接作成
- ✅ **変更後**: LINE Official Account Managerから統合管理

### 統合後の影響

LINE Official Account Manager と LINE Developersコンソールの設定が統合され、**一部の設定は両方で同期**されます。

## Messaging API 有効化手順

### 1. LINE Official Account Managerでの設定

1. [LINE Official Account Manager](https://manager.line.biz/) にログイン
2. 対象のアカウントを選択
3. **「設定」** → **「Messaging API」** タブを開く
4. **「Messaging APIを利用する」** ボタンをクリック
5. プロバイダーを選択（または新規作成）

### 2. Webhook URL設定

**設定箇所**: LINE Official Account Manager > **Messaging API** タブ

```
https://line-to-lark.vercel.app/api/line/webhook
```

#### ステータス確認
- **「ステータス: 利用中」** と表示されていればOK
- Channel ID、Channel secretが表示される

### 3. 応答設定（重要）

**設定箇所**: LINE Official Account Manager > **「応答設定」** タブ

以下の設定が必須です：

| 設定項目 | 推奨値 | 説明 |
|---------|--------|------|
| **応答モード** | `Bot` | Webhook経由でメッセージを処理 |
| **応答メッセージ** | `オフ` | デフォルトの自動応答を無効化 |
| **Webhook** | `オン` | Webhookイベントの送信を有効化 |

⚠️ **これらの設定がオフだとWebhookが動作しません**

### 4. Webhook検証（オプション）

LINE Official Account Manager の Messaging APIタブで：
1. Webhook URL入力欄の横にある **「検証」** ボタンをクリック
2. 「成功」メッセージが表示されればOK

## 設定の確認方法

### LINE Official Account Managerで確認

1. **Messaging APIタブ**:
   - ✅ ステータス: 利用中
   - ✅ Webhook URL: 設定済み
   - ✅ Channel ID、Channel secret: 表示されている

2. **応答設定タブ**:
   - ✅ 応答モード: Bot
   - ✅ 応答メッセージ: オフ
   - ✅ Webhook: オン

### LINE Developersコンソールで確認（従来の方法）

統合後も、[LINE Developers Console](https://developers.line.biz/console/) からも設定確認が可能です：

1. **Messaging API設定** タブを開く
2. **Webhook設定** セクションで：
   - Webhook URL: 設定されているか確認
   - 「Webhookの利用」: オンになっているか確認
   - 「検証」ボタンで接続テスト

## Webhookイベントの種類

設定が完了すると、以下のイベントがWebhook URLに送信されます：

| イベント | 説明 | Bitableへの記録 |
|---------|------|----------------|
| `follow` | 友だち追加 | ユーザー情報を新規作成 |
| `message` | メッセージ送信 | メッセージログを記録、エンゲージメントスコア更新 |
| `postback` | ポストバックアクション | アクションログを記録 |
| `unfollow` | ブロック/友だち解除 | is_blocked=true に更新 |

## Bitableフィールド構造

Webhook経由で記録されるデータ：

### 基本情報
- `user_id` (text) - LINE User ID
- `name` (text) - 表示名
- `source` (single select) - 流入元（direct, liff, note, X, LP, ads）
- `day` (date) - エントリー日時
- `profile_image` (attachment) - プロフィール画像

### エンゲージメント情報
- `joined_at` (number) - 友達追加タイムスタンプ
- `engagement_score` (number) - エンゲージメントスコア
- `total_interactions` (number) - 総インタラクション数
- `last_active_date` (number) - 最終アクティブ日時
- `first_message_text` (text) - 最初に送信したメッセージ

### ステータス
- `is_blocked` (checkbox) - ブロック状態
- `unsubscribed_at` (number) - ブロック解除日時

## トラブルシューティング

### Webhookが動作しない場合

1. **応答設定を確認**:
   - 応答モード: Bot になっているか
   - Webhook: オン になっているか

2. **Webhook URLを確認**:
   - `https://` で始まっているか
   - `/api/line/webhook` で終わっているか（`/api/line/webhook-simple` ではない）

3. **Vercelデプロイを確認**:
   - [Vercel Dashboard](https://vercel.com/) でデプロイステータスが「Ready」か
   - 環境変数が正しく設定されているか

4. **Vercelログを確認**:
   - Vercel > プロジェクト > Functions タブ
   - `/api/line/webhook` のログを確認

5. **検証ボタンでテスト**:
   - LINE Official Account Manager で「検証」ボタンをクリック
   - エラーメッセージが表示される場合、Vercel側のログを確認

### よくあるエラー

#### エラー: Webhook URL検証失敗
- **原因**: Vercelの環境変数が未設定
- **解決**: Vercel > Settings > Environment Variables で設定

#### エラー: イベントが届かない
- **原因**: 「Webhookの利用」がオフ
- **解決**: 応答設定タブで「Webhook: オン」に設定

#### エラー: データがBitableに保存されない
- **原因**: フィールド名の不一致
- **解決**: `user_id`, `name`, `source`, `day` などフィールド名を確認

## 参考リンク

- [LINE Developers - Messaging API](https://developers.line.biz/ja/docs/messaging-api/)
- [メッセージ（Webhook）を受信する](https://developers.line.biz/ja/docs/messaging-api/receiving-messages/)
- [LINE Official Account Manager](https://manager.line.biz/)
- [Vercel環境変数設定](/VERCEL-ENV-SETUP.md)

## 更新履歴

- **2024年11月**: 2024年9月統合後の最新手順に更新
- **2024年9月**: LINE DevelopersコンソールとLINE Official Account Managerの統合
