<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { SimulationEngine } from './core/engine';
import type { Gu } from './core/types';
import { getPersonalityCN, getPersonalityDescription } from './core/types';
import { TRAIT_DEFINITIONS } from './core/traits';
import SimulationCanvas from './components/SimulationCanvas.vue';
import BattleView from './components/BattleView.vue';
import { resolveCombat, executeBattleRound } from './core/combat';   // 顶部导入，保证对战时可用
import { acquireTrait, tryLevelUp } from './core/gu';
import { getMetaStats, getDerivedStats } from './core/stats';
import { COMBAT, FOOD, INITIAL_GU_COUNT } from './utils/constants';

const engine = new SimulationEngine(INITIAL_GU_COUNT);
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

  // 逃跑机制已完全取消。每个UI步（一个“回合”）保证双方都有完整行动。
  // 战斗现在始终进行至一方 HP <= 0 才结束（无中断、无平局逃跑）。
  const dA = getDerivedStats(battleGuA.value);
  const dB = getDerivedStats(battleGuB.value);
  const [initiator, responder] = (dA.initiative > dB.initiative || (dA.initiative === dB.initiative && Math.random() > 0.5)) 
    ? [battleGuA.value, battleGuB.value] 
    : [battleGuB.value, battleGuA.value];

  let allStepLogs: string[] = [];

  // 发起方完整行动
  let res1 = executeBattleRound(initiator, responder, currentBattleRound);
  allStepLogs.push(...res1.logs);

  let currentOver = res1.over;

  if (!currentOver) {
    // 响应方也完整行动（回合制：双方都行动）
    let res2 = executeBattleRound(responder, initiator, currentBattleRound);
    allStepLogs.push(...res2.logs);
    currentOver = res2.over;
  }

  // 速度优势额外行动（价值保留，但不影响回合制本质）
  const initI = dA.initiative;
  const initR = dB.initiative;
  const fastOne = initI > initR ? initiator : responder;
  const slowOne = initI > initR ? responder : initiator;
  if (!currentOver && (Math.max(initI, initR) > Math.min(initI, initR) * 1.6)) {
    let res3 = executeBattleRound(fastOne, slowOne, currentBattleRound);
    allStepLogs.push(...res3.logs);
    currentOver = currentOver || res3.over;
  }

  // 本步行动的个体经验（发起方更多，响应方也有 + 随机 → 个体化，不同步；*10 缩放后调整除数）
  const initDerived = initiator === battleGuA.value ? dA : dB;
  const respDerived = responder === battleGuA.value ? dA : dB;
  const initExp = Math.max(1, Math.floor(initDerived.effectivePhysicalAtk / 9) + Math.floor(Math.random() * 2));
  const respExp = Math.max(1, Math.floor(respDerived.effectivePhysicalDef / 11) + Math.floor(Math.random() * 2));
  initiator.exp += initExp;
  if (!(currentOver && responder.hp <= 0)) {
    responder.exp += respExp;
  }
  allStepLogs.push(`[经验] 蛊#${initiator.id} +${initExp} (主动) ， 蛊#${responder.id} +${respExp} (响应)`);

  battleLogs.value = [...battleLogs.value, ...allStepLogs];

  const over = currentOver;

  if (over) {
    const winner = battleGuA.value.hp > 0 ? battleGuA.value : battleGuB.value;
    const loser = battleGuA.value.hp > 0 ? battleGuB.value : battleGuA.value;

    if (loser.hp > 0) {
      // 理论上不应该（除非极端），作为兜底平局处理（无奖励）
      battleLogs.value.push(`战斗结束，双方均未倒下（罕见）。`);
      battleResult.value = {
        winnerId: null,
        inherited: [],
      };
    } else {
      // 只有败者死亡时才给经验 + 继承
      const metaWinner = getMetaStats(winner);
      const expGain = COMBAT.WIN_BASE_EXP + Math.floor((loser.level - winner.level) * 2);
      const finalExp = Math.floor(expGain * (1 + (metaWinner.luck || 0) * 0.001));
      winner.exp += finalExp;
      battleLogs.value.push(`蛊#${winner.id} 获胜，获得 ${finalExp} 经验`);

      // 立即尝试升级并记录（让玩家在战斗界面就能看到升级）
      const gained = tryLevelUp(winner);
      if (gained.length > 0) {
        const names = gained.map(t => `${t.name} Lv.${t.level || 1}`);
        battleLogs.value.push(`蛊#${winner.id} 升级！获得新特质：${names.join('、')}`);
      }

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

    // 战斗结束后，赢家获得额外血量恢复（通过“吃食物”机制的体现）
    if (win) {
      win.hp = Math.min(win.maxHp, win.hp + FOOD.HEAL_ON_EAT * 2);
    }
  } else {
    // 无胜者（罕见平局情况）：双方留在坛子，不移除
  }

  // 清除 engine 的 pendingBattle 标志，防止战斗结束后立即重触发
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
  engine.reset(INITIAL_GU_COUNT);
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

function getTraitDesc(id: string): string {
  const def = TRAIT_DEFINITIONS.find((t) => t.id === id);
  return def ? def.description : '';
}


// 逃跑概率相关 UI 辅助已移除（逃跑机制已完全取消）

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
            <div class="tooltip" :data-tooltip="getPersonalityDescription(gu.personality)">
              Lv.{{ gu.level }} ({{ getPersonalityCN(gu.personality) }})
            </div>
            <div>HP: {{ gu.hp }}/{{ gu.maxHp }}</div>
            <div>MP: {{ gu.mp }}/{{ gu.maxMp || gu.mp || 0 }}</div>
            <div>战斗 {{ gu.fights || 0 }} 胜 {{ gu.wins || 0 }}</div>
            <div class="traits">
              <span v-for="t in gu.traits" :key="t.id" class="trait-tag tooltip" :data-tooltip="getTraitDesc(t.id)">
                {{ t.name }} Lv.{{ t.level || 1 }}
              </span>
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
