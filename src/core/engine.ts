/**
 * 蛊生态模拟器 - 模拟主循环（已更新支持专用对战UI + 最后幸存者晋升 + 重要事件过滤）
 */

import type { Gu, Food, EnvironmentEvent, BattleRecord } from './types';
import { INITIAL_GU_COUNT, FOOD } from '../utils/constants';
import { createRandomGu, computeNextPosition, gainExp, tryLevelUp, expToNextLevel } from './gu';
import { resolveCombat } from './combat';
import { checkAndEatFood, rollAndApplyEvents, spawnFood } from './environment';
import { getFoodExpMultiplier } from './traits';

export class SimulationEngine {
  gus: Gu[] = [];
  foods: Food[] = [];
  tickCount = 0;

  // 只存放“重要”事件（用于主界面日志）
  eventLog: string[] = [];

  // 待处理的战斗（由 tick 检测到重叠后设置，由 UI 驱动 resolve）
  pendingBattle: [Gu, Gu] | null = null;

  // 坛子是否已因只剩最后一只而闭合
  isClosed = false;
  closedReason: string | null = null;

  private nextGuId = 1;
  private recentEnvEvents: EnvironmentEvent[] = [];

  constructor(initialCount = INITIAL_GU_COUNT) {
    this.reset(initialCount);
  }

  reset(initialCount = INITIAL_GU_COUNT): void {
    this.gus = [];
    this.foods = [];
    this.tickCount = 0;
    this.eventLog = ['模拟开始'];
    this.pendingBattle = null;
    this.isClosed = false;
    this.closedReason = null;
    this.recentEnvEvents = [];
    this.nextGuId = 1;

    for (let i = 0; i < initialCount; i++) {
      const gu = createRandomGu(this.nextGuId++);
      gu.fights = 0;
      gu.wins = 0;
      gu.battleHistory = [];
      gu.notableEvents = [];
      this.gus.push(gu);
    }

    for (let i = 0; i < 6; i++) this.foods.push(spawnFood());
  }

  /** 主推进（外部根据速度调用） */
  tick(steps = 1): void {
    if (this.isClosed || this.pendingBattle) return; // 闭合或等待战斗时不推进

    for (let s = 0; s < steps; s++) {
      this.tickCount++;

      this.moveAll();

      // 吃食（不记录为事件）
      // 改进：将食物好处分配给多个存活的蛊，让更多蛊能获得经验和回血（解决“只有一只蛊升级”和赢家恢复问题）
      const eaten = checkAndEatFood(this.gus, this.foods);
      if (eaten.length > 0) {
        let living = this.gus.filter(g => g.hp > 0);
        if (living.length > 0) {
          // 按等级排序 + 少量随机抖动，优先低级但保持个体差异（避免全体同时升级）
          living = living.sort((a, b) => {
            const levelDiff = a.level - b.level;
            const jitterA = (Math.random() - 0.5) * 2;
            const jitterB = (Math.random() - 0.5) * 2;
            return levelDiff + jitterA - jitterB;
          });
          for (let i = 0; i < eaten.length; i++) {
            const lucky = living[i % living.length];
            const mult = getFoodExpMultiplier(lucky);
            gainExp(lucky, FOOD.BASE_VALUE, mult);
            lucky.hp = Math.min(lucky.maxHp, lucky.hp + FOOD.HEAL_ON_EAT);
          }
        }
      }

      // 检测战斗 —— 不立即 resolve，而是设置 pendingBattle 让 UI 接管
      this.detectAndQueueBattles();

      // 环境事件（只重要事件进日志）
      const evt = rollAndApplyEvents(this.tickCount, this.gus, this.foods);
      if (evt) {
        this.pushImportantLog(`[事件] ${evt.description}`);
        // 如果是 mutation_wave，给一些蛊记 notable
        if (evt.type === 'mutation_wave') {
          this.gus.filter(g => g.hp > 0).slice(0, 3).forEach(g => {
            g.notableEvents.push(`T${this.tickCount}: 感受到突变潮`);
          });
        }
      }

      this.checkLevelUpsAndRecord();
      this.removeDead();
      this.spawnFoods();
      this.applyPassiveRegen();

      // 检查是否只剩最后一只
      this.checkLastSurvivor();
    }
  }

  /** 由 UI 在战斗结束后调用，清理战场并记录重要结果 */
  finalizeCombat(winner: Gu, loser: Gu, combatLogs: string[], inheritedNames: string[]): void {
    // 记录战斗历史到双方
    const recordForWinner: BattleRecord = { vsId: loser.id, won: true, inherited: inheritedNames };
    const recordForLoser: BattleRecord = { vsId: winner.id, won: false, inherited: [] };

    winner.fights = (winner.fights || 0) + 1;
    winner.wins = (winner.wins || 0) + 1;
    winner.battleHistory = [...(winner.battleHistory || []), recordForWinner];

    loser.fights = (loser.fights || 0) + 1;
    loser.battleHistory = [...(loser.battleHistory || []), recordForLoser];

    // 只把“关键结果”记入主日志
    const inheritText = inheritedNames.length > 0 ? ` 并继承了 ${inheritedNames.join('、')}` : '';
    this.pushImportantLog(`蛊#${winner.id} 击败了 蛊#${loser.id}${inheritText}`);

    // 实际移除失败者（由 engine 控制）
    this.gus = this.gus.filter(g => g.id !== loser.id);

    // 清空待战状态
    this.pendingBattle = null;

    // 再次检查幸存者（可能这次战斗后只剩1只）
    this.checkLastSurvivor();
  }

  /** 外部（UI）可调用的跳过战斗 */
  skipPendingBattle(): void {
    if (!this.pendingBattle) return;
    const [a, b] = this.pendingBattle;
    const result = resolveCombat(a, b);
    // resolveCombat 保证 winner/loser 非空（战斗逻辑已确保）
    this.finalizeCombat(result.winner!, result.loser!, result.logs, result.inheritedTraits.map(t => t.name));
  }

  private detectAndQueueBattles(): void {
    if (this.pendingBattle) return;

    for (let i = 0; i < this.gus.length; i++) {
      const a = this.gus[i];
      if (a.hp <= 0) continue;
      for (let j = i + 1; j < this.gus.length; j++) {
        const b = this.gus[j];
        if (b.hp <= 0) continue;

        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy;
        const r = 11 + Math.min(a.level, 6) * 0.6;

        if (distSq < r * r) {
          // 发现战斗！暂停推进，交给 UI
          this.pendingBattle = [a, b];
          return;
        }
      }
    }
  }

  private checkLevelUpsAndRecord(): void {
    for (const gu of this.gus) {
      if (gu.hp <= 0) continue;
      const gained = tryLevelUp(gu);
      if (gained.length > 0) {
        const names = gained.map(t => t.level > 1 ? `${t.name} Lv.${t.level}` : t.name );
        this.pushImportantLog(`蛊#${gu.id} 升级到 Lv.${gu.level}，获得新特质：${names.join('、')}`);
        gu.notableEvents.push(`T${this.tickCount}: 升级获得 ${names.join('、')}`);
      }
    }
  }

  private removeDead(): void {
    const before = this.gus.length;
    this.gus = this.gus.filter(g => g.hp > 0);
    if (this.gus.length < before) {
      // 死亡本身不算“重要”到主日志，除非是最后一只
    }
  }

  private spawnFoods(): void {
    if (this.tickCount % FOOD.SPAWN_INTERVAL === 0) {
      const count = FOOD.SPAWN_COUNT_MIN + Math.floor(Math.random() * (FOOD.SPAWN_COUNT_MAX - FOOD.SPAWN_COUNT_MIN + 1));
      for (let i = 0; i < count; i++) this.foods.push(spawnFood());
    }
  }

  private applyPassiveRegen(): void {
    for (const gu of this.gus) {
      if (gu.hp <= 0 || gu.hp >= gu.maxHp) continue;
      if (gu.traits.some(t => t.id === 'regen') && this.tickCount % 10 === 0) {
        gu.hp = Math.min(gu.maxHp, gu.hp + 3 + Math.floor(Math.random() * 3));
      }
    }
  }

  private moveAll(): void {
    const hasCorpse = this.gus.some(g => g.hp <= 0);
    for (const gu of this.gus) {
      if (gu.hp <= 0) continue;

      let nearestFood: {x:number;y:number} | null = null;
      let minD = Infinity;
      for (const f of this.foods) {
        const d = (gu.x - f.x) ** 2 + (gu.y - f.y) ** 2;
        if (d < minD) { minD = d; nearestFood = f; }
      }
      let nearestOther: {x:number;y:number; isDead?:boolean} | null = null;
      minD = Infinity;
      for (const o of this.gus) {
        if (o.id === gu.id || o.hp <= 0) continue;
        const d = (gu.x - o.x) ** 2 + (gu.y - o.y) ** 2;
        if (d < minD) { minD = d; nearestOther = o; }
      }
      const { x, y } = computeNextPosition(gu, nearestFood, nearestOther);
      gu.x = x;
      gu.y = y;
    }
  }

  /** 只记录重要事件到主日志 */
  private pushImportantLog(msg: string): void {
    this.eventLog.push(`[T${this.tickCount}] ${msg}`);
    if (this.eventLog.length > 50) this.eventLog.shift();
  }

  /** 检查是否只剩最后一只，进行晋升并闭合坛子 */
  private checkLastSurvivor(): void {
    if (this.isClosed) return;
    const alive = this.gus.filter(g => g.hp > 0);
    if (alive.length === 1 && this.gus.length > 0) {
      const king = alive[0];
      // 晋升逻辑由外部（UI/App）调用 promoteLastSurvivor 更灵活，这里只标记
      this.isClosed = true;
      this.closedReason = `只剩蛊#${king.id}，坛子自动闭合`;
      this.pushImportantLog(`只剩最后一只蛊#${king.id}，坛子闭合，蛊王入元！`);
    }
  }

  /** 由 UI 在检测到 isClosed 后调用，完成晋升 */
  promoteLastSurvivor(): any {
    const alive = this.gus.filter(g => g.hp > 0);
    if (alive.length !== 1) return null;

    const king = alive[0];

    // 构建丰富的 GuYuan 数据
    const yuanData = {
      id: `yuan-${Date.now()}`,
      baseGu: {
        ...king,
        finalTraits: [...king.traits],
        finalLevel: king.level,
        fights: king.fights || 0,
        wins: king.wins || 0,
        notableEvents: [...(king.notableEvents || [])],
        battleSummary: [...(king.battleHistory || [])],
      } as any,
      power: king.level * 10 + (king.fights || 0) * 2 + (king.wins || 0) * 5,
      wins: king.wins || 0,
      createdTick: this.tickCount,
      sourceJarClosed: true,
    };

    // 清空当前坛子蛊虫（坛子已闭合）
    this.gus = [];
    this.foods = [];
    this.pushImportantLog(`蛊王 #${king.id} 已入元。`);

    return yuanData;
  }

  getSnapshot() {
    return {
      version: 1 as const,
      tickCount: this.tickCount,
      gus: this.gus.map(g => ({ ...g, traits: [...g.traits], battleHistory: [...(g.battleHistory || [])], notableEvents: [...(g.notableEvents || [])] })),
      foods: this.foods.map(f => ({ ...f })),
    };
  }
}
