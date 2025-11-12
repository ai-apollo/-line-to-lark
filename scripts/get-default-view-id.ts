import * as dotenv from 'dotenv';
dotenv.config();

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

async function lark(path: string, token: string) {
  const r = await fetch('https://open.larksuite.com' + path, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': `Bearer ${token}`,
    },
  });
  const j: any = await r.json();
  if (j.code && j.code !== 0) throw new Error(`${path} failed: ${JSON.stringify(j)}`);
  return j;
}

(async () => {
  const app = process.env.LARK_APP_TOKEN!;
  const table = process.env.LARK_MESSAGES_TABLE_ID!;

  const token = await getTenantToken();

  // Get all views
  const viewsRes = await lark(`/open-apis/bitable/v1/apps/${app}/tables/${table}/views?page_size=100`, token);
  const views = viewsRes?.data?.items || [];

  console.log('📋 Available views:\n');
  views.forEach((view: any, index: number) => {
    console.log(`  [${index + 1}] ${view.view_name} (ID: ${view.view_id})`);
  });

  // Find Grid View
  const gridView = views.find((v: any) => v.view_name === 'Grid View');
  if (gridView) {
    console.log('\n✅ Grid View found:', gridView.view_id);
    console.log('\nTo update Grid View, add to .env:');
    console.log(`LARK_MESSAGES_VIEW_ID=${gridView.view_id}`);
  } else {
    console.log('\n⚠️  Grid View not found');
  }
})().catch(e => {
  console.error('❌ Failed:', e);
  process.exit(1);
});
