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
    submitScore({ name: trimmed, ...pendingScore.value });
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
        submitScore({ name, bestLayer: layer, characterId: charId, mode });
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
        <div v-if="showNameInput" class="name-input-overlay" @click.self="savePlayerName">
            <div class="name-input-box">
                <h3>🎉 恭喜上榜！</h3>
                <p>你的成绩排在第 {{ pendingRank }} 名</p>
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
                    确认并上榜
                </button>
            </div>
        </div>

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
    background: rgba(0, 0, 0, 0.7);
    z-index: 3000;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(4px);
}

.name-input-box {
    background: rgba(15, 23, 42, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 16px;
    padding: 32px 28px;
    text-align: center;
    width: 90%;
    max-width: 320px;
}

.name-input-box h3 {
    margin: 0 0 8px;
    font-size: 22px;
    color: #fbbf24;
}

.name-input-box p {
    margin: 0 0 20px;
    font-size: 14px;
    color: #94a3b8;
}

.name-input {
    width: 100%;
    padding: 12px 16px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
    font-size: 16px;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.2s;
}
.name-input:focus {
    border-color: #fbbf24;
}
.name-input::placeholder {
    color: #64748b;
}

.name-confirm-btn {
    margin-top: 16px;
    width: 100%;
    padding: 12px 0;
    border: none;
    border-radius: 10px;
    background: linear-gradient(135deg, #fbbf24, #f59e0b);
    color: #1a1a2e;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s;
}
.name-confirm-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(251, 191, 36, 0.4);
}
.name-confirm-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}
</style>
