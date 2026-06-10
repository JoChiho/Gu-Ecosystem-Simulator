/**
 * 蛊生态模拟器 - 技能系统（与特质平行但独立）
 *
 * 技能特点：
 * - 通常消耗 MP
 * - 有发动概率（受 skillUsageRate + luck 影响）
 * - 可以改变伤害类型（physical / special）
 * - 可以提供更强的、临时的 EffectResult
 *
 * 扩展方式与特质完全一致：通过触发时机返回 EffectResult。
 * 未来可扩展冷却、技能树、前置条件等。
 */

import type { Gu, CombatContext, EffectResult, SkillDefinition } from './types';
import { getMetaStats, getDerivedStats } from './stats';

export interface SkillResult {
  activated: boolean;
  skill: SkillDefinition;
  effects: EffectResult[];
  mpCost: number;
  logs: string[];
}

/** MVP 示例技能定义（后续可从配置文件或数据库加载） */
export const SKILL_DEFINITIONS: SkillDefinition[] = [
  {
    id: 'poison_burst',
    name: '毒爆',
    description: '发动特殊攻击并附加强力毒伤，消耗 MP。',
    damageType: 'special',
    mpCost: 8,
    baseActivationChance: 0.35,
  },
  {
    id: 'counter_strike',
    name: '反击连斩',
    description: '提高反击率并在反击时追加伤害。',
    damageType: 'physical',
    mpCost: 5,
    baseActivationChance: 0.25,
  },
  // 更多技能在此添加...
];

export const SKILL_REGISTRY = Object.fromEntries(
  SKILL_DEFINITIONS.map(s => [s.id, s])
) as Record<string, SkillDefinition>;

/** 尝试发动技能（在 combat 对应时机调用） */
export function tryActivateSkill(gu: Gu, context: CombatContext): SkillResult | null {
  const meta = getMetaStats(gu);
  const derived = getDerivedStats(gu, context);

  // 基础发动概率 + 元属性调制
  const activationChance = Math.min(
    0.8,
    (meta.skillUsageRate + (context.tempModifiers?.skillUsageRateBonus ?? 0)) *
      (1 + meta.luck * 0.002) *
      1.5 // 放大系数，实际可调
  );

  if (Math.random() > activationChance) {
    return null;
  }

  // 简单随机选一个技能（未来可根据蛊当前状态、性格、已学技能筛选）
  const availableSkills = SKILL_DEFINITIONS.filter(s => (gu.mp ?? 0) >= s.mpCost);
  if (availableSkills.length === 0) return null;

  const skill = availableSkills[Math.floor(Math.random() * availableSkills.length)];

  // 扣除 MP（由调用方或这里决定，当前由调用方在 finalize 时处理更安全）
  const mpCost = skill.mpCost;

  // 根据技能生成效果
  const effects: EffectResult[] = [];
  const logs: string[] = [`蛊#${gu.id} 发动了技能【${skill.name}】！`];

  if (skill.id === 'poison_burst') {
    effects.push({
      damageMult: 1.25,
      damageAdd: 4,
      log: '毒爆造成额外伤害并附加剧毒',
    });
  }

  if (skill.id === 'counter_strike') {
    effects.push({
      counterRateBonus: 0.35,
      damageMult: 0.6,
      log: '反击连斩提升了反击能力',
    });
  }

  return {
    activated: true,
    skill,
    effects,
    mpCost,
    logs,
  };
}

/** 获取技能在特定触发时机下的效果（供 combat 统一调度，占位） */
export function getSkillEffects(
  _skillId: string,
  _trigger: string,
  _context: CombatContext
): EffectResult[] {
  return [];
}
