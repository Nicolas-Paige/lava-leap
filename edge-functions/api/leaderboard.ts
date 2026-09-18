/**
 * EdgeOne Makers Edge Function - 排行榜 API
 *
 * 文件路径: edge-functions/api/leaderboard.js
 * 自动映射路由: /api/leaderboard
 *
 * KV 绑定变量名：GAME_KV
 * 命名空间：Ranking_list
 *
 * 路由：
 *   GET  /api/leaderboard?mode=classic|inferno&limit=10  → 获取排行榜
 *   GET  /api/leaderboard/check?mode=classic|inferno&layer=1  → 检查是否上榜
 *   POST /api/leaderboard  → 上报成绩（同一玩家可多次上榜）
 */

const MAX_LEADERBOARD_SIZE = 20;
const MAX_DISPLAY = 20;

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
    // ── GET /api/leaderboard/check?mode=xxx&layer=123 ──
    // 检查指定层数是否有资格上榜，并返回预估排名
    if (method === 'GET' && url.pathname.endsWith('/check')) {
      const mode = url.searchParams.get('mode') || 'classic';
      const layer = parseInt(url.searchParams.get('layer') || '0');

      if (!layer || layer <= 0) {
        return json({ qualifies: false, currentRank: -1, total: 0 });
      }

      const data = await GAME_KV.get(`leaderboard:${mode}`, 'json');
      const records = (data && data.records) || [];

      // 上榜条件：排行榜未满 20 条，或层数超过第 20 名
      const qualifies = records.length < MAX_LEADERBOARD_SIZE || layer > (records[MAX_LEADERBOARD_SIZE - 1] ? records[MAX_LEADERBOARD_SIZE - 1].layer : 0);

      // 预估排名（仅上榜时有意义）
      let currentRank = -1;
      if (qualifies) {
        currentRank = records.findIndex(r => layer > r.layer);
        currentRank = currentRank === -1 ? records.length + 1 : currentRank + 1;
      }

      return json({ qualifies, currentRank, total: records.length });
    }

    // ── GET /api/leaderboard?mode=xxx&limit=10 ──
    if (method === 'GET') {
      const mode = url.searchParams.get('mode') || 'classic';
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), MAX_DISPLAY);
      const data = await GAME_KV.get(`leaderboard:${mode}`, 'json');
      const records = ((data && data.records) || []).slice(0, limit);
      return json({ records, updatedAt: (data && data.updatedAt) || 0 });
    }

    // ── POST /api/leaderboard ──
    if (method === 'POST') {
      let requestData;
      try {
        requestData = await request.json();
      } catch (e) {
        return json({ error: 'Invalid JSON body' }, 400);
      }

      const { name, layer, mode = 'classic', characterId = 'robot' } = requestData;

      // 参数校验
      if (!name || typeof name !== 'string' || !layer || typeof layer !== 'number') {
        return json({ error: 'Missing required fields: name, layer' }, 400);
      }
      if (layer <= 0) {
        return json({ error: 'Layer must be positive' }, 400);
      }

      const cleanName = name.trim().slice(0, 12);
      if (!cleanName) return json({ error: 'Invalid name' }, 400);

      // 读取现有排行榜
      const key = `leaderboard:${mode}`;
      const data = await GAME_KV.get(key, 'json');
      const records = (data && data.records) || [];
      const now = Date.now();

      // 添加新记录（同一玩家可以多次上榜）
      const newRecord = {
        name: cleanName,
        layer,
        mode,
        characterId,
        timestamp: now,
      };
      records.push(newRecord);

      // 按层数降序排列，同层数按时间早的排前面（更早到达 = 排名更高）
      records.sort((a, b) => b.layer - a.layer || a.timestamp - b.timestamp);
      const trimmed = records.slice(0, MAX_LEADERBOARD_SIZE);

      // 写回 KV
      await GAME_KV.put(key, JSON.stringify({
        records: trimmed,
        updatedAt: now,
      }));

      // 计算排名：找到同名+同层的第一条
      const rank = trimmed.findIndex(r => r.name === cleanName && r.layer === layer) + 1;

      return json({ success: true, rank, total: trimmed.length });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    return json({ error: err.message || 'Internal error' }, 500);
  }
}
