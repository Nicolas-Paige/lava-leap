import * as THREE from 'three';
import {
    LAVA_SIZE, LAVA_RISE_SPEED, LAVA_RISE_SPEED_MAX, LAVA_SPEED_RAMP_LAYER,
    LAVA_INITIAL_Y, LAVA_DEATH_MARGIN,
    LAVA_UV_SCALE, LAVA_TIME_SCALE,
} from './constants';

// ============== 岩浆系统：着色器 + 上升 + 死亡检测 ==============
// Three.js 官方 webgl_shader_lava 着色器 + 多源纹理回退

const LAVA_TEXTURE_CANDIDATES = {
    cloud: [
        '/textures/lava/cloud.png',
        'https://threejs.org/examples/textures/lava/cloud.png',
        'https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/textures/lava/cloud.png',
    ],
    tile: [
        '/textures/lava/lavatile.jpg',
        'https://threejs.org/examples/textures/lava/lavatile.jpg',
        'https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/textures/lava/lavatile.jpg',
    ],
};

// fallback：程序生成的 64x64 伪噪声
function makeFallbackTexture(colorHex: number, addAlphaNoise = false): THREE.CanvasTexture {
    const size = 64;
    const cvs = document.createElement('canvas');
    cvs.width = cvs.height = size;
    const ctx = cvs.getContext('2d')!;
    const c = new THREE.Color(colorHex);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const n = Math.random();
            const r = Math.min(255, Math.floor(c.r * 255 * (0.6 + n * 0.8)));
            const g = Math.min(255, Math.floor(c.g * 255 * (0.6 + n * 0.8)));
            const b = Math.min(255, Math.floor(c.b * 255 * (0.6 + n * 0.8)));
            let a = 255;
            if (addAlphaNoise) a = Math.min(255, Math.floor(n * 255));
            ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
            ctx.fillRect(x, y, 1, 1);
        }
    }
    const tex = new THREE.CanvasTexture(cvs);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

interface TextureObj { texture: THREE.Texture | null; }

function loadLavaTexture(
    candidates: string[],
    fallbackColor: number,
    addAlphaNoise: boolean,
    markSRGB: boolean,
    textureLoader: THREE.TextureLoader,
): TextureObj {
    const texObj: TextureObj = { texture: null };
    function tryNext(idx: number) {
        if (idx >= candidates.length) {
            texObj.texture = makeFallbackTexture(fallbackColor, addAlphaNoise);
            if (markSRGB) texObj.texture.colorSpace = THREE.SRGBColorSpace;
            return;
        }
        const url = candidates[idx];
        textureLoader.load(
            url,
            (loadedTex: THREE.Texture) => {
                loadedTex.wrapS = loadedTex.wrapT = THREE.RepeatWrapping;
                if (markSRGB) loadedTex.colorSpace = THREE.SRGBColorSpace;
                texObj.texture = loadedTex;
            },
            undefined,
            () => tryNext(idx + 1),
        );
    }
    texObj.texture = makeFallbackTexture(fallbackColor, addAlphaNoise);
    if (markSRGB) texObj.texture.colorSpace = THREE.SRGBColorSpace;
    tryNext(0);
    return texObj;
}

// 着色器
const lavaVertexShader = /* glsl */`
    uniform vec2 uvScale;
    varying vec2 vUv;
    varying vec3 vWorldPos;
    void main() {
        vUv = uvScale * uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
`;

const lavaFragmentShader = /* glsl */`
    uniform float time;
    uniform float fogDensity;
    uniform vec3  fogColor;
    uniform sampler2D texture1;
    uniform sampler2D texture2;
    varying vec2 vUv;
    varying vec3 vWorldPos;
    void main( void ) {
        vec4 noise = texture2D( texture1, vUv );
        vec2 T1 = vUv + vec2( 1.5, -1.5 ) * time * 0.02;
        vec2 T2 = vUv + vec2( -0.5, 2.0 ) * time * 0.01;
        T1.x += noise.x * 2.0;
        T1.y += noise.y * 2.0;
        T2.x -= noise.y * 0.2;
        T2.y += noise.z * 0.2;
        vec4 cloudSample = texture2D( texture1, T1 * 2.0 );
        float lum = dot( cloudSample.rgb, vec3( 0.299, 0.587, 0.114 ) );
        float p = max( cloudSample.a, lum );
        vec4 color = texture2D( texture2, T2 * 2.0 );
        vec4 temp = color * ( vec4( p, p, p, p ) * 2.0 ) + ( color * color - 0.1 );
        temp.rgb = max( temp.rgb, vec3( 0.0 ) );
        temp.a   = max( temp.a, 0.0 );
        if( temp.r > 1.0 ){ temp.bg += clamp( temp.r - 2.0, 0.0, 100.0 ); }
        if( temp.g > 1.0 ){ temp.rb += temp.g - 1.0; }
        if( temp.b > 1.0 ){ temp.rg += temp.b - 1.0; }
        vec3 outCol = temp.rgb;
        if ( fogDensity > 0.0 ) {
            float depth = gl_FragCoord.z / gl_FragCoord.w;
            const float LOG2 = 1.442695;
            float fogFactor = exp2( - fogDensity * fogDensity * depth * depth * LOG2 );
            fogFactor = 1.0 - clamp( fogFactor, 0.0, 1.0 );
            outCol = mix( outCol, fogColor, fogFactor );
        }
        float distXZ = length(vWorldPos.xz);
        float alpha = 1.0 - smoothstep(30.0, 48.0, distXZ);
        gl_FragColor = vec4(outCol, alpha);
    }
`;

export class LavaSystem {
    readonly mesh: THREE.Mesh;
    readonly light: THREE.PointLight;
    readonly uniforms: { [k: string]: THREE.IUniform };
    private readonly mat: THREE.ShaderMaterial;
    private lavaY = LAVA_INITIAL_Y;
    private baseRiseSpeed = LAVA_RISE_SPEED;   // 模式给定的基础速度
    private riseSpeed = LAVA_RISE_SPEED;       // 当前实际速度（随层数加速后）
    private enabled = true;

    constructor(scene: THREE.Scene, fogColor: THREE.Color) {
        const geo = new THREE.PlaneGeometry(LAVA_SIZE, LAVA_SIZE, 1, 1);
        const textureLoader = new THREE.TextureLoader();
        textureLoader.setCrossOrigin('anonymous');

        const cloudTexObj = loadLavaTexture(LAVA_TEXTURE_CANDIDATES.cloud, 0xaaaaaa, true, false, textureLoader);
        const tileTexObj = loadLavaTexture(LAVA_TEXTURE_CANDIDATES.tile, 0xff6a00, false, true, textureLoader);

        this.uniforms = {
            fogDensity: { value: 0.0 },
            fogColor: { value: fogColor.clone() },
            time: { value: 0.0 },
            uvScale: { value: new THREE.Vector2(LAVA_UV_SCALE.x, LAVA_UV_SCALE.y) },
            texture1: { value: cloudTexObj.texture },
            texture2: { value: tileTexObj.texture },
        };

        // 候选源加载成功后替换 uniform
        const pollSwap = (obj: TextureObj, key: string) => {
            const check = () => {
                const cur = this.uniforms[key].value as THREE.Texture;
                if (obj.texture && obj.texture !== cur) {
                    cur.dispose?.();
                    this.uniforms[key].value = obj.texture;
                    this.mat.needsUpdate = true;
                    return;
                }
                requestAnimationFrame(check);
            };
            requestAnimationFrame(check);
        };
        pollSwap(cloudTexObj, 'texture1');
        pollSwap(tileTexObj, 'texture2');

        this.mat = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            vertexShader: lavaVertexShader,
            fragmentShader: lavaFragmentShader,
        });

        this.mesh = new THREE.Mesh(geo, this.mat);
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.position.y = LAVA_INITIAL_Y;
        scene.add(this.mesh);

        this.light = new THREE.PointLight(0xff4400, 2.0, 60, 2);
        this.light.position.set(0, LAVA_INITIAL_Y + 2, 0);
        scene.add(this.light);
    }

    /**
     * 每帧更新：上升 + 推进 shader 时间
     * playerLayer 传入时，岩浆速度按层数线性加速（0.8 → 1.8 / 81 层），之后封顶。
     */
    update(delta: number, playerLayer?: number): void {
        if (this.enabled) {
            if (playerLayer !== undefined) {
                const t = Math.max(0, Math.min(1, playerLayer / LAVA_SPEED_RAMP_LAYER));
                const target = Math.max(this.baseRiseSpeed, LAVA_RISE_SPEED_MAX);
                this.riseSpeed = this.baseRiseSpeed + (target - this.baseRiseSpeed) * t;
            }
            this.lavaY += this.riseSpeed * delta;
            this.mesh.position.y = this.lavaY;
            this.light.position.y = this.lavaY + 2;
        }
        (this.uniforms.time.value as number) += delta * LAVA_TIME_SCALE;
    }

    // 仅推进时间（死亡动画期间）
    updateTime(delta: number): void {
        (this.uniforms.time.value as number) += delta * LAVA_TIME_SCALE;
    }

    // 死亡检测：玩家脚底低于岩浆面
    checkDeath(playerY: number): boolean {
        if (!this.enabled) return false;
        return playerY < this.lavaY - LAVA_DEATH_MARGIN;
    }

    get y(): number { return this.lavaY; }

    reset(initialY?: number, riseSpeed?: number): void {
        if (initialY !== undefined) this.lavaY = initialY;
        if (riseSpeed !== undefined) {
            this.baseRiseSpeed = riseSpeed;
            this.riseSpeed = riseSpeed;
        }
        this.mesh.position.y = this.lavaY;
        this.light.position.y = this.lavaY + 2;
        this.uniforms.time.value = 0;
    }

    // 模式控制：禁用岩浆（用于训练等模式）
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        this.mesh.visible = enabled;
        this.light.visible = enabled;
    }

    dispose(): void {
        this.mesh.geometry.dispose();
        this.mat.dispose();
    }
}
