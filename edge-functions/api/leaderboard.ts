/**
 * EdgeOne Makers Edge Function - 统一排行榜 API
 *
 * 文件路径: edge-functions/api/leaderboard.ts
 * 自动映射路由: /api/leaderboard
 *
 * KV 绑定变量名：GAME_KV
 * 命名空间：Ranking_list
 *
 * 路由：
 *   GET  /api/leaderboard?limit=20  → 获取统一排行榜
 *   POST /api/leaderboard           → 上报成绩（同一玩家可多次上榜）
 *
 *   check 接口见: edge-functions/api/leaderboard/check.ts → /api/leaderboard/check
 */

const MAX_LEADERBOARD_SIZE = 20;
const MAX_DISPLAY = 20;
const LEADERBOARD_KEY = 'leaderboard:all';

function sortRecords(records) {
  return records.sort((a, b) => b.layer - a.layer || a.timestamp - b.timestamp);
}

// 只读写统一排行榜
async function loadLeaderboard() {
  const data = await GAME_KV.get(LEADERBOARD_KEY, 'json');
  return {
    records: (data && data.records) || [],
    updatedAt: (data && data.updatedAt) || 0,
  };
}

export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  const method = request.method;

  // CORS 预检
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  try {
    // ── GET /api/leaderboard?limit=20 ──
    if (method === 'GET') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '10') || MAX_DISPLAY, MAX_DISPLAY);
      const data = await loadLeaderboard();
      return json({ records: data.records.slice(0, limit), updatedAt: data.updatedAt });
    }

    // ── POST /api/leaderboard ──
    if (method === 'POST') {
      let requestData;
      try {
        requestData = await request.json();
      } catch (e) {
        return json({ error: 'Invalid JSON body' }, 400);
      }

      const { name, layer, characterId = 'robot' } = requestData;

      // 参数校验
      if (!name || typeof name !== 'string' || !layer || typeof layer !== 'number') {
        return json({ error: 'Missing required fields: name, layer' }, 400);
      }
      if (layer <= 0) {
        return json({ error: 'Layer must be positive' }, 400);
      }

      const cleanName = name.trim().slice(0, 12);
      if (!cleanName) return json({ error: 'Invalid name' }, 400);

      const data = await loadLeaderboard();
      const records = data.records;
      const now = Date.now();

      // 添加新记录（同一玩家可以多次上榜）
      const newRecord = {
        name: cleanName,
        layer,
        characterId,
        timestamp: now,
      };
      records.push(newRecord);

      // 按层数降序排列，同层数按到达时间从早到晚排列
      sortRecords(records);
      const trimmed = records.slice(0, MAX_LEADERBOARD_SIZE);

      await GAME_KV.put(LEADERBOARD_KEY, JSON.stringify({
        records: trimmed,
        updatedAt: now,
      }));

      const rank = trimmed.indexOf(newRecord) + 1;

      return json({ success: true, rank, total: trimmed.length });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    return json({ error: err.message || 'Internal error' }, 500);
  }
}
