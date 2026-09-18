/**
 * 排行榜 API 客户端
 */

const API_BASE = '/api';

export interface ScoreRecord {
    name: string;
    layer: number;
    characterId: string;
    playerId?: string;
    timestamp: number;
}

export interface LeaderboardResponse {
    records: ScoreRecord[];
    updatedAt: number;
}

export interface CheckResponse {
    qualifies: boolean;
    currentRank: number;
    total: number;
}

export interface SubmitResponse {
    success: boolean;
    rank: number;
    total: number;
}

/**
 * 生成或获取本地玩家 ID
 */
export function getPlayerId(): string {
    const KEY = 'lava-leap-player-id';
    let id = localStorage.getItem(KEY);
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(KEY, id);
    }
    return id;
}

/**
 * 获取/设置玩家昵称
 */
export function getPlayerName(): string {
    return localStorage.getItem('lava-leap-player-name') || '';
}

export function setPlayerName(name: string): void {
    localStorage.setItem('lava-leap-player-name', name.slice(0, 20));
}

/**
 * 检查分数是否上榜
 */
export async function checkScore(mode: string, layer: number): Promise<CheckResponse> {
    try {
        const res = await fetch(`${API_BASE}/leaderboard?mode=${mode}&layer=${layer}`);
        if (!res.ok) return { qualifies: false, currentRank: -1, total: 0 };
        return await res.json();
    } catch {
        return { qualifies: false, currentRank: -1, total: 0 };
    }
}

/**
 * 上报成绩（同一玩家可多次上榜）
 */
export async function submitScore(params: {
    name: string;
    layer: number;
    characterId: string;
    mode: string;
}): Promise<SubmitResponse> {
    try {
        const res = await fetch(`${API_BASE}/leaderboard`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: params.name,
                layer: params.layer,
                mode: params.mode,
                characterId: params.characterId,
            }),
        });
        if (!res.ok) return { success: false, rank: 0, total: 0 };
        return await res.json();
    } catch {
        return { success: false, rank: 0, total: 0 };
    }
}

/**
 * 获取排行榜
 */
export async function fetchLeaderboard(mode: string, limit = 20): Promise<LeaderboardResponse> {
    try {
        const res = await fetch(`${API_BASE}/leaderboard?mode=${mode}&limit=${limit}`);
        if (!res.ok) return { records: [], updatedAt: 0 };
        return await res.json();
    } catch {
        return { records: [], updatedAt: 0 };
    }
}
