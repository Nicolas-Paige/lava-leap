import type { GameMode } from './types';
import { classicMode } from './classic.mode';

// ============== 模式注册表 ==============
// 当前仅保留一个统一模式，界面不再提供模式选择

export const MODES: GameMode[] = [
    classicMode,
];

export function getModeById(id: string): GameMode | undefined {
    return MODES.find(m => m.id === id);
}

export const DEFAULT_MODE = classicMode;
