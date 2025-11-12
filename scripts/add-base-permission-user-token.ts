import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config();

// Try to load USER_ACCESS_TOKEN from .env.local
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
}

async function addBasePermission(
  baseToken: string,
  userId: string,
  permission: 'view' | 'edit' | 'full_access',
  userAccessToken: string
) {
  console.log(`📝 Adding permission for user: ${userId}`);
  console.log(`📝 Base token: ${baseToken}`);
  console.log(`📝 Permission level: ${permission}`);
  console.log(`📝 Using User Access Token: ${userAccessToken.slice(0, 20)}...`);
  console.log('');

  const resp = await fetch(
    `https://open.larksuite.com/open-apis/drive/v1/permissions/${baseToken}/members/batch_create?type=bitable`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userAccessToken}`,
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
    console.error('❌ Failed to add permission:', resp.status);
    console.error('Response:', errorText);
    return false;
  }

  const result: any = await resp.json();
  console.log('✅ Permission added successfully!');
  console.log('Response:', JSON.stringify(result, null, 2));
  return true;
}

async function main() {
  const baseToken = process.env.LARK_APP_TOKEN;
  const userId = process.argv[2];
  const userAccessToken = process.env.USER_ACCESS_TOKEN || process.argv[3];

  if (!userId) {
    console.error('❌ Usage: npx ts-node scripts/add-base-permission-user-token.ts <open_id> [user_access_token]');
    console.error('例: npx ts-node scripts/add-base-permission-user-token.ts ou_xxxxx');
    console.error('');
    console.error('USER_ACCESS_TOKENは.env.localから自動読み込みされます。');
    console.error('または、コマンドライン引数で指定できます。');
    process.exit(1);
  }

  if (!userAccessToken) {
    console.error('❌ USER_ACCESS_TOKEN not found.');
    console.error('');
    console.error('Please run: npx ts-node scripts/oauth-get-user-token.ts');
    console.error('Or set USER_ACCESS_TOKEN in .env.local');
    process.exit(1);
  }

  if (!baseToken) {
    console.error('❌ LARK_APP_TOKEN not found in .env');
    process.exit(1);
  }

  console.log('🔧 Adding Base permission using User Access Token...\n');

  const success = await addBasePermission(baseToken, userId, 'full_access', userAccessToken);

  if (success) {
    console.log('\n✅ Done! You should now be able to access the Base.');
    console.log(`📊 Base URL: https://tjpunq0typwo.jp.larksuite.com/base/${baseToken}`);
  } else {
    console.log('\n❌ Failed to add permission.');
    process.exit(1);
  }
}

main().catch(console.error);
