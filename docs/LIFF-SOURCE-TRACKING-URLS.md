# LIFF 流入経路トラッキングURL一覧

## 概要

LIFF（LINE Front-end Framework）を使用して、友だち追加の流入元を自動追跡します。

各URLにアクセスしたユーザーの情報（User ID、表示名、プロフィール画像）とともに、流入元（source）がLark Bitableに自動記録されます。

## LIFF情報

| 項目 | 値 |
|------|-----|
| **LIFF ID** | `2008252843-G6k1DX03` |
| **LIFF URL（ベース）** | `https://liff.line.me/2008252843-G6k1DX03` |
| **エンドポイント** | `https://line-to-lark.vercel.app/liff-track` |

## 流入経路別URL

### 📝 note経由

```
https://liff.line.me/2008252843-G6k1DX03?source=note
```

**使用例:**
- noteの記事内リンク
- noteプロフィールの外部リンク
- note記事末尾のCTA

**Bitableに記録される値:**
- `source`: `note`
- `name`: ユーザー表示名
- `profile_image`: プロフィール画像URL

---

### 🐦 X（Twitter）経由

```
https://liff.line.me/2008252843-G6k1DX03?source=X
```

**使用例:**
- X（Twitter）のプロフィール固定ツイート
- Xプロフィールのリンク
- Xキャンペーン投稿

**Bitableに記録される値:**
- `source`: `X`
- `name`: ユーザー表示名
- `profile_image`: プロフィール画像URL

---

### 🌐 ランディングページ（LP）経由

```
https://liff.line.me/2008252843-G6k1DX03?source=LP
```

**使用例:**
- 専用ランディングページ
- キャンペーンページ
- プロモーションサイト

**Bitableに記録される値:**
- `source`: `LP`
- `name`: ユーザー表示名
- `profile_image`: プロフィール画像URL

---

### 📢 広告経由

```
https://liff.line.me/2008252843-G6k1DX03?source=ads
```

**使用例:**
- Facebook広告
- Instagram広告
- Google広告
- LINE広告
- その他有料広告

**Bitableに記録される値:**
- `source`: `ads`
- `name`: ユーザー表示名
- `profile_image`: プロフィール画像URL

---

### 🔗 直接アクセス（デフォルト）

```
https://liff.line.me/2008252843-G6k1DX03
```

**使用例:**
- sourceパラメータなしでアクセスされた場合
- QRコードからの直接アクセス

**Bitableに記録される値:**
- `source`: `direct`
- `name`: ユーザー表示名
- `profile_image`: プロフィール画像URL

---

## 記録されるデータ詳細

### Bitable「友達追加テーブル」に記録される情報

| フィールド名 | 型 | 説明 | 例 |
|------------|-----|------|-----|
| `user_id` | text | LINE User ID | U1234567890abcdef... |
| `name` | text | LINEの表示名 | 山田太郎 |
| `profile_image` | attachment | プロフィール画像URL | https://profile.line-scdn.net/... |
| `status_message` | text | ステータスメッセージ | よろしくお願いします！ |
| `source` | single select | 流入元 | note / X / LP / ads / direct |
| `day` | number | エントリー日時（timestamp） | 1762658512643 |
| `joined_at` | number | 友達追加日時（timestamp） | 1762658512643 |
| `engagement_score` | number | エンゲージメントスコア | 0 |
| `total_interactions` | number | 総インタラクション数 | 0 |
| `last_active_date` | number | 最終アクティブ日時 | 1762658512643 |
| `is_blocked` | checkbox | ブロック状態 | false |

## 動作フロー

```
1. ユーザーが流入経路別URLをクリック
   ↓
2. LIFFページが開く（LINEログイン）
   ↓
3. ユーザープロフィール情報を取得
   - userId
   - displayName
   - pictureUrl
   - statusMessage
   ↓
4. /api/line/track にPOST送信
   - userId
   - displayName
   - pictureUrl
   - source（URLパラメータから取得）
   ↓
5. Lark Bitableに記録
   - 既存ユーザー: sourceとプロフィール情報を更新
   - 新規ユーザー: 新規レコード作成
   ↓
6. 友だち追加状態を確認
   - 未追加: 友だち追加ボタン表示
   - 既に追加済み: 完了メッセージ表示
```

## カスタムsourceの追加

独自の流入元を追加する場合：

### 例: Instagram経由

```
https://liff.line.me/2008252843-G6k1DX03?source=instagram
```

### 例: メールマガジン経由

```
https://liff.line.me/2008252843-G6k1DX03?source=email
```

### 例: YouTubeの概要欄経由

```
https://liff.line.me/2008252843-G6k1DX03?source=youtube
```

**注意:**
- sourceパラメータは任意の文字列を指定可能
- Bitableの`source`フィールドに自動的に記録される
- 事前にBitableの「single select」オプションに追加する必要はありません

## 分析方法

### Lark Bitableでの分析

#### 1. 流入元別の友だち数を確認

1. Bitableを開く
2. `source`フィールドでグループ化
3. カウントを表示

#### 2. 流入元別のエンゲージメント比較

1. `source`でフィルタリング
2. `engagement_score`の平均値を計算
3. 流入元ごとのエンゲージメント率を比較

#### 3. 時系列での流入推移

1. `day`フィールドで日別にグループ化
2. `source`別に色分け
3. グラフ表示で推移を確認

## トラブルシューティング

### LIFFページが開かない

**原因:**
- LIFF URLが間違っている
- LIFFアプリの設定が正しくない

**解決策:**
1. LINE Developers > LIFF タブを確認
2. エンドポイントURLが `https://line-to-lark.vercel.app/liff-track` になっているか確認
3. Scopeに `profile` と `openid` が含まれているか確認

### プロフィール情報が記録されない

**原因:**
- LINE_CHANNEL_ACCESS_TOKENが設定されていない
- LIFFのScopeに `profile` が含まれていない

**解決策:**
1. Vercelの環境変数を確認
2. LINE Developers > LIFF > Scope を確認

### sourceが正しく記録されない

**原因:**
- URLパラメータのスペルミス
- track.tsのエンドポイントエラー

**解決策:**
1. URLの`?source=`以降を確認
2. Vercelのログで /api/line/track のエラーを確認

## 関連ファイル

- **LIFF ページ**: `/public/liff-track.html`
- **トラッキングAPI**: `/api/line/track.ts`
- **Webhook処理**: `/api/line/webhook.ts`

## 更新履歴

- **2024年11月**: LIFF流入トラッキング実装完了
- **2024年11月**: LINEプロフィール情報取得機能追加
