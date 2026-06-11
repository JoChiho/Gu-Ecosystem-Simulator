/**
 * 蛊生态模拟器 - 核心领域类型定义
 * （已更新：完整三层属性系统 + 技能支持 + 可扩展触发机制）
 *
 * 三层属性：
 *   - BaseStats：直接存储在 Gu 上（可成长、可持久化）
 *   - DerivedCombatStats：实时计算的战斗有效值
 *   - MetaStats：影响概率和成长的上游属性（luck、skillUsageRate、mutationRate）
 */

export type Personality = 
  | 'aggressive' 
  | 'cautious' 
  | 'opportunistic' 
  | 'balanced'
  | 'naive'       // 新增：天真
  | 'ferocious'   // 新增：凶残
  | 'cunning';    // 新增：狡猾

export type TraitType = 'offense' | 'defense' | 'utility' | 'mutation';

export type DamageType = 'physical' | 'special';

export interface Trait {
  id: string;
  name: string;
  type: TraitType;
  level: number;        // 特质等级，从1开始，通过重复获得进化
  acquisitions: number; // 获得次数，用于进化计算
}

export interface TraitDefinition extends Trait {
  description: string;
}

// ==================== 三层属性系统 ====================

/** 基础属性（存储在 Gu 上） */
export interface BaseStats {
  atk: number;          // 物理攻击
  def: number;          // 物理防御
  specialAtk: number;   // 特攻
  specialDef: number;   // 特防
  spd: number;          // 速度
  maxHp: number;
  mp: number;           // 魔法值（技能消耗）
  level: number;
}

/** 衍生独立属性（战斗核心输入） */
export interface DerivedCombatStats {
  effectivePhysicalAtk: number;
  effectivePhysicalDef: number;
  effectiveSpecialAtk: number;
  effectiveSpecialDef: number;
  effectiveSpd: number;
  initiative: number;           // 先攻值
  counterRate: number;          // 反击率
  defenseRate: number;          // 防御率（百分比减伤倾向）
  hitRate: number;
  critChance: number;
  critDamageMult: number;
  damageVariance: number;
  effectiveSkillUsageRate: number;
  lifestealRate?: number;
  // 未来可轻松扩展：elementalPenetration, statusChance 等
}

/** 元属性（概率与成长调制） */
export interface MetaStats {
  luck: number;                 // 幸运（影响暴击、浮动、概率等）
  skillUsageRate: number;       // 技能使用率
  mutationRate: number;         // 变异率
}

// ==================== 战斗上下文与效果 ====================

/**
 * 战斗上下文（每回合/每次效果计算时构建）
 * 这是特质、技能、未来元素/状态的主要扩展点。
 */
export interface CombatContext {
  attacker: Gu;
  defender: Gu;
  round: number;
  damageType: DamageType;
  tempModifiers: {
    atkAdd?: number;
    atkMult?: number;
    defAdd?: number;
    defMult?: number;
    specialAtkAdd?: number;
    specialAtkMult?: number;
    specialDefAdd?: number;
    specialDefMult?: number;
    initiativeBonus?: number;
    critBonus?: number;
    defenseRateBonus?: number;
    counterRateBonus?: number;
    hitRateBonus?: number;
    skillUsageRateBonus?: number;
    damageMult?: number;
    lifestealBonus?: number;
    // 未来新增属性时在此扩展对应字段
  };
  logs: string[];
  random: () => number; // 可注入的随机源，便于测试
}

/** 特质/技能效果返回结构（统一管道） */
export interface EffectResult {
  damageAdd?: number;
  damageMult?: number;
  defenseRateBonus?: number;
  counterRateBonus?: number;
  critChanceBonus?: number;
  skillUsageRateBonus?: number;
  mpCost?: number;
  log?: string;
  // 未来可扩展：statusEffect, element 等
}

/** 触发时机（特质与技能共享） */
export type TraitTrigger =
  | 'passive'
  | 'on_round_start'
  | 'pre_attack'
  | 'on_attack'
  | 'on_hit'
  | 'post_damage'
  | 'on_kill'
  | 'on_fight_end';

export type SkillTrigger = TraitTrigger; // 技能可复用相同时机

// ==================== 其他领域类型 ====================

export interface BattleRecord {
  vsId: number;
  won: boolean;
  inherited: string[];
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  damageType: DamageType;
  mpCost: number;
  baseActivationChance: number;
}

export interface Gu {
  id: number;
  atk: number;
  def: number;
  spd: number;
  hp: number;
  maxHp: number;
  level: number;
  exp: number;
  x: number;
  y: number;
  personality: Personality;
  traits: Trait[];

  // 新增基础属性
  specialAtk: number;
  specialDef: number;
  mp: number;

  // 战斗与历史追踪
  fights: number;
  wins: number;
  battleHistory: BattleRecord[];
  notableEvents: string[];
}

export interface Food {
  x: number;
  y: number;
}

export interface JarState {
  version: 1;
  tickCount: number;
  gus: Gu[];
  foods: Food[];
}

export interface CombatResult {
  winner: Gu | null;
  loser: Gu | null;
  logs: string[];           // 完整战斗过程（主要在对战UI展示）
  inheritedTraits: Trait[];
}

export type EnvironmentEventType = 'food_boom' | 'drought' | 'mutation_wave';

export interface EnvironmentEvent {
  type: EnvironmentEventType;
  tick: number;
  description: string;
}

/** 蛊王元 - 现在会携带更丰富的历史信息 */
export interface GuYuan {
  id: string;
  baseGu: Omit<Gu, 'x' | 'y' | 'hp' | 'exp' | 'battleHistory'> & {
    finalTraits: Trait[];
    finalLevel: number;
    fights: number;
    wins: number;
    notableEvents: string[];
    battleSummary: BattleRecord[];
  };
  power: number;
  wins: number;
  createdTick: number;
  sourceJarClosed: boolean;   // 标记这个坛子已因只剩此蛊而闭合
}
