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
    // 移速沿革：8 → 7 → 6。地面越快越"滑"，而动画倍率是按速度反算的，
    // 移速直接决定腿动频率——7 时走路要 5.5 步/秒（真人约 2），看着像抽风。
    // 降到 6（横穿 5×5 平台 0.83s）后配合步频上限下调，腿动回到 4.0 步/秒。
    // 冲刺倍率同时 1.6 → 1.5（11.2 → 9.0），冲刺跳 11.65 → 9.36。
    // 4000 层仿真：层间边缘空隙平均 0.73 / 最远 7.7~8.1，冲刺跳余量仍有 15%+，死路 0%；
    // 需冲刺的层从 0.04% 升到 0.73%，冲刺的存在感反而更明确。
    moveSpeed: 6,
    dashMultiplier: 1.5,
    friction: 0.85,

    // 岩浆
    // 起步速度从 0.8 提到 1.1：原来前 30 层岩浆要 3.75 秒才吃掉一层，玩家怎么磨都安全，
    // 落差迅速拉到 20+ 层（看都看不见）。现在起步 2.73 秒/层，第 10 层就只落后 8 层左右。
    // 上限与加速段见 constants.ts 的 LAVA_RISE_SPEED_MAX / LAVA_SPEED_RAMP_LAYER（2.6 / 81 层）。
    lava: {
        enabled: true,
        riseSpeed: 1.1,
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
