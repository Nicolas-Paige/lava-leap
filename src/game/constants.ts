// ============== 全局常量（引擎参数 + 平台 + 移动 + 岩浆） ==============

// 平台
export const LAYER_HEIGHT = 3.0;           // 每层高度间隔
export const PLATFORM_SIZE = 5;            // 平台边长
export const PLATFORM_THICK = 0.5;         // 平台厚度
export const RANGE = 8;                    // 平台水平随机范围
export const PLATFORMS_PER_LAYER = 4;      // 每层平台数量

// 移动 / 物理
export const MOUSE_SENS = 0.002;
export const MOVE_SPEED = 8;
export const RUN_SPEED_MULTIPLIER = 1.6;   // Shift 奔跑速度倍率
export const DASH_JUMP_MULTIPLIER = 1.2;   // 奔跑时跳跃力倍率
export const GRAVITY = -25;
export const JUMP_POWER = 13;

// 相机跟随
export const CAM_DIST = 6;
export const CAM_HEIGHT = 3;
export const CAM_SMOOTH = 0.12;

// 第一人称
export const FP_CAMERA_HEIGHT = 1.5;   // 第一人称相机相对于玩家脚部的高度
export const PITCH_MIN = -Math.PI / 3;  // 最低俯视角（-60°）
export const PITCH_MAX = Math.PI / 3;   // 最高仰视角（+60°）

// 岩浆
export const LAVA_SIZE = 100;
export const LAVA_RISE_SPEED = 0.8;
export const LAVA_INITIAL_Y = -8;
export const LAVA_DEATH_MARGIN = 0.1;
export const DEATH_DURATION = 1.0;
export const LAVA_UV_SCALE = { x: 10.0, y: 10.0 };
export const LAVA_TIME_SCALE = 1.0;

// Minecraft 风格调色板：按高度分段（草 → 泥 → 石 → 高山裸岩 → 雪线）
// top: 顶面覆盖色（所有色段均配置，侧面顶部 1/4 使用同一颜色）
// base: 侧面+底面颜色
export interface PaletteSeg {
    maxLayer: number;
    base: { r: number; g: number; b: number };
    top: { r: number; g: number; b: number };  // 顶面覆盖色（草地=绿，雪线=白）
    name: string;
}

export const MC_PALETTE: PaletteSeg[] = [
    { maxLayer: 9,  base: { r: 0x86, g: 0x60, b: 0x43 }, top: { r: 0x7c, g: 0xba, b: 0x34 }, name: 'grass' },
    { maxLayer: 22, base: { r: 0x86, g: 0x60, b: 0x43 }, top: { r: 0x9a, g: 0x70, b: 0x4f }, name: 'dirt' },
    { maxLayer: 44, base: { r: 0x7d, g: 0x7d, b: 0x7d }, top: { r: 0x96, g: 0x96, b: 0x96 }, name: 'stone' },
    { maxLayer: 71, base: { r: 0x4a, g: 0x4a, b: 0x5a }, top: { r: 0x62, g: 0x62, b: 0x74 }, name: 'darkstone' },
    { maxLayer: Infinity, base: { r: 0x7d, g: 0x7d, b: 0x7d }, top: { r: 0xff, g: 0xff, b: 0xff }, name: 'snow' },
];

// 像素纹理
export const PIXEL_TEX_VARIANTS = 4;
