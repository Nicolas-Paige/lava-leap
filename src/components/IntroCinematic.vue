<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n, type TranslationKey } from '../composables/useI18n';

// 开场 CG 的 UI 层：黑场 / 电影黑边 / 字幕 / 标题 / 跳过提示
// 运镜本身在 src/game/IntroCinematic.ts，这里只做呈现与「任意键跳过」。

const props = defineProps<{
    subtitle: number;      // 当前字幕索引，-1 表示无字幕
    titleVisible: boolean;
    fade: number;          // 0~1 黑场不透明度
}>();

const emit = defineEmits<{ skip: [] }>();

const { tr } = useI18n();

const LINE_KEYS: TranslationKey[] = ['introLine1', 'introLine2', 'introLine3'];

const currentLine = computed(() =>
    props.subtitle >= 0 && props.subtitle < LINE_KEYS.length
        ? tr(LINE_KEYS[props.subtitle])
        : '',
);

const showSkipHint = ref(false);
let hintTimer: number | undefined;
let skipped = false;

function onSkip() {
    if (skipped) return;   // 跳过是幂等的，避免连点重复触发
    skipped = true;
    emit('skip');
}

function onKeyDown() { onSkip(); }

onMounted(() => {
    hintTimer = window.setTimeout(() => { showSkipHint.value = true; }, 1200);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onSkip);
    window.addEventListener('touchstart', onSkip, { passive: true });
});

onUnmounted(() => {
    if (hintTimer) window.clearTimeout(hintTimer);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('pointerdown', onSkip);
    window.removeEventListener('touchstart', onSkip);
});
</script>

<template>
    <div class="intro" @pointerdown="onSkip">
        <!-- 黑场：开场淡入 / 结尾淡出 -->
        <div class="intro-fade" :style="{ opacity: fade }"></div>

        <!-- 电影黑边 -->
        <div class="bar bar-top"></div>
        <div class="bar bar-bottom"></div>

        <!-- 标题 -->
        <Transition name="title">
            <div v-if="titleVisible" class="title-block">
                <h1 class="title">LAVA LEAP</h1>
                <p class="title-sub">{{ tr('introTitleSub') }}</p>
            </div>
        </Transition>

        <!-- 字幕区 -->
        <div class="subtitle-zone">
            <Transition name="line" mode="out-in">
                <p v-if="currentLine" :key="subtitle" class="line">{{ currentLine }}</p>
            </Transition>
        </div>

        <!-- 跳过提示 -->
        <Transition name="line">
            <p v-if="showSkipHint" class="skip-hint">{{ tr('introSkip') }}</p>
        </Transition>
    </div>
</template>

<style scoped>
.intro {
    position: fixed;
    inset: 0;
    z-index: 2500;
    overflow: hidden;
    user-select: none;
}

.intro-fade {
    position: absolute;
    inset: 0;
    background: #000;
    pointer-events: none;
}

/* 上下电影黑边 */
.bar {
    position: absolute;
    left: 0;
    right: 0;
    height: 11vh;
    background: #000;
    pointer-events: none;
}
.bar-top { top: 0; }
.bar-bottom { bottom: 0; }

.title-block {
    position: absolute;
    top: 36%;
    width: 100%;
    text-align: center;
}

.title {
    margin: 0;
    color: #fff;
    font-size: clamp(2.25rem, 7vw, 5.25rem);
    font-weight: 800;
    letter-spacing: 0.16em;
    line-height: 1.1;
    text-shadow: 0 0 32px rgba(255, 122, 24, 0.55), 0 8px 26px rgba(0, 0, 0, 0.85);
}

.title-sub {
    margin: 0.9rem 0 0;
    color: #ffd9a8;
    font-size: clamp(0.9rem, 2vw, 1.35rem);
    font-weight: 500;
    letter-spacing: 0.55em;
    text-indent: 0.55em;   /* 抵消末字右侧字距，保证视觉居中 */
    text-shadow: 0 2px 14px rgba(0, 0, 0, 0.8);
}

.subtitle-zone {
    position: absolute;
    bottom: 14.5vh;
    left: 0;
    width: 100%;
    padding: 0 1.5rem;
    text-align: center;
}

.line {
    margin: 0;
    color: #fff;
    font-size: clamp(0.95rem, 2.1vw, 1.45rem);
    font-weight: 500;
    letter-spacing: 0.08em;
    line-height: 1.6;
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.9);
}

.skip-hint {
    position: absolute;
    right: 2rem;
    bottom: 13.5vh;
    margin: 0;
    color: rgba(255, 255, 255, 0.5);
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    text-shadow: 0 1px 6px rgba(0, 0, 0, 0.8);
}

/* 标题浮现：带模糊+上浮 */
.title-enter-active {
    transition: opacity 1s ease, transform 1s cubic-bezier(0.2, 0.8, 0.2, 1), filter 1s ease;
}
.title-enter-from {
    opacity: 0;
    filter: blur(12px);
    transform: translateY(20px) scale(0.96);
}

/* 字幕 / 提示淡入淡出 */
.line-enter-active,
.line-leave-active {
    transition: opacity 0.45s ease, transform 0.45s ease;
}
.line-enter-from {
    opacity: 0;
    transform: translateY(10px);
}
.line-leave-to {
    opacity: 0;
    transform: translateY(-6px);
}

@media (max-width: 640px) {
    .skip-hint {
        right: 1rem;
        font-size: 0.7rem;
    }
}
</style>
