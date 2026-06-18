<script setup lang="ts">
import type { Gu } from '../core/types';
import { getPersonalityCN, getPersonalityDescription } from '../core/types';
import { SKILL_DEFINITIONS } from '../core/skills';
import { TRAIT_DEFINITIONS } from '../core/traits';

const props = defineProps<{
  guA: Gu;
  guB: Gu;
  combatLogs: string[];
  result: { winnerId: number | null; inherited: string[] } | null;
  isResolving: boolean;
}>();

const emit = defineEmits<{
  (e: 'autoBattle'): void;
  (e: 'skip'): void;
  (e: 'confirm'): void;
  (e: 'nextRound'): void;
  (e: 'cancel'): void;
}>();

// MP 最大值兜底
function getMaxMp(gu: Gu): number {
  return gu.maxMp || gu.mp || 20;
}

// 获取特质描述
function getTraitDesc(id: string): string {
  const def = TRAIT_DEFINITIONS.find((t) => t.id === id);
  return def ? def.description : '未知特质效果';
}

const allSkills = SKILL_DEFINITIONS;
</script>

<template>
  <div class="battle-overlay">
    <div class="battle-arena">
      <h2>1v1 回合制对战</h2>
      <div class="vs-container">
        <!-- 左蛊 -->
        <div class="gu-card" :class="{ winner: result && result.winnerId === guA.id }">
          <div class="name" style="color: #5dade2;">蛊 #{{ guA.id }} 
            <span class="pers tooltip" :data-tooltip="getPersonalityDescription(guA.personality)">
              ({{ getPersonalityCN(guA.personality) }})
            </span>
          </div>
          <div class="hp-bar">
            <div class="hp-fill" :style="{ width: (guA.hp / guA.maxHp * 100) + '%' }"></div>
          </div>
          <div class="mp-bar">
            <div class="mp-fill" :style="{ width: (guA.mp / getMaxMp(guA) * 100) + '%' }"></div>
          </div>
          <div class="stats">Lv.{{ guA.level }} | ATK {{ guA.atk }} DEF {{ guA.def }} SPD {{ guA.spd }} | MP {{ guA.mp }}/{{ getMaxMp(guA) }}</div>
          <div class="traits">
            <span v-for="t in guA.traits" :key="t.id" class="trait tooltip" :data-tooltip="getTraitDesc(t.id)">
              {{ t.name }} Lv.{{ t.level || 1 }}
            </span>
          </div>
          <div class="skills">
            <span v-for="s in allSkills" :key="s.id" 
                  class="skill tooltip" 
                  :class="{ affordable: (guA.mp || 0) >= s.mpCost }"
                  :data-tooltip="s.description">
              {{ s.name }}(MP{{ s.mpCost }})
            </span>
          </div>
          <div class="skills-note">悬停技能/特质/性格查看详细描述</div>
        </div>

        <div class="vs">VS</div>

        <!-- 右蛊 -->
        <div class="gu-card" :class="{ winner: result && result.winnerId === guB.id }">
          <div class="name" style="color: #e67e22;">蛊 #{{ guB.id }} 
            <span class="pers tooltip" :data-tooltip="getPersonalityDescription(guB.personality)">
              ({{ getPersonalityCN(guB.personality) }})
            </span>
          </div>
          <div class="hp-bar">
            <div class="hp-fill" :style="{ width: (guB.hp / guB.maxHp * 100) + '%' }"></div>
          </div>
          <div class="mp-bar">
            <div class="mp-fill" :style="{ width: (guB.mp / getMaxMp(guB) * 100) + '%' }"></div>
          </div>
          <div class="stats">Lv.{{ guB.level }} | ATK {{ guB.atk }} DEF {{ guB.def }} SPD {{ guB.spd }} | MP {{ guB.mp }}/{{ getMaxMp(guB) }}</div>
          <div class="traits">
            <span v-for="t in guB.traits" :key="t.id" class="trait tooltip" :data-tooltip="getTraitDesc(t.id)">
              {{ t.name }} Lv.{{ t.level || 1 }}
            </span>
          </div>
          <div class="skills">
            <span v-for="s in allSkills" :key="s.id" 
                  class="skill tooltip" 
                  :class="{ affordable: (guB.mp || 0) >= s.mpCost }"
                  :data-tooltip="s.description">
              {{ s.name }}(MP{{ s.mpCost }})
            </span>
          </div>
          <div class="skills-note">悬停技能/特质/性格查看详细描述</div>
        </div>
      </div>

      <!-- 战斗过程 -->
      <div class="battle-log" v-if="combatLogs.length">
        <div v-for="(line, idx) in combatLogs" :key="idx" class="log-line">{{ line }}</div>
      </div>
      <div v-else class="battle-log muted">等待战斗开始...</div>

      <!-- 结果摘要 -->
      <div v-if="result" class="result-summary">
        <strong v-if="result.winnerId" :style="{ color: result.winnerId === guA.id ? '#5dade2' : '#e67e22' }">胜利者：蛊 #{{ result.winnerId }}</strong>
        <strong v-else>平局</strong>
        <div v-if="result.inherited.length">继承特质：{{ result.inherited.join('、') }}</div>
      </div>

      <!-- 操作按钮 -->
      <div class="battle-actions">
        <button v-if="!result && !isResolving" @click="emit('autoBattle')">自动进行对战</button>
        <button v-if="!result && !isResolving" @click="emit('skip')">跳过对战，直接记录结果</button>
        <button v-if="!result && !isResolving" @click="emit('nextRound')">下一步</button>

        <button v-if="result" @click="emit('confirm')" class="primary">确认结果，返回坛子</button>
        <button v-if="!result && isResolving" disabled>战斗中...</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.battle-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.battle-arena {
  width: 90%;
  max-width: 820px;
  background: #1a1a1a;
  border: 2px solid #c0392b;
  border-radius: 12px;
  padding: 20px;
  color: #eee;
}
.vs-container { display: flex; align-items: center; justify-content: space-around; margin: 16px 0; }
.gu-card {
  width: 42%;
  border: 1px solid #444;
  padding: 12px;
  border-radius: 8px;
  background: #111;
}
.gu-card.winner { border-color: #f1c40f; box-shadow: 0 0 12px #f1c40faa; }
.name { font-size: 18px; margin-bottom: 6px; }
.pers { font-size: 12px; color: #888; }
.hp-bar { height: 10px; background: #333; border-radius: 4px; overflow: hidden; margin: 4px 0; }
.hp-fill { height: 100%; background: #e74c3c; transition: width .2s; }
.mp-bar { height: 6px; background: #333; border-radius: 3px; overflow: hidden; margin: 2px 0; }
.mp-fill { height: 100%; background: #3498db; transition: width .2s; }
.stats { font-family: monospace; font-size: 12px; color: #aaa; }
.traits { margin-top: 6px; }
.trait { display: inline-block; font-size: 11px; background: #2c2c2c; padding: 1px 5px; border-radius: 3px; margin-right: 4px; }
.skills-note { font-size: 10px; color: #888; margin-top: 2px; }

.skills {
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}
.skill {
  display: inline-block;
  font-size: 10px;
  background: #1f3a5f;
  padding: 1px 4px;
  border-radius: 3px;
  cursor: help;
  border: 1px solid #3a6aa8;
}
.skill.affordable {
  background: #2e5a2e;
  border-color: #4a8a4a;
}

/* tooltip styles are in global style.css */

.battle-log {
  background: #0a0a0a;
  border: 1px solid #333;
  padding: 10px;
  height: 160px;
  overflow-y: auto;
  font-family: monospace;
  font-size: 12px;
  margin: 12px 0;
  text-align: left;
}
.log-line { margin-bottom: 2px; }
.muted { color: #666; }

.result-summary {
  background: #2a2a1a;
  border: 1px solid #f1c40f;
  padding: 10px;
  margin: 12px 0;
  text-align: center;
}

.battle-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 12px;
}
button {
  padding: 8px 18px;
  border: 1px solid #555;
  background: #222;
  color: #ddd;
  border-radius: 6px;
  cursor: pointer;
}
button.primary { background: #c0392b; border-color: #c0392b; color: white; }
button:disabled { opacity: 0.6; }
</style>
