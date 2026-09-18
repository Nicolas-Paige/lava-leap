# Lava Leap

一个基于 Three.js + Vue 3 的 3D 跳跃小游戏。选择你喜欢的角色，在随机生成的平台间往上跳跃，看你能跳到第几层——但底部的岩浆会持续追上来。

> 在线试玩：https://game.andio.top/

---

## 目录

- [游戏特性](#游戏特性)
- [如何运行](#如何运行)
- [操作说明](#操作说明)
- [移动端适配](#移动端适配)
- [岩浆系统](#岩浆系统)
- [平台与材质](#平台与材质)
- [排行榜系统](#排行榜系统)
- [设置面板](#设置面板)
- [项目结构](#项目结构)
- [技术栈](#技术栈)
- [关键参数](#关键参数)
- [许可证](#许可证)

---

## 游戏特性

- **Vue 3 + TypeScript 工程**：基于 Vite 的单文件组件（SFC）架构，引擎层与 UI 层解耦
- **三维场景**：天空背景 + 雾效 + 方向光阴影，营造立体空间感
- **GLTF 模型动画**：角色模型内置 Idle / Walk / Run / Jump / Death 动画，根据状态平滑过渡；死亡时播放模型自带的死亡动画
- **动态平台生成**：随玩家上升不断生成新平台，远离玩家的低层平台自动回收
- **Minecraft 风格像素材质**：平台按高度分段（草 → 泥 → 石 → 高山裸岩 → 雪线），每段使用 canvas 程序化生成的 16×16 像素纹理（NearestFilter 硬边像素）
- **视线遮挡处理**：相机与玩家之间的平台自动半透明化，避免视野被挡
- **冲刺跳跃**：Shift 冲刺时跳跃，跳得更高更远，是冲层关键
- **第一 / 第三人称切换**：按 `V` 键（PC）或点 👁 按钮（移动端）切换视角；第一人称可上下左右自由观察，角色模型自动隐藏
- **多角色选择**：开始游戏后进入选人页面，3D 实时展示角色模型，PC 左右箭头/键盘切换，移动端左右滑动切换，点击"立即出发"正式进入游戏；内置 5 个可选角色（机器人 + 4 个人形），均包含完整的 walk/run/idle/jump 动画
- **岩浆追击**：底部岩浆缓慢上升，碰到即死，迫使玩家持续向上（详见 [岩浆系统](#岩浆系统)）
- **死亡菜单**：被岩浆烧死后弹出菜单，可选择重新开始或退出游戏
- **背景音乐**：进入游戏自动播放，退出游戏自动暂停（循环播放）
- **设置面板**：暂停菜单中可调节音量、切换语言
- **排行榜系统**：支持经典 / 地狱双模式排行榜（各保留前 20 名），死亡时自动校验是否上榜，同一玩家可多次上榜；基于 EdgeOne KV 存储，提供 check / submit / list 三个 API
- **层数记录**：实时显示当前层与历史最高层
- **移动端适配**：自动检测触控设备，提供动态浮动摇杆 / 跳跃 / 冲刺切换 / 视角切换 / 暂停按钮，竖屏旋转提示

## 如何运行

项目基于 Vite 构建，需先安装依赖。

### 安装

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

浏览器访问 `http://localhost:5173`（端口以终端输出为准）。

### 生产构建

```bash
npm run build
```

产物输出到 `dist/`，可用任意静态服务器托管。

### 预览构建产物

```bash
npm run preview
```

## 操作说明

### PC 端

| 按键 | 功能 |
| --- | --- |
| `W` / `A` / `S` / `D` | 前后左右移动 |
| `Shift` | 冲刺（移动速度提升，跳跃力增强） |
| `Space` | 跳跃 |
| 鼠标移动 | 转动视角（点击页面锁定鼠标，支持上下左右） |
| `V` | 切换第一人称 / 第三人称视角 |
| `ESC` | 打开 / 关闭暂停菜单 |
| `P` | 打开 / 关闭暂停菜单 |

### 移动端

| 操作 | 功能 |
| --- | --- |
| 左半屏任意位置按住拖动 | 动态浮动摇杆（8 方向移动，含死区），手指在哪摇杆就在哪 |
| 右半屏拖拽 | 转动视角（支持上下左右） |
| 右下「跳」按钮 | 跳跃 |
| 「冲刺」按钮 | 点按切换冲刺状态（开启时按钮高亮，配合跳跃可冲刺跳） |
| 右上「👁」按钮 | 切换第一人称 / 第三人称视角 |
| 右上「‖」按钮 | 暂停 / 继续游戏 |

**玩法要点**：冲刺时跳跃能跳得更高更远，是登上高层的核心技巧。掉出平台边缘会被拉回第 0 层中心继续游戏；但底部岩浆会持续上升，一旦脚底低于岩浆面即判定死亡，弹出菜单等待选择。因此要尽量保持向上，别被岩浆追上。

> 说明：在鼠标锁定状态下按 ESC，浏览器会吞掉 `keydown` 事件，因此打开菜单通过 `pointerlockchange` 事件检测；关闭菜单时鼠标已解锁，`keydown` 可正常派发。移动端不使用 Pointer Lock，改用触控拖拽转视角。

## 移动端适配

- **设备检测**：`src/composables/useTouchInput.ts` 通过 `('ontouchstart' in window) || (navigator.maxTouchPoints > 0)` 判断触控设备
- **横屏处理**：Web 无法强制锁屏，采用遮罩提示方案。竖屏时全屏显示"请横屏使用"并带旋转动画，转成横屏后自动消失进入游戏
- **动态浮动摇杆**：左半屏任意位置按下即生成摇杆，手指在哪摇杆中心就在哪，松开消失；不再固定左下角，避免遮挡
- **冲刺切换**：冲刺按钮改为点按切换式（非按住），开启时按钮红色高亮，方便配合跳跃操作
- **视角切换**：右上 👁 按钮切换第一人称 / 第三人称
- **触控 UI**：仅在触控设备渲染，由 `TouchControls.vue` 实现，通过 `gameActive` prop 控制摇杆/按钮显示，`isPortrait` ref 控制旋转提示
- **性能优化**：移动端自动关闭抗锯齿、降低 pixelRatio 上限至 1.5、阴影分辨率降至 1024

## 岩浆系统

底部有一片缓慢上升的岩浆面，是主要的失败条件。

- **Shader**：使用 Three.js 官方 `webgl_shader_lava` shader（由 TheGameMaker 出品，随官方 examples 长期维护）
- **纹理**：通过 CDN 加载官方 lava 纹理（`textures/lava/cloud.png` 噪声图 + `textures/lava/lavatile.jpg` 熔岩贴图），配合 `uvScale` 在大平面上平铺；多源回退（threejs.org → GitHub raw → canvas fallback）
- **流动**：纹理 UV 基于时间与 cloud 噪声做双路偏移（T1 / T2），再通过 `color * (p*2) + (color² - 0.1)` 混合，通道溢出形成高温发光带
- **红光预警**：岩浆点光源照亮附近平台与角色，岩浆逼近时视觉更紧张
- **行为**：岩浆面以恒定速度向上推进，玩家脚底低于岩浆面时触发死亡
- **死亡流程**：播放角色自带的死亡动画，同时下沉被岩浆吞没（约 1 秒）→ 弹出"你死了"菜单 → 玩家选择"重新开始"（回到起点、岩浆归位、保留最高层数）或"退出游戏"（回开始界面、暂停音乐）

实现位于 [src/game/LavaSystem.ts](file:///d:/work/test/jump-robot/src/game/LavaSystem.ts)。

## 平台与材质

### 平台生成

- 每层 `PLATFORMS_PER_LAYER` 个平台，水平位置在 `RANGE` 范围内随机
- 平台颜色随层数分段，使用 `MC_PALETTE` 调色板
- 远离玩家 30 层以下的平台自动回收（含 geometry / material / texture dispose）
- 视线遮挡：相机与玩家之间的平台材质 `opacity` 降至 0.25 并切到 `transparent`

实现位于 [src/game/PlatformSystem.ts](file:///d:/work/test/jump-robot/src/game/PlatformSystem.ts)。

### Minecraft 风格像素纹理

平台顶面使用程序化生成的 16×16 像素纹理，模拟 Minecraft 体素风：

| 层数范围 | 色段 | 含义 |
| --- | --- | --- |
| 0-6 | `#7cba34` 草绿 | 草地地表 |
| 7-14 | `#866043` 泥棕 | 草下土层 |
| 15-28 | `#7d7d7d` 石灰 | 岩石层 |
| 29-45 | `#4a4a5a` 高山裸岩 | 高海拔裸岩 |
| 46+ | `#ffffff` 雪线 | 顶部雪线 |

- 每色段预生成 `PIXEL_TEX_VARIANTS=4` 个纹理变体，避免平台视觉雷同
- 纹理生成：4×4 cell，每 cell 基础色 ±15% 亮度，cell 内每像素再 ±5% 微扰
- `NearestFilter` 放大模式，保留硬边像素感
- 平台销毁时调用 `material.map.dispose()` 释放显存

实现位于 [src/game/textures.ts](file:///d:/work/test/jump-robot/src/game/textures.ts)，调色板定义在 [src/game/constants.ts](file:///d:/work/test/jump-robot/src/game/constants.ts)。

## 排行榜系统

支持经典 / 地狱双模式独立排行榜，基于 EdgeOne Makers Edge Function + KV 存储实现。

### 功能

- **双模式排行榜**：经典模式（classic）和地狱模式（inferno）各自独立保存前 20 名
- **死亡自动校验**：玩家死亡时自动调用 check 接口判断是否上榜，上榜后自动提交成绩
- **昵称系统**：首次上榜弹出昵称输入框，后续自动使用已保存的昵称
- **同一玩家多次上榜**：同一玩家在同一模式下可以占据多个排名位置

### API 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/leaderboard/check?mode=classic&layer=12` | 检查指定层数是否上榜，返回 `{ qualifies, currentRank, total }` |
| `POST` | `/api/leaderboard` | 提交成绩，Body: `{ name, layer, mode, characterId }`，返回 `{ success, rank, total }` |
| `GET` | `/api/leaderboard?mode=classic&limit=20` | 获取排行榜列表，返回 `{ records, updatedAt }` |

### Edge Function 文件结构

```
edge-functions/
  api/
    leaderboard.ts              → /api/leaderboard          (GET 列表 + POST 提交)
    leaderboard/
      check.ts                  → /api/leaderboard/check    (GET 校验)
```

### 前端文件

- `src/api/leaderboard.ts` — API 客户端（checkScore / submitScore / fetchLeaderboard）
- `src/components/LeaderboardPanel.vue` — 排行榜面板组件（模式切换、排名列表、刷新）
- `src/App.vue` — 死亡流程中的上榜校验与提交逻辑

### KV 存储结构

KV key: `leaderboard:{mode}`（如 `leaderboard:classic`），value 为 JSON：

```json
{
  "records": [
    { "name": "玩家昵称", "layer": 15, "mode": "classic", "characterId": "robot", "timestamp": 1700000000000 }
  ],
  "updatedAt": 1700000000000
}
```

## 设置面板

暂停菜单中点击"设置"可进入设置面板，目前支持：

- **音量调节**：滑动条控制背景音乐音量（0–100%，默认 70%）
- **语言切换**：下拉选择中文 / English，默认中文。语言选择会自动保存到 `localStorage`，下次访问时记住偏好；首次访问会根据浏览器语言自动判断

### i18n 实现

- 翻译字符串表与状态管理位于 [src/composables/useI18n.ts](file:///d:/work/test/jump-robot/src/composables/useI18n.ts)
- 采用模块级单例 `ref`，所有组件 `import { useI18n }` 共享同一实例，无需通过 props 层层传递
- 新增翻译只需在 `translations` 对象中加一项，再在组件里用 `tr('key')` 引用即可
- 初始语言检测顺序：`localStorage` → `navigator.language` → 默认 `'zh'`

## 项目结构

```
lava-leap/
├── index.html                  # Vite 入口 HTML
├── package.json                # 依赖与脚本
├── vite.config.ts              # Vite 配置
├── tsconfig.json               # TypeScript 配置
├── tsconfig.node.json
├── edge-functions/             # EdgeOne Edge Functions（排行榜后端）
│   └── api/
│       ├── leaderboard.ts      # /api/leaderboard（GET 列表 + POST 提交）
│       └── leaderboard/
│           └── check.ts        # /api/leaderboard/check（GET 校验）
├── assets/                     # 游戏资源
│   └── bg-music.mp4            # 背景音乐
├── models/                     # 角色模型
│   ├── RobotExpressive.glb     # 机器人
│   ├── Man.glb                 # 休闲男
│   ├── Man in Long Sleeves.glb # 长袖男
│   ├── Man in Suit.glb         # 西装男
│   ├── Man-fjHyMd5Wxw.glb     # 运动男
│   ├── Xbot.glb
│   └── miku.glb
├── src/
│   ├── main.ts                 # 应用挂载入口
│   ├── App.vue                 # 顶层组件（canvas + audio + 子组件编排）
│   ├── styles.css              # 全局样式
│   ├── shims.d.ts              # TS 模块声明（.glb / .mp4 等）
│   ├── api/                    # API 客户端
│   │   └── leaderboard.ts      # 排行榜 API（checkScore / submitScore / fetchLeaderboard）
│   ├── game/                   # 引擎层（纯 TS，无 Vue 依赖，可独立复用）
│   │   ├── constants.ts        # 所有常量 + MC 调色板 + 第一人称参数
│   │   ├── types.ts            # Platform / InputKeys / GamePhase / CameraMode 等类型
│   │   ├── characters.ts       # 可选角色配置（模型URL / 缩放 / 动作列表）
│   │   ├── textures.ts         # 像素纹理生成
│   │   ├── PlatformSystem.ts   # 平台生成 / 管理 / 落地检测 / 视线遮挡
│   │   ├── LavaSystem.ts       # 岩浆着色器 / 上升 / 死亡检测
│   │   ├── modes/              # 游戏模式（经典 / 地狱）
│   │   │   ├── types.ts        # GameMode 接口定义
│   │   │   ├── registry.ts     # 模式注册表
│   │   │   ├── classic.mode.ts # 经典模式
│   │   │   └── inferno.mode.ts # 地狱模式
│   │   └── platforms/          # 平台生成器
│   │       ├── types.ts        # 平台类型与行为定义
│   │       └── generators/     # 经典生成器 / 混合生成器（移动+消失平台）
│   ├── composables/            # Vue 组合式函数
│   │   ├── useGame.ts          # 主引擎：场景 / 模型 / 主循环 / 控制 API / 选人流程
│   │   ├── useI18n.ts          # 国际化（中英文切换 + localStorage 持久化）
│   │   ├── useKeyboardInput.ts # 键盘 + 鼠标输入（PC）
│   │   └── useTouchInput.ts    # 触控输入（移动端）
│   └── components/             # UI 组件
│       ├── StartOverlay.vue    # 开始界面（模式选择）
│       ├── CharacterSelect.vue # 角色选择页面（3D展示 + 左右切换）
│       ├── Hud.vue             # 层数显示 + 操作提示
│       ├── EscMenu.vue         # 暂停 / 死亡菜单
│       ├── LeaderboardPanel.vue# 排行榜面板（双模式切换 + 排名列表）
│       ├── SettingsPanel.vue    # 设置面板
│       └── TouchControls.vue    # 移动端虚拟摇杆 / 按钮
├── LICENSE                     # Apache License 2.0
└── README.md
```

### 架构分层说明

- **`game/`（引擎层）**：纯 TypeScript，零 Vue 依赖。所有 Three.js 对象、物理、平台、岩浆逻辑都在这里。后续接入其他框架（R3F / TresJS）或做多模式扩展时可整体复用。
- **`composables/`（组合层）**：Vue 组合式函数，把引擎能力包装成响应式 API。`useGame` 是主入口，`useKeyboardInput` / `useTouchInput` 处理输入。
- **`components/`（视图层）**：Vue SFC，纯 UI。通过 props / emits 与组合层通信。

> 重要设计：Three.js 对象用 `shallowRef` 包装（避免响应式系统代理 Vector3 导致性能崩溃），每帧都在变的物理状态（`velY` / `yaw` / `keys`）使用普通变量，不进响应式系统。

## 技术栈

- [Vue](https://vuejs.org/) `^3.4.0`（`<script setup>` + Composition API）
- [Three.js](https://threejs.org/) `^0.160.0`（npm 安装，非 CDN）
- [Vite](https://vitejs.dev/) `^5.0.0`
- [TypeScript](https://www.typescriptlang.org/) `^5.3.0`
- WebGLRenderer + PCFSoftShadowMap
- GLTFLoader 加载角色模型与动画
- ShaderMaterial 应用 Three.js 官方 `webgl_shader_lava` shader（含 cloud / lavatile 纹理）
- HTML5 `<audio>` 背景音乐播放

## 关键参数

游戏内的核心参数定义在 [src/game/constants.ts](file:///d:/work/test/jump-robot/src/game/constants.ts) 中，可按需调整：

| 参数 | 默认值 | 含义 |
| --- | --- | --- |
| `LAYER_HEIGHT` | `3.0` | 每层平台的高度间隔 |
| `PLATFORM_SIZE` | `5` | 平台边长 |
| `PLATFORM_THICK` | `0.5` | 平台厚度 |
| `RANGE` | `8` | 平台水平随机范围 |
| `PLATFORMS_PER_LAYER` | `4` | 每层平台数量 |
| `MOVE_SPEED` | `8` | 玩家移动速度 |
| `RUN_SPEED_MULTIPLIER` | `1.6` | 冲刺速度倍率 |
| `DASH_JUMP_MULTIPLIER` | `1.2` | 冲刺跳跃力倍率 |
| `GRAVITY` | `-25` | 重力加速度 |
| `JUMP_POWER` | `13` | 普通跳跃力 |
| `MOUSE_SENS` | `0.002` | 鼠标 / 触控拖拽转视角灵敏度 |
| `CAM_DIST` | `9` | 第三人称相机与玩家的水平距离 |
| `CAM_HEIGHT` | `4` | 第三人称相机相对于玩家的高度偏移 |
| `CAM_SMOOTH` | `0.12` | 第三人称相机跟随平滑系数 |
| `FP_CAMERA_HEIGHT` | `1.5` | 第一人称相机相对于玩家脚部的高度 |
| `PITCH_MIN` | `-π/3` | 第一人称最低俯视角（-60°） |
| `PITCH_MAX` | `π/3` | 第一人称最高仰视角（+60°） |
| `LAVA_SIZE` | `100` | 岩浆平面边长 |
| `LAVA_RISE_SPEED` | `0.8` | 岩浆每秒上升速度 |
| `LAVA_INITIAL_Y` | `-8` | 岩浆起始高度（低于第 0 层） |
| `LAVA_DEATH_MARGIN` | `0.1` | 玩家脚底低于岩浆面多少即判定死亡 |
| `DEATH_DURATION` | `1.0` | 死亡动画时长（秒） |
| `LAVA_UV_SCALE` | `{ x: 10, y: 10 }` | 官方 lava 纹理在平面上的平铺密度 |
| `LAVA_TIME_SCALE` | `1.0` | 官方 lava shader 流动速度整体缩放 |
| `PIXEL_TEX_VARIANTS` | `4` | 每色段预生成的像素纹理变体数量 |
| `MC_PALETTE` | 见下 | Minecraft 风格调色板（按高度分段） |

### `MC_PALETTE` 定义

```ts
export const MC_PALETTE: PaletteSeg[] = [
    { maxLayer: 6,  base: { r: 0x7c, g: 0xba, b: 0x34 }, name: 'grass' },
    { maxLayer: 14, base: { r: 0x86, g: 0x60, b: 0x43 }, name: 'dirt' },
    { maxLayer: 28, base: { r: 0x7d, g: 0x7d, b: 0x7d }, name: 'stone' },
    { maxLayer: 45, base: { r: 0x4a, g: 0x4a, b: 0x5a }, name: 'darkstone' },
    { maxLayer: Infinity, base: { r: 0xff, g: 0xff, b: 0xff }, name: 'snow' },
];
```

## 许可证

本项目基于 [Apache License 2.0](file:///d:/work/test/jump-robot/LICENSE) 开源。

---

# Lava Leap (English)

A 3D jumping mini-game built with Three.js + Vue 3. Pick your favorite character and jump upward across randomly generated platforms to see how high you can climb — but the lava at the bottom keeps rising.

> Play online: https://game.andio.top/

---

## Table of Contents

- [Features](#features)
- [How to Run](#how-to-run)
- [Controls](#controls)
- [Mobile Adaptation](#mobile-adaptation)
- [Lava System](#lava-system)
- [Platforms & Materials](#platforms--materials)
- [Leaderboard](#leaderboard)
- [Settings Panel](#settings-panel-1)
- [Project Structure](#project-structure-1)
- [Tech Stack](#tech-stack-1)
- [Key Parameters](#key-parameters-1)
- [License](#license-1)

---

## Features

- **Vue 3 + TypeScript engineering**: Vite-based Single File Component (SFC) architecture, engine layer decoupled from UI layer
- **3D scene**: Sky background + fog + directional light shadows create a sense of spatial depth
- **GLTF model animation**: Character models have built-in Idle / Walk / Run / Jump / Death animations with smooth state transitions; death plays the model's native death animation
- **Dynamic platform generation**: New platforms are continuously generated as the player climbs, and distant low-level platforms are automatically recycled
- **Minecraft-style pixel textures**: Platforms are segmented by height (grass → dirt → stone → darkstone → snow), each segment uses a canvas-generated 16×16 pixel texture (NearestFilter for hard pixel edges)
- **Line-of-sight occlusion**: Platforms between the camera and the player become semi-transparent to avoid blocking the view
- **Dash jump**: Jumping while dashing with Shift makes you jump higher and farther, which is key to climbing layers
- **First / Third person toggle**: Press `V` (PC) or tap the 👁 button (mobile) to switch camera views; first-person allows free look up/down/left/right, character model auto-hides
- **Multi-character selection**: After tapping start, enter a character select screen with real-time 3D model preview. PC uses arrow buttons/keys, mobile uses left/right swipe. Tap "Let's Go" to officially start. 5 playable characters (1 robot + 4 humans), each with full walk/run/idle/jump animations
- **Lava chase**: Bottom lava slowly rises and kills on contact, forcing the player to keep climbing (see [Lava System](#lava-system))
- **Death menu**: A menu pops up after being burned by lava, offering options to restart or quit the game
- **Background music**: Automatically plays when entering the game, pauses when exiting (loops)
- **Settings panel**: Adjust volume and toggle language from the pause menu
- **Leaderboard system**: Dual-mode leaderboard (classic / inferno, top 20 each), auto-check on death, same player can appear multiple times; powered by EdgeOne KV with check / submit / list APIs
- **Layer tracking**: Real-time display of current layer and historical highest layer
- **Mobile adaptation**: Auto-detects touch devices, provides dynamic floating joystick / jump / dash toggle / view toggle / pause buttons, portrait orientation hint

## How to Run

The project is built with Vite. Install dependencies first.

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

Visit `http://localhost:5173` in the browser (port subject to terminal output).

### Production Build

```bash
npm run build
```

Output goes to `dist/`, which can be served by any static server.

### Preview Build

```bash
npm run preview
```

## Controls

### PC

| Key | Function |
| --- | --- |
| `W` / `A` / `S` / `D` | Move forward / left / back / right |
| `Shift` | Dash (increased movement speed and jump force) |
| `Space` | Jump |
| Mouse movement | Rotate view (click the page to lock the pointer, supports look up/down) |
| `V` | Toggle first-person / third-person view |
| `ESC` | Open / close the pause menu |
| `P` | Open / close the pause menu |

### Mobile

| Action | Function |
| --- | --- |
| Tap & drag anywhere on left half | Dynamic floating joystick (8-directional movement with dead zone), appears where your finger touches |
| Right-half screen drag | Rotate view (supports look up/down) |
| Bottom-right "Jump" button | Jump |
| "Dash" button | Tap to toggle dash on/off (highlighted when active, combine with jump for dash jump) |
| Top-right "👁" button | Toggle first-person / third-person view |
| Top-right "‖" button | Pause / resume game |

**Gameplay tips**: Jumping while dashing lets you jump higher and farther — the core skill for reaching higher layers. Falling off the edge of platforms will pull you back to the center of layer 0 to continue; however, the bottom lava keeps rising, and once your feet drop below the lava surface, you die and a menu appears for your choice. Keep climbing upward and don't get caught.

> Note: When the pointer is locked, pressing ESC makes the browser swallow the `keydown` event, so opening the menu is detected via `pointerlockchange`; closing the menu uses `keydown` since the pointer is already unlocked. Mobile does not use Pointer Lock — it uses touch drag for view rotation instead.

## Mobile Adaptation

- **Device detection**: `src/composables/useTouchInput.ts` detects touch devices via `('ontouchstart' in window) || (navigator.maxTouchPoints > 0)`
- **Orientation handling**: Web cannot force lock orientation, so a mask prompt is used. In portrait, a full-screen "Please use landscape" with rotation animation is shown; it disappears automatically when rotated to landscape
- **Dynamic floating joystick**: Tap anywhere on the left half to spawn the joystick at your finger position, disappears on release; no longer fixed to bottom-left, avoids blocking the view
- **Dash toggle**: Dash button is tap-to-toggle (not hold), highlighted in red when active, easier to combine with jump
- **View toggle**: Top-right 👁 button toggles first-person / third-person
- **Touch UI**: Only rendered on touch devices, implemented by `TouchControls.vue`. Joystick/button visibility is controlled by `gameActive` prop; rotation hint is controlled by `isPortrait` ref
- **Performance optimizations**: Mobile auto-disables antialiasing, lowers pixelRatio cap to 1.5, and reduces shadow map resolution to 1024

## Lava System

A slowly rising lava surface at the bottom — the main failure condition.

- **Shader**: Uses the official Three.js `webgl_shader_lava` shader (created by TheGameMaker, maintained with the official examples long-term)
- **Textures**: Loads official lava textures via CDN (`textures/lava/cloud.png` noise map + `textures/lava/lavatile.jpg` lava tile), combined with `uvScale` for tiling on large planes; multi-source fallback (threejs.org → GitHub raw → canvas fallback)
- **Flow**: Texture UV is offset in dual paths (T1 / T2) based on time and cloud noise, then mixed via `color * (p*2) + (color² - 0.1)`, with channel overflow forming high-temperature glowing bands
- **Red light warning**: The lava point light source illuminates nearby platforms and the character, making the visual more intense as the lava approaches
- **Behavior**: The lava surface advances upward at a constant speed, triggering death when the player's feet drop below the lava surface
- **Death process**: Plays the character's native death animation while sinking into the lava (about 1 second) → "You Died" menu pops up → Player chooses "Restart" (return to start, reset lava, keep highest layer) or "Quit Game" (return to start screen, pause music)

Implementation in [src/game/LavaSystem.ts](file:///d:/work/test/jump-robot/src/game/LavaSystem.ts).

## Platforms & Materials

### Platform Generation

- `PLATFORMS_PER_LAYER` platforms per layer, random horizontal positions within `RANGE`
- Platform color is segmented by layer number, using the `MC_PALETTE` palette
- Platforms more than 30 layers below the player are auto-recycled (including geometry / material / texture dispose)
- Line-of-sight occlusion: platforms between camera and player have material `opacity` reduced to 0.25 and switched to `transparent`

Implementation in [src/game/PlatformSystem.ts](file:///d:/work/test/jump-robot/src/game/PlatformSystem.ts).

### Minecraft-style Pixel Textures

Platform tops use procedurally generated 16×16 pixel textures to simulate a Minecraft voxel style:

| Layer Range | Segment | Meaning |
| --- | --- | --- |
| 0-6 | `#7cba34` grass | Grassland surface |
| 7-14 | `#866043` dirt | Soil below grass |
| 15-28 | `#7d7d7d` stone | Rock layer |
| 29-45 | `#4a4a5a` darkstone | High-altitude bare rock |
| 46+ | `#ffffff` snow | Snow line at top |

- Each segment pre-generates `PIXEL_TEX_VARIANTS=4` texture variants to avoid visual repetition across platforms
- Texture generation: 4×4 cells, each cell base color ±15% brightness, then per-pixel ±5% noise within cell
- `NearestFilter` magnification preserves hard pixel edges
- `material.map.dispose()` is called when platforms are destroyed to free VRAM

Implementation in [src/game/textures.ts](file:///d:/work/test/jump-robot/src/game/textures.ts); palette defined in [src/game/constants.ts](file:///d:/work/test/jump-robot/src/game/constants.ts).

## Leaderboard

Dual-mode leaderboard (classic / inferno) powered by EdgeOne Makers Edge Functions + KV storage.

### Features

- **Dual-mode**: Classic and inferno modes each maintain independent top-20 rankings
- **Auto-check on death**: Automatically calls the check API to determine if the score qualifies, then submits
- **Nickname system**: First-time qualifier prompts for a nickname; subsequent submissions use the saved name
- **Multiple entries**: Same player can occupy multiple spots on the same mode's leaderboard

### API Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/leaderboard/check?mode=classic&layer=12` | Check if a layer score qualifies, returns `{ qualifies, currentRank, total }` |
| `POST` | `/api/leaderboard` | Submit score, Body: `{ name, layer, mode, characterId }`, returns `{ success, rank, total }` |
| `GET` | `/api/leaderboard?mode=classic&limit=20` | Fetch leaderboard, returns `{ records, updatedAt }` |

### Edge Function File Structure

```
edge-functions/
  api/
    leaderboard.ts              → /api/leaderboard          (GET list + POST submit)
    leaderboard/
      check.ts                  → /api/leaderboard/check    (GET check)
```

### Frontend Files

- `src/api/leaderboard.ts` — API client (checkScore / submitScore / fetchLeaderboard)
- `src/components/LeaderboardPanel.vue` — Leaderboard panel component (mode tabs, ranking list, refresh)
- `src/App.vue` — Death flow: qualification check and score submission

### KV Storage Structure

KV key: `leaderboard:{mode}` (e.g. `leaderboard:classic`), value is JSON:

```json
{
  "records": [
    { "name": "PlayerName", "layer": 15, "mode": "classic", "characterId": "robot", "timestamp": 1700000000000 }
  ],
  "updatedAt": 1700000000000
}
```

## Settings Panel

Click "Settings" in the pause menu to open the settings panel. Currently supports:

- **Volume control**: Slider for background music volume (0–100%, default 70%)
- **Language toggle**: Dropdown to select 中文 / English, default Chinese. The choice is auto-saved to `localStorage` and remembered on next visit; first visit auto-detects from browser language

### i18n Implementation

- Translation string table and state management live in [src/composables/useI18n.ts](file:///d:/work/test/jump-robot/src/composables/useI18n.ts)
- Uses a module-level singleton `ref` — all components `import { useI18n }` share the same instance, no prop drilling needed
- Adding a translation is as simple as adding an entry to the `translations` object and referencing it with `tr('key')` in components
- Initial language detection order: `localStorage` → `navigator.language` → default `'zh'`

## Project Structure

```
lava-leap/
├── index.html                  # Vite entry HTML
├── package.json                # Dependencies and scripts
├── vite.config.ts              # Vite config
├── tsconfig.json               # TypeScript config
├── tsconfig.node.json
├── edge-functions/             # EdgeOne Edge Functions (leaderboard backend)
│   └── api/
│       ├── leaderboard.ts      # /api/leaderboard (GET list + POST submit)
│       └── leaderboard/
│           └── check.ts        # /api/leaderboard/check (GET check)
├── assets/                     # Game assets
│   └── bg-music.mp4            # Background music
├── models/                     # Character models
│   ├── RobotExpressive.glb     # Robot
│   ├── Man.glb                 # Casual man
│   ├── Man in Long Sleeves.glb # Long-sleeve man
│   ├── Man in Suit.glb         # Suit man
│   ├── Man-fjHyMd5Wxw.glb     # Sporty man
│   ├── Xbot.glb
│   └── miku.glb
├── src/
│   ├── main.ts                 # App mount entry
│   ├── App.vue                 # Top-level component (canvas + audio + child orchestration)
│   ├── styles.css              # Global styles
│   ├── shims.d.ts              # TS module declarations (.glb / .mp4, etc.)
│   ├── api/                    # API clients
│   │   └── leaderboard.ts      # Leaderboard API (checkScore / submitScore / fetchLeaderboard)
│   ├── game/                   # Engine layer (pure TS, no Vue dependency, independently reusable)
│   │   ├── constants.ts        # All constants + MC palette + first-person params
│   │   ├── types.ts            # Platform / InputKeys / GamePhase / CameraMode types
│   │   ├── characters.ts       # Playable character config (model URL / scale / action list)
│   │   ├── textures.ts         # Pixel texture generation
│   │   ├── PlatformSystem.ts   # Platform generation / management / landing detection / line-of-sight occlusion
│   │   ├── LavaSystem.ts       # Lava shader / rising / death detection
│   │   ├── modes/              # Game modes (Classic / Inferno)
│   │   │   ├── types.ts        # GameMode interface definition
│   │   │   ├── registry.ts     # Mode registry
│   │   │   ├── classic.mode.ts # Classic mode
│   │   │   └── inferno.mode.ts # Inferno mode
│   │   └── platforms/          # Platform generators
│   │       ├── types.ts        # Platform type & behavior definitions
│   │       └── generators/     # Classic generator / Mixed generator (moving + disappearing platforms)
│   ├── composables/            # Vue composables
│   │   ├── useGame.ts          # Main engine: scene / model / main loop / control API / character select flow
│   │   ├── useI18n.ts          # Internationalization (zh/en toggle + localStorage persistence)
│   │   ├── useKeyboardInput.ts # Keyboard + mouse input (PC)
│   │   └── useTouchInput.ts    # Touch input (mobile)
│   └── components/             # UI components
│       ├── StartOverlay.vue    # Start screen (mode selection)
│       ├── CharacterSelect.vue # Character select screen (3D preview + left/right switch)
│       ├── Hud.vue             # Layer display + controls hint
│       ├── EscMenu.vue         # Pause / death menu
│       ├── LeaderboardPanel.vue# Leaderboard panel (dual-mode tabs + ranking list)
│       ├── SettingsPanel.vue    # Settings panel
│       └── TouchControls.vue    # Mobile virtual joystick / buttons
├── LICENSE                     # Apache License 2.0
└── README.md
```

### Architecture Notes

- **`game/` (engine layer)**: Pure TypeScript, zero Vue dependency. All Three.js objects, physics, platforms, lava logic live here. Can be reused as a whole when integrating with other frameworks (R3F / TresJS) or building multi-mode extensions.
- **`composables/` (composition layer)**: Vue composables that wrap engine capabilities into reactive APIs. `useGame` is the main entry; `useKeyboardInput` / `useTouchInput` handle input.
- **`components/` (view layer)**: Vue SFCs, pure UI. Communicate with the composition layer via props / emits.

> Important design: Three.js objects are wrapped with `shallowRef` (to avoid the reactive system proxying Vector3, which would crash performance). Physics state that changes every frame (`velY` / `yaw` / `keys`) uses plain variables and does not enter the reactive system.

## Tech Stack

- [Vue](https://vuejs.org/) `^3.4.0` (`<script setup>` + Composition API)
- [Three.js](https://threejs.org/) `^0.160.0` (installed via npm, not CDN)
- [Vite](https://vitejs.dev/) `^5.0.0`
- [TypeScript](https://www.typescriptlang.org/) `^5.3.0`
- WebGLRenderer + PCFSoftShadowMap
- GLTFLoader for loading character model and animations
- ShaderMaterial applying the official Three.js `webgl_shader_lava` shader (with cloud / lavatile textures)
- HTML5 `<audio>` for background music playback

## Key Parameters

The core parameters in the game are defined in [src/game/constants.ts](file:///d:/work/test/jump-robot/src/game/constants.ts) and can be adjusted as needed:

| Parameter | Default | Description |
| --- | --- | --- |
| `LAYER_HEIGHT` | `3.0` | Height interval between platform layers |
| `PLATFORM_SIZE` | `5` | Platform edge length |
| `PLATFORM_THICK` | `0.5` | Platform thickness |
| `RANGE` | `8` | Horizontal random range for platforms |
| `PLATFORMS_PER_LAYER` | `4` | Number of platforms per layer |
| `MOVE_SPEED` | `8` | Player movement speed |
| `RUN_SPEED_MULTIPLIER` | `1.6` | Dash speed multiplier |
| `DASH_JUMP_MULTIPLIER` | `1.2` | Dash jump force multiplier |
| `GRAVITY` | `-25` | Gravity acceleration |
| `JUMP_POWER` | `13` | Normal jump force |
| `MOUSE_SENS` | `0.002` | Mouse / touch drag view rotation sensitivity |
| `CAM_DIST` | `9` | Third-person horizontal distance from camera to player |
| `CAM_HEIGHT` | `4` | Third-person camera height offset relative to player |
| `CAM_SMOOTH` | `0.12` | Third-person camera follow smoothing factor |
| `FP_CAMERA_HEIGHT` | `1.5` | First-person camera height relative to player feet |
| `PITCH_MIN` | `-π/3` | First-person minimum look-down angle (-60°) |
| `PITCH_MAX` | `π/3` | First-person maximum look-up angle (+60°) |
| `LAVA_SIZE` | `100` | Lava plane edge length |
| `LAVA_RISE_SPEED` | `0.8` | Lava rise speed per second |
| `LAVA_INITIAL_Y` | `-8` | Lava starting height (below layer 0) |
| `LAVA_DEATH_MARGIN` | `0.1` | Distance below lava surface that triggers death |
| `DEATH_DURATION` | `1.0` | Death animation duration (seconds) |
| `LAVA_UV_SCALE` | `{ x: 10, y: 10 }` | Tiling density of official lava texture on the plane |
| `LAVA_TIME_SCALE` | `1.0` | Overall flow speed scale of the official lava shader |
| `PIXEL_TEX_VARIANTS` | `4` | Number of pixel texture variants pre-generated per color segment |
| `MC_PALETTE` | see below | Minecraft-style palette (segmented by height) |

### `MC_PALETTE` Definition

```ts
export const MC_PALETTE: PaletteSeg[] = [
    { maxLayer: 6,  base: { r: 0x7c, g: 0xba, b: 0x34 }, name: 'grass' },
    { maxLayer: 14, base: { r: 0x86, g: 0x60, b: 0x43 }, name: 'dirt' },
    { maxLayer: 28, base: { r: 0x7d, g: 0x7d, b: 0x7d }, name: 'stone' },
    { maxLayer: 45, base: { r: 0x4a, g: 0x4a, b: 0x5a }, name: 'darkstone' },
    { maxLayer: Infinity, base: { r: 0xff, g: 0xff, b: 0xff }, name: 'snow' },
];
```

## License

This project is open-sourced under the [Apache License 2.0](file:///d:/work/test/jump-robot/LICENSE).
