import * as dotenv from 'dotenv';
dotenv.config();

type Field = { field_id: string; field_name: string };

async function getTenantToken() {
  const r = await fetch('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: process.env.LARK_APP_ID, app_secret: process.env.LARK_APP_SECRET }),
  });
  const j: any = await r.json();
  if (!j?.tenant_access_token) throw new Error('getTenantToken failed: ' + JSON.stringify(j));
  return j.tenant_access_token as string;
}

async function lark(path: string, token: string, init: RequestInit = {}) {
  const r = await fetch('https://open.larksuite.com' + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const j: any = await r.json();
  if (j.code && j.code !== 0) throw new Error(`${path} failed: ${JSON.stringify(j)}`);
  return j;
}

function idByName(fields: Field[], name: string) {
  const f = fields.find(x => x.field_name === name);
  if (!f) throw new Error(`Field not found: ${name}`);
  return f.field_id;
}

(async () => {
  const app = process.env.LARK_APP_TOKEN!;
  const table = process.env.LARK_MESSAGES_TABLE_ID!; // 会話履歴テーブル（tblt5gi4wvXANG7b）
  const viewFromEnv = process.env.LARK_MESSAGES_VIEW_ID; // 既存ビューを更新したい場合に任意設定（vew...）

  if (!app || !table) throw new Error('ENV missing: LARK_APP_TOKEN / LARK_MESSAGES_TABLE_ID');

  const token = await getTenantToken();

  // 1) フィールド一覧を取得（名前→ID解決）
  const fieldsRes = await lark(`/open-apis/bitable/v1/apps/${app}/tables/${table}/fields?page_size=500`, token);
  const fields = (fieldsRes?.data?.items || []) as Field[];

  // 表示順（左→右）：誰から → 本文 → 向き → 由来 → 時刻 → 以降よく使う順
  const orderNames = [
    'from_name', 'text', 'direction', 'from_source', 'ts',
    'message_type', 'event_type', 'user_id', 'message_id', 'parent_user', 'raw_json',
  ];
  const displayFieldIds: string[] = orderNames
    .filter(n => fields.some(f => f.field_name === n))
    .map(n => idByName(fields, n));

  // 2) ソート条件（新しい順で自動並び替え）
  const tsId = fields.some(f => f.field_name === 'ts') ? idByName(fields, 'ts') : undefined;
  const sorts = tsId ? [{ field_id: tsId, order: 'DESC' }] : [];

  // 3) 既存ビュー更新 or 新規作成
  if (viewFromEnv) {
    // 既存ビューをPATCH（表示列/ソートをセット）
    await lark(`/open-apis/bitable/v1/apps/${app}/tables/${table}/views/${viewFromEnv}`, token, {
      method: 'PATCH',
      body: JSON.stringify({
        view_name: 'Grid View',
        view_type: 'grid',
        property: {
          field_order: displayFieldIds,
          sort_info: sorts.length > 0 ? sorts : undefined,
        },
      }),
    });
    console.log('✅ Updated view:', viewFromEnv, { display_count: displayFieldIds.length, sorts });
  } else {
    // 新規に「Inbox (Auto)」ビューを作成（URLで共有しやすい）
    const created = await lark(`/open-apis/bitable/v1/apps/${app}/tables/${table}/views`, token, {
      method: 'POST',
      body: JSON.stringify({
        view_name: 'Inbox (Auto)',
        view_type: 'grid',
        property: {
          field_order: displayFieldIds,
          sort_info: sorts.length > 0 ? sorts : undefined,
        },
      }),
    });
    const vid = created?.data?.view?.view_id;
    console.log('✅ Created view:', vid, { display_count: displayFieldIds.length, sorts });
    console.log('➡️  Set LARK_MESSAGES_VIEW_ID=', vid, ' (optional)');
  }
})().catch(e => {
  console.error('❌ Failed:', e);
  process.exit(1);
});
