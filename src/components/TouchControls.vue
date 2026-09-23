<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useI18n } from '../composables/useI18n';

const props = defineProps<{
    // 是否进入游戏（控制摇杆/按钮显示，旋转提示不受此影响）
    gameActive: boolean;
    // 设置面板是否打开（打开时隐藏触摸层，避免拦截滑块事件）
    settingsOpen: boolean;
    handlers: {
        onJoystickStart: (e: TouchEvent, centerX: number, centerY: number) => void;
        onJoystickMove: (e: TouchEvent) => { dx: number; dy: number };
        onJoystickEnd: (e: TouchEvent) => void;
        onCameraStart: (e: TouchEvent) => void;
        onCameraMove: (e: TouchEvent) => void;
        onCameraEnd: (e: TouchEvent) => void;
        pressJump: (e: TouchEvent) => void;
        releaseJump: (e: TouchEvent) => void;
        toggleDash: (e: TouchEvent) => void;
        dashActive: { value: boolean };
        toggleCameraMode: (e: TouchEvent) => void;
        onPauseTouch: (e: TouchEvent) => void;
    };
}>();

const { tr } = useI18n();

const emit = defineEmits<{
    pause: [];
}>();

// ===== 动态浮动摇杆状态 =====
const joystickActive = ref(false);
const joystickCenter = ref({ x: 0, y: 0 });
const joystickThumbOffset = ref({ x: 0, y: 0 });

// 竖屏检测：响应式控制旋转提示
const isPortrait = ref(false);
function updateOrientation() {
    isPortrait.value = window.matchMedia('(orientation: portrait)').matches;
}

onMounted(() => {
    updateOrientation();
    window.addEventListener('resize', updateOrientation);
    window.addEventListener('orientationchange', updateOrientation);
});
onUnmounted(() => {
    window.removeEventListener('resize', updateOrientation);
    window.removeEventListener('orientationchange', updateOrientation);
});

// 左半屏触摸 → 在触摸点生成动态摇杆
function joyLayerStart(e: TouchEvent) {
    e.preventDefault();
    const t = e.changedTouches[0];
    joystickCenter.value = { x: t.clientX, y: t.clientY };
    joystickThumbOffset.value = { x: 0, y: 0 };
    joystickActive.value = true;
    props.handlers.onJoystickStart(e, t.clientX, t.clientY);
}
function joyLayerMove(e: TouchEvent) {
    e.preventDefault();
    const offset = props.handlers.onJoystickMove(e);
    joystickThumbOffset.value = { x: offset.dx, y: offset.dy };
}
function joyLayerEnd(e: TouchEvent) {
    e.preventDefault();
    props.handlers.onJoystickEnd(e);
    joystickActive.value = false;
    joystickThumbOffset.value = { x: 0, y: 0 };
}
</script>

<template>
    <!-- 竖屏旋转提示（仅竖屏时显示，z-index 2000 盖住所有 UI） -->
    <div v-if="isPortrait" id="rotateHint">
        <div class="rotate-icon">📱</div>
        <h2>{{ tr('rotateHintTitle') }}</h2>
        <p>{{ tr('rotateHintDesc') }}</p>
    </div>

    <!-- 触控控件（横屏 + 游戏中 + 设置面板未打开时显示） -->
    <div v-if="!isPortrait && gameActive && !settingsOpen" id="touchControls">
        <!-- 左半屏：动态摇杆触摸层（任意位置按下生成摇杆） -->
        <div id="joystickLayer"
            @touchstart="joyLayerStart"
            @touchmove="joyLayerMove"
            @touchend="joyLayerEnd"
            @touchcancel="joyLayerEnd"
        />
        <!-- 右半屏：相机拖拽 -->
        <div id="cameraLayer"
            @touchstart="props.handlers.onCameraStart"
            @touchmove="props.handlers.onCameraMove"
            @touchend="props.handlers.onCameraEnd"
            @touchcancel="props.handlers.onCameraEnd"
        />
        <!-- 动态浮动摇杆（触摸时出现在手指位置） -->
        <div v-if="joystickActive" id="joystick"
            :style="{ left: joystickCenter.x + 'px', top: joystickCenter.y + 'px' }">
            <div id="joystickThumb"
                :style="{ transform: `translate(${joystickThumbOffset.x}px, ${joystickThumbOffset.y}px)` }" />
        </div>
        <button class="touch-btn" id="btnDash"
            :class="{ active: props.handlers.dashActive.value }"
            @touchstart="props.handlers.toggleDash"
        >{{ tr('dash') }}</button>
        <button class="touch-btn" id="btnJump"
            @touchstart="props.handlers.pressJump"
            @touchend="props.handlers.releaseJump"
            @touchcancel="props.handlers.releaseJump"
        >{{ tr('jump') }}</button>
        <button class="touch-btn" id="btnCameraMode"
            @touchstart="props.handlers.toggleCameraMode"
        >👁</button>
        <button class="touch-btn" id="btnPauseTouch"
            @touchstart="props.handlers.onPauseTouch"
        >‖</button>
    </div>
</template>

<style scoped>
#rotateHint {
    position: fixed;
    inset: 0;
    z-index: 2000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1.25rem;
    background: linear-gradient(135deg, #080817 0%, #111827 50%, #082032 100%);
    color: #fff;
    text-align: center;
}

.rotate-icon {
    margin-bottom: 1.125rem;
    font-size: 4rem;
    animation: rotateAnim 2s ease-in-out infinite;
}

@keyframes rotateAnim {
    0%, 100% { transform: rotate(0); }
    50% { transform: rotate(90deg); }
}

#rotateHint h2 {
    margin-bottom: 0.4375rem;
    font-size: 1.625rem;
}

#rotateHint p {
    color: #aab;
    font-size: 1rem;
}

#touchControls {
    position: fixed;
    inset: 0;
    z-index: 100;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
}

#joystickLayer,
#cameraLayer {
    position: absolute;
    top: 0;
    height: 100%;
    background: transparent;
}

#joystickLayer {
    left: 0;
    width: 50%;
}

#cameraLayer {
    right: 0;
    width: 50%;
}

#joystick {
    position: fixed;
    width: 7.25rem;
    height: 7.25rem;
    margin-left: -3.625rem;
    margin-top: -3.625rem;
    border: 2px solid rgba(255, 255, 255, 0.28);
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    pointer-events: none;
    backdrop-filter: blur(4px);
    animation: joyFadeIn 0.15s ease-out;
    z-index: 101;
}

@keyframes joyFadeIn {
    from { opacity: 0; transform: scale(0.8); }
    to { opacity: 1; transform: scale(1); }
}

#joystickThumb {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 3rem;
    height: 3rem;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.92), rgba(200, 200, 220, 0.7));
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    pointer-events: none;
}

.touch-btn {
    position: absolute;
    display: grid;
    place-items: center;
    padding: 0;
    border: 2px solid rgba(255, 255, 255, 0.32);
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.46);
    color: #fff;
    font-weight: 700;
    cursor: pointer;
    backdrop-filter: blur(5px);
    touch-action: none;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    transition: transform 0.12s ease, background 0.2s ease, box-shadow 0.2s ease;
}

.touch-btn:active {
    transform: scale(0.92);
}

#btnJump {
    right: max(1.5rem, env(safe-area-inset-right) + 1.125rem);
    bottom: max(1.875rem, env(safe-area-inset-bottom) + 1.375rem);
    width: 5.75rem;
    height: 5.75rem;
    background: rgba(74, 144, 226, 0.5);
    font-size: 1.125rem;
}

#btnDash {
    right: max(7rem, calc(env(safe-area-inset-right) + 6.75rem));
    bottom: max(5.25rem, calc(env(safe-area-inset-bottom) + 4.75rem));
    width: 4.25rem;
    height: 4.25rem;
    background: rgba(255, 107, 107, 0.5);
    font-size: 0.875rem;
}

#btnDash.active {
    border-color: rgba(255, 200, 200, 0.9);
    background: rgba(255, 60, 60, 0.82);
    box-shadow: 0 0 16px rgba(255, 80, 80, 0.7);
    transform: scale(0.95);
}

#btnCameraMode,
#btnPauseTouch {
    top: max(0.75rem, env(safe-area-inset-top) + 0.5625rem);
    width: 3rem;
    height: 3rem;
    background: rgba(0, 0, 0, 0.5);
    font-size: 1.25rem;
}

#btnCameraMode {
    right: max(4.125rem, calc(env(safe-area-inset-right) + 3.875rem));
}

#btnPauseTouch {
    right: max(0.75rem, env(safe-area-inset-right) + 0.5625rem);
}

@media (max-height: 460px), (max-width: 700px) {
    #joystick {
        width: 6.25rem;
        height: 6.25rem;
        margin-left: -3.125rem;
        margin-top: -3.125rem;
    }
    #joystickThumb {
        width: 2.5rem;
        height: 2.5rem;
    }
    #btnJump {
        right: max(1rem, env(safe-area-inset-right) + 0.75rem);
        bottom: max(1.25rem, env(safe-area-inset-bottom) + 0.9375rem);
        width: 4.5rem;
        height: 4.5rem;
        font-size: 0.875rem;
    }
    #btnDash {
        right: max(5.5rem, calc(env(safe-area-inset-right) + 5.25rem));
        bottom: max(4rem, calc(env(safe-area-inset-bottom) + 3.5625rem));
        width: 3.5rem;
        height: 3.5rem;
        font-size: 0.75rem;
    }
    #btnCameraMode,
    #btnPauseTouch {
        top: max(0.5rem, env(safe-area-inset-top) + 0.375rem);
        width: 2.625rem;
        height: 2.625rem;
        font-size: 1.0625rem;
    }
    #btnCameraMode {
        right: max(3.375rem, calc(env(safe-area-inset-right) + 3.125rem));
    }
}

@media (max-height: 340px) {
    #joystick {
        width: 4.875rem;
        height: 4.875rem;
        margin-left: -2.4375rem;
        margin-top: -2.4375rem;
    }
    #joystickThumb {
        width: 2.125rem;
        height: 2.125rem;
    }
    #btnJump {
        width: 3.5rem;
        height: 3.5rem;
    }
    #btnDash {
        width: 2.875rem;
        height: 2.875rem;
        right: max(4.875rem, calc(env(safe-area-inset-right) + 4.625rem));
        bottom: max(3.375rem, calc(env(safe-area-inset-bottom) + 3rem));
    }
}
</style>
