import * as THREE from 'three';
import { MC_PALETTE, PIXEL_TEX_VARIANTS, type PaletteSeg } from './constants';

// ============== Minecraft 像素风纹理生成（多面版） ==============
// 每色段预生成 PIXEL_TEX_VARIANTS 个 16x16 像素纹理变体
// 顶面用 top 色，底面用 base 色，侧面用 base 色 + 顶部 1/4 为 top 色（模拟草地溢边）
// NearestFilter 保留像素硬边，4x4 cell 形成方块拼接感

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

// 生成 16x16 像素纹理：4x4 个 cell，每 cell 内同色，cell 间 ±15% 亮度差异
function makePixelTexture(base: { r: number; g: number; b: number }): THREE.CanvasTexture {
    const size = 16;
    const cellSize = 4;
    const cvs = document.createElement('canvas');
    cvs.width = cvs.height = size;
    const ctx = cvs.getContext('2d')!;

    for (let cy = 0; cy < size; cy += cellSize) {
        for (let cx = 0; cx < size; cx += cellSize) {
            // 每 cell 基础亮度（±15%）—— 形成"小方块"拼接感
            const cellJitter = (Math.random() - 0.5) * 0.30;
            const r = base.r * (1 + cellJitter);
            const g = base.g * (1 + cellJitter);
            const b = base.b * (1 + cellJitter);
            ctx.fillStyle = `rgb(${clamp255(r)},${clamp255(g)},${clamp255(b)})`;
            ctx.fillRect(cx, cy, cellSize, cellSize);
            // cell 内每像素再 ±5% 微扰，模拟材质噪声
            for (let py = 0; py < cellSize; py++) {
                for (let px = 0; px < cellSize; px++) {
                    const pxJ = (Math.random() - 0.5) * 0.10;
                    ctx.fillStyle = `rgb(${clamp255(r * (1 + pxJ))},${clamp255(g * (1 + pxJ))},${clamp255(b * (1 + pxJ))})`;
                    ctx.fillRect(cx + px, cy + py, 1, 1);
                }
            }
        }
    }

    const tex = new THREE.CanvasTexture(cvs);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

// 生成侧面纹理：底部用 base 色，顶部约 1/4 用 top 色（模拟草地溢边）
function makeSideTexture(top: { r: number; g: number; b: number }, base: { r: number; g: number; b: number }): THREE.CanvasTexture {
    const size = 16;
    const cellSize = 4;
    const cvs = document.createElement('canvas');
    cvs.width = cvs.height = size;
    const ctx = cvs.getContext('2d')!;

    // 顶部 grass 层高度（约纹理顶部的 1/4）
    const grassRows = 4;

    for (let cy = 0; cy < size; cy += cellSize) {
        for (let cx = 0; cx < size; cx += cellSize) {
            // 判断当前 cell 是在顶部 grass 区还是底部 base 区
            const isTop = cy < grassRows;
            const colorBase = isTop ? top : base;

            const cellJitter = (Math.random() - 0.5) * 0.30;
            const r = colorBase.r * (1 + cellJitter);
            const g = colorBase.g * (1 + cellJitter);
            const b = colorBase.b * (1 + cellJitter);
            ctx.fillStyle = `rgb(${clamp255(r)},${clamp255(g)},${clamp255(b)})`;
            ctx.fillRect(cx, cy, cellSize, cellSize);
            for (let py = 0; py < cellSize; py++) {
                for (let px = 0; px < cellSize; px++) {
                    const pxJ = (Math.random() - 0.5) * 0.10;
                    ctx.fillStyle = `rgb(${clamp255(r * (1 + pxJ))},${clamp255(g * (1 + pxJ))},${clamp255(b * (1 + pxJ))})`;
                    ctx.fillRect(cx + px, cy + py, 1, 1);
                }
            }
        }
    }

    const tex = new THREE.CanvasTexture(cvs);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping; // 侧面顶部覆盖色只出现一次，禁止纵向循环
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

// 三面纹理集合
export interface LayerTextureSet {
    top: THREE.CanvasTexture;       // 顶面
    side: THREE.CanvasTexture;      // 侧面（base + top 溢边）
    bottom: THREE.CanvasTexture;    // 底面
}

// 每色段预生成 4 个三面纹理变体
const layerTextureSets: LayerTextureSet[][] = MC_PALETTE.map((seg: PaletteSeg) => {
    const arr: LayerTextureSet[] = [];
    for (let i = 0; i < PIXEL_TEX_VARIANTS; i++) {
        arr.push({
            top: makePixelTexture(seg.top),
            side: makeSideTexture(seg.top, seg.base),
            bottom: makePixelTexture(seg.base),
        });
    }
    return arr;
});

// 按 layer 取一个三面纹理变体（每个平台独立 clone 以便独立 repeat）
export function getLayerTextures(layer: number): LayerTextureSet {
    let segIdx = MC_PALETTE.findIndex(s => layer <= s.maxLayer);
    if (segIdx < 0) segIdx = MC_PALETTE.length - 1;
    const variants = layerTextureSets[segIdx];
    const src = variants[Math.floor(Math.random() * variants.length)];
    return {
        top: cloneTex(src.top),
        side: cloneTex(src.side),
        bottom: cloneTex(src.bottom),
    };
}

// 兼容旧接口（单纹理，已弃用）
export function getLayerTexture(layer: number): THREE.CanvasTexture {
    let segIdx = MC_PALETTE.findIndex(s => layer <= s.maxLayer);
    if (segIdx < 0) segIdx = MC_PALETTE.length - 1;
    const variants = layerTextureSets[segIdx];
    const src = variants[Math.floor(Math.random() * variants.length)].side;
    return cloneTex(src);
}

function cloneTex(src: THREE.CanvasTexture): THREE.CanvasTexture {
    const clone = src.clone();
    clone.needsUpdate = true;
    return clone;
}

// 色段名（调试用）
export function getLayerSegName(layer: number): string {
    let segIdx = MC_PALETTE.findIndex(s => layer <= s.maxLayer);
    if (segIdx < 0) segIdx = MC_PALETTE.length - 1;
    return MC_PALETTE[segIdx].name;
}

// 释放所有缓存的纹理（卸载游戏时调用）
export function disposePixelTextures(): void {
    for (const variants of layerTextureSets) {
        for (const set of variants) {
            set.top.dispose();
            set.side.dispose();
            set.bottom.dispose();
        }
    }
}
