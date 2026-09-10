/**
 * EdgeOne Function - 排行榜 API
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
 *   POST /api/leaderboard  → 上报成绩
 */

exports.main_handler = async (event, context) => {
  // 解析请求
  const { httpMethod, path, queryStringParameters, body } = event;

  // CORS 预检
  if (httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    };
  }

  const responseHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  const json = (data, status = 200) => ({
    statusCode: status,
    headers: responseHeaders,
    body: JSON.stringify(data),
  });

  try {
    // GET /api/leaderboard/check?mode=xxx&layer=123
    if (httpMethod === 'GET' && path && path.endsWith('/check')) {
      const mode = (queryStringParameters && queryStringParameters.mode) || 'classic';
      const layer = parseInt((queryStringParameters && queryStringParameters.layer) || '0');
      const data = await kv.get(`leaderboard:${mode}`, 'json');
      const records = (data && data.records) || [];

      const qualifies = records.length < 10 || layer > (records[9] ? records[9].layer : 0);
      const currentRank = qualifies
        ? records.findIndex(r => layer > r.layer) + 1 || records.length + 1
        : -1;

      return json({ qualifies, currentRank, total: records.length });
    }

    // GET /api/leaderboard?mode=xxx&limit=10
    if (httpMethod === 'GET') {
      const mode = (queryStringParameters && queryStringParameters.mode) || 'classic';
      const limit = Math.min(parseInt((queryStringParameters && queryStringParameters.limit) || '10'), 50);
      const data = await kv.get(`leaderboard:${mode}`, 'json');
      const records = ((data && data.records) || []).slice(0, limit);
      return json({ records, updatedAt: (data && data.updatedAt) || 0 });
    }

    // POST /api/leaderboard
    if (httpMethod === 'POST') {
      let requestData;
      try {
        requestData = body ? JSON.parse(body) : {};
      } catch (e) {
        return json({ error: 'Invalid JSON body' }, 400);
      }

      const { name, layer, mode = 'classic', characterId = 'robot' } = requestData;
      if (!name || typeof name !== 'string' || !layer || typeof layer !== 'number') {
        return json({ error: 'Missing required fields: name, layer' }, 400);
      }

      const cleanName = name.trim().slice(0, 12);
      if (!cleanName) return json({ error: 'Invalid name' }, 400);

      // 读取现有排行榜
      const key = `leaderboard:${mode}`;
      const data = await kv.get(key, 'json');
      const records = (data && data.records) || [];

      // 添加新记录
      records.push({
        name: cleanName,
        layer,
        mode,
        characterId,
        timestamp: Date.now(),
      });

      // 按层数降序排列，只保留前100
      records.sort((a, b) => b.layer - a.layer);
      const trimmed = records.slice(0, 100);

      // 写回 KV
      await kv.put(key, JSON.stringify({
        records: trimmed,
        updatedAt: Date.now(),
      }));

      // 计算排名
      const rank = trimmed.findIndex(r => r.name === cleanName && r.layer === layer) + 1;

      return json({ success: true, rank, total: trimmed.length });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    return json({ error: err.message || 'Internal error' }, 500);
  }
};
