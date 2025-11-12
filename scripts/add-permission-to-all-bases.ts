import * as dotenv from 'dotenv';
dotenv.config();

const USER_OPEN_ID = 'ou_ae3b952c7b71d2d7aed0ef48c6a2bc70'; // あぽろ

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

async function listAllBases(token: string) {
  const resp = await fetch(
    'https://open.larksuite.com/open-apis/drive/v1/files?page_size=100',
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!resp.ok) {
    throw new Error(`Failed to list files: ${resp.status}`);
  }

  const result: any = await resp.json();

  if (result.code !== 0) {
    throw new Error(`API Error: ${result.msg}`);
  }

  const files = result.data?.files || [];
  return files.filter((f: any) => f.type === 'bitable');
}

async function addBasePermission(
  baseToken: string,
  userId: string,
  permission: 'view' | 'edit' | 'full_access',
  token: string
) {
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

  const result: any = await resp.json();
  return result;
}

async function main() {
  console.log('🔧 Adding permissions to all Bases...\n');
  console.log(`👤 User: ${USER_OPEN_ID}`);
  console.log(`📝 Permission: full_access\n`);

  const token = await getLarkToken();
  const bases = await listAllBases(token);

  console.log(`📊 Found ${bases.length} Base(s)\n`);
  console.log('─'.repeat(100));

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (let i = 0; i < bases.length; i++) {
    const base = bases[i];
    const num = `[${i + 1}/${bases.length}]`;

    console.log(`\n${num} ${base.name}`);
    console.log(`    Token: ${base.token}`);

    try {
      const result = await addBasePermission(
        base.token,
        USER_OPEN_ID,
        'full_access',
        token
      );

      if (result.code === 0) {
        console.log(`    ✅ Success`);
        successCount++;
      } else if (result.code === 53048) {
        // Already has permission
        console.log(`    ⏭️  Already has permission (skipped)`);
        skipCount++;
      } else {
        console.log(`    ❌ Failed: ${result.msg} (code: ${result.code})`);
        errorCount++;
      }
    } catch (error: any) {
      console.log(`    ❌ Error: ${error.message}`);
      errorCount++;
    }

    // Rate limiting: wait 200ms between requests
    if (i < bases.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log('\n' + '─'.repeat(100));
  console.log('\n📊 Summary:');
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ⏭️  Skipped (already has permission): ${skipCount}`);
  console.log(`   ❌ Failed: ${errorCount}`);
  console.log(`   📊 Total: ${bases.length}`);
  console.log('');

  if (errorCount > 0) {
    console.log('⚠️  Some operations failed. Check the errors above.');
    process.exit(1);
  } else {
    console.log('✅ All operations completed successfully!');
  }
}

main().catch(console.error);
