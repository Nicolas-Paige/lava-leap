#!/usr/bin/env node
/**
 * 角色 GLB 离线修正工具
 *
 * 解决两类模型导出侧缺陷。修在文件里比修在运行时更通用——
 * 任何加载方（游戏、编辑器、预览器）拿到的都是修好的模型。
 *
 *   1) Idle 整体漂移：生成器导出的待机动作幅度过大（左右摆 / 上下起伏），
 *      站着不动像在飘。把每个关键帧朝该通道首帧姿态收缩。
 *   2) 死亡悬空：mixamo 类死亡动画只有 Hips.rotation、没有 Hips.translation，
 *      身体蜷下去后人仍停在站立高度。补一条 Hips.translation 通道压回地面。
 *
 * 实现要点（踩过的坑都记在这里）：
 *   - 关键帧收缩是"原地改写"：关键帧数量不变，只改 BIN 里的 Float32 值，
 *     JSON 结构完全不动，零结构风险。
 *   - 补根骨位移是"追加"：新数据写到 BIN 末尾，新增 bufferView/accessor/sampler/channel。
 *   - BIN chunk 起点 = 20 + jsonLen + 8（要跳过 8 字节 chunk 头，漏了会全部错位）。
 *   - accessor 可能共用 bufferView，读写都要按 byteStride + byteOffset 定位。
 *   - 判定姿态一律用蒙皮包围盒（`bind → Σw·boneMat → bindInverse → matrixWorld`），
 *     骨骼世界坐标在蒙皮模型上不可信。
 *
 * 用法：
 *   node scripts/fix-character-glb.mjs <input.glb> [选项]
 *     --out=<path>          输出路径（默认 <input 去扩展名>.fixed.glb）
 *     --idle-scale=0.35     Idle 保留比例（1=原样，0=完全静止；>=1 表示不动 Idle）
 *     --death-root          补死亡根骨位移
 *     --death-samples=25    死亡根骨位移关键帧数
 *     --report              只输出体检报告，不改文件
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Quaternion, Vector3, Matrix4, AnimationMixer } from 'three';

const NUM_COMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

// ---------------- GLB 读写 ----------------

function loadGlb(file) {
    const raw = fs.readFileSync(file);
    if (raw.readUInt32LE(0) !== 0x46546c67) throw new Error('不是 GLB 文件');
    const jsonLen = raw.readUInt32LE(12);
    if (raw.readUInt32LE(16) !== 0x4e4f534a) throw new Error('JSON chunk 魔数错误');
    const json = JSON.parse(raw.slice(20, 20 + jsonLen).toString('utf8'));
    const binStart = 20 + jsonLen + 8;
    const binLen = raw.readUInt32LE(20 + jsonLen);
    const bin = Buffer.from(raw.slice(binStart, binStart + binLen));
    return { json, bin };
}

function writeGlb(file, json, bin) {
    // 先把 bin 补齐到 4 字节对齐，再回填 buffer 长度，最后才序列化 JSON
    const binPad = (4 - (bin.length % 4)) % 4;
    const binBuf = binPad ? Buffer.concat([bin, Buffer.alloc(binPad)]) : bin;
    if (json.buffers?.[0]) json.buffers[0].byteLength = binBuf.length;

    const jsonStr = JSON.stringify(json);
    const pad = (4 - (jsonStr.length % 4)) % 4;
    const jsonBuf = Buffer.from(jsonStr + ' '.repeat(pad), 'utf8');

    const total = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
    const out = Buffer.alloc(total);
    out.writeUInt32LE(0x46546c67, 0);
    out.writeUInt32LE(2, 4);
    out.writeUInt32LE(total, 8);
    out.writeUInt32LE(jsonBuf.length, 12);
    out.writeUInt32LE(0x4e4f534a, 16);
    jsonBuf.copy(out, 20);
    out.writeUInt32LE(binBuf.length, 20 + jsonBuf.length);
    out.writeUInt32LE(0x004e4942, 20 + jsonBuf.length + 4);
    binBuf.copy(out, 20 + jsonBuf.length + 8);
    fs.writeFileSync(file, out);
    return total;
}

function readAcc(json, bin, idx) {
    const a = json.accessors[idx];
    const bv = json.bufferViews[a.bufferView];
    const nc = NUM_COMP[a.type];
    const stride = bv.byteStride || nc * 4;
    const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const out = [];
    for (let i = 0; i < a.count; i++) {
        const o = base + i * stride;
        const arr = [];
        for (let c = 0; c < nc; c++) arr.push(bin.readFloatLE(o + c * 4));
        out.push(nc === 1 ? arr[0] : arr);
    }
    return out;
}

function writeAcc(json, bin, idx, data) {
    const a = json.accessors[idx];
    const bv = json.bufferViews[a.bufferView];
    const nc = NUM_COMP[a.type];
    const stride = bv.byteStride || nc * 4;
    const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
    for (let i = 0; i < a.count; i++) {
        const o = base + i * stride;
        const v = data[i];
        for (let c = 0; c < nc; c++) bin.writeFloatLE(Array.isArray(v) ? v[c] : v, o + c * 4);
    }
    if (a.min || a.max) {
        // VEC3 位移通道必须有正确的 min/max，否则校验器报越界
        const min = new Array(nc).fill(Infinity);
        const max = new Array(nc).fill(-Infinity);
        for (const v of data) {
            for (let c = 0; c < nc; c++) {
                const x = Array.isArray(v) ? v[c] : v;
                if (x < min[c]) min[c] = x;
                if (x > max[c]) max[c] = x;
            }
        }
        a.min = min;
        a.max = max;
    }
}

// ---------------- 1) Idle 幅度收缩 ----------------

/** 把每个关键帧朝该通道首帧姿态收缩（四元数 slerp / 向量线性插值） */
function dampenClip(json, bin, clip, scale) {
    if (scale >= 1 || scale < 0) return 0;
    let changed = 0;
    const q = new Quaternion();
    const qRef = new Quaternion();
    const qOut = new Quaternion();
    for (const ch of clip.channels) {
        const s = clip.samplers[ch.sampler];
        const acc = json.accessors[s.output];
        const nc = NUM_COMP[acc.type];
        if (nc !== 4 && nc !== 3) continue;
        const vals = readAcc(json, bin, s.output);
        if (!vals.length) continue;
        if (nc === 4) {
            qRef.fromArray(vals[0]);
            for (let i = 0; i < vals.length; i++) {
                q.fromArray(vals[i]);
                qOut.copy(qRef).slerp(q, scale);
                vals[i] = qOut.toArray();
            }
        } else {
            const ref = vals[0].slice();
            for (let i = 0; i < vals.length; i++) {
                for (let c = 0; c < 3; c++) vals[i][c] = ref[c] + (vals[i][c] - ref[c]) * scale;
            }
        }
        writeAcc(json, bin, s.output, vals);
        changed++;
    }
    return changed;
}

// ---------------- 2) 死亡根骨位移 ----------------

/** 剥离贴图，生成 node 端 three 可加载的临时 GLB（node 下图片解码不可用） */
function stripTextures(json, bin, outPath) {
    const j = JSON.parse(JSON.stringify(json));
    delete j.images;
    delete j.textures;
    delete j.samplers;
    for (const m of j.materials || []) {
        delete m.normalTexture;
        delete m.emissiveTexture;
        delete m.occlusionTexture;
        if (m.pbrMetallicRoughness) {
            delete m.pbrMetallicRoughness.baseColorTexture;
            delete m.pbrMetallicRoughness.metallicRoughnessTexture;
        }
    }
    writeGlb(outPath, j, bin);
}

/** 用 three 按蒙皮公式采样动画中"身体最低点"的高度序列（模型局部单位） */
async function sampleLowestY(glbPath, animName, samples) {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const buf = fs.readFileSync(glbPath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const gltf = await new Promise((res, rej) => new GLTFLoader().parse(ab, '', res, rej));
    let sk = null;
    gltf.scene.traverse((o) => { if (o.isSkinnedMesh && !sk) sk = o; });
    if (!sk) throw new Error('没有蒙皮网格');

    const pos = sk.geometry.attributes.position;
    const sIdx = sk.geometry.attributes.skinIndex;
    const sWt = sk.geometry.attributes.skinWeight;
    const bones = sk.skeleton.bones;
    const boneInv = sk.skeleton.boneInverses;
    const bind = sk.bindMatrix;
    const bindInv = sk.bindMatrixInverse;
    const step = Math.max(1, Math.floor(pos.count / 4000));
    const v = new Vector3();
    const tmp = new Vector3();
    const bm = new Matrix4();

    const lowestY = () => {
        let min = Infinity;
        for (let i = 0; i < pos.count; i += step) {
            v.fromBufferAttribute(pos, i).applyMatrix4(bind);
            let x = 0, y = 0, z = 0;
            for (let k = 0; k < 4; k++) {
                const w = k === 0 ? sWt.getX(i) : k === 1 ? sWt.getY(i) : k === 2 ? sWt.getZ(i) : sWt.getW(i);
                if (w === 0) continue;
                const bi = k === 0 ? sIdx.getX(i) : k === 1 ? sIdx.getY(i) : k === 2 ? sIdx.getZ(i) : sIdx.getW(i);
                const bone = bones[bi];
                if (!bone) continue;
                bm.multiplyMatrices(bone.matrixWorld, boneInv[bi]);
                tmp.copy(v).applyMatrix4(bm).multiplyScalar(w);
                x += tmp.x; y += tmp.y; z += tmp.z;
            }
            v.set(x, y, z).applyMatrix4(bindInv).applyMatrix4(sk.matrixWorld);
            if (v.y < min) min = v.y;
        }
        return min;
    };

    const clip = gltf.animations.find((a) => a.name === animName);
    if (!clip) throw new Error(`找不到动画 ${animName}`);
    const mixer = new AnimationMixer(gltf.scene);
    const action = mixer.clipAction(clip);
    const out = [];
    mixer.stopAllAction();
    action.play();
    for (let i = 0; i < samples; i++) {
        action.time = (i / (samples - 1)) * clip.duration;
        mixer.update(0);
        gltf.scene.updateMatrixWorld(true);
        sk.skeleton.update();
        out.push(lowestY());
    }
    action.stop();
    return out;
}

/**
 * 给动画补 Hips.translation 通道。
 * 需要的世界位移 Δ=(0,-drop,0) 换算到 Hips 局部空间：
 *   Δlocal = R⁻¹ · Δ / s   （R、s 为 Hips 父链的旋转与缩放）
 * 返回追加数据后的新 bin。
 */
function appendTranslationChannel(json, bin, clip, nodeIdx, times, drops) {
    const node = json.nodes[nodeIdx];

    // 求 Hips 父链矩阵（root × Armature × …）
    const parentOf = new Map();
    json.nodes.forEach((n, i) => (n.children || []).forEach((c) => parentOf.set(c, i)));
    const chain = [];
    let cur = nodeIdx;
    while (parentOf.has(cur)) { cur = parentOf.get(cur); chain.unshift(cur); }
    const m = new Matrix4();
    for (const i of chain) {
        const n = json.nodes[i];
        m.multiply(new Matrix4().compose(
            new Vector3().fromArray(n.translation || [0, 0, 0]),
            new Quaternion().fromArray(n.rotation || [0, 0, 0, 1]),
            new Vector3().fromArray(n.scale || [1, 1, 1]),
        ));
    }
    const tp = new Vector3(), rq = new Quaternion(), sc = new Vector3();
    m.decompose(tp, rq, sc);
    const invQ = rq.clone().invert();
    const scaleY = sc.y || 1;

    const base = node.translation ? node.translation.slice() : [0, 0, 0];
    const dLocal = new Vector3();
    const values = drops.map((drop) => {
        dLocal.set(0, -drop, 0).applyQuaternion(invQ).divideScalar(scaleY);
        return [base[0] + dLocal.x, base[1] + dLocal.y, base[2] + dLocal.z];
    });

    let out = bin;
    const append = (floats) => {
        const pad = (4 - (out.length % 4)) % 4;
        if (pad) out = Buffer.concat([out, Buffer.alloc(pad)]);
        const off = out.length;
        const b = Buffer.alloc(floats.length * 4);
        floats.forEach((f, i) => b.writeFloatLE(f, i * 4));
        out = Buffer.concat([out, b]);
        return off;
    };

    const tOff = append(times);
    const vOff = append(values.flat());

    const bv0 = json.bufferViews.length;
    json.bufferViews.push({ buffer: 0, byteOffset: tOff, byteLength: times.length * 4 });
    json.bufferViews.push({ buffer: 0, byteOffset: vOff, byteLength: values.length * 12 });

    json.accessors.push({
        bufferView: bv0, componentType: 5126, count: times.length, type: 'SCALAR',
        min: [Math.min(...times)], max: [Math.max(...times)],
    });
    json.accessors.push({
        bufferView: bv0 + 1, componentType: 5126, count: values.length, type: 'VEC3',
        min: [0, 1, 2].map((c) => Math.min(...values.map((v) => v[c]))),
        max: [0, 1, 2].map((c) => Math.max(...values.map((v) => v[c]))),
    });

    clip.samplers.push({
        input: json.accessors.length - 2,
        output: json.accessors.length - 1,
        interpolation: 'LINEAR',
    });
    clip.channels.push({
        sampler: clip.samplers.length - 1,
        target: { node: nodeIdx, path: 'translation' },
    });
    return out;
}

// ---------------- 主流程 ----------------

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith('--'));
const opt = (k, d) => {
    const a = args.find((x) => x.startsWith(`--${k}=`));
    return a ? a.split('=').slice(1).join('=') : d;
};
const has = (k) => args.includes(`--${k}`);

if (!input) {
    console.error('用法: node scripts/fix-character-glb.mjs <input.glb> [--idle-scale=0.35] [--death-root] [--report]');
    process.exit(1);
}

const idleScale = parseFloat(opt('idle-scale', '0.35'));
const deathSamples = parseInt(opt('death-samples', '25'), 10);
const outPath = opt('out', input.replace(/\.glb$/i, '') + '.fixed.glb');

let { json, bin } = loadGlb(input);
const rawSize = fs.statSync(input).size;
console.log(`载入 ${path.basename(input)}  ${(rawSize / 1048576).toFixed(2)}MB`);
console.log(`  动画: ${json.animations.map((a) => a.name).join(', ')}`);
console.log(`  bufferViews=${json.bufferViews.length} accessors=${json.accessors.length}`);

const findAnim = (re) => json.animations.find((a) => re.test(a.name.toLowerCase()));
const hipsIdx = json.nodes.findIndex((n) => n.name === 'Hips');
console.log(`  Hips 节点 index=${hipsIdx}`);

if (has('report')) {
    for (const a of json.animations) {
        const paths = new Set(a.channels.filter((c) => c.target.node === hipsIdx).map((c) => c.target.path));
        const t = readAcc(json, bin, a.samplers[a.channels[0].sampler].input);
        console.log(`  ${a.name.padEnd(6)} 帧数=${String(t.length).padStart(4)} 时长=${t[t.length - 1].toFixed(3)}s  Hips通道=[${[...paths].join(',') || '无'}]`);
    }
    process.exit(0);
}

// --- Idle 收缩（原地改写，结构不变） ---
if (idleScale < 1) {
    const idle = findAnim(/idle|standing/);
    if (idle) {
        const n = dampenClip(json, bin, idle, idleScale);
        console.log(`[Idle] 收缩到 ${idleScale}，改写 ${n} 个通道`);
    } else {
        console.warn('[Idle] 找不到待机动画，跳过');
    }
}

// --- 死亡根骨位移（追加通道） ---
if (has('death-root')) {
    const death = findAnim(/death|dying/);
    if (hipsIdx < 0) {
        console.warn('[Death] 找不到 Hips 骨骼，跳过');
    } else if (!death) {
        console.warn('[Death] 找不到死亡动画，跳过');
    } else {
        const tmp = path.join(os.tmpdir(), `.fix-glb-${process.pid}.glb`);
        stripTextures(json, bin, tmp);
        const curve = await sampleLowestY(tmp, death.name, deathSamples);
        fs.unlinkSync(tmp);
        const ground = Math.min(...curve);          // 整段最低点 = 贴地参考
        // 单调不减（累积最大值）：原始曲线的"最低点"在倒地过程中会换部位
        // （脚 → 翘起的脚尖 → 背/手），先升后降；直接用的话倒地后期补偿被撤销，
        // 模型会被重新抬起来（视觉上"飞一下"）。压下去就不再抬。
        let acc = 0;
        const drops = curve.map((y) => {
            acc = Math.max(acc, y - ground);
            return Math.max(0, acc);
        });
        console.log(`[Death] 最低点: ${curve.map((y) => y.toFixed(3)).join(' ')}`);
        console.log(`[Death] 补偿量: ${drops.map((d) => d.toFixed(3)).join(' ')}`);
        const dur = readAcc(json, bin, death.samplers[death.channels[0].sampler].input).slice(-1)[0];
        const times = drops.map((_, i) => (i / (drops.length - 1)) * dur);
        bin = appendTranslationChannel(json, bin, death, hipsIdx, times, drops);
        console.log(`[Death] 已追加 Hips.translation 通道（${drops.length} 帧，时长 ${dur.toFixed(3)}s）`);
    }
}

const size = writeGlb(outPath, json, bin);
console.log(`写出 ${outPath}  ${(size / 1048576).toFixed(2)}MB  bufferViews=${json.bufferViews.length} accessors=${json.accessors.length}`);
