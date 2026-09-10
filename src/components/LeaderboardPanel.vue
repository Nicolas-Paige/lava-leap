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
    { id: 'classic', label: '经典模式' },
    { id: 'inferno', label: '地狱模式' },
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
    <div v-if="visible" class="leaderboard-overlay" @click.self="emit('close')">
        <div class="leaderboard-panel">
            <div class="panel-header">
                <h2>🏆 {{ tr('leaderboard') || '排行榜' }}</h2>
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
                    {{ m.label }}
                </button>
            </div>

            <div class="panel-body">
                <div v-if="loading" class="loading">加载中...</div>
                <div v-else-if="records.length === 0" class="empty">
                    暂无记录，成为第一个上榜的玩家！
                </div>
                <div v-else class="rank-list">
                    <div
                        v-for="(record, index) in records"
                        :key="index"
                        class="rank-item"
                        :class="{ 'top-3': index < 3 }"
                    >
                        <span class="rank-medal">{{ medalFor(index) }}</span>
                        <span class="rank-name">{{ record.name }}</span>
                        <span class="rank-layer">{{ record.layer }} 层</span>
                        <span class="rank-time">{{ timeAgo(record.updatedAt) }}</span>
                    </div>
                </div>
            </div>

            <div class="panel-footer">
                <button class="refresh-btn" @click="loadLeaderboard" :disabled="loading">
                    {{ loading ? '刷新中...' : '刷新' }}
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.leaderboard-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 2500;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(4px);
}

.leaderboard-panel {
    background: rgba(15, 23, 42, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    width: 90%;
    max-width: 400px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.panel-header h2 {
    margin: 0;
    font-size: 22px;
    color: #fbbf24;
}

.close-btn {
    background: none;
    border: none;
    color: #888;
    font-size: 20px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 6px;
    transition: all 0.2s;
}
.close-btn:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.1);
}

/* 模式切换标签 */
.mode-tabs {
    display: flex;
    padding: 8px 16px 0;
    gap: 8px;
}

.mode-tab {
    flex: 1;
    padding: 8px 0;
    border: none;
    border-radius: 8px 8px 0 0;
    background: rgba(255, 255, 255, 0.04);
    color: #94a3b8;
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s;
    border-bottom: 2px solid transparent;
}
.mode-tab:hover {
    color: #e2e8f0;
    background: rgba(255, 255, 255, 0.06);
}
.mode-tab.active {
    color: #fbbf24;
    background: rgba(251, 191, 36, 0.08);
    border-bottom-color: #fbbf24;
}

.panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
    min-height: 200px;
}

.loading, .empty {
    text-align: center;
    color: #888;
    padding: 40px 20px;
    font-size: 14px;
}

.rank-list {
    display: flex;
    flex-direction: column;
}

.rank-item {
    display: flex;
    align-items: center;
    padding: 10px 20px;
    gap: 12px;
    transition: background 0.2s;
}
.rank-item:hover {
    background: rgba(255, 255, 255, 0.04);
}
.rank-item.top-3 {
    background: rgba(251, 191, 36, 0.06);
}

.rank-medal {
    width: 32px;
    text-align: center;
    font-size: 18px;
    flex-shrink: 0;
    color: #94a3b8;
}
.top-3 .rank-medal {
    font-size: 22px;
}

.rank-name {
    flex: 1;
    color: #e2e8f0;
    font-size: 15px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.rank-layer {
    color: #38bdf8;
    font-weight: bold;
    font-size: 15px;
    flex-shrink: 0;
}

.rank-time {
    color: #64748b;
    font-size: 12px;
    flex-shrink: 0;
    min-width: 60px;
    text-align: right;
}

.panel-footer {
    padding: 12px 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    justify-content: center;
}

.refresh-btn {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #e2e8f0;
    padding: 8px 24px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
}
.refresh-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.14);
}
.refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

@media (max-height: 500px) {
    .leaderboard-panel { max-height: 70vh; }
    .rank-item { padding: 8px 16px; }
}
</style>
