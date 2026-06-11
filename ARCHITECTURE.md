# 蛊生态模拟器架构文档（ARCHITECTURE.md）

> 本文档必须与代码保持同步。每次重大重构或新增核心模块后，请更新本文件对应章节。
> 初始内容基于开发计划（plan.md）第 3 节，并随实现持续完善。

## 1. 项目概述

**蛊生态模拟器** 是一个使用 Tauri + Vue 3 + TypeScript + Canvas 构建的本地桌面模拟应用。

核心目标是让玩家观察“坛子”（独立生态）内蛊虫群体通过**移动、觅食、战斗、继承特质、升级变异**产生的自然涌现现象。

**第一阶段优先级**：完整实现**单个坛子**的模拟循环与可视化交互。
**蛊王元系统**：仅在 `types.ts` 和 `yuanStore.ts`（占位）中做好数据结构预留，不实现跨坛子逻辑、UI 交互或保存。

所有**游戏规则**（属性计算、战斗判定、特质效果、随机事件、升级继承）必须用**纯 TypeScript** 实现，Canvas 仅负责渲染。

## 2. 文件夹结构与各目录职责

```
gu-ecosystem-simulator/
├── ARCHITECTURE.md                 # 本文件，架构总览 + 关键文件职责说明
├── README.md                       # 用户面向文档（运行、构建、复现、控制说明）
├── .gitignore                      # 依赖、构建产物、Python venv、Tauri target 等
├── package.json                    # 依赖 + 脚本（pnpm 优先）
├── pnpm-lock.yaml（推荐生成）       # pnpm 锁定文件
├── vite.config.ts
├── tsconfig*.json
├── index.html
│
├── src/
│   ├── main.ts                     # Vue 应用入口
│   ├── App.vue                     # 根组件（布局 + 组合 SimulationCanvas + 各面板）
│   ├── style.css
│   │
│   ├── core/                       # ★ 核心领域层（纯 TS，零 UI/框架依赖）
│   │   ├── types.ts                # 所有领域类型定义（接口 + 枚举）
│   │   ├── traits.ts               # 特质注册表 + 效果应用纯函数
│   │   ├── combat.ts               # 战斗解析器（唯一知道回合制、伤害、继承规则的地方）
│   │   ├── gu.ts                   # Gu 实体 + 升级/变异 + 移动辅助决策
│   │   ├── environment.ts          # 食物系统 + 边界 + 随机环境事件
│   │   ├── rng.ts                  # （可选）确定性 RNG 抽象
│   │   └── engine.ts               # ★ 模拟主循环编排器
│   │
│   ├── rendering/                  # 渲染层（只读输入状态，纯绘制）
│   │   └── canvasRenderer.ts
│   │
│   ├── composables/                # Vue 组合式桥接（唯一可 import core 的地方）
│   │   └── useSimulation.ts        # 生命周期、raf 循环、速度、save/load、响应式统计
│   │
│   ├── components/                 # 纯 UI 组件
│   │   ├── SimulationCanvas.vue
│   │   ├── ControlPanel.vue
│   │   ├── StatsPanel.vue
│   │   ├── GuInspector.vue
│   │   ├── EventLog.vue
│   │   └── JarSelector.vue         # Phase 1 占位
│   │
│   └── utils/
│       ├── constants.ts            # 所有可调参数集中管理
│       └── serialization.ts
│
├── src-tauri/
│   ├── tauri.conf.json             # 应用元数据、窗口、权限、bundle
│   ├── Cargo.toml
│   ├── build.rs
│   ├── capabilities/default.json   # Tauri v2 权限声明（dialog + fs）
│   ├── icons/                      # 应用图标（使用 tauri icon 命令生成）
│   └── src/main.rs                 # 最小 Rust 入口（仅注册插件 + 启动）
│
└── py/（未来）                       # Python 扩展预留目录 + .venv/
```

### 2.1 为什么这样分层？

- `core/` 完全独立 → 可被 Web Worker、Node 测试脚本、未来其他 UI（Svelte、纯 Web）复用。
- 规则与渲染分离 → 以后换 PixiJS / WebGL 只需改 `rendering/`。
- Vue 只负责交互与展示 → 模拟逻辑不受前端框架变更影响。

## 3. 关键代码文件功能定位（精确到文件）

### 3.1 随机事件处理逻辑
位置：`src/core/environment.ts`

- 定义 `EnvironmentEvent` 枚举（FoodBoom、Drought、MutationWave...）。
- 导出 `rollAndApplyEvents(tick: number, engine: SimulationEngine)`。
- engine.tick() 内部按概率（或固定间隔 + 随机）调用。
- 事件可直接修改 engine 内部状态（食物数量、蛊属性等），并向 eventLog 追加记录。

### 3.2 蛊的基础属性和特质/技能效果计算（三层属性系统）
- **数据结构**（`src/core/types.ts`）：
  - `BaseStats`：atk / def / specialAtk / specialDef / spd / maxHp / mp / level（直接存储在 Gu）。
  - `DerivedCombatStats`：effectivePhysicalAtk 等战斗有效值 + counterRate / defenseRate / initiative 等。
  - `MetaStats`：luck / skillUsageRate / mutationRate。
  - `CombatContext` + `EffectResult`：统一特质/技能效果管道。
- **属性解析**：`src/core/stats.ts`
  - `getBaseStats(gu)`
  - `getDerivedStats(gu, context)`
  - `applyMetaModifiers(...)`
- **特质效果**：`src/core/traits.ts` → `getTraitEffects(trigger: TraitTrigger, context)`（模块化 per-trigger）。
- **技能系统**：`src/core/skills.ts` → `tryActivateSkill` + 效果注册（与特质平行，通过 skillUsageRate 控制发动）。
- **升级与变异**：`src/core/gu.ts` 的 `tryLevelUp()` 使用 mutationRate + stats 成长新基础属性。
- 计算调用链：engine → combat → (stats + traits + skills)。所有公式集中在 combat.ts。

### 3.3 战斗解析器
**唯一位置**：`src/core/combat.ts`

核心职责：
- 构建 `CombatContext`
- 使用 `stats.getDerivedStats` 获取有效值
- 通过 `getTraitEffects` + `tryActivateSkill` 统一应用效果（支持物理/特殊双轨）
- 实现确认的伤害公式（含 defenseRate、counterRate、crit、variance、luck 调制）
- 回合制 + 行动顺序（基于 initiative）
- 特质/技能触发（pre_attack / on_attack / on_hit 等）
- 经验、继承、历史记录

**重要更新（用户反馈迭代）**：
- 逃跑机制已完全移除（原 separateAfterFlee、fled 分支、1% 基础逃跑 + 性格修正、最大回合平局中断等全部清理）。战斗现在始终进行至一方 HP <= 0 死亡决出胜负 + 经验/继承，无频繁中断。
- 所有基础数值（GU_INIT、LEVEL 成长点数、COMBAT MIN_DAMAGE/WIN_EXP、FOOD 经验与回血、maxHp 成长等）已 *10 缩放。伤害公式现在产生有意义的整数伤害（不再 0/1），个位数修正值可正确参与计算。相关调优参数（defenseRate 分母、counter 保底、regen 等）同步调整。
- 回合制交换逻辑（initiator + responder + speed 优势额外）保留，MAX_ROUNDS 提高但实际极少触发。

导出保持兼容：
```ts
export function resolveCombat(guA: Gu, guB: Gu): CombatResult;
```

所有公式和规则只允许出现在此文件。特质/技能只通过 EffectResult 提供修正。

**严禁**在 engine.ts 或其他文件里写战斗判定逻辑。

### 3.4 模拟主循环
**核心位置**：`src/core/engine.ts`

`export class SimulationEngine { ... }`

主要职责：
- 持有 `gus: Gu[]`、`foods: Food[]`、`tickCount`、`eventLog`、`config`。
- `tick(steps: number)` 按固定步长推进（由 useSimulation 控制速度）：
  1. 移动阶段（委托 gu.ts 辅助函数 + 环境影响）。
  2. 吃食阶段（距离检测，吃掉食物并调用 gainExp）。
  3. 战斗阶段：先 `findOverlappingPairs()` 收集配对，再逐对调用 `combat.resolveCombat`，避免迭代中修改数组。
  4. 委托 environment 进行随机事件。
  5. 检查所有蛊的升级。
  6. 移除死亡蛊。
  7. 按配置生成新食物。
- `getSnapshot(): Readonly<JarState>` —— 返回不可变快照供渲染和 UI 使用。
- `toJSON()` / `loadFromState(state)` —— 支持保存/加载完整状态（位置、所有属性、当前食物、tickCount）。
- `reset(initialCount: number)` —— 生成全新随机种群。

### 3.5 可视化反馈与交互
- `src/rendering/canvasRenderer.ts`：纯函数/类，接收 snapshot + 选中蛊 id，负责绘制：
  - 坛子边界矩形
  - 食物小点
  - 蛊（圆形，半径随等级，颜色按性格或主特质映射，绘制等级数字 + 细 HP 条）
  - 战斗反馈（连线、短暂颜色闪烁、浮动伤害数字）
- `src/components/SimulationCanvas.vue`：包含 `<canvas>`，处理 raf 绘制调用、点击命中测试（canvas 坐标 → 逻辑坐标 → 最近蛊）、鼠标悬停提示。

### 3.6 依赖管理相关配置文件位置
- **包管理**：根 `package.json`（scripts + "packageManager": "pnpm@..."） + `pnpm-lock.yaml`
- **Tauri 配置**：`src-tauri/tauri.conf.json`（productName、devUrl、frontendDist、bundle）
- **权限声明**：`src-tauri/capabilities/default.json`（dialog + fs 插件权限）
- **Rust 依赖**：`src-tauri/Cargo.toml`
- **忽略规则**：根 `.gitignore`（node_modules、src-tauri/target/**、**/.venv/** 等）
- **复现说明**：全部集中在 `README.md` “依赖管理” 与 “运行方式” 章节

### 3.7 其他重要文件
- `src/utils/constants.ts`：WORLD_WIDTH、INITIAL_GU_COUNT、EXP_CURVE、FOOD_SPAWN_INTERVAL、SPEED_LEVELS 等所有魔法数字。
- `src/composables/useSimulation.ts`：唯一允许从 Vue 侧驱动 engine 的模块。负责：
  - 创建 engine 实例
  - requestAnimationFrame + 逻辑 tick 解耦
  - 速度倍率（每帧执行 N 个 logic steps）
  - 暂停标志
  - 响应式统计（guCount, avgLevel...）
  - 异步 save/load（调用 Tauri dialog + fs + engine 序列化）
- `src-tauri/src/main.rs`：**绝不**包含任何模拟逻辑，仅 `.plugin(tauri_plugin_dialog::init())` + `.plugin(tauri_plugin_fs::init())` + `.run(...)`。

## 4. 模块依赖关系（单向 + 清晰边界）

```
Vue 组件 (components/*)
        ↓ 仅通过
composables/useSimulation.ts   ←── 唯一“脏”接触点
        ↓ 调用（纯数据）
SimulationEngine (core/engine.ts)
        ├── Gu 逻辑 (gu.ts)
        ├── Combat (combat.ts)  ←── Traits (traits.ts) 纯函数
        ├── Environment (environment.ts)
        └── 可选 RNG
                ↓ 只读快照
        rendering/canvasRenderer.ts
```

**严格禁止**：
- core/* 目录下的任何文件 import Vue、DOM、Canvas API。
- 渲染层包含游戏规则判断。
- 直接在组件里修改 engine 内部状态。

## 5. 干净的包安装与复现

- 前端隔离：`pnpm install` 后 `node_modules` 就是完整的项目内环境。删除 `node_modules` + `pnpm-lock.yaml` 即可完全重置。
- Python 预留：见 README “依赖管理” 章节的 venv 流程 + `py/` 目录约定。
- Tauri/Rust：系统级（rustup），文档化在 README，不尝试用 venv 管理。
- 推荐复现命令（任何人）：
  1. `git clone ...`
  2. `pnpm install`
  3. `pnpm tauri dev`

## 6. Phase 2 预留点（蛊王元 + 多坛子）

- `src/core/types.ts` 必须包含：
  ```ts
  export interface GuYuan { id: string; baseGu: SerializedGu; power: number; wins: number; ... }
  ```
- `src/core/yuanStore.ts`（占位实现）：
  ```ts
  export const yuanStore: GuYuan[] = [];
  export function promoteToYuan(gu: Gu): void { /* TODO Phase 2 */ }
  ```
- UI：`JarSelector.vue` + 某个折叠面板显示 “蛊王元系统（Phase 2 预留）”，仅展示列表，不提供任何交互。
- engine 设计时考虑支持多实例（`JarManager` 或简单数组），Phase 1 先用单例。

## 7. 持久化格式

保存文件为普通 JSON，顶层包含：
```json
{
  "version": 1,
  "tickCount": 12345,
  "gus": [ /* 完整 Gu 序列化 */ ],
  "foods": [ /* {x,y} */ ],
  "config": { ... }
}
```
engine 提供 `toJSON()` / `fromJSON()`（或独立 serialization 模块），保证位置、特质、经验、当前食物全部还原。

## 8. 演进记录（请在此追加）

- 2026-06：初始架构 + 脚手架 + 核心类型/战斗/引擎框架（按开发计划执行）。
- 2026-06：完成 core/ 全部主力模块（types, constants, traits 8个特质, gu, combat, environment, engine 完整 tick 循环 + 序列化）。渲染层 canvasRenderer + SimulationCanvas 基础实现。App 仍为占位，后续替换为完整 UI。
- （后续每次更新在此记录日期 + 变更摘要 + 影响文件）

---

**维护纪律**：代码提交前检查本文件是否需要同步更新。关键职责变更必须同时修改对应代码注释与本章说明。
