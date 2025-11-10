import * as dotenv from 'dotenv';
dotenv.config();

// Source option IDs
const SOURCE_OPTIONS: Record<string, string> = {
  'direct': 'opt309346094',
  'LINE_unfollow': 'opt1446290028',
  'liff': 'optOFn2osL',
  'note': 'opt554171163',
  'X': 'optqRXvjoQ',
  'LP': 'optpu3tsBy',
  'ads': 'optD08TRT9',
};

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

async function getAllRecords() {
  const token = await getLarkToken();
  const allRecords: any[] = [];
  let hasMore = true;
  let pageToken = '';

  while (hasMore) {
    const resp = await fetch(
      `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/records/search`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          page_size: 100,
          page_token: pageToken || undefined,
        }),
      }
    );

    const result: any = await resp.json();
    const items = result.data?.items || [];
    allRecords.push(...items);

    hasMore = result.data?.has_more || false;
    pageToken = result.data?.page_token || '';
  }

  return allRecords;
}

async function updateRecord(recordId: string, source: string) {
  const token = await getLarkToken();
  const resp = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/records/${recordId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          source: { id: source }, // Use object format for Single Select
        },
      }),
    }
  );

  if (!resp.ok) {
    console.error(`❌ Failed to update ${recordId}:`, await resp.text());
    return false;
  }
  return true;
}

async function fixSourceFields() {
  console.log('🔍 Fetching all records...\n');
  const records = await getAllRecords();
  console.log(`📊 Found ${records.length} total records\n`);

  let fixedCount = 0;
  let skippedCount = 0;

  for (const record of records) {
    const source = record.fields.source;

    // Check if source is a string starting with "opt"
    if (typeof source === 'string' && source.startsWith('opt')) {
      console.log(`🔧 Fixing record ${record.record_id}: "${source}" → Single Select`);
      const success = await updateRecord(record.record_id, source);
      if (success) {
        fixedCount++;
      }
    } else if (typeof source === 'string') {
      // Try to find the option ID by name
      const optionId = SOURCE_OPTIONS[source];
      if (optionId) {
        console.log(`🔧 Converting record ${record.record_id}: "${source}" → "${optionId}"`);
        const success = await updateRecord(record.record_id, optionId);
        if (success) {
          fixedCount++;
        }
      } else {
        console.log(`⚠️  Skipping record ${record.record_id}: unknown source "${source}"`);
        skippedCount++;
      }
    } else {
      // Already correct format (object or empty)
      skippedCount++;
    }
  }

  console.log(`\n✅ Fixed ${fixedCount} records`);
  console.log(`⏭️  Skipped ${skippedCount} records (already correct or empty)`);
}

fixSourceFields().catch(console.error);
