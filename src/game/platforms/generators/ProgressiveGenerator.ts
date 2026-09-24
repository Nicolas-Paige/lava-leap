import { MixedGenerator, type GuidePoint } from './MixedGenerator';
import { paramProgress, rampUp, smoothstep, lerp } from '../../difficulty';

// ============== 线性难度生成器 ==============
// 所有派生参数都由 paramProgress() 驱动，统一在 81 层封顶；
// 特殊平台从 9 / 16 层起平滑引入，铺开跨度也正好在 81 层到达上限，不再有布尔式硬开关。

// 封顶层：与 difficulty.ts 的 DIFFICULTY_CAP_LAYER 保持一致
const CAP_LAYER = 81;

const MOVING_START_LAYER = 9;        // 移动平台首次可能出现
const MOVING_SPAN = CAP_LAYER - MOVING_START_LAYER;  // 铺开跨度（81 层达到上限）
const MOVING_MAX = 0.34;             // 移动平台上限概率
const MOVING_INTRO_FLOOR = 0.10;     // 引入期保底概率（教学，非强制）——持续到自然曲线超过它为止

const DISAPPEARING_START_LAYER = 16; // 消失平台首次可能出现
const DISAPPEARING_SPAN = CAP_LAYER - DISAPPEARING_START_LAYER;
const DISAPPEARING_MAX = 0.24;
const DISAPPEARING_INTRO_FLOOR = 0.08;

// 特殊平台铺开速度：>1 前缓后陡
const SPREAD_EXP = 1.3;

// 垂直移动不再是 25 层的开关，改为随层数连续提升的出现比例（81 层达到上限）
const VERTICAL_MOVE_FROM = 18;
const VERTICAL_MOVE_TO = CAP_LAYER;
const VERTICAL_MOVE_MAX_CHANCE = 0.6;

// ============== 螺旋布局 ==============
// 每层的「引导点」绕塔心匀速旋转，平台围绕引导点撒布 → 整座塔是一条盘旋上升的螺旋，
// 玩家被迫持续绕圈，而不是在原地直上直下。
// 参数经过 4000 层模拟标定（跳距按「玩家可在平台内走动」校准：普通 9.05 / 冲刺 12.39）：
//   相邻锚点间距 平均 3.17 / 最远 5.15，始终在普通跳范围内 → 跟着螺旋走一定走得通。
// 散布半径从 6.5 提到 9.0：原先簇外侧被场地边界 clamp 压扁，同层平台大量挤到零间隙
//   （间距 5.56、91.5% 的层有平台贴边、2.65% 的层真的重叠）。加大散布后间距 7.36、
//   贴边 0.18%、重叠 0.00%，而需冲刺比例反而从 1.38% 降到 1.10%。
const SPIRAL_RADIUS = 5.0;              // 螺旋半径
const SPIRAL_RADIUS_WOBBLE = 1.0;       // 半径缓慢摆动，避免看起来像规整圆柱
const SPIRAL_WOBBLE_FREQ = 0.7;         // 每层的摆动相位步进
const SPIRAL_DEG_PER_LAYER = 35;        // 每层旋转角度 → 约 10.3 层绕一圈
const SPIRAL_SCATTER = 9.0;             // 平台围绕引导点的散布半径（太小会让同层平台挤在一起）

/** 第 layer 层的引导点（螺旋轨迹上的一点） */
function spiralGuide(layer: number): GuidePoint {
    const radius = SPIRAL_RADIUS + SPIRAL_RADIUS_WOBBLE * Math.sin(layer * SPIRAL_WOBBLE_FREQ);
    const angle = layer * SPIRAL_DEG_PER_LAYER * (Math.PI / 180);
    return { x: radius * Math.cos(angle), z: radius * Math.sin(angle) };
}

// 特殊平台总占比上限：随难度从 0.45 提升到 0.58（普通平台始终占多数）
const SPECIAL_TOTAL_EASY = 0.45;
const SPECIAL_TOTAL_HARD = 0.58;

export class ProgressiveGenerator extends MixedGenerator {
    constructor() {
        super({
            probabilities: (layer) => {
                // 引入期保底 = 概率下限，直到自然曲线超过它，保证单调不回落
                let moving = layer < MOVING_START_LAYER
                    ? 0
                    : Math.max(MOVING_INTRO_FLOOR, MOVING_MAX * rampUp(layer, MOVING_START_LAYER, MOVING_SPAN, SPREAD_EXP));
                let disappearing = layer < DISAPPEARING_START_LAYER
                    ? 0
                    : Math.max(DISAPPEARING_INTRO_FLOOR, DISAPPEARING_MAX * rampUp(layer, DISAPPEARING_START_LAYER, DISAPPEARING_SPAN, SPREAD_EXP));
                moving = Math.min(moving, MOVING_MAX);
                disappearing = Math.min(disappearing, DISAPPEARING_MAX);

                // 总占比上限随难度提升，按比例缩放以保持两类之间的相对强度
                const totalMax = lerp(SPECIAL_TOTAL_EASY, SPECIAL_TOTAL_HARD, paramProgress(layer));
                const total = moving + disappearing;
                if (total > totalMax) {
                    const k = totalMax / total;
                    moving *= k;
                    disappearing *= k;
                }

                return {
                    normal: Math.max(0, 1 - moving - disappearing),
                    moving,
                    disappearing,
                };
            },
            // 不再强制生成：教学改为引入期的概率保底（见 MOVING_INTRO_FLOOR）
            moveRange: (layer) => {
                const t = paramProgress(layer);
                return [lerp(1.8, 3.8, t), lerp(3.0, 5.0, t)];
            },
            moveSpeed: (layer) => {
                const t = paramProgress(layer);
                return [lerp(0.8, 1.6, t), lerp(1.4, 2.6, t)];
            },
            disappearLifespan: (layer) =>
                lerp(5.0, 2.0, paramProgress(layer)),
            // 垂直移动按连续概率解锁（每个移动平台独立判定，期望值连续）
            allowVerticalMove: (layer) =>
                Math.random() < VERTICAL_MOVE_MAX_CHANCE * smoothstep(VERTICAL_MOVE_FROM, VERTICAL_MOVE_TO, layer),
            // 高层平台散布略微拉开，跳距压力随层数增加
            rangeScale: (layer) => lerp(1.0, 1.18, paramProgress(layer)),
            // 螺旋布局：引导点绕塔心旋转，平台上必放锚点，其余围绕引导点撒布
            guide: (layer) => spiralGuide(layer),
            guideScatter: () => SPIRAL_SCATTER,
        });
    }
}
