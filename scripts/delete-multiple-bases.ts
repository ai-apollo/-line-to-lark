import * as dotenv from 'dotenv';
dotenv.config();

const BASES_TO_DELETE = [
  'JrSYbEI9haOcbWs30YEjoiUxpRg', // 顧客管理データベース
  'HBxAb3vLjaFx39sWaxojWTiLpqe', // 顧客管理データベース
  'LzGKbFNPvaaa3LsXLZvj574vpvf', // 統合スケジュール管理_1ソース運用
  'WsA8b31AxaYKRhs9sFKjZW4HpGf', // 顧客管理データベース
  'F1jubcKdHaQOwEsWZOGjs6Gapif', // SNS統合分析ダッシュボード
];

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

async function deleteBase(baseToken: string, token: string) {
  // Try Drive API to delete file
  const resp = await fetch(
    `https://open.larksuite.com/open-apis/drive/v1/files/${baseToken}?type=bitable`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!resp.ok) {
    const errorText = await resp.text();
    return { code: resp.status, msg: errorText, success: false };
  }

  try {
    const result: any = await resp.json();
    return result;
  } catch (error: any) {
    const text = await resp.text();
    return { code: -1, msg: `JSON parse error: ${text}`, success: false };
  }
}

async function main() {
  console.log('🗑️  Deleting multiple Bases...\n');
  console.log(`📊 Total: ${BASES_TO_DELETE.length} Base(s)\n`);

  console.log('⚠️  WARNING: This will permanently delete the following Bases:');
  BASES_TO_DELETE.forEach((token, index) => {
    console.log(`   [${index + 1}] ${token}`);
  });
  console.log('');
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to proceed...');
  console.log('');

  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('─'.repeat(100));

  const token = await getLarkToken();
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < BASES_TO_DELETE.length; i++) {
    const baseToken = BASES_TO_DELETE[i];
    const num = `[${i + 1}/${BASES_TO_DELETE.length}]`;

    console.log(`\n${num} Deleting: ${baseToken}`);
    console.log(`    URL: https://tjpunq0typwo.jp.larksuite.com/base/${baseToken}`);

    try {
      const result = await deleteBase(baseToken, token);

      if (result.code === 0) {
        console.log(`    ✅ Deleted successfully`);
        successCount++;
      } else {
        console.log(`    ❌ Failed: ${result.msg} (code: ${result.code})`);
        errorCount++;
      }
    } catch (error: any) {
      console.log(`    ❌ Error: ${error.message}`);
      errorCount++;
    }

    // Rate limiting
    if (i < BASES_TO_DELETE.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log('\n' + '─'.repeat(100));
  console.log('\n📊 Summary:');
  console.log(`   ✅ Deleted: ${successCount}`);
  console.log(`   ❌ Failed: ${errorCount}`);
  console.log(`   📊 Total: ${BASES_TO_DELETE.length}`);
  console.log('');

  if (errorCount > 0) {
    console.log('⚠️  Some deletions failed. Check the errors above.');
    process.exit(1);
  } else {
    console.log('✅ All Bases have been deleted successfully!');
  }
}

main().catch(console.error);
