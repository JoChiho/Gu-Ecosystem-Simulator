/**
 * 蛊生态模拟器 - 可调参数集中管理（薄包装层）
 *
 * 真实可手动编辑的单一文件是： src/config/balance.ts
 * 本文件仅做 re-export 以保持现有 import 不变。
 *
 * 如果你想调整初始蛊数量、属性总量、成长速度等，
 * 请直接打开并编辑 src/config/balance.ts
 */

export {
  JAR,
  WORLD,
  GU_CREATION,
  FOOD,
  LEVEL,
  COMBAT,
  EVENT,
  MOVEMENT,
  SPEED_LEVELS,
  GU_INIT,
  INITIAL_GU_COUNT,
} from '../config/balance';

// 为了向后兼容，也导出整个 BALANCE 对象供高级用法
export * as BALANCE from '../config/balance';
