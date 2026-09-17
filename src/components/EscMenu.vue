<script setup lang="ts">
import type { GamePhase } from '../game/types';
import { useI18n } from '../composables/useI18n';

const props = defineProps<{
    phase: GamePhase;
}>();

const emit = defineEmits<{
    restart: [];
    settings: [];
    quit: [];
    close: [];
    leaderboard: [];
}>();

const { tr } = useI18n();

// 是否显示 ESC 菜单（暂停 或 死亡 菜单）
function isMenuVisible(): boolean {
    return props.phase === 'paused' || props.phase === 'dead';
}
</script>

<template>
    <Transition name="ui-fade">
        <div v-if="isMenuVisible()" class="ui-panel">
            <div class="menu-card">
                <!-- 顶部光效 -->
                <div class="menu-card-glow" :class="{ 'death-glow': phase === 'dead' }"></div>

                <h2 class="ui-title">
                    <span class="ui-title-icon">{{ phase === 'dead' ? '💀' : '⏸️' }}</span>
                    {{ phase === 'dead' ? tr('dead') : tr('paused') }}
                </h2>

                <!-- 暂停时显示"继续游戏" -->
                <button v-if="phase === 'paused'" class="ui-btn ui-btn-primary" @click="emit('close')">
                    <span class="ui-btn-icon">▶</span>
                    {{ tr('resume') }}
                </button>

                <button class="ui-btn ui-btn-info" @click="emit('restart')">
                    <span class="ui-btn-icon">↻</span>
                    {{ tr('restart') }}
                </button>

                <button class="ui-btn ui-btn-gold" @click="emit('leaderboard')">
                    <span class="ui-btn-icon">🏆</span>
                    {{ tr('leaderboard') || '排行榜' }}
                </button>

                <button class="ui-btn ui-btn-subtle" @click="emit('settings')">
                    <span class="ui-btn-icon">⚙️</span>
                    {{ tr('settings') }}
                </button>

                <button class="ui-btn ui-btn-danger" style="margin-bottom: 0;" @click="emit('quit')">
                    <span class="ui-btn-icon">✕</span>
                    {{ tr('quit') }}
                </button>

                <p class="ui-hint">
                    {{ phase === 'dead' ? tr('deadHint') : tr('pausedHint') }}
                </p>
            </div>
        </div>
    </Transition>
</template>

<style scoped>
.menu-card {
    margin: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    max-width: 360px;
    background: var(--ui-bg-card);
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-lg);
    box-shadow: var(--ui-shadow);
    padding: 32px 24px;
    position: relative;
    overflow: hidden;
    animation: ui-card-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.menu-card-glow {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 200px;
    height: 100px;
    background: radial-gradient(ellipse, rgba(255, 255, 255, 0.06), transparent 70%);
    pointer-events: none;
}

.menu-card-glow.death-glow {
    background: radial-gradient(ellipse, rgba(255, 107, 107, 0.12), transparent 70%);
}

@keyframes ui-card-in {
    from { opacity: 0; transform: translateY(16px) scale(0.96); }
    to { opacity: 1; transform: translateY(0) scale(1); }
}

/* 按钮间距 */
.ui-btn + .ui-btn {
    margin-top: 10px;
}
</style>
