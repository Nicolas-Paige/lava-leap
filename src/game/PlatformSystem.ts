import * as THREE from 'three';
import { PLATFORM_THICK } from './constants';
import { getLayerTexture } from './textures';
import type { Platform } from './types';
import type { PlatformPlacement, PlatformType } from './platforms/types';
import type { PlatformGenerator, GameModeConfig } from './modes/types';

// ============== 平台系统：生成 / 管理 / 清理 ==============

// 不同平台类型的视觉颜色（叠在纹理上，仅 normal 类型不染色）
const TYPE_COLOR_TINT: Record<PlatformType, number | null> = {
    normal: null,           // 用纹理原色
    moving: 0x4a90e2,       // 蓝色（标识移动）
    disappearing: 0xff8c42, // 橙色（标识即将消失）
    bouncy: 0x6dff8e,       // 绿色（弹簧）
    fragile: 0xff6b6b,      // 红色（易碎）
    ice: 0xa0e8ff,          // 冰蓝
    conveyor: 0xffd166,     // 黄色（传送带）
};

// 破碎碎片
interface Shard {
    mesh: THREE.Mesh;
    vel: THREE.Vector3;    // 线速度
    angVel: THREE.Vector3; // 角速度
    life: number;          // 剩余生命（秒）
    maxLife: number;
}

// 破碎碎片共享几何体（边长 0.6 的小方块）
const SHARD_GEO = new THREE.BoxGeometry(0.6, 0.6, 0.6);

export class PlatformSystem {
    readonly platforms: Platform[] = [];
    private readonly scene: THREE.Scene;
    private readonly platformGeo: THREE.BoxGeometry;
    private highestGeneratedLayer = 0;
    private generator: PlatformGenerator | null = null;
    private modeConfig: GameModeConfig | null = null;
    private readonly shards: Shard[] = [];
    private onPlatformRemoved: ((platform: Platform) => void) | null = null;
    private onLayerGenerated: ((layer: number) => void) | null = null;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.platformGeo = new THREE.BoxGeometry(5, PLATFORM_THICK, 5);  // 默认大小，运行时按 size 单独创建
    }

    // 设置生成器与模式配置（开始游戏前调用）
    setGenerator(gen: PlatformGenerator, config: GameModeConfig): void {
        this.generator = gen;
        this.modeConfig = config;
    }

    // 设置平台移除回调（供外部系统清理关联对象）
    setOnPlatformRemoved(cb: (platform: Platform) => void): void {
        this.onPlatformRemoved = cb;
    }

    // 设置新层生成回调（供外部系统在新层上放置内容）
    setOnLayerGenerated(cb: (layer: number) => void): void {
        this.onLayerGenerated = cb;
    }

    // 创建单个平台（从 Placement 数据）
    private createPlatform(placement: PlatformPlacement): Platform {
        const { layer, x, z, size, type, behavior } = placement;

        // 按 size 单独创建几何体（避免影响默认 geo 的引用计数）
        const useGeo = new THREE.BoxGeometry(size, PLATFORM_THICK, size);

        const tex = getLayerTexture(layer);
        const repeat = Math.max(1, Math.round(size / 1.5));
        tex.repeat.set(repeat, repeat);

        const tint = TYPE_COLOR_TINT[type];
        const mat = new THREE.MeshLambertMaterial({
            map: tint === null ? tex : tex.clone(),
            color: tint === null ? 0xffffff : tint,
            transparent: true,
            opacity: 1.0,
        });
        // 染色类型用 clone 的纹理，避免和 normal 平台共享 repeat
        if (tint !== null && mat.map) {
            mat.map.repeat.set(repeat, repeat);
        }

        const mesh = new THREE.Mesh(useGeo, mat);
        const topY = layer * (this.modeConfig?.layerHeight ?? 3.0);
        mesh.position.set(x, topY - PLATFORM_THICK / 2, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);

        const half = size / 2;
        const p: Platform = {
            mesh, material: mat,
            x, z,
            baseX: x, baseZ: z, baseY: topY,
            layer, size, topY,
            minX: x - half, maxX: x + half,
            minZ: z - half, maxZ: z + half,
            type,
            behavior,
            disappearTimer: 0,
            spawned: true,
        };
        this.platforms.push(p);
        return p;
    }

    // 生成一整层平台（委托给 generator）
    generateLayer(layer: number): void {
        // 第 0 层永远是大的起始平台
        if (layer === 0) {
            this.createPlatform({
                layer: 0, x: 0, z: 0, size: 50, type: 'normal',
            });
            return;
        }

        if (!this.generator || !this.modeConfig) {
            // fallback：用旧逻辑（避免破坏）
            this.generateLayerLegacy(layer);
            return;
        }

        const placements = this.generator.generate(layer, this.modeConfig);
        for (const placement of placements) {
            this.createPlatform(placement);
        }
    }

    // 旧版生成逻辑（generator 未设置时用）
    private generateLayerLegacy(layer: number): void {
        const PLATFORM_SIZE = 5;
        const PLATFORMS_PER_LAYER = 4;
        const RANGE = 8;
        const minGap = 1.5;
        const placed: { x: number; z: number }[] = [];
        let attempts = 0;
        while (placed.length < PLATFORMS_PER_LAYER && attempts < 30) {
            const x = (Math.random() * 2 - 1) * RANGE;
            const z = (Math.random() * 2 - 1) * RANGE;
            let ok = true;
            for (const q of placed) {
                const dx = Math.abs(x - q.x);
                const dz = Math.abs(z - q.z);
                if (dx < PLATFORM_SIZE + minGap && dz < PLATFORM_SIZE + minGap) {
                    ok = false;
                    break;
                }
            }
            if (ok) {
                this.createPlatform({ layer, x, z, size: PLATFORM_SIZE, type: 'normal' });
                placed.push({ x, z });
            }
            attempts++;
        }
        while (placed.length < PLATFORMS_PER_LAYER) {
            const x = (Math.random() * 2 - 1) * RANGE;
            const z = (Math.random() * 2 - 1) * RANGE;
            this.createPlatform({ layer, x, z, size: PLATFORM_SIZE, type: 'normal' });
            placed.push({ x, z });
        }
    }

    // 初始化 0~5 层（与动态生成共用内容刷新回调）
    initInitialLayers(): void {
        for (let l = 0; l <= 5; l++) {
            this.generateLayer(l);
            this.highestGeneratedLayer = l;
            if (l > 0) this.onLayerGenerated?.(l);
        }
    }

    // 每帧更新：移动平台 / 消失倒计时 / AABB 同步 / 破碎碎片
    update(delta: number): void {
        for (const p of this.platforms) {
            if (p.type === 'moving' && p.behavior) {
                // 移动平台：沿指定轴正弦往返
                const phase = p.behavior.movePhase ?? 0;
                const speed = p.behavior.moveSpeed ?? 1.0;
                const range = p.behavior.moveRange ?? 3;
                const offset = Math.sin(phase + performance.now() * 0.001 * speed) * range;

                const half = p.size / 2;
                if (p.behavior.moveAxis === 'x') {
                    p.x = p.baseX + offset;
                    p.mesh.position.x = p.x;
                    p.minX = p.x - half; p.maxX = p.x + half;
                } else if (p.behavior.moveAxis === 'z') {
                    p.z = p.baseZ + offset;
                    p.mesh.position.z = p.z;
                    p.minZ = p.z - half; p.maxZ = p.z + half;
                } else if (p.behavior.moveAxis === 'y') {
                    // y 轴移动：以 baseY 为振动中心，避免 offset 累积漂移
                    const newY = p.baseY + offset;
                    p.topY = newY;
                    p.mesh.position.y = newY - PLATFORM_THICK / 2;
                }
            }

            // 消失平台倒计时
            if (p.disappearTimer > 0) {
                p.disappearTimer -= delta;
                // 后半段开始闪烁预警
                const fadeStart = p.behavior?.lifespan ?? 3.0;
                const ratio = Math.max(0, p.disappearTimer / fadeStart);
                if (ratio < 0.5) {
                    // 闪烁频率随时间加快
                    const blinkSpeed = 10 + (0.5 - ratio) * 30;
                    const blink = 0.5 + 0.5 * Math.sin(performance.now() * 0.001 * blinkSpeed);
                    p.material.opacity = 0.3 + 0.7 * blink * ratio * 2;
                } else {
                    // 前半段用 lerp 平滑过渡到 1.0，避免被踩上瞬间从视线遮挡值突变
                    p.material.opacity += (1.0 - p.material.opacity) * 0.2;
                }

                if (p.disappearTimer <= 0) {
                    // 触发破碎动画而非直接移除
                    this.shatter(p);
                    this.removePlatform(p);
                }
            }
        }

        // 更新碎片
        this.updateShards(delta);
    }

    // 移除单个平台
    removePlatform(p: Platform): void {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        if (p.material.map) p.material.map.dispose();
        p.material.dispose();
        const idx = this.platforms.indexOf(p);
        if (idx >= 0) this.platforms.splice(idx, 1);
        this.onPlatformRemoved?.(p);
    }

    // 破碎动画：把平台拆成 8 个小方块向四周飞散
    private shatter(p: Platform): void {
        const cx = p.x;
        const cy = p.topY;
        const cz = p.z;
        const half = p.size / 2;
        // 2x2x2 = 8 个小方块
        const positions: [number, number, number][] = [
            [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
            [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1],
        ];
        const tint = TYPE_COLOR_TINT[p.type] ?? 0xff8c42;
        const maxLife = 1.0;  // 碎片寿命 1 秒

        for (const [ox, oy, oz] of positions) {
            const mat = new THREE.MeshLambertMaterial({
                color: tint === null ? 0xff8c42 : tint,
                transparent: true,
                opacity: 1.0,
            });
            const mesh = new THREE.Mesh(SHARD_GEO, mat);
            // 位置：平台表面 + 偏移
            mesh.position.set(
                cx + ox * half * 0.5,
                cy + oy * 0.3,
                cz + oz * half * 0.5,
            );
            mesh.castShadow = true;
            this.scene.add(mesh);

            // 初速度：向外 + 向上 + 随机扰动
            const dir = new THREE.Vector3(
                ox * 2 + (Math.random() - 0.5),
                oy * 0.5 + 2 + Math.random() * 2,
                oz * 2 + (Math.random() - 0.5),
            ).normalize();
            const speed = 3 + Math.random() * 3;
            const vel = dir.multiplyScalar(speed);
            const angVel = new THREE.Vector3(
                (Math.random() - 0.5) * 10,
                (Math.random() - 0.5) * 10,
                (Math.random() - 0.5) * 10,
            );

            this.shards.push({ mesh, vel, angVel, life: maxLife, maxLife });
        }
    }

    // 每帧更新碎片：重力下落 + 旋转 + 淡出
    private updateShards(delta: number): void {
        for (let i = this.shards.length - 1; i >= 0; i--) {
            const s = this.shards[i];
            s.life -= delta;
            if (s.life <= 0) {
                this.scene.remove(s.mesh);
                (s.mesh.material as THREE.Material).dispose();
                this.shards.splice(i, 1);
                continue;
            }
            // 重力
            s.vel.y -= 20 * delta;
            // 位置
            s.mesh.position.x += s.vel.x * delta;
            s.mesh.position.y += s.vel.y * delta;
            s.mesh.position.z += s.vel.z * delta;
            // 旋转
            s.mesh.rotation.x += s.angVel.x * delta;
            s.mesh.rotation.y += s.angVel.y * delta;
            s.mesh.rotation.z += s.angVel.z * delta;
            // 末段淡出
            const mat = s.mesh.material as THREE.MeshLambertMaterial;
            if (s.life < s.maxLife * 0.4) {
                mat.opacity = s.life / (s.maxLife * 0.4);
            }
        }
    }

    // 清空所有碎片
    private clearShards(): void {
        for (const s of this.shards) {
            this.scene.remove(s.mesh);
            (s.mesh.material as THREE.Material).dispose();
        }
        this.shards.length = 0;
    }

    // 玩家附近动态生成 / 远处平台清理
    manage(playerY: number): void {
        const layerHeight = this.modeConfig?.layerHeight ?? 3.0;
        const platformsPerLayer = this.modeConfig?.platformsPerLayer ?? 4;
        const playerLayerApprox = Math.round(playerY / layerHeight);

        while (this.highestGeneratedLayer < playerLayerApprox + 12) {
            this.highestGeneratedLayer++;
            this.generateLayer(this.highestGeneratedLayer);
            this.onLayerGenerated?.(this.highestGeneratedLayer);
        }

        const minKeepLayer = playerLayerApprox - 10;
        for (let i = this.platforms.length - 1; i >= 0; i--) {
            const p = this.platforms[i];
            if (p.layer < minKeepLayer && p.layer !== 0) {
                this.removePlatform(p);
            }
        }
        void platformsPerLayer;  // 保留引用以便未来扩展
    }

    // 清除所有平台（重启用）
    clear(): void {
        for (const p of this.platforms) {
            this.scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            if (p.material.map) p.material.map.dispose();
            p.material.dispose();
        }
        this.platforms.length = 0;
        this.highestGeneratedLayer = 0;
        this.clearShards();
    }

    // 落地检测：穿越法 + 绝对位置法（兼容 y 轴移动平台）
    tryLanding(prevFootY: number, newFootY: number, px: number, pz: number): Platform | null {
        let best: Platform | null = null;
        for (const p of this.platforms) {
            const xHit = px >= p.minX - 0.3 && px <= p.maxX + 0.3;
            const zHit = pz >= p.minZ - 0.3 && pz <= p.maxZ + 0.3;
            if (!xHit || !zHit) continue;

            // 方法1：穿越法（玩家脚从上方穿过到下方）
            if (prevFootY >= p.topY - 0.01 && newFootY <= p.topY + 0.01) {
                if (!best || p.topY > best.topY) best = p;
                continue;
            }
            // 方法2：绝对位置法（y 轴移动平台——玩家脚在平台 topY 附近，且平台向上移动接近玩家）
            const distToSurface = newFootY - p.topY;
            if (distToSurface > -0.6 && distToSurface < 0.01) {
                if (!best || p.topY > best.topY) best = p;
            }
        }
        return best;
    }

    // 视线遮挡：相机与玩家之间的平台变透明
    updateOpacity(camPos: THREE.Vector3, playerPos: THREE.Vector3): void {
        const viewDir = playerPos.clone().sub(camPos);
        const viewLen = viewDir.length();
        viewDir.normalize();

        for (const p of this.platforms) {
            if (p.layer === 0) {
                p.material.opacity = 1.0;
                continue;
            }
            // 已在消失倒计时的平台不改 opacity（让消失闪烁动画自然过渡）
            if (p.disappearTimer > 0) continue;

            // 计算目标透明度（普通平台全透明，染色平台保留下限避免看不见）
            let targetOpacity = this.computeOpacity(p, camPos, viewDir, viewLen);
            if (p.type !== 'normal') {
                targetOpacity = Math.max(0.6, targetOpacity);  // 染色平台最低 0.6
            }
            // lerp 平滑过渡
            p.material.opacity += (targetOpacity - p.material.opacity) * 0.2;
        }
    }

    // 计算单个平台的目标透明度（基于相机视线遮挡）
    private computeOpacity(p: Platform, camPos: THREE.Vector3, viewDir: THREE.Vector3, viewLen: number): number {
        const platCenter = new THREE.Vector3(p.x, p.topY, p.z);
        const toPlat = platCenter.clone().sub(camPos);
        const proj = toPlat.dot(viewDir);
        if (proj > 0 && proj < viewLen) {
            const closest = camPos.clone().add(viewDir.clone().multiplyScalar(proj));
            const dist = platCenter.distanceTo(closest);
            if (dist < 3) return 0.25;
            if (dist < 5) return 0.5;
        }
        return 1.0;
    }

    dispose(): void {
        this.clear();
        this.platformGeo.dispose();
    }
}
