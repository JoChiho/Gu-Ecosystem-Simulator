<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import type { JarState } from '../core/types';
import { CanvasRenderer } from '../rendering/canvasRenderer';

const props = defineProps<{
  snapshot: JarState | null;
  /** 世界坐标尺寸（来自 WORLD），用于正确映射坐标与拟合显示 */
  worldWidth?: number;
  worldHeight?: number;
  /** 旧版兼容 */
  width?: number;
  height?: number;
}>();

const emit = defineEmits<{
  (e: 'select', guId: number | null): void;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let renderer: CanvasRenderer | null = null;

const worldW = computed(() => props.worldWidth ?? props.width ?? 900);
const worldH = computed(() => props.worldHeight ?? props.height ?? 650);

// 目标最大显示尺寸（无论世界多大，都尽量完整显示）
const MAX_DISP_W = 960;
const MAX_DISP_H = 700;

const display = computed(() => {
  const ww = worldW.value;
  const wh = worldH.value;
  const s = Math.min(MAX_DISP_W / ww, MAX_DISP_H / wh, 1);
  return {
    dispW: Math.max(200, Math.round(ww * s)),
    dispH: Math.max(150, Math.round(wh * s)),
    logicalW: ww,
    logicalH: wh,
  };
});

function initRenderer() {
  if (!canvasRef.value) return;
  renderer = new CanvasRenderer(canvasRef.value, display.value.logicalW, display.value.logicalH);
}

function draw() {
  if (!renderer || !props.snapshot) return;
  renderer.render(props.snapshot, {
    selectedGuId: null,
    showFightLines: true,
  });
}

function onClick(e: MouseEvent) {
  if (!renderer || !props.snapshot || !canvasRef.value) return;
  const rect = canvasRef.value.getBoundingClientRect();
  // 从 CSS 显示像素 映射回世界坐标
  const ww = display.value.logicalW;
  const wh = display.value.logicalH;
  const x = ((e.clientX - rect.left) / rect.width) * ww;
  const y = ((e.clientY - rect.top) / rect.height) * wh;
  const id = renderer.hitTest(props.snapshot, x, y);
  emit('select', id);
}

onMounted(() => {
  initRenderer();
  draw();
});

watch(() => props.snapshot, () => {
  draw();
}, { deep: true });

// 支持世界尺寸变化时重新初始化渲染器（编辑 balance 后热更新）
watch(() => [props.worldWidth, props.worldHeight, props.width, props.height], () => {
  if (canvasRef.value) {
    renderer = null;
    initRenderer();
    draw();
  }
}, { deep: true });

onUnmounted(() => {
  renderer = null;
});
</script>

<template>
  <canvas
    ref="canvasRef"
    :width="display.logicalW"
    :height="display.logicalH"
    @click="onClick"
    :style="{
      width: display.dispW + 'px',
      height: display.dispH + 'px',
      cursor: 'crosshair',
      background: '#111',
      display: 'block',
      borderRadius: '4px'
    }"
  />
</template>
