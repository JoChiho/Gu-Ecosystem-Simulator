/**
 * 蛊生态模拟器 - 三层属性系统（基础 / 衍生 / 元）
 * 
 * 这是所有属性解析的唯一真相来源。
 * 战斗公式和成长公式都必须通过这里获取“有效值”。
 * 
 * 设计原则：
 * - 基础属性直接来自 Gu（可持久化、升级修改）
 * - 衍生属性实时计算，受基础 + 元属性 + 上下文临时修正影响
 * - 元属性主要用于概率调制和成长
 * - 所有新属性（无论未来元素、状态等）都走这个管道
 */

import type { Gu, BaseStats, DerivedCombatStats, MetaStats, CombatContext, Personality } from './types';
import { hasTrait } from './traits';

/** 从 Gu 提取基础属性（当前直接映射，未来可加成长系数等） */
export function getBaseStats(gu: Gu): BaseStats {
  return {
    atk: gu.atk,
    def: gu.def,
    specialAtk: gu.specialAtk ?? 0,
    specialDef: gu.specialDef ?? 0,
    spd: gu.spd,
    maxHp: gu.maxHp,
    mp: gu.mp ?? 0,
    level: gu.level,
  };
}

/** 获取元属性（luck 及新增的 skillUsageRate / mutationRate） */
export function getMetaStats(gu: Gu): MetaStats {
  // 当前通过特质或固定值模拟，未来可从 Gu 扩展字段或特质永久加成
  let luck = 0;
  let skillUsageRate = 0.1; // 默认基础技能发动率
  let mutationRate = 0.05;  // 默认变异率

  // 示例：通过现有特质影响元属性（可扩展）
  if (hasTrait(gu, 'unstable')) {
    mutationRate += 0.25; // 不稳定特质显著提升变异率
  }
  if (hasTrait(gu, 'lucky_charm')) {
    luck += 12;
  }
  if (hasTrait(gu, 'quick_reflex')) {
    // 速度已在 personality 中，但这里额外加一点幸运与技能率
    luck += 4;
    skillUsageRate += 0.04;
  }

  // 未来可在这里加入更多特质对 luck / skillUsageRate 的影响
  // 例如某个特质 "lucky_clover" 增加 luck
  const p = gu.personality;
  if (p === 'naive') {
    luck += 8;
    mutationRate += 0.03;
  }
  if (p === 'ferocious' || p === 'wild') {
    mutationRate += 0.02;
    luck += 3;
  }
  if (p === 'cunning') {
    skillUsageRate += 0.05;
    luck += 5;
  }
  if (p === 'greedy') {
    // 贪婪者更会找资源，但战斗 meta 一般
  }
  if (p === 'stoic') {
    // 坚忍者稳健
    luck += 2;
  }

  return {
    luck,
    skillUsageRate,
    mutationRate,
  };
}

/**
 * 计算衍生独立属性（核心）
 * 这是战斗公式和许多特质/技能判定的直接输入。
 */
function getPersonalityModifiers(p: Personality): {
  atkMult: number;
  defMult: number;
  specialAtkMult: number;
  specialDefMult: number;
  spdMult: number;
  skillUsageRateBonus: number;
  critChanceBonus: number;
} {
  switch (p) {
    case 'aggressive':
      return { atkMult: 1.25, defMult: 0.88, specialAtkMult: 1.18, specialDefMult: 0.92, spdMult: 1.08, skillUsageRateBonus: 0.12, critChanceBonus: 0.06 };
    case 'cautious':
      return { atkMult: 0.82, defMult: 1.22, specialAtkMult: 0.88, specialDefMult: 1.15, spdMult: 1.05, skillUsageRateBonus: -0.04, critChanceBonus: -0.02 };
    case 'opportunistic':
      return { atkMult: 1.1, defMult: 0.95, specialAtkMult: 1.12, specialDefMult: 0.98, spdMult: 1.12, skillUsageRateBonus: 0.16, critChanceBonus: 0.09 };
    case 'naive':
      return { atkMult: 0.95, defMult: 1.05, specialAtkMult: 1.12, specialDefMult: 0.98, spdMult: 0.95, skillUsageRateBonus: 0.08, critChanceBonus: 0.05 };
    case 'ferocious': // 凶残：暴力输出
      return { atkMult: 1.38, defMult: 0.78, specialAtkMult: 1.22, specialDefMult: 0.85, spdMult: 1.05, skillUsageRateBonus: 0.05, critChanceBonus: 0.11 };
    case 'cunning': // 狡猾：速度与技巧
      return { atkMult: 1.02, defMult: 0.95, specialAtkMult: 1.08, specialDefMult: 1.0, spdMult: 1.28, skillUsageRateBonus: 0.18, critChanceBonus: 0.04 };
    case 'greedy': // 贪婪：重资源，轻战斗
      return { atkMult: 0.88, defMult: 0.95, specialAtkMult: 0.92, specialDefMult: 1.0, spdMult: 1.0, skillUsageRateBonus: 0.02, critChanceBonus: 0.01 };
    case 'stoic': // 坚忍：肉盾
      return { atkMult: 0.78, defMult: 1.38, specialAtkMult: 0.82, specialDefMult: 1.32, spdMult: 0.92, skillUsageRateBonus: -0.06, critChanceBonus: -0.03 };
    case 'wild': // 狂野：高方差高速度
      return { atkMult: 1.12, defMult: 0.85, specialAtkMult: 1.15, specialDefMult: 0.88, spdMult: 1.32, skillUsageRateBonus: 0.09, critChanceBonus: 0.08 };
    case 'balanced':
    default:
      return { atkMult: 1.06, defMult: 1.06, specialAtkMult: 1.06, specialDefMult: 1.06, spdMult: 1.06, skillUsageRateBonus: 0.05, critChanceBonus: 0.03 };
  }
}

export function getDerivedStats(gu: Gu, context?: Partial<CombatContext>): DerivedCombatStats {
  const base = getBaseStats(gu);
  const meta = getMetaStats(gu);
  const ctx = context ?? {};

  const temp = ctx.tempModifiers ?? {};
  const mods = getPersonalityModifiers(gu.personality);

  // === 物理/特殊有效值（基础 + 性格修正 + 临时修正 + luck 微调） ===
  const effectivePhysicalAtk =
    (base.atk * mods.atkMult + (temp.atkAdd ?? 0)) *
    (1 + (temp.atkMult ?? 0) + meta.luck * 0.001);

  const effectivePhysicalDef =
    (base.def * mods.defMult + (temp.defAdd ?? 0)) *
    (1 + (temp.defMult ?? 0));

  const effectiveSpecialAtk =
    ((base.specialAtk ?? 0) * mods.specialAtkMult + (temp.specialAtkAdd ?? 0)) *
    (1 + (temp.specialAtkMult ?? 0) + meta.luck * 0.001);

  const effectiveSpecialDef =
    ((base.specialDef ?? 0) * mods.specialDefMult + (temp.specialDefAdd ?? 0)) *
    (1 + (temp.specialDefMult ?? 0));

  // === 行动相关 ===
  const initiative =
    base.spd * mods.spdMult +
    (temp.initiativeBonus ?? 0) +
    meta.luck * 0.2;

  // === 概率类衍生属性 ===
  // 调低暴击影响，避免数值膨胀后一击结束战斗
  const critChance = 0.035 + meta.luck * 0.002 + (temp.critBonus ?? 0) + mods.critChanceBonus;
  const critDamageMult = 1.32 + meta.luck * 0.006;

  const damageVariance = 0.22 + meta.luck * 0.0015;

  // 防御率（参考值根据当前初始总量调低，避免减伤接近0）
  const defenseRate =
    Math.min(0.55, (base.def * mods.defMult / (base.def * mods.defMult + 85)) * 0.4 + (temp.defenseRateBonus ?? 0) + meta.luck * 0.001);

  // 反击率
  const counterRate =
    (temp.counterRateBonus ?? 0) + meta.luck * 0.003;

  // 命中相关
  const hitRate = 0.95 + meta.luck * 0.001 + (temp.hitRateBonus ?? 0);

  // 技能使用率
  const effectiveSkillUsageRate =
    (meta.skillUsageRate + (temp.skillUsageRateBonus ?? 0) + mods.skillUsageRateBonus) *
    (1 + meta.luck * 0.002);

  // （原逃跑概率计算已完全移除。战斗不再有逃跑/中断，所有战斗进行至一方死亡。）
  return {
    effectivePhysicalAtk,
    effectivePhysicalDef,
    effectiveSpecialAtk,
    effectiveSpecialDef,
    effectiveSpd: base.spd * mods.spdMult,
    initiative,
    counterRate,
    defenseRate,
    hitRate,
    critChance,
    critDamageMult,
    damageVariance,
    effectiveSkillUsageRate,
    lifestealRate: temp.lifestealBonus ?? 0,
  };
}

/**
 * 应用元属性对各种概率的统一调制（供成长和战斗外使用）
 */
export function applyMetaModifiers(baseValue: number, meta: MetaStats, modifierType: 'luck' | 'mutation' | 'skill'): number {
  switch (modifierType) {
    case 'luck':
      return baseValue * (1 + meta.luck * 0.002);
    case 'mutation':
      return baseValue + meta.mutationRate;
    case 'skill':
      return baseValue * (1 + meta.skillUsageRate * 0.5 + meta.luck * 0.001);
    default:
      return baseValue;
  }
}
