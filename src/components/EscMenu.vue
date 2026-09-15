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
    <Transition name="menu-fade">
        <div v-if="isMenuVisible()" id="escMenu">
            <div class="menu-backdrop"></div>
            <div class="menu-inner">
                <h2 class="menu-title">
                    <span class="title-icon">{{ phase === 'dead' ? '💀' : '⏸' }}</span>
                    {{ phase === 'dead' ? tr('dead') : tr('paused') }}
                </h2>
                <!-- 仅暂停时显示"继续游戏"按钮 -->
                <button v-if="phase === 'paused'" class="menu-btn btn-resume" @click="emit('close')">
                    <span class="btn-icon">▶</span>
                    {{ tr('resume') }}
                </button>
                <button class="menu-btn btn-restart" @click="emit('restart')">
                    <span class="btn-icon">↻</span>
                    {{ tr('restart') }}
                </button>
                <button class="menu-btn btn-leaderboard" @click="emit('leaderboard')">
                    <span class="btn-icon">🏆</span>
                    {{ tr('leaderboard') || '排行榜' }}
                </button>
                <button class="menu-btn btn-settings" @click="emit('settings')">
                    <span class="btn-icon">⚙</span>
                    {{ tr('settings') }}
                </button>
                <button class="menu-btn btn-quit" @click="emit('quit')">
                    <span class="btn-icon">✕</span>
                    {{ tr('quit') }}
                </button>
                <div class="hint">
                    {{ phase === 'dead' ? tr('deadHint') : tr('pausedHint') }}
                </div>
            </div>
        </div>
    </Transition>
</template>

<style scoped>
/* 菜单动画 */
.menu-fade-enter-active {
    transition: opacity 0.3s ease, transform 0.3s ease;
}
.menu-fade-leave-active {
    transition: opacity 0.2s ease, transform 0.2s ease;
}
.menu-fade-enter-from {
    opacity: 0;
    transform: scale(0.95);
}
.menu-fade-leave-to {
    opacity: 0;
    transform: scale(0.95);
}

/* 外层 */
#escMenu {
    position: fixed;
    inset: 0;
    z-index: 2000;
    display: flex;
    flex-direction: column;
    padding:
        max(12px, env(safe-area-inset-top))
        max(12px, env(safe-area-inset-right))
        max(12px, env(safe-area-inset-bottom))
        max(12px, env(safe-area-inset-left));
    box-sizing: border-box;
}

/* 背景毛玻璃 */
.menu-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(10, 10, 30, 0.75);
    backdrop-filter: blur(12px);
}

/* 内层 */
.menu-inner {
    margin: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    max-width: 340px;
    position: relative;
    z-index: 1;
    padding: 32px 24px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 24px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

/* 标题 */
.menu-title {
    display: flex;
    align-items: center;
    gap: 12px;
    color: #fff;
    font-size: 32px;
    font-weight: bold;
    margin: 0 0 28px 0;
    text-align: center;
    text-shadow: 0 0 20px rgba(255, 255, 255, 0.2);
}
.title-icon {
    font-size: 36px;
    filter: drop-shadow(0 2px 8px rgba(0,0,0,0.3));
}

/* 按钮基础样式 */
.menu-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    font-size: 18px;
    font-weight: bold;
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 16px 24px;
    border-radius: 14px;
    cursor: pointer;
    margin-bottom: 12px;
    transition: all 0.25s ease;
    box-sizing: border-box;
    position: relative;
    overflow: hidden;
    backdrop-filter: blur(10px);
}
.menu-btn::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(255,255,255,0.1), transparent);
    opacity: 0;
    transition: opacity 0.25s ease;
}
.menu-btn:hover::before {
    opacity: 1;
}
.menu-btn:active {
    transform: scale(0.98) !important;
}
.btn-icon {
    font-size: 20px;
    width: 24px;
    text-align: center;
}

/* 各按钮配色 */
.btn-resume {
    background: linear-gradient(135deg, rgba(109, 255, 142, 0.15), rgba(74, 222, 128, 0.1));
    border-color: rgba(109, 255, 142, 0.3);
    color: #6dff8e;
}
.btn-resume:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(109, 255, 142, 0.25);
    border-color: rgba(109, 255, 142, 0.5);
}

.btn-restart {
    background: linear-gradient(135deg, rgba(74, 144, 226, 0.15), rgba(53, 122, 189, 0.1));
    border-color: rgba(74, 144, 226, 0.3);
    color: #4a90e2;
}
.btn-restart:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(74, 144, 226, 0.25);
    border-color: rgba(74, 144, 226, 0.5);
}

.btn-leaderboard {
    background: linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(245, 158, 11, 0.1));
    border-color: rgba(251, 191, 36, 0.3);
    color: #fbbf24;
}
.btn-leaderboard:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(251, 191, 36, 0.25);
    border-color: rgba(251, 191, 36, 0.5);
}

.btn-settings {
    background: linear-gradient(135deg, rgba(113, 128, 150, 0.15), rgba(74, 85, 104, 0.1));
    border-color: rgba(113, 128, 150, 0.3);
    color: #a0aec0;
}
.btn-settings:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(113, 128, 150, 0.25);
    border-color: rgba(113, 128, 150, 0.5);
}

.btn-quit {
    background: linear-gradient(135deg, rgba(255, 107, 107, 0.15), rgba(238, 90, 111, 0.1));
    border-color: rgba(255, 107, 107, 0.3);
    color: #ff6b6b;
    margin-bottom: 0;
}
.btn-quit:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(255, 107, 107, 0.25);
    border-color: rgba(255, 107, 107, 0.5);
}

.hint {
    color: rgba(255, 255, 255, 0.35);
    font-size: 13px;
    margin-top: 16px;
    white-space: nowrap;
    text-align: center;
}

/* ================= 小屏压缩 ================= */
@media (max-height: 460px) {
    .menu-title { font-size: 26px; margin-bottom: 18px; }
    .menu-btn { font-size: 16px; padding: 12px 20px; margin-bottom: 8px; border-radius: 12px; }
    .menu-inner { padding: 24px 16px; }
    .hint { font-size: 12px; margin-top: 10px; }
}
@media (max-height: 380px) {
    .menu-title { font-size: 22px; margin-bottom: 12px; }
    .menu-btn { font-size: 14px; padding: 10px 16px; margin-bottom: 6px; border-radius: 10px; }
    .menu-inner { max-width: 280px; padding: 20px 12px; }
    .hint { font-size: 11px; margin-top: 6px; }
}
@media (max-width: 560px) {
    .menu-inner { max-width: 85vw; }
}
</style>
