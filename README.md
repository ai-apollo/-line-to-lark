# LINE to Lark Integration

LINE bot と Lark Bitable を連携し、友達追加やメッセージをトラッキングするシステムです。

## 機能

- ✅ LINE 友達追加イベントの記録
- ✅ LINE プロフィール情報の取得（名前、プロフィール画像、ステータスメッセージ）
- ✅ エントリーソースの追跡（direct, LIFF, X, note, LP, ads）
- ✅ メッセージログの記録
- ✅ Lark Bitable への自動保存

## セットアップ

### 1. 環境変数

`.env` ファイルを作成：

```bash
# Lark App Credentials
LARK_APP_ID=cli_xxxx
LARK_APP_SECRET=yyyyy

# Bitable Configuration
LARK_APP_TOKEN=base_token_here
LARK_TABLE_ID=table_id_here
LARK_MESSAGES_TABLE_ID=messages_table_id_here

# LINE Messaging API
LINE_CHANNEL_ACCESS_TOKEN=your_line_token
LINE_CHANNEL_SECRET=your_line_secret
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. Lark アプリのスコープ設定

開発者コンソールで以下のスコープを追加：

- `bitable:app` - Base管理
- `drive:drive` - ファイル管理
- `docs:permission.member` - ドキュメント権限管理
- `docs:permission.member:create` - 共同編集者追加

### 4. Vercel へデプロイ

```bash
# Vercel CLI でデプロイ
vercel --prod

# または、GitHub連携で自動デプロイ
```

## スクリプト

### Base 管理

```bash
# 全 Base をリストアップ
npm run list-bases

# Base に権限を追加
npm run add-permission -- <user_open_id>

# Base を削除
npm run delete-base -- <base_token>
```

### ユーザー管理

```bash
# ユーザーの open_id を取得
npm run get-open-id

# ユーザー一覧を表示
npm run list-users
```

## ドキュメント

- **[Base 削除ガイド](./docs/BASE-DELETION-GUIDE.md)** - アプリが作成した Base を削除する方法
- **[LINE-LARK-BRIDGE-BEGINNER.md](./docs/LINE-LARK-BRIDGE-BEGINNER.md)** - LINE と Lark の連携ガイド

## API エンドポイント

### Webhook

- **POST** `/api/line/webhook` - LINE Messaging API のイベントを受信
- **GET** `/api/line/track` - LIFF からのアクセスを追跡

## トラブルシューティング

### Base を削除できない

アプリが作成した Base は Lark UI から削除できません。スクリプトを使用してください：

```bash
npx ts-node scripts/delete-base.ts <base_token>
```

詳しくは [Base 削除ガイド](./docs/BASE-DELETION-GUIDE.md) を参照してください。

### 環境変数が反映されない

Vercel にデプロイ後、環境変数を変更した場合は再デプロイが必要です：

```bash
vercel --prod
```

## ライセンス

MIT
