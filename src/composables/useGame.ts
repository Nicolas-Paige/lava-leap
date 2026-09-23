import { ref, shallowRef, onUnmounted, type Ref } from 'vue';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
    MOUSE_SENS, RUN_SPEED_MULTIPLIER, DASH_JUMP_MULTIPLIER,
    CAM_DIST, CAM_HEIGHT, CAM_SMOOTH,
    FP_CAMERA_HEIGHT, PITCH_MIN, PITCH_MAX,
    DEATH_DURATION,
} from '../game/constants';
import { PlatformSystem } from '../game/PlatformSystem';
import { LavaSystem } from '../game/LavaSystem';
import { MonsterSystem } from '../game/MonsterSystem';
import { disposePixelTextures } from '../game/textures';
import type { GamePhase, InputKeys, DeathMaterialRecord, CameraMode } from '../game/types';
import type { GameMode } from '../game/modes/types';
import { DEFAULT_MODE } from '../game/modes/registry';
import { getCharacterById, DEFAULT_CHARACTER_ID, CHARACTERS, type Character } from '../game/characters';

// 触控设备检测（模块级常量，避免重复计算）
export const IS_TOUCH_DEVICE =
    typeof navigator !== 'undefined' &&
    (('ontouchstart' in window) || navigator.maxTouchPoints > 0);

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

    // ===== Three.js 对象（shallowRef 避免响应式包装） =====
    const scene = shallowRef<THREE.Scene | null>(null);
    const camera = shallowRef<THREE.PerspectiveCamera | null>(null);
    const renderer = shallowRef<THREE.WebGLRenderer | null>(null);
    const playerGroup = shallowRef<THREE.Group | null>(null);
    let skyDome: THREE.Mesh | null = null;
    let skyUniforms: { [key: string]: THREE.IUniform } | null = null;

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

    // 当前脚下平台（用于跟随 y 轴移动平台）
    let currentGroundedPlatform: import('../game/types').Platform | null = null;

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
        deathTimer = DEATH_DURATION;
        deathStartY = playerGroup.value!.position.y;
        // 岩浆死亡：沉入岩浆面；怪物死亡：原地倒下不下沉
        deathSinkTarget = sinkToLava ? lavaSystem!.y - 0.3 : deathStartY;
        velY = 0;  // 停止重力下坠
        isGrounded = false;
        // 淡出所有普通动作
        [walkAction, runAction, idleAction, jumpAction].forEach(a => { if (a) a.fadeOut(0.1); });
        // 播放模型自带的死亡动画
        if (deathAction) {
            deathAction.reset().fadeIn(0.1).play();
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

        // 角色选择阶段：展示模型，相机固定正面，角色缓慢旋转
        if (phase.value === 'character-select') {
            if (mixer) mixer.update(delta);
            const pg = playerGroup.value!;
            // 角色缓慢自转展示
            pg.rotation.y += delta * 0.5;
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

            const deathElapsed = DEATH_DURATION - deathTimer;
            const tNorm = Math.min(deathElapsed / DEATH_DURATION, 1.0);

            // 下沉到目标高度（岩浆面 / 平台内）
            playerGroup.value!.position.y = deathStartY + (deathSinkTarget - deathStartY) * tNorm;

            // 下沉过半后隐藏模型（被岩浆吞没）
            if (deathElapsed >= DEATH_DURATION * 0.5 && playerGroup.value!.visible) {
                playerGroup.value!.visible = false;
            }

            if (deathTimer <= 0) {
                deathTimer = 0;
                // 停止死亡动画，重置模型姿态
                if (deathAction) deathAction.fadeOut(0);
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

        // 站在移动平台上时跟随平台移动（解决 velY=0 时穿越检测不触发的问题）
        if (isGrounded && currentGroundedPlatform) {
            // 平台被移除或不在 xz 范围内时脱开
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
                    // 吸附到平台顶部
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
        // 岩浆
        lavaSystem!.update(delta);
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
        platformSystem!.updateOpacity(camPos, playerPos);

        renderer.value!.render(scene.value!, camera.value!);
    }

    // ============== 7. 控制 API（给 UI 调用） ==============

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

    // 确认选择，正式进入游戏
    function confirmCharacter() {
        if (phase.value !== 'character-select') return;
        const mode = currentMode.value;

        // 移除选人阶段补光
        if (characterFillLight && scene.value) {
            scene.value.remove(characterFillLight);
            characterFillLight = null;
        }

        // 生成平台初始层
        if (platformSystem) {
            platformSystem.clear();
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
        // 播放背景音乐
        const bg = options.bgMusic.value;
        if (bg) {
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
