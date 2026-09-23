<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { CHARACTERS } from '../game/characters';
import { useI18n } from '../composables/useI18n';

const props = defineProps<{
    characterIndex: number;
    loadingProgress: number;
    loadError: string | null;
}>();

const emit = defineEmits<{
    prev: [];
    next: [];
    confirm: [];
    back: [];
}>();

const { tr } = useI18n();

const currentCharacter = computed(() => CHARACTERS[props.characterIndex] ?? CHARACTERS[0]);

// 加载提示延迟显示：加载超过 150ms 才显示，避免本地快速加载时闪烁
const showLoading = ref(false);
let loadingTimer: ReturnType<typeof setTimeout> | null = null;
watch(() => props.loadingProgress, (val) => {
    const isLoading = val > 0 && val < 100;
    if (isLoading) {
        if (!loadingTimer) {
            loadingTimer = setTimeout(() => { showLoading.value = true; }, 150);
        }
    } else {
        if (loadingTimer) { clearTimeout(loadingTimer); loadingTimer = null; }
        showLoading.value = false;
    }
});

// ===== 触摸滑动 =====
const touchStartX = ref(0);
const touchStartY = ref(0);
const SWIPE_THRESHOLD = 50; // 滑动触发阈值（px）

function onTouchStart(e: TouchEvent) {
    touchStartX.value = e.touches[0].clientX;
    touchStartY.value = e.touches[0].clientY;
}
function onTouchEnd(e: TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.value;
    const dy = e.changedTouches[0].clientY - touchStartY.value;
    // 水平滑动距离大于垂直滑动，且超过阈值
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
        if (dx > 0) emit('prev');  // 向右滑 → 上一个
        else emit('next');          // 向左滑 → 下一个
    }
}

// ===== 键盘左右切换 =====
function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft') emit('prev');
    else if (e.key === 'ArrowRight') emit('next');
    else if (e.key === 'Enter') emit('confirm');
    else if (e.key === 'Escape') emit('back');
}

onMounted(() => {
    window.addEventListener('keydown', onKeyDown);
});
onUnmounted(() => {
    window.removeEventListener('keydown', onKeyDown);
    if (loadingTimer) clearTimeout(loadingTimer);
});
</script>

<template>
    <div
        id="characterSelect"
        @touchstart.passive="onTouchStart"
        @touchend.passive="onTouchEnd"
    >
        <!-- 顶部标题 + 返回 -->
        <div class="cs-top">
            <button class="cs-back" @click="emit('back')" title="返回">←</button>
            <h2 class="cs-title">选择角色</h2>
            <div class="cs-placeholder"></div>
        </div>

        <!-- 左右箭头 -->
        <button class="cs-arrow cs-arrow-left" @click="emit('prev')" title="上一个">‹</button>
        <button class="cs-arrow cs-arrow-right" @click="emit('next')" title="下一个">›</button>

        <!-- 角色指示器（小圆点） -->
        <div class="cs-dots">
            <span
                v-for="(char, i) in CHARACTERS"
                :key="char.id"
                class="cs-dot"
                :class="{ active: i === characterIndex }"
                @click="i > characterIndex ? emit('next') : emit('prev')"
            ></span>
        </div>

        <!-- 加载中提示 -->
        <div v-if="showLoading" class="cs-loading">
            加载中... {{ loadingProgress }}%
        </div>

        <!-- 底部信息 + 按钮 -->
        <div class="cs-bottom">
            <button class="cs-confirm" @click="emit('confirm')">
                立即出发
            </button>
        </div>
    </div>
</template>

<style scoped>
#characterSelect {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: #fff;
    background: linear-gradient(
        to bottom,
        rgba(10, 15, 30, 0.88) 0%,
        rgba(10, 15, 30, 0.2) 26%,
        rgba(10, 15, 30, 0.2) 64%,
        rgba(10, 15, 30, 0.92) 100%
    );
    touch-action: pan-y;
}

.cs-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: max(0.875rem, env(safe-area-inset-top)) 1.25rem 0;
}

.cs-title {
    margin: 0;
    font-size: 1.375rem;
    font-weight: 700;
    letter-spacing: 0;
    background: linear-gradient(90deg, #ffe66d, #ff6b6b);
    background-clip: text;
    -webkit-background-clip: text;
    color: transparent;
    -webkit-text-fill-color: transparent;
}

.cs-back,
.cs-placeholder {
    width: 2.75rem;
}

.cs-back {
    display: grid;
    place-items: center;
    height: 2.75rem;
    padding: 0 0 2px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    font-family: Arial, sans-serif;
    font-size: 1.375rem;
    line-height: 1;
    cursor: pointer;
    transition: background 0.2s ease, transform 0.2s ease;
}

.cs-back:hover {
    transform: scale(1.06);
    background: rgba(255, 255, 255, 0.2);
}

.cs-arrow {
    position: absolute;
    top: 50%;
    z-index: 2;
    display: grid;
    place-items: center;
    width: 3.25rem;
    height: 3.25rem;
    padding: 0;
    transform: translateY(-50%);
    border: 2px solid rgba(255, 255, 255, 0.22);
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    font-size: 2rem;
    line-height: 1;
    cursor: pointer;
    backdrop-filter: blur(5px);
    transition: all 0.2s ease;
}

.cs-arrow:hover {
    transform: translateY(-50%) scale(1.08);
    background: rgba(255, 255, 255, 0.18);
    border-color: rgba(255, 255, 255, 0.42);
}

.cs-arrow-left {
    left: max(1rem, env(safe-area-inset-left));
}

.cs-arrow-right {
    right: max(1rem, env(safe-area-inset-right));
}

.cs-dots {
    position: absolute;
    bottom: 6rem;
    left: 50%;
    display: flex;
    gap: 0.5rem;
    transform: translateX(-50%);
}

.cs-dot {
    width: 0.55rem;
    height: 0.55rem;
    border: 0;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.28);
    cursor: pointer;
    transition: all 0.2s ease;
}

.cs-dot.active {
    width: 1.5rem;
    background: #fff;
}

.cs-loading {
    position: absolute;
    top: 50%;
    left: 50%;
    padding: 0.625rem 1.375rem;
    transform: translate(-50%, -50%);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.58);
    color: #dbe4ff;
    font-size: 0.9375rem;
    white-space: nowrap;
}

.cs-bottom {
    display: flex;
    justify-content: center;
    margin-top: auto;
    padding: 0 1.25rem max(1.125rem, env(safe-area-inset-bottom));
}

.cs-confirm {
    min-width: min(12rem, calc(100vw - 2.5rem));
    min-height: 2.875rem;
    padding: 0.75rem 2rem;
    border: 0;
    border-radius: 999px;
    background: linear-gradient(135deg, #ff6b6b, #ee5a6f);
    color: #fff;
    font-size: 1.0625rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 8px 30px rgba(238, 90, 111, 0.42);
    transition: transform 0.25s ease, box-shadow 0.25s ease;
}

.cs-confirm:hover {
    transform: translateY(-3px);
    box-shadow: 0 13px 40px rgba(238, 90, 111, 0.6);
}

.cs-confirm:active {
    transform: translateY(0) scale(0.98);
}

@media (max-height: 620px) {
    .cs-top {
        padding-top: max(10px, env(safe-area-inset-top));
    }
    .cs-title {
        font-size: 1.125rem;
    }
    .cs-arrow {
        width: 2.75rem;
        height: 2.75rem;
        font-size: 1.75rem;
    }
    .cs-dots {
        bottom: 4.75rem;
    }
    .cs-bottom {
        padding-bottom: max(12px, env(safe-area-inset-bottom));
    }
    .cs-confirm {
        min-width: 10.5rem;
        min-height: 2.375rem;
        padding: 0.5rem 1.5rem;
        font-size: 0.9375rem;
    }
}

@media (max-width: 560px) {
    .cs-title {
        font-size: 1.125rem;
        letter-spacing: 0;
    }
    .cs-arrow-left {
        left: max(0.5rem, env(safe-area-inset-left));
    }
    .cs-arrow-right {
        right: max(0.5rem, env(safe-area-inset-right));
    }
    .cs-dots {
        bottom: 5.5rem;
    }
}
</style>
