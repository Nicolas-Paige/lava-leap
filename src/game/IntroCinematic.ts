import * as THREE from 'three';
import type { PlatformSystem } from './PlatformSystem';
import type { LavaSystem } from './LavaSystem';
import type { MonsterSystem } from './MonsterSystem';
import type { GameMode } from './modes/types';

// ============== 开场 CG（引擎层）==============
// 只负责「搭景 + 相机轨迹 + 进度状态」，黑边 / 字幕 / 标题等 UI 交给 Vue 组件。
// 流程上是「选好角色 → 播 CG → 进入游戏」，所以 CG 里的主角就是玩家选中的那个。
// 五幕：岩浆特写 → 后撤上升 → 螺旋攀升 → 拉远展现全塔 → 俯冲落地主角登场。约 9.3s，可跳过。

// 幕间用「上一幕的终点 = 下一幕的起点」保证运镜连续，切换处不会有跳切。
interface CameraKey {
    theta: number;   // 绕塔心的极角（弧度）
    radius: number;  // 到塔心的水平距离
    y: number;       // 相机高度
    lookY: number;   // 注视点高度（注视点恒在塔心轴上：x=z=0）
}

interface Shot {
    name: string;
    duration: number;
    from: CameraKey;
    to: CameraKey;
    ease: (t: number) => number;
    subtitle: number;   // 本幕字幕索引，-1 表示无字幕
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

// 相机半径取值依据（实测，勿凭直觉改）：
// 平台按 ±range 逐轴 clamp 而非径向，所以角落方向的外扩远大于直觉值
// ——实测 24 层塔身里平台 AABB 的最大水平外扩为 16.84（离塔心）。
// 相机若在 45° 角落方向，径向 r 对应的 x=z=0.707r 必须比它再大 3 才不穿模。
// 因此低空段（第 0~3 层高度）不能沿用「贴着塔身」的小半径：新增 pullback 幕
// 让相机在爬升前先把半径拉到 26。当前参数 6 轮随机实测全程最小间距 5.14。
// 末幕终点角取 3π/2：相机正好落在 -z 方向，即游戏初始第三人称机位（0,3,-6）的同侧，
// CG 结束后交给跟随相机平滑推近即可，不会绕圈。
const HERO_END_THETA = Math.PI * 1.5;
const SHOTS: Shot[] = [
    {
        // 1. 岩浆特写：贴着岩浆面（y=-8）推近并横移，岩浆占画面下半，塔基与主角在上方
        name: 'lava',
        duration: 2.2,
        from: { theta: -0.45, radius: 22, y: -6.4, lookY: 0.8 },
        to: { theta: 0.50, radius: 19, y: -3.0, lookY: 5.0 },
        ease: easeInOut,
        subtitle: 0,
    },
    {
        // 2. 后撤上升：先拉开距离再爬升，避免低空段擦到第 1~3 层的平台
        name: 'pullback',
        duration: 1.0,
        from: { theta: 0.50, radius: 19, y: -3.0, lookY: 5.0 },
        to: { theta: 0.95, radius: 26, y: 14, lookY: 16 },
        ease: easeInOut,
        subtitle: -1,
    },
    {
        // 3. 螺旋攀升：绕塔上升约 1.1 圈，高度到 50（约 17 层），塔身螺旋结构依次掠过
        name: 'climb',
        duration: 2.6,
        from: { theta: 0.95, radius: 26, y: 14, lookY: 16 },
        to: { theta: 2.90, radius: 23, y: 50, lookY: 52 },
        ease: easeInOut,
        subtitle: 1,
    },
    {
        // 4. 拉远展现：边升边退，视线下压到塔身中段，全塔与远处岩浆尽收眼底
        name: 'reveal',
        duration: 1.5,
        from: { theta: 2.90, radius: 23, y: 50, lookY: 52 },
        to: { theta: 3.40, radius: 34, y: 62, lookY: 32 },
        ease: easeOut,
        subtitle: 2,
    },
    {
        // 5. 俯冲落地 + 主角登场：从塔顶俯冲回起始平台，主角与脚下岩浆同框，标题浮现
        name: 'hero',
        duration: 2.0,
        from: { theta: 3.40, radius: 34, y: 62, lookY: 32 },
        to: { theta: HERO_END_THETA, radius: 18, y: 6.5, lookY: 1.8 },
        ease: easeInOut,
        subtitle: -1,
    },
];

const TOTAL_DURATION = SHOTS.reduce((sum, s) => sum + s.duration, 0);
const FADE_IN = 0.7;    // 开场的黑场淡入时长
const FADE_OUT = 0.8;   // 结尾的黑场淡出时长（跳过时也会走完这段，避免硬切）
// 标题在末幕（主角登场）开始时浮现（尾段 0.8s 用于黑场淡出）
const TITLE_AT = TOTAL_DURATION - 2.0;

// CG 期间岩浆的上升速度：约为正常速度（0.8）的一半，
// 既有「追上来」的压迫感，又不会在 9.3s 内淹掉 y=0 的起始平台（结束时约 -3.8）。
const INTRO_LAVA_RISE_SPEED = 0.45;

// 预览塔身层数：CG 结束后会被 confirmCharacter 清空并按正式流程重建，不影响游戏
const PREVIEW_LAYERS = 24;
const PREVIEW_LAYERS_TOUCH = 14;

export interface IntroState {
    progress: number;      // 0~1
    subtitle: number;      // 当前字幕索引，-1 为无
    titleVisible: boolean;
    fade: number;          // 黑场不透明度，1 为全黑
}

export class IntroCinematic {
    readonly state: IntroState = { progress: 0, subtitle: -1, titleVisible: false, fade: 1 };

    private elapsed = 0;
    private finished = false;
    private fogBackup: { near: number; far: number } | null = null;
    private readonly lookTarget = new THREE.Vector3();

    constructor(
        private readonly scene: THREE.Scene,
        private readonly camera: THREE.PerspectiveCamera,
        private readonly platforms: PlatformSystem,
        private readonly lava: LavaSystem,
        private readonly monsters: MonsterSystem | null,
        private readonly isTouchDevice = false,
    ) { }

    /** 搭景并回到第 0 帧。mode 决定生成器 / 层高 / 岩浆初始高度 */
    start(mode: GameMode): void {
        this.elapsed = 0;
        this.finished = false;
        this.state.progress = 0;
        this.state.fade = 1;

        // 雾：拉远幕需要看清全塔，放宽远裁剪面（结束后恢复）
        if (this.scene.fog instanceof THREE.Fog) {
            this.fogBackup = { near: this.scene.fog.near, far: this.scene.fog.far };
            this.scene.fog.near = 45;
            this.scene.fog.far = 260;
        }

        // 预览用塔身（正式开局时会被 clear 重建）
        if (this.platforms) {
            this.platforms.clear();
            this.monsters?.clear();
            this.platforms.setGenerator(mode.createGenerator(), mode);
            this.platforms.generateUpTo(this.isTouchDevice ? PREVIEW_LAYERS_TOUCH : PREVIEW_LAYERS);
        }

        // 岩浆：可见 + 缓慢上升（shader 时间在 update 里推进）
        this.lava?.reset(mode.lava.initialY, INTRO_LAVA_RISE_SPEED);
        this.lava?.setEnabled(true);

        this.applyCamera(0);
    }

    /** 推进一帧；返回 true 表示 CG 结束 */
    update(delta: number): boolean {
        if (this.finished) return true;

        this.elapsed += delta;
        if (this.elapsed > TOTAL_DURATION) this.elapsed = TOTAL_DURATION;

        // 场景继续活着：移动平台摆动、恐龙巡逻、岩浆翻涌
        this.platforms?.update(delta);
        // 传一个远在天边的玩家坐标，恐龙只会巡逻不会进入追击
        this.monsters?.update(delta, 0, -100, 0, -1);
        this.lava?.update(delta);

        this.applyCamera(this.elapsed);
        this.updateState();

        if (this.elapsed >= TOTAL_DURATION) {
            this.finished = true;
            return true;
        }
        return false;
    }

    /** 跳过：快进到尾段淡出，保留一个顺滑的收尾而不是硬切 */
    skip(): void {
        if (this.finished) return;
        const tail = TOTAL_DURATION - FADE_OUT;
        if (this.elapsed < tail) this.elapsed = tail;
    }

    /** 恢复被临时改动的场景参数（平台/岩浆由 confirmCharacter 接管清理） */
    dispose(): void {
        if (this.fogBackup && this.scene.fog instanceof THREE.Fog) {
            this.scene.fog.near = this.fogBackup.near;
            this.scene.fog.far = this.fogBackup.far;
        }
        this.fogBackup = null;
        this.finished = true;
    }

    // ---------- 内部 ----------

    private applyCamera(time: number): void {
        let acc = 0;
        let shot = SHOTS[SHOTS.length - 1];
        let local = 1;
        for (const s of SHOTS) {
            if (time < acc + s.duration) {
                shot = s;
                local = s.duration > 0 ? (time - acc) / s.duration : 1;
                break;
            }
            acc += s.duration;
        }
        if (time >= TOTAL_DURATION) {
            shot = SHOTS[SHOTS.length - 1];
            local = 1;
        }

        const e = shot.ease(Math.max(0, Math.min(1, local)));
        const theta = shot.from.theta + (shot.to.theta - shot.from.theta) * e;
        const radius = shot.from.radius + (shot.to.radius - shot.from.radius) * e;
        const y = shot.from.y + (shot.to.y - shot.from.y) * e;
        const lookY = shot.from.lookY + (shot.to.lookY - shot.from.lookY) * e;

        this.camera.position.set(Math.cos(theta) * radius, y, Math.sin(theta) * radius);
        this.lookTarget.set(0, lookY, 0);
        this.camera.lookAt(this.lookTarget);
    }

    private updateState(): void {
        const t = this.elapsed;
        this.state.progress = t / TOTAL_DURATION;
        this.state.titleVisible = t >= TITLE_AT;

        // 黑场：开场淡入、结尾淡出
        let fade = 0;
        if (t < FADE_IN) fade = 1 - t / FADE_IN;
        else if (t > TOTAL_DURATION - FADE_OUT) fade = (t - (TOTAL_DURATION - FADE_OUT)) / FADE_OUT;
        this.state.fade = Math.max(0, Math.min(1, fade));

        // 字幕：按幕取
        let acc = 0;
        let idx = -1;
        for (const s of SHOTS) {
            if (t < acc + s.duration) { idx = s.subtitle; break; }
            acc += s.duration;
        }
        this.state.subtitle = idx;
    }
}
