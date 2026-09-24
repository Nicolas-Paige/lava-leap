import type { PlatformPlacement } from '../types';
import type { PlatformGenerator, GameModeConfig } from '../../modes/types';
import type { PlatformType, PlatformBehavior } from '../types';
import { LAYER_HEIGHT } from '../../constants';

// ============== 混合生成器 ==============
// 按层数计算概率分布，支持逐层强化，用于合并后的线性难度成长

export type PlatformProbabilityMap = Partial<Record<PlatformType, number>>;
export type LayerValue<T> = T | ((layer: number) => T);

/** 一层的「引导点」：平台围绕它撒布，用来做出螺旋 / 之字这类有结构的布局 */
export interface GuidePoint {
    x: number;
    z: number;
}

export interface MixedGeneratorOptions {
    // 各类型生成概率（总和应 ≤ 1.0，剩余部分按 normal 补足），可随层数变化
    probabilities?: LayerValue<PlatformProbabilityMap>;
    // 指定楼层优先生成的平台类型（用于新机制首次教学）
    forcedTypes?: LayerValue<PlatformType[]>;
    // 移动平台参数，可随层数变化
    moveRange?: LayerValue<[number, number]>;
    moveSpeed?: LayerValue<[number, number]>;
    // 消失倒计时，可随层数变化
    disappearLifespan?: LayerValue<number>;
    // 是否允许 y 轴移动，可随层数变化
    allowVerticalMove?: LayerValue<boolean>;
    // 水平散布范围倍率，可随层数变化（高层拉开跳距）
    rangeScale?: LayerValue<number>;
    // 本层引导点：平台会围绕它撒布。null / 不传 = 退化为全场均匀随机
    guide?: LayerValue<GuidePoint | null>;
    // 围绕引导点的散布半径（0 = 全部紧贴引导点）
    guideScatter?: LayerValue<number>;
    // 引导点上必放一个「锚点」平台，这是允许的最大抖动
    anchorJitter?: LayerValue<number>;
}

// ============== 放置参数 ==============
const MIN_GAP = 1.5;            // 平台之间的理想空隙
const PLACE_TRIES = 32;         // 每级间距的采样次数
const ANCHOR_JITTER = 0.8;      // 锚点默认抖动：再大就会出现「跟螺旋走也要冲刺」的层

function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
}

/**
 * 在 p 周围半径 r 内随机取一点。
 * 半径用 √u → 圆盘内均匀分布（线性 u 会过度向心，外圈采不到，容易放不下而退化）。
 */
function around(p: GuidePoint, r: number): GuidePoint {
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * r;
    return { x: p.x + d * Math.cos(a), z: p.z + d * Math.sin(a) };
}

function resolveLayerValue<T>(value: LayerValue<T> | undefined, layer: number, fallback: T): T {
    if (value === undefined) return fallback;
    return typeof value === 'function' ? (value as (layer: number) => T)(layer) : value;
}

// ============== y 轴（垂直）移动平台的振幅限制 ==============
// PlatformSystem 里 offset = sin(t) * moveRange 是**全幅**（峰峰值 2×moveRange）。
// 水平轴无所谓，但 y 轴若沿用 moveRange（81 层可达 5.0，而层高只有 3.0），
// 平台会在自己层位上下 ±5 摆动：把玩家拽到相邻层甚至岩浆面以下，还会与上下层平台穿插。
// 所以垂直轴单独压缩：取水平振幅的一个比例，并硬性限制在层高的 40% 以内。
const VERTICAL_RANGE_RATIO = 0.35;                 // 相对水平振幅的压缩比例
const VERTICAL_RANGE_MAX = LAYER_HEIGHT * 0.4;     // 1.2，摆动中心 ±1.2，远小于层高
const VERTICAL_RANGE_MIN = 0.5;                    // 低层也保留可感知的升降幅度

export class MixedGenerator implements PlatformGenerator {
    private forcedTypes: PlatformType[] = [];

    constructor(private opts: MixedGeneratorOptions = {}) {}

    generate(layer: number, config: GameModeConfig): PlatformPlacement[] {
        this.forcedTypes = resolveLayerValue(this.opts.forcedTypes, layer, []);
        const placements: PlatformPlacement[] = [];
        const placed: GuidePoint[] = [];
        const range = config.range * resolveLayerValue(this.opts.rangeScale, layer, 1);
        // 不重叠判定：只要有一轴拉开 ≥ size 就不会重叠。旧代码要求两轴同时拉开 size+gap，
        // 过严导致放不下而走「盲放兜底」，反而生成互相重叠的平台。
        const size = config.platformSize;

        const guide = resolveLayerValue(this.opts.guide, layer, null);
        const scatter = resolveLayerValue(this.opts.guideScatter, layer, 0);
        const jitter = resolveLayerValue(this.opts.anchorJitter, layer, ANCHOR_JITTER);

        // 引导点上先放一个锚点：保证这一层一定有贴着主路线的落脚点
        if (guide) {
            const p = around(guide, jitter);
            placed.push({ x: clamp(p.x, -range, range), z: clamp(p.z, -range, range) });
            placements.push({
                ...this.makePlacement(layer, placed[0].x, placed[0].z, config),
                isAnchor: true,
            });
        }

        while (placed.length < config.platformsPerLayer) {
            const p = this.pickSpot(range, guide, scatter, placed, size);
            placed.push(p);
            placements.push(this.makePlacement(layer, p.x, p.z, config));
        }
        return placements;
    }

    /**
     * 采样一个可放置点。
     * 先按「理想间距 size+gap」找；整层挤不下时退到「严格不重叠 size」（允许零间隙）；
     * 两级都失败才取「离已有平台最远」的兜底 —— 不再像旧代码那样无检测盲放。
     */
    private pickSpot(
        range: number,
        guide: GuidePoint | null,
        scatter: number,
        placed: GuidePoint[],
        size: number,
    ): GuidePoint {
        if (placed.length === 0) {
            const p = guide && scatter > 0
                ? around(guide, scatter)
                : { x: (Math.random() * 2 - 1) * range, z: (Math.random() * 2 - 1) * range };
            return { x: clamp(p.x, -range, range), z: clamp(p.z, -range, range) };
        }

        let best: GuidePoint = { x: 0, z: 0 };
        let bestDist = -1;

        for (const sep of [size + MIN_GAP, size]) {
            for (let i = 0; i < PLACE_TRIES; i++) {
                const raw = guide && scatter > 0
                    ? around(guide, scatter)
                    : { x: (Math.random() * 2 - 1) * range, z: (Math.random() * 2 - 1) * range };
                const p = { x: clamp(raw.x, -range, range), z: clamp(raw.z, -range, range) };

                let minDist = Infinity;
                let ok = true;
                for (const q of placed) {
                    const dx = Math.abs(p.x - q.x);
                    const dz = Math.abs(p.z - q.z);
                    // 两轴同时小于 sep 才会贴太近 / 重叠
                    if (dx < sep && dz < sep) ok = false;
                    minDist = Math.min(minDist, Math.hypot(dx, dz));
                }
                if (ok) return p;
                if (minDist > bestDist) {
                    bestDist = minDist;
                    best = p;
                }
            }
        }
        return best;
    }

    private makePlacement(layer: number, x: number, z: number, config: GameModeConfig): PlatformPlacement {
        const type = this.rollType(layer);
        if (type === 'normal') {
            return { layer, x, z, size: config.platformSize, type: 'normal' };
        }
        const behavior = this.makeBehavior(layer, type);
        return { layer, x, z, size: config.platformSize, type, behavior };
    }

    private rollType(layer: number): PlatformType {
        const forced = this.forcedTypes.shift();
        if (forced) return forced;

        const r = Math.random();
        let cum = 0;
        const probs = resolveLayerValue(this.opts.probabilities, layer, {});
        for (const k in probs) {
            const t = k as PlatformType;
            cum += probs[t] ?? 0;
            if (r < cum) return t;
        }
        return 'normal';
    }

    private makeBehavior(layer: number, type: PlatformType): PlatformBehavior {
        if (type === 'moving') {
            const [rangeMin, rangeMax] = resolveLayerValue(this.opts.moveRange, layer, [2, 4]);
            const [speedMin, speedMax] = resolveLayerValue(this.opts.moveSpeed, layer, [0.8, 1.6]);
            const moveRange = rangeMin + Math.random() * (rangeMax - rangeMin);
            const moveSpeed = speedMin + Math.random() * (speedMax - speedMin);
            const allowVerticalMove = resolveLayerValue(this.opts.allowVerticalMove, layer, false);
            const axes: ('x' | 'y' | 'z')[] = allowVerticalMove ? ['x', 'y', 'z'] : ['x', 'z'];
            const moveAxis = axes[Math.floor(Math.random() * axes.length)];
            // y 轴用压缩后的振幅，x / z 轴沿用完整 moveRange
            const verticalRange = Math.min(
                VERTICAL_RANGE_MAX,
                Math.max(VERTICAL_RANGE_MIN, moveRange * VERTICAL_RANGE_RATIO),
            );
            return {
                type: 'moving',
                moveAxis,
                moveRange: moveAxis === 'y' ? verticalRange : moveRange,
                moveSpeed,
                movePhase: Math.random() * Math.PI * 2,
            };
        }
        if (type === 'disappearing') {
            return {
                type: 'disappearing',
                lifespan: resolveLayerValue(this.opts.disappearLifespan, layer, 3.0),
            };
        }
        return { type };
    }
}
