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

async function getTableFields() {
  const token = await getLarkToken();
  const resp = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/fields`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const result: any = await resp.json();
  return result.data?.items || [];
}

async function updateField(fieldId: string, fieldName: string) {
  const token = await getLarkToken();
  const resp = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/fields/${fieldId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ field_name: fieldName }),
    }
  );
  if (!resp.ok) {
    console.error(`❌ Failed to update field ${fieldId}:`, await resp.text());
  } else {
    console.log(`✅ Updated field: ${fieldName}`);
  }
}

async function createField(fieldName: string, fieldType: number, config?: any) {
  const token = await getLarkToken();
  const body: any = {
    field_name: fieldName,
    type: fieldType,
  };

  if (config) {
    body.property = config;
  }

  const resp = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/fields`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!resp.ok) {
    console.error(`❌ Failed to create field ${fieldName}:`, await resp.text());
  } else {
    const result: any = await resp.json();
    console.log(`✅ Created field: ${fieldName} (ID: ${result.data?.field?.field_id})`);
  }
}

async function main() {
  console.log('📋 Fetching current fields...');
  const fields = await getTableFields();

  console.log('\n📊 Current fields:');
  fields.forEach((f: any) => {
    console.log(`  - ${f.field_name} (${f.field_id}) [type: ${f.type}]`);
  });

  // フィールド名のマッピング
  const fieldMap: Record<string, string> = {
    'name': 'display_name',
    'user_id': 'line_user_id',
    'source': 'entry_source',
    'day': 'entry_date',
    'profile_image': 'profile_image_url',
  };

  console.log('\n🔄 Updating existing field names...');
  for (const field of fields) {
    const newName = fieldMap[field.field_name];
    if (newName) {
      await updateField(field.field_id, newName);
    }
  }

  console.log('\n➕ Adding new fields...');

  // Lark Bitable Field Types:
  // 1 = Text (単行テキスト)
  // 2 = Number (数字)
  // 3 = Single Select (単一選択)
  // 5 = Date (日付)
  // 7 = Checkbox (チェックボックス)
  // 15 = URL (URL)
  // 17 = Created Time (作成時間)
  // 18 = Modified Time (更新時間)
  // 1001 = Created By (作成者)
  // 1002 = Modified By (更新者)

  const newFields = [
    { name: 'joined_at', type: 2, description: '友達追加日時（timestamp）' },
    { name: 'engagement_score', type: 2, description: 'エンゲージメントスコア' },
    { name: 'total_interactions', type: 2, description: '総インタラクション数' },
    { name: 'last_active_date', type: 2, description: '最終アクティブ日時（timestamp）' },
    { name: 'is_blocked', type: 7, description: 'ブロック状態' },
    { name: 'first_message_text', type: 1, description: '最初のメッセージ' },
    { name: 'unsubscribed_at', type: 2, description: 'ブロック解除日時（timestamp）' },
  ];

  const existingFieldNames = fields.map((f: any) => f.field_name);

  for (const field of newFields) {
    // フィールドマップの値（変更後の名前）も含めてチェック
    const updatedFieldNames = Object.values(fieldMap);
    if (!existingFieldNames.includes(field.name) && !updatedFieldNames.includes(field.name)) {
      console.log(`  Creating: ${field.name} - ${field.description}`);
      await createField(field.name, field.type);
    } else {
      console.log(`  ⏭️  Skipping ${field.name} (already exists)`);
    }
  }

  console.log('\n✨ All fields updated!');
  console.log('\n📊 Final field structure:');
  console.log('  - line_user_id (text) - LINE user ID');
  console.log('  - display_name (text) - 表示名');
  console.log('  - profile_image_url (attachment→URL) - プロフィール画像URL');
  console.log('  - entry_date (date→number) - エントリー日時');
  console.log('  - entry_source (single select→text) - 流入元');
  console.log('  - status_message (text) - ステータスメッセージ');
  console.log('  - joined_at (number) - 友達追加日時');
  console.log('  - engagement_score (number) - エンゲージメントスコア');
  console.log('  - total_interactions (number) - 総インタラクション数');
  console.log('  - last_active_date (number) - 最終アクティブ日時');
  console.log('  - is_blocked (checkbox) - ブロック状態');
  console.log('  - first_message_text (text) - 最初のメッセージ');
  console.log('  - unsubscribed_at (number) - ブロック解除日時');
}

main().catch(console.error);
