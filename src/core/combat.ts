/**
 * 蛊生态模拟器 - 战斗解析器（核心玩法）
 *
 * 这是唯一允许实现回合制、伤害计算、特质/技能效果应用、继承逻辑的文件。
 * 完全基于三层属性系统 + CombatContext + 统一触发管道。
 */

import type { Gu, CombatResult, Trait, CombatContext, EffectResult, DamageType, Personality } from './types';
import { COMBAT } from '../utils/constants';
import { getDerivedStats, getMetaStats } from './stats';
import { getTraitEffects, hasTrait } from './traits';
import { tryActivateSkill } from './skills';
import { acquireTrait, separateAfterFlee } from './gu';

function getFleeProbability(p: Personality): number {
  switch (p) {
    case 'cautious': return 0.85;
    case 'aggressive': return 0.25;
    case 'opportunistic': return 0.55;
    default: return 0.5;
  }
}

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
 * 返回 { damage, fled, fleer }
 */
function resolveRound(attacker: Gu, defender: Gu, roundLogs: string[], roundNumber: number): { damage: number; fled: boolean; fleer: Gu | null } {
  // 构建上下文
  let ctx = buildContext(attacker, defender, roundNumber);

  // 逃跑检查：由当前 fleeChance（基础属性 + 性格 + 状态）随机决定，增加随机性
  const derivedA = getDerivedStats(attacker, ctx);
  if (ctx.random() < derivedA.fleeChance) {
    roundLogs.push(`蛊#${attacker.id} 因为当前状态和性格决定逃跑！战斗结束。`);
    return { damage: 0, fled: true, fleer: attacker };
  }

  // 特质触发特殊报告（在自动战斗中可见过程）
  // 例如不稳定特质导致本次无攻击
  if (hasTrait(attacker, 'unstable') && Math.random() < 0.25) {
    roundLogs.push(`因为不稳定，所以蛊#${attacker.id}本次没有攻击！`);
    return { damage: 0, fled: false, fleer: null }; // 本回合无伤害，跳过后续
  }

  // 1. 技能尝试（使用 skillUsageRate）
  const skillResult = tryActivateSkill(attacker, ctx);
  if (skillResult?.activated) {
    applyEffectsToContext(skillResult.effects, ctx);
    roundLogs.push(...skillResult.logs);
    // 技能可能改变伤害类型
    if (skillResult.skill.damageType) {
      ctx.damageType = skillResult.skill.damageType;
    }
    // 扣 MP（简化，实际可由 engine 统一处理）
    attacker.mp = Math.max(0, (attacker.mp ?? 0) - skillResult.mpCost);
  }

  // 2. 触发 pre_attack / on_attack 特质
  const preEffects = getTraitEffects('pre_attack', ctx);
  applyEffectsToContext(preEffects, ctx);

  const attackEffects = getTraitEffects('on_attack', ctx);
  applyEffectsToContext(attackEffects, ctx);

  // 3. 计算伤害（集中公式）
  const damage = calculateDamage(ctx);
  defender.hp = Math.max(0, defender.hp - damage);

  roundLogs.push(`蛊#${attacker.id} 攻击 蛊#${defender.id}，造成 ${damage} 点伤害`);
  roundLogs.push(...ctx.logs);

  // 4. 触发 on_hit（防御方）
  const hitCtx = buildContext(defender, attacker, roundNumber, ctx.damageType); // 反转视角
  const hitEffects = getTraitEffects('on_hit', hitCtx);
  applyEffectsToContext(hitEffects, hitCtx);

  // 5. 反击判定（使用 counterRate）
  const derivedDef = getDerivedStats(defender, hitCtx);
  if (defender.hp > 0 && Math.random() < derivedDef.counterRate) {
    const counterDamage = Math.floor(derivedDef.effectivePhysicalAtk * 0.55); // 更明显的反击伤害
    attacker.hp = Math.max(0, attacker.hp - counterDamage);
    roundLogs.push(`蛊#${defender.id} 发动反击，造成 ${counterDamage} 点伤害！`);
  }

  // 6. post_damage 触发
  const postEffects = getTraitEffects('post_damage', ctx);
  applyEffectsToContext(postEffects, ctx);
  roundLogs.push(...postEffects.filter(e => e.log).map(e => e.log!));

  return { damage, fled: false, fleer: null };
}

/**
 * 核心战斗函数（已适配新系统）
 */
export function resolveCombat(guA: Gu, guB: Gu): CombatResult {
  const logs: string[] = [`蛊#${guA.id} 与 蛊#${guB.id} 爆发战斗！`];

  // 使用引用（BattleView 和 engine 期望直接修改）
  const a = guA;
  const b = guB;

  let round = 0;
  let currentAttacker = a;
  let currentDefender = b;

  while (a.hp > 0 && b.hp > 0 && round < COMBAT.MAX_ROUNDS) {
    round++;

    const [first, second] = getActionOrder(a, b, buildContext(a, b, round), buildContext(b, a, round));
    currentAttacker = first;
    currentDefender = second;

    const roundRes = resolveRound(currentAttacker, currentDefender, logs, round);

    if (roundRes.fled) {
      logs.push(`蛊#${roundRes.fleer!.id} 逃跑，战斗以平局结束。`);
      // 立即打散位置，防止战斗结束后位置还重叠马上重触发
      separateAfterFlee(a, b);
      break;
    }

    if (currentDefender.hp <= 0) break;
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
    logs.push(`蛊#${winner.id} 获胜，获得 ${finalExp} 经验`);

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
    logs.push(`战斗结束，蛊#${loser.id} 并未死亡，无继承触发。`);
    // 逃跑平局：一方逃跑，无胜者，双方无经验
    // 逃跑概率受性格影响
    const probA = getFleeProbability(a.personality);
    const probB = getFleeProbability(b.personality);
    const fleeGu = Math.random() * (probA + probB) < probA ? a : b;
    logs.push(`因为性格（${fleeGu.personality}），蛊#${fleeGu.id} 选择逃跑，战斗以平局结束。双方均未获得经验。`);
    // 重置位置，避免立即再次战斗
    separateAfterFlee(a, b);
    return {
      winner: null,
      loser: null,
      logs,
      inheritedTraits: [],
    };
  }

  return {
    winner,
    loser,
    logs,
    inheritedTraits: inherited,
  };
}

// Exported for progressive/step-by-step battle in BattleView (for observable process)
export function executeBattleRound(attacker: Gu, defender: Gu, roundNumber: number): { logs: string[]; over: boolean; fled: boolean } {
  const roundLogs: string[] = [];
  const res = resolveRound(attacker, defender, roundLogs, roundNumber);
  if (res.fled) {
    roundLogs.push(`战斗因逃跑结束。`);
    return { logs: roundLogs, over: true, fled: true };
  }
  const over = attacker.hp <= 0 || defender.hp <= 0;
  return { logs: roundLogs, over, fled: false };
}
