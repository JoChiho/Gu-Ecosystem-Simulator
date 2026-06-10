/**
 * 蛊王元系统（Phase 2 预留）
 *
 * 按照开发计划要求：
 * - 仅在数据结构层面做好预留
 * - 暂不实现任何跨坛子保存、对战、交配、提取等功能
 * - UI 仅展示占位提示
 *
 * 未来实现时：
 * - promoteToYuan(gu: Gu) 从某个坛子中“册封”一只强蛊
 * - 跨多个 SimulationEngine 实例共享此 store
 * - 提供对战/交配接口
 */

import type { GuYuan } from './types';

export const yuanStore: GuYuan[] = [];

export function promoteToYuan(gu: Gu): void {
  // TODO Phase 2 实现
  console.warn('[GuYuan] promoteToYuan 尚未实现（仅数据结构预留）', gu.id);
}

export function clearYuanStore(): void {
  yuanStore.length = 0;
}

// 未来可扩展：getTopYuans, yuanBattle 等
