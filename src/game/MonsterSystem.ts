import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type { Platform } from './types';

// ============== 怪物系统：加载模型 / 在平台上生成 Dino ==============

interface SpawnedDino {
    group: THREE.Group;
    platform: Platform;
    mixer: THREE.AnimationMixer;
    // 巡逻参数：沿平台边缘绕圈
    patrolHalf: number;     // 巡逻半宽（平台半宽 - 边距），0 表示不巡逻
    patrolT: number;        // 沿边缘周长走过的距离
    patrolDir: 1 | -1;
    patrolSpeed: number;
    // 状态：巡逻 / 追击 / 返回巡逻路线
    state: 'patrol' | 'chase' | 'returning';
    // 返回目标点（世界坐标）
    returnTargetX: number;
    returnTargetZ: number;
    // 巡逻动画（有走路动画时用）
    walkAction: THREE.AnimationAction | null;
    idleAction: THREE.AnimationAction | null;
}

// 刷新节奏：前期安全，之后受控随机——至少隔 1 个空层，最多连续空 3 层后必刷
const DINO_FIRST_SPAWN_LAYER = 3;
const DINO_FIRST_SPAWN_CHANCES: Record<number, number> = { 3: 0.15, 4: 0.4 };
const DINO_MIN_SPAWN_GAP = 2;
const DINO_MAX_SPAWN_GAP = 4;
const DINO_SPAWN_CHANCES_BY_GAP: Record<number, number> = { 2: 0.15, 3: 0.4 };
const DINO_MODEL_URL = '/models/Monsters/Dino.glb';
const DINO_PATROL_SPEED = 0.4;   // 巡逻速度（单位/秒）—— 缓慢悠闲
const DINO_PATROL_MARGIN = 1;  // 距平台边缘的保底距离（不贴边走）
const DINO_DETECT_RANGE = 20; // 同层时发现玩家的距离（覆盖大平台）
const DINO_CHASE_SPEED = 1.5; // 追击速度（单位/秒）
const DINO_RETURN_SPEED = 0.6; // 返回巡逻路线速度（单位/秒，略快于巡逻）

export class MonsterSystem {
    private readonly scene: THREE.Scene;
    private gltfScene: THREE.Group | null = null;   // 缓存的模板场景
    private gltfAnimations: THREE.AnimationClip[] = [];
    private loaded = false;
    private loading = false;
    private readonly dinos: SpawnedDino[] = [];
    private pendingSpawns: { layer: number; platforms: Platform[] }[] = [];
    private lastSpawnLayer = 0;
    private readonly loader = new GLTFLoader();

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    /** 预加载 Dino 模型（只加载一次，之后用 SkeletonUtils 克隆） */
    load(): void {
        if (this.loaded || this.loading) return;
        this.loading = true;

        this.loader.load(
            DINO_MODEL_URL,
            (gltf) => {
                this.gltfScene = gltf.scene;
                this.gltfAnimations = gltf.animations;
                this.loaded = true;
                this.loading = false;
                console.log('[MonsterSystem] Dino 模型预加载成功');

                for (const req of this.pendingSpawns) {
                    this._spawnDino(req.layer, req.platforms);
                }
                this.pendingSpawns.length = 0;
            },
            undefined,
            (error) => {
                console.error('[MonsterSystem] Dino 模型加载失败：', error);
                this.loading = false;
            },
        );
    }

    /** 当一层平台生成后调用，按受控随机节奏决定是否生成 Dino（跳过 layer 0） */
    trySpawnOnLayer(layer: number, platforms: Platform[]): void {
        if (layer <= 0) return;
        if (!this.loaded) {
            this.pendingSpawns.push({ layer, platforms });
            return;
        }
        this._spawnDino(layer, platforms);
    }

    /** 是否应该在当前层生成：保证前期安全，同时避免长期无怪或连续刷怪 */
    private shouldSpawnOnLayer(layer: number): boolean {
        if (layer < DINO_FIRST_SPAWN_LAYER) return false;

        const gap = layer - this.lastSpawnLayer;
        if (this.lastSpawnLayer === 0) {
            if (gap >= DINO_FIRST_SPAWN_LAYER + 2) return true;
            return Math.random() < (DINO_FIRST_SPAWN_CHANCES[gap] ?? 0);
        }

        if (gap < DINO_MIN_SPAWN_GAP) return false;
        if (gap >= DINO_MAX_SPAWN_GAP) return true;
        return Math.random() < (DINO_SPAWN_CHANCES_BY_GAP[gap] ?? 0);
    }

    /** 内部：克隆 Dino 实例并放置到平台上 */
    private _spawnDino(layer: number, platforms: Platform[]): void {
        if (!this.shouldSpawnOnLayer(layer)) return;
        if (!this.gltfScene) return;

        const layerPlatforms = platforms.filter(p => p.layer === layer);
        if (layerPlatforms.length === 0) return;

        // 优先站上稳定平台，避免地狱模式的怪物随消失平台一起提前退场
        const stablePlatforms = layerPlatforms.filter(p => p.type === 'normal');
        const candidates = stablePlatforms.length > 0 ? stablePlatforms : layerPlatforms;
        const platform = candidates[Math.floor(Math.random() * candidates.length)];
        this.lastSpawnLayer = layer;

        // SkeletonUtils 克隆：正确复制骨骼绑定（普通 clone 会导致蒙皮网格失效）
        const model = SkeletonUtils.clone(this.gltfScene) as THREE.Group;
        model.scale.set(0.5, 0.5, 0.5);

        const container = new THREE.Group();
        container.add(model);
        this.scene.add(container);
        container.updateMatrixWorld(true);

        // 动画（先创建 mixer 并 posing 一帧，让骨骼处于实际渲染姿态）
        const mixer = new THREE.AnimationMixer(model);
        let walkAction: THREE.AnimationAction | null = null;
        let idleAction: THREE.AnimationAction | null = null;
        if (this.gltfAnimations.length > 0) {
            const idleAnim = this.gltfAnimations.find((a: any) => /idle/i.test(a.name)) ?? this.gltfAnimations[0];
            const walkAnim = this.gltfAnimations.find((a: any) => /walk|run/i.test(a.name));
            idleAction = mixer.clipAction(idleAnim);
            idleAction.setEffectiveWeight(1);
            idleAction.play();
            if (walkAnim) {
                walkAction = mixer.clipAction(walkAnim);
                walkAction.setEffectiveWeight(0);
                walkAction.play();
            }
            mixer.update(0);
        }

        // 蒙皮感知的包围盒：先让 SkinnedMesh 按当前骨骼姿态重算包围盒，
        // 否则 geometry.boundingBox 是绑定姿势的原始数据，和实际渲染位置差很远
        model.traverse((child: any) => {
            if (child.isSkinnedMesh) {
                child.computeBoundingBox();
                child.computeBoundingSphere();
            }
            if (child.isMesh) {
                child.visible = true;
                child.castShadow = true;
                child.frustumCulled = false;
            }
        });

        // 按真实包围盒把模型居中、脚底对齐容器原点
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.x -= center.x;
        model.position.z -= center.z;
        model.position.y -= box.min.y;

        container.rotation.y = Math.random() * Math.PI * 2;
        container.visible = true;

        // 巡逻参数：沿平台边缘绕圈（初始位置随机），平台太小则原地待机
        const half = platform.size / 2 - DINO_PATROL_MARGIN;
        const canPatrol = half > 0.3;
        const perimeter = canPatrol ? 8 * half : 0;
        const startT = canPatrol ? Math.random() * perimeter : 0;
        const startPos = MonsterSystem._perimeterPos(half, startT);
        container.position.set(
            platform.x + startPos.x,
            platform.topY,
            platform.z + startPos.z,
        );

        this.dinos.push({
            group: container,
            platform,
            mixer,
            patrolHalf: canPatrol ? half : 0,
            patrolT: startT,
            patrolDir: Math.random() < 0.5 ? 1 : -1,
            patrolSpeed: DINO_PATROL_SPEED * (0.8 + Math.random() * 0.4),
            state: 'patrol',
            returnTargetX: 0,
            returnTargetZ: 0,
            walkAction,
            idleAction,
        });
        console.log(`[MonsterSystem] 第 ${layer} 层 Dino，box: min.y=${box.min.y.toFixed(2)}, 高度=${(box.max.y - box.min.y).toFixed(2)}，巡逻: ${canPatrol ? `边缘绕圈 ±${half.toFixed(1)}` : '关闭'}`);
    }

    /** 移除与指定平台关联的 Dino */
    removeByPlatform(platform: Platform): void {
        for (let i = this.dinos.length - 1; i >= 0; i--) {
            if (this.dinos[i].platform === platform) {
                this.scene.remove(this.dinos[i].group);
                this.dinos[i].mixer.stopAllAction();
                this.dinos.splice(i, 1);
            }
        }
    }

    /** 每帧更新：巡逻 / 追击 + 动画切换 */
    update(delta: number, playerX: number, playerY: number, playerZ: number, playerLayer: number): void {
        for (const d of this.dinos) {
            d.mixer.update(delta);

            // 同层距离检测 → 切换状态
            const dx = playerX - d.group.position.x;
            const dz = playerZ - d.group.position.z;
            const distXZ = Math.sqrt(dx * dx + dz * dz);
            const sameLayer = playerLayer === d.platform.layer;

            if ((d.state === 'patrol' || d.state === 'returning') && sameLayer && distXZ < DINO_DETECT_RANGE) {
                d.state = 'chase';
            } else if (d.state === 'chase' && (!sameLayer || distXZ > DINO_DETECT_RANGE * 1.4)) {
                // 追击结束 → 进入返回状态，目标是巡逻路径上最近的点
                if (d.patrolHalf > 0) {
                    const rx = d.group.position.x - d.platform.x;
                    const rz = d.group.position.z - d.platform.z;
                    d.patrolT = MonsterSystem._nearestT(d.patrolHalf, rx, rz);
                    const target = MonsterSystem._perimeterPos(d.patrolHalf, d.patrolT);
                    d.returnTargetX = d.platform.x + target.x;
                    d.returnTargetZ = d.platform.z + target.z;
                    d.state = 'returning';
                } else {
                    d.state = 'patrol';
                }
            }

            if (d.state === 'chase') {
                // 追击：朝玩家方向直线移动，但不离开所在平台
                const len = distXZ || 1;
                let newX = d.group.position.x + (dx / len) * DINO_CHASE_SPEED * delta;
                let newZ = d.group.position.z + (dz / len) * DINO_CHASE_SPEED * delta;

                // 平台边界约束（留 margin 防止走到边缘掉下去）
                const half = d.platform.size / 2 - DINO_PATROL_MARGIN;
                const minX = d.platform.x - half;
                const maxX = d.platform.x + half;
                const minZ = d.platform.z - half;
                const maxZ = d.platform.z + half;
                newX = Math.max(minX, Math.min(maxX, newX));
                newZ = Math.max(minZ, Math.min(maxZ, newZ));
                d.group.position.x = newX;
                d.group.position.z = newZ;

                // 朝向玩家
                const targetYaw = Math.atan2(dx, dz);
                let diff = targetYaw - d.group.rotation.y;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                d.group.rotation.y += diff * 0.2;

                // 走路动画
                if (d.walkAction && d.idleAction) {
                    d.walkAction.setEffectiveWeight(1);
                    d.idleAction.setEffectiveWeight(0);
                }
            } else if (d.state === 'returning') {
                // 缓慢走回巡逻路线目标点
                const rdx = d.returnTargetX - d.group.position.x;
                const rdz = d.returnTargetZ - d.group.position.z;
                const rDist = Math.sqrt(rdx * rdx + rdz * rdz);

                if (rDist < 0.3) {
                    // 到达目标点，恢复巡逻
                    d.state = 'patrol';
                } else {
                    const rLen = rDist || 1;
                    d.group.position.x += (rdx / rLen) * DINO_RETURN_SPEED * delta;
                    d.group.position.z += (rdz / rLen) * DINO_RETURN_SPEED * delta;

                    // 朝向移动方向
                    const targetYaw = Math.atan2(rdx, rdz);
                    let diff = targetYaw - d.group.rotation.y;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    d.group.rotation.y += diff * 0.15;

                    // 走路动画
                    if (d.walkAction && d.idleAction) {
                        d.walkAction.setEffectiveWeight(1);
                        d.idleAction.setEffectiveWeight(0);
                    }
                }
            } else if (d.patrolHalf > 0) {
                // 巡逻：沿平台边缘绕圈（缓慢）
                const per = 8 * d.patrolHalf;
                d.patrolT = (d.patrolT + d.patrolDir * d.patrolSpeed * delta + per) % per;

                const pos = MonsterSystem._perimeterPos(d.patrolHalf, d.patrolT);
                const aheadT = (d.patrolT + d.patrolDir * 0.5 + per) % per;
                const ahead = MonsterSystem._perimeterPos(d.patrolHalf, aheadT);

                // 朝向移动方向（模型默认面朝 +z）
                const targetYaw = Math.atan2(ahead.x - pos.x, ahead.z - pos.z);
                let diff = targetYaw - d.group.rotation.y;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                d.group.rotation.y += diff * 0.15;

                // 走路动画
                if (d.walkAction && d.idleAction) {
                    d.walkAction.setEffectiveWeight(1);
                    d.idleAction.setEffectiveWeight(0);
                }

                d.group.position.x = d.platform.x + pos.x;
                d.group.position.z = d.platform.z + pos.z;
            } else {
                // 平台太小不巡逻：原地待机
                if (d.walkAction && d.idleAction) {
                    d.walkAction.setEffectiveWeight(0);
                    d.idleAction.setEffectiveWeight(1);
                }
                d.group.position.x = d.platform.x;
                d.group.position.z = d.platform.z;
            }
            d.group.position.y = d.platform.topY;
        }
    }

    /** 沿正方形边缘（半宽 half）按弧长 t 取位置，方向：前边 → 右边 → 后边 → 左边 */
    private static _perimeterPos(half: number, t: number): { x: number; z: number } {
        const side = 2 * half;
        const s = ((t % (4 * side)) + 4 * side) % (4 * side);
        if (s < side) return { x: -half + s, z: -half };
        if (s < 2 * side) return { x: half, z: -half + (s - side) };
        if (s < 3 * side) return { x: half - (s - 2 * side), z: half };
        return { x: -half, z: half - (s - 3 * side) };
    }

    /** 把怪物当前位置投影到巡逻正方形边缘，返回最近的弧长 t */
    private static _nearestT(half: number, rx: number, rz: number): number {
        const side = 2 * half;
        const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
        let best = Infinity;
        let bestT = 0;

        // 四条边各段弧长区间
        const edges: { lo: number; cx: number; cz: number; clampX: boolean }[] = [
            { lo: 0,          cx: 0,            cz: -half, clampX: true  },
            { lo: side,       cx: half,         cz: 0,     clampX: false },
            { lo: 2 * side,   cx: 0,            cz: half,  clampX: true  },
            { lo: 3 * side,   cx: -half,        cz: 0,     clampX: false },
        ];
        for (const e of edges) {
            const proj = e.clampX ? clamp(rx, -half, half) : half;
            const projZ = e.clampX ? (e.cz as number) : clamp(rz, -half, half);
            const dx = rx - (e.clampX ? proj : e.cx);
            const dz = rz - (e.clampX ? e.cz : projZ);
            const d2 = dx * dx + dz * dz;
            if (d2 < best) {
                best = d2;
                bestT = e.lo + (e.clampX ? (proj + half) : (projZ + half));
            }
        }
        return bestT;
    }

    /** 碰撞检测：玩家是否碰到任何 Dino */
    checkCollision(playerX: number, playerY: number, playerZ: number, radius: number = 1.0): boolean {
        for (const d of this.dinos) {
            const dx = playerX - d.group.position.x;
            const dy = playerY - d.group.position.y;
            const dz = playerZ - d.group.position.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist < radius) return true;
        }
        return false;
    }

    /** 清除所有 Dino */
    clear(): void {
        for (const d of this.dinos) {
            this.scene.remove(d.group);
            d.mixer.stopAllAction();
        }
        this.dinos.length = 0;
        this.pendingSpawns.length = 0;
        this.lastSpawnLayer = 0;
    }

    dispose(): void {
        this.clear();
        this.gltfScene = null;
        this.gltfAnimations = [];
    }
}
