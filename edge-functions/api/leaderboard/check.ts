/**
 * EdgeOne Makers Edge Function - 统一排行榜校验 API
 *
 * 文件路径: edge-functions/api/leaderboard/check.ts
 * 自动映射路由: /api/leaderboard/check
 *
 * KV 绑定变量名：GAME_KV
 * 命名空间：Ranking_list
 *
 * 路由：
 *   GET /api/leaderboard/check?layer=1  → 检查是否上榜
 */

const MAX_LEADERBOARD_SIZE = 20;
const LEADERBOARD_KEY = 'leaderboard:all';

// 只读取统一排行榜
async function loadLeaderboard() {
  const data = await GAME_KV.get(LEADERBOARD_KEY, 'json');
  return (data && data.records) || [];
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

    const layer = parseInt(url.searchParams.get('layer') || '0');

    if (!layer || layer <= 0) {
      return json({ qualifies: false, currentRank: -1, total: 0 });
    }

    const records = await loadLeaderboard();

    // 上榜条件：排行榜未满 20 条，或层数超过第 20 名
    const qualifies = records.length < MAX_LEADERBOARD_SIZE ||
      layer > (records[MAX_LEADERBOARD_SIZE - 1] ? records[MAX_LEADERBOARD_SIZE - 1].layer : 0);

    // 新记录会排在所有同层旧记录之后
    let currentRank = -1;
    if (qualifies) {
      currentRank = records.filter(r => r.layer >= layer).length + 1;
    }

    return json({ qualifies, currentRank, total: records.length });
  } catch (err) {
    return json({ error: err.message || 'Internal error' }, 500);
  }
}
