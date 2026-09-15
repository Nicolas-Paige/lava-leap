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

const MODES = [
    { id: 'classic', label: '经典模式', icon: '🔥' },
    { id: 'inferno', label: '地狱模式', icon: '💀' },
] as const;

async function loadLeaderboard() {
    loading.value = true;
    try {
        const data = await fetchLeaderboard(activeMode.value, 30);
        records.value = data.records;
    } catch {
        records.value = [];
    } finally {
        loading.value = false;
    }
}

// 打开时加载、切换模式时重新加载
watch(() => props.visible, (v) => { if (v) loadLeaderboard(); });
watch(activeMode, () => loadLeaderboard());

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
                                    <span class="rank-time">{{ timeAgo(record.updatedAt) }}</span>
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
                </div>
            </div>
        </div>
    </Transition>
</template>

<style scoped>
/* 面板动画 */
.panel-fade-enter-active {
    transition: opacity 0.3s ease;
}
.panel-fade-leave-active {
    transition: opacity 0.2s ease;
}
.panel-fade-enter-from,
.panel-fade-leave-to {
    opacity: 0;
}

.leaderboard-overlay {
    position: fixed;
    inset: 0;
    background: rgba(10, 10, 30, 0.8);
    z-index: 2500;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(12px);
}

.leaderboard-panel {
    background: rgba(20, 25, 45, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    width: 90%;
    max-width: 420px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.6), 0 0 100px rgba(251, 191, 36, 0.1);
    animation: panel-slide-in 0.3s ease;
}

@keyframes panel-slide-in {
    from {
        opacity: 0;
        transform: translateY(20px) scale(0.95);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

/* 顶部光效 */
.panel-glow {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 200px;
    height: 100px;
    background: radial-gradient(ellipse, rgba(251, 191, 36, 0.15), transparent 70%);
    pointer-events: none;
}

.panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    position: relative;
    z-index: 1;
}

.panel-title {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    font-size: 24px;
    color: #fbbf24;
    text-shadow: 0 0 20px rgba(251, 191, 36, 0.3);
}
.title-trophy {
    font-size: 28px;
    filter: drop-shadow(0 2px 8px rgba(251, 191, 36, 0.4));
    animation: trophy-glow 2s ease-in-out infinite;
}
@keyframes trophy-glow {
    0%, 100% { filter: drop-shadow(0 2px 8px rgba(251, 191, 36, 0.4)); }
    50% { filter: drop-shadow(0 2px 12px rgba(251, 191, 36, 0.7)); }
}

.close-btn {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #94a3b8;
    font-size: 18px;
    cursor: pointer;
    padding: 6px 10px;
    border-radius: 10px;
    transition: all 0.2s ease;
}
.close-btn:hover {
    color: #fff;
    background: rgba(255, 107, 107, 0.15);
    border-color: rgba(255, 107, 107, 0.3);
}

/* 模式切换标签 */
.mode-tabs {
    display: flex;
    padding: 12px 20px 0;
    gap: 10px;
}

.mode-tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 0;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.02);
    color: #94a3b8;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.25s ease;
}
.tab-icon {
    font-size: 16px;
}
.mode-tab:hover {
    color: #e2e8f0;
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.1);
}
.mode-tab.active {
    color: #fbbf24;
    background: rgba(251, 191, 36, 0.1);
    border-color: rgba(251, 191, 36, 0.4);
    box-shadow: 0 0 20px rgba(251, 191, 36, 0.15);
}

.panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 12px 0;
    min-height: 200px;
    max-height: 50vh;
}

/* 滚动条美化 */
.panel-body::-webkit-scrollbar {
    width: 6px;
}
.panel-body::-webkit-scrollbar-track {
    background: transparent;
}
.panel-body::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 3px;
}
.panel-body::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.25);
}

.loading, .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #64748b;
    padding: 50px 20px;
    font-size: 14px;
    gap: 12px;
}

.loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(255, 255, 255, 0.1);
    border-top-color: #fbbf24;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}
@keyframes spin {
    to { transform: rotate(360deg); }
}

.empty-icon {
    font-size: 48px;
    opacity: 0.6;
    margin-bottom: 8px;
}
.empty-text {
    font-size: 16px;
    color: #94a3b8;
    font-weight: 500;
}
.empty-hint {
    font-size: 13px;
    color: #64748b;
}

.rank-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.rank-item {
    display: flex;
    align-items: center;
    padding: 12px 20px;
    gap: 14px;
    transition: all 0.2s ease;
    animation: rank-item-in 0.4s ease both;
    border-radius: 8px;
    margin: 0 8px;
}
@keyframes rank-item-in {
    from {
        opacity: 0;
        transform: translateX(-10px);
    }
    to {
        opacity: 1;
        transform: translateX(0);
    }
}

.rank-item:hover {
    background: rgba(255, 255, 255, 0.04);
}
.rank-item.top-3 {
    background: linear-gradient(90deg, rgba(251, 191, 36, 0.08), transparent);
}
.rank-item.top-3:first-child {
    background: linear-gradient(90deg, rgba(255, 215, 0, 0.12), transparent);
}

.rank-medal-wrapper {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}
.rank-medal {
    font-size: 20px;
    color: #64748b;
}
.top-3 .rank-medal {
    font-size: 28px;
}

.rank-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.rank-name {
    color: #e2e8f0;
    font-size: 15px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.top-3 .rank-name {
    color: #f1f5f9;
    font-weight: 600;
}

.rank-layer {
    display: flex;
    align-items: baseline;
    gap: 4px;
    flex-shrink: 0;
}
.layer-number {
    color: #38bdf8;
    font-weight: bold;
    font-size: 18px;
    text-shadow: 0 0 10px rgba(56, 189, 248, 0.3);
}
.top-3 .layer-number {
    font-size: 20px;
    color: #7dd3fc;
    text-shadow: 0 0 12px rgba(56, 189, 248, 0.5);
}
.layer-label {
    color: #64748b;
    font-size: 12px;
}

.rank-time {
    color: #475569;
    font-size: 12px;
    flex-shrink: 0;
}

.panel-footer {
    padding: 16px 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    justify-content: center;
}

.refresh-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #e2e8f0;
    padding: 10px 28px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.25s ease;
}
.refresh-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
    transform: translateY(-1px);
}
.refresh-btn:active:not(:disabled) {
    transform: scale(0.98);
}
.refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.refresh-icon {
    font-size: 16px;
    transition: transform 0.3s ease;
}
.refresh-icon.spinning {
    animation: spin 0.8s linear infinite;
}

/* 列表项动画 */
.rank-item-enter-active {
    transition: all 0.3s ease;
}
.rank-item-leave-active {
    transition: all 0.2s ease;
}
.rank-item-enter-from {
    opacity: 0;
    transform: translateX(-20px);
}
.rank-item-leave-to {
    opacity: 0;
    transform: translateX(20px);
}

@media (max-height: 500px) {
    .leaderboard-panel { max-height: 70vh; }
    .rank-item { padding: 8px 16px; }
    .panel-header { padding: 12px 16px 10px; }
    .panel-title { font-size: 20px; }
}
</style>
