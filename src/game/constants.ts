// ============== 全局常量（引擎参数 + 平台 + 移动 + 岩浆） ==============

// 平台
export const LAYER_HEIGHT = 3.0;           // 每层高度间隔
export const PLATFORM_SIZE = 5;            // 平台边长
export const PLATFORM_THICK = 0.5;         // 平台厚度
export const RANGE = 8;                    // 平台水平随机范围
export const PLATFORMS_PER_LAYER = 4;      // 每层平台数量

// 起始平台（第 0 层）边长。
// 原来是 50 —— 一块巨大的实心平台会把脚下 y=-8 的岩浆完全遮住，开局根本看不到威胁，
// 玩家要爬几层才知道岩浆存在。缩小到 14（半宽 7）后熔岩面近在咫尺：站在中心向外看即可看到，
// 同时仍留有助跑空间。安全性：① 掉出边缘会被 useGame 的 y < -0.5 兜底拉回 (0,0,0)，
// 该判定在岩浆死亡检测之前，不会开局被岩浆淹死；② 第 1 层的锚点平台恒定在螺旋引导点上
// （离塔心约 5.6），即使起始平台再小，第一跳也永远有近距离落点。
export const START_PLATFORM_SIZE = 14;

// 移动 / 物理
export const MOUSE_SENS = 0.002;
export const MOVE_SPEED = 8;
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
export const LAVA_RISE_SPEED_MAX = 1.8;   // 岩浆速度上限（随层数线性加速到此值）
export const LAVA_SPEED_RAMP_LAYER = 81;  // 到该层时岩浆速度达到上限（与难度封顶层一致）
export const LAVA_INITIAL_Y = -8;
export const LAVA_DEATH_MARGIN = 0.1;
export const DEATH_DURATION = 1.0;
export const LAVA_UV_SCALE = { x: 10.0, y: 10.0 };
export const LAVA_TIME_SCALE = 1.0;

// Minecraft 风格调色板：按高度分段（草 → 沙土 → 裸岩 → 火山灰岩 → 雪线）
// top: 顶面覆盖色（所有色段均配置，侧面顶部 1/4 使用同一颜色）
// base: 侧面+底面颜色
// 注意：每段的 top/base 亮度对比率需 >= 2.5x，否则侧面那 1/4 溢边条
// （仅 0.5*0.25=0.125 单位高）在远景下看不出来，平台会显得是单色的。
export interface PaletteSeg {
    maxLayer: number;
    base: { r: number; g: number; b: number };
    top: { r: number; g: number; b: number };  // 顶面覆盖色（草地=绿，雪线=白）
    name: string;
}

export const MC_PALETTE: PaletteSeg[] = [
    //                  岩身（侧/底）                          覆盖色（顶 + 侧面上沿）
    { maxLayer: 9,        base: { r: 0x7a, g: 0x56, b: 0x3a }, top: { r: 0x7c, g: 0xba, b: 0x34 }, name: 'grass' },     // 草绿
    { maxLayer: 22,       base: { r: 0x6d, g: 0x4d, b: 0x33 }, top: { r: 0xd9, g: 0xb2, b: 0x6a }, name: 'sand' },      // 沙黄
    { maxLayer: 44,       base: { r: 0x55, g: 0x55, b: 0x5e }, top: { r: 0xd2, g: 0xcb, b: 0xb8 }, name: 'stone' },     // 灰白裸岩
    { maxLayer: 71,       base: { r: 0x3c, g: 0x3c, b: 0x46 }, top: { r: 0xb0, g: 0xa4, b: 0xc4 }, name: 'ash' },       // 火山灰紫
    { maxLayer: Infinity, base: { r: 0x6f, g: 0x6f, b: 0x7a }, top: { r: 0xf2, g: 0xf6, b: 0xff }, name: 'snow' },      // 雪白
];

// 像素纹理
export const PIXEL_TEX_VARIANTS = 4;
