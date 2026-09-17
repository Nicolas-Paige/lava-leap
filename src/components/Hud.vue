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
/* 键盘提示 */
.hud-tip {
    position: absolute;
    top: 15px;
    left: 15px;
    color: rgba(255, 255, 255, 0.7);
    background: rgba(10, 10, 30, 0.75);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    padding: 10px 16px;
    border-radius: var(--ui-radius-sm);
    z-index: 99;
    font-size: 13px;
    line-height: 1.5;
    max-width: 320px;
    display: flex;
    align-items: flex-start;
    gap: 8px;
}

.tip-icon {
    font-size: 14px;
    flex-shrink: 0;
    margin-top: 1px;
}

.hud-tip-enter-active { transition: opacity 0.5s ease 1s; }
.hud-tip-leave-active { transition: opacity 0.5s ease; }
.hud-tip-enter-from, .hud-tip-leave-to { opacity: 0; }

/* 层数显示 */
.layer {
    position: absolute;
    top: 15px;
    right: 15px;
    color: #fff;
    background: rgba(10, 10, 30, 0.75);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    padding: 14px 22px;
    border-radius: var(--ui-radius-md);
    z-index: 99;
    text-align: right;
    line-height: 1.2;
    position: relative;
    overflow: hidden;
}

.layer-glow {
    position: absolute;
    top: -10px;
    right: -10px;
    width: 100px;
    height: 100px;
    pointer-events: none;
    opacity: 0.5;
    transition: background 1s ease;
}

.layer-main {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 4px;
}

.layer-number {
    font-size: 32px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    transition: color 0.8s ease, text-shadow 0.8s ease;
    letter-spacing: -1px;
}

.layer-label {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.5);
    font-weight: 500;
}

.layer-best {
    position: relative;
    z-index: 1;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
    margin-top: 6px;
    font-weight: 500;
}

.best-num {
    color: var(--ui-accent-green);
    font-weight: 600;
}

/* 触控设备：移到左上角 */
.layer.touch {
    top: 15px;
    right: auto;
    left: 15px;
    padding: 10px 16px;
}

.layer.touch .layer-number {
    font-size: 24px;
}
</style>
