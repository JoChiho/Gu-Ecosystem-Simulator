/**
 * 蛊生态模拟器 - 战斗解析器（核心玩法）
 *
 * 这是唯一允许实现回合制、伤害计算、特质继承逻辑的文件。
 * engine 只负责“检测到重叠就调用我”，不关心内部细节。
 */

import type { Gu, CombatResult, Trait } from './types';
import { COMBAT } from '../utils/constants';
import { applyCombatEffects, getFoodExpMultiplier } from './traits';

/**
 * 按速度决定行动顺序（简单：spd 高的先手；每轮重新判断）
 */
function getActionOrder(a: Gu, b: Gu): [Gu, Gu] {
  if (a.spd === b.spd) {
    return Math.random() < 0.5 ? [a, b] : [b, a];
  }
  return a.spd > b.spd ? [a, b] : [b, a];
}

/**
 * 单回合伤害结算（含特质效果）
 */
function resolveRound(attacker: Gu, defender: Gu, roundLogs: string[]): number {
  const { damageMod, defenderDamageReduction } = applyCombatEffects(attacker, defender, roundLogs);

  let damage = Math.max(
    COMBAT.MIN_DAMAGE,
    attacker.atk - defender.def + damageMod - defenderDamageReduction
  );

  // 轻微随机浮动
  damage = Math.floor(damage * (0.9 + Math.random() * 0.25));

  defender.hp = Math.max(0, defender.hp - damage);
  roundLogs.push(`蛊#${attacker.id} 攻击 蛊#${defender.id}，造成 ${damage} 点伤害`);

  return damage;
}

/**
 * 核心战斗函数
 * 返回完整的 CombatResult，调用方（engine）负责：
 *   - 把 loser 从种群移除
 *   - 把 winner 的 exp 和 traits 合并
 *   - 追加日志
 */
export function resolveCombat(guA: Gu, guB: Gu): CombatResult {
  const logs: string[] = [`蛊#${guA.id} 与 蛊#${guB.id} 爆发战斗！`];

  // 工作副本（避免直接修改原始引用导致意外）
  const a = { ...guA, traits: [...guA.traits] };
  const b = { ...guB, traits: [...guB.traits] };

  let round = 0;

  while (a.hp > 0 && b.hp > 0 && round < COMBAT.MAX_ROUNDS) {
    round++;
    const [first, second] = getActionOrder(a, b);

    // 第一只行动
    resolveRound(first, second, logs);
    if (second.hp <= 0) break;

    // 第二只反击
    resolveRound(second, first, logs);
  }

  const [winner, loser] = a.hp > 0 ? [a, b] : [b, a];

  // 胜利者经验
  const expGain = COMBAT.WIN_BASE_EXP + Math.floor((loser.level - winner.level) * 2);
  // 应用代谢加成（战斗胜利也算“食物”的一种？这里简化直接给）
  const finalExp = Math.floor(expGain * getFoodExpMultiplier(winner as any));
  winner.exp += finalExp;
  logs.push(`蛊#${winner.id} 获胜，获得 ${finalExp} 经验`);

  // 继承 1~2 个特质
  const inheritCount = Math.floor(
    Math.random() * (COMBAT.INHERIT_TRAITS_MAX - COMBAT.INHERIT_TRAITS_MIN + 1)
  ) + COMBAT.INHERIT_TRAITS_MIN;

  const inherited: Trait[] = [];
  const loserTraitPool = [...loser.traits];

  for (let i = 0; i < inheritCount && loserTraitPool.length > 0; i++) {
    const idx = Math.floor(Math.random() * loserTraitPool.length);
    const picked = loserTraitPool.splice(idx, 1)[0];
    // 避免重复添加不可堆叠的（简化：允许重复，由 traits.ts 控制展示）
    inherited.push({ ...picked });
    winner.traits.push({ ...picked });
  }

  if (inherited.length > 0) {
    logs.push(
      `蛊#${winner.id} 继承了 ${inherited.map((t) => t.name).join('、')}`
    );
  }

  // 把修改同步回原始对象（engine 传进来的是引用）
  Object.assign(guA, a);
  Object.assign(guB, b);

  return {
    winner: guA.hp > 0 ? guA : guB, // 返回原始引用（已修改）
    loser: guA.hp > 0 ? guB : guA,
    logs,
    inheritedTraits: inherited,
  };
}
