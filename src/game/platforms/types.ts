import * as THREE from 'three';

// ============== 平台类型系统 ==============

// 平台类型枚举
export type PlatformType =
    | 'normal'        // 普通平台
    | 'moving'        // 移动平台（水平往返）
    | 'disappearing'  // 消失平台（踩后倒计时消失）
    | 'bouncy'        // 弹簧平台（踩后弹起）
    | 'fragile'       // 易碎平台（踩一次即碎）
    | 'ice'           // 冰面（摩擦低）
    | 'conveyor';     // 传送带（持续推动玩家）

// 平台行为参数（按 type 取对应字段）
export interface PlatformBehavior {
    type: PlatformType;

    // 移动平台
    moveAxis?: 'x' | 'y' | 'z';
    moveRange?: number;       // 振幅（中心点到端点的距离）
    moveSpeed?: number;       // 角速度（弧度/秒）
    movePhase?: number;       // 初始相位

    // 消失 / 易碎
    lifespan?: number;        // 踩上后多久消失（秒）

    // 弹簧
    bouncePower?: number;     // 弹起速度

    // 传送带
    pushDirection?: THREE.Vector3;  // 单位向量
    pushForce?: number;

    // 冰面
    friction?: number;        // 摩擦系数（0 无摩擦, 1 正常）
}

// 生成器输出的平台放置信息（纯数据，不含 Three.js 对象）
export interface PlatformPlacement {
    layer: number;
    x: number;       // 初始 x（移动平台为中心点）
    z: number;       // 初始 z
    size: number;
    type: PlatformType;
    behavior?: PlatformBehavior;
    // 是否为该层的主路线锚点（贴着螺旋引导点的那个平台）。
    // 玩家跟着螺旋走时基本就落在它上面，怪物系统会避开它，不堵死主路线。
    isAnchor?: boolean;
}
