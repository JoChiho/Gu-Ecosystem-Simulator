/**
 * 蛊生态模拟器 - 特质系统
 *
 * 这是特质效果的唯一真相来源。
 * 所有战斗修正、移动加成、升级变异逻辑都应通过这里导出的纯函数实现。
 * 严禁在 combat.ts / engine.ts / gu.ts 里写具体的特质数值判断。
 */

import type { Gu, Trait, TraitDefinition, TraitType } from './types';

/** MVP 推荐的 8 个初始特质（与开发计划完全一致） */
export const TRAIT_DEFINITIONS: TraitDefinition[] = [
  {
    id: 'sharp_claws',
    name: '利爪',
    type: 'offense',
    stackable: false,
    description: '攻击时造成额外 2~3 点伤害。',
  },
  {
    id: 'poison_bite',
    name: '毒牙',
    type: 'offense',
    stackable: false,
    description: '攻击命中后对敌人施加持续 2 回合的毒伤（每回合 1~2 点）。',
  },
  {
    id: 'berserk',
    name: '狂暴',
    type: 'offense',
    stackable: false,
    description: '自身生命值低于 30% 时，攻击力提升 50%。',
  },
  {
    id: 'hard_shell',
    name: '硬壳',
    type: 'defense',
    stackable: true,
    description: '每层使受到的伤害降低 1~2 点（可叠加）。',
  },
  {
    id: 'regen',
    name: '再生',
    type: 'defense',
    stackable: false,
    description: '非战斗状态下每 10 tick 恢复 1~2 点生命。',
  },
  {
    id: 'fast_metabolism',
    name: '快速代谢',
    type: 'utility',
    stackable: false,
    description: '吃到食物时获得 50% 额外经验。',
  },
  {
    id: 'scavenger',
    name: '食腐',
    type: 'utility',
    stackable: false,
    description: '战斗后附近有尸体时可获得少量额外经验（移动偏好也略微倾向）。',
  },
  {
    id: 'unstable',
    name: '不稳定',
    type: 'mutation',
    stackable: false,
    description: '升级时有 30% 额外概率再获得一个随机特质。',
  },
];

export const TRAIT_REGISTRY = Object.fromEntries(
  TRAIT_DEFINITIONS.map((t) => [t.id, t])
) as Record<string, TraitDefinition>;

/** 工具函数：按 id 获取特质定义 */
export function getTraitById(id: string): TraitDefinition | undefined {
  return TRAIT_REGISTRY[id];
}

/** 判断某蛊是否拥有某个特质（支持 stackable 计数） */
export function hasTrait(gu: Gu, traitId: string): boolean {
  return gu.traits.some((t) => t.id === traitId);
}

export function countTrait(gu: Gu, traitId: string): number {
  return gu.traits.filter((t) => t.id === traitId).length;
}

/**
 * 战斗前/中/后的效果应用（由 combat.ts 调用）
 * 返回值会累加到基础伤害上（正数为加成，负数为减免）。
 */
export function applyCombatEffects(
  attacker: Gu,
  defender: Gu,
  log: string[]
): { damageMod: number; defenderDamageReduction: number } {
  let damageMod = 0;
  let defenderDamageReduction = 0;

  // 进攻方效果
  if (hasTrait(attacker, 'sharp_claws')) {
    damageMod += 2 + Math.random() * 1.2; // 2~3.2
    log.push(`${attacker.id} 的利爪造成了额外伤害`);
  }
  if (hasTrait(attacker, 'berserk') && attacker.hp < attacker.maxHp * 0.3) {
    damageMod += attacker.atk * 0.5;
    log.push(`${attacker.id} 陷入狂暴！`);
  }
  if (hasTrait(attacker, 'poison_bite')) {
    // 毒伤由 combat 自己管理状态（简化版：直接在本次结算时记录，实际 dot 由 engine 后续 tick 处理）
    log.push(`${attacker.id} 的毒牙命中 ${defender.id}`);
    // 真实 dot 效果可由 combat 返回额外状态，这里简化直接在结算时扣一点
    defender.hp = Math.max(1, defender.hp - 1);
  }

  // 防御方效果
  const shellLayers = countTrait(defender, 'hard_shell');
  if (shellLayers > 0) {
    defenderDamageReduction += shellLayers * 1.4;
    log.push(`${defender.id} 的硬壳抵挡了部分伤害（${shellLayers} 层）`);
  }

  return { damageMod, defenderDamageReduction };
}

/**
 * 吃食物时的经验加成（由 engine / gu 调用）
 */
export function getFoodExpMultiplier(gu: Gu): number {
  return hasTrait(gu, 'fast_metabolism') ? 1.5 : 1.0;
}

/**
 * 移动阶段的性格 + 特质偏好权重（返回向量建议，engine/gu 负责合成最终速度）
 * 简化实现：返回几个加权方向的建议值
 */
export function getMovementBias(
  gu: Gu,
  hasNearbyCorpse: boolean
): { foodSeek: number; socialAggro: number; wander: number } {
  const base = { foodSeek: 0.6, socialAggro: 0.2, wander: 0.2 };

  // 性格影响
  if (gu.personality === 'aggressive') {
    base.socialAggro += 0.35;
    base.foodSeek -= 0.1;
  } else if (gu.personality === 'cautious') {
    base.socialAggro -= 0.25;
    base.wander += 0.15;
  } else if (gu.personality === 'opportunistic') {
    base.foodSeek += 0.2;
    if (hasNearbyCorpse && hasTrait(gu, 'scavenger')) {
      base.foodSeek += 0.25;
    }
  }

  // 特质影响
  if (hasTrait(gu, 'scavenger') && hasNearbyCorpse) {
    base.foodSeek += 0.15;
  }

  // 归一化（简单）
  const total = base.foodSeek + base.socialAggro + base.wander;
  return {
    foodSeek: base.foodSeek / total,
    socialAggro: base.socialAggro / total,
    wander: base.wander / total,
  };
}

/**
 * 升级时是否触发“不稳定”额外变异
 */
export function shouldGainExtraTraitOnLevelUp(gu: Gu): boolean {
  if (!hasTrait(gu, 'unstable')) return false;
  return Math.random() < 0.30;
}

/**
 * 从注册表中随机挑选一个新特质（排除已拥有且不可堆叠的）
 */
export function pickRandomNewTrait(currentTraits: Trait[]): TraitDefinition | null {
  const ownedNonStackable = new Set(
    currentTraits.filter((t) => !TRAIT_REGISTRY[t.id]?.stackable).map((t) => t.id)
  );

  const candidates = TRAIT_DEFINITIONS.filter((def) => {
    if (ownedNonStackable.has(def.id)) return false;
    // stackable 的可以重复获得（简单起见本 MVP 允许）
    return true;
  });

  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
