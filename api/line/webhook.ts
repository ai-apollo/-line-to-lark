import type { VercelRequest, VercelResponse } from '@vercel/node';
import { baseCreateMessageLog } from '../lark/message-log';

type SourceLabel = 'direct' | 'liff' | 'X' | 'note' | 'LP' | 'ads' | 'LINE_unfollow';

let SOURCE_DICT: Record<SourceLabel, string> = {} as any;
let dictInitialized = false;

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

async function buildSourceDict() {
  if (dictInitialized) return;

  try {
    const token = await getLarkToken();
    const resp = await fetch(
      `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/fields`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const meta: any = await resp.json();

    const map: Record<string, string> = {};
    for (const f of meta?.data?.items || []) {
      if (f.field_name === 'source') {
        for (const opt of f.property?.options || []) {
          map[String(opt.name).toLowerCase()] = opt.id;
        }
      }
    }

    SOURCE_DICT = {
      direct: map['direct'] || 'opt309346094',
      liff: map['liff'] || 'optOFn2osL',
      X: map['x'] || 'optqRXvjoQ',
      note: map['note'] || 'opt554171163',
      LP: map['lp'] || 'optpu3tsBy',
      ads: map['ads'] || 'optD08TRT9',
      LINE_unfollow: map['line_unfollow'] || 'opt1446290028',
    } as any;

    dictInitialized = true;
    console.log('✅ SOURCE_DICT built:', SOURCE_DICT);
  } catch (error) {
    console.error('❌ Failed to build SOURCE_DICT:', error);
    // Fallback to hardcoded values
    SOURCE_DICT = {
      direct: 'opt309346094',
      liff: 'optOFn2osL',
      X: 'optqRXvjoQ',
      note: 'opt554171163',
      LP: 'optpu3tsBy',
      ads: 'optD08TRT9',
      LINE_unfollow: 'opt1446290028',
    };
  }
}

// Single Select fields: send string value directly (not {id: "opt..."})
function toSource(label: SourceLabel): string {
  return label; // Return the label directly as string
}

async function getLineProfile(userId: string) {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) return null;

  try {
    const resp = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!resp.ok) {
      console.error('❌ LINE Profile API Error:', await resp.text());
      return null;
    }

    const profile: any = await resp.json();
    return {
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl,
      statusMessage: profile.statusMessage,
    };
  } catch (error) {
    console.error('❌ Failed to get LINE profile:', error);
    return null;
  }
}

async function baseFindByUserId(userId: string) {
  const token = await getLarkToken();
  const resp = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/records/search`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: {
          logic: 'AND',
          conditions: [
            { field_name: 'user_id', operator: 'equals', value: [userId] }
          ],
        },
        page_size: 1,
      }),
    }
  );
  const j: any = await resp.json();
  return j?.data?.items?.[0];
}

async function getOrCreateFriend(userId: string, profile?: { displayName?: string; pictureUrl?: string; statusMessage?: string }) {
  // まず既存レコードを検索
  const rec = await baseFindByUserId(userId).catch(() => undefined);
  if (rec?.record_id) return rec;

  // プロファイルが無い場合はLINEから取得（失敗しても空で良い）
  const p = profile ?? (await getLineProfile(userId)) ?? {};
  const now = Date.now() + (60 * 60 * 1000); // +1時間調整

  console.log('🆕 Creating new friend record for:', userId);

  return await baseCreate({
    user_id: userId,
    name: p.displayName || '',
    profile_image_url: p.pictureUrl || '',
    status_message: p.statusMessage || '',
    source: toSource('direct'),
    joined_at: now,
    day: now,
    engagement_score: 0,
    total_interactions: 0,
    last_active_date: now,
    is_blocked: false,
  });
}

async function baseCreate(fields: any): Promise<{ record_id: string; fields: any } | null> {
  const token = await getLarkToken();
  console.log('🔵 Creating new record');
  console.log('[FriendsTable] app=', process.env.LARK_APP_TOKEN, 'table=', process.env.LARK_TABLE_ID);
  console.log('🔵 Create fields:', JSON.stringify(fields, null, 2));

  const resp = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/records/batch_create`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ records: [{ fields }] }),
    }
  );

  if (!resp.ok) {
    const errorText = await resp.text();
    console.error('❌ Create Error:', resp.status, errorText);
    return null;
  }

  const result: any = await resp.json();
  if (result.code === 0) {
    const recordIds = result.data?.records?.map((r: any) => r.record_id);
    console.log('✅ Friends table record created successfully', { record_ids: recordIds });
  } else {
    console.error('❌ Friends table create failed', result);
  }
  console.log('🔵 Create response:', JSON.stringify(result, null, 2));

  const record = result?.data?.records?.[0];
  if (!record?.record_id) return null;

  console.log('✅ Record created successfully:', record.record_id);
  return { record_id: record.record_id, fields };
}

async function baseUpdate(recordId: string, fields: any) {
  const token = await getLarkToken();
  console.log('🔵 Updating record:', recordId);
  console.log('🔵 Update fields:', JSON.stringify(fields, null, 2));

  const resp = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/records/${recordId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    }
  );

  if (!resp.ok) {
    const errorText = await resp.text();
    console.error('❌ Update Error:', resp.status, errorText);
    throw new Error(`Update failed: ${errorText}`);
  } else {
    console.log('✅ Record updated successfully');
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  console.log('ENV', {
    vercelEnv: process.env.VERCEL_ENV,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
    appToken: process.env.LARK_APP_TOKEN,
    tableId: process.env.LARK_TABLE_ID,
    msgTableId: process.env.LARK_MESSAGES_TABLE_ID,
  });

  // Build source options dictionary on first request
  await buildSourceDict();

  console.log('🟢 Webhook received');

  const events = req.body?.events || [];
  for (const event of events) {
    const userId = event.source?.userId;
    if (!userId) continue;

    console.log('🟢 Processing event:', event.type, 'for user:', userId);

    // 追加: イベントごとの環境変数確認
    console.log('[Webhook] env', {
      APP: process.env.LARK_APP_TOKEN,
      USERS_TABLE: process.env.LARK_TABLE_ID,
      MSG_TABLE: process.env.LARK_MESSAGES_TABLE_ID,
      eventType: event.type,
    });

    if (event.type === 'follow') {
      const now = Date.now() + (60 * 60 * 1000); // +1時間調整

      // LINEプロフィール情報を取得
      const profile = await getLineProfile(userId);
      console.log('📱 LINE Profile:', profile);

      let rec = await baseFindByUserId(userId);
      if (rec?.record_id) {
        // 既存レコードを更新（プロフィール情報も更新）
        await baseUpdate(rec.record_id, {
          name: profile?.displayName || rec.fields.name || '',
          profile_image_url: profile?.pictureUrl || rec.fields.profile_image_url || '',
          status_message: profile?.statusMessage || rec.fields.status_message || '',
          joined_at: now,
          last_active_date: now,
          is_blocked: false,
        });

        await baseCreateMessageLog({
          message_record_id: `${now}`,
          user_id: userId,
          direction: 'system',
          event_type: 'follow',
          message_type: 'system',
          text: 'followed',
          ts: now,
          raw_json: JSON.stringify(event),
          parent_user: [rec.record_id],
        });
      } else {
        // 新規レコードを作成（プロフィール情報を含める）
        const created = await baseCreate({
          user_id: userId,
          name: profile?.displayName || '',
          profile_image_url: profile?.pictureUrl || '',
          status_message: profile?.statusMessage || '',
          joined_at: now,
          day: now,
          source: toSource('direct'),
          engagement_score: 0,
          total_interactions: 0,
          last_active_date: now,
          is_blocked: false,
        });

        await baseCreateMessageLog({
          message_record_id: `${now}`,
          user_id: userId,
          direction: 'system',
          event_type: 'follow',
          message_type: 'system',
          text: 'followed',
          ts: now,
          raw_json: JSON.stringify(event),
          parent_user: created?.record_id ? [created.record_id] : undefined,
        });
      }
      continue;
    }

    if (event.type === 'message' && event.message?.type === 'text') {
      const text = event.message.text ?? '';
      const messageId = (event.message as any)?.id ?? '';
      const updateTimestamp = Number(event.timestamp) || (Date.now() + 60 * 60 * 1000); // ms

      console.log('🟢 Handling message', { userId, messageId, textLen: text.length });

      // ★ 必ず親を用意して record_id を得る（見つからなければ作る）
      const friend = await getOrCreateFriend(userId);
      const recordId = friend?.record_id;
      const parent = recordId ? [recordId] : undefined;

      console.log('👤 Friend record:', { recordId, name: friend?.fields?.name });

      // 親は更新しない。子（会話履歴）のみ追記
      const current = friend?.fields || {};

      console.log('🔵 Creating message log', { recordId, ts: updateTimestamp });

      try {
        await baseCreateMessageLog({
          message_record_id: `${updateTimestamp}-${messageId}`,
          user_id: userId,
          direction: 'incoming',
          event_type: 'message',
          message_type: 'text',
          text,
          payload: '',
          ts: updateTimestamp,            // 13桁のUNIX ms
          message_id: messageId,
          raw_json: JSON.stringify(event),
          parent_user: parent,              // ★ 必ず user_id と parent_user を同時に送る
          // ルックアップ代替の"写し取り"
          from_name: current?.name || '',
          from_source: current?.source || '',
        });
        console.log('✅ Message log created', { userId, parent });
      } catch (err) {
        console.error('❌ Message log create failed', err);
      }
      continue;
    }

    if (event.type === 'postback') {
      const data = event.postback?.data ?? '';
      const postbackTime = Date.now() + (60 * 60 * 1000); // +1時間調整
      await baseCreateMessageLog({
        message_record_id: `${postbackTime}`,
        user_id: userId,
        direction: 'incoming',
        event_type: 'postback',
        message_type: 'postback',
        text: '',
        payload: data,
        ts: postbackTime,
        raw_json: JSON.stringify(event),
      });
      continue;
    }

    if (event.type === 'unfollow') {
      const now = Date.now() + (60 * 60 * 1000); // +1時間調整
      let rec = await baseFindByUserId(userId);

      if (rec?.record_id) {
        await baseUpdate(rec.record_id, {
          is_blocked: true,
          unsubscribed_at: now,
          last_active_date: now,
          source: toSource('LINE_unfollow'),
        });
      } else {
        const created = await baseCreate({
          user_id: userId,
          is_blocked: true,
          unsubscribed_at: now,
          day: now,
          last_active_date: now,
          source: toSource('LINE_unfollow'),
          engagement_score: 0,
          total_interactions: 0,
        });
        if (created?.record_id) {
          rec = { record_id: created.record_id } as any;
        }
      }

      await baseCreateMessageLog({
        message_record_id: `${now}`,
        user_id: userId,
        direction: 'system',
        event_type: 'unfollow',
        message_type: 'system',
        text: 'unfollowed',
        ts: now,
        raw_json: JSON.stringify(event),
        parent_user: rec?.record_id ? [rec.record_id] : undefined,
      });
    }
  }

  res.status(200).end();
}
