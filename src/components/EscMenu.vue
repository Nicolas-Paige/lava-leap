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
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: min(18rem, calc(100vw - 1.5rem));
    max-height: calc(100vh - 1.5rem);
    max-height: calc(100dvh - 1.5rem);
    padding: 0.875rem 0.75rem;
    overflow: hidden;
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-lg);
    background: var(--ui-bg-card);
    box-shadow: var(--ui-shadow);
    animation: menu-card-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.menu-card-glow {
    position: absolute;
    top: 0;
    left: 50%;
    width: 12rem;
    height: 5rem;
    transform: translateX(-50%);
    background: radial-gradient(ellipse, rgba(255, 255, 255, 0.07), transparent 70%);
    pointer-events: none;
}

.menu-card-glow.death-glow {
    background: radial-gradient(ellipse, rgba(255, 107, 107, 0.14), transparent 70%);
}

.ui-title {
    margin-bottom: 0.625rem;
    font-size: 1.25rem;
}

.ui-title-icon {
    font-size: 1.25rem;
}

.ui-btn {
    min-height: 2.25rem;
    padding: 0.375rem 0.75rem;
    font-size: 0.875rem;
}

.ui-btn-icon {
    width: 1.125rem;
    font-size: 0.9375rem;
}

.ui-hint {
    margin-top: 0.5rem;
    font-size: 0.6875rem;
}
@keyframes menu-card-in {
    from { opacity: 0; transform: translateY(14px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
}

.ui-btn + .ui-btn {
    margin-top: 0.4375rem;
}

@media (max-height: 620px) {
    .menu-card {
        padding: 1rem;
    }
    .ui-title {
        margin-bottom: 0.875rem;
        font-size: 1.375rem;
    }
    .ui-btn {
        min-height: 2.375rem;
        padding: 0.5rem 0.875rem;
        font-size: 0.9375rem;
    }
    .ui-hint {
        margin-top: 0.5625rem;
        font-size: 0.75rem;
    }
}

@media (max-height: 430px) {
    .menu-card {
        padding: 0.875rem 0.75rem;
    }
    .ui-title {
        margin-bottom: 0.625rem;
        font-size: 1.125rem;
    }
    .ui-btn {
        min-height: 2.125rem;
        padding: 0.375rem 0.625rem;
        font-size: 0.8125rem;
    }
}
</style>
