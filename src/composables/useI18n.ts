import { ref, computed } from 'vue';

export type Language = 'zh' | 'en';

// 翻译字符串表
const translations = {
    // StartOverlay
    startHint: {
        zh: '往上跳！随机平台不断生成，看你能跳多高\nWASD 移动 | Shift 冲刺 | 空格跳跃 | 鼠标转视角 | V 切换视角 | ESC / P 暂停\n冲刺时跳跃更高更远，岩浆会从下方缓慢追上来，碰到就死',
        en: 'Jump up! Random platforms keep generating, see how high you can go\nWASD move | Shift dash | Space jump | Mouse view | V toggle view | ESC / P pause\nDash + jump goes higher and farther, lava rises from below, touch it and die',
    },
    startHintTouch: {
        zh: '往上跳！随机平台不断生成，看你能跳多高\n左半屏按住拖动摇杆移动 | 右半屏滑动转视角 | 「跳」按钮跳跃 | 「冲刺」点按切换 | 👁 切换视角 | ‖ 暂停\n冲刺时跳跃更高更远，岩浆会从下方缓慢追上来，碰到就死',
        en: 'Jump up! Random platforms keep generating, see how high you can go\nLeft half drag joystick to move | Right half drag to view | Jump button | Dash toggle | 👁 toggle view | ‖ pause\nDash + jump goes higher and farther, lava rises from below, touch it and die',
    },
    startBtn: { zh: '开始游戏', en: 'Start Game' },
    loadingFailed: { zh: '加载失败，点击重试', en: 'Load failed, tap to retry' },
    loadingProgress: { zh: '加载中...', en: 'Loading...' },

    // Hud
    keyboardTip: {
        zh: '点击锁定鼠标 | WASD移动 | Shift冲刺 | 空格跳跃 | 鼠标转视角 | V切换视角 | ESC/P暂停 | 往上跳，别被岩浆追上',
        en: 'Click to lock mouse | WASD move | Shift dash | Space jump | Mouse view | V toggle view | ESC/P pause | Jump up, don\'t get caught by lava',
    },
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

    // TouchControls
    rotateHintTitle: { zh: '请横屏使用', en: 'Please use landscape' },
    rotateHintDesc: { zh: '本游戏需要横屏体验', en: 'This game requires landscape mode' },
    dash: { zh: '冲刺', en: 'Dash' },
    jump: { zh: '跳', en: 'Jump' },

    // Modes（key 必须与 xxx.mode.ts 里的 name/description 对应）
    'mode.classic.name': { zh: '经典模式', en: 'Classic' },
    'mode.classic.desc': { zh: '岩浆慢速追，能跳多高跳多高', en: 'Lava rises slowly, jump as high as you can' },
    'mode.inferno.name': { zh: '地狱模式', en: 'Inferno' },
    'mode.inferno.desc': { zh: '移动 + 消失平台，岩浆更快追击', en: 'Moving & disappearing platforms, faster lava' },
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
const language = ref<Language>(detectInitialLanguage());

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
