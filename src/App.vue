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
import KeyBindingsPanel from './components/KeyBindingsPanel.vue';
import TouchControls from './components/TouchControls.vue';
import LeaderboardPanel from './components/LeaderboardPanel.vue';
import { releaseKeys } from './composables/useKeyBindings';
import { checkScore, submitScore, getPlayerName, setPlayerName } from './api/leaderboard';
import { CHARACTERS } from './game/characters';
import type { GamePhase } from './game/types';
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
    // 键位面板优先关闭（它是设置的子页面）
    if (showKeyBindings.value) {
        closeKeyBindings();
        return;
    }
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
async function onStart() {
    if (IS_TOUCH_DEVICE) document.body.classList.add('touch');
    touchHandlers.resetDash();
    await nextTick();
    if (canvasRef.value) {
        game.initScene();
        game.enterCharacterSelect();
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
function onRestart() { touchHandlers.resetDash(); closeKeyBindings(); game.restartGame(); }
function onSettings() { game.openSettings(); }
function onSettingsBack() { closeKeyBindings(); game.closeSettings(); }
function onQuit() { touchHandlers.resetDash(); closeKeyBindings(); game.quitGame(); }
function onVolumeUpdate(v: number) { game.setVolume(v); }

// ===== 键位设置（设置面板的子页面）=====
const showKeyBindings = ref(false);
function onOpenKeyBindings() {
    if (IS_TOUCH_DEVICE) return;   // 触控设备无键位设置
    showKeyBindings.value = true;
}
function closeKeyBindings() {
    if (!showKeyBindings.value) return;
    showKeyBindings.value = false;
    releaseKeys(game.input.keys);
}

// ===== 排行榜 =====
const showLeaderboard = ref(false);
function onOpenLeaderboard() { showLeaderboard.value = true; }
function onCloseLeaderboard() { showLeaderboard.value = false; }

// ===== 昵称输入（仅上榜时弹出） =====
const showNameInput = ref(false);
const playerName = ref('');
const pendingScore = ref<{ bestLayer: number; characterId: string } | null>(null);
const pendingRank = ref<number>(0);

async function savePlayerName() {
    const trimmed = playerName.value.trim();
    if (!trimmed || !pendingScore.value) return;
    setPlayerName(trimmed);
    showNameInput.value = false;
    // 提交成绩并打开排行榜
    const result = await submitScore({
        name: trimmed,
        layer: pendingScore.value.bestLayer,
        characterId: pendingScore.value.characterId,
    });
    if (result.rank > 0) pendingRank.value = result.rank;
    showLeaderboard.value = true;
    pendingScore.value = null;
}

// 死亡时：check是否上榜 → 上榜则弹窗（回填昵称）→ 用户确认后提交
watch(() => game.phase.value, async (newPhase) => {
    if (newPhase !== 'dead') return;
    const layer = game.bestLayer.value;
    if (layer <= 0) return;

    // 先检查是否上榜
    const { qualifies, currentRank } = await checkScore(layer);
    if (!qualifies) return;

    // 上榜了，弹昵称输入框（回填已有昵称）
    pendingRank.value = currentRank;
    const charId = CHARACTERS[game.characterIndex.value]?.id || 'unknown';
    pendingScore.value = { bestLayer: layer, characterId: charId };
    playerName.value = getPlayerName();
    showNameInput.value = true;
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
            :is-playing="game.phase.value === 'playing'"
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
            :visible="game.phase.value === 'settings' && !showKeyBindings"
            :volume="game.volume.value"
            :is-touch-device="IS_TOUCH_DEVICE"
            @update:volume="onVolumeUpdate"
            @keybindings="onOpenKeyBindings"
            @back="onSettingsBack"
        />

        <!-- 键位设置 -->
        <KeyBindingsPanel
            :visible="game.phase.value === 'settings' && showKeyBindings"
            :keys="game.input.keys"
            @back="closeKeyBindings"
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
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
}

canvas {
    display: block;
    width: 100%;
    height: 100%;
}

#bgMusic {
    display: none;
}

.name-input-overlay {
    position: fixed;
    inset: 0;
    z-index: 3000;
    display: grid;
    place-items: center;
    overflow: hidden;
    padding: 1rem;
    background: var(--ui-bg-overlay);
    backdrop-filter: var(--ui-blur);
}

.name-input-card {
    position: relative;
    width: min(22.5rem, calc(100vw - 2rem));
    max-height: calc(100vh - 2rem);
    max-height: calc(100dvh - 2rem);
    padding: 1.5rem;
    overflow: hidden;
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-lg);
    background: var(--ui-bg-card);
    box-shadow: var(--ui-shadow);
    text-align: center;
    animation: name-card-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.name-card-glow {
    position: absolute;
    top: 0;
    left: 50%;
    width: 13.75rem;
    height: 6.25rem;
    transform: translateX(-50%);
    background: radial-gradient(ellipse, rgba(251, 191, 36, 0.14), transparent 70%);
    pointer-events: none;
}

@keyframes name-card-in {
    from { opacity: 0; transform: translateY(14px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
}

.name-title {
    position: relative;
    margin: 0 0 0.5rem;
    color: var(--ui-accent-gold);
    font-size: 1.5rem;
    font-weight: 700;
    line-height: 1.25;
}

.name-desc {
    position: relative;
    margin: 0 0 1.25rem;
    color: var(--ui-text-dim);
    font-size: 0.9375rem;
    line-height: 1.5;
}

.rank-num {
    color: var(--ui-accent-gold);
    font-weight: 700;
}

.name-input {
    position: relative;
    width: 100%;
    min-height: var(--ui-control-height-compact);
    padding: 0.625rem 0.875rem;
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-sm);
    outline: none;
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
    font-size: 1rem;
    transition: border-color var(--ui-transition), box-shadow var(--ui-transition);
}

.name-input:focus {
    border-color: var(--ui-accent-gold);
    box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.15);
}

.name-input::placeholder {
    color: var(--ui-text-muted);
}

.name-confirm-btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
    min-height: var(--ui-control-height);
    margin-top: 1rem;
    padding: var(--ui-control-y) 0.875rem;
    border: 1px solid rgba(251, 191, 36, 0.32);
    border-radius: var(--ui-radius-sm);
    background: linear-gradient(135deg, rgba(251, 191, 36, 0.16), rgba(245, 158, 11, 0.08));
    color: var(--ui-accent-gold);
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--ui-transition);
    backdrop-filter: blur(8px);
}

.name-confirm-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    border-color: rgba(251, 191, 36, 0.55);
    box-shadow: 0 8px 25px rgba(251, 191, 36, 0.2);
}

.name-confirm-btn:active:not(:disabled) {
    transform: scale(0.98);
}

.name-confirm-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
}

.btn-icon {
    font-size: 1rem;
}
</style>
