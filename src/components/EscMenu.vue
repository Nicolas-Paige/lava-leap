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
    <div v-if="isMenuVisible()" id="escMenu">
        <div class="menu-inner">
            <h2>{{ phase === 'dead' ? tr('dead') : tr('paused') }}</h2>
            <!-- 仅暂停时显示"继续游戏"按钮 -->
            <button v-if="phase === 'paused'" id="btnResume" @click="emit('close')">{{ tr('resume') }}</button>
            <button id="btnRestart" @click="emit('restart')">{{ tr('restart') }}</button>
            <button id="btnLeaderboard" @click="emit('leaderboard')">{{ tr('leaderboard') || '排行榜' }}</button>
            <button id="btnSettings" @click="emit('settings')">{{ tr('settings') }}</button>
            <button id="btnQuit" @click="emit('quit')">{{ tr('quit') }}</button>
            <div class="hint">
                {{ phase === 'dead' ? tr('deadHint') : tr('pausedHint') }}
            </div>
        </div>
    </div>
</template>

<style scoped>
/* 外层：仅 backdrop + 安全区内缩 padding；flex column 不做居中，由内层 margin:auto 居中 */
#escMenu {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    z-index: 2000;
    backdrop-filter: blur(6px);
    display: flex;
    flex-direction: column;
    padding:
        max(12px, env(safe-area-inset-top))
        max(12px, env(safe-area-inset-right))
        max(12px, env(safe-area-inset-bottom))
        max(12px, env(safe-area-inset-left));
    box-sizing: border-box;
}

/* margin:auto = 能容下时垂直水平双居中；容不下时从 padding 顶部开始排，绝对不裁 */
.menu-inner {
    margin: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    max-width: 320px;
}

#escMenu h2 {
    color: #fff;
    font-size: 36px;
    margin: 0 0 32px 0;
    text-align: center;
}

#escMenu button {
    display: block;
    width: 100%;
    max-width: 240px;
    font-size: 20px;
    font-weight: bold;
    color: #fff;
    border: none;
    padding: 16px 0;
    border-radius: 12px;
    cursor: pointer;
    margin-bottom: 14px;
    transition: all 0.2s;
    box-sizing: border-box;
}

#btnRestart {
    background: linear-gradient(135deg, #4a90e2, #357abd);
}
#btnRestart:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(74, 144, 226, 0.4);
}

#btnResume {
    background: linear-gradient(135deg, #6dff8e, #4ade80);
    color: #0f3460;
}
#btnResume:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(109, 255, 142, 0.4);
}

#btnQuit {
    background: linear-gradient(135deg, #ff6b6b, #ee5a6f);
    margin-bottom: 0;
}
#btnQuit:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(238, 90, 111, 0.4);
}

#btnLeaderboard {
    background: linear-gradient(135deg, #fbbf24, #f59e0b);
    color: #1a1a2e;
}
#btnLeaderboard:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(251, 191, 36, 0.4);
}

#btnSettings {
    background: linear-gradient(135deg, #718096, #4a5568);
}
#btnSettings:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(113, 128, 150, 0.4);
}

.hint {
    color: #888;
    font-size: 13px;
    margin-top: 12px;
    white-space: nowrap;
    text-align: center;
}

/* ================= 小屏压缩（手机横屏） ================= */
@media (max-height: 460px) {
    #escMenu h2 { font-size: 28px; margin-bottom: 20px; }
    #escMenu button { font-size: 17px; padding: 12px 0; margin-bottom: 10px; border-radius: 10px; }
    .hint { font-size: 12px; margin-top: 8px; }
}
@media (max-height: 380px) {
    #escMenu h2 { font-size: 24px; margin-bottom: 14px; }
    #escMenu button { font-size: 15px; padding: 10px 0; margin-bottom: 8px; }
    .hint { font-size: 11px; margin-top: 6px; }
    .menu-inner { max-width: 260px; }
}
/* 超窄横屏（宽度 < 560px）：按钮再窄一档 */
@media (max-width: 560px) {
    .menu-inner { max-width: 80vw; }
}
</style>
