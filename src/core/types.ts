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
  | 'naive'       // 天真：幸运、技能易触发
  | 'ferocious'   // 凶残：高攻低防，高暴击
  | 'cunning'     // 狡猾：高速度 + 技能率
  | 'greedy'      // 贪婪：觅食强、经验加成，但战斗较弱
  | 'stoic'       // 坚忍：极高防御与回复，进攻乏力
  | 'wild';       // 狂野：高速度与方差，变异倾向

// 中文性格名称映射（用于UI显示）
export const PersonalityCN: Record<Personality, string> = {
  aggressive: '好斗',
  cautious: '谨慎',
  opportunistic: '机会主义',
  balanced: '平衡',
  naive: '天真',
  ferocious: '凶残',
  cunning: '狡猾',
  greedy: '贪婪',
  stoic: '坚忍',
  wild: '狂野',
};

export function getPersonalityCN(p: Personality): string {
  return PersonalityCN[p] || p;
}

export const PersonalityDescriptions: Record<Personality, string> = {
  aggressive: '进攻强势型。攻击和特攻较高，容易暴击，但防御较低。适合主动出击。',
  cautious: '防御谨慎型。防御和特防出色，生存能力强，但攻击较弱。',
  opportunistic: '机会主义型。技能发动率和暴击较高，速度快，适合偷袭和投机。',
  balanced: '全能平衡型。各属性略有加成，适应性强，无明显弱点。',
  naive: '天真型。幸运高，技能较易触发，暴击率上升，但速度和攻击稍弱。',
  ferocious: '凶残型。极高攻击和暴击，但防御极低，玻璃大炮风格。',
  cunning: '狡猾型。速度极快，技能发动率高，适合先手控制。',
  greedy: '贪婪型。觅食和经验获取优秀，战斗中偏向资源积累。',
  stoic: '坚忍型。极高防御和特防，回复能力强，进攻乏力但皮糙肉厚。',
  wild: '狂野型。速度和方差极高，变异倾向强，输出不稳定但潜力巨大。',
};

export function getPersonalityDescription(p: Personality): string {
  return PersonalityDescriptions[p] || '该性格的详细效果。';
}

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
  stackable?: boolean; // 是否可重复获得（用于进化或叠层）
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
    heal?: number;
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
  heal?: number;          // 直接治疗（正数）
  lifesteal?: number;     // 吸血率（0~1）
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
  maxMp?: number;

  // 战斗与历史追踪
  fights: number;
  wins: number;
  battleHistory: BattleRecord[];
  notableEvents: string[];

  // 技能（每只蛊最多 4 个，通过升级获得，技能也有等级）
  skills?: Array<{ id: string; level: number }>;
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
