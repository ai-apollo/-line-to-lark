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

async function getMe() {
  const token = await getLarkToken();

  // Get all users
  const resp = await fetch(
    'https://open.larksuite.com/open-apis/contact/v3/users',
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!resp.ok) {
    console.error('❌ Failed to get users:', await resp.text());
    return;
  }

  const result: any = await resp.json();
  const users = result.data?.items || [];

  console.log('\n👥 All users in your workspace:\n');

  users.forEach((user: any, index: number) => {
    console.log(`[${index + 1}] ${user.name}`);
    console.log(`    open_id: ${user.open_id}`);
    console.log(`    user_id: ${user.user_id}`);
    console.log(`    email: ${user.email || '(none)'}`);
    console.log('');
  });

  console.log('📝 Use the open_id or user_id for add-base-permission script');
}

getMe().catch(console.error);
