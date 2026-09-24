// ============== 全局难度曲线 ==============
// 设计目标：难度随层数连续增长（前缓后陡），并在 DIFFICULTY_CAP_LAYER 层完全封顶。
// 所有子系统（特殊平台概率 / 移动参数 / 岩浆速度 / 怪物密度）都从这里派生，
// 保证各条难度线的形状一致、且在同一层一起到达上限；81 层之后是纯粹的耐力考验。

// —— 主曲线参数 ——
/** 封顶层：到达此层时难度拉满，之后不再增长 */
export const DIFFICULTY_CAP_LAYER = 81;
/** 曲线指数：>1 前缓后陡，=1 纯线性，<1 前陡后缓 */
export const DIFFICULTY_CURVE_EXP = 1.8;
/** 难度上限（封顶值，作为所有派生参数的归一基准） */
export const DIFFICULTY_MAX = 1.0;

export function clamp01(v: number): number {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(from: number, to: number, t: number): number {
    return from + (to - from) * t;
}

/** 平滑过渡：edge0 → 0，edge1 → 1，两端导数为 0（用于机制引入，避免硬台阶） */
export function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = clamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
}

/**
 * 主难度进度：0（第 0 层）→ DIFFICULTY_MAX（81 层），之后恒定不变。
 * 形状：幂曲线，前 20 层只涨到约 0.08，40 层约 0.28，60 层约 0.58，越往上斜率越大。
 */
export function difficultyAt(layer: number): number {
    if (layer <= 0) return 0;
    if (layer >= DIFFICULTY_CAP_LAYER) return DIFFICULTY_MAX;
    return DIFFICULTY_MAX * Math.pow(layer / DIFFICULTY_CAP_LAYER, DIFFICULTY_CURVE_EXP);
}

/** 连续参数的 0..1 进度：与难度同步在封顶层拉满，供 lerp 直接使用 */
export function paramProgress(layer: number): number {
    return clamp01(difficultyAt(layer) / DIFFICULTY_MAX);
}

/**
 * 机制引入曲线：startLayer 处为 0，之后按幂曲线持续上升（可超过 1）。
 * span 越大，该机制铺开得越慢。
 */
export function rampUp(layer: number, startLayer: number, span: number, exp = 1.5): number {
    if (layer <= startLayer) return 0;
    return Math.pow((layer - startLayer) / span, exp);
}
