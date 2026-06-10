<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import type { JarState } from '../core/types';
import { CanvasRenderer } from '../rendering/canvasRenderer';

const props = defineProps<{
  snapshot: JarState | null;
  width?: number;
  height?: number;
}>();

const emit = defineEmits<{
  (e: 'select', guId: number | null): void;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let renderer: CanvasRenderer | null = null;

function initRenderer() {
  if (!canvasRef.value) return;
  const w = props.width ?? 900;
  const h = props.height ?? 650;
  renderer = new CanvasRenderer(canvasRef.value, w, h);
}

function draw() {
  if (!renderer || !props.snapshot) return;
  renderer.render(props.snapshot, {
    selectedGuId: null, // 父组件可扩展传入
    showFightLines: true,
  });
}

function onClick(e: MouseEvent) {
  if (!renderer || !props.snapshot || !canvasRef.value) return;
  const rect = canvasRef.value.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * (props.width ?? 900);
  const y = ((e.clientY - rect.top) / rect.height) * (props.height ?? 650);
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

onUnmounted(() => {
  renderer = null;
});
</script>

<template>
  <canvas
    ref="canvasRef"
    :width="width ?? 900"
    :height="height ?? 650"
    @click="onClick"
    style="cursor: crosshair; background: #111; display: block;"
  />
</template>
