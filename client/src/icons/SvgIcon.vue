<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    :stroke="color || 'currentColor'"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    :class="['svg-icon', className]"
    :style="style"
    aria-hidden="true"
  >
    <path
      v-for="(d, i) in paths"
      :key="i"
      :d="d"
    />
  </svg>
</template>

<script setup>
import { computed } from 'vue';
import { icons } from './index.js';

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 16 },
  color: { type: String, default: null },
  strokeWidth: { type: [Number, String], default: 1.75 },
  className: { type: String, default: '' },
  style: { type: [String, Object], default: null },
});

const paths = computed(() => icons[props.name] ?? ['M12 12m-1 0a1 1 0 1 0 2 0 1 1 0 0 0-2 0']);
</script>

<style scoped>
.svg-icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>
