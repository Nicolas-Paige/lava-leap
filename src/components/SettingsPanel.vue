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

                <button class="ui-btn ui-btn-subtle settings-back" @click="emit('back')">
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
    top: -2.5rem;
    left: 50%;
    width: 17.5rem;
    height: 8.125rem;
    transform: translateX(-50%);
    background: radial-gradient(ellipse, rgba(251, 191, 36, 0.11), transparent 70%);
    pointer-events: none;
}

.setting-group {
    position: relative;
    z-index: 1;
    margin-bottom: 1.25rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.setting-group:last-of-type {
    margin-bottom: 0;
    padding-bottom: 0;
    border-bottom: 0;
}

.settings-back {
    margin-top: 1.25rem;
}

.setting-row {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    color: var(--ui-text);
    font-size: 1rem;
}

.setting-row label {
    flex: 0 0 auto;
    min-width: 6.25rem;
    font-size: 0.9375rem;
    font-weight: 500;
    text-align: right;
}

.vol-val {
    flex: 0 0 auto;
    min-width: 3rem;
    color: var(--ui-accent-gold);
    font-size: 0.9375rem;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    text-align: left;
}

@media (max-height: 500px) {
    .setting-group {
        margin-bottom: 0.875rem;
        padding-bottom: 0.75rem;
    }
    .setting-row {
        gap: 0.5rem;
        font-size: 0.9375rem;
    }
    .setting-row label {
        min-width: 4.75rem;
        font-size: 0.8125rem;
    }
    .vol-val {
        min-width: 2.375rem;
        font-size: 0.8125rem;
    }
}
</style>
