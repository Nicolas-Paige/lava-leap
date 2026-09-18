/**
 * EdgeOne Makers Edge Function - 排行榜校验 API
 *
 * 文件路径: edge-functions/api/leaderboard/check.ts
 * 自动映射路由: /api/leaderboard/check
 *
 * KV 绑定变量名：GAME_KV
 * 命名空间：Ranking_list
 *
 * 路由：
 *   GET /api/leaderboard/check?mode=classic|inferno&layer=1  → 检查是否上榜
 */

const MAX_LEADERBOARD_SIZE = 20;

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
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  try {
    if (method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405);
    }

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
  } catch (err) {
    return json({ error: err.message || 'Internal error' }, 500);
  }
}
