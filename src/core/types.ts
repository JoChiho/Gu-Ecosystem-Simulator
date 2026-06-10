/**
 * 蛊生态模拟器 - 核心领域类型定义
 * 本文件只包含接口、类型和少量工具类型，不包含任何实现逻辑。
 * 所有其他 core/ 文件都应从这里 import 类型。
 */

export type Personality = 'aggressive' | 'cautious' | 'opportunistic' | 'balanced';

export type TraitType = 'offense' | 'defense' | 'utility' | 'mutation';

export interface Trait {
  id: string;           // e.g. 'sharp_claws'
  name: string;         // 中文显示名 '利爪'
  type: TraitType;
  stackable: boolean;
}

export interface TraitDefinition extends Trait {
  description: string;
  // 效果由 traits.ts 中的纯函数实现，这里只存数据
}

export interface Gu {
  id: number;
  // 基础属性
  atk: number;
  def: number;
  spd: number;
  hp: number;
  maxHp: number;

  // 进度
  level: number;
  exp: number;

  // 位置（逻辑坐标，0~WORLD.WIDTH / HEIGHT）
  x: number;
  y: number;

  // 行为倾向
  personality: Personality;

  // 当前拥有的特质（可重复如果 stackable）
  traits: Trait[];
}

export interface Food {
  x: number;
  y: number;
}

/** 单个坛子的完整可序列化状态（用于保存/加载和渲染快照） */
export interface JarState {
  version: 1;
  tickCount: number;
  gus: Gu[];
  foods: Food[];
  // 未来可扩展 config、随机种子状态等
}

/** 战斗结果（仅 combat.ts 产生，engine 消费） */
export interface CombatResult {
  winner: Gu;
  loser: Gu;
  logs: string[];           // 人类可读的战斗过程描述
  inheritedTraits: Trait[]; // 胜利者本次继承的特质
}

/** 环境事件类型（由 environment.ts 定义和处理） */
export type EnvironmentEventType = 'food_boom' | 'drought' | 'mutation_wave';

export interface EnvironmentEvent {
  type: EnvironmentEventType;
  tick: number;
  description: string;
}

/** 蛊王元（Phase 2 仅预留数据结构，功能不实现） */
export interface GuYuan {
  id: string;
  baseGu: Omit<Gu, 'x' | 'y' | 'hp' | 'exp'>; // 巅峰时刻的快照（去掉易变字段）
  power: number;   // 综合战力评分
  wins: number;
  createdTick: number;
}
