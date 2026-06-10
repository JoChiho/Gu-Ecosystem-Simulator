/**
 * 蛊王元（Phase 2 预留 + 当前已支持晋升数据）
 * 晋升现在由 engine.promoteLastSurvivor 产生丰富数据并推入此列表（由 App 管理展示）。
 */
import type { GuYuan } from './types';

export const yuanStore: GuYuan[] = [];

export function promoteToYuan(gu: GuYuan): void {
  yuanStore.push(gu);
}

export function clearYuanStore() {
  yuanStore.length = 0;
}
