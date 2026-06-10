<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { SimulationEngine } from './core/engine';
import type { JarState } from './core/types';
import SimulationCanvas from './components/SimulationCanvas.vue';

const engine = new SimulationEngine(12);
const snapshot = ref<JarState>(engine.getSnapshot());
const isRunning = ref(true);
const speedIndex = ref(1); // 对应 SPEED_LEVELS
const tickDisplay = ref(0);
const selectedId = ref<number | null>(null);
const logLines = ref<string[]>([]);

const SPEED_LEVELS = [0.5, 1, 2, 4, 8];
let rafId: number | null = null;
let lastTime = 0;

function updateSnapshot() {
  snapshot.value = engine.getSnapshot();
  tickDisplay.value = engine.tickCount;
  // 同步最近日志（取最后几条）
  logLines.value = [...engine.eventLog].slice(-8).reverse();
}

function gameLoop(ts = 0) {
  if (!isRunning.value) {
    rafId = requestAnimationFrame(gameLoop);
    return;
  }

  const speed = SPEED_LEVELS[speedIndex.value] ?? 1;
  const steps = Math.max(1, Math.floor(speed));

  engine.tick(steps);
  updateSnapshot();

  rafId = requestAnimationFrame(gameLoop);
}

function togglePause() {
  isRunning.value = !isRunning.value;
}

function changeSpeed(delta: number) {
  speedIndex.value = Math.max(0, Math.min(SPEED_LEVELS.length - 1, speedIndex.value + delta));
}

function resetSim() {
  engine.reset(12);
  selectedId.value = null;
  updateSnapshot();
  logLines.value = ['模拟已重置'];
}

function onCanvasSelect(id: number | null) {
  selectedId.value = id;
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
      <div class="controls">
        <button @click="togglePause">{{ isRunning ? '暂停' : '继续' }}</button>
        <button @click="changeSpeed(-1)">慢一点</button>
        <span class="speed">速度: {{ SPEED_LEVELS[speedIndex] }}x</span>
        <button @click="changeSpeed(1)">快一点</button>
        <button @click="resetSim">重置种群</button>
        <span class="tick">Tick: {{ tickDisplay }}</span>
      </div>
    </header>

    <div class="main">
      <div class="canvas-wrap">
        <SimulationCanvas
          :snapshot="snapshot"
          @select="onCanvasSelect"
        />
        <div class="hint">点击画布中的蛊虫可选中（高亮）</div>
      </div>

      <aside class="side">
        <div class="panel">
          <h3>统计</h3>
          <div>蛊虫数量: {{ snapshot.gus.length }}</div>
          <div>食物数量: {{ snapshot.foods.length }}</div>
          <div>平均等级: {{
            snapshot.gus.length
              ? (snapshot.gus.reduce((s, g) => s + g.level, 0) / snapshot.gus.length).toFixed(1)
              : 0
          }}</div>
        </div>

        <div class="panel" v-if="selectedId != null">
          <h3>选中蛊 #{{ selectedId }}</h3>
          <div v-for="gu in snapshot.gus.filter(g => g.id === selectedId)" :key="gu.id">
            <div>Lv.{{ gu.level }} ({{ gu.personality }})</div>
            <div>HP: {{ gu.hp }} / {{ gu.maxHp }}</div>
            <div>ATK {{ gu.atk }} | DEF {{ gu.def }} | SPD {{ gu.spd }}</div>
            <div>EXP {{ gu.exp }} / {{ Math.floor(22 * Math.pow(1.55, gu.level-1)) }}</div>
            <div class="traits">
              特质: <span v-for="t in gu.traits" :key="t.id" class="trait-tag">{{ t.name }}</span>
            </div>
          </div>
        </div>
        <div v-else class="panel">
          <em>点击画布中的蛊虫查看详情</em>
        </div>

        <div class="panel log">
          <h3>事件日志</h3>
          <div class="log-lines">
            <div v-for="(line, i) in logLines" :key="i" class="log-line">{{ line }}</div>
            <div v-if="!logLines.length" class="log-line muted">暂无事件...</div>
          </div>
        </div>

        <div class="phase-note">
          蛊王元系统（Phase 2 预留）<br>
          <small>当前仅数据结构预留，未实现功能</small>
        </div>
      </aside>
    </div>

    <footer>
      <small>
        纯 TS 核心模拟（移动 / 战斗 / 继承 / 升级 / 事件） • Tauri + Vue + Canvas • 
        <a href="https://github.com/JoChiho/Gu-Ecosystem-Simulator" target="_blank">GitHub</a>
      </small>
    </footer>
  </div>
</template>

<style scoped>
.app-root {
  max-width: 1100px;
  margin: 0 auto;
  padding: 12px;
  text-align: left;
}
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
}
h1 { margin: 0; font-size: 22px; }
.sub { font-size: 13px; color: #888; font-weight: normal; }
.controls {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 13px;
}
button {
  padding: 4px 10px;
  border: 1px solid #444;
  background: #222;
  color: #ddd;
  border-radius: 4px;
  cursor: pointer;
}
button:hover { background: #333; }
.speed, .tick { padding: 0 6px; color: #aaa; font-family: monospace; }

.main {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: center;
}
.canvas-wrap { flex-shrink: 0; }
.hint { font-size: 12px; color: #666; margin-top: 4px; text-align: center; }

.side {
  width: 260px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.panel {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 13px;
}
.panel h3 { margin: 0 0 6px; font-size: 14px; color: #ccc; }
.trait-tag {
  display: inline-block;
  background: #2a2a2a;
  padding: 1px 5px;
  border-radius: 3px;
  margin-right: 3px;
  font-size: 11px;
}
.log {
  max-height: 180px;
  overflow: auto;
}
.log-lines { font-family: monospace; font-size: 11px; line-height: 1.35; }
.log-line { color: #aaa; }
.log-line.muted { color: #555; }
.phase-note {
  font-size: 12px;
  color: #666;
  background: #151515;
  padding: 8px;
  border-radius: 4px;
  border: 1px dashed #333;
}

footer {
  margin-top: 16px;
  text-align: center;
  color: #555;
  font-size: 11px;
}
</style>

