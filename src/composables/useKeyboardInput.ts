import { onMounted, onUnmounted, type Ref } from 'vue';
import { MOUSE_SENS } from '../game/constants';
import type { InputKeys } from '../game/types';
import { ACTIONS, bindings, matchesBinding, isRecordingBinding } from './useKeyBindings';

// useGame 返回的 input 对象类型
type InputBridge = {
    keys: InputKeys;
    setYaw: (v: number) => void;
    getYaw: () => number;
    setPitch: (v: number) => void;
    getPitch: () => number;
    toggleCameraMode: () => void;
    mouseSens: number;
};

export interface UseKeyboardOptions {
    input: InputBridge;
    isTouchDevice: boolean;
    // 状态查询函数
    isPlaying: () => boolean;
    isPaused: () => boolean;
    isDead: () => boolean;
    isDying: () => boolean;
    isSettings: () => boolean;
    // 菜单控制
    togglePause: () => void;
    closeMenu: () => void;
    openMenu: () => void;
    // canvasRef 用于 requestPointerLock
    canvas: Ref<HTMLCanvasElement | null>;
}

// 输入框内不拦截按键（昵称输入等）
function isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

export function useKeyboardInput(opts: UseKeyboardOptions) {
    const { input, isTouchDevice, canvas } = opts;

    // 持续按住型动作（走 InputKeys）
    const held = ACTIONS.filter(a => a.field);
    // 一次性动作 id
    const codeOf = (id: typeof ACTIONS[number]['id']) => bindings.value[id];

    const onKeyDown = (e: KeyboardEvent) => {
        if (isTypingTarget(e.target)) return;
        // 键位录制中：不驱动游戏
        if (isRecordingBinding()) return;

        // 空格默认会滚动页面，游戏中始终阻止
        if (e.code === 'Space') e.preventDefault();

        if (e.repeat) return;   // 忽略系统自动重复

        for (const a of held) {
            if (matchesBinding(codeOf(a.id), e.code)) {
                input.keys[a.field!] = true;
            }
        }

        // 一次性动作
        if (matchesBinding(codeOf('camera'), e.code)) {
            input.toggleCameraMode();
        }
    };

    const onKeyUp = (e: KeyboardEvent) => {
        if (isTypingTarget(e.target)) return;
        if (isRecordingBinding()) {
            // 录制中抬起也同步清零，避免状态残留
            for (const a of held) {
                if (matchesBinding(codeOf(a.id), e.code)) input.keys[a.field!] = false;
            }
            return;
        }
        for (const a of held) {
            if (matchesBinding(codeOf(a.id), e.code)) {
                input.keys[a.field!] = false;
            }
        }
    };

    // 失焦时清空按键（切窗口回来不会一直往前走）
    const onBlur = () => {
        for (const a of held) input.keys[a.field!] = false;
    };

    const onClick = () => {
        if (isTouchDevice) return;
        // 只在游戏中点击才请求 pointer lock（避免开始按钮点击触发）
        if (!opts.isPlaying()) return;
        if (opts.isPaused() || opts.isSettings()) return;
        // 新版 Chrome 返回 Promise，锁定被拒（如 ESC 退出后的冷却期）时会 reject，
        // 这里兜住避免控制台抛未处理拒绝；失败本身由 HUD 的锁定引导提示玩家再点一次。
        const r = canvas.value?.requestPointerLock?.() as unknown;
        if (r && typeof (r as Promise<void>).catch === 'function') {
            (r as Promise<void>).catch(() => {});
        }
    };

    const onPointerLockChange = () => {
        if (isTouchDevice) return;
        if (!document.pointerLockElement && opts.isPlaying() && !opts.isDead() && !opts.isDying()) {
            opts.openMenu();
        }
    };

    const onMouseMove = (e: MouseEvent) => {
        if (document.pointerLockElement === document.body || document.pointerLockElement === canvas.value) {
            input.setYaw(input.getYaw() - e.movementX * MOUSE_SENS);
            input.setPitch(input.getPitch() - e.movementY * MOUSE_SENS);
        }
    };

    // 暂停键（playing ↔ paused 互切；settings 时回菜单）
    const onKeyToggle = (e: KeyboardEvent) => {
        if (isTypingTarget(e.target)) return;
        if (isRecordingBinding()) return;
        if (!matchesBinding(codeOf('pause'), e.code)) return;
        // idle / 死亡菜单 不处理
        if (!opts.isPlaying() && !opts.isPaused() && !opts.isSettings()) return;
        if (opts.isDead() || opts.isDying()) return;
        if (opts.isSettings()) {
            opts.closeMenu();  // 关设置回菜单
            return;
        }
        opts.togglePause();
    };

    // 菜单键（paused→playing, settings→关闭当前面板）
    const onKeyEsc = (e: KeyboardEvent) => {
        if (isTypingTarget(e.target)) return;
        if (isRecordingBinding()) return;
        if (!matchesBinding(codeOf('menu'), e.code)) return;
        // idle 不处理
        if (!opts.isPlaying() && !opts.isPaused() && !opts.isSettings()) return;
        if (opts.isDead() || opts.isDying()) return;
        if (opts.isSettings()) {
            opts.closeMenu();
            return;
        }
        if (opts.isPaused()) opts.closeMenu();
    };

    onMounted(() => {
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        document.addEventListener('click', onClick);
        document.addEventListener('pointerlockchange', onPointerLockChange);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('keydown', onKeyToggle);
        document.addEventListener('keydown', onKeyEsc);
        window.addEventListener('blur', onBlur);
    });

    onUnmounted(() => {
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        document.removeEventListener('click', onClick);
        document.removeEventListener('pointerlockchange', onPointerLockChange);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('keydown', onKeyToggle);
        document.removeEventListener('keydown', onKeyEsc);
        window.removeEventListener('blur', onBlur);
    });
}
