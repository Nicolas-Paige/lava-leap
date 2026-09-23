<script setup lang="ts">
import { ref, watch } from 'vue';
import { fetchLeaderboard, type ScoreRecord } from '../api/leaderboard';
import { useI18n } from '../composables/useI18n';

const props = defineProps<{
    visible: boolean;
    initialMode?: string;  // 初始选中的模式
}>();

const emit = defineEmits<{
    close: [];
}>();

const { tr } = useI18n();

const activeMode = ref(props.initialMode || 'classic');
const records = ref<ScoreRecord[]>([]);
const loading = ref(false);
let loadGeneration = 0; // 防止竞态：旧请求的结果不会覆盖新请求

const MODES = [
    { id: 'classic', label: '经典模式', icon: '🔥' },
    { id: 'inferno', label: '地狱模式', icon: '💀' },
] as const;

async function loadLeaderboard() {
    loading.value = true;
    const gen = ++loadGeneration; // 递增代次，用于竞态判断
    try {
        const data = await fetchLeaderboard(activeMode.value, 20);
        // 如果在这次请求期间又触发了新的加载，丢弃旧结果
        if (gen !== loadGeneration) return;
        records.value = data.records;
    } catch {
        if (gen !== loadGeneration) return;
        records.value = [];
    } finally {
        if (gen === loadGeneration) loading.value = false;
    }
}

// 打开时加载，同时同步 initialMode 变化
watch(() => props.visible, (v) => {
    if (v) {
        if (props.initialMode && props.initialMode !== activeMode.value) {
            activeMode.value = props.initialMode;
        }
        loadLeaderboard();
    }
});
// 切换模式时重新加载
watch(activeMode, () => { if (props.visible) loadLeaderboard(); });

function medalFor(index: number): string {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `${index + 1}`;
}

function timeAgo(ts: number): string {
    if (!ts) return '';
    const diff = Date.now() - ts;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return `${Math.floor(diff / 86400000)}天前`;
}
</script>

<template>
    <Transition name="panel-fade">
        <div v-if="visible" class="leaderboard-overlay" @click.self="emit('close')">
            <div class="leaderboard-panel">
                <!-- 顶部光效 -->
                <div class="panel-glow"></div>

                <div class="panel-header">
                    <h2 class="panel-title">
                        <span class="title-trophy">🏆</span>
                        {{ tr('leaderboard') || '排行榜' }}
                    </h2>
                    <button class="close-btn" @click="emit('close')">✕</button>
                </div>

                <!-- 模式切换标签 -->
                <div class="mode-tabs">
                    <button
                        v-for="m in MODES"
                        :key="m.id"
                        class="mode-tab"
                        :class="{ active: activeMode === m.id }"
                        @click="activeMode = m.id"
                    >
                        <span class="tab-icon">{{ m.icon }}</span>
                        {{ m.label }}
                    </button>
                </div>

                <div class="panel-body">
                    <div v-if="loading" class="loading">
                        <div class="loading-spinner"></div>
                        <span>加载中...</span>
                    </div>
                    <div v-else-if="records.length === 0" class="empty">
                        <div class="empty-icon">🎮</div>
                        <div class="empty-text">暂无记录</div>
                        <div class="empty-hint">成为第一个上榜的玩家！</div>
                    </div>
                    <div v-else class="rank-list">
                        <TransitionGroup name="rank-item" tag="div">
                            <div
                                v-for="(record, index) in records"
                                :key="`${record.name}-${index}`"
                                class="rank-item"
                                :class="{ 'top-3': index < 3 }"
                                :style="{ animationDelay: `${index * 0.05}s` }"
                            >
                                <div class="rank-medal-wrapper">
                                    <span class="rank-medal">{{ medalFor(index) }}</span>
                                </div>
                                <div class="rank-info">
                                    <span class="rank-name">{{ record.name }}</span>
                                    <span class="rank-time">{{ timeAgo(record.timestamp) }}</span>
                                </div>
                                <div class="rank-layer">
                                    <span class="layer-number">{{ record.layer }}</span>
                                    <span class="layer-label">层</span>
                                </div>
                            </div>
                        </TransitionGroup>
                    </div>
                </div>

                <div class="panel-footer">
                    <button class="refresh-btn" @click="loadLeaderboard" :disabled="loading">
                        <span class="refresh-icon" :class="{ spinning: loading }">↻</span>
                        {{ loading ? '刷新中...' : '刷新' }}
                    </button>
                    <div v-if="records.length > 0" class="record-count">
                        共 {{ records.length }} 条记录
                    </div>
                </div>
            </div>
        </div>
    </Transition>
</template>

<style scoped>
.leaderboard-overlay {
    position: fixed;
    inset: 0;
    z-index: 2500;
    display: grid;
    place-items: center;
    overflow: hidden;
    padding: 0.875rem;
    background: rgba(8, 8, 24, 0.84);
    backdrop-filter: blur(14px);
}

.leaderboard-panel {
    position: relative;
    display: flex;
    flex-direction: column;
    width: min(28.75rem, calc(100vw - 1.75rem));
    max-height: min(84vh, calc(100vh - 1.75rem));
    max-height: min(84dvh, calc(100dvh - 1.75rem));
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--ui-radius-lg);
    background: var(--ui-bg-card);
    box-shadow: var(--ui-shadow), 0 0 4rem rgba(251, 191, 36, 0.07);
    animation: panel-in 0.3s ease;
}

@keyframes panel-in {
    from { opacity: 0; transform: translateY(16px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
}

.panel-glow {
    position: absolute;
    top: 0;
    left: 50%;
    z-index: 0;
    width: 15rem;
    height: 6.875rem;
    transform: translateX(-50%);
    background: radial-gradient(ellipse, rgba(251, 191, 36, 0.16), transparent 70%);
    pointer-events: none;
}

.panel-header {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 1.125rem 1.25rem 0.875rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.panel-title {
    display: flex;
    align-items: center;
    gap: 0.5625rem;
    margin: 0;
    color: #fbbf24;
    font-size: 1.5rem;
    line-height: 1.2;
    text-shadow: 0 0 20px rgba(251, 191, 36, 0.3);
}

.title-trophy {
    font-size: 1.625rem;
    filter: drop-shadow(0 2px 8px rgba(251, 191, 36, 0.4));
    animation: trophy-glow 2s ease-in-out infinite;
}

@keyframes trophy-glow {
    0%, 100% { filter: drop-shadow(0 2px 8px rgba(251, 191, 36, 0.4)); }
    50% { filter: drop-shadow(0 2px 13px rgba(251, 191, 36, 0.75)); }
}

.close-btn {
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--ui-radius-sm);
    background: rgba(255, 255, 255, 0.06);
    color: #94a3b8;
    font-size: 1.125rem;
    cursor: pointer;
    transition: all 0.2s ease;
}

.close-btn:hover {
    background: rgba(255, 107, 107, 0.16);
    border-color: rgba(255, 107, 107, 0.35);
    color: #fff;
}

.mode-tabs {
    position: relative;
    z-index: 1;
    display: flex;
    gap: 0.625rem;
    padding: 0.875rem 1.25rem 0;
}

.mode-tab {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    min-width: 0;
    padding: 0.625rem 0.375rem;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: var(--ui-radius-sm);
    background: rgba(255, 255, 255, 0.025);
    color: #94a3b8;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
}

.mode-tab:hover {
    background: rgba(255, 255, 255, 0.06);
    color: #e2e8f0;
}

.mode-tab.active {
    border-color: rgba(251, 191, 36, 0.45);
    background: rgba(251, 191, 36, 0.11);
    color: #fbbf24;
    box-shadow: 0 0 20px rgba(251, 191, 36, 0.12);
}

.tab-icon {
    font-size: 1rem;
}

.panel-body {
    position: relative;
    z-index: 1;
    flex: 1 1 auto;
    min-height: 9.375rem;
    max-height: 52vh;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0.625rem 0;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

.panel-body::-webkit-scrollbar {
    width: 0.375rem;
}

.panel-body::-webkit-scrollbar-track {
    background: transparent;
}

.panel-body::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.2);
}

.loading,
.empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    min-height: 10rem;
    padding: 1.875rem 1.25rem;
    color: #64748b;
    font-size: 0.9375rem;
    text-align: center;
}

.loading-spinner {
    width: 2rem;
    height: 2rem;
    border: 3px solid rgba(255, 255, 255, 0.1);
    border-top-color: #fbbf24;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

.empty-icon {
    font-size: 3rem;
    opacity: 0.65;
}

.empty-text {
    color: #94a3b8;
    font-size: 1.0625rem;
    font-weight: 600;
}

.empty-hint {
    color: #64748b;
    font-size: 0.8125rem;
}

.rank-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.rank-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 0 0.5rem;
    padding: 0.75rem 1rem;
    border-radius: var(--ui-radius-sm);
    animation: rank-in 0.35s ease both;
    transition: background 0.2s ease;
}

.rank-item:hover {
    background: rgba(255, 255, 255, 0.05);
}

.rank-item.top-3 {
    background: linear-gradient(90deg, rgba(251, 191, 36, 0.09), transparent);
}

.rank-item.top-3:first-child {
    background: linear-gradient(90deg, rgba(255, 215, 0, 0.14), transparent);
}

@keyframes rank-in {
    from { opacity: 0; transform: translateX(-8px); }
    to { opacity: 1; transform: translateX(0); }
}

.rank-medal-wrapper {
    display: grid;
    flex: 0 0 2.25rem;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
}

.rank-medal {
    color: #64748b;
    font-size: 1.25rem;
}

.top-3 .rank-medal {
    font-size: 1.625rem;
}

.rank-info {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
}

.rank-name {
    overflow: hidden;
    color: #e2e8f0;
    font-size: 0.9375rem;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.top-3 .rank-name {
    color: #f1f5f9;
    font-weight: 600;
}

.rank-time {
    overflow: hidden;
    color: #475569;
    font-size: 0.75rem;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.rank-layer {
    display: flex;
    flex: 0 0 auto;
    align-items: baseline;
    gap: 0.25rem;
}

.layer-number {
    color: #38bdf8;
    font-size: 1.125rem;
    font-weight: 700;
    text-shadow: 0 0 10px rgba(56, 189, 248, 0.3);
}

.top-3 .layer-number {
    color: #7dd3fc;
    font-size: 1.25rem;
    text-shadow: 0 0 12px rgba(56, 189, 248, 0.5);
}

.layer-label {
    color: #64748b;
    font-size: 0.75rem;
}

.panel-footer {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4375rem;
    padding: 0.875rem 1.25rem;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
}

.record-count {
    color: #475569;
    font-size: 0.75rem;
}

.refresh-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: 2.5rem;
    padding: 0.5rem 1.625rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--ui-radius-sm);
    background: rgba(255, 255, 255, 0.06);
    color: #e2e8f0;
    font-size: 0.9375rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
}

.refresh-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.11);
    border-color: rgba(255, 255, 255, 0.22);
    transform: translateY(-1px);
}

.refresh-btn:disabled {
    opacity: 0.5;
    cursor: wait;
}

.refresh-icon {
    font-size: 1rem;
    transition: transform 0.3s ease;
}

.refresh-icon.spinning {
    animation: spin 0.8s linear infinite;
}

.rank-item-enter-active,
.rank-item-leave-active {
    transition: all 0.3s ease;
}

.rank-item-enter-from {
    opacity: 0;
    transform: translateX(-16px);
}

.rank-item-leave-to {
    opacity: 0;
    transform: translateX(16px);
}

@media (max-height: 600px) {
    .leaderboard-panel {
        max-height: calc(100dvh - 1.25rem);
    }
    .panel-header {
        padding-top: 0.75rem;
        padding-bottom: 0.625rem;
    }
    .panel-title {
        font-size: 1.25rem;
    }
    .panel-body {
        min-height: 7.5rem;
        max-height: 50vh;
        padding: 0.4375rem 0;
    }
    .rank-item {
        padding-top: 0.4375rem;
        padding-bottom: 0.4375rem;
    }
}
</style>
