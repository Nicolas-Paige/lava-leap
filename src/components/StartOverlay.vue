<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useI18n } from '../composables/useI18n';
import { MODES } from '../game/modes';
import type { GameMode } from '../game/modes/types';

const props = defineProps<{
    loadingProgress: number;
    loadError: string | null;
    isTouchDevice: boolean;
}>();

const emit = defineEmits<{
    start: [mode: GameMode];
    settings: [];
}>();

const { tr } = useI18n();

const started = ref(false);
const selectedModeId = ref(MODES[0]?.id ?? 'classic');

// 根据设备选择操作提示文案
const hintText = computed(() =>
    props.isTouchDevice ? tr('startHintTouch') : tr('startHint')
);

// 加载失败时重置 started，允许用户重试
watch(() => props.loadError, (err) => {
    if (err) started.value = false;
});

const selectedMode = computed<GameMode>(
    () => MODES.find(m => m.id === selectedModeId.value) ?? MODES[0],
);

const btnText = computed(() => {
    if (props.loadError) return tr('loadingFailed');
    if (started.value && props.loadingProgress > 0) return `${tr('loadingProgress')} ${props.loadingProgress}%`;
    if (started.value) return tr('loadingProgress');
    return tr('startBtn');
});

function onStart() {
    if (started.value) return;
    started.value = true;
    emit('start', selectedMode.value);
}

// 浮动粒子
const particles = ref<{ x: number; y: number; size: number; duration: number; delay: number }[]>([]);
onMounted(() => {
    for (let i = 0; i < 30; i++) {
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

        <button id="btnStartSettings" :title="tr('settings')" @click="emit('settings')">⚙</button>

        <div class="overlay-inner">
            <h1 class="title">
                <span class="title-text">Lava Leap</span>
                <span class="title-glow">Lava Leap</span>
            </h1>
            <p class="hint-text" v-html="hintText.replace(/\n/g, '<br>')"></p>

            <!-- 模式选择 -->
            <div v-if="MODES.length > 1" class="mode-cards">
                <div
                    v-for="mode in MODES"
                    :key="mode.id"
                    class="mode-card"
                    :class="{ active: mode.id === selectedModeId }"
                    @click="selectedModeId = mode.id"
                >
                    <div class="mode-icon">{{ mode.icon }}</div>
                    <div class="mode-name">{{ tr(mode.name) }}</div>
                    <div class="mode-desc">{{ tr(mode.description) }}</div>
                    <div class="mode-card-glow"></div>
                </div>
            </div>
            <!-- 仅一个模式时显示标签 + 描述 -->
            <div v-else class="single-mode">
                <span class="mode-icon">{{ selectedMode.icon }}</span>
                <span class="mode-name">{{ tr(selectedMode.name) }}</span>
                <span class="mode-desc-inline">{{ tr(selectedMode.description) }}</span>
            </div>

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
    background: linear-gradient(135deg, #0a0a1a 0%, #1a1a3e 50%, #0f1a40 100%);
    z-index: 1000;
    color: #fff;
    display: flex;
    flex-direction: column;
    padding:
        max(14px, env(safe-area-inset-top))
        max(14px, env(safe-area-inset-right))
        max(14px, env(safe-area-inset-bottom))
        max(14px, env(safe-area-inset-left));
    box-sizing: border-box;
    overflow: hidden;
}

/* 浮动粒子 */
.particles {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
}
.particle {
    position: absolute;
    background: radial-gradient(circle, rgba(255, 180, 80, 1), rgba(255, 80, 30, 0.8) 40%, rgba(255, 50, 20, 0) 70%);
    border-radius: 50%;
    animation: float-particle linear infinite;
    opacity: 0;
    box-shadow: 0 0 6px 2px rgba(255, 150, 50, 0.4);
}
@keyframes float-particle {
    0% { transform: translateY(100vh) translateX(0) scale(0.5); opacity: 0; }
    5% { opacity: 0.8; }
    50% { opacity: 0.6; }
    95% { opacity: 0.8; }
    100% { transform: translateY(-20vh) translateX(80px) scale(1.2); opacity: 0; }
}

/* 光晕 */
.glow {
    position: absolute;
    border-radius: 50%;
    filter: blur(60px);
    opacity: 0.25;
    animation: pulse-glow 6s ease-in-out infinite;
    pointer-events: none;
}
.glow-1 {
    width: 500px; height: 500px;
    background: radial-gradient(circle, rgba(255, 107, 107, 0.6), transparent 70%);
    top: -150px; right: -150px;
    animation-delay: 0s;
}
.glow-2 {
    width: 400px; height: 400px;
    background: radial-gradient(circle, rgba(74, 144, 226, 0.5), transparent 70%);
    bottom: -120px; left: -120px;
    animation-delay: 2s;
}
.glow-3 {
    width: 350px; height: 350px;
    background: radial-gradient(circle, rgba(255, 230, 109, 0.5), transparent 70%);
    top: 30%; left: 50%;
    transform: translateX(-50%);
    animation-delay: 4s;
}
@keyframes pulse-glow {
    0%, 100% { opacity: 0.2; transform: scale(1); }
    50% { opacity: 0.35; transform: scale(1.15); }
}

/* 右上角设置按钮 */
#btnStartSettings {
    position: absolute;
    top: max(14px, env(safe-area-inset-top));
    right: max(14px, env(safe-area-inset-right));
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.05);
    color: #fff;
    font-size: 28px;
    line-height: 44px;
    cursor: pointer;
    transition: all 0.3s ease;
    backdrop-filter: blur(10px);
    text-align: center;
    padding: 0;
    z-index: 2;
}
#btnStartSettings:hover {
    background: rgba(255, 255, 255, 0.15);
    transform: rotate(60deg) scale(1.1);
    box-shadow: 0 0 20px rgba(255, 255, 255, 0.2);
}

/* 内层 */
.overlay-inner {
    margin: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    max-width: 720px;
    position: relative;
    z-index: 1;
}

/* 标题 */
.title {
    position: relative;
    font-size: 72px;
    margin: 0 0 16px 0;
    text-align: center;
}
.title-text {
    position: relative;
    z-index: 1;
    background: linear-gradient(135deg, #ffe66d 0%, #ff6b6b 40%, #ff8e53 60%, #4a90e2 100%);
    background-size: 300% 300%;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: gradient-shift 3s ease-in-out infinite;
    filter: drop-shadow(0 0 40px rgba(255, 107, 107, 0.6));
}
.title-glow {
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, #ffe66d, #ff6b6b, #4a90e2);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    filter: blur(25px);
    opacity: 0.6;
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

.hint-text {
    font-size: 16px;
    color: rgba(255, 255, 255, 0.5);
    margin: 0 0 36px 0;
    text-align: center;
    line-height: 1.8;
    max-width: 560px;
    text-shadow: 0 0 10px rgba(255, 255, 255, 0.1);
}

/* 开始按钮 */
#startBtn {
    position: relative;
    font-size: 24px;
    font-weight: bold;
    color: #fff;
    background: linear-gradient(135deg, #ff6b6b, #ee5a6f, #ff8e53);
    background-size: 200% 200%;
    border: none;
    padding: 20px 64px;
    border-radius: 50px;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 10px 40px rgba(238, 90, 111, 0.5), 0 0 60px rgba(255, 107, 107, 0.3);
    min-width: 260px;
    overflow: hidden;
    animation: btn-gradient 4s ease-in-out infinite;
}
@keyframes btn-gradient {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
}
#startBtn .btn-content {
    position: relative;
    z-index: 1;
}
#startBtn .btn-glow {
    position: absolute;
    inset: -4px;
    background: linear-gradient(135deg, #ff6b6b, #ff8e53, #ffe66d, #ff6b6b);
    background-size: 400% 400%;
    border-radius: 50px;
    opacity: 0;
    transition: opacity 0.3s ease;
    z-index: 0;
    filter: blur(20px);
    animation: glow-rotate 3s linear infinite;
}
@keyframes glow-rotate {
    0% { background-position: 0% 50%; }
    100% { background-position: 400% 50%; }
}
#startBtn:hover:not(:disabled) {
    transform: translateY(-4px) scale(1.03);
    box-shadow: 0 15px 50px rgba(238, 90, 111, 0.6), 0 0 80px rgba(255, 107, 107, 0.4);
}
#startBtn:hover:not(:disabled) .btn-glow {
    opacity: 0.7;
}
#startBtn:active:not(:disabled) {
    transform: translateY(-1px) scale(0.98);
}
#startBtn:disabled {
    background: rgba(255, 255, 255, 0.08);
    cursor: wait;
    box-shadow: none;
    backdrop-filter: blur(10px);
    animation: none;
}
#startBtn:disabled .btn-glow {
    display: none;
}

/* 模式选择卡片 */
.mode-cards {
    display: flex;
    gap: 20px;
    margin: 0 0 36px 0;
    flex-wrap: wrap;
    justify-content: center;
    max-width: 100%;
}

.mode-card {
    position: relative;
    width: 180px;
    padding: 20px 16px;
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    cursor: pointer;
    transition: all 0.3s ease;
    text-align: center;
    color: #fff;
    flex: 0 0 auto;
    backdrop-filter: blur(12px);
    overflow: hidden;
}
.mode-card .mode-card-glow {
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(255, 107, 107, 0.15), rgba(74, 144, 226, 0.15));
    opacity: 0;
    transition: opacity 0.3s ease;
    border-radius: 20px;
}
.mode-card:hover {
    background: rgba(255, 255, 255, 0.08);
    transform: translateY(-6px) scale(1.02);
    border-color: rgba(255, 255, 255, 0.2);
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
}
.mode-card:hover .mode-card-glow {
    opacity: 1;
}
.mode-card.active {
    background: rgba(255, 107, 107, 0.1);
    border-color: rgba(255, 107, 107, 0.6);
    box-shadow: 0 0 40px rgba(255, 107, 107, 0.3), inset 0 0 40px rgba(255, 107, 107, 0.08);
    transform: translateY(-4px);
}
.mode-card.active .mode-card-glow {
    opacity: 1;
    background: linear-gradient(135deg, rgba(255, 107, 107, 0.2), rgba(255, 142, 83, 0.15));
}
.mode-icon { font-size: 44px; margin-bottom: 10px; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.4)); }
.mode-name { font-size: 18px; font-weight: bold; margin-bottom: 6px; }
.mode-desc { font-size: 13px; color: rgba(255, 255, 255, 0.5); line-height: 1.4; }

/* 单模式标签 */
.single-mode {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0 0 36px 0;
    color: rgba(255, 255, 255, 0.6);
    font-size: 16px;
    flex-wrap: wrap;
    justify-content: center;
    max-width: 80vw;
    padding: 14px 24px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(12px);
}
.single-mode .mode-icon { font-size: 28px; margin: 0; }
.single-mode .mode-name { color: #fff; font-weight: bold; margin: 0; font-size: 17px; }
.single-mode .mode-desc-inline { color: rgba(255, 255, 255, 0.4); font-size: 14px; }
.single-mode .mode-desc-inline::before {
    content: "·";
    margin: 0 8px;
    color: rgba(255, 255, 255, 0.25);
}

/* =====================================================
   响应式
   ===================================================== */
@media (max-width: 480px) and (orientation: portrait) {
    .title { font-size: 44px; }
    .hint-text { font-size: 13px; line-height: 1.6; margin-bottom: 20px; }
    .mode-card { width: 140px; padding: 14px 10px; }
    .mode-icon { font-size: 30px; }
    .mode-name { font-size: 14px; }
    .mode-desc { font-size: 11px; }
    .mode-cards { margin-bottom: 24px; gap: 12px; }
    .single-mode { margin-bottom: 24px; }
    #startBtn { font-size: 18px; padding: 14px 44px; min-width: 200px; }
    #btnStartSettings { width: 38px; height: 38px; font-size: 26px; line-height: 38px; }
}
@media (max-height: 620px) and (orientation: portrait) {
    .title { font-size: 36px; }
    .hint-text { font-size: 12px; margin-bottom: 16px; }
    .mode-card { width: 120px; padding: 10px 8px; }
    .mode-icon { font-size: 26px; margin-bottom: 4px; }
    .mode-name { font-size: 13px; }
    .mode-cards { margin-bottom: 18px; gap: 10px; }
    .single-mode { margin-bottom: 18px; }
    #startBtn { font-size: 17px; padding: 12px 36px; min-width: 180px; }
}
@media (max-height: 460px) and (orientation: landscape) {
    .title { font-size: 36px; margin-bottom: 6px; }
    .hint-text { font-size: 12px; line-height: 1.5; margin-bottom: 14px; }
    .mode-card { width: 125px; padding: 10px 8px; }
    .mode-icon { font-size: 26px; margin-bottom: 4px; }
    .mode-name { font-size: 13px; margin-bottom: 2px; }
    .mode-desc { font-size: 10px; }
    .mode-cards { margin-bottom: 16px; gap: 10px; }
    .single-mode { margin-bottom: 16px; }
    #startBtn { font-size: 17px; padding: 12px 40px; min-width: 200px; }
    #btnStartSettings { width: 38px; height: 38px; font-size: 26px; line-height: 38px; }
}
@media (max-height: 380px) and (orientation: landscape) {
    .title { font-size: 30px; }
    .hint-text { font-size: 11px; margin-bottom: 10px; }
    .mode-card { width: 110px; padding: 8px 6px; border-radius: 12px; }
    .mode-icon { font-size: 22px; margin-bottom: 2px; }
    .mode-name { font-size: 12px; }
    .mode-desc { font-size: 9px; line-height: 1.3; }
    .mode-cards { margin-bottom: 12px; gap: 8px; }
    .single-mode { margin-bottom: 12px; font-size: 12px; }
    #startBtn { font-size: 15px; padding: 10px 32px; min-width: 160px; border-radius: 40px; }
}
@media (max-width: 580px) and (orientation: landscape) {
    .mode-card { width: calc(50% - 6px); box-sizing: border-box; }
}
</style>
