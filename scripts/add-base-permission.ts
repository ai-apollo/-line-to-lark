import * as dotenv from 'dotenv';
dotenv.config();

async function getLarkToken() {
  const resp = await fetch(
    'https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: process.env.LARK_APP_ID,
        app_secret: process.env.LARK_APP_SECRET,
      }),
    }
  );
  const j: any = await resp.json();
  return j.tenant_access_token;
}

async function addBasePermission(baseToken: string, userId: string, permission: 'view' | 'edit' | 'full_access') {
  const token = await getLarkToken();

  console.log(`📝 Adding permission for user: ${userId}`);
  console.log(`📝 Base token: ${baseToken}`);
  console.log(`📝 Permission level: ${permission}`);

  const resp = await fetch(
    `https://open.larksuite.com/open-apis/drive/v1/permissions/${baseToken}/members/batch_create?type=bitable`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        members: [
          {
            member_type: 'openid',
            member_id: userId,
            perm: permission,
          },
        ],
      }),
    }
  );

  if (!resp.ok) {
    const errorText = await resp.text();
    console.error('❌ Failed to add permission:', resp.status, errorText);
    return false;
  }

  const result: any = await resp.json();
  console.log('✅ Permission added successfully:', JSON.stringify(result, null, 2));
  return true;
}

async function main() {
  // あなたのBase Token（URLの app_token）
  const baseToken = process.env.LARK_APP_TOKEN;

  // あなたのユーザーID（open_id または user_id）
  // 自分のユーザーIDを確認するには、Lark管理画面 → メンバー管理 → 自分の名前をクリック
  const userId = process.argv[2];

  if (!userId) {
    console.error('❌ Usage: npx ts-node scripts/add-base-permission.ts <user_id>');
    console.error('例: npx ts-node scripts/add-base-permission.ts ou_xxxxx');
    console.error('');
    console.error('自分のuser_idを確認する方法：');
    console.error('1. Lark管理画面 → メンバー管理');
    console.error('2. 自分の名前をクリック');
    console.error('3. URLに含まれる ou_... がuser_id');
    process.exit(1);
  }

  if (!baseToken) {
    console.error('❌ LARK_APP_TOKEN not found in .env');
    process.exit(1);
  }

  console.log('🔧 Adding Base permission...\n');

  await addBasePermission(baseToken, userId, 'full_access');

  console.log('\n✅ Done! You should now be able to access the Base.');
}

main().catch(console.error);
