<script setup lang="ts">
import { useI18n, type Language } from '../composables/useI18n';

defineProps<{
    visible: boolean;
    volume: number;
}>();

const emit = defineEmits<{
    'update:volume': [v: number];
    back: [];
}>();

const { language, setLanguage, tr } = useI18n();

function onInput(e: Event) {
    const v = Number((e.target as HTMLInputElement).value);
    emit('update:volume', v);
}

function onLanguageChange(e: Event) {
    setLanguage((e.target as HTMLSelectElement).value as Language);
}
</script>

<template>
    <Transition name="ui-fade">
        <div v-if="visible" class="ui-panel">
            <div class="ui-card">
                <!-- 顶部装饰光效 -->
                <div class="settings-glow"></div>

                <h2 class="ui-title">
                    <span class="ui-title-icon">⚙️</span>
                    {{ tr('settingsTitle') }}
                </h2>

                <div class="setting-group">
                    <div class="setting-row">
                        <label for="volumeSlider">🔊 {{ tr('volume') }}</label>
                        <input
                            type="range"
                            id="volumeSlider"
                            class="ui-range"
                            min="0"
                            max="100"
                            :value="volume"
                            @input="onInput"
                        >
                        <span class="vol-val">{{ volume }}%</span>
                    </div>
                </div>

                <div class="setting-group">
                    <div class="setting-row">
                        <label for="langSelect">🌐 {{ tr('language') }}</label>
                        <select
                            id="langSelect"
                            class="ui-select"
                            :value="language"
                            @change="onLanguageChange"
                        >
                            <option value="zh">🇨🇳 中文</option>
                            <option value="en">🇺🇸 English</option>
                        </select>
                    </div>
                </div>

                <button class="ui-btn ui-btn-subtle" style="margin-top: 20px;" @click="emit('back')">
                    <span class="ui-btn-icon">←</span>
                    {{ tr('back') }}
                </button>
            </div>
        </div>
    </Transition>
</template>

<style scoped>
.settings-glow {
    position: absolute;
    top: -40px;
    left: 50%;
    transform: translateX(-50%);
    width: 260px;
    height: 120px;
    background: radial-gradient(ellipse, rgba(251, 191, 36, 0.1), transparent 70%);
    pointer-events: none;
}

.setting-group {
    margin-bottom: 24px;
    padding-bottom: 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.setting-group:last-of-type {
    margin-bottom: 0;
    padding-bottom: 0;
    border-bottom: none;
}

.setting-row {
    display: flex;
    align-items: center;
    gap: 14px;
    color: var(--ui-text);
    font-size: 16px;
}

.setting-row label {
    min-width: 100px;
    text-align: right;
    flex-shrink: 0;
    font-weight: 500;
    font-size: 15px;
}

.vol-val {
    min-width: 44px;
    text-align: left;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
    font-weight: 600;
    color: var(--ui-accent-gold);
    font-size: 15px;
}

/* 小屏压缩 */
@media (max-height: 460px) {
    .setting-row { font-size: 14px; gap: 10px; }
    .setting-row label { min-width: 85px; font-size: 14px; }
}
@media (max-height: 380px) {
    .setting-row { font-size: 13px; gap: 8px; }
    .setting-row label { min-width: 70px; }
    .vol-val { min-width: 38px; font-size: 13px; }
}
</style>
