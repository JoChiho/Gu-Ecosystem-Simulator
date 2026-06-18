/**
 * 蛊生态模拟器 - 战斗解析器（核心玩法）
 *
 * 这是唯一允许实现回合制、伤害计算、特质/技能效果应用、继承逻辑的文件。
 * 完全基于三层属性系统 + CombatContext + 统一触发管道。
 */

import type { Gu, CombatResult, Trait, CombatContext, EffectResult, DamageType } from './types';
import { COMBAT } from '../utils/constants';
import { getDerivedStats, getMetaStats } from './stats';
import { getTraitEffects, hasTrait } from './traits';
import { tryActivateSkill } from './skills';
import { acquireTrait } from './gu';

/**
 * 按速度（initiative）决定行动顺序
 */
function getActionOrder(a: Gu, b: Gu, contextA: CombatContext, contextB: CombatContext): [Gu, Gu, CombatContext, CombatContext] {
  const initA = getDerivedStats(a, contextA).initiative;
  const initB = getDerivedStats(b, contextB).initiative;
  if (initA === initB) {
    return Math.random() < 0.5 ? [a, b, contextA, contextB] : [b, a, contextB, contextA];
  }
  return initA > initB ? [a, b, contextA, contextB] : [b, a, contextB, contextA];
}

/**
 * 构建本次回合的 CombatContext（核心）
 */
function buildContext(attacker: Gu, defender: Gu, round: number, damageType: DamageType = 'physical'): CombatContext {
  return {
    attacker,
    defender,
    round,
    damageType,
    tempModifiers: {},
    logs: [],
    random: Math.random,
  };
}

/** 应用 EffectResult 到 context（统一管道） */
function applyEffectsToContext(effects: EffectResult[], context: CombatContext) {
  for (const e of effects) {
    const t = context.tempModifiers;
    if (e.damageMult != null) t.damageMult = (t.damageMult ?? 1) + (e.damageMult - 1);
    if (e.damageAdd != null) t.atkAdd = (t.atkAdd ?? 0) + e.damageAdd;
    if (e.defenseRateBonus != null) t.defenseRateBonus = (t.defenseRateBonus ?? 0) + e.defenseRateBonus;
    if (e.counterRateBonus != null) t.counterRateBonus = (t.counterRateBonus ?? 0) + e.counterRateBonus;
    if (e.critChanceBonus != null) t.critBonus = (t.critBonus ?? 0) + e.critChanceBonus;
    if (e.skillUsageRateBonus != null) t.skillUsageRateBonus = (t.skillUsageRateBonus ?? 0) + e.skillUsageRateBonus;
    if (e.heal != null) t.heal = (t.heal ?? 0) + e.heal;
    if (e.lifesteal != null) t.lifestealBonus = (t.lifestealBonus ?? 0) + e.lifesteal;
    if (e.log) context.logs.push(e.log);
  }
}

/**
 * 集中伤害计算（严格按照已确认公式）
 */
function calculateDamage(context: CombatContext): number {
  const { attacker, defender, damageType, tempModifiers } = context;
  const derivedA = getDerivedStats(attacker, context);
  const derivedD = getDerivedStats(defender, context);

  let base: number;

  if (damageType === 'physical') {
    base = derivedA.effectivePhysicalAtk - derivedD.effectivePhysicalDef * (1 - derivedD.defenseRate);
  } else {
    base = derivedA.effectiveSpecialAtk - derivedD.effectiveSpecialDef * (1 - derivedD.defenseRate);
  }

  base = Math.max(COMBAT.MIN_DAMAGE, base);

  // 等级弱加成（保留原有精神）
  base *= (1 + attacker.level * 0.01);

  // 应用攻击方 on_attack / pre_attack 效果
  if (tempModifiers.damageMult) base *= tempModifiers.damageMult;
  if (tempModifiers.atkAdd) base += tempModifiers.atkAdd;

  // 暴击（受 luck 影响，已在 derivedStats 中体现）
  if (context.random() < derivedA.critChance) {
    base *= derivedA.critDamageMult;
    context.logs.push(`蛊#${attacker.id} 触发暴击！`);
  }

  // 最终浮动（受 luck 影响）
  const variance = 0.9 + context.random() * derivedA.damageVariance;
  const finalDamage = Math.floor(base * variance);

  return Math.max(COMBAT.MIN_DAMAGE, finalDamage);
}

/**
 * 单回合处理（支持特质/技能触发 + 反击率 + 防御率）
 */
function resolveRound(attacker: Gu, defender: Gu, roundLogs: string[], roundNumber: number): number {
  // 构建上下文
  let ctx = buildContext(attacker, defender, roundNumber);

  // 特质触发特殊报告（在自动战斗中可见过程）
  if (hasTrait(attacker, 'unstable') && Math.random() < 0.25) {
    roundLogs.push(`蛊#${attacker.id} 因【不稳定】本回合未能行动！`);
    return 0; // 本回合无伤害
  }

  // 1. 技能尝试（使用 skillUsageRate）
  const skillResult = tryActivateSkill(attacker, ctx);
  if (skillResult?.activated) {
    applyEffectsToContext(skillResult.effects, ctx);
    roundLogs.push(...skillResult.logs);
    if (skillResult.skill.damageType) {
      ctx.damageType = skillResult.skill.damageType;
    }
    attacker.mp = Math.max(0, (attacker.mp ?? 0) - skillResult.mpCost);
    roundLogs.push(`蛊#${attacker.id} 消耗 MP ${skillResult.mpCost}（剩余 ${attacker.mp}）`);
  }

  // 2. 触发 pre_attack / on_attack 特质
  const preEffects = getTraitEffects('pre_attack', ctx);
  applyEffectsToContext(preEffects, ctx);

  const attackEffects = getTraitEffects('on_attack', ctx);
  applyEffectsToContext(attackEffects, ctx);

  // 3. 计算伤害（集中公式）
  const damage = calculateDamage(ctx);
  defender.hp = Math.max(0, defender.hp - damage);

  const dmgType = ctx.damageType === 'special' ? '特殊' : '物理';
  roundLogs.push(`[回合${roundNumber}] 蛊#${attacker.id} → 蛊#${defender.id} ：${damage}点${dmgType}伤害`);
  roundLogs.push(...ctx.logs);

  // 吸血（lifesteal）支持：特质/技能可通过 lifesteal 或 derived 提供
  const derivedA = getDerivedStats(attacker, ctx);
  const lsRate = (derivedA.lifestealRate ?? 0) + (ctx.tempModifiers.lifestealBonus ?? 0);
  if (lsRate > 0 && damage > 0) {
    const healed = Math.floor(damage * Math.min(0.6, lsRate));
    if (healed > 0) {
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + healed);
      roundLogs.push(`[回合${roundNumber}] 蛊#${attacker.id} 吸血 +${healed} HP`);
    }
  }

  // 4. 触发 on_hit（防御方）
  const hitCtx = buildContext(defender, attacker, roundNumber, ctx.damageType);
  const hitEffects = getTraitEffects('on_hit', hitCtx);
  applyEffectsToContext(hitEffects, hitCtx);

  // 5. 反击判定（使用 counterRate）
  const derivedDef = getDerivedStats(defender, hitCtx);
  if (defender.hp > 0 && Math.random() < derivedDef.counterRate) {
    const counterDamage = Math.max(COMBAT.MIN_DAMAGE, Math.floor(derivedDef.effectivePhysicalAtk * 0.55));
    attacker.hp = Math.max(0, attacker.hp - counterDamage);
    roundLogs.push(`[回合${roundNumber}] 蛊#${defender.id} 反击 → 蛊#${attacker.id} ：${counterDamage}点伤害`);
  }

  // 6. post_damage 触发
  const postEffects = getTraitEffects('post_damage', ctx);
  applyEffectsToContext(postEffects, ctx);
  roundLogs.push(...postEffects.filter(e => e.log).map(e => e.log!));

  // 直接治疗（来自特质/技能的 heal 字段）
  const tMods: any = ctx.tempModifiers || {};
  if (tMods.heal && tMods.heal > 0) {
    const h = Math.floor(tMods.heal);
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + h);
    roundLogs.push(`[回合${roundNumber}] 蛊#${attacker.id} 效果恢复 +${h} HP`);
  }

  // 击杀触发（血契等）
  if (defender.hp <= 0) {
    const killEffects = getTraitEffects('on_kill', ctx);
    applyEffectsToContext(killEffects, ctx);
    roundLogs.push(...killEffects.filter(e => e.log).map(e => e.log!));
  }

  return damage;
}

/**
 * 核心战斗函数（已适配新系统）
 */
export function resolveCombat(guA: Gu, guB: Gu): CombatResult {
  const logs: string[] = [`战斗开始：蛊#${guA.id} vs 蛊#${guB.id}（回合制长战）`];

  // 使用引用（BattleView 和 engine 期望直接修改）
  const a = guA;
  const b = guB;

  let round = 0;

  // 逃跑/中断机制已移除。战斗始终进行至一方死亡（使用较高 MAX_ROUNDS 兜底，实际因 MIN_DAMAGE 远小于 HP，通常 <15 交换即结束）
  while (a.hp > 0 && b.hp > 0 && round < COMBAT.MAX_ROUNDS) {
    round++;

    // 每个“回合”（major exchange）保证双方都有行动机会
    // 先决定谁先手（速度优势），然后双方依次完整行动一次
    const [initiator, responder] = getActionOrder(a, b, buildContext(a, b, round), buildContext(b, a, round));

    // 发起方行动
    resolveRound(initiator, responder, logs, round);
    if (responder.hp <= 0) break;

    // 响应方也获得完整行动（回合制核心：双方都行动）
    resolveRound(responder, initiator, logs, round);
    if (initiator.hp <= 0) break;

    // 速度显著优势者额外行动一次（速度的价值）
    const initI = getDerivedStats(initiator, buildContext(initiator, responder, round)).initiative;
    const initR = getDerivedStats(responder, buildContext(responder, initiator, round)).initiative;
    if (initI > initR * 1.65) {
      resolveRound(initiator, responder, logs, round);
      if (responder.hp <= 0) break;
    }
  }

  const winner = a.hp > 0 ? a : b;
  const loser = a.hp > 0 ? b : a;

  // 只有当败者真正死亡（hp <= 0）时才给经验 + 继承
  const inherited: Trait[] = [];
  if (loser.hp <= 0) {
    const metaWinner = getMetaStats(winner);
    const expGain = COMBAT.WIN_BASE_EXP + Math.floor((loser.level - winner.level) * 2);
    const finalExp = Math.floor(expGain * (1 + metaWinner.luck * 0.001));
    winner.exp += finalExp;
    logs.push(`蛊#${winner.id} 获胜！获得 ${finalExp} 经验 + 继承特质`);

    const inheritCount = Math.floor(
      Math.random() * (COMBAT.INHERIT_TRAITS_MAX - COMBAT.INHERIT_TRAITS_MIN + 1)
    ) + COMBAT.INHERIT_TRAITS_MIN;

    const loserPool = [...loser.traits];

    for (let i = 0; i < inheritCount && loserPool.length > 0; i++) {
      const idx = Math.floor(Math.random() * loserPool.length);
      const picked = loserPool.splice(idx, 1)[0];
      // 使用 acquireTrait 实现唯一 + 进化
      acquireTrait(winner, picked as any);
      inherited.push({ ...picked });
    }

    if (inherited.length > 0) {
      logs.push(`蛊#${winner.id} 继承了 ${inherited.map(t => t.name).join('、')}`);
    }
  } else {
    logs.push(`战斗结束，双方均存活（达到回合上限或平局）。`);
  }

  return {
    winner,
    loser,
    logs,
    inheritedTraits: inherited,
  };
}

// Exported for progressive/step-by-step battle in BattleView (for observable process)
export function executeBattleRound(attacker: Gu, defender: Gu, roundNumber: number): { logs: string[]; over: boolean } {
  const roundLogs: string[] = [];
  resolveRound(attacker, defender, roundLogs, roundNumber);
  const over = attacker.hp <= 0 || defender.hp <= 0;
  return { logs: roundLogs, over };
}
