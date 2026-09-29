// ============== 可选角色配置 ==============
// 仅包含拥有 walk / run / idle / jump 四种必需动画的模型

// 模型已迁移至 public/models，通过运行时绝对路径加载
// 两个角色均为 PBR 写实风格：模型自带 Idle / walk / run / jump / death 五个片段。
// 原始导出为 4096² PNG 贴图（34~38MB），已离线压缩为 2048² JPEG 并重建 GLB
// （原始大文件备份在 assets/ 下，不参与构建）
const kaneValerModelUrl = '/models/Role/KaneValer.glb';
const lenaVayneModelUrl = '/models/Role/LenaVayne.glb';

// 动作信息
export interface ActionInfo {
    key: string;       // 动作标识
    name: string;      // 中文名称
    icon: string;      // emoji 图标
    required: boolean; // 是否为游戏必需动作（walk/run/idle/jump）
}

// 游戏必需的 4 种动作
const REQUIRED_ACTIONS: ActionInfo[] = [
    { key: 'walk',  name: '走路', icon: '🚶', required: true },
    { key: 'run',   name: '跑步', icon: '🏃', required: true },
    { key: 'idle',  name: '待机', icon: '🧍', required: true },
    { key: 'jump',  name: '跳跃', icon: '🦘', required: true },
];

// PBR 写实角色动作：模型仅有必需四动作 + 死亡，无额外表情动作
const PBR_EXTRA_ACTIONS: ActionInfo[] = [
    { key: 'death', name: '死亡', icon: '💀', required: false },
];

export interface Character {
    id: string;
    name: string;                // 角色名称
    icon: string;                // emoji 图标
    desc: string;                // 简短描述
    modelUrl: string;            // 模型文件 URL
    scale: number;               // 模型缩放
    type: 'robot' | 'human';     // 角色类型
    typeLabel: string;           // 类型标签文字
    typeColor: string;           // 类型标签颜色（css 颜色）
    actions: ActionInfo[];       // 全部动作列表
    featured: string[];          // 特色动作 key（卡片上高亮展示）
    /**
     * 动画原生步态（用 three 实测得到，模型局部单位）：
     *   speed     —— 动画自带的位移速度（局部单位/秒）
     *   stepRate  —— 动画自带的步频（步/秒）
     * 运行期据此反算 timeScale：需求 = 移动速度 / (speed × scale)，
     * 再用 stepRate 限制上限，避免为了追上速度把动画播成快进。
     */
    gait?: {
        walk: { speed: number; stepRate: number };
        run: { speed: number; stepRate: number };
    };
}

function buildActions(extra: ActionInfo[]): ActionInfo[] {
    return [...REQUIRED_ACTIONS, ...extra];
}

export const CHARACTERS: Character[] = [
    {
        // PBR 写实男：原始 37.9MB（三张 4096² PNG），已离线压缩至 3.6MB。
        // 骨骼为 mixamo 28 骨，导出姿态即为正立、面朝 +Z、脚底 y≈0，无需额外修正。
        // scale 由 three 实测 Idle 身高 1.063 反算：1.768 / 1.063 ≈ 1.66
        id: 'kane-valer',
        name: 'Kane Valer',
        icon: '🧑',
        desc: 'PBR 写实材质，动作精简',
        modelUrl: kaneValerModelUrl,
        scale: 1.66,
        type: 'human',
        typeLabel: '凯恩・瓦勒',
        typeColor: '#5b8def',
        actions: buildActions(PBR_EXTRA_ACTIONS),
        featured: [],
        // 实测：walk 1.21s / 2 步（步频 1.65 步/秒），run 4.13s / 12 步（步频 2.91 步/秒）
        gait: {
            walk: { speed: 0.696, stepRate: 1.65 },
            run: { speed: 1.804, stepRate: 2.91 },
        },
    },
    {
        // PBR 写实女：模型原始 34MB（三张 4096² PNG），已离线压缩至 3MB；
        // 并修正了导出时错误的 90° 旋转（原模型是躺倒的）与脚底偏移。
        // scale 由实测身高 1.154 反算：1.768 / 1.154 ≈ 1.53
        id: 'lena-vayne',
        name: 'Lena Vayne',
        icon: '👸',
        desc: 'PBR 写实材质，动作精简',
        modelUrl: lenaVayneModelUrl,
        scale: 1.53,
        type: 'human',
        typeLabel: '莉娜・维恩',
        typeColor: '#b06ab3',
        actions: buildActions(PBR_EXTRA_ACTIONS),
        featured: [],
        // 实测：walk 1.21s / 2 步（步频 1.65 步/秒），run 4.13s / 12 步（步频 2.91 步/秒）
        gait: {
            walk: { speed: 0.715, stepRate: 1.65 },
            run: { speed: 1.850, stepRate: 2.91 },
        },
    },
];

export const DEFAULT_CHARACTER_ID = CHARACTERS[0].id;

export function getCharacterById(id: string): Character {
    return CHARACTERS.find(c => c.id === id) ?? CHARACTERS[0];
}

// 根据 key 获取动作信息
export function getActionByKey(actions: ActionInfo[], key: string): ActionInfo | undefined {
    return actions.find(a => a.key === key);
}
