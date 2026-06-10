/**
 * 蛊生态模拟器 - 模拟主循环（核心编排器）
 *
 * 这是整个单坛子模拟的“大脑”。
 * tick() 是唯一驱动世界演化的入口。
 */

import type { Gu, Food, JarState, CombatResult, EnvironmentEvent } from './types';
import { WORLD, INITIAL_GU_COUNT, FOOD, COMBAT } from '../utils/constants';
import { createRandomGu, computeNextPosition, gainExp, tryLevelUp, expToNextLevel } from './gu';
import { resolveCombat } from './combat';
import { checkAndEatFood, rollAndApplyEvents, spawnFood } from './environment';
import { getFoodExpMultiplier } from './traits';

export class SimulationEngine {
  gus: Gu[] = [];
  foods: Food[] = [];
  tickCount = 0;
  eventLog: string[] = []; // 最近事件（环形缓冲，UI 消费后可截断）

  private nextGuId = 1;
  private recentEvents: EnvironmentEvent[] = [];

  constructor(initialCount = INITIAL_GU_COUNT) {
    this.reset(initialCount);
  }

  /** 重置整个坛子（全新随机种群） */
  reset(initialCount = INITIAL_GU_COUNT): void {
    this.gus = [];
    this.foods = [];
    this.tickCount = 0;
    this.eventLog = ['模拟已重置'];
    this.recentEvents = [];
    this.nextGuId = 1;

    for (let i = 0; i < initialCount; i++) {
      this.gus.push(createRandomGu(this.nextGuId++));
    }

    // 初始撒一些食物
    for (let i = 0; i < 6; i++) {
      this.foods.push(spawnFood());
    }
  }

  /**
   * 推进 N 个逻辑 tick（由外部根据速度档位决定每帧推进多少）
   */
  tick(steps = 1): void {
    for (let s = 0; s < steps; s++) {
      this.tickCount++;

      // 1. 移动阶段
      this.moveAll();

      // 2. 吃食阶段
      const eaten = checkAndEatFood(this.gus, this.foods);
      for (const gu of this.gus) {
        // 简化：每个蛊本 tick 最多吃一个（实际 eaten 里可能有多个，但这里只给一次）
      }
      if (eaten.length > 0) {
        // 给随机吃到食物的蛊加经验（更真实做法是记录谁吃了哪个，这里简化）
        const lucky = this.gus[Math.floor(Math.random() * this.gus.length)];
        if (lucky) {
          const mult = getFoodExpMultiplier(lucky);
          const gained = gainExp(lucky, FOOD.BASE_VALUE, mult);
          this.pushLog(`蛊#${lucky.id} 吃到了食物 (+${gained} exp)`);
        }
      }

      // 3. 战斗阶段（重叠即触发）
      this.resolveCombats();

      // 4. 环境事件
      const evt = rollAndApplyEvents(this.tickCount, this.gus, this.foods);
      if (evt) {
        this.recentEvents.push(evt);
        this.pushLog(`[事件] ${evt.description}`);
      }

      // 5. 升级检查 + 变异
      this.checkLevelUps();

      // 6. 死亡移除 + 食物生成
      this.removeDead();
      this.spawnFoods();

      // 7. 简单再生（带 regen 特质的蛊）
      this.applyPassiveRegen();
    }
  }

  private moveAll(): void {
    // 预计算“附近是否有尸体”（简化：只看是否有 hp<=0 的蛊）
    const hasCorpse = this.gus.some((g) => g.hp <= 0);

    for (const gu of this.gus) {
      if (gu.hp <= 0) continue;

      // 找最近食物（简化）
      let nearestFood: { x: number; y: number } | null = null;
      let minFoodDist = Infinity;
      for (const f of this.foods) {
        const d = (gu.x - f.x) ** 2 + (gu.y - f.y) ** 2;
        if (d < minFoodDist) {
          minFoodDist = d;
          nearestFood = f;
        }
      }

      // 找最近其他活蛊
      let nearestOther: { x: number; y: number; isDead?: boolean } | null = null;
      let minOtherDist = Infinity;
      for (const other of this.gus) {
        if (other.id === gu.id || other.hp <= 0) continue;
        const d = (gu.x - other.x) ** 2 + (gu.y - other.y) ** 2;
        if (d < minOtherDist) {
          minOtherDist = d;
          nearestOther = other;
        }
      }

      const { x, y } = computeNextPosition(gu, nearestFood, nearestOther);
      gu.x = x;
      gu.y = y;
    }
  }

  private resolveCombats(): void {
    // 收集重叠配对（避免迭代删除问题）
    const pairs: [Gu, Gu][] = [];
    for (let i = 0; i < this.gus.length; i++) {
      const a = this.gus[i];
      if (a.hp <= 0) continue;
      for (let j = i + 1; j < this.gus.length; j++) {
        const b = this.gus[j];
        if (b.hp <= 0) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy;
        // 重叠判定半径（两个蛊的“体型”）
        const r = 11 + Math.min(a.level, 6) * 0.6;
        if (distSq < r * r) {
          pairs.push([a, b]);
        }
      }
    }

    for (const [a, b] of pairs) {
      if (a.hp <= 0 || b.hp <= 0) continue;
      const result: CombatResult = resolveCombat(a, b);
      // 记录战斗日志
      result.logs.forEach((l) => this.pushLog(l));

      // 胜利者继承已在 combat 里直接写入了 winner.traits
      // 这里只需要给额外经验（combat 已给基础）
    }
  }

  private checkLevelUps(): void {
    for (const gu of this.gus) {
      if (gu.hp <= 0) continue;
      const gained = tryLevelUp(gu);
      if (gained.length > 0) {
        this.pushLog(
          `蛊#${gu.id} 升级到 Lv.${gu.level}，获得新特质：${gained.map((t) => t.name).join('、')}`
        );
      }
    }
  }

  private removeDead(): void {
    const before = this.gus.length;
    this.gus = this.gus.filter((g) => g.hp > 0);
    if (this.gus.length < before) {
      this.pushLog(`有 ${before - this.gus.length} 只蛊虫死亡`);
    }
  }

  private spawnFoods(): void {
    // 每 FOOD.SPAWN_INTERVAL tick 尝试生成
    if (this.tickCount % FOOD.SPAWN_INTERVAL === 0) {
      const count = FOOD.SPAWN_COUNT_MIN + Math.floor(Math.random() * (FOOD.SPAWN_COUNT_MAX - FOOD.SPAWN_COUNT_MIN + 1));
      for (let i = 0; i < count; i++) {
        this.foods.push(spawnFood());
      }
    }
  }

  private applyPassiveRegen(): void {
    for (const gu of this.gus) {
      if (gu.hp <= 0 || gu.hp >= gu.maxHp) continue;
      // 拥有 regen 且非频繁触发（每 10 tick）
      if (gu.traits.some((t) => t.id === 'regen') && this.tickCount % 10 === 0) {
        gu.hp = Math.min(gu.maxHp, gu.hp + 1 + Math.floor(Math.random() * 1.5));
      }
    }
  }

  private pushLog(msg: string): void {
    this.eventLog.push(`[T${this.tickCount}] ${msg}`);
    // 保留最近 60 条
    if (this.eventLog.length > 60) this.eventLog.shift();
  }

  /** 返回只读快照（给渲染和 UI 使用） */
  getSnapshot(): Readonly<JarState> {
    return {
      version: 1,
      tickCount: this.tickCount,
      gus: this.gus.map((g) => ({ ...g, traits: [...g.traits] })), // 浅拷贝足够
      foods: this.foods.map((f) => ({ ...f })),
    };
  }

  /** 简易序列化（完整保存当前状态） */
  toJSON(): JarState {
    return this.getSnapshot() as JarState;
  }

  /** 从保存的状态恢复（会重置 nextId 等） */
  loadFromState(state: JarState): void {
    this.tickCount = state.tickCount;
    this.gus = state.gus.map((g) => ({ ...g, traits: [...g.traits] }));
    this.foods = state.foods.map((f) => ({ ...f }));
    this.eventLog = [`已从存档加载（tick ${this.tickCount}）`];
    this.nextGuId = Math.max(0, ...this.gus.map((g) => g.id)) + 1;
    this.recentEvents = [];
  }
}
