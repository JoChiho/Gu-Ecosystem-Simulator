/**
 * 蛊生态模拟器 - Canvas 2D 渲染器
 * 只负责根据快照绘制，不包含任何游戏规则。
 */

import type { JarState, Gu, Food } from '../core/types';

export interface RenderOptions {
  selectedGuId?: number | null;
  showFightLines?: boolean; // 简单战斗视觉反馈
}

const PERSONALITY_COLOR: Record<string, string> = {
  aggressive: '#e74c3c',
  cautious: '#3498db',
  opportunistic: '#f1c40f',
  balanced: '#2ecc71',
};

function getGuColor(gu: Gu): string {
  // 优先按性格，其次按等级轻微变化
  const base = PERSONALITY_COLOR[gu.personality] || '#9b59b6';
  const levelTint = Math.min(gu.level - 1, 6) * 8;
  return base; // 简化：直接用性格色，后续可做 hsl 调整
}

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;

  constructor(private canvas: HTMLCanvasElement, logicalWidth: number, logicalHeight: number) {
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('无法获取 2D context');
    this.ctx = ctx;
    this.width = logicalWidth;
    this.height = logicalHeight;

    // 高 DPR 支持（简单版）
    const dpr = window.devicePixelRatio || 1;
    canvas.width = logicalWidth * dpr;
    canvas.height = logicalHeight * dpr;
    canvas.style.width = `${logicalWidth}px`;
    canvas.style.height = `${logicalHeight}px`;
    this.ctx.scale(dpr, dpr);
  }

  render(state: JarState, opts: RenderOptions = {}): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, this.width, this.height);

    // 坛子边界（深色背景 + 边框）
    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, this.width - 8, this.height - 8);

    // 绘制食物
    ctx.fillStyle = '#27ae60';
    for (const f of state.foods) {
      ctx.beginPath();
      ctx.arc(f.x, f.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 绘制蛊
    for (const gu of state.gus) {
      const r = 8 + Math.min(gu.level, 7) * 1.1;
      const color = getGuColor(gu);

      // 主体
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(gu.x, gu.y, r, 0, Math.PI * 2);
      ctx.fill();

      // 边框（死亡或低血变暗）
      ctx.strokeStyle = gu.hp < gu.maxHp * 0.35 ? '#c0392b' : '#222';
      ctx.lineWidth = gu.id === opts.selectedGuId ? 3 : 1.5;
      ctx.stroke();

      // 等级文字
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(gu.level), gu.x, gu.y - 1);

      // 简单 HP 条
      const hpRatio = Math.max(0, gu.hp / gu.maxHp);
      const barW = r * 1.8;
      const barH = 3;
      ctx.fillStyle = '#222';
      ctx.fillRect(gu.x - barW / 2, gu.y + r + 3, barW, barH);
      ctx.fillStyle = hpRatio > 0.4 ? '#2ecc71' : '#e74c3c';
      ctx.fillRect(gu.x - barW / 2, gu.y + r + 3, barW * hpRatio, barH);

      // 选中高亮圈
      if (gu.id === opts.selectedGuId) {
        ctx.strokeStyle = '#f1c40f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(gu.x, gu.y, r + 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 简单战斗反馈：如果本 tick 有很多蛊血量低，就画一些随机连线（演示用）
    // 更真实的做法是 engine 暴露“本 tick 发生战斗的配对”，这里简化随机连线表现“正在打架”
    if (opts.showFightLines) {
      ctx.strokeStyle = 'rgba(231, 76, 60, 0.6)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < Math.min(3, state.gus.length - 1); i++) {
        const a = state.gus[i];
        const b = state.gus[(i + 3) % state.gus.length];
        if (a.hp > 0 && b.hp > 0 && Math.random() < 0.6) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }

  /** 命中测试：从屏幕坐标找到最近的蛊 id（用于点击选中） */
  hitTest(state: JarState, canvasX: number, canvasY: number): number | null {
    let closest: { id: number; dist: number } | null = null;
    for (const gu of state.gus) {
      const dx = gu.x - canvasX;
      const dy = gu.y - canvasY;
      const d = dx * dx + dy * dy;
      const r = 10 + Math.min(gu.level, 7) * 1.1;
      if (d < r * r * 1.6) {
        if (!closest || d < closest.dist) {
          closest = { id: gu.id, dist: d };
        }
      }
    }
    return closest ? closest.id : null;
  }
}
