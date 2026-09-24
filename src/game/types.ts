import * as THREE from 'three';
import type { PlatformType, PlatformBehavior } from './platforms/types';

// ============== 全局类型定义 ==============

// 平台对象（物理 + 渲染）
export interface Platform {
    mesh: THREE.Mesh;
    material: THREE.MeshLambertMaterial[];  // 6 面材质数组（顶/底/侧各异）
    x: number;                  // 当前 x（移动平台会变）
    z: number;                  // 当前 z（移动平台会变）
    baseX: number;              // 生成时的中心 x（移动平台振动的中心）
    baseZ: number;              // 生成时的中心 z
    baseY: number;              // 生成时的 topY（y 轴移动平台振动的中心）
    layer: number;
    size: number;
    topY: number;
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    // 平台类型与行为
    type: PlatformType;
    behavior?: PlatformBehavior;
    // 运行时状态
    disappearTimer: number;     // 消失倒计时（>0 表示已触发，倒计时到 0 时消失）
    spawned: boolean;           // 是否已生成（用于动画淡入）
}

// 输入状态
export interface InputKeys {
    w: boolean;
    a: boolean;
    s: boolean;
    d: boolean;
    space: boolean;
    shift: boolean;
}

// 游戏状态机
export type GamePhase =
    | 'idle'               // 开始界面
    | 'character-select'   // 角色选择页面
    | 'playing'            // 游戏中
    | 'paused'             // 暂停菜单
    | 'settings'           // 设置面板
    | 'dying'              // 死亡动画进行中
    | 'dead';              // 死亡菜单

// 相机视角模式
export type CameraMode = 'firstPerson' | 'thirdPerson';

// 玩家死亡材质记录（用于变红动画）
export interface DeathMaterialRecord {
    mat: THREE.MeshStandardMaterial;
    origEmissiveR: number;
    origEmissiveG: number;
    origEmissiveB: number;
    origEmissiveI: number;
}

// 游戏对外暴露的上下文（给模式 / UI 用）
export interface GameContext {
    phase: GamePhase;
    currentLayer: number;
    bestLayer: number;
    volume: number;
}
