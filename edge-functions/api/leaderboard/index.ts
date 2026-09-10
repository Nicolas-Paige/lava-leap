/**
 * EdgeOne Function: 排行榜 API
 *
 * GET  /api/leaderboard?mode=classic&limit=20       → 获取排行榜
 * GET  /api/leaderboard/check?mode=classic&score=15 → 检查分数是否上榜
 * POST /api/leaderboard                             → 上报成绩
 *
 * KV 绑定：在 EdgeOne 控制台绑定 GAME_KV → Ranking_list 命名空间
 */

interface ScoreRecord {
    name: string;
    bestLayer: number;
    characterId: string;
    totalGames: number;
    updatedAt: number;
}

interface LeaderboardData {
    records: ScoreRecord[];
    updatedAt: number;
}

interface Env {
    GAME_KV: KVNamespace;
}

const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

const MAX_LEADERBOARD_SIZE = 50;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
}

// ========== 获取排行榜 ==========
async function handleGet(request: Request, env: Env, url: URL): Promise<Response> {
    const mode = url.searchParams.get('mode') || 'classic';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);

    const data = await env.GAME_KV.get<LeaderboardData>(`leaderboard:${mode}`, 'json');
    if (!data) return json({ records: [], updatedAt: 0 });

    return json({ records: data.records.slice(0, limit), updatedAt: data.updatedAt });
}

// ========== 检查分数是否上榜 ==========
async function handleCheck(request: Request, env: Env, url: URL): Promise<Response> {
    const mode = url.searchParams.get('mode') || 'classic';
    const score = parseInt(url.searchParams.get('score') || '0');

    if (score <= 0) return json({ qualifies: false });

    const data = await env.GAME_KV.get<LeaderboardData>(`leaderboard:${mode}`, 'json');

    // 空排行榜 or 未满50名 → 直接上榜
    if (!data || data.records.length < MAX_LEADERBOARD_SIZE) {
        return json({ qualifies: true, currentRank: (data?.records.length || 0) + 1 });
    }

    // 比第50名高 → 上榜
    const lowest = data.records[data.records.length - 1];
    if (score > lowest.bestLayer) {
        const rank = data.records.findIndex(r => score > r.bestLayer) + 1;
        return json({ qualifies: true, currentRank: rank || 1 });
    }

    // 和第50名同分 → 也上榜（后来者排后面）
    if (score === lowest.bestLayer) {
        return json({ qualifies: true, currentRank: MAX_LEADERBOARD_SIZE });
    }

    return json({ qualifies: false });
}

// ========== 上报成绩 ==========
async function handlePost(request: Request, env: Env): Promise<Response> {
    try {
        const body = await request.json() as {
            playerId: string;
            name: string;
            bestLayer: number;
            characterId: string;
            mode: string;
        };

        if (!body.playerId || !body.name || typeof body.bestLayer !== 'number' || !body.mode) {
            return json({ error: 'Invalid params' }, 400);
        }

        if (body.bestLayer < 0 || body.bestLayer > 999) {
            return json({ error: 'Invalid layer' }, 400);
        }

        const mode = body.mode;
        const safeName = body.name.slice(0, 20);

        // 读取现有个人记录
        const playerKey = `player:${mode}:${body.playerId}`;
        const existing = await env.GAME_KV.get<ScoreRecord>(playerKey, 'json');

        // 只有新成绩更高时才更新个人记录
        if (!existing || body.bestLayer > existing.bestLayer) {
            const record: ScoreRecord = {
                name: safeName,
                bestLayer: body.bestLayer,
                characterId: body.characterId,
                totalGames: (existing?.totalGames || 0) + 1,
                updatedAt: Date.now(),
            };
            await env.GAME_KV.put(playerKey, JSON.stringify(record));
        } else {
            existing.totalGames += 1;
            existing.updatedAt = Date.now();
            await env.GAME_KV.put(playerKey, JSON.stringify(existing));
        }

        // 更新排行榜快照
        await updateLeaderboard(env, mode);

        return json({ ok: true });
    } catch {
        return json({ error: 'Internal error' }, 500);
    }
}

// ========== 更新排行榜快照 ==========
async function updateLeaderboard(env: Env, mode: string): Promise<void> {
    const list = await env.GAME_KV.list({ prefix: `player:${mode}:` });
    const records: ScoreRecord[] = [];

    for (const key of list.keys) {
        const record = await env.GAME_KV.get<ScoreRecord>(key.name, 'json');
        if (record) records.push(record);
    }

    records.sort((a, b) => b.bestLayer - a.bestLayer);
    const top = records.slice(0, MAX_LEADERBOARD_SIZE);

    await env.GAME_KV.put(`leaderboard:${mode}`, JSON.stringify({
        records: top,
        updatedAt: Date.now(),
    }));
}

// ========== 入口 ==========
export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        if (request.method === 'GET' && url.pathname === '/api/leaderboard/check') {
            return handleCheck(request, env, url);
        }

        if (request.method === 'GET' && url.pathname === '/api/leaderboard') {
            return handleGet(request, env, url);
        }

        if (request.method === 'POST' && url.pathname === '/api/leaderboard') {
            return handlePost(request, env);
        }

        return json({ error: 'Not found' }, 404);
    },
};
