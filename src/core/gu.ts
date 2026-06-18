/**
 * 蛊实体逻辑（已更新初始化新追踪字段）
 */
import type { Gu, Personality, Trait } from './types';
import { WORLD, LEVEL, GU_CREATION, SIZE } from '../utils/constants';
import { TRAIT_DEFINITIONS, pickRandomNewTrait, shouldGainExtraTraitOnLevelUp } from './traits';
import { SKILL_DEFINITIONS } from './skills';

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randomPersonality(): Personality {
  // 所有已定义性格都会被随机到（编辑 types.ts + stats.ts 即可增加新性格）
  const list: Personality[] = [
    'aggressive', 'cautious', 'opportunistic', 'balanced',
    'naive', 'ferocious', 'cunning',
    'greedy', 'stoic', 'wild',
  ];
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
  // 使用“初始属性点总量”机制（编辑 src/config/balance.ts 中的 GU_CREATION 即可调整）
  // 五个主属性（atk/def/sa/sd/spd）从总量池中随机分配，增加开局多样性
  const coreTotal = randInt(GU_CREATION.coreStatTotalMin, GU_CREATION.coreStatTotalMax);
  let atk = 0, def = 0, specialAtk = 0, specialDef = 0, spd = 0;

  const statKeys = ['atk', 'def', 'specialAtk', 'specialDef', 'spd'] as const;
  for (let p = 0; p < coreTotal; p++) {
    const key = statKeys[randInt(0, statKeys.length - 1)];
    if (key === 'atk') atk += 1;
    else if (key === 'def') def += 1;
    else if (key === 'specialAtk') specialAtk += 1;
    else if (key === 'specialDef') specialDef += 1;
    else if (key === 'spd') spd += 1;
  }

  // HP 相对独立但有规模感（可进一步联动 coreTotal）
  const maxHp = randInt(GU_CREATION.hpMin, GU_CREATION.hpMax);
  const mp = randInt(GU_CREATION.mpMin, GU_CREATION.mpMax);

  const initialTraits: Trait[] = [];
  const starterCount = randInt(GU_CREATION.starterTraitCountMin, GU_CREATION.starterTraitCountMax);
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

    // 1级初始只有1个技能，后续通过升级获得，最多4个
    skills: (() => {
      if (SKILL_DEFINITIONS.length === 0) return [];
      const idx = Math.floor(Math.random() * SKILL_DEFINITIONS.length);
      return [{ id: SKILL_DEFINITIONS[idx].id, level: 1 }];
    })(),

    specialAtk,
    specialDef,
    mp,
    maxMp: mp,

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

  // 兼容：如果没有技能，初始化1个（模拟升级获得）
  if (!gu.skills || gu.skills.length === 0) {
    if (SKILL_DEFINITIONS.length > 0) {
      const idx = Math.floor(Math.random() * SKILL_DEFINITIONS.length);
      gu.skills = [{ id: SKILL_DEFINITIONS[idx].id, level: 1 }];
    } else {
      gu.skills = [];
    }
  }

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

  // maxHp 和 mp 也获得成长（总值增加）
  gu.maxHp += Math.floor(20 + gu.level * 4) + randInt(0, 20);
  const mpGain = randInt(2, 5);
  gu.maxMp = (gu.maxMp ?? gu.mp ?? 0) + mpGain;
  gu.mp = Math.min(gu.maxMp, (gu.mp ?? 0) + mpGain);

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

  // 技能获取：和特质类似，通过升级获得
  // 1级初始1个，升级时可能获得新技能（上限4）或提升已有技能等级
  const MAX_SKILLS = 4;
  const currentSkillIds = (gu.skills || []).map(s => s.id);
  if (currentSkillIds.length < MAX_SKILLS && Math.random() < 0.4) {
    const available = SKILL_DEFINITIONS.filter(s => !currentSkillIds.includes(s.id));
    if (available.length > 0) {
      const newS = available[Math.floor(Math.random() * available.length)];
      (gu.skills as any[]).push({ id: newS.id, level: 1 });
    }
  } else if ((gu.skills || []).length > 0 && Math.random() < 0.55) {
    // 提升已有技能等级
    const idx = Math.floor(Math.random() * (gu.skills as any[]).length);
    (gu.skills as any[])[idx].level = ((gu.skills as any[])[idx].level || 1) + 1;
  }

  // 强制上限4
  (gu.skills as any[]) = (gu.skills as any[]).slice(0, 4);

  gu.hp = gu.maxHp;  // 升级回满
  return newTraits;
}

export function computeNextPosition(gu: Gu, nearestFood: any, nearestOther: any, dt = 1) {
  // 移动速度调优（解决1倍速下抖动过快、难以点击的问题）：
  // - 降低基础随机力与牵引力
  // - speedFactor 改成温和公式，适配当前 spd 量级（~80-200）
  // - 更多平滑，视觉更稳
  const bias = { foodSeek: 0.6, socialAggro: 0.2, wander: 0.2 };
  if (gu.personality === 'aggressive') bias.socialAggro += 0.3;

  let vx = (Math.random() - 0.5) * 2 * 1.05;
  let vy = (Math.random() - 0.5) * 2 * 1.05;

  if (nearestFood) {
    const dx = nearestFood.x - gu.x;
    const dy = nearestFood.y - gu.y;
    const d = Math.hypot(dx, dy) || 1;
    vx += (dx / d) * 1.35 * bias.foodSeek;
    vy += (dy / d) * 1.35 * bias.foodSeek;
  }
  if (nearestOther && bias.socialAggro > 0.2) {
    const dx = nearestOther.x - gu.x;
    const dy = nearestOther.y - gu.y;
    const d = Math.hypot(dx, dy) || 1;
    const sign = gu.personality === 'aggressive' ? 1 : -0.6;
    vx += (dx / d) * 1.0 * bias.socialAggro * sign;
    vy += (dy / d) * 1.0 * bias.socialAggro * sign;
  }

  // 温和的速度缩放（以 spd ≈ 140 为 1.0x 基准）
  const speedFactor = 0.65 + (gu.spd / 140) * 0.85;
  vx *= speedFactor;
  vy *= speedFactor;

  // 加强平滑，减少随机抖动
  vx = vx * 0.86 + (Math.random() - 0.5) * 0.35;
  vy = vy * 0.86 + (Math.random() - 0.5) * 0.35;

  let nx = gu.x + vx * dt;
  let ny = gu.y + vy * dt;

  if (nx < WORLD.MARGIN) nx = WORLD.MARGIN;
  if (nx > WORLD.WIDTH - WORLD.MARGIN) nx = WORLD.WIDTH - WORLD.MARGIN;
  if (ny < WORLD.MARGIN) ny = WORLD.MARGIN;
  if (ny > WORLD.HEIGHT - WORLD.MARGIN) ny = WORLD.HEIGHT - WORLD.MARGIN;

  return { x: nx, y: ny };
}

// 逃跑机制已完全移除（用户要求取消频繁中断）。战斗现在始终进行至一方死亡。

/**
 * 获取蛊的物理半径（随等级增长）
 * - 用于 Canvas 绘制
 * - 用于战斗碰撞检测（遭遇概率）
 * - 等级越高，体型越大 → 吃食物范围越大、效率越高、战斗概率越高
 */
export function getGuRadius(gu: Gu): number {
  const lvl = Math.min(Math.max(1, gu.level), SIZE.LEVEL_CAP);
  return SIZE.BASE_RADIUS + (lvl - 1) * SIZE.LEVEL_BONUS;
}

/**
 * 获取该蛊的吃食半径（等级越高吃得越容易、效率越高）
 */
export function getGuEatRadius(gu: Gu): number {
  const lvl = Math.min(Math.max(1, gu.level), SIZE.EAT_LEVEL_CAP);
  return SIZE.EAT_BASE + (lvl - 1) * SIZE.EAT_LEVEL_BONUS;
}
