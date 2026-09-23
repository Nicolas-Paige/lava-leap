<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '../composables/useI18n';

const props = defineProps<{
    currentLayer: number;
    bestLayer: number;
    isTouchDevice: boolean;
}>();

const { tr } = useI18n();

// 层数等级颜色（越高越炽热）
const layerColor = computed(() => {
    const l = props.currentLayer;
    if (l <= 6) return '#6dff8e';    // 草绿
    if (l <= 14) return '#866043';   // 泥棕
    if (l <= 28) return '#b0b0b0';   // 石灰
    if (l <= 45) return '#4a90e2';   // 蓝灰
    return '#fbbf24';                // 雪线金
});

const layerGlow = computed(() => {
    const l = props.currentLayer;
    if (l <= 6) return 'rgba(109, 255, 142, 0.4)';
    if (l <= 14) return 'rgba(134, 96, 67, 0.4)';
    if (l <= 28) return 'rgba(176, 176, 176, 0.3)';
    if (l <= 45) return 'rgba(74, 144, 226, 0.4)';
    return 'rgba(251, 191, 36, 0.5)';
});
</script>

<template>
    <!-- 键盘提示（仅 PC 显示） -->
    <Transition name="hud-tip">
        <div v-if="!isTouchDevice" class="hud-tip">
            <span class="tip-icon">💡</span>
            {{ tr('keyboardTip') }}
        </div>
    </Transition>

    <!-- 层数显示 -->
    <div class="layer" :class="{ touch: isTouchDevice }">
        <div class="layer-glow" :style="{ background: `radial-gradient(circle, ${layerGlow}, transparent 70%)` }"></div>
        <div class="layer-main">
            <span class="layer-number" :style="{ color: layerColor, textShadow: `0 0 20px ${layerGlow}` }">{{ currentLayer }}</span>
            <span class="layer-label">{{ tr('layerUnit') }}</span>
        </div>
        <div class="layer-best">
            {{ tr('best') }}<span class="best-num">{{ bestLayer }}</span>
        </div>
    </div>
</template>

<style scoped>
.hud-tip {
    position: absolute;
    top: max(0.75rem, env(safe-area-inset-top));
    left: max(0.75rem, env(safe-area-inset-left));
    z-index: 99;
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    max-width: min(22rem, calc(100vw - 2rem));
    padding: 0.625rem 0.875rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--ui-radius-sm);
    background: rgba(10, 10, 30, 0.76);
    color: rgba(255, 255, 255, 0.75);
    font-size: 0.8125rem;
    line-height: 1.5;
    backdrop-filter: blur(8px);
}

.tip-icon {
    flex: 0 0 auto;
    margin-top: 0.0625rem;
    font-size: 0.9375rem;
}

.hud-tip-enter-active {
    transition: opacity 0.5s ease 1s;
}

.hud-tip-leave-active {
    transition: opacity 0.5s ease;
}

.hud-tip-enter-from,
.hud-tip-leave-to {
    opacity: 0;
}

.layer {
    position: absolute;
    top: max(0.75rem, env(safe-area-inset-top));
    right: max(0.75rem, env(safe-area-inset-right));
    z-index: 99;
    overflow: hidden;
    padding: 0.75rem 1.125rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--ui-radius-md);
    background: rgba(10, 10, 30, 0.76);
    color: #fff;
    line-height: 1.2;
    text-align: right;
    backdrop-filter: blur(8px);
}

.layer-glow {
    position: absolute;
    top: -10px;
    right: -10px;
    width: 6rem;
    height: 6rem;
    opacity: 0.5;
    pointer-events: none;
    transition: background 1s ease;
}

.layer-main {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 0.3125rem;
}

.layer-number {
    font-size: 2rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
    transition: color 0.8s ease, text-shadow 0.8s ease;
}

.layer-label {
    color: rgba(255, 255, 255, 0.55);
    font-size: 0.875rem;
    font-weight: 500;
}

.layer-best {
    position: relative;
    z-index: 1;
    margin-top: 0.3125rem;
    color: rgba(255, 255, 255, 0.45);
    font-size: 0.8125rem;
    font-weight: 500;
}

.best-num {
    color: var(--ui-accent-green);
    font-weight: 600;
}

.layer.touch {
    top: max(0.75rem, env(safe-area-inset-top));
    right: auto;
    left: max(0.75rem, env(safe-area-inset-left));
    padding: 0.625rem 0.875rem;
}

.layer.touch .layer-number {
    font-size: 1.625rem;
}

@media (max-height: 500px) {
    .hud-tip {
        max-width: min(18rem, calc(100vw - 2rem));
        font-size: 0.75rem;
        line-height: 1.35;
    }
    .layer {
        padding: 0.5rem 0.75rem;
    }
    .layer-number {
        font-size: 1.625rem;
    }
}
</style>
