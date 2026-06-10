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

/** 食物相关 */
export const FOOD = {
  /** 每多少 tick 尝试生成一次食物 */
  SPAWN_INTERVAL: 9,
  /** 每次生成的数量范围 */
  SPAWN_COUNT_MIN: 1,
  SPAWN_COUNT_MAX: 2,
  /** 蛊吃到食物的碰撞半径（逻辑像素） */
  EAT_RADIUS: 14,
  /** 基础经验值 */
  BASE_VALUE: 8,
} as const;

/** 经验与升级 */
export const LEVEL = {
  /** 1级升2级所需经验 */
  BASE_EXP: 22,
  /** 每升一级，所需经验的增长系数 */
  EXP_GROWTH: 1.55,
  /** 每级额外获得的属性点（攻击/防御/速度中随机分配） */
  STAT_POINTS_PER_LEVEL: 1,
} as const;

/** 战斗相关 */
export const COMBAT = {
  /** 防止无限循环的最大回合数 */
  MAX_ROUNDS: 6,
  /** 基础伤害下限 */
  MIN_DAMAGE: 1,
  /** 胜利者从失败者继承的特质数量范围 */
  INHERIT_TRAITS_MIN: 1,
  INHERIT_TRAITS_MAX: 2,
  /** 战斗胜利基础经验奖励 */
  WIN_BASE_EXP: 12,
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

/** 蛊初始属性范围 */
export const GU_INIT = {
  ATK_MIN: 6,
  ATK_MAX: 14,
  DEF_MIN: 4,
  DEF_MAX: 11,
  SPD_MIN: 5,
  SPD_MAX: 15,
  HP_MIN: 22,
  HP_MAX: 32,
} as const;
