# Lark Base 削除ガイド

このガイドでは、アプリが作成した Lark Base を API で削除する方法を説明します。

## 前提条件

### 必要なスコープ

開発者コンソールで以下のスコープを追加してください：

- ✅ `drive:drive` (Tenant token) - ファイル管理
- ✅ `docs:permission.member` (Tenant token) - ドキュメント権限管理
- ✅ `docs:permission.member:create` (Tenant token) - 共同編集者追加

### 環境変数

`.env` ファイルに以下が設定されていることを確認：

```bash
LARK_APP_ID=cli_xxxx
LARK_APP_SECRET=yyyyy
```

## 削除の背景

### なぜスクリプトが必要か？

アプリが **Tenant Access Token** で作成した Base は、**アプリが所有者**になります。

- **Lark UI（ブラウザ）**: 削除できません（「親フォルダの権限設定により、このファイルを削除する権限がありません」エラー）
- **Lark API（スクリプト）**: 削除できます

### 所有権について

- Base の所有者は `ou_56ed46ae207710fb917896f85ea7bec1`（アプリのID）
- `full_access` 権限を持っていても、所有者でないと削除できない
- 所有権移譲 API は現在制限されている（`field validation failed` エラー）
- **解決策**: Drive API で直接削除する

## 手順

### 1. 全ての Base をリストアップ

まず、どの Base が存在するか確認します：

```bash
npx ts-node scripts/list-all-bases.ts
```

**出力例:**
```
📊 Found 30 Base(s):

────────────────────────────────────────────────────────────────────────────────────────────────────

[1] LINE会話ログ管理
    Token: Vssgb39WFa9iEXs9WSPj6TZ8pKh
    URL: https://tjpunq0typwo.jp.larksuite.com/base/Vssgb39WFa9iEXs9WSPj6TZ8pKh
    Owner: ou_56ed46ae207710fb917896f85ea7bec1
    Created: 2025/11/7 15:21:37

[2] 顧客管理データベース
    Token: HBxAb3vLjaFx39sWaxojWTiLpqe
    URL: https://tjpunq0typwo.jp.larksuite.com/base/HBxAb3vLjaFx39sWaxojWTiLpqe
    Owner: ou_56ed46ae207710fb917896f85ea7bec1
    Created: 2025/10/30 21:05:15

...
```

このリストから削除したい Base の **Token** をコピーします。

### 2. 単一の Base を削除する場合

#### スクリプト: `scripts/delete-base.ts`

```bash
npx ts-node scripts/delete-base.ts <base_token>
```

**例:**
```bash
npx ts-node scripts/delete-base.ts Vssgb39WFa9iEXs9WSPj6TZ8pKh
```

#### 実行の流れ

1. **5秒の待機時間**が表示されます（誤操作防止）
   ```
   ⚠️  WARNING: This will permanently delete the Base!
   📊 Base token: Vssgb39WFa9iEXs9WSPj6TZ8pKh

   Press Ctrl+C to cancel, or wait 5 seconds to proceed...
   ```

2. **Ctrl+C** で中止可能

3. 5秒後、削除が実行されます
   ```
   🗑️  Deleting Base: Vssgb39WFa9iEXs9WSPj6TZ8pKh
   📊 Base URL: https://tjpunq0typwo.jp.larksuite.com/base/Vssgb39WFa9iEXs9WSPj6TZ8pKh

   ✅ Base deleted successfully!
   ```

### 3. 複数の Base を一括削除する場合

#### スクリプト: `scripts/delete-multiple-bases.ts`

複数の Base を一度に削除したい場合は、スクリプトを編集します。

**ステップ1: スクリプトを編集**

`scripts/delete-multiple-bases.ts` を開いて、削除したい Base Token のリストを編集：

```typescript
const BASES_TO_DELETE = [
  'JrSYbEI9haOcbWs30YEjoiUxpRg', // 顧客管理データベース
  'HBxAb3vLjaFx39sWaxojWTiLpqe', // 顧客管理データベース
  'LzGKbFNPvaaa3LsXLZvj574vpvf', // 統合スケジュール管理_1ソース運用
  // ... 削除したい Base Token を追加
];
```

**ステップ2: 実行**

```bash
npx ts-node scripts/delete-multiple-bases.ts
```

#### 実行の流れ

1. **削除対象のリスト**が表示されます
   ```
   🗑️  Deleting multiple Bases...

   📊 Total: 5 Base(s)

   ⚠️  WARNING: This will permanently delete the following Bases:
      [1] JrSYbEI9haOcbWs30YEjoiUxpRg
      [2] HBxAb3vLjaFx39sWaxojWTiLpqe
      [3] LzGKbFNPvaaa3LsXLZvj574vpvf
      [4] WsA8b31AxaYKRhs9sFKjZW4HpGf
      [5] F1jubcKdHaQOwEsWZOGjs6Gapif

   Press Ctrl+C to cancel, or wait 5 seconds to proceed...
   ```

2. **5秒の待機時間**（Ctrl+C で中止可能）

3. 一つずつ削除が実行されます
   ```
   [1/5] Deleting: JrSYbEI9haOcbWs30YEjoiUxpRg
       URL: https://tjpunq0typwo.jp.larksuite.com/base/JrSYbEI9haOcbWs30YEjoiUxpRg
       ✅ Deleted successfully

   [2/5] Deleting: HBxAb3vLjaFx39sWaxojWTiLpqe
       URL: https://tjpunq0typwo.jp.larksuite.com/base/HBxAb3vLjaFx39sWaxojWTiLpqe
       ✅ Deleted successfully

   ...
   ```

4. **サマリー**が表示されます
   ```
   📊 Summary:
      ✅ Deleted: 5
      ❌ Failed: 0
      📊 Total: 5

   ✅ All Bases have been deleted successfully!
   ```

## 削除 API の技術詳細

### エンドポイント

```
DELETE https://open.larksuite.com/open-apis/drive/v1/files/{file_token}?type=bitable
```

### 必須パラメータ

- **file_token**: Base の token（URL の `base/` の後ろの部分）
- **type**: `bitable` を指定（必須）

### 認証

- **Authorization**: `Bearer <tenant_access_token>`

### レスポンス

**成功時:**
```json
{
  "code": 0,
  "msg": "Success"
}
```

**失敗時:**
```json
{
  "code": 99992402,
  "msg": "field validation failed",
  "error": {
    "field_violations": [
      {
        "field": "type",
        "description": "type is required"
      }
    ]
  }
}
```

## トラブルシューティング

### エラー: "親フォルダの権限設定により、このファイルを削除する権限がありません"

**原因**: Lark UI から削除しようとしている

**解決策**: スクリプトを使用してください

### エラー: "404 page not found"

**原因**: エンドポイントが間違っている

**解決策**:
- ❌ `/bitable/v1/apps/{baseToken}` → 404エラー
- ✅ `/drive/v1/files/{baseToken}?type=bitable` → 成功

### エラー: "field validation failed" (type is required)

**原因**: `type` パラメータが不足

**解決策**: URL に `?type=bitable` を追加

### エラー: "Access denied"

**原因**: 必要なスコープが不足

**解決策**: 以下のスコープを追加して、新しいバージョンを有効化
- `drive:drive` (Tenant token)
- `docs:permission.member` (Tenant token)
- `docs:permission.member:create` (Tenant token)

## 注意事項

### ⚠️ 削除は取り消せません

- 削除した Base は復元できません
- 必ず重要なデータはバックアップを取ってから実行してください

### ⚠️ 環境変数の確認

削除する Base が `.env` や Vercel の環境変数で使用されている場合：

1. 削除前に別の Base を作成
2. 環境変数を新しい Base Token に更新
3. Vercel を再デプロイ
4. その後、古い Base を削除

**例:**
```bash
# .env ファイル
LARK_APP_TOKEN=HBxAb3vLjaFx39sWaxojWTiLpqe  # ← 削除予定の Base

# この Base を削除する前に：
# 1. 新しい Base を作成
# 2. LARK_APP_TOKEN を新しい Token に変更
# 3. Vercel 環境変数も更新
# 4. 再デプロイ
# 5. その後、古い Base を削除
```

### Rate Limiting

複数の Base を削除する場合、API レート制限を避けるため、各リクエストの間に 500ms の待機時間を設けています。

## スクリプトファイル一覧

| ファイル | 用途 |
|---------|------|
| `scripts/list-all-bases.ts` | 全 Base をリストアップ |
| `scripts/delete-base.ts` | 単一の Base を削除 |
| `scripts/delete-multiple-bases.ts` | 複数の Base を一括削除 |
| `scripts/add-base-permission.ts` | Base に権限を追加 |
| `scripts/add-permission-to-all-bases.ts` | 全 Base に権限を一括追加 |
| `scripts/transfer-base-ownership.ts` | 所有権移譲（現在利用不可） |

## 参考: 削除以外の操作

### Base に権限を追加

```bash
npx ts-node scripts/add-base-permission.ts <user_open_id>
```

### 全 Base に権限を一括追加

```bash
npx ts-node scripts/add-permission-to-all-bases.ts
```

## まとめ

1. **リストアップ**: `list-all-bases.ts` で Base を確認
2. **削除対象を選択**: Token をコピー
3. **削除実行**:
   - 1つ: `delete-base.ts <token>`
   - 複数: `delete-multiple-bases.ts` を編集して実行
4. **環境変数更新**: 削除した Base を使用していた場合は更新

---

**最終更新**: 2025年11月12日
**関連ドキュメント**: [Lark Drive API - Delete File](https://open.larksuite.com/document/server-docs/docs/drive-v1/file/delete)
