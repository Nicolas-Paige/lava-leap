<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed, nextTick } from 'vue';
import { useGame, IS_TOUCH_DEVICE } from './composables/useGame';
import { useKeyboardInput } from './composables/useKeyboardInput';
import { useTouchInput } from './composables/useTouchInput';
import StartOverlay from './components/StartOverlay.vue';
import CharacterSelect from './components/CharacterSelect.vue';
import Hud from './components/Hud.vue';
import EscMenu from './components/EscMenu.vue';
import SettingsPanel from './components/SettingsPanel.vue';
import TouchControls from './components/TouchControls.vue';
import LeaderboardPanel from './components/LeaderboardPanel.vue';
import { checkScore, submitScore, getPlayerName, setPlayerName } from './api/leaderboard';
import { CHARACTERS } from './game/characters';
import type { GamePhase } from './game/types';
import type { GameMode } from './game/modes/types';
import bgMusicUrl from '../assets/bg-music-8bit.wav';

// canvas + audio 引用（都在顶层，不随 v-if 销毁）
const canvasRef = ref<HTMLCanvasElement | null>(null);
const bgMusicRef = ref<HTMLAudioElement | null>(null);

// ===== 游戏引擎 =====
const game = useGame({
    canvas: canvasRef,
    bgMusic: bgMusicRef,
});

// 状态判断
const isPlaying = () => game.phase.value === 'playing';
const isPaused = () => game.phase.value === 'paused';
const isDead = () => game.phase.value === 'dead';
const isDying = () => game.isDying();
const isSettings = () => game.phase.value === 'settings';

function togglePause() {
    if (isPaused() || isSettings()) game.resumeGame();
    else game.pauseGame();
}
function openMenu() { game.pauseGame(); }
function closeMenu() {
    if (isSettings()) game.closeSettings();
    else game.resumeGame();
}

// ===== 输入 =====
useKeyboardInput({
    input: game.input,
    isTouchDevice: IS_TOUCH_DEVICE,
    isPlaying, isPaused, isDead, isDying, isSettings,
    togglePause, closeMenu, openMenu,
    canvas: canvasRef,
});

const touchHandlers = useTouchInput({
    input: game.input,
    isPlaying, isPaused, isDead, isDying, isSettings,
    togglePause,
});

// ===== 开始游戏 → 进入选人页面 =====
async function onStart(mode: GameMode) {
    if (IS_TOUCH_DEVICE) document.body.classList.add('touch');
    touchHandlers.resetDash();
    await nextTick();
    if (canvasRef.value) {
        game.initScene();
        game.enterCharacterSelect(mode);
    }
}

// ===== 选人页面确认 → 正式进入游戏 =====
function onConfirmCharacter() {
    game.confirmCharacter();
}

// ===== 选人页面返回 → 回到开始界面 =====
function onBackFromSelect() {
    game.quitGame();
}

// ===== 菜单事件 =====
function onRestart() { touchHandlers.resetDash(); game.restartGame(); }
function onSettings() { game.openSettings(); }
function onSettingsBack() { game.closeSettings(); }
function onQuit() { touchHandlers.resetDash(); game.quitGame(); }
function onVolumeUpdate(v: number) { game.setVolume(v); }

// ===== 排行榜 =====
const showLeaderboard = ref(false);
const leaderboardMode = ref('classic');
function onOpenLeaderboard() { showLeaderboard.value = true; }
function onCloseLeaderboard() { showLeaderboard.value = false; }

// ===== 昵称输入（仅上榜时弹出） =====
const showNameInput = ref(false);
const playerName = ref('');
const pendingScore = ref<{ mode: string; bestLayer: number; characterId: string } | null>(null);
const pendingRank = ref<number>(0);

function savePlayerName() {
    const trimmed = playerName.value.trim();
    if (!trimmed || !pendingScore.value) return;
    setPlayerName(trimmed);
    showNameInput.value = false;
    // 提交成绩并打开排行榜
    submitScore({ name: trimmed, layer: pendingScore.value.bestLayer, characterId: pendingScore.value.characterId, mode: pendingScore.value.mode });
    leaderboardMode.value = pendingScore.value.mode;
    showLeaderboard.value = true;
    pendingScore.value = null;
}

// 死亡时：检查是否上榜 → 上榜且没名字 → 弹输入框
watch(() => game.phase.value, async (newPhase) => {
    if (newPhase !== 'dead') return;
    const mode = game.currentMode.value?.id || 'classic';
    const layer = game.bestLayer.value;
    if (layer <= 0) return;

    // TODO: 部署后端后恢复 checkScore 检查，删除下面两行
    const qualifies = true;
    const currentRank = 0;
    // const { qualifies, currentRank } = await checkScore(mode, layer);

    if (!qualifies) return;

    // 上榜了
    pendingRank.value = currentRank;
    const charId = CHARACTERS[game.characterIndex.value]?.id || 'unknown';
    pendingScore.value = { mode, bestLayer: layer, characterId: charId };

    const name = getPlayerName();
    if (name) {
        // 已有昵称，直接提交
        submitScore({ name, layer, characterId: charId, mode });
        leaderboardMode.value = mode;
        showLeaderboard.value = true;
        pendingScore.value = null;
    } else {
        // 没有昵称，弹输入框
        playerName.value = '';
        showNameInput.value = true;
    }
});

// ===== 窗口适配 =====
function onResize() { game.onResize(); }
onMounted(() => {
    // bgMusic 元素在顶层模板里，挂载后立即绑定
    bgMusicRef.value = document.getElementById('bgMusic') as HTMLAudioElement;
    if (bgMusicRef.value) bgMusicRef.value.volume = game.volume.value / 100;
    window.addEventListener('resize', onResize);
});
onUnmounted(() => {
    window.removeEventListener('resize', onResize);
});

const showGameUI = computed(() => !['idle', 'character-select'].includes(game.phase.value));
</script>

<template>
    <div class="app">
        <!-- canvas + audio（始终存在，不随 v-if 销毁） -->
        <canvas ref="canvasRef" />
        <audio id="bgMusic" :src="bgMusicUrl" loop preload="auto" />

        <!-- 开始界面 -->
        <StartOverlay
            v-if="game.phase.value === 'idle'"
            :loading-progress="game.loadingProgress.value"
            :load-error="game.loadError.value"
            :is-touch-device="IS_TOUCH_DEVICE"
            @start="onStart"
            @settings="onSettings"
        />

        <!-- 角色选择页面 -->
        <CharacterSelect
            v-if="game.phase.value === 'character-select'"
            :character-index="game.characterIndex.value"
            :loading-progress="game.loadingProgress.value"
            :load-error="game.loadError.value"
            @prev="game.switchCharacter(-1)"
            @next="game.switchCharacter(1)"
            @confirm="onConfirmCharacter"
            @back="onBackFromSelect"
        />

        <!-- HUD（游戏中显示） -->
        <Hud
            v-if="showGameUI"
            :current-layer="game.currentLayer.value"
            :best-layer="game.bestLayer.value"
            :is-touch-device="IS_TOUCH_DEVICE"
        />

        <!-- ESC / 死亡菜单 -->
        <EscMenu
            :phase="game.phase.value as GamePhase"
            @restart="onRestart"
            @settings="onSettings"
            @quit="onQuit"
            @close="closeMenu"
            @leaderboard="onOpenLeaderboard"
        />

        <!-- 排行榜 -->
        <LeaderboardPanel
            :visible="showLeaderboard"
            :initial-mode="leaderboardMode"
            @close="onCloseLeaderboard"
        />

        <!-- 昵称输入弹窗（上榜时才弹出） -->
        <Transition name="ui-fade">
            <div v-if="showNameInput" class="name-input-overlay" @click.self="savePlayerName">
                <div class="name-input-card">
                    <div class="name-card-glow"></div>
                    <h3 class="name-title">🎉 恭喜上榜！</h3>
                    <p class="name-desc">你的成绩排在第 <span class="rank-num">{{ pendingRank }}</span> 名</p>
                    <input
                        v-model="playerName"
                        type="text"
                        maxlength="20"
                        placeholder="输入昵称..."
                        class="name-input"
                        @keyup.enter="savePlayerName"
                        autofocus
                    />
                    <button class="name-confirm-btn" @click="savePlayerName" :disabled="!playerName.trim()">
                        <span class="btn-icon">🏆</span>
                        确认并上榜
                    </button>
                </div>
            </div>
        </Transition>

        <!-- 设置面板 -->
        <SettingsPanel
            :visible="game.phase.value === 'settings'"
            :volume="game.volume.value"
            @update:volume="onVolumeUpdate"
            @back="onSettingsBack"
        />

        <!-- 移动端触控 UI（触控设备始终渲染：竖屏显示旋转提示，横屏显示摇杆） -->
        <TouchControls
            v-if="IS_TOUCH_DEVICE"
            :game-active="showGameUI"
            :settings-open="game.phase.value === 'settings'"
            :handlers="touchHandlers"
            @pause="togglePause"
        />
    </div>
</template>

<style scoped>
.app {
    width: 100vw;
    height: 100vh;
    position: relative;
    overflow: hidden;
}

canvas {
    width: 100%;
    height: 100%;
    display: block;
}

#bgMusic {
    display: none;
}

/* 昵称输入弹窗 */
.name-input-overlay {
    position: fixed;
    inset: 0;
    background: rgba(10, 10, 30, 0.8);
    z-index: 3000;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(12px);
}

.name-input-card {
    background: var(--ui-bg-card);
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-lg);
    padding: 32px 28px;
    text-align: center;
    width: 90%;
    max-width: 340px;
    position: relative;
    overflow: hidden;
    box-shadow: var(--ui-shadow);
    animation: ui-card-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.name-card-glow {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 200px;
    height: 100px;
    background: radial-gradient(ellipse, rgba(251, 191, 36, 0.12), transparent 70%);
    pointer-events: none;
}

@keyframes ui-card-in {
    from { opacity: 0; transform: translateY(16px) scale(0.96); }
    to { opacity: 1; transform: translateY(0) scale(1); }
}

.name-title {
    margin: 0 0 8px;
    font-size: 24px;
    font-weight: 700;
    color: var(--ui-accent-gold);
    text-shadow: 0 0 20px rgba(251, 191, 36, 0.3);
}

.name-desc {
    margin: 0 0 24px;
    font-size: 14px;
    color: var(--ui-text-dim);
}

.rank-num {
    color: var(--ui-accent-gold);
    font-weight: 700;
    font-size: 16px;
}

.name-input {
    width: 100%;
    padding: 12px 16px;
    border-radius: var(--ui-radius-sm);
    border: 1px solid var(--ui-border);
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
    font-size: 16px;
    outline: none;
    box-sizing: border-box;
    transition: border-color var(--ui-transition), box-shadow var(--ui-transition);
    backdrop-filter: blur(6px);
}
.name-input:focus {
    border-color: var(--ui-accent-gold);
    box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.15);
}
.name-input::placeholder {
    color: var(--ui-text-muted);
}

.name-confirm-btn {
    margin-top: 20px;
    width: 100%;
    padding: 14px 0;
    border: 1px solid rgba(251, 191, 36, 0.3);
    border-radius: var(--ui-radius-sm);
    background: linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(245, 158, 11, 0.08));
    color: var(--ui-accent-gold);
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--ui-transition);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    backdrop-filter: blur(8px);
}
.name-confirm-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(251, 191, 36, 0.2);
    border-color: rgba(251, 191, 36, 0.5);
    background: linear-gradient(135deg, rgba(251, 191, 36, 0.22), rgba(245, 158, 11, 0.12));
}
.name-confirm-btn:active:not(:disabled) {
    transform: scale(0.98);
}
.name-confirm-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
}
.name-confirm-btn .btn-icon {
    font-size: 16px;
}
</style>
