<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { SimulationEngine } from './core/engine';
import type { Gu, Personality } from './core/types';
import SimulationCanvas from './components/SimulationCanvas.vue';
import BattleView from './components/BattleView.vue';
import { resolveCombat, executeBattleRound } from './core/combat';   // 顶部导入，保证对战时可用
import { acquireTrait } from './core/gu';
import { separateAfterFlee } from './core/gu';

const engine = new SimulationEngine(12);
const snapshot = ref(engine.getSnapshot());
const isRunning = ref(true);
const speedIndex = ref(1);
const tickDisplay = ref(0);
const selectedId = ref<number | null>(null);
const logLines = ref<string[]>([]);

// 战斗模式状态
const battleMode = ref(false);
const battleGuA = ref<Gu | null>(null);
const battleGuB = ref<Gu | null>(null);
const battleLogs = ref<string[]>([]);
const battleResult = ref<{ winnerId: number | null; inherited: string[] } | null>(null);
const isResolvingBattle = ref(false);
let currentBattleRound = 0;

// 晋升的蛊王列表（跨“坛子”）
const yuanList = ref<any[]>([]);

const SPEED_LEVELS = [0.5, 1, 2, 4, 8];
let rafId: number | null = null;

function updateSnapshot() {
  snapshot.value = engine.getSnapshot();
  tickDisplay.value = engine.tickCount;
  logLines.value = [...engine.eventLog].slice(-8).reverse();
}

function gameLoop() {
  if (!isRunning.value || battleMode.value || engine.isClosed) {
    rafId = requestAnimationFrame(gameLoop);
    return;
  }

  const speed = SPEED_LEVELS[speedIndex.value] ?? 1;
  const steps = Math.max(1, Math.floor(speed));

  engine.tick(steps);

  // 检测是否有待处理的战斗
  if (engine.pendingBattle && !battleMode.value) {
    enterBattleMode(engine.pendingBattle[0], engine.pendingBattle[1]);
    isRunning.value = false; // 暂停模拟
  }

  // 检查是否闭合
  if (engine.isClosed && !battleMode.value) {
    handleJarClosed();
  }

  updateSnapshot();
  rafId = requestAnimationFrame(gameLoop);
}

function enterBattleMode(guA: Gu, guB: Gu) {
  battleMode.value = true;
  battleGuA.value = guA;
  battleGuB.value = guB;
  battleLogs.value = [];
  battleResult.value = null;
  isResolvingBattle.value = false;
  currentBattleRound = 0;
}

function performNextRound() {
  if (!battleGuA.value || !battleGuB.value || battleResult.value) return;

  currentBattleRound++;

  // 简单轮流或基于 spd 决定本回合攻击者（简化实现，便于观察）
  const [att, def] = (currentBattleRound % 2 === 1) 
    ? [battleGuA.value, battleGuB.value] 
    : [battleGuB.value, battleGuA.value];

  const { logs: roundLogs, over, fled } = executeBattleRound(att, def, currentBattleRound);
  battleLogs.value = [...battleLogs.value, ...roundLogs];

  if (fled || over) {
    const winner = battleGuA.value.hp > 0 ? battleGuA.value : battleGuB.value;
    const loser = battleGuA.value.hp > 0 ? battleGuB.value : battleGuA.value;

    if (fled || loser.hp > 0) {
      // 逃跑或达到最大回合平局
      if (fled) {
        // 逃跑后打散位置 + 清除标志，防止立即重战斗
        separateAfterFlee(battleGuA.value, battleGuB.value);
        engine.pendingBattle = null;
      }
      if (!fled) {
        battleLogs.value.push(`达到最大回合，战斗以平局结束。双方均未获得经验。`);
      }
      battleResult.value = {
        winnerId: null,
        inherited: [],
      };
    } else {
      // 只有败者死亡时才继承
      const inherited: string[] = [];
      const inheritCount = 1 + Math.floor(Math.random() * 2);
      const pool = [...loser.traits];
      for (let i = 0; i < inheritCount && pool.length > 0; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        const picked = pool.splice(idx, 1)[0];
        acquireTrait(winner, picked as any);
        inherited.push(`${picked.name} Lv.${picked.level || 1}`);
      }

      battleResult.value = {
        winnerId: winner.id,
        inherited,
      };
    }
  } else if (currentBattleRound >= 15) {
    // 兜底：达到最大回合平局（没有中途逃跑或死亡）
    battleLogs.value.push(`达到最大回合，战斗以平局结束。双方均未获得经验。`);
    battleResult.value = {
      winnerId: null,
      inherited: [],
    };
  }
}

function startAutoBattle() {
  if (!battleGuA.value || !battleGuB.value) return;
  isResolvingBattle.value = true;

  const step = () => {
    performNextRound();
    if (battleResult.value) {
      isResolvingBattle.value = false;
      return;
    }
    setTimeout(step, 650); // 每回合延迟，便于观察过程
  };
  setTimeout(step, 350);
}

// 保留旧的直接调用方式以防万一，但目前使用逐步版本
function _oldStartAutoBattle() {
  if (!battleGuA.value || !battleGuB.value) return;
  isResolvingBattle.value = true;

  const r = resolveCombat(battleGuA.value, battleGuB.value);
  battleLogs.value = r.logs;
  if (r.winner) {
    battleResult.value = {
      winnerId: r.winner.id,
      inherited: r.inheritedTraits.map(t => `${t.name} Lv.${t.level || 1}`),
    };
  } else {
    battleResult.value = {
      winnerId: null,
      inherited: [],
    };
  }
  isResolvingBattle.value = false;
}

function skipBattle() {
  if (!battleGuA.value || !battleGuB.value) return;
  const r = resolveCombat(battleGuA.value, battleGuB.value);
  battleLogs.value = r.logs;
  if (r.winner) {
    battleResult.value = {
      winnerId: r.winner.id,
      inherited: r.inheritedTraits.map(t => `${t.name} Lv.${t.level || 1}`),
    };
  } else {
    battleResult.value = {
      winnerId: null,
      inherited: [],
    };
  }
}

function confirmBattleResult() {
  if (!battleGuA.value || !battleGuB.value || !battleResult.value) return;

  if (battleResult.value.winnerId != null) {
    // 只有死亡胜利才有胜者，调用 finalize 移除败者并记录
    const win = battleGuA.value.id === battleResult.value.winnerId ? battleGuA.value : battleGuB.value;
    const lose = battleGuA.value.id === battleResult.value.winnerId ? battleGuB.value : battleGuA.value;
    engine.finalizeCombat(
      win,
      lose,
      battleLogs.value,
      battleResult.value.inherited
    );
  } else {
    // 逃跑平局：双方都留在坛子中，不移除，不加经验（已在战斗逻辑中处理）
  }

  // 无论死亡还是逃跑，清除 engine 的 pendingBattle 标志，防止战斗结束后立即因为残留标志而重新进入
  engine.pendingBattle = null;

  // 退出战斗模式
  battleMode.value = false;
  battleGuA.value = null;
  battleGuB.value = null;
  battleLogs.value = [];
  battleResult.value = null;

  updateSnapshot();

  // 可能刚好晋升了
  if (engine.isClosed) {
    handleJarClosed();
  } else {
    isRunning.value = true;
  }
}

function handleJarClosed() {
  // 由 engine 完成晋升
  const promoted = engine.promoteLastSurvivor();
  if (promoted) {
    yuanList.value.push(promoted);
  }
  updateSnapshot();
  // 可以在这里弹提示或让用户手动重置新坛子
}

function resetSim() {
  // 如果当前有闭合的坛子，可以选择保留 yuan 继续新的一轮
  engine.reset(12);
  selectedId.value = null;
  battleMode.value = false;
  isRunning.value = true;
  updateSnapshot();
}

function togglePause() {
  if (engine.isClosed) return;
  isRunning.value = !isRunning.value;
}

function changeSpeed(delta: number) {
  speedIndex.value = Math.max(0, Math.min(SPEED_LEVELS.length - 1, speedIndex.value + delta));
}

function onCanvasSelect(id: number | null) {
  selectedId.value = id;
}

function getFleeProbabilityForUI(p: Personality): number {
  switch (p) {
    case 'cautious': return 0.85;
    case 'aggressive': return 0.25;
    case 'opportunistic': return 0.55;
    default: return 0.5;
  }
}

onMounted(() => {
  updateSnapshot();
  rafId = requestAnimationFrame(gameLoop);
});

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId);
});
</script>

<template>
  <div class="app-root">
    <header>
      <h1>蛊生态模拟器 <span class="sub">Gu Ecosystem Simulator</span></h1>
      <div class="controls" v-if="!battleMode">
        <button @click="togglePause" :disabled="engine.isClosed">{{ isRunning ? '暂停' : '继续' }}</button>
        <button @click="changeSpeed(-1)">慢</button>
        <span class="speed">{{ SPEED_LEVELS[speedIndex] }}x</span>
        <button @click="changeSpeed(1)">快</button>
        <button @click="resetSim">重置 / 新坛子</button>
        <span class="tick">Tick: {{ tickDisplay }}</span>
        <span v-if="engine.isClosed" class="closed">【坛子已闭合】</span>
      </div>
    </header>

    <div class="main" v-if="!battleMode">
      <div class="canvas-wrap">
        <SimulationCanvas :snapshot="snapshot" @select="onCanvasSelect" />
        <div class="hint">蛊虫相遇时将自动进入对战界面（可跳过）</div>
      </div>

      <aside class="side">
        <div class="panel">
          <h3>统计</h3>
          <div>蛊虫数量: {{ snapshot.gus.length }}</div>
          <div>食物: {{ snapshot.foods.length }}</div>
          <div>平均等级: {{ snapshot.gus.length ? (snapshot.gus.reduce((s,g)=>s+g.level,0)/snapshot.gus.length).toFixed(1) : 0 }}</div>
        </div>

        <div class="panel" v-if="selectedId != null">
          <h3>蛊 #{{ selectedId }}</h3>
          <div v-for="gu in snapshot.gus.filter(g => g.id === selectedId)" :key="gu.id">
            <div>Lv.{{ gu.level }} ({{ gu.personality }})</div>
            <div>HP: {{ gu.hp }}/{{ gu.maxHp }}</div>
            <div>战斗 {{ gu.fights || 0 }} 胜 {{ gu.wins || 0 }}</div>
            <div class="traits">
              <span v-for="t in gu.traits" :key="t.id" class="trait-tag">{{ t.name }} Lv.{{ t.level || 1 }}</span>
            </div>
          </div>
        </div>

        <div class="panel log">
          <h3>重要事件</h3>
          <div class="log-lines">
            <div v-for="(line,i) in logLines" :key="i" class="log-line">{{ line }}</div>
            <div v-if="!logLines.length" class="log-line muted">仅显示变异、关键战斗、环境大事件等</div>
          </div>
        </div>

        <!-- 蛊王元面板 -->
        <div class="panel yuan">
          <h3>蛊王元 ({{ yuanList.length }})</h3>
          <div v-if="yuanList.length === 0" class="muted">暂无蛊王</div>
          <div v-for="yuan in yuanList" :key="yuan.id" class="yuan-item">
            蛊 #{{ yuan.baseGu.id }} Lv.{{ yuan.baseGu.finalLevel }} 
            战斗{{ yuan.baseGu.fights }}胜{{ yuan.baseGu.wins }}
            <div class="small">{{ yuan.baseGu.finalTraits.map((t:any)=>t.name).join('、') }}</div>
          </div>
        </div>
      </aside>
    </div>

    <!-- 专用对战界面（UI 整体变化） -->
    <BattleView
      v-if="battleMode && battleGuA && battleGuB"
      :guA="battleGuA"
      :guB="battleGuB"
      :combatLogs="battleLogs"
      :result="battleResult"
      :isResolving="isResolvingBattle"
      @auto-battle="startAutoBattle"
      @skip="skipBattle"
      @confirm="confirmBattleResult"
      @next-round="performNextRound"
    />

    <footer v-if="!battleMode">
      <small>食物获取已过滤 • 重要事件仅变异/大型事件/关键继承/闭合 • 相遇自动进入1v1对战UI</small>
    </footer>
  </div>
</template>

<style scoped>
/* 保持与之前相似的样式，增加 .yuan .closed 等 */
.app-root { max-width: 1100px; margin: 0 auto; padding: 12px; text-align: left; }
header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px; }
h1 { margin:0; font-size:22px; }
.controls button { margin-right:4px; }
.speed, .tick { font-family:monospace; color:#aaa; }
.closed { color:#e74c3c; font-weight:bold; margin-left:8px; }

.main { display:flex; gap:16px; }
.canvas-wrap { flex-shrink:0; }
.side { width:260px; display:flex; flex-direction:column; gap:10px; }
.panel { background:#1a1a1a; border:1px solid #333; border-radius:6px; padding:10px 12px; font-size:13px; }
.trait-tag { background:#2a2a2a; padding:1px 5px; border-radius:3px; font-size:11px; margin-right:3px; }
.log-lines { font-family:monospace; font-size:11px; }
.log-line { color:#aaa; }
.muted { color:#666; }
.yuan-item { font-size:12px; border-bottom:1px solid #222; padding:3px 0; }
.yuan-item .small { color:#888; font-size:10px; }

footer { margin-top:12px; text-align:center; color:#555; font-size:11px; }
</style>
