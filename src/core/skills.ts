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
import { getMetaStats } from './stats';

export interface SkillResult {
  activated: boolean;
  skill: SkillDefinition;
  effects: EffectResult[];
  mpCost: number;
  logs: string[];
}

/** 技能定义（更多样性） */
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
  // === 新增技能 ===
  {
    id: 'frenzy_rush',
    name: '狂乱冲锋',
    description: '短时间内大幅提升攻击，但消耗较多 MP。',
    damageType: 'physical',
    mpCost: 7,
    baseActivationChance: 0.28,
  },
  {
    id: 'draining_bite',
    name: '汲血噬咬',
    description: '特殊攻击并大量吸取生命。',
    damageType: 'special',
    mpCost: 10,
    baseActivationChance: 0.30,
  },
  {
    id: 'shadow_veil',
    name: '影纱护体',
    description: '暂时提升防御与反击几率。',
    damageType: 'physical',
    mpCost: 6,
    baseActivationChance: 0.32,
  },
  {
    id: 'wild_surge',
    name: '狂野涌动',
    description: '爆发高额伤害，伴随较大浮动。',
    damageType: 'special',
    mpCost: 9,
    baseActivationChance: 0.22,
  },
  // === 新增技能（平衡设计） ===
  {
    id: 'vitality_surge',
    name: '活力涌动',
    description: '恢复生命并造成少量伤害（正面恢复优势）。',
    damageType: 'special',
    mpCost: 8,
    baseActivationChance: 0.30,
  },
  {
    id: 'eagle_strike',
    name: '鹰隼一击',
    description: '高暴击精准攻击（正面输出优势）。',
    damageType: 'physical',
    mpCost: 6,
    baseActivationChance: 0.25,
  },
  {
    id: 'mana_shield',
    name: '法力护盾',
    description: '提升防御和反击（正面生存优势）。',
    damageType: 'physical',
    mpCost: 5,
    baseActivationChance: 0.32,
  },
  {
    id: 'berserk_frenzy',
    name: '狂暴乱舞',
    description: '极高爆发伤害，但会造成自身反噬（巨大正面爆发 + 权衡）。',
    damageType: 'physical',
    mpCost: 12,
    baseActivationChance: 0.20,
  },
];

export const SKILL_REGISTRY = Object.fromEntries(
  SKILL_DEFINITIONS.map(s => [s.id, s])
) as Record<string, SkillDefinition>;

/** 尝试发动技能（在 combat 对应时机调用） */
export function tryActivateSkill(gu: Gu, context: CombatContext): SkillResult | null {
  const meta = getMetaStats(gu);

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

  // 只使用该蛊已拥有的技能（上限4个，通过升级获得）
  const owned = (gu.skills || []).map(s => s.id);
  const availableSkills = SKILL_DEFINITIONS.filter(s => 
    owned.includes(s.id) && (gu.mp ?? 0) >= s.mpCost
  );
  if (availableSkills.length === 0) return null;

  const skill = availableSkills[Math.floor(Math.random() * availableSkills.length)];

  // 扣除 MP（由调用方或这里决定，当前由调用方在 finalize 时处理更安全）
  const mpCost = skill.mpCost;

  // 根据技能生成效果
  const effects: EffectResult[] = [];
  const skillInst = (gu.skills || []).find((s: any) => s.id === skill.id);
  const skillLevel = skillInst ? (skillInst.level || 1) : 1;
  const logs: string[] = [`蛊#${gu.id} 发动技能【${skill.name}】 Lv.${skillLevel} ！`];

  // 技能效果随等级提升而增强（数值变化）
  const lvl = skillLevel;

  if (skill.id === 'poison_burst') {
    const mult = 1.15 + (lvl - 1) * 0.06;
    const add = 10 + lvl * 4;
    effects.push({
      damageMult: mult,
      damageAdd: add,
      log: `蛊#${gu.id} 发动【毒爆】Lv.${lvl}！特殊攻击提升并附加剧毒伤害。`,
    });
  }

  if (skill.id === 'counter_strike') {
    const counterB = 0.3 + (lvl - 1) * 0.05;
    const mult = 0.5 + (lvl - 1) * 0.05;
    effects.push({
      counterRateBonus: counterB,
      damageMult: mult,
      log: `蛊#${gu.id} 发动【反击连斩】Lv.${lvl}！反击率大幅上升并追加伤害。`,
    });
  }

  if (skill.id === 'frenzy_rush') {
    const mult = 1.5 + (lvl - 1) * 0.12;
    effects.push({
      damageMult: mult,
      log: `蛊#${gu.id} 发动【狂乱冲锋】Lv.${lvl}！攻击力在短时间内大幅上升！`,
    });
  }

  if (skill.id === 'draining_bite') {
    const mult = 1.05 + (lvl - 1) * 0.06;
    const add = 8 + lvl * 4;
    const ls = 0.3 + (lvl - 1) * 0.04;
    effects.push({
      damageMult: mult,
      damageAdd: add,
      lifesteal: ls,
      log: `蛊#${gu.id} 发动【汲血噬咬】Lv.${lvl}！特殊攻击并大量吸取对方生命。`,
    });
  }

  if (skill.id === 'shadow_veil') {
    const defB = 0.18 + (lvl - 1) * 0.04;
    const counterB = 0.2 + (lvl - 1) * 0.04;
    effects.push({
      defenseRateBonus: defB,
      counterRateBonus: counterB,
      log: `蛊#${gu.id} 发动【影纱护体】Lv.${lvl}！暂时大幅提升防御与反击几率。`,
    });
  }

  if (skill.id === 'wild_surge') {
    const mult = 1.5 + (lvl - 1) * 0.1;
    const add = 10 + lvl * 5;
    effects.push({
      damageMult: mult,
      damageAdd: add,
      log: `蛊#${gu.id} 发动【狂野涌动】Lv.${lvl}！爆发高额伤害（浮动极大）。`,
    });
  }

  // === 新技能效果 ===
  if (skill.id === 'vitality_surge') {
    const healAmt = 25 + lvl * 8;
    const dmgM = 0.7 + (lvl - 1) * 0.05;
    effects.push({
      heal: healAmt,
      damageMult: dmgM,
      log: `蛊#${gu.id} 发动【活力涌动】Lv.${lvl}！恢复 ${healAmt} 生命并攻击。`,
    });
  }

  if (skill.id === 'eagle_strike') {
    const critB = 0.08 + (lvl - 1) * 0.04;
    const add = 10 + lvl * 4;
    effects.push({
      critChanceBonus: critB,
      damageAdd: add,
      log: `蛊#${gu.id} 发动【鹰隼一击】Lv.${lvl}！高暴击精准攻击！`,
    });
  }

  if (skill.id === 'mana_shield') {
    const defB = 0.12 + (lvl - 1) * 0.04;
    const counterB = 0.15 + (lvl - 1) * 0.03;
    effects.push({
      defenseRateBonus: defB,
      counterRateBonus: counterB,
      log: `蛊#${gu.id} 发动【法力护盾】Lv.${lvl}！强化防御与反击。`,
    });
  }

  if (skill.id === 'berserk_frenzy') {
    const mult = 1.7 + (lvl - 1) * 0.15;
    effects.push({
      damageMult: mult,
      log: `蛊#${gu.id} 发动【狂暴乱舞】Lv.${lvl}！极高爆发伤害！`,
    });
    // 负面反噬（但有巨大正面爆发优势）
    const recoil = 15 + lvl * 3;
    gu.hp = Math.max(1, gu.hp - recoil);
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
