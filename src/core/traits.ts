/**
 * 蛊生态模拟器 - 特质系统（已重构为触发时机模块化）
 *
 * 所有特质效果通过 getTraitEffects(trigger, context) 返回 EffectResult。
 * 这是唯一允许写具体特质数值判断的地方。
 */

import type { Gu, Trait, TraitDefinition, CombatContext, EffectResult, TraitTrigger } from './types';

/** 初始 + 新增特质（增加多样性） */
export const TRAIT_DEFINITIONS: TraitDefinition[] = [
  { id: 'sharp_claws', name: '利爪', type: 'offense', stackable: false, description: '攻击时造成额外伤害。', level: 1, acquisitions: 1 },
  { id: 'poison_bite', name: '毒牙', type: 'offense', stackable: false, description: '攻击命中附加毒伤。', level: 1, acquisitions: 1 },
  { id: 'berserk', name: '狂暴', type: 'offense', stackable: false, description: '低血时攻击力大幅提升。', level: 1, acquisitions: 1 },
  { id: 'hard_shell', name: '硬壳', type: 'defense', stackable: true, description: '每层降低受到伤害。', level: 1, acquisitions: 1 },
  { id: 'regen', name: '再生', type: 'defense', stackable: false, description: '非战斗时缓慢恢复生命。', level: 1, acquisitions: 1 },
  { id: 'fast_metabolism', name: '快速代谢', type: 'utility', stackable: false, description: '吃食物获得更多经验。', level: 1, acquisitions: 1 },
  { id: 'scavenger', name: '食腐', type: 'utility', stackable: false, description: '战斗后利用尸体获得额外收益。', level: 1, acquisitions: 1 },
  { id: 'unstable', name: '不稳定', type: 'mutation', stackable: false, description: '升级时更高概率获得额外特质。', level: 1, acquisitions: 1 },

  // === 新增多样性特质 ===
  { id: 'lifesteal_fang', name: '吸血獠牙', type: 'offense', stackable: false, description: '攻击时吸取对方生命。', level: 1, acquisitions: 1 },
  { id: 'iron_hide', name: '铁皮', type: 'defense', stackable: true, description: '显著提升物理减伤。', level: 1, acquisitions: 1 },
  { id: 'lucky_charm', name: '幸运符', type: 'utility', stackable: false, description: '提升幸运，暴击与闪避更佳。', level: 1, acquisitions: 1 },
  { id: 'quick_reflex', name: '迅捷反应', type: 'utility', stackable: false, description: '大幅提升先攻与速度。', level: 1, acquisitions: 1 },
  { id: 'venom_sac', name: '毒囊', type: 'offense', stackable: true, description: '每次命中叠加更强毒伤。', level: 1, acquisitions: 1 },
  { id: 'blood_pact', name: '血契', type: 'mutation', stackable: false, description: '击杀时恢复生命并略微强化自身。', level: 1, acquisitions: 1 },
];

export const TRAIT_REGISTRY = Object.fromEntries(
  TRAIT_DEFINITIONS.map((t) => [t.id, t])
) as Record<string, TraitDefinition>;

export function getTraitById(id: string): TraitDefinition | undefined {
  return TRAIT_REGISTRY[id];
}

export function hasTrait(gu: Gu, traitId: string): boolean {
  return gu.traits.some((t) => t.id === traitId);
}

export function countTrait(gu: Gu, traitId: string): number {
  return gu.traits.filter((t) => t.id === traitId).length;
}

/** 按触发时机获取特质效果（核心扩展点） */
export function getTraitEffects(trigger: TraitTrigger, context: CombatContext): EffectResult[] {
  const effects: EffectResult[] = [];
  const { attacker, defender, logs } = context;

  // 统一分发
  for (const trait of attacker.traits) {
    const result = applyTraitTrigger(trait, trigger, context);
    if (result) {
      effects.push(result);
      if (result.log) logs.push(result.log);
    }
  }
  // 防御方也可能在 on_hit 等时机触发
  if (trigger === 'on_hit' || trigger === 'post_damage') {
    for (const trait of defender.traits) {
      const result = applyTraitTrigger(trait, trigger, context);
      if (result) {
        effects.push(result);
        if (result.log) logs.push(result.log);
      }
    }
  }

  return effects;
}

function applyTraitTrigger(trait: Trait, trigger: TraitTrigger, context: CombatContext): EffectResult | null {
  const { attacker, defender } = context;
  const lvl = trait.level || 1;

  switch (trait.id) {
    case 'sharp_claws':
      if (trigger === 'on_attack') {
        const dmg = 2 + (lvl - 1) * 1.5; // 线性
        return { damageAdd: dmg, log: `蛊#${attacker.id} 【利爪】额外伤害 +${dmg}` };
      }
      break;

    case 'poison_bite':
      if (trigger === 'on_attack') {
        const dot = 1 + (lvl - 1) * 0.6;
        defender.hp = Math.max(1, defender.hp - dot);
        return { log: `蛊#${attacker.id} 【毒牙】对 蛊#${defender.id} 附加 ${dot} 毒伤` };
      }
      break;

    case 'berserk':
      if (trigger === 'pre_attack' && attacker.hp < attacker.maxHp * 0.3) {
        const boost = 0.5 * (1 - Math.exp(-0.35 * lvl)); // 对数增长
        return { damageMult: boost, log: `蛊#${attacker.id} 【狂暴】低血爆发，攻击提升` };
      }
      break;

    case 'hard_shell':
      if (trigger === 'on_hit') {
        // 对数式减伤，永不完全免疫。日志中使用当前上下文的被击中者（defender）
        const reduction = 1 - Math.pow(0.92, lvl);
        return { defenseRateBonus: reduction, log: `蛊#${defender.id} 【硬壳】减伤生效` };
      }
      break;

    case 'fast_metabolism':
      if (trigger === 'passive') {
        // 被外部 getFoodExpMultiplier 使用
      }
      break;

    case 'unstable':
      if (trigger === 'passive') {
        // 由 gu.ts 的 shouldGainExtraTraitOnLevelUp 检查
        // 战斗中由 combat.ts 中的特殊检查处理 "因为不稳定所以本次没有攻击"
      }
      break;

    // === 新特质实现 ===
    case 'lifesteal_fang':
      if (trigger === 'on_attack') {
        const rate = 0.08 + (lvl - 1) * 0.03;
        return { lifesteal: rate, log: `吸血獠牙Lv.${lvl} 提供吸血效果` };
      }
      break;

    case 'iron_hide':
      if (trigger === 'on_hit') {
        const reduction = 0.08 * lvl;
        return { defenseRateBonus: Math.min(0.45, reduction), log: `铁皮Lv.${lvl} 提供额外减伤` };
      }
      break;

    case 'lucky_charm':
      if (trigger === 'pre_attack') {
        return { critChanceBonus: 0.04 + lvl * 0.015, log: `蛊#${attacker.id} 【幸运符】暴击率与幸运上升！` };
      }
      break;

    case 'quick_reflex':
      if (trigger === 'pre_attack') {
        return { log: `蛊#${attacker.id} 【迅捷反应】先攻与速度提升！` };
      }
      break;

    case 'venom_sac':
      if (trigger === 'on_attack') {
        const dot = 2 + lvl * 1.6;
        defender.hp = Math.max(1, defender.hp - dot);
        return { log: `毒囊Lv.${lvl} 造成额外 ${dot} 持续毒伤` };
      }
      break;

    case 'blood_pact':
      if (trigger === 'on_kill') {
        const heal = Math.floor(28 + lvl * 11);
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
        // 轻微永久强化
        attacker.atk = Math.floor(attacker.atk * 1.015) + 1;
        return { log: `血契Lv.${lvl} 击杀回复 ${heal} 并强化攻击` };
      }
      break;

    // scavenger, regen 等保持原有外部逻辑
  }
  return null;
}

/** 向后兼容的旧接口（逐步废弃） */
export function applyCombatEffects(
  attacker: Gu,
  defender: Gu,
  log: string[]
): { damageMod: number; defenderDamageReduction: number } {
  // 临时桥接，未来 combat 将直接使用 getTraitEffects
  const fakeContext: any = { attacker, defender, logs: log, tempModifiers: {} };
  const effects = getTraitEffects('on_attack', fakeContext);
  let damageMod = 0;
  let defenderDamageReduction = 0;

  for (const e of effects) {
    if (e.damageAdd) damageMod += e.damageAdd;
    if (e.defenseRateBonus) defenderDamageReduction += e.defenseRateBonus * 10; // 粗略转换
  }
  return { damageMod, defenderDamageReduction };
}

export function getFoodExpMultiplier(gu: Gu): number {
  const t = gu.traits.find(tt => tt.id === 'fast_metabolism');
  let mult = 1.0;
  if (t) {
    const lvl = t.level || 1;
    mult = 1.5 + (lvl - 1) * 0.2;
  }
  if (hasTrait(gu, 'greedy') || gu.personality === 'greedy') mult *= 1.35;
  return mult;
}

export function getMovementBias(gu: Gu, hasNearbyCorpse: boolean) {
  // 保持原有简化实现（移动不属于战斗属性核心）
  const base = { foodSeek: 0.6, socialAggro: 0.2, wander: 0.2 };
  if (gu.personality === 'aggressive') base.socialAggro += 0.35;
  if (hasTrait(gu, 'scavenger') && hasNearbyCorpse) base.foodSeek += 0.15;
  if (hasTrait(gu, 'greedy') || gu.personality === 'greedy') base.foodSeek += 0.22;
  const total = base.foodSeek + base.socialAggro + base.wander;
  return { foodSeek: base.foodSeek / total, socialAggro: base.socialAggro / total, wander: base.wander / total };
}

export function shouldGainExtraTraitOnLevelUp(gu: Gu): boolean {
  return hasTrait(gu, 'unstable') && Math.random() < 0.30;
}

export function pickRandomNewTrait(currentTraits: Trait[]): TraitDefinition | null {
  // 特质名称唯一，但重复获得用于进化，所以始终从所有定义中随机
  if (TRAIT_DEFINITIONS.length === 0) return null;
  return TRAIT_DEFINITIONS[Math.floor(Math.random() * TRAIT_DEFINITIONS.length)];
}
