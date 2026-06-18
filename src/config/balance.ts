/**
 * 蛊生态模拟器 - 核心平衡与初始参数配置文件
 *
 * ============================================================
 * 这是最推荐手动修改的文件！
 * ============================================================
 *
 * 所有开局数值、成长曲线、战斗强度、食物/事件节奏都集中在这里。
 * 修改后保存，重新运行模拟（或 tauri dev 热重载）即可生效。
 *
 * 重点可调项示例：
 * - 坛子初始蛊虫数量：JAR.initialCount
 * - 初始属性点总量：GU_CREATION.coreStatTotalMin / Max （新增！）
 * - 升级成长速度：LEVEL.*
 * - 伤害基数与战斗长度：COMBAT.*
 * - 食物出现与回血强度：FOOD.*
 *
 * 建议新手调参顺序：
 * 1. JAR.initialCount （想更多/更少蛊同时在场）
 * 2. GU_CREATION.coreStatTotal* （整体强度）
 * 3. LEVEL.STAT_BASE_INCREASE / STAT_VARIANCE （升级爽感）
 * 4. COMBAT.MIN_DAMAGE （伤害质感）
 */

export const JAR = {
  /** 坛子初始蛊虫数量（推荐 8~20，改这里即可） */
  initialCount: 14,
} as const;

/** 世界/空间参数 */
export const WORLD = {
  WIDTH: 900,
  HEIGHT: 650,
  MARGIN: 20,
} as const;

/**
 * 蛊初始生成参数
 * 新增“初始属性点总量”概念，取代/补充原来完全独立的 rand。
 * coreStatTotal 会在 atk/def/specialAtk/specialDef/spd 五个主属性上随机分配。
 * 这样用户可以一键控制“开局蛊整体有多强”。
 */
export const GU_CREATION = {
  /** 
   * 核心战斗属性总点数（atk + def + specialAtk + specialDef + spd）
   * 设计目标：让个位数修正能正常参与整数计算（用户最初 *10 的诉求），
   * 但避免数值膨胀导致暴击一击杀 + 移动过快。
   * 目标范围：单项 ~80-200，典型伤害 8-70，战斗持续数回合。
   */
  coreStatTotalMin: 620,
  coreStatTotalMax: 880,

  /** HP 基础范围 */
  hpMin: 420,
  hpMax: 680,

  /** MP 范围 */
  mpMin: 18,
  mpMax: 32,

  /** 初始随机特质数量范围 */
  starterTraitCountMin: 0,
  starterTraitCountMax: 2,
} as const;

/** 食物系统 */
export const FOOD = {
  SPAWN_INTERVAL: 9,
  SPAWN_COUNT_MIN: 1,
  SPAWN_COUNT_MAX: 2,
  EAT_RADIUS: 14,
  /** 吃一次的基础经验 */
  BASE_VALUE: 75,
  /** 吃一次回血量 */
  HEAL_ON_EAT: 38,
} as const;

/** 升级与成长（非线性 + 高随机，数值适中） */
export const LEVEL = {
  BASE_EXP: 180,
  EXP_GROWTH: 1.42,
  /** 每升一级增加的基础属性总点数 */
  STAT_BASE_INCREASE: 42,
  STAT_GROWTH_EXPONENT: 0.8,
  STAT_VARIANCE: 32,
} as const;

/** 战斗系统（保持可读整数伤害，避免一击毙命） */
export const COMBAT = {
  MAX_ROUNDS: 25,
  MIN_DAMAGE: 8,
  INHERIT_TRAITS_MIN: 1,
  INHERIT_TRAITS_MAX: 2,
  WIN_BASE_EXP: 140,
} as const;

/** 环境事件 */
export const EVENT = {
  BASE_CHANCE_PER_TICK: 0.012,
} as const;

/** 移动与 AI 权重（配合 computeNextPosition 使用，当前已针对合理 spd 量级调低） */
export const MOVEMENT = {
  BASE_SPEED: 1.0,
  FOOD_SEEK_WEIGHT: 0.65,
  SOCIAL_WEIGHT: 0.45,
  SPEED_TO_VELOCITY: 0.006,  // 现在 movement 代码内有更温和的公式
} as const;

/** UI 速度档位 */
export const SPEED_LEVELS = [0.5, 1, 2, 4, 8] as const;

/**
 * 旧的 GU_INIT 保留作为参考/兼容。
 * 实际 createRandomGu 现在优先使用 GU_CREATION 的总量分配。
 */
export const GU_INIT = {
  // 参考值，现在主要由 GU_CREATION 总量分配控制
  ATK_MIN: 95,
  ATK_MAX: 185,
  DEF_MIN: 70,
  DEF_MAX: 145,
  SPD_MIN: 85,
  SPD_MAX: 165,
  HP_MIN: 420,
  HP_MAX: 680,
} as const;

// 便捷别名（保持向后兼容，推荐直接 import { JAR } from '../config/balance'）
export const INITIAL_GU_COUNT = JAR.initialCount;
