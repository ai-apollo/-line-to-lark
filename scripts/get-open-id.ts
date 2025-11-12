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

async function getAllUsers() {
  const token = await getLarkToken();

  const resp = await fetch(
    'https://open.larksuite.com/open-apis/contact/v3/users?page_size=50',
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
  console.log('─'.repeat(100));

  users.forEach((user: any, index: number) => {
    console.log(`\n[${index + 1}] ${user.name}`);
    console.log(`    open_id: ${user.open_id} ← これを使ってください`);
    console.log(`    user_id: ${user.user_id}`);
    console.log(`    union_id: ${user.union_id || '(none)'}`);
    console.log(`    email: ${user.email || '(none)'}`);
    console.log(`    mobile: ${user.mobile || '(none)'}`);
  });

  console.log('\n' + '─'.repeat(100));
  console.log('\n📝 あなた（中川智之 / あぽろ）のopen_idをコピーしてください');
  console.log('📝 形式: ou_xxxxxxxxxxxxxxxxxxxxxxxxxx');
}

getAllUsers().catch(console.error);
