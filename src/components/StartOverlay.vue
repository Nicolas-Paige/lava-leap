<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useI18n } from '../composables/useI18n';

const props = defineProps<{
    loadingProgress: number;
    loadError: string | null;
}>();

const emit = defineEmits<{
    start: [];
    settings: [];
}>();

const { tr } = useI18n();

const started = ref(false);

// 加载失败时重置 started，允许用户重试
watch(() => props.loadError, (err) => {
    if (err) started.value = false;
});

const btnText = computed(() => {
    if (props.loadError) return tr('loadingFailed');
    if (started.value && props.loadingProgress > 0) return `${tr('loadingProgress')} ${props.loadingProgress}%`;
    if (started.value) return tr('loadingProgress');
    return tr('startBtn');
});

function onStart() {
    if (started.value) return;
    started.value = true;
    emit('start');
}

// 浮动粒子
const particles = ref<{ x: number; y: number; size: number; duration: number; delay: number }[]>([]);
onMounted(() => {
    for (let i = 0; i < 100; i++) {
        particles.value.push({
            x: Math.random() * 100,
            y: Math.random() * 100,
            size: Math.random() * 4 + 2,
            duration: Math.random() * 20 + 15,
            delay: Math.random() * 10,
        });
    }
});
</script>

<template>
    <div id="startOverlay">
        <!-- 浮动粒子背景 -->
        <div class="particles">
            <div
                v-for="(p, i) in particles"
                :key="i"
                class="particle"
                :style="{
                    left: p.x + '%',
                    top: p.y + '%',
                    width: p.size + 'px',
                    height: p.size + 'px',
                    animationDuration: p.duration + 's',
                    animationDelay: p.delay + 's',
                }"
            ></div>
        </div>

        <!-- 光晕背景 -->
        <div class="glow glow-1"></div>
        <div class="glow glow-2"></div>
        <div class="glow glow-3"></div>

        <!-- 底部岩浆光带 -->
        <div class="lava-band"></div>

        <!-- 漂浮平台剪影（纯装饰） -->
        <div class="platforms">
            <span class="plat plat-1"></span>
            <span class="plat plat-2"></span>
            <span class="plat plat-3"></span>
            <span class="plat plat-4"></span>
            <span class="plat plat-5"></span>
            <span class="plat climb plat-6"></span>
            <span class="plat climb plat-7"></span>
            <span class="plat climb plat-8"></span>
            <span class="plat climb plat-9"></span>
        </div>

        <button id="btnStartSettings" :title="tr('settings')" @click="emit('settings')">⚙</button>

        <div class="overlay-inner">
            <h1 class="title">
                <span class="title-text">Lava Leap</span>
                <span class="title-glow">Lava Leap</span>
            </h1>

            <button id="startBtn" :disabled="started" @click="onStart">
                <span class="btn-content">{{ btnText }}</span>
                <span class="btn-glow"></span>
            </button>
        </div>
    </div>
</template>

<style scoped>
#startOverlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: grid;
    place-items: center;
    overflow: hidden;
    color: #fff;
    background:
        linear-gradient(180deg, rgba(4, 7, 16, 0.2), rgba(4, 7, 16, 0.64)),
        radial-gradient(circle at 50% 22%, rgba(255, 129, 72, 0.18), transparent 36%),
        linear-gradient(135deg, #080817 0%, #101827 48%, #06131d 100%);
    padding:
        max(14px, env(safe-area-inset-top))
        max(14px, env(safe-area-inset-right))
        max(14px, env(safe-area-inset-bottom))
        max(14px, env(safe-area-inset-left));
    box-sizing: border-box;
}

.particles,
.glow {
    position: absolute;
    pointer-events: none;
}

.particles {
    inset: 0;
    overflow: hidden;
}

.particle {
    position: absolute;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 180, 80, 1), rgba(255, 80, 30, 0.8) 40%, rgba(255, 50, 20, 0) 70%);
    box-shadow: 0 0 6px 2px rgba(255, 150, 50, 0.4);
    opacity: 0;
    animation: float-particle linear infinite;
}

@keyframes float-particle {
    0% { opacity: 0; transform: translateY(100vh) scale(0.5); }
    5% { opacity: 0.8; }
    50% { opacity: 0.6; }
    95% { opacity: 0.8; }
    100% { opacity: 0; transform: translateY(-20vh) translateX(80px) scale(1.2); }
}

.glow {
    border-radius: 50%;
    filter: blur(60px);
    opacity: 0.2;
    animation: pulse-glow 6s ease-in-out infinite;
}

.glow-1 {
    top: -150px;
    right: -150px;
    width: clamp(300px, 45vw, 500px);
    height: clamp(300px, 45vw, 500px);
    background: radial-gradient(circle, rgba(255, 107, 107, 0.6), transparent 70%);
}

.glow-2 {
    bottom: -120px;
    left: -120px;
    width: clamp(260px, 36vw, 400px);
    height: clamp(260px, 36vw, 400px);
    background: radial-gradient(circle, rgba(74, 144, 226, 0.5), transparent 70%);
    animation-delay: 2s;
}

.glow-3 {
    top: 30%;
    left: 50%;
    width: clamp(240px, 32vw, 350px);
    height: clamp(240px, 32vw, 350px);
    transform: translateX(-50%);
    background: radial-gradient(circle, rgba(255, 230, 109, 0.5), transparent 70%);
    animation-name: pulse-glow-centered;
    animation-delay: 4s;
}

@keyframes pulse-glow {
    0%, 100% { opacity: 0.2; transform: scale(1); }
    50% { opacity: 0.35; transform: scale(1.15); }
}

@keyframes pulse-glow-centered {
    0%, 100% { opacity: 0.2; transform: translateX(-50%) scale(1); }
    50% { opacity: 0.35; transform: translateX(-50%) scale(1.15); }
}

/* 底部岩浆光带 */
.lava-band {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 1;
    height: clamp(90px, 18vh, 190px);
    transform-origin: bottom;
    pointer-events: none;
    background:
        radial-gradient(60% 100% at 50% 100%, rgba(255, 90, 30, 0.4), transparent 70%),
        linear-gradient(180deg, transparent, rgba(255, 60, 20, 0.2) 62%, rgba(255, 130, 45, 0.36));
    animation: lava-breathe 5s ease-in-out infinite;
}

/* 岩浆表面亮边 */
.lava-band::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(
        90deg,
        transparent,
        rgba(255, 190, 90, 0.85),
        rgba(255, 90, 30, 0.95),
        rgba(255, 190, 90, 0.85),
        transparent
    );
    animation: rim-pulse 3s ease-in-out infinite;
}

@keyframes rim-pulse {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
}

@keyframes lava-breathe {
    0%, 100% { opacity: 0.75; transform: scaleY(1); }
    50% { opacity: 1; transform: scaleY(1.07); }
}

/* 漂浮平台剪影 */
.platforms {
    position: absolute;
    inset: 0;
    z-index: 1;
    overflow: hidden;
    pointer-events: none;
}

.plat {
    position: absolute;
    display: block;
    border-top: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 10px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.02));
    box-shadow: 0 10px 26px rgba(0, 0, 0, 0.35);
    opacity: 0.55;
    animation: plat-float 7s ease-in-out infinite;
}

.plat-1 { left: 5%;  bottom: 24%; width: clamp(84px, 11vw, 132px); height: 15px; transform: rotate(-6deg); }
.plat-2 { right: 6%; bottom: 38%; width: clamp(96px, 13vw, 158px); height: 17px; transform: rotate(5deg);  animation-delay: 1.4s; }
.plat-3 { left: 11%; top: 20%;    width: clamp(72px, 9vw, 112px);  height: 13px; transform: rotate(4deg);  animation-delay: 2.8s; }
.plat-4 { right: 12%; top: 27%;   width: clamp(64px, 8vw, 96px);   height: 12px; transform: rotate(-5deg); animation-delay: 4.2s; }
.plat-5 { left: 42%; top: 13%;    width: clamp(56px, 7vw, 88px);   height: 11px; transform: rotate(-3deg); animation-delay: 5.6s; }

/* 向上的阶梯：暗示"往上跳"，压低存在感只做背景层次 */
.plat.climb {
    opacity: 0.3;
}

.plat-6 { left: 28%; bottom: 10%; width: clamp(70px, 9vw, 104px); height: 12px; transform: rotate(-4deg); animation-delay: 0.8s; }
.plat-7 { left: 54%; bottom: 20%; width: clamp(62px, 8vw, 92px);  height: 11px; transform: rotate(5deg);  animation-delay: 2.2s; }
.plat-8 { left: 34%; bottom: 31%; width: clamp(56px, 7vw, 84px);  height: 10px; transform: rotate(-3deg); animation-delay: 3.6s; }
.plat-9 { left: 56%; bottom: 42%; width: clamp(50px, 6vw, 74px);  height: 9px;  transform: rotate(4deg);  animation-delay: 5s; }

@keyframes plat-float {
    0%, 100% { translate: 0 0; }
    50% { translate: 0 -14px; }
}

#btnStartSettings {
    position: absolute;
    top: max(14px, env(safe-area-inset-top));
    right: max(14px, env(safe-area-inset-right));
    z-index: 3;
    display: grid;
    place-items: center;
    width: clamp(38px, 5vw, 46px);
    height: clamp(38px, 5vw, 46px);
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
    font-size: clamp(22px, 3vw, 28px);
    line-height: 1;
    cursor: pointer;
    transition: all 0.25s ease;
    backdrop-filter: blur(10px);
}

#btnStartSettings:hover {
    transform: rotate(60deg) scale(1.08);
    background: rgba(255, 255, 255, 0.15);
    box-shadow: 0 0 20px rgba(255, 255, 255, 0.2);
}

.overlay-inner {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: min(640px, calc(100vw - 32px));
    max-height: calc(100vh - 32px);
    max-height: calc(100dvh - 32px);
    text-align: center;
}

.overlay-inner > * {
    flex-shrink: 0;
}

.title {
    position: relative;
    margin: 0 0 clamp(18px, 3.6vh, 32px);
    font-size: clamp(36px, min(6.6vw, 9vh), 62px);
    line-height: 1;
    white-space: nowrap;
}

.title-text {
    position: relative;
    z-index: 1;
    background: linear-gradient(135deg, #ffe66d 0%, #ff6b6b 40%, #ff8e53 60%, #4a90e2 100%);
    background-size: 300% 300%;
    background-clip: text;
    -webkit-background-clip: text;
    color: transparent;
    -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 0 40px rgba(255, 107, 107, 0.45));
    animation: gradient-shift 3s ease-in-out infinite;
}

.title-glow {
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, #ffe66d, #ff6b6b, #4a90e2);
    background-clip: text;
    -webkit-background-clip: text;
    color: transparent;
    -webkit-text-fill-color: transparent;
    filter: blur(25px);
    opacity: 0.5;
    animation: title-glow-pulse 2.5s ease-in-out infinite;
}

@keyframes gradient-shift {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
}

@keyframes title-glow-pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.8; }
}

#startBtn {
    position: relative;
    width: min(180px, calc(100vw - 48px));
    min-height: clamp(36px, 5.5vh, 42px);
    padding: clamp(8px, 1.5vh, 11px) clamp(22px, 4.5vw, 38px);
    overflow: hidden;
    border: 0;
    border-radius: 999px;
    background: linear-gradient(135deg, #ff6b6b, #ee5a6f, #ff8e53);
    background-size: 200% 200%;
    color: #fff;
    font-size: clamp(13px, min(1.8vw, 2.2vh), 16px);
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 10px 40px rgba(238, 90, 111, 0.42), 0 0 60px rgba(255, 107, 107, 0.22);
    transition: transform 0.25s ease, box-shadow 0.25s ease;
    animation: btn-gradient 4s ease-in-out infinite;
}

#startBtn .btn-content,
#startBtn .btn-glow {
    position: relative;
    z-index: 1;
}

#startBtn .btn-glow {
    position: absolute;
    inset: -4px;
    z-index: 0;
    border-radius: inherit;
    background: linear-gradient(135deg, #ff6b6b, #ff8e53, #ffe66d, #ff6b6b);
    background-size: 400% 400%;
    filter: blur(20px);
    opacity: 0;
    animation: glow-rotate 3s linear infinite;
    transition: opacity 0.25s ease;
}

@keyframes btn-gradient {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
}

@keyframes glow-rotate {
    0% { background-position: 0% 50%; }
    100% { background-position: 400% 50%; }
}

#startBtn:hover:not(:disabled) {
    transform: translateY(-4px) scale(1.02);
    box-shadow: 0 15px 50px rgba(238, 90, 111, 0.55), 0 0 80px rgba(255, 107, 107, 0.3);
}

#startBtn:hover:not(:disabled) .btn-glow {
    opacity: 0.7;
}

#startBtn:active:not(:disabled) {
    transform: translateY(-1px) scale(0.98);
}

#startBtn:disabled {
    background: rgba(255, 255, 255, 0.08);
    box-shadow: none;
    cursor: wait;
    animation: none;
}

#startBtn:disabled .btn-glow {
    display: none;
}

@media (max-height: 700px) {
    .title {
        font-size: clamp(32px, min(7vw, 9vh), 48px);
        margin-bottom: clamp(12px, 2.4vh, 20px);
    }
    #startBtn {
        min-height: clamp(40px, 7vh, 50px);
        padding-block: clamp(10px, 2vh, 14px);
        font-size: clamp(16px, min(2.2vw, 2.8vh), 20px);
    }
    #btnStartSettings {
        width: 36px;
        height: 36px;
        font-size: 21px;
    }
}

@media (max-width: 560px) {
    .overlay-inner {
        width: calc(100vw - 24px);
    }
    .title {
        font-size: clamp(32px, 11vw, 52px);
        white-space: normal;
    }
    #startBtn {
        font-size: clamp(16px, 5vw, 21px);
    }
}
</style>
