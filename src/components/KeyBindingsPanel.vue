<script setup lang="ts">
import { ref, onUnmounted, computed } from 'vue';
import { useI18n } from '../composables/useI18n';
import {
    ACTIONS, bindings, recordingAction,
    formatKeyCode, rebind, unbind, resetBindings, releaseKeys, matchesBinding,
    type ActionId,
} from '../composables/useKeyBindings';
import type { InputKeys } from '../game/types';

// 不可解除绑定的动作：关掉它之后键盘就再也关不掉菜单，只能靠鼠标点按钮。
// 这里既不允许主动解绑，也不允许别的动作占用它的按键。
const LOCKED_ACTIONS: ActionId[] = ['menu'];
const isLocked = (id: ActionId) => LOCKED_ACTIONS.includes(id);

const props = defineProps<{
    visible: boolean;
    keys: InputKeys;
}>();

const emit = defineEmits<{
    back: [];
}>();

const { tr } = useI18n();

const conflictMsg = ref('');
const resetMsg = ref('');

function startRecording(id: ActionId) {
    if (recordingAction.value === id) {
        stopRecording();
        return;
    }
    stopRecording();
    conflictMsg.value = '';
    resetMsg.value = '';
    releaseKeys(props.keys);
    recordingAction.value = id;
    // capture 阶段拦截，避免游戏输入与页面默认行为响应录制按键
    window.addEventListener('keydown', onRecordKey, { capture: true });
}

function onRecordKey(e: KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    const id = recordingAction.value;
    stopRecording();
    if (!id) return;
    if (e.code === 'Escape') return;   // Esc 取消录制

    // 保护锁定动作：别的动作不能占用它的按键（否则会被静默解绑）
    const owner = ACTIONS.find(
        a => a.id !== id && isLocked(a.id) && matchesBinding(bindings.value[a.id], e.code),
    );
    if (owner) {
        conflictMsg.value = tr('keybindLocked').replace('{action}', tr(owner.labelKey));
        return;
    }

    const conflict = rebind(id, e.code);
    if (conflict) {
        conflictMsg.value = tr('keybindConflict').replace('{action}', tr(ACTIONS.find(a => a.id === conflict)!.labelKey));
    }
}

function stopRecording() {
    window.removeEventListener('keydown', onRecordKey, { capture: true });
    recordingAction.value = null;
}

function onUnbind(id: ActionId) {
    if (isLocked(id)) return;          // 锁定动作不允许解绑
    if (recordingAction.value === id) stopRecording();
    unbind(id);
    releaseKeys(props.keys);
    conflictMsg.value = '';
}

function onReset() {
    stopRecording();
    resetBindings();
    releaseKeys(props.keys);
    conflictMsg.value = '';
    resetMsg.value = tr('keybindResetDone');
}

function onBack() {
    stopRecording();
    releaseKeys(props.keys);
    conflictMsg.value = '';
    resetMsg.value = '';
    emit('back');
}

onUnmounted(() => {
    stopRecording();
    releaseKeys(props.keys);
});

const rows = computed(() =>
    ACTIONS.map(a => ({
        id: a.id,
        label: tr(a.labelKey),
        code: bindings.value[a.id],
        recording: recordingAction.value === a.id,
        locked: isLocked(a.id),
    }))
);
</script>

<template>
    <Transition name="ui-fade">
        <div v-if="visible" class="ui-panel">
            <div class="ui-card keybind-card">
                <div class="settings-glow"></div>

                <h2 class="ui-title">
                    <span class="ui-title-icon">⌨️</span>
                    {{ tr('keybindTitle') }}
                </h2>

                <div class="keybind-list">
                    <div v-for="row in rows" :key="row.id" class="keybind-row">
                        <span class="keybind-label">{{ row.label }}</span>
                        <button
                            class="keybind-key"
                            :class="{ recording: row.recording, empty: !row.code }"
                            @click="startRecording(row.id)"
                        >
                            {{ row.recording ? tr('keybindRecording') : (row.code ? formatKeyCode(row.code) : tr('keybindUnset')) }}
                        </button>
                        <button
                            class="keybind-clear"
                            :class="{ locked: row.locked }"
                            :title="row.locked ? tr('keybindLockedTitle') : tr('keybindUnbindTitle')"
                            :disabled="!row.code || row.locked"
                            @click="onUnbind(row.id)"
                        >{{ row.locked ? '🔒' : '✕' }}</button>
                    </div>
                </div>

                <p v-if="conflictMsg" class="keybind-msg warn">{{ conflictMsg }}</p>
                <p v-else-if="resetMsg" class="keybind-msg">{{ resetMsg }}</p>
                <p v-else class="ui-hint keybind-hint">{{ tr('keybindHint') }}</p>

                <div class="keybind-actions">
                    <button class="ui-btn ui-btn-danger keybind-reset" @click="onReset">
                        <span class="ui-btn-icon">↺</span>
                        {{ tr('keybindReset') }}
                    </button>
                    <button class="ui-btn ui-btn-subtle" @click="onBack">
                        <span class="ui-btn-icon">←</span>
                        {{ tr('back') }}
                    </button>
                </div>
            </div>
        </div>
    </Transition>
</template>

<style scoped>
.keybind-card {
    width: min(21rem, calc(100vw - 1.5rem));
    padding: 1.125rem 1.25rem;
}

.ui-title {
    margin-bottom: 0.75rem;
    font-size: 1.375rem;
}

.ui-title-icon {
    font-size: 1.375rem;
}

.settings-glow {
    position: absolute;
    top: -2.5rem;
    left: 50%;
    width: 17.5rem;
    height: 8.125rem;
    transform: translateX(-50%);
    background: radial-gradient(ellipse, rgba(86, 199, 255, 0.12), transparent 70%);
    pointer-events: none;
}

/* 9 个动作默认一屏放下：行高随视口高度自适应，矮屏自动压缩 */
.keybind-list {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: clamp(0.125rem, 0.55vh, 0.375rem);
}

.keybind-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: clamp(1.5rem, 4.4vh, 1.875rem);
}

.keybind-label {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--ui-text);
    font-size: clamp(0.8125rem, 1.9vh, 0.9375rem);
    font-weight: 500;
}

.keybind-key {
    flex: 0 0 auto;
    min-width: clamp(4.5rem, 22vw, 5.75rem);
    min-height: clamp(1.5rem, 4.4vh, 1.875rem);
    padding: 0.25rem 0.625rem;
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-sm);
    background: rgba(255, 255, 255, 0.06);
    color: var(--ui-accent-gold);
    font-size: clamp(0.8125rem, 1.9vh, 0.9375rem);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    transition: all var(--ui-transition);
}

.keybind-key:hover {
    border-color: var(--ui-border-hover);
    background: rgba(255, 255, 255, 0.12);
}

.keybind-key.empty {
    color: var(--ui-text-muted);
    font-weight: 500;
}

.keybind-key.recording {
    border-color: var(--ui-accent-blue);
    background: rgba(86, 199, 255, 0.16);
    color: var(--ui-accent-blue);
    animation: keybind-pulse 1s ease-in-out infinite;
}

@keyframes keybind-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(86, 199, 255, 0.35); }
    50% { box-shadow: 0 0 0 0.3125rem rgba(86, 199, 255, 0); }
}

.keybind-clear {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: clamp(1.5rem, 4.4vh, 1.875rem);
    height: clamp(1.5rem, 4.4vh, 1.875rem);
    padding: 0;
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-sm);
    background: rgba(255, 255, 255, 0.04);
    color: var(--ui-text-muted);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all var(--ui-transition);
}

.keybind-clear:hover:not(:disabled) {
    border-color: rgba(255, 107, 107, 0.5);
    color: var(--ui-accent-red);
}

/* 锁定动作：不可解绑，用锁形图标 + 常暗表示 */
.keybind-clear.locked {
    opacity: 0.45;
    font-size: 0.625rem;
}

.keybind-clear:disabled {
    opacity: 0.3;
    cursor: not-allowed;
}

.keybind-msg,
.keybind-hint {
    position: relative;
    z-index: 1;
    margin-top: 0.625rem;
    font-size: 0.75rem;
    line-height: 1.45;
}

.keybind-msg {
    margin-bottom: 0;
    color: var(--ui-text-muted);
    font-size: 0.75rem;
    line-height: 1.45;
    text-align: center;
}

.keybind-msg.warn {
    color: var(--ui-accent-orange);
}

.keybind-actions {
    position: relative;
    z-index: 1;
    display: flex;
    gap: 0.5rem;
    margin-top: 0.75rem;
}

.keybind-actions .ui-btn {
    flex: 1 1 0;
    min-height: 2.25rem;
    padding: 0.375rem 0.5rem;
    font-size: 0.875rem;
}

/* 极端矮屏兜底：仍允许滚动，避免内容溢出屏幕 */
@media (max-height: 380px) {
    .keybind-list {
        max-height: calc(100dvh - 10rem);
        overflow-y: auto;
    }
}
</style>
