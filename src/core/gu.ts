/**
 * 蛊生态模拟器 - Gu 实体逻辑
 * 负责创建、经验升级、简单移动决策辅助。
 * 复杂移动合成和 tick 级行为由 engine 协调。
 */

import type { Gu, Personality, Trait } from './types';
import { GU_INIT, WORLD, LEVEL, MOVEMENT } from '../utils/constants';
import {
  TRAIT_DEFINITIONS,
  pickRandomNewTrait,
  shouldGainExtraTraitOnLevelUp,
  getFoodExpMultiplier,
  getMovementBias,
} from './traits';

/** 随机整数区间 */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPersonality(): Personality {
  const list: Personality[] = ['aggressive', 'cautious', 'opportunistic', 'balanced'];
  return list[randInt(0, list.length - 1)];
}

/**
 * 创建一只随机初始蛊虫
 */
export function createRandomGu(id: number): Gu {
  const atk = randInt(GU_INIT.ATK_MIN, GU_INIT.ATK_MAX);
  const def = randInt(GU_INIT.DEF_MIN, GU_INIT.DEF_MAX);
  const spd = randInt(GU_INIT.SPD_MIN, GU_INIT.SPD_MAX);
  const maxHp = randInt(GU_INIT.HP_MIN, GU_INIT.HP_MAX);

  // 初始 0~2 个随机特质（允许重复 stackable）
  const initialTraits: Trait[] = [];
  const starterCount = randInt(0, 2);
  for (let i = 0; i < starterCount; i++) {
    const def = TRAIT_DEFINITIONS[randInt(0, TRAIT_DEFINITIONS.length - 1)];
    initialTraits.push({ id: def.id, name: def.name, type: def.type, stackable: def.stackable });
  }

  return {
    id,
    atk,
    def,
    spd,
    hp: maxHp,
    maxHp,
    level: 1,
    exp: 0,
    x: randInt(WORLD.MARGIN, WORLD.WIDTH - WORLD.MARGIN),
    y: randInt(WORLD.MARGIN, WORLD.HEIGHT - WORLD.MARGIN),
    personality: randomPersonality(),
    traits: initialTraits,
  };
}

/** 计算当前升级所需经验 */
export function expToNextLevel(level: number): number {
  return Math.floor(LEVEL.BASE_EXP * Math.pow(LEVEL.EXP_GROWTH, level - 1));
}

/**
 * 增加经验（会应用快速代谢等乘数，由调用方传入已乘数后的值或原始值）
 */
export function gainExp(gu: Gu, rawExp: number, metabolismMultiplier = 1): number {
  const gained = Math.floor(rawExp * metabolismMultiplier);
  gu.exp += gained;
  return gained;
}

/**
 * 尝试升级。如果成功则返回新获得的特质（可能 0~2 个），并重置经验。
 */
export function tryLevelUp(gu: Gu): Trait[] {
  const needed = expToNextLevel(gu.level);
  if (gu.exp < needed) return [];

  gu.exp -= needed;
  gu.level += 1;

  // 基础属性随机成长（简单版：攻击或防御或速度 +1）
  const stat = randInt(0, 2);
  if (stat === 0) gu.atk += LEVEL.STAT_POINTS_PER_LEVEL;
  else if (stat === 1) gu.def += LEVEL.STAT_POINTS_PER_LEVEL;
  else gu.spd += LEVEL.STAT_POINTS_PER_LEVEL;

  const newTraits: Trait[] = [];

  // 正常获得 1 个新特质
  const newTrait = pickRandomNewTrait(gu.traits);
  if (newTrait) {
    gu.traits.push({ id: newTrait.id, name: newTrait.name, type: newTrait.type, stackable: newTrait.stackable });
    newTraits.push({ id: newTrait.id, name: newTrait.name, type: newTrait.type, stackable: newTrait.stackable });
  }

  // 不稳定特质额外机会
  if (shouldGainExtraTraitOnLevelUp(gu)) {
    const extra = pickRandomNewTrait(gu.traits);
    if (extra) {
      gu.traits.push({ id: extra.id, name: extra.name, type: extra.type, stackable: extra.stackable });
      newTraits.push({ id: extra.id, name: extra.name, type: extra.type, stackable: extra.stackable });
    }
  }

  // 升级时回满血（戏剧性 + 生存）
  gu.hp = gu.maxHp;

  return newTraits;
}

/**
 * 辅助计算下一帧位置（由 engine 调用）。
 * 返回新的 (x, y)。engine 负责边界钳制和实际应用。
 */
export function computeNextPosition(
  gu: Gu,
  nearestFood: { x: number; y: number } | null,
  nearestOther: { x: number; y: number; isDead?: boolean } | null,
  dt = 1
): { x: number; y: number } {
  const bias = getMovementBias(gu, !!nearestOther?.isDead);

  let vx = (Math.random() - 0.5) * 2 * MOVEMENT.BASE_SPEED; // wander
  let vy = (Math.random() - 0.5) * 2 * MOVEMENT.BASE_SPEED;

  // 觅食
  if (nearestFood && bias.foodSeek > 0.3) {
    const dx = nearestFood.x - gu.x;
    const dy = nearestFood.y - gu.y;
    const dist = Math.hypot(dx, dy) || 1;
    vx += (dx / dist) * MOVEMENT.BASE_SPEED * 1.6 * bias.foodSeek;
    vy += (dy / dist) * MOVEMENT.BASE_SPEED * 1.6 * bias.foodSeek;
  }

  // 社会性（aggressive 追，cautious 避）
  if (nearestOther && bias.socialAggro > 0.15) {
    const dx = nearestOther.x - gu.x;
    const dy = nearestOther.y - gu.y;
    const dist = Math.hypot(dx, dy) || 1;
    const sign = gu.personality === 'aggressive' ? 1 : -0.7;
    vx += (dx / dist) * MOVEMENT.BASE_SPEED * 1.2 * bias.socialAggro * sign;
    vy += (dy / dist) * MOVEMENT.BASE_SPEED * 1.2 * bias.socialAggro * sign;
  }

  // 速度属性加成
  const speedFactor = 1 + (gu.spd - 8) * MOVEMENT.SPEED_TO_VELOCITY;
  vx *= speedFactor;
  vy *= speedFactor;

  // 阻尼 + 随机小扰动
  vx = vx * 0.82 + (Math.random() - 0.5) * 0.6;
  vy = vy * 0.82 + (Math.random() - 0.5) * 0.6;

  let nx = gu.x + vx * dt;
  let ny = gu.y + vy * dt;

  // 简单边界反弹
  if (nx < WORLD.MARGIN) {
    nx = WORLD.MARGIN;
    vx = Math.abs(vx) * 0.6;
  }
  if (nx > WORLD.WIDTH - WORLD.MARGIN) {
    nx = WORLD.WIDTH - WORLD.MARGIN;
    vx = -Math.abs(vx) * 0.6;
  }
  if (ny < WORLD.MARGIN) {
    ny = WORLD.MARGIN;
    vy = Math.abs(vy) * 0.6;
  }
  if (ny > WORLD.HEIGHT - WORLD.MARGIN) {
    ny = WORLD.HEIGHT - WORLD.MARGIN;
    vy = -Math.abs(vy) * 0.6;
  }

  return { x: nx, y: ny };
}
