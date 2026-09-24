import { ref, watch } from 'vue';
import type { InputKeys } from '../game/types';
import { language } from './useI18n';

// ============== 键位绑定系统 ==============
// 使用 KeyboardEvent.code 作为绑定值（不受输入法 / 大小写 / 键盘布局影响）

export type ActionId =
    | 'forward' | 'back' | 'left' | 'right'
    | 'jump' | 'dash' | 'camera' | 'pause' | 'menu';

export interface ActionDef {
    id: ActionId;
    /** i18n 文案 key */
    labelKey: string;
    /** 默认按键 code */
    defaultCode: string;
    /** 持续按住型动作对应的 InputKeys 字段；一次性动作为 undefined */
    field?: keyof InputKeys;
}

/** 动作定义顺序 = 面板展示顺序 */
export const ACTIONS: ActionDef[] = [
    { id: 'forward', labelKey: 'actionForward', defaultCode: 'KeyW', field: 'w' },
    { id: 'left', labelKey: 'actionLeft', defaultCode: 'KeyA', field: 'a' },
    { id: 'back', labelKey: 'actionBack', defaultCode: 'KeyS', field: 's' },
    { id: 'right', labelKey: 'actionRight', defaultCode: 'KeyD', field: 'd' },
    { id: 'jump', labelKey: 'actionJump', defaultCode: 'Space', field: 'space' },
    { id: 'dash', labelKey: 'actionDash', defaultCode: 'ShiftLeft', field: 'shift' },
    { id: 'camera', labelKey: 'actionCamera', defaultCode: 'KeyV' },
    { id: 'pause', labelKey: 'actionPause', defaultCode: 'KeyP' },
    { id: 'menu', labelKey: 'actionMenu', defaultCode: 'Escape' },
];

const ACTION_MAP: Record<ActionId, ActionDef> = ACTIONS.reduce((acc, a) => {
    acc[a.id] = a;
    return acc;
}, {} as Record<ActionId, ActionDef>);

export function getAction(id: ActionId): ActionDef {
    return ACTION_MAP[id];
}

// 左右修饰键视为同一个键（ShiftLeft / ShiftRight 都算 Shift）
const MODIFIER_ALIAS: Record<string, string> = {
    ShiftLeft: 'Shift', ShiftRight: 'Shift',
    ControlLeft: 'Control', ControlRight: 'Control',
    AltLeft: 'Alt', AltRight: 'Alt',
    MetaLeft: 'Meta', MetaRight: 'Meta',
};

/** 归一化：把左右修饰键合并，用于冲突比较与按键匹配 */
export function normalizeCode(code: string): string {
    if (!code) return '';
    return MODIFIER_ALIAS[code] ?? code;
}

/** 判断一次按键是否命中某个绑定 */
export function matchesBinding(boundCode: string, pressedCode: string): boolean {
    if (!boundCode) return false;
    return normalizeCode(boundCode) === normalizeCode(pressedCode);
}

// ============== 键位显示名 ==============
const SPECIAL_LABELS: Record<string, { zh: string; en: string }> = {
    Space: { zh: '空格', en: 'Space' },
    Escape: { zh: 'Esc', en: 'Esc' },
    Enter: { zh: '回车', en: 'Enter' },
    Tab: { zh: 'Tab', en: 'Tab' },
    Backspace: { zh: '退格', en: 'Backspace' },
    Shift: { zh: 'Shift', en: 'Shift' },
    Control: { zh: 'Ctrl', en: 'Ctrl' },
    Alt: { zh: 'Alt', en: 'Alt' },
    Meta: { zh: 'Win', en: 'Win' },
    CapsLock: { zh: '大写锁定', en: 'CapsLock' },
    ArrowUp: { zh: '↑', en: '↑' },
    ArrowDown: { zh: '↓', en: '↓' },
    ArrowLeft: { zh: '←', en: '←' },
    ArrowRight: { zh: '→', en: '→' },
};

/** 把 code 转成可读的按键名（跟随当前语言） */
export function formatKeyCode(code: string): string {
    if (!code) return '';
    const norm = normalizeCode(code);
    const special = SPECIAL_LABELS[norm];
    if (special) return language.value === 'en' ? special.en : special.zh;
    if (norm.startsWith('Key')) return norm.slice(3);
    if (norm.startsWith('Digit')) return norm.slice(5);
    if (norm.startsWith('Numpad')) return `Num ${norm.slice(6)}`;
    return norm;
}

// ============== 持久化 ==============
const STORAGE_KEY = 'lava-leap-keybindings';

function defaultBindings(): Record<ActionId, string> {
    const out = {} as Record<ActionId, string>;
    for (const a of ACTIONS) out[a.id] = a.defaultCode;
    return out;
}

function loadBindings(): Record<ActionId, string> {
    const base = defaultBindings();
    if (typeof localStorage === 'undefined') return base;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return base;
        const saved = JSON.parse(raw) as Partial<Record<ActionId, string>>;
        for (const a of ACTIONS) {
            if (typeof saved[a.id] === 'string') base[a.id] = saved[a.id] as string;
        }
    } catch {
        // 读取失败回退默认
    }
    return base;
}

// 模块级单例，所有组件共享
export const bindings = ref<Record<ActionId, string>>(loadBindings());

function persist() {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings.value));
    } catch {
        // 忽略配额 / 隐私模式错误
    }
}

watch(bindings, persist, { deep: true });

/** 正在录制的动作（录制中游戏输入应被屏蔽） */
export const recordingAction = ref<ActionId | null>(null);

export function isRecordingBinding(): boolean {
    return recordingAction.value !== null;
}

/**
 * 重新绑定某个动作。
 * 若新按键已被其它动作占用，会解除其它动作的绑定并返回被解除的动作 id。
 */
export function rebind(id: ActionId, code: string): ActionId | null {
    const norm = normalizeCode(code);
    let conflict: ActionId | null = null;
    for (const a of ACTIONS) {
        if (a.id === id) continue;
        if (bindings.value[a.id] && normalizeCode(bindings.value[a.id]) === norm) {
            bindings.value[a.id] = '';
            conflict = a.id;
        }
    }
    bindings.value[id] = code;
    return conflict;
}

export function unbind(id: ActionId) {
    bindings.value[id] = '';
}

export function resetBindings() {
    bindings.value = defaultBindings();
}

/** 清空所有按键状态（打开键位面板 / 关闭面板时避免按键卡住） */
export function releaseKeys(keys: InputKeys) {
    keys.w = keys.a = keys.s = keys.d = false;
    keys.space = false;
    keys.shift = false;
}
