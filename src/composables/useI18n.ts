import { ref, computed } from 'vue';

export type Language = 'zh' | 'en';

// 翻译字符串表
const translations = {
    // StartOverlay
    startBtn: { zh: '开始游戏', en: 'Start Game' },
    loadingFailed: { zh: '加载失败，点击重试', en: 'Load failed, tap to retry' },
    loadingProgress: { zh: '加载中...', en: 'Loading...' },

    // Hud（键位说明已移入设置面板，HUD 只保留鼠标锁定引导）
    tipLockMouse: { zh: '点击锁定鼠标', en: 'Click to lock mouse' },
    layerUnit: { zh: '层', en: 'Layer' },
    best: { zh: '最高：', en: 'Best: ' },

    // EscMenu
    dead: { zh: '你死了', en: 'You Died' },
    paused: { zh: '暂停', en: 'Paused' },
    resume: { zh: '继续游戏', en: 'Resume' },
    restart: { zh: '重新开始', en: 'Restart' },
    settings: { zh: '设置', en: 'Settings' },
    quit: { zh: '退出游戏', en: 'Quit Game' },
    leaderboard: { zh: '排行榜', en: 'Leaderboard' },
    deadHint: { zh: '选择重新开始或退出游戏', en: 'Choose restart or quit' },
    pausedHint: {
        zh: '按 ESC 或 P 关闭菜单继续游戏',
        en: 'Press ESC or P to close menu and resume',
    },

    // SettingsPanel
    settingsTitle: { zh: '设置', en: 'Settings' },
    volume: { zh: '音量', en: 'Volume' },
    back: { zh: '返回', en: 'Back' },
    language: { zh: '语言', en: 'Language' },

    // KeyBindingsPanel
    keybindOpen: { zh: '键位设置', en: 'Key Bindings' },
    keybindTitle: { zh: '键位设置', en: 'Key Bindings' },
    keybindHint: { zh: '点按右侧按键后按下新键位，录制中按 Esc 取消', en: 'Click a key then press a new one, Esc to cancel' },
    keybindRecording: { zh: '按下按键…', en: 'Press a key…' },
    keybindUnset: { zh: '未绑定', en: 'Unbound' },
    keybindReset: { zh: '恢复默认', en: 'Reset' },
    keybindResetDone: { zh: '已恢复默认键位', en: 'Reset to defaults' },
    keybindUnbindTitle: { zh: '解除该键位', en: 'Unbind' },
    keybindConflict: { zh: '已解除与「{action}」的冲突', en: 'Unbound conflicting key of "{action}"' },
    keybindLocked: { zh: '「{action}」不可被占用，否则键盘将无法关闭菜单', en: '"{action}" cannot be taken, or the keyboard could no longer close menus' },
    keybindLockedTitle: { zh: '该动作不可解除绑定', en: 'This action cannot be unbound' },

    // 动作名
    actionForward: { zh: '前进', en: 'Forward' },
    actionBack: { zh: '后退', en: 'Backward' },
    actionLeft: { zh: '左移', en: 'Left' },
    actionRight: { zh: '右移', en: 'Right' },
    actionJump: { zh: '跳跃', en: 'Jump' },
    actionDash: { zh: '冲刺', en: 'Dash' },
    actionCamera: { zh: '切换视角', en: 'Toggle view' },
    actionPause: { zh: '暂停', en: 'Pause' },
    actionMenu: { zh: '关闭菜单', en: 'Close menu' },

    // TouchControls
    rotateHintTitle: { zh: '请横屏使用', en: 'Please use landscape' },
    rotateHintDesc: { zh: '本游戏需要横屏体验', en: 'This game requires landscape mode' },
    dash: { zh: '冲刺', en: 'Dash' },
    jump: { zh: '跳', en: 'Jump' },

    // Modes（key 必须与 xxx.mode.ts 里的 name/description 对应）
    'mode.classic.name': { zh: '熔岩攀登', en: 'Lava Ascent' },
    'mode.classic.desc': { zh: '前期经典平台，高层逐步加入移动与消失平台', en: 'Classic platforms below, moving and vanishing platforms above' },
} as const;

export type TranslationKey = keyof typeof translations;

const STORAGE_KEY = 'lava-leap-language';

function detectInitialLanguage(): Language {
    if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'zh' || saved === 'en') return saved;
    }
    // 浏览器语言检测
    if (typeof navigator !== 'undefined') {
        const lang = navigator.language.toLowerCase();
        if (lang.startsWith('zh')) return 'zh';
        if (lang.startsWith('en')) return 'en';
    }
    return 'zh';  // 默认中文
}

// 模块级单例（所有组件 import 共享同一实例）
export const language = ref<Language>(detectInitialLanguage());

function setLanguage(lang: Language) {
    language.value = lang;
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, lang);
    }
}

export function useI18n() {
    const t = computed(() => translations);

    function tr(key: TranslationKey | string): string {
        const k = key as TranslationKey;
        return (translations as Record<string, { zh: string; en: string }>)[k]?.[language.value] ?? key;
    }

    return {
        language,
        setLanguage,
        tr,
    };
}
