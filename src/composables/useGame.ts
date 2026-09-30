import { ref, shallowRef, onUnmounted, type Ref } from 'vue';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
    MOUSE_SENS, DASH_JUMP_MULTIPLIER,
    CAM_DIST, CAM_HEIGHT, CAM_SMOOTH,
    FP_CAMERA_HEIGHT, PITCH_MIN, PITCH_MAX,
    DEATH_DURATION,
} from '../game/constants';
import { PlatformSystem } from '../game/PlatformSystem';
import { LavaSystem } from '../game/LavaSystem';
import { MonsterSystem } from '../game/MonsterSystem';
import { IntroCinematic, type IntroState } from '../game/IntroCinematic';
import { disposePixelTextures } from '../game/textures';
import type { GamePhase, InputKeys, DeathMaterialRecord, CameraMode } from '../game/types';
import type { GameMode } from '../game/modes/types';
import { DEFAULT_MODE } from '../game/modes/registry';
import { getCharacterById, DEFAULT_CHARACTER_ID, CHARACTERS, type Character } from '../game/characters';

// 触控设备检测（模块级常量，避免重复计算）
export const IS_TOUCH_DEVICE =
    typeof navigator !== 'undefined' &&
    (('ontouchstart' in window) || navigator.maxTouchPoints > 0);

// 步频上限（步/秒）：倍率再高动画就变成快进了，宁可留一点滑步。
// 5.5/6.0 时腿动明显偏快（真人走路约 2、慢跑 3~4），随移速 7→6 一起下调到 4.0/4.6。
const MAX_WALK_STEP_RATE = 4.0;
const MAX_RUN_STEP_RATE = 4.6;
// 死亡动画完整播一遍的目标时长（秒）：据此反推播放倍率，既不拖节奏也不会被截断
const DEATH_ANIM_TARGET = 1.8;
// 死亡动画的起播位置（占动画时长比例）：mixamo 类动作前段多为"站着踉跄"，
// 真正的倒地发生在后半段，从中段起播才能一死亡就看到倒地
const DEATH_START_RATIO = 0.45;
// 死亡下沉开始时机（占死亡总时长比例）：倒地动作完成后才沉入岩浆
const DEATH_SINK_START_RATIO = 0.75;
// 贴地曲线采样点数（沿死亡动画均匀采样）
const DEATH_CURVE_SAMPLES = 13;

export interface UseGameOptions {
    canvas: Ref<HTMLCanvasElement | null>;
    bgMusic: Ref<HTMLAudioElement | null>;
}

export function useGame(options: UseGameOptions) {
    // ===== 响应式 UI 状态 =====
    const phase = ref<GamePhase>('idle');
    const currentLayer = ref(0);    // 最高到达层（只增不减，用于进度 UI）
    const playerCurrentLayer = ref(0); // 玩法实际所在层（怪物追击用）
    const bestLayer = ref(0);
    const volume = ref(30);
    const loadingProgress = ref(0);
    const loadError = ref<string | null>(null);
    const characterIndex = ref(0);  // 当前选中角色索引（响应式，给UI用）
    // 开场 CG 状态（每帧由 IntroCinematic 写入，供 overlay 渲染字幕/黑场/标题）
    const introState = ref<IntroState>({ progress: 0, subtitle: -1, titleVisible: false, fade: 1 });

    // ===== Three.js 对象（shallowRef 避免响应式包装） =====
    const scene = shallowRef<THREE.Scene | null>(null);
    const camera = shallowRef<THREE.PerspectiveCamera | null>(null);
    const renderer = shallowRef<THREE.WebGLRenderer | null>(null);
    const playerGroup = shallowRef<THREE.Group | null>(null);
    let skyDome: THREE.Mesh | null = null;
    let skyUniforms: { [key: string]: THREE.IUniform } | null = null;
    let cinematic: IntroCinematic | null = null;   // 开场 CG 控制器（仅 intro 阶段存在）

    // ===== 游戏内部状态（普通变量，不响应式） =====
    const keys: InputKeys = { w: false, a: false, s: false, d: false, space: false, shift: false };
    let yaw = 0;
    let pitch = 0;
    let velY = 0;
    let isGrounded = true;
    let mixer: THREE.AnimationMixer | null = null;
    let walkAction: any = null, runAction: any = null, idleAction: any = null, jumpAction: any = null, deathAction: any = null;
    let currentAnimation = 'idle';
    let modelLoaded = false;
    let loadGeneration = 0;  // 模型加载代次，防止旧回调污染场景

    // 当前选中的角色
    let selectedCharacterId = DEFAULT_CHARACTER_ID;
    let currentCharacterIndex = 0;


    // 死亡动画
    let deathModel: THREE.Object3D | null = null;
    let deathMaterials: DeathMaterialRecord[] = [];
    let deathStartY = 0;
    let deathSinkTarget = 0;  // 死亡下沉目标高度
    let deathTimer = 0;
    let deathPending = false;
    let deathDuration = DEATH_DURATION;  // 本次死亡总时长（= 死亡动画完整播完所需时间）
    let deathSinkToLava = true;          // 岩浆死亡才下沉并隐藏模型
    let deathTimeScale = 1;              // 死亡动画播放倍率（由动画时长反推）
    // 死亡贴地曲线：沿死亡动画均匀采样"身体最低点相对站立时的抬升量"（模型局部单位）。
    // 部分 mixamo 死亡动画缺根骨位移，跪/倒后整个人悬在空中，需要按此曲线把模型压回地面。
    let deathGroundCurve: number[] = [];
    let deathSkinMesh: THREE.SkinnedMesh | null = null;

    // 当前脚下平台（用于跟随移动平台）
    let currentGroundedPlatform: import('../game/types').Platform | null = null;
    // 上一帧脚下平台的水平位置：用它与当前位置求差，把平台的位移带给玩家
    let groundPrevX = 0;
    let groundPrevZ = 0;

    // 当前模式
    const currentMode = shallowRef<GameMode>(DEFAULT_MODE);

    // 相机视角模式（响应式，给UI显示用）
    const cameraMode = ref<CameraMode>('thirdPerson');

    // 系统
    let platformSystem: PlatformSystem | null = null;
    let lavaSystem: LavaSystem | null = null;
    let monsterSystem: MonsterSystem | null = null;
    let clock: THREE.Clock | null = null;
    let rafId = 0;
    let animationRunning = false;
    // 选人阶段正面补光
    let characterFillLight: THREE.DirectionalLight | null = null;

    // 对外暴露的 setter（给 input composable 用）
    const input = {
        keys,
        setYaw: (v: number) => { yaw = v; },
        getYaw: () => yaw,
        setPitch: (v: number) => { pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, v)); },
        getPitch: () => pitch,
        toggleCameraMode: () => {
            cameraMode.value = cameraMode.value === 'firstPerson' ? 'thirdPerson' : 'firstPerson';
            pitch = 0;  // 切换时重置俯仰角，避免角度异常
            if (playerGroup.value) {
                playerGroup.value.visible = cameraMode.value === 'thirdPerson' && modelLoaded;
            }
        },
        mouseSens: MOUSE_SENS,
    };

    // 死亡动画进行中（给 input composable 判断用）
    function isDying() { return deathTimer > 0; }

    // ============== 0.5 体积云天空 ==============
    function createPerlinNoiseTexture(): THREE.CanvasTexture {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        const imgData = ctx.createImageData(size, size);
        const hash = (x: number, y: number) => {
            const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
            return n - Math.floor(n);
        };
        const smooth = (x: number, y: number) => {
            const ix = Math.floor(x), iy = Math.floor(y);
            const fx = x - ix, fy = y - iy;
            const a = hash(ix, iy), b = hash(ix + 1, iy);
            const c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
            const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
            return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
        };
        const fbm = (x: number, y: number) => {
            let v = 0, amp = 0.5, freq = 1;
            for (let i = 0; i < 5; i++) {
                v += amp * smooth(x * freq, y * freq);
                amp *= 0.5; freq *= 2;
            }
            return v;
        };
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const v = Math.floor(fbm(x / 18, y / 18) * 255);
                const idx = (y * size + x) * 4;
                imgData.data[idx] = imgData.data[idx + 1] = imgData.data[idx + 2] = v;
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    const skyVertexShader = `
        varying vec3 vWorldPosition;
        void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPosition = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
        }
    `;

    const skyFragmentShader = `
        uniform float uTime;
        uniform vec3 uSunDirection;
        uniform sampler2D t_PerlinNoise;
        uniform float uCloudCoverage;
        uniform float uCloudHeight;
        uniform float uCloudThickness;
        uniform float uCloudAbsorption;
        uniform float uWindSpeedX;
        uniform float uWindSpeedZ;
        uniform float uMaxCloudDistance;
        varying vec3 vWorldPosition;

        #define TWO_PI 6.28318530718
        #define STEPS 20
        #define LIGHT_STEPS 4

        mat3 m = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);

        vec3 Get_Sky_Color(vec3 rayDir) {
            float sunAmount = max(0.0, dot(rayDir, uSunDirection));
            float skyGradient = pow(max(0.0, rayDir.y), 0.5);
            vec3 skyColor = mix(vec3(0.25, 0.50, 0.92), vec3(0.95, 0.97, 1.0), pow(sunAmount, 10.0));
            vec3 horizonColor = vec3(0.80, 0.90, 1.0);
            skyColor = mix(horizonColor, skyColor, skyGradient);
            if (sunAmount > 0.998) skyColor += vec3(1.0, 0.98, 0.9) * pow(sunAmount, 2000.0) * 4.0;
            return skyColor;
        }

        float noise3D(vec3 p) {
            vec2 uv = p.xz * 0.015 + p.y * 0.008;
            return texture2D(t_PerlinNoise, uv).x;
        }

        float fbm(vec3 p) {
            float t = 0.51749673 * noise3D(p); p = m * p * 2.76434;
            t += 0.25584929 * noise3D(p); p = m * p * 2.76434;
            t += 0.12527603 * noise3D(p); p = m * p * 2.76434;
            t += 0.06255931 * noise3D(p);
            return t;
        }

        float cloud_density(vec3 pos, vec3 offset) {
            // 用相对相机的坐标采样噪声，云锚定在天空上，相机移动时不会抖动滑动
            vec3 p = (pos - cameraPosition) * 0.025 + offset;
            float dens = fbm(p);
            float cov = 1.0 - uCloudCoverage;
            dens *= smoothstep(cov, cov + 0.06, dens);
            float height = pos.y - uCloudHeight;
            float heightAtten = 1.0 - clamp(height / uCloudThickness, 0.0, 1.0);
            heightAtten = heightAtten * heightAtten;
            dens *= heightAtten;
            return clamp(dens, 0.0, 1.0);
        }

        float cloud_light(vec3 pos, vec3 dir_step, vec3 offset) {
            float T = 1.0;
            for (int i = 0; i < LIGHT_STEPS; i++) {
                float dens = cloud_density(pos, offset);
                T *= exp(-uCloudAbsorption * dens);
                pos += dir_step;
            }
            return T;
        }

        vec4 render_clouds(vec3 rayOrigin, vec3 rayDirection) {
            float t = (uCloudHeight - rayOrigin.y) / rayDirection.y;
            if (t < 0.0 || t > uMaxCloudDistance) return vec4(0.0);
            float distanceFade = 1.0 - smoothstep(uMaxCloudDistance * 0.5, uMaxCloudDistance, t);
            vec3 startPos = rayOrigin + rayDirection * t;
            vec3 windOffset = vec3(uTime * -uWindSpeedX, 0.0, uTime * -uWindSpeedZ);
            float march_step = uCloudThickness / float(STEPS);
            vec3 dir_step = rayDirection * march_step;
            vec3 light_step = uSunDirection * 6.0;
            float T = 1.0;
            vec3 C = vec3(0.0);
            float alpha = 0.0;
            vec3 pos = startPos;
            for (int i = 0; i < STEPS; i++) {
                if (pos.y < uCloudHeight || pos.y > uCloudHeight + uCloudThickness) { pos += dir_step; continue; }
                float h = float(i) / float(STEPS);
                float dens = cloud_density(pos, windOffset);
                if (dens > 0.01) {
                    float T_i = exp(-uCloudAbsorption * dens * march_step);
                    T *= T_i;
                    float cl = cloud_light(pos, light_step, windOffset);
                    float lightFactor = exp(h) / 1.8;
                    float sunContrib = pow(max(0.0, dot(rayDirection, uSunDirection)), 2.0);
                    vec3 edgeColor = mix(vec3(1.0), vec3(1.0, 0.98, 0.92), sunContrib);
                    vec3 cloudColor = mix(vec3(0.62, 0.70, 0.82), edgeColor, cl * lightFactor);
                    C += T * cloudColor * dens * march_step * 1.6;
                    alpha += (1.0 - T_i) * (1.0 - alpha);
                }
                pos += dir_step;
                if (T < 0.01) break;
            }
            vec3 sunColor = vec3(1.0, 0.98, 0.95);
            vec3 skyColor = vec3(0.85, 0.90, 0.97);
            C *= mix(skyColor, sunColor, 0.5 * pow(max(0.0, dot(rayDirection, uSunDirection)), 2.0));
            alpha *= distanceFade; C *= distanceFade;
            return vec4(C, alpha);
        }

        void main() {
            vec3 rayDirection = normalize(vWorldPosition - cameraPosition);
            vec3 skyColor = Get_Sky_Color(rayDirection);
            vec4 clouds = vec4(0.0);
            if (rayDirection.y > -0.05) clouds = render_clouds(cameraPosition, rayDirection);
            vec3 finalColor = mix(skyColor, clouds.rgb, clouds.a);
            float t = pow(1.0 - max(0.0, rayDirection.y), 5.0);
            finalColor = mix(finalColor, vec3(0.82, 0.90, 1.0), 0.35 * t);
            finalColor = finalColor * 1.4 / (finalColor * 1.4 + vec3(1.0));
            gl_FragColor = vec4(finalColor, 1.0);
        }
    `;

    // ============== 1. 初始化场景 ==============
    function initScene() {
        if (!options.canvas.value) return;

        const s = new THREE.Scene();
        s.background = new THREE.Color(0x87CEEB);
        s.fog = new THREE.Fog(0x87CEEB, 40, 120);
        scene.value = s;

        // 体积云天空球
        const sunDir = new THREE.Vector3();
        sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(50), THREE.MathUtils.degToRad(160));
        skyUniforms = {
            uTime: { value: 0 },
            uSunDirection: { value: sunDir },
            t_PerlinNoise: { value: createPerlinNoiseTexture() },
            uCloudCoverage: { value: 0.5 },
            uCloudHeight: { value: 130 },
            uCloudThickness: { value: 70 },
            uCloudAbsorption: { value: 0.35 },
            uWindSpeedX: { value: 2.5 },
            uWindSpeedZ: { value: 1.2 },
            uMaxCloudDistance: { value: 600 },
        };
        const skyMat = new THREE.ShaderMaterial({
            vertexShader: skyVertexShader,
            fragmentShader: skyFragmentShader,
            uniforms: skyUniforms,
            side: THREE.BackSide,
            depthWrite: false,
            fog: false,
        });
        const dome = new THREE.Mesh(new THREE.SphereGeometry(800, 48, 32), skyMat);
        dome.visible = false;
        dome.renderOrder = -1;
        s.add(dome);
        skyDome = dome;

        const cam = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        cam.position.set(0, 5, 10);
        camera.value = cam;

        const r = new THREE.WebGLRenderer({
            canvas: options.canvas.value,
            antialias: !IS_TOUCH_DEVICE,
            powerPreference: 'high-performance',
        });
        r.setSize(window.innerWidth, window.innerHeight);
        r.setPixelRatio(Math.min(window.devicePixelRatio, IS_TOUCH_DEVICE ? 1.5 : 2));
        r.shadowMap.enabled = true;
        r.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.value = r;

        // 灯光
        const ambient = new THREE.AmbientLight(0xffffff, 0.7);
        s.add(ambient);
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(20, 60, 20);
        dirLight.castShadow = true;
        const smRes = IS_TOUCH_DEVICE ? 1024 : 2048;
        dirLight.shadow.mapSize.width = smRes;
        dirLight.shadow.mapSize.height = smRes;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 200;
        dirLight.shadow.camera.left = -60;
        dirLight.shadow.camera.right = 60;
        dirLight.shadow.camera.top = 60;
        dirLight.shadow.camera.bottom = -60;
        s.add(dirLight);

        // 玩家 Group
        const pg = new THREE.Group();
        pg.position.set(0, 0, 0);
        pg.visible = false;
        s.add(pg);
        playerGroup.value = pg;

        // 平台系统（仅创建实例，generator 在 startGame 里设置）
        platformSystem = new PlatformSystem(s);

        // 怪物系统
        monsterSystem = new MonsterSystem(s);
        monsterSystem.load();

        // 平台移除时清理关联的 Dragon
        platformSystem.setOnPlatformRemoved((p) => {
            monsterSystem?.removeByPlatform(p);
        });

        // 新层生成时尝试放置 Dragon
        platformSystem.setOnLayerGenerated((layer) => {
            monsterSystem?.trySpawnOnLayer(layer, platformSystem!.platforms);
        });

        // 岩浆（始终创建，enabled 由 mode 控制）
        lavaSystem = new LavaSystem(s, s.background as THREE.Color);

        clock = new THREE.Clock();
        animationRunning = true;
        animate();
    }

    // ============== 2. 模型加载 ==============
    function loadModel(character: Character) {
        loadingProgress.value = 0;
        // 切换角色时清理旧模型
        const pg = playerGroup.value!;
        if (pg.children.length > 0) {
            while (pg.children.length > 0) {
                pg.remove(pg.children[0]);
            }
        }
        mixer = null;
        walkAction = runAction = idleAction = jumpAction = deathAction = null;
        deathModel = null;
        deathMaterials = [];
        modelLoaded = false;

        // 递增代次，使旧的加载回调失效
        const gen = ++loadGeneration;

        const loader = new GLTFLoader();
        loader.load(
            character.modelUrl,
            (gltf: any) => {
                // 如果代次不匹配，说明有新的加载请求，忽略这次回调
                if (gen !== loadGeneration) return;

                const model = gltf.scene;
                model.scale.set(character.scale, character.scale, character.scale);
                model.castShadow = true;
                pg.add(model);
                pg.visible = true;

                mixer = new THREE.AnimationMixer(model);
                const animations = gltf.animations;
                const find = (re: RegExp) => animations.find((a: any) => re.test(a.name.toLowerCase()));
                const walkAnim = find(/walk|walking/);
                const runAnim = find(/run|running/);
                const idleAnim = find(/idle|standing/);
                const jumpAnim = find(/jump|jumping/);
                const deathAnim = find(/death|dying/);

                walkAction = mixer.clipAction(walkAnim || animations[0]);
                runAction = mixer.clipAction(runAnim || walkAnim || animations[0]);
                idleAction = mixer.clipAction(idleAnim || animations[0]);
                jumpAction = mixer.clipAction(jumpAnim || animations[0]);
                deathAction = deathAnim ? mixer.clipAction(deathAnim) : null;

                walkAction.setEffectiveWeight(1);
                runAction.setEffectiveWeight(1);
                idleAction.setEffectiveWeight(1);
                jumpAction.setEffectiveWeight(1);
                if (deathAction) {
                    deathAction.setEffectiveWeight(1);
                    deathAction.setLoop(THREE.LoopOnce, 1);
                    deathAction.clampWhenFinished = true;
                }
                // 按移动速度/滞空时间校正播放倍率（消除走路滑步）
                applyGaitTimeScale(character, currentMode.value);

                // 采样死亡动作的身体高度曲线（用于把缺根骨位移的动作压回地面）
                deathSkinMesh = null;
                model.traverse((child: any) => { if (child.isSkinnedMesh && !deathSkinMesh) deathSkinMesh = child; });
                buildDeathGroundCurve(character.scale);

                idleAction.play();

                deathModel = model;
                deathMaterials = [];
                model.traverse((child: any) => {
                    if (child.isMesh && child.material) {
                        const mats = Array.isArray(child.material) ? child.material : [child.material];
                        mats.forEach((m: any) => {
                            if (m.isMeshStandardMaterial) {
                                deathMaterials.push({
                                    mat: m,
                                    origEmissiveR: m.emissive.r,
                                    origEmissiveG: m.emissive.g,
                                    origEmissiveB: m.emissive.b,
                                    origEmissiveI: m.emissiveIntensity,
                                });
                            }
                        });
                    }
                });

                modelLoaded = true;
                loadingProgress.value = 100;
                onModelReady();
            },
            (progress: { loaded: number; total: number }) => {
                if (gen !== loadGeneration) return;  // 忽略过期进度
                if (progress.total) {
                    loadingProgress.value = Math.min(99, Math.floor((progress.loaded / progress.total) * 100));
                }
            },
            (error: unknown) => {
                if (gen !== loadGeneration) return;  // 忽略过期错误
                console.error('模型加载失败：', error);
                loadError.value = '加载失败，点击重试';
            },
        );
    }

    // ============== 3. 模型就绪 → 进入游戏 ==============
    function onModelReady() {
        // 选人预览阶段：模型加载完不改变 phase，继续展示
        if (phase.value === 'character-select') return;
        phase.value = 'playing';
        if (skyDome) skyDome.visible = true;
        const bg = options.bgMusic.value;
        if (bg) {
            bg.currentTime = 0;
            bg.volume = volume.value / 100;
            bg.play().catch(err => console.warn('背景音乐播放失败：', err));
        }
    }

    // ============== 4. 动画切换 ==============
    function switchAnimation(target: string) {
        if (!modelLoaded || currentAnimation === target) return;
        const fade = 0.15;
        const actions: Record<string, any> = { walk: walkAction, run: runAction, idle: idleAction, jump: jumpAction };
        if (actions[currentAnimation]) actions[currentAnimation].fadeOut(fade);
        if (actions[target]) actions[target].reset().fadeIn(fade).play();
        currentAnimation = target;
    }

    // ============== 4.1 按移动速度反算动画播放倍率（消除"太空步"）==============
    // 模型动画自带的位移速度远低于游戏移动速度（角色 1.77m 高却要跑 6~9m/s），
    // 完全匹配需要 5~7 倍速、步频 10 步/秒，看着像快进。这里取折中：
    // 先算"跟上位移所需的倍率"，再用步频上限卡住，保证腿动得自然。
    // 上限越低腿动越自然、滑步越明显；调 moveSpeed 后记得复核这里的两个上限。
    function applyGaitTimeScale(character: Character, mode: GameMode) {
        const g = character.gait;
        const setScale = (
            action: any,
            gait: { speed: number; stepRate: number } | undefined,
            targetSpeed: number,
            maxStepRate: number,
        ) => {
            if (!action || !gait || gait.speed <= 0 || gait.stepRate <= 0) return;
            const nativeSpeed = gait.speed * character.scale;  // 动画原生速度 → 世界单位/秒
            const need = targetSpeed / nativeSpeed;            // 完全跟上位移所需的倍率
            const cap = maxStepRate / gait.stepRate;           // 步频上限允许的倍率
            action.setEffectiveTimeScale(Math.max(1, Math.min(need, cap)));
        };
        setScale(walkAction, g?.walk, mode.moveSpeed, MAX_WALK_STEP_RATE);
        setScale(runAction, g?.run, mode.moveSpeed * mode.dashMultiplier, MAX_RUN_STEP_RATE);

        // 跳跃：让动作在典型滞空时间内播完，避免落地了动作才播到一半
        if (jumpAction) {
            const airTime = 2 * mode.jumpPower / Math.abs(mode.gravity);
            const dur = jumpAction.getClip().duration;
            if (airTime > 0 && dur > 0) {
                jumpAction.setEffectiveTimeScale(Math.max(1, Math.min(dur / airTime, 2.5)));
            }
        }
        // 死亡：按目标时长反推倍率，保证倒地动作能被完整播完（而非播到一半就被岩浆淹没）
        // 只计起播点之后的片段（前段是踉跄站姿，不进入"播完"的计时）
        deathTimeScale = 1;
        if (deathAction) {
            const dur = deathAction.getClip().duration * (1 - DEATH_START_RATIO);
            if (dur > 0) {
                deathTimeScale = Math.max(1, Math.min(dur / DEATH_ANIM_TARGET, 4));
                deathAction.setEffectiveTimeScale(deathTimeScale);
            }
        }
    }

    /**
     * 采样死亡动画每一帧的"身体最低点"，生成贴地补偿曲线。
     * 不少 mixamo 死亡动画缺根骨位移（Hips 只有旋转没有下沉），跪下/倒下后整个人悬在空中，
     * 这里用与 GPU 蒙皮一致的公式（bind → Σ w·boneMat → bindInverse → matrixWorld）
     * 算出真实顶点高度，再按曲线把模型压回地面。存的是世界单位（已含角色缩放），运行时直接减。
     */
    function buildDeathGroundCurve(scale: number) {
        deathGroundCurve = [];
        const sk = deathSkinMesh;
        if (!sk || !mixer || !deathAction || !idleAction) return;

        const geo = sk.geometry;
        const pos = geo.attributes.position;
        const sIdx = geo.attributes.skinIndex;
        const sWt = geo.attributes.skinWeight;
        if (!pos || !sIdx || !sWt) return;

        const bones = sk.skeleton.bones;
        const boneInv = sk.skeleton.boneInverses;
        const bind = sk.bindMatrix;
        const bindInv = sk.bindMatrixInverse;
        const v = new THREE.Vector3();
        const tmp = new THREE.Vector3();
        const bm = new THREE.Matrix4();
        const step = Math.max(1, Math.floor(pos.count / 3000));

        const lowestY = () => {
            let min = Infinity;
            for (let i = 0; i < pos.count; i += step) {
                v.fromBufferAttribute(pos, i).applyMatrix4(bind);
                let x = 0, y = 0, z = 0;
                for (let k = 0; k < 4; k++) {
                    const w = k === 0 ? sWt.getX(i) : k === 1 ? sWt.getY(i) : k === 2 ? sWt.getZ(i) : sWt.getW(i);
                    if (w === 0) continue;
                    const bi = k === 0 ? sIdx.getX(i) : k === 1 ? sIdx.getY(i) : k === 2 ? sIdx.getZ(i) : sIdx.getW(i);
                    const bone = bones[bi];
                    if (!bone) continue;
                    bm.multiplyMatrices(bone.matrixWorld, boneInv[bi]);
                    tmp.copy(v).applyMatrix4(bm).multiplyScalar(w);
                    x += tmp.x; y += tmp.y; z += tmp.z;
                }
                v.set(x, y, z).applyMatrix4(bindInv).applyMatrix4(sk.matrixWorld);
                if (v.y < min) min = v.y;
            }
            return min;
        };

        // 采样期间把玩家组挪到原点，避免把当前站位算进基线
        const pg = playerGroup.value!;
        const savedPos = pg.position.clone();
        pg.position.set(0, 0, 0);

        const sampleAt = (action: THREE.AnimationAction, t: number) => {
            action.time = t;
            mixer!.update(0);
            pg.updateMatrixWorld(true);
            sk.skeleton.update();
            return lowestY();
        };

        mixer.stopAllAction();
        idleAction.play();
        const base = sampleAt(idleAction, 0);   // 站立基线：脚底贴地
        idleAction.stop();

        const clip = deathAction.getClip();
        deathAction.reset().play();
        for (let i = 0; i < DEATH_CURVE_SAMPLES; i++) {
            const t = (i / (DEATH_CURVE_SAMPLES - 1)) * clip.duration;
            const y = sampleAt(deathAction, t);
            deathGroundCurve.push(Math.max(0, y - base));
        }
        deathAction.stop();

        pg.position.copy(savedPos);
        pg.updateMatrixWorld(true);
    }

    /** 按死亡动画进度（0~1，整段动画的归一化时间）取贴地补偿量（世界单位） */
    function deathGroundDrop(p: number): number {
        const n = deathGroundCurve.length;
        if (n < 2) return 0;
        const x = Math.min(Math.max(p, 0), 1) * (n - 1);
        const i = Math.floor(x);
        if (i >= n - 1) return deathGroundCurve[n - 1];
        return deathGroundCurve[i] + (deathGroundCurve[i + 1] - deathGroundCurve[i]) * (x - i);
    }

    // ============== 4.5 音效系统（Web Audio API 程序化生成 8-bit 音效）==============
    let audioCtx: AudioContext | null = null;

    function getAudioCtx(): AudioContext | null {
        if (typeof window === 'undefined') return null;
        if (!audioCtx) {
            const Ctx = window.AudioContext || (window as any).webkitAudioContext;
            if (!Ctx) return null;
            audioCtx = new Ctx();
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
    }

    function playJumpSound() {
        const ctx = getAudioCtx();
        if (!ctx) return;
        const vol = Math.max(0.001, volume.value / 100 * 0.22);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(380, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.14);
    }

    function playDeathSound() {
        const ctx = getAudioCtx();
        if (!ctx) return;
        const vol = Math.max(0.001, volume.value / 100 * 0.35);
        // 下降锯齿波
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(480, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + 0.5);
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.55);
        // 白噪声爆发
        const bufferSize = Math.floor(ctx.sampleRate * 0.35);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(vol * 0.6, ctx.currentTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        noise.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noise.start();
    }

    // ============== 5. 死亡 ==============
    function onPlayerDeath(sinkToLava: boolean = true) {
        if (deathTimer > 0 || deathPending) return;  // 避免重复触发
        // 总时长 = 起播点之后那一段动作完整播完所需时间（无动画时退回固定时长）
        deathDuration = deathAction && deathTimeScale > 0
            ? Math.max(DEATH_DURATION, deathAction.getClip().duration * (1 - DEATH_START_RATIO) / deathTimeScale)
            : DEATH_DURATION;
        deathTimer = deathDuration;
        deathStartY = playerGroup.value!.position.y;
        // 岩浆死亡：沉入岩浆面；怪物死亡：原地倒下不下沉
        deathSinkToLava = sinkToLava;
        deathSinkTarget = sinkToLava ? lavaSystem!.y - 0.3 : deathStartY;
        velY = 0;  // 停止重力下坠
        isGrounded = false;
        // 淡出所有普通动作
        [walkAction, runAction, idleAction, jumpAction].forEach(a => { if (a) a.fadeOut(0.1); });
        // 播放模型自带的死亡动画：从倒地动作开始播（跳过前段的踉跄站姿）
        if (deathAction) {
            deathAction.reset();
            deathAction.time = deathAction.getClip().duration * DEATH_START_RATIO;
            deathAction.fadeIn(0.1).play();
        }
        playerGroup.value!.visible = true;
        playDeathSound();
    }

    function openDeathMenu() {
        deathPending = true;
        phase.value = 'dead';
    }

    // ============== 6. 主循环 ==============
    function animate() {
        if (!animationRunning) return;
        rafId = requestAnimationFrame(animate);
        const delta = Math.min(clock!.getDelta(), 0.05);

        // 未开始：只渲染背景
        if (phase.value === 'idle') {
            renderer.value!.render(scene.value!, camera.value!);
            return;
        }

        // 开场 CG：运镜完全交给 IntroCinematic，播完自动进入游戏
        if (phase.value === 'intro') {
            if (!cinematic) { phase.value = 'idle'; return; }
            const done = cinematic.update(delta);
            const st = cinematic.state;
            introState.value = {
                progress: st.progress,
                subtitle: st.subtitle,
                titleVisible: st.titleVisible,
                fade: st.fade,
            };
            if (done) {
                cinematic.dispose();
                cinematic = null;
                // CG 收尾的机位与游戏初始第三人称机位同向，交给跟随相机平滑推近即可
                confirmCharacter();
            }
            renderer.value!.render(scene.value!, camera.value!);
            return;
        }

        // 角色选择阶段：展示模型，相机固定正面，角色保持静止（不自转）
        if (phase.value === 'character-select') {
            if (mixer) mixer.update(delta);
            const pg = playerGroup.value!;
            pg.rotation.y = 0;   // 正面朝 +Z，正对相机
            // 相机近距离正面，看全身
            camera.value!.position.set(0, 1.5, 3.2);
            camera.value!.lookAt(0, 0.9, 0);
            renderer.value!.render(scene.value!, camera.value!);
            return;
        }

        // 暂停 / 设置 / 死亡菜单：只渲染不更新
        if (phase.value === 'paused' || phase.value === 'settings' || phase.value === 'dead') {
            renderer.value!.render(scene.value!, camera.value!);
            return;
        }

        // 死亡动画期间
        if (deathTimer > 0) {
            deathTimer -= delta;
            lavaSystem!.updateTime(delta);
            if (mixer) mixer.update(delta);

            const deathElapsed = deathDuration - deathTimer;
            const tNorm = Math.min(deathElapsed / deathDuration, 1.0);

            // 下沉到目标高度：倒地动作播完前留在原地，之后才沉入岩浆
            const sinkT = tNorm <= DEATH_SINK_START_RATIO
                ? 0
                : Math.pow((tNorm - DEATH_SINK_START_RATIO) / (1 - DEATH_SINK_START_RATIO), 2);
            // 贴地补偿：缺根骨位移的死亡动作会把人悬在空中，按曲线压回地面。
            // 岩浆死亡时随下沉进度淡出（人已经沉进岩浆里）；怪物死亡原地倒下，全程保持贴地
            const clipP = DEATH_START_RATIO + tNorm * (1 - DEATH_START_RATIO);
            const drop = deathGroundDrop(clipP) * (deathSinkToLava ? 1 - sinkT : 1);
            playerGroup.value!.position.y = deathStartY
                + (deathSinkTarget - deathStartY) * sinkT
                - drop;

            // 岩浆死亡：动作播完、沉入岩浆后才隐藏；怪物死亡原地倒下，不隐藏
            if (deathSinkToLava && tNorm >= 1 && playerGroup.value!.visible) {
                playerGroup.value!.visible = false;
            }

            if (deathTimer <= 0) {
                deathTimer = 0;
                // 保留死亡动画最后一帧（已 LoopOnce + clampWhenFinished），
                // 死亡菜单背景里角色维持倒地姿态；重开时 restartGame() 统一切回 idle
                if (deathModel) deathModel.rotation.set(0, 0, 0);
                openDeathMenu();
            }
            renderer.value!.render(scene.value!, camera.value!);
            return;
        }

        if (mixer) mixer.update(delta);

        // ===== 玩家移动 =====
        const pg = playerGroup.value!;
        const mode = currentMode.value;

        // ===== 站在移动平台上：先把平台的位移带给玩家，再做自身移动与落地判定 =====
        // 顺序很关键：若等落地判定后再补位移，玩家会滞后平台一帧，
        // 平台较快时这一帧的位移可能超过落地判定的 ±0.3 容差，被误判成「走出边界」而掉落。
        if (isGrounded && currentGroundedPlatform) {
            const gp = currentGroundedPlatform;
            if (platformSystem!.platforms.indexOf(gp) < 0) {
                // 平台已被移除（消失 / 易碎 / 回收）
                currentGroundedPlatform = null;
                isGrounded = false;
            } else {
                pg.position.x += gp.x - groundPrevX;
                pg.position.z += gp.z - groundPrevZ;
                groundPrevX = gp.x;
                groundPrevZ = gp.z;
            }
        }

        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
        const right = new THREE.Vector3(1, 0, 0);
        right.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));

        const moveDir = new THREE.Vector3(0, 0, 0);
        if (keys.w) moveDir.sub(forward);
        if (keys.s) moveDir.add(forward);
        if (keys.a) moveDir.add(right);
        if (keys.d) moveDir.sub(right);
        if (moveDir.length() > 0) moveDir.normalize();

        const isRunning = keys.shift && moveDir.length() > 0;
        const curSpeed = isRunning ? mode.moveSpeed * mode.dashMultiplier : mode.moveSpeed;
        pg.position.x += moveDir.x * curSpeed * delta;
        pg.position.z += moveDir.z * curSpeed * delta;

        // 朝向
        if (moveDir.length() > 0) {
            const targetYaw = Math.atan2(moveDir.x, moveDir.z);
            let diff = targetYaw - pg.rotation.y;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            pg.rotation.y += diff * 0.2;
        }

        // 跳跃
        if (keys.space && isGrounded) {
            const mult = isRunning ? DASH_JUMP_MULTIPLIER : 1;
            velY = mode.jumpPower * mult;
            isGrounded = false;
            switchAnimation('jump');
            playJumpSound();
        }

        // 重力 + 落地
        const prevFootY = pg.position.y;
        velY += mode.gravity * delta;
        pg.position.y += velY * delta;
        const newFootY = pg.position.y;

        if (velY <= 0) {
            const landed = platformSystem!.tryLanding(prevFootY, newFootY, pg.position.x, pg.position.z);
            if (landed) {
                pg.position.y = landed.topY;
                velY = 0;
                isGrounded = true;
                // 只有「换了一块平台」时才重置跟随基准。若每帧都重置成当前位置，
                // 下一帧算出的平台位移恒为 0，玩家就会站在原地被平台滑走。
                if (currentGroundedPlatform !== landed) {
                    groundPrevX = landed.x;
                    groundPrevZ = landed.z;
                }
                currentGroundedPlatform = landed;
                playerCurrentLayer.value = landed.layer;  // 始终跟踪实际所在层
                if (landed.layer > currentLayer.value) {
                    currentLayer.value = landed.layer;
                    if (landed.layer > bestLayer.value) bestLayer.value = landed.layer;
                }

                // 平台类型行为
                switch (landed.type) {
                    case 'bouncy':
                        velY = landed.behavior?.bouncePower ?? 20;
                        isGrounded = false;
                        currentGroundedPlatform = null;
                        break;
                    case 'disappearing':
                        if (landed.disappearTimer <= 0) {
                            landed.disappearTimer = landed.behavior?.lifespan ?? 1.0;
                        }
                        break;
                    case 'fragile':
                        // 立即消失
                        platformSystem!.removePlatform(landed);
                        isGrounded = false;
                        currentGroundedPlatform = null;
                        break;
                }

                // 模式落地 hook
                mode.onPlayerLanded?.(landed, {
                    currentLayer: currentLayer.value,
                    bestLayer: bestLayer.value,
                    timeElapsed: 0,
                    playerFootY: pg.position.y,
                    lavaY: lavaSystem!.y,
                });
            } else {
                isGrounded = false;
                currentGroundedPlatform = null;
            }
        } else {
            isGrounded = false;
            currentGroundedPlatform = null;
        }

        // 站在平台上时的兜底：脱离判定 + 吸附顶面（y 轴移动平台靠这条跟随升降）
        // 水平跟随已在玩家移动之前完成，这里只处理「平台没了 / 自己走出边界 / 顶面升降」。
        if (isGrounded && currentGroundedPlatform) {
            // 平台被移除时脱开
            if (platformSystem!.platforms.indexOf(currentGroundedPlatform) < 0) {
                currentGroundedPlatform = null;
                isGrounded = false;
            } else {
                const p = currentGroundedPlatform;
                if (pg.position.x < p.minX - 0.5 || pg.position.x > p.maxX + 0.5 ||
                    pg.position.z < p.minZ - 0.5 || pg.position.z > p.maxZ + 0.5) {
                    currentGroundedPlatform = null;
                    isGrounded = false;
                } else {
                    pg.position.y = p.topY;
                }
            }
        }

        if (isGrounded) {
            if (moveDir.length() > 0) switchAnimation(isRunning ? 'run' : 'walk');
            else switchAnimation('idle');
        }

        // 兜底
        if (pg.position.y < -0.5) {
            pg.position.set(0, 0, 0);
            velY = 0;
            isGrounded = true;
            currentLayer.value = 0;
            playerCurrentLayer.value = 0;
        }

        // 平台更新（移动 / 消失倒计时）
        platformSystem!.update(delta);
        // 怪物更新（巡逻 / 追击 + 动画切换）
        monsterSystem!.update(delta, pg.position.x, pg.position.y, pg.position.z, playerCurrentLayer.value);
        // 平台动态管理
        platformSystem!.manage(pg.position.y);
        // 岩浆（传入最高到达层，让上升速度随难度线性加速）
        lavaSystem!.update(delta, currentLayer.value);
        if (lavaSystem!.checkDeath(pg.position.y)) onPlayerDeath();

        // 怪物碰撞检测（玩家碰到 Dino 触发死亡，原地倒下不沉入岩浆）
        if (!deathPending && deathTimer <= 0 && monsterSystem!.checkCollision(pg.position.x, pg.position.y + 0.8, pg.position.z, 1.2)) {
            onPlayerDeath(false);
        }

        // 模式每帧 hook
        mode.onUpdate?.(delta, {
            currentLayer: currentLayer.value,
            bestLayer: bestLayer.value,
            timeElapsed: 0,
            playerFootY: pg.position.y,
            lavaY: lavaSystem!.y,
        });

        // ===== 相机：第一人称 / 第三人称 =====
        if (cameraMode.value === 'firstPerson') {
            // 第一人称：相机在玩家头部，用 quaternion 显式设置朝向
            // yaw + π 是为了和第三人称屏幕方向对齐（第三人称相机在玩家前方看脸）
            camera.value!.position.set(pg.position.x, pg.position.y + FP_CAMERA_HEIGHT, pg.position.z);
            const euler = new THREE.Euler(pitch, yaw + Math.PI, 0, 'YXZ');
            camera.value!.quaternion.setFromEuler(euler);
        } else {
            // 第三人称：跟随相机
            const targetCamX = pg.position.x - Math.sin(yaw) * CAM_DIST;
            const targetCamZ = pg.position.z - Math.cos(yaw) * CAM_DIST;
            const targetCamY = pg.position.y + CAM_HEIGHT;
            camera.value!.position.x += (targetCamX - camera.value!.position.x) * CAM_SMOOTH;
            camera.value!.position.z += (targetCamZ - camera.value!.position.z) * CAM_SMOOTH;
            camera.value!.position.y += (targetCamY - camera.value!.position.y) * CAM_SMOOTH;
            camera.value!.lookAt(pg.position.x, pg.position.y + 1, pg.position.z);
        }

        // 天空球跟随相机 + 更新时间
        if (skyDome && skyDome.visible) {
            skyDome.position.copy(camera.value!.position);
            if (skyUniforms) {
                skyUniforms.uTime.value += delta;
                // 云层跟随相机：始终在相机上方固定相对高度，避免跳高后跳出云层
                // 基准高度 = 相机 y + 130（与原世界高度 130 一致，相机贴地时视觉不变）
                skyUniforms.uCloudHeight.value = camera.value!.position.y + 130;
            }
        }

        // 视线遮挡
        const camPos = camera.value!.position.clone();
        const playerPos = new THREE.Vector3(pg.position.x, pg.position.y + 1, pg.position.z);
        // 传入当前站立平台，让遮挡逻辑豁免它（否则自己脚下的地板会被误判为遮挡物而变透明）
        platformSystem!.updateOpacity(camPos, playerPos, currentGroundedPlatform);

        renderer.value!.render(scene.value!, camera.value!);
    }

    // ============== 7. 控制 API（给 UI 调用） ==============

    // 播放开场 CG（选好角色、点「立即出发」后调用，播完自动进入游戏）
    function playIntro(mode: GameMode = DEFAULT_MODE) {
        if (!scene.value || !camera.value || !platformSystem || !lavaSystem) return;
        currentMode.value = mode;
        phase.value = 'intro';
        if (skyDome) skyDome.visible = true;                 // CG 里能看到体积云天空

        // 移除选人阶段补光（CG 用的是场景自身的光照）
        if (characterFillLight && scene.value) {
            scene.value.remove(characterFillLight);
            characterFillLight = null;
        }

        // 主角登场：CG 全程可见，站在起始平台上做 idle（第一幕是岩浆仰拍，末幕俯冲落地同框）
        const pg = playerGroup.value!;
        pg.position.set(0, 0, 0);
        pg.rotation.set(0, 0, 0);
        pg.visible = true;
        velY = 0;
        isGrounded = true;
        yaw = 0;
        currentGroundedPlatform = null;
        if (idleAction) {
            [walkAction, runAction, jumpAction, deathAction].forEach(a => { if (a) a.fadeOut(0); });
            idleAction.reset().fadeIn(0.2).play();
            currentAnimation = 'idle';
        }

        // 清掉可能残留的按键（CG 期间乱按不应带进游戏）
        const keys = input.keys as unknown as Record<string, boolean>;
        for (const k of Object.keys(keys)) keys[k] = false;

        introState.value = { progress: 0, subtitle: -1, titleVisible: false, fade: 1 };
        cinematic?.dispose();
        cinematic = new IntroCinematic(
            scene.value, camera.value, platformSystem, lavaSystem, monsterSystem, IS_TOUCH_DEVICE,
        );
        cinematic.start(mode);

        // 音乐与 CG 同时起，播完进游戏时不再重启
        const bg = options.bgMusic.value;
        if (bg) {
            bg.currentTime = 0;
            bg.volume = volume.value / 100;
            bg.play().catch(err => console.warn('背景音乐播放失败：', err));
        }
    }

    // 跳过开场 CG（任意键 / 点击，UI 层调用）
    function skipIntro() {
        if (phase.value !== 'intro' || !cinematic) return;
        cinematic.skip();
    }

    // 进入角色选择页面（点开始游戏后调用）
    function enterCharacterSelect(mode: GameMode = DEFAULT_MODE) {
        currentMode.value = mode;
        phase.value = 'character-select';
        if (skyDome) skyDome.visible = false;

        // 清理平台和岩浆（选人阶段不显示）
        if (platformSystem) platformSystem.clear();
        monsterSystem?.clear();
        if (lavaSystem) {
            lavaSystem.setEnabled(false);
            lavaSystem.reset(mode.lava.initialY, mode.lava.riseSpeed);
        }

        // 添加选人阶段正面补光
        if (!characterFillLight && scene.value) {
            characterFillLight = new THREE.DirectionalLight(0xffffff, 0.9);
            characterFillLight.position.set(0, 2.5, 5);
            scene.value.add(characterFillLight);
        }

        // 重置玩家位置和朝向
        const pg = playerGroup.value!;
        pg.position.set(0, 0, 0);
        pg.rotation.set(0, 0, 0);
        velY = 0;
        isGrounded = true;
        currentGroundedPlatform = null;
        currentLayer.value = 0;
        playerCurrentLayer.value = 0;
        bestLayer.value = 0;
        deathTimer = 0;
        deathPending = false;

        // 加载当前选中的角色
        const char = CHARACTERS[currentCharacterIndex] ?? CHARACTERS[0];
        selectedCharacterId = char.id;
        characterIndex.value = currentCharacterIndex;
        loadModel(char);
    }

    // 左右切换角色（-1 上一个，+1 下一个）
    function switchCharacter(direction: number) {
        if (phase.value !== 'character-select') return;
        const len = CHARACTERS.length;
        currentCharacterIndex = (currentCharacterIndex + direction + len) % len;
        characterIndex.value = currentCharacterIndex;
        const char = CHARACTERS[currentCharacterIndex];
        selectedCharacterId = char.id;
        loadModel(char);
    }

    // 确认选择，正式进入游戏（选人页点「立即出发」→ 播 CG → CG 结束后调用）
    function confirmCharacter() {
        if (phase.value !== 'character-select' && phase.value !== 'intro') return;
        const mode = currentMode.value;

        // 移除选人阶段补光
        if (characterFillLight && scene.value) {
            scene.value.remove(characterFillLight);
            characterFillLight = null;
        }

        // 生成平台初始层（CG 里搭的预览塔身连同其上的怪物一起清掉，否则会留下悬空的幽灵怪物）
        if (platformSystem) {
            platformSystem.clear();
            monsterSystem?.clear();
            platformSystem.setGenerator(mode.createGenerator(), mode);
            platformSystem.initInitialLayers();
        }
        // 启用岩浆
        if (lavaSystem) {
            lavaSystem.reset(mode.lava.initialY, mode.lava.riseSpeed);
            lavaSystem.setEnabled(mode.lava.enabled);
        }

        // 重置玩家状态
        const pg = playerGroup.value!;
        pg.position.set(0, 0, 0);
        pg.rotation.set(0, 0, 0);
        velY = 0;
        isGrounded = true;
        yaw = 0;
        currentGroundedPlatform = null;
        currentLayer.value = 0;
        playerCurrentLayer.value = 0;
        deathTimer = 0;
        deathPending = false;
        pg.visible = cameraMode.value === 'thirdPerson';

        // 重置动画到 idle
        if (idleAction) {
            [walkAction, runAction, idleAction, jumpAction, deathAction].forEach(a => { if (a) a.fadeOut(0); });
            idleAction.reset().fadeIn(0.15).play();
            currentAnimation = 'idle';
        }

        phase.value = 'playing';
        if (skyDome) skyDome.visible = true;
        // 播放背景音乐（CG 开始时已起播，这里仅在没播时兜底，避免重启断音）
        const bg = options.bgMusic.value;
        if (bg && bg.paused) {
            bg.currentTime = 0;
            bg.volume = volume.value / 100;
            bg.play().catch(err => console.warn('背景音乐播放失败：', err));
        }
    }

    function startGame(mode: GameMode = DEFAULT_MODE, characterId: string = DEFAULT_CHARACTER_ID) {
        currentMode.value = mode;
        selectedCharacterId = characterId;
        loadingProgress.value = 0;
        loadError.value = null;

        // 应用模式配置到引擎子系统
        if (platformSystem) {
            platformSystem.clear();
            monsterSystem?.clear();
            platformSystem.setGenerator(mode.createGenerator(), mode);
            platformSystem.initInitialLayers();
        }
        if (lavaSystem) {
            lavaSystem.reset(mode.lava.initialY, mode.lava.riseSpeed);
            lavaSystem.setEnabled(mode.lava.enabled);
        }

        // 重试时如果模型已挂载到 playerGroup（部分加载），先清理
        if (playerGroup.value && playerGroup.value.children.length > 0) {
            while (playerGroup.value.children.length > 0) {
                const obj = playerGroup.value.children[0];
                playerGroup.value.remove(obj);
            }
            modelLoaded = false;
            deathModel = null;
            deathMaterials = [];
            mixer = null;
            walkAction = runAction = idleAction = jumpAction = deathAction = null;
        }
        loadModel(getCharacterById(characterId));
    }

    function pauseGame() {
        if (deathPending || deathTimer > 0) return;
        phase.value = 'paused';
    }
    function resumeGame() {
        if (deathPending) return;
        phase.value = 'playing';
        if (skyDome) skyDome.visible = true;
    }
    // 进入设置前的状态，关闭时回到那里（paused → 暂停菜单，idle → 开始界面）
    let previousPhase: GamePhase = 'paused';

    function openSettings() {
        previousPhase = phase.value;
        phase.value = 'settings';
    }
    function closeSettings() {
        phase.value = previousPhase;
    }

    function restartGame() {
        const pg = playerGroup.value!;
        const mode = currentMode.value;
        pg.position.set(0, 0, 0);
        velY = 0;
        isGrounded = true;
        yaw = 0;
        currentGroundedPlatform = null;

        platformSystem!.clear();
        monsterSystem?.clear();
        platformSystem!.setGenerator(mode.createGenerator(), mode);
        platformSystem!.initInitialLayers();

        currentLayer.value = 0;
        playerCurrentLayer.value = 0;
        lavaSystem!.reset(mode.lava.initialY, mode.lava.riseSpeed);
        lavaSystem!.setEnabled(mode.lava.enabled);
        deathTimer = 0;
        deathPending = false;
        pg.visible = modelLoaded && cameraMode.value === 'thirdPerson';

        if (deathModel) deathModel.rotation.set(0, 0, 0);

        if (idleAction) {
            [walkAction, runAction, idleAction, jumpAction, deathAction].forEach(a => { if (a) a.fadeOut(0); });
            idleAction.reset().fadeIn(0.15).play();
            currentAnimation = 'idle';
        }
        phase.value = 'playing';
        if (skyDome) skyDome.visible = true;
    }

    function quitGame() {
        restartGame();
        // 移除选人阶段补光
        if (characterFillLight && scene.value) {
            scene.value.remove(characterFillLight);
            characterFillLight = null;
        }
        phase.value = 'idle';
        if (skyDome) skyDome.visible = false;
        playerGroup.value!.visible = false;
        if (document.pointerLockElement) document.exitPointerLock();
        options.bgMusic.value?.pause();
    }

    function setVolume(v: number) {
        volume.value = v;
        if (options.bgMusic.value) options.bgMusic.value.volume = v / 100;
    }

    function onResize() {
        if (!camera.value || !renderer.value) return;
        camera.value.aspect = window.innerWidth / window.innerHeight;
        camera.value.updateProjectionMatrix();
        renderer.value.setSize(window.innerWidth, window.innerHeight);
        renderer.value.setPixelRatio(Math.min(window.devicePixelRatio, IS_TOUCH_DEVICE ? 1.5 : 2));
    }

    function dispose() {
        animationRunning = false;
        cancelAnimationFrame(rafId);
        platformSystem?.dispose();
        monsterSystem?.dispose();
        lavaSystem?.dispose();
        disposePixelTextures();
        renderer.value?.dispose();
    }

    onUnmounted(dispose);

    return {
        // 状态
        phase, currentLayer, bestLayer, volume,
        loadingProgress, loadError, currentMode, cameraMode, characterIndex,
        // 开场 CG
        introState, playIntro, skipIntro,
        // 引擎控制
        initScene, startGame, pauseGame, resumeGame,
        openSettings, closeSettings,
        restartGame, quitGame, setVolume, onResize,
        // 选人流程
        enterCharacterSelect, switchCharacter, confirmCharacter,
        // 输入桥接
        input,
        // 死亡动画进行中（给 input composable 判断用）
        isDying,
        // 模块导出（给 input composable 判断状态）
        isTouchDevice: IS_TOUCH_DEVICE,
    };
}
