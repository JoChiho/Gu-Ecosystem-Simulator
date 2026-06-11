/**
 * 蛊实体逻辑（已更新初始化新追踪字段）
 */
import type { Gu, Personality, Trait } from './types';
import { GU_INIT, WORLD, LEVEL } from '../utils/constants';
import { TRAIT_DEFINITIONS, pickRandomNewTrait, shouldGainExtraTraitOnLevelUp } from './traits';

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randomPersonality(): Personality {
  const list: Personality[] = ['aggressive', 'cautious', 'opportunistic', 'balanced'];
  return list[randInt(0, list.length - 1)];
}

/**
 * 获得特质或进化现有特质
 * 进化规则（用户指定）：
 * - 1级 → 2级 需要 3 次获得（总 acquisitions=3 时升2）
 * - 2级 → 3级 需要 3 个“2级单位”即总 9 次（acquisitions=9 时升3）
 * - 以此类推：level = 1 + Math.floor( Math.log(acquisitions) / Math.log(3) )
 * - 继承高等级：直接设置到对应 level，并把 acquisitions 设为达到该 level 的最小值 3^(level-1)
 */
export function acquireTrait(gu: Gu, defOrTrait: any) {
  const id = defOrTrait.id;
  const name = defOrTrait.name;
  const type = defOrTrait.type;
  const inheritLevel = defOrTrait.level || 1;

  let existing = gu.traits.find(t => t.id === id);
  if (!existing) {
    const acqForLevel = Math.pow(3, inheritLevel - 1);
    gu.traits.push({
      id,
      name,
      type,
      level: inheritLevel,
      acquisitions: acqForLevel
    });
  } else {
    if (inheritLevel > existing.level) {
      // 继承更高等级
      existing.level = inheritLevel;
      existing.acquisitions = Math.max(existing.acquisitions || 1, Math.pow(3, inheritLevel - 1));
    } else {
      // 普通获得，增加次数并按对数规则进化
      // 1级→2级：acq 达到 3
      // 2级→3级：acq 达到 9 (3^2)
      // level = 1 + floor( log3( acq ) )
      existing.acquisitions = (existing.acquisitions || 1) + 1;
      const newLevel = 1 + Math.floor( Math.log(existing.acquisitions) / Math.log(3) );
      if (newLevel > existing.level) {
        existing.level = newLevel;
      }
    }
  }
}

export function createRandomGu(id: number): Gu {
  const atk = randInt(GU_INIT.ATK_MIN, GU_INIT.ATK_MAX);
  const def = randInt(GU_INIT.DEF_MIN, GU_INIT.DEF_MAX);
  const spd = randInt(GU_INIT.SPD_MIN, GU_INIT.SPD_MAX);
  const maxHp = randInt(GU_INIT.HP_MIN, GU_INIT.HP_MAX);

  // 新基础属性：特攻、特防、MP
  const specialAtk = randInt(Math.floor(GU_INIT.ATK_MIN * 0.6), Math.floor(GU_INIT.ATK_MAX * 1.1));
  const specialDef = randInt(Math.floor(GU_INIT.DEF_MIN * 0.6), Math.floor(GU_INIT.DEF_MAX * 1.1));
  const mp = randInt(120, 220);

  const initialTraits: Trait[] = [];
  const starterCount = randInt(0, 2);
  for (let i = 0; i < starterCount; i++) {
    const def = TRAIT_DEFINITIONS[randInt(0, TRAIT_DEFINITIONS.length - 1)];
    initialTraits.push({ 
      id: def.id, 
      name: def.name, 
      type: def.type, 
      level: 1, 
      acquisitions: 1 
    });
  }

  return {
    id,
    atk, def, spd,
    hp: maxHp, maxHp,
    level: 1, exp: 0,
    x: randInt(WORLD.MARGIN, WORLD.WIDTH - WORLD.MARGIN),
    y: randInt(WORLD.MARGIN, WORLD.HEIGHT - WORLD.MARGIN),
    personality: randomPersonality(),
    traits: initialTraits,

    // 新基础属性
    specialAtk,
    specialDef,
    mp,

    // 追踪字段
    fights: 0,
    wins: 0,
    battleHistory: [],
    notableEvents: [],
  };
}

export function expToNextLevel(level: number): number {
  return Math.floor(LEVEL.BASE_EXP * Math.pow(LEVEL.EXP_GROWTH, level - 1));
}

export function gainExp(gu: Gu, rawExp: number, metabolismMultiplier = 1): number {
  const gained = Math.floor(rawExp * metabolismMultiplier);
  gu.exp += gained;
  return gained;
}

export function tryLevelUp(gu: Gu): Trait[] {
  const needed = expToNextLevel(gu.level);
  if (gu.exp < needed) return [];

  gu.exp -= needed;
  gu.level += 1;

  // 非线性 + 高随机性的基础数值总值成长
  // 每级增加的总点数 = STAT_BASE_INCREASE + floor( STAT_GROWTH_EXPONENT 影响 ) + 随机
  const basePoints = LEVEL.STAT_BASE_INCREASE + Math.floor( Math.pow(gu.level, LEVEL.STAT_GROWTH_EXPONENT) * 0.8 );
  const variance = randInt( -LEVEL.STAT_VARIANCE , LEVEL.STAT_VARIANCE );
  let totalPoints = Math.max(3, basePoints + variance);

  // 随机分配到基础属性（高随机性：有些等级可能集中某些属性）
  const statKeys = ['atk', 'def', 'specialAtk', 'specialDef', 'spd'];
  for (let p = 0; p < totalPoints; p++) {
    const key = statKeys[ randInt(0, statKeys.length - 1) ];
    if (key === 'atk') gu.atk += 1;
    else if (key === 'def') gu.def += 1;
    else if (key === 'specialAtk') gu.specialAtk = (gu.specialAtk ?? 0) + 1;
    else if (key === 'specialDef') gu.specialDef = (gu.specialDef ?? 0) + 1;
    else if (key === 'spd') gu.spd += 1;
  }

  // maxHp 和 mp 也获得成长（总值增加，*10 缩放后）
  gu.maxHp += Math.floor(20 + gu.level * 4) + randInt(0, 20);
  gu.mp = (gu.mp ?? 0) + randInt(10, 30);

  const newTraits: Trait[] = [];
  const newTraitDef = pickRandomNewTrait(gu.traits);
  if (newTraitDef) {
    acquireTrait(gu, newTraitDef);
    const acquired = gu.traits.find(t => t.id === newTraitDef.id)!;
    newTraits.push({ ...newTraitDef, level: acquired.level, acquisitions: acquired.acquisitions });
  }
  if (shouldGainExtraTraitOnLevelUp(gu)) {
    const extraDef = pickRandomNewTrait(gu.traits);
    if (extraDef) {
      acquireTrait(gu, extraDef);
      const acquired = gu.traits.find(t => t.id === extraDef.id)!;
      newTraits.push({ ...extraDef, level: acquired.level, acquisitions: acquired.acquisitions });
    }
  }
  gu.hp = gu.maxHp;  // 升级回满
  return newTraits;
}

export function computeNextPosition(gu: Gu, nearestFood: any, nearestOther: any, dt = 1) {
  // 简化版移动（完整版可从之前历史复制完整 bias + 速度计算）
  const bias = { foodSeek: 0.6, socialAggro: 0.2, wander: 0.2 };
  if (gu.personality === 'aggressive') bias.socialAggro += 0.3;

  let vx = (Math.random() - 0.5) * 2 * 2.8;
  let vy = (Math.random() - 0.5) * 2 * 2.8;

  if (nearestFood) {
    const dx = nearestFood.x - gu.x;
    const dy = nearestFood.y - gu.y;
    const d = Math.hypot(dx, dy) || 1;
    vx += (dx / d) * 3.5 * bias.foodSeek;
    vy += (dy / d) * 3.5 * bias.foodSeek;
  }
  if (nearestOther && bias.socialAggro > 0.2) {
    const dx = nearestOther.x - gu.x;
    const dy = nearestOther.y - gu.y;
    const d = Math.hypot(dx, dy) || 1;
    const sign = gu.personality === 'aggressive' ? 1 : -0.6;
    vx += (dx / d) * 2.5 * bias.socialAggro * sign;
    vy += (dy / d) * 2.5 * bias.socialAggro * sign;
  }

  const speedFactor = 1 + (gu.spd - 8) * 0.035;
  vx *= speedFactor; vy *= speedFactor;
  vx = vx * 0.82 + (Math.random() - 0.5) * 0.6;
  vy = vy * 0.82 + (Math.random() - 0.5) * 0.6;

  let nx = gu.x + vx * dt;
  let ny = gu.y + vy * dt;

  if (nx < WORLD.MARGIN) nx = WORLD.MARGIN;
  if (nx > WORLD.WIDTH - WORLD.MARGIN) nx = WORLD.WIDTH - WORLD.MARGIN;
  if (ny < WORLD.MARGIN) ny = WORLD.MARGIN;
  if (ny > WORLD.HEIGHT - WORLD.MARGIN) ny = WORLD.HEIGHT - WORLD.MARGIN;

  return { x: nx, y: ny };
}

// 逃跑机制已完全移除（用户要求取消频繁中断）。战斗现在始终进行至一方死亡。
