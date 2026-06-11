/**
 * 蛊生态模拟器 - 可调参数集中管理
 * 所有魔法数字、平衡性参数、初始值都放在这里，便于后期调优。
 * 严禁在其他文件中硬编码这些数值。
 */

export const WORLD = {
  WIDTH: 900,
  HEIGHT: 650,
  MARGIN: 20, // 蛊和食物距离边界的最小距离
} as const;

/** 初始种群数量 */
export const INITIAL_GU_COUNT = 12;

/** 食物相关（*10 缩放） */
export const FOOD = {
  /** 每多少 tick 尝试生成一次食物 */
  SPAWN_INTERVAL: 9,
  /** 每次生成的数量范围 */
  SPAWN_COUNT_MIN: 1,
  SPAWN_COUNT_MAX: 2,
  /** 蛊吃到食物的碰撞半径（逻辑像素） */
  EAT_RADIUS: 14,
  /** 基础经验值（*10 后） */
  BASE_VALUE: 1000,
  /** 吃食物时恢复的血量（*10 后） */
  HEAL_ON_EAT: 500,
} as const;

/** 经验与升级（非线性 + 高随机性的成长曲线，*10 缩放后） */
export const LEVEL = {
  /** 1级升2级所需经验 */
  BASE_EXP: 2200,
  /** 每升一级，所需经验的增长系数 */
  EXP_GROWTH: 1.45,
  /** 基础属性总值增长：每级增加的基础点数（*10） */
  STAT_BASE_INCREASE: 500,
  /** 非线性成长指数 (level ^ exponent) */
  STAT_GROWTH_EXPONENT: 0.8,
  /** 每级额外随机点数范围（高随机性，*10） */
  STAT_VARIANCE: 400,
} as const;

/** 战斗相关（*10 缩放 + 提高 MAX_ROUNDS 确保决战，无逃跑中断） */
export const COMBAT = {
  /** 防止无限循环的最大回合数（已提高，实际远低于此即因 MIN_DAMAGE 结束） */
  MAX_ROUNDS: 25,
  /** 基础伤害下限（*10 后） */
  MIN_DAMAGE: 300,
  /** 胜利者从失败者继承的特质数量范围 */
  INHERIT_TRAITS_MIN: 1,
  INHERIT_TRAITS_MAX: 2,
  /** 战斗胜利基础经验奖励（*10 后） */
  WIN_BASE_EXP: 2000,
} as const;

/** 模拟速度档位（每渲染帧执行的逻辑 tick 数） */
export const SPEED_LEVELS = [0.5, 1, 2, 4, 8] as const;

/** 环境事件基础概率（每 tick 独立 roll） */
export const EVENT = {
  BASE_CHANCE_PER_TICK: 0.012, // 约每 80 tick 一次
} as const;

/** 移动与 AI */
export const MOVEMENT = {
  /** 基础移动速度（逻辑像素 / tick） */
  BASE_SPEED: 2.8,
  /** 觅食吸引力权重 */
  FOOD_SEEK_WEIGHT: 0.65,
  /** 性格影响的社会性权重上限 */
  SOCIAL_WEIGHT: 0.45,
  /** 速度属性对实际移动的加成系数 */
  SPEED_TO_VELOCITY: 0.035,
} as const;

/** 蛊初始属性范围（*10 缩放，避免0/1伤害，让个位数正确参与整数计算） */
export const GU_INIT = {
  ATK_MIN: 1200,
  ATK_MAX: 2600,
  DEF_MIN: 800,
  DEF_MAX: 2000,
  SPD_MIN: 900,
  SPD_MAX: 2000,
  HP_MIN: 4800,
  HP_MAX: 7500,
} as const;
