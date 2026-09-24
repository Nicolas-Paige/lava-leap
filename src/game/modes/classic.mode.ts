import type { GameMode } from './types';
import { ProgressiveGenerator } from '../platforms/generators/ProgressiveGenerator';

// ============== 合并后的统一模式 ==============
// 前期保持经典纯平台玩法，高层逐步加入移动和消失平台

export const classicMode: GameMode = {
    id: 'classic',
    name: 'mode.classic.name',
    description: 'mode.classic.desc',
    icon: '🌋',

    // 引擎数值（沿用经典模式手感）
    gravity: -25,
    jumpPower: 13,
    // 原 8。横穿一个 5×5 平台只要 0.63s，空中横移也过于灵活，整体偏"滑"。
    // 降到 7（横穿 0.71s）后跳跃水平位移从 9.05 缩到 8.36，冲刺从 12.39 到 11.28。
    // 实测 4000 层：保守容差下死路 0.08%，按玩家会走到平台边缘起跳算则为 0%——安全。
    // 冲刺价值随之提升（需冲刺的层 1.60% → 2.25%）。
    moveSpeed: 7,
    dashMultiplier: 1.6,
    friction: 0.85,

    // 岩浆
    lava: {
        enabled: true,
        riseSpeed: 0.8,
        initialY: -8,
    },

    // 平台
    layerHeight: 3.0,
    platformSize: 5,
    platformsPerLayer: 4,
    // 场地半宽：螺旋引导点半径约 5、散布半径 9，场地太小会把簇外侧 clamp 压扁、
    // 同层平台挤成零间隙。±11（配合 rangeScale 高层最多 ±13）实测间距 7.36。
    range: 11,

    // 无限模式，无时间限制
    // timeLimit, winLayer 都不设

    // 前期普通平台，10 层起出现移动平台，15 层起出现消失平台
    createGenerator: () => new ProgressiveGenerator(),
};
