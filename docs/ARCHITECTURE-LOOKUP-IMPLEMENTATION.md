# LINE to Lark Architecture: Lookup Field Implementation

## 概要

本ドキュメントは、LINE Messaging API Webhook から Lark Bitable へのメッセージログ記録システムにおける、Lookupフィールドの実装方法と設計思想を説明します。

---

## アーキテクチャ設計

### 3層構造

```
┌─────────────────────────────────────┐
│ 1. Friends (親テーブル)              │
│    - 不変 (Immutable)                │
│    - 初回作成のみ                     │
│    - user_id, name, source など      │
└─────────────────────────────────────┘
              ↓ parent_user (Relation)
┌─────────────────────────────────────┐
│ 2. Message Log (子テーブル)          │
│    - 追記専用 (Append-only)          │
│    - from_name, from_source (写し)  │
│    - 全イベント記録                   │
└─────────────────────────────────────┘
              ↓ 日次集計
┌─────────────────────────────────────┐
│ 3. Daily Stats (集計テーブル)        │
│    - 1日1ユーザーごとの統計           │
│    - msg_count, incoming, outgoing   │
│    - 日次Cronで更新                  │
└─────────────────────────────────────┘
```

---

## Lookupフィールド実装における課題と解決策

### ❌ 当初の計画（失敗）

**目標**: Message Log テーブルに Lookup フィールドを作成し、親テーブルの name, source を自動参照

**実装**: Lark Bitable API で Lookup フィールドを作成
```typescript
// ❌ これは失敗する
await createField(token, appToken, tableId, 'from_name', 21, { // Lookup type
  link_field_id: parentUserFieldId,
  lookup_field_id: nameField.field_id,
});
```

**エラー**:
```
DuplexLinkFieldPropertyError
```

### 原因分析

1. **国際版 Lark の制限**: Lookup フィールド作成時に双方向リンク (Duplex Link) に関するエラーが発生
2. **API仕様**: 関連フィールド (Relation) からの Lookup 作成には追加の制約がある可能性
3. **権限問題**: Tenant Access Token では一部の高度なフィールド操作に制限がある

### ✅ 採用した解決策：スナップショット方式

**概念**: 親テーブルの値を**メッセージ記録時に子テーブルにコピー**（スナップショット）

**実装**:
```typescript
// api/line/webhook.ts
const friend = await getOrCreateFriend(userId);
const current = friend?.fields || {};

await baseCreateMessageLog({
  message_record_id: `${updateTimestamp}-${messageId}`,
  user_id: userId,
  direction: 'incoming',
  event_type: 'message',
  message_type: 'text',
  text,
  ts: updateTimestamp,
  message_id: messageId,
  raw_json: JSON.stringify(event),
  parent_user: [recordId],
  // ★ ルックアップ代替の"写し取り"
  from_name: current?.name || '',
  from_source: current?.source || '',
});
```

**フィールド定義**:
```typescript
// api/lark/message-log.ts
type Fields = {
  message_record_id?: string;
  user_id?: string;
  direction?: string;
  event_type?: string;
  message_type?: string;
  text?: string;
  payload?: string;
  ts?: number;
  message_id?: string;
  raw_json?: string;
  parent_user?: string[];  // Relation to Friends
  from_name?: string;      // ★ Text field (snapshot)
  from_source?: string;    // ★ Text field (snapshot)
};
```

---

## メリットとデメリット

### ✅ メリット

1. **API制限回避**: Lookup フィールド作成のエラーを回避
2. **パフォーマンス向上**: 参照不要で直接値を表示（高速）
3. **履歴保持**: 親の値が変更されても、メッセージ記録時の状態を保持
4. **シンプル実装**: 複雑なAPI呼び出し不要

### ⚠️ デメリットと対策

| デメリット | 対策 |
|----------|------|
| データ重複 | ストレージは安価。from_name/source 程度なら許容範囲 |
| 親の更新が反映されない | 親は**不変設計**のため問題なし |
| 過去データの一括更新が困難 | スクリプトで一括更新可能（後述） |

---

## テーブル構造詳細

### 1. Friends テーブル（親）

| フィールド名 | 型 | 説明 | 更新頻度 |
|------------|---|------|---------|
| user_id | Text | LINE User ID（主キー） | 作成時のみ |
| name | Text | ユーザー名 | 作成時のみ |
| source | Single Select | 流入元（direct/X/note/LP/ads/liff） | 作成時のみ |
| profile_image_url | Text | プロフィール画像URL | 作成時のみ |
| status_message | Text | ステータスメッセージ | 作成時のみ |
| joined_at | Date | 友だち追加日時 | 作成時のみ |
| is_blocked | Checkbox | ブロック状態 | unfollow イベント時のみ |
| unsubscribed_at | Date | ブロック日時 | unfollow イベント時のみ |

**重要**: `follow` イベントで作成、`message` イベントでは**更新しない**

### 2. Message Log テーブル（子）

| フィールド名 | 型 | 説明 | データソース |
|------------|---|------|------------|
| message_record_id | Text | メッセージID（ユニーク） | `${timestamp}-${messageId}` |
| user_id | Text | LINE User ID | event.source.userId |
| direction | Single Select | 方向（incoming/outgoing/system） | 固定値 |
| event_type | Single Select | イベント種別（message/follow/unfollow/postback） | event.type |
| message_type | Single Select | メッセージ種別（text/system/postback） | event.message.type |
| text | Text | メッセージ本文 | event.message.text |
| payload | Text | Postback データ | event.postback.data |
| ts | Date | タイムスタンプ | event.timestamp + 1h offset |
| message_id | Text | LINE Message ID | event.message.id |
| raw_json | Text | 生イベントJSON | JSON.stringify(event) |
| parent_user | Relation | 親レコードへのリンク | [friend.record_id] |
| **from_name** | **Text** | **送信者名（スナップショット）** | **friend.fields.name** |
| **from_source** | **Text** | **流入元（スナップショット）** | **friend.fields.source** |

### 3. Daily Stats テーブル（集計）

| フィールド名 | 型 | 説明 |
|------------|---|------|
| date | Date | 集計日（JST 00:00） |
| user_id | Text | LINE User ID |
| msg_count | Number | メッセージ総数 |
| first_ts | Date | 初回メッセージ時刻 |
| last_ts | Date | 最終メッセージ時刻 |
| incoming | Number | 受信メッセージ数 |
| outgoing | Number | 送信メッセージ数 |

---

## 実装スクリプト一覧

### テーブル作成

```bash
# Message Log テーブル（from_name, from_source含む）
npx ts-node scripts/create-message-table-template.ts

# Daily Stats テーブル
npx ts-node scripts/create-daily-stats-table.ts

# from_name, from_source フィールド追加（既存テーブル用）
npx ts-node scripts/add-from-fields.ts
```

### ビュー設定

```bash
# 列順とソートを自動設定
npx ts-node scripts/ensure-messages-view.ts

# 設定内容:
# - 列順: from_name → text → direction → from_source → ts...
# - ソート: ts DESC（新着が上）
```

### デバッグ・確認

```bash
# Message Log テーブルのフィールド確認
npx ts-node scripts/check-message-table-fields.ts

# 既存ビューID確認
npx ts-node scripts/get-default-view-id.ts
```

---

## 過去データの一括更新（Backfill）

親テーブルの値が変更された場合、過去のメッセージログを一括更新するスクリプト：

```typescript
// scripts/backfill-from-fields.ts（将来実装）
import * as dotenv from 'dotenv';
dotenv.config();

async function backfillFromFields() {
  const token = await getLarkToken();
  const appToken = process.env.LARK_APP_TOKEN!;
  const messagesTableId = process.env.LARK_MESSAGES_TABLE_ID!;

  // 1. Message Logの全レコードを取得
  const messages = await getAllRecords(token, appToken, messagesTableId);

  // 2. 各レコードの parent_user から親の最新情報を取得
  for (const msg of messages) {
    const parentId = msg.fields.parent_user?.[0];
    if (!parentId) continue;

    const parent = await getRecord(token, appToken, friendsTableId, parentId);

    // 3. from_name, from_source を更新
    await updateRecord(token, appToken, messagesTableId, msg.record_id, {
      from_name: parent.fields.name || '',
      from_source: parent.fields.source || '',
    });
  }
}
```

---

## UIでのLookupフィールド作成（代替手段）

API での作成が失敗する場合、**UI で手動作成**することは可能です：

### 手順

1. Message Log テーブルを開く
2. 右端の「+」（列追加）をクリック
3. フィールドタイプ：**ルックアップ**
4. フィールド名：`from_name_lookup`
5. リンクフィールド：`parent_user` を選択
6. ルックアップフィールド：`name` を選択
7. 保存

**結果**: API では作成できなかったが、UI では作成可能

**理由**: UI では追加のメタデータや設定が自動的に処理されるため

### UI作成 vs スナップショット方式の比較

| 項目 | Lookup (UI作成) | Snapshot (採用方式) |
|-----|----------------|-------------------|
| 実装方法 | 手動で1回だけ作成 | コードで自動化 |
| パフォーマンス | 参照時に計算 | 直接表示（高速） |
| 親の変更反映 | 自動反映 | 反映されない（履歴保持） |
| 履歴管理 | 現在の値のみ | 記録時の値を保持 ✅ |
| 自動化 | 不可 | 完全自動化 ✅ |

**結論**: **スナップショット方式を採用**（履歴保持と自動化を優先）

---

## 環境変数設定

```bash
# .env
LARK_APP_ID=cli_xxxx
LARK_APP_SECRET=yyyy
LARK_APP_TOKEN=Vssgb39WFa9iEXs9WSPj6TZ8pKh
LARK_TABLE_ID=tblz60z8yoOreM8m              # Friends テーブル
LARK_MESSAGES_TABLE_ID=tblt5gi4wvXANG7b     # Message Log テーブル
LARK_DAILY_TABLE_ID=tblVuqN99AE54Tk5        # Daily Stats テーブル
LARK_MESSAGES_VIEW_ID=vewDLXd4oX            # Grid View ID
```

**Vercel環境変数**にも同じ値を設定すること

---

## トラブルシューティング

### from_name, from_source が空

**原因**: 親レコード取得に失敗、または親の name/source が空

**確認**:
```typescript
console.log('👤 Friend record:', { recordId, name: friend?.fields?.name });
```

**対処**:
1. Friends テーブルで該当 user_id のレコードを確認
2. name, source フィールドが正しく設定されているか確認
3. getOrCreateFriend() でプロフィール取得が成功しているか確認

### 過去のメッセージログに from_name が入っていない

**原因**: from_name, from_source フィールド追加前のデータ

**対処**: Backfill スクリプトで一括更新
```bash
# 将来実装予定
npx ts-node scripts/backfill-from-fields.ts
```

### ビューで from_name が表示されない

**原因**: ビューの表示設定で非表示になっている

**対処**:
```bash
# ビュー設定を再実行
npx ts-node scripts/ensure-messages-view.ts
```

または UI で「列の管理」→ from_name にチェック

---

## まとめ

### 採用した設計の利点

1. ✅ **API制限を回避**: Lookup フィールド作成エラーの問題を解決
2. ✅ **完全自動化**: スクリプトで全自動テーブル作成・設定
3. ✅ **履歴保持**: メッセージ記録時の送信者情報を保持
4. ✅ **高速表示**: 参照不要で直接値を表示
5. ✅ **シンプル実装**: 複雑なAPI呼び出し不要

### トレードオフ

- ❌ データ重複（許容範囲）
- ❌ 親の変更が反映されない（設計上、親は不変なので問題なし）

### 今後の拡張

- [ ] 日次集計 Cron ジョブ実装
- [ ] Backfill スクリプト実装
- [ ] グラフビュー作成
- [ ] AI レポート生成連携

---

**最終更新**: 2025-11-12
**作成者**: Claude Code
**バージョン**: 1.0
