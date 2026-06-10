/**
 * 蛊生态模拟器 - 环境（食物 + 随机事件）
 * 负责食物生成/吃食检测 + 低概率环境事件。
 */

import type { Food, Gu, EnvironmentEvent, EnvironmentEventType } from './types';
import { WORLD, FOOD, EVENT } from '../utils/constants';

/** 生成一个随机位置的食物（考虑边界） */
export function spawnFood(): Food {
  const x = WORLD.MARGIN + Math.random() * (WORLD.WIDTH - WORLD.MARGIN * 2);
  const y = WORLD.MARGIN + Math.random() * (WORLD.HEIGHT - WORLD.MARGIN * 2);
  return { x, y };
}

/** 检查并吃掉范围内的食物，返回被吃掉的食物列表 */
export function checkAndEatFood(gus: Gu[], foods: Food[]): Food[] {
  const eaten: Food[] = [];

  for (const gu of gus) {
    for (let i = foods.length - 1; i >= 0; i--) {
      const f = foods[i];
      const dx = gu.x - f.x;
      const dy = gu.y - f.y;
      if (dx * dx + dy * dy < FOOD.EAT_RADIUS * FOOD.EAT_RADIUS) {
        eaten.push(foods[i]);
        foods.splice(i, 1);
      }
    }
  }
  return eaten;
}

/** 随机环境事件定义 */
const EVENT_DEFS: Record<EnvironmentEventType, (gus: Gu[], foods: Food[]) => string> = {
  food_boom: (_gus, foods) => {
    const count = 6 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) foods.push(spawnFood());
    return `食物丰收！坛子里突然出现了 ${count} 份新鲜食物。`;
  },
  drought: (_gus, foods) => {
    const remove = Math.min(foods.length, 4 + Math.floor(Math.random() * 3));
    foods.splice(0, remove);
    return `干旱降临，${remove} 份食物消失了。`;
  },
  mutation_wave: (gus, _foods) => {
    const affected = Math.min(gus.length, 3 + Math.floor(Math.random() * 2));
    // 只是记录，真正给额外特质的机会放在 engine 升级检查里
    return `突变潮涌动，${affected} 只蛊虫感受到异变（升级时更容易获得新特质）。`;
  },
};

/**
 * 每 tick 调用，极小概率触发事件。
 * 返回本次触发的事件（可能为 null）。
 */
export function rollAndApplyEvents(
  tick: number,
  gus: Gu[],
  foods: Food[]
): EnvironmentEvent | null {
  if (Math.random() > EVENT.BASE_CHANCE_PER_TICK) return null;

  const types: EnvironmentEventType[] = ['food_boom', 'drought', 'mutation_wave'];
  const type = types[Math.floor(Math.random() * types.length)];
  const description = EVENT_DEFS[type](gus, foods);

  return {
    type,
    tick,
    description,
  };
}
