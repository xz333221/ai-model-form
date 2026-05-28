<template>
  <div class="page">
    <header class="header">
      <div class="header-inner">
        <div class="logo">
          <SvgIcon name="cpu" :size="22" color="var(--primary)" />
          <span class="logo-text">AI Model Form</span>
          <span class="logo-badge">Demo</span>
        </div>
        <nav class="header-nav">
          <button type="button" class="theme-btn" :title="isDark ? '切换到亮色模式' : '切换到暗色模式'" @click="toggleTheme">
            <SvgIcon :name="isDark ? 'sun' : 'moon'" :size="16" color="currentColor" />
          </button>
          <a href="https://github.com/xz333221/ai-model-form" target="_blank" rel="noopener" class="nav-link">
            <SvgIcon name="link" :size="14" color="currentColor" />
            GitHub
          </a>
        </nav>
      </div>
    </header>

    <main class="main">
      <div class="hero">
        <h1 class="hero-title">添加 AI 模型</h1>
        <p class="hero-desc">
          配置 OpenAI 兼容接口、模型名称及 API Key，支持 OpenAI、DeepSeek、MiniMax 等主流服务商。
        </p>
      </div>

      <div class="card">
        <div class="card-header">
          <SvgIcon name="settings" :size="16" color="var(--text-dim)" />
          <span>添加模型</span>
        </div>
        <div class="card-body">
          <AddModelForm
            api-base="/api/ai-model"
            :theme="isDark ? 'dark' : 'light'"
            @save="onSave"
            @cancel="onCancel"
            @test-success="onTestSuccess"
            @test-fail="onTestFail"
          />
        </div>
      </div>

      <!-- Saved Models -->
      <div v-if="savedModels.length" class="section">
        <h2 class="section-title">
          <SvgIcon name="list" :size="15" color="var(--text-dim)" />
          已保存的模型 ({{ savedModels.length }})
        </h2>
        <div class="model-list">
          <div v-for="m in savedModels" :key="m.id" class="model-item">
            <div class="model-icon">
              <SvgIcon name="zap" :size="16" color="var(--primary)" />
            </div>
            <div class="model-info">
              <div class="model-name">{{ m.displayName || m.modelName }}</div>
              <div class="model-meta">
                <span>{{ m.modelName }}</span>
                <span class="dot"></span>
                <span>{{ m.endpoint }}</span>
              </div>
            </div>
            <button class="btn-icon-sm" title="删除" @click="removeModel(m.id)">
              <SvgIcon name="trash" :size="14" color="var(--text-muted)" />
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import AddModelForm from './components/AddModelForm.vue';
import SvgIcon from './icons/SvgIcon.vue';

// ===== Theme =====
const isDark = ref(true);

function applyTheme(dark) {
  isDark.value = dark;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  localStorage.setItem('ai-model-form-theme', dark ? 'dark' : 'light');
}

function toggleTheme() {
  applyTheme(!isDark.value);
}

onMounted(() => {
  const saved = localStorage.getItem('ai-model-form-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved ? saved === 'dark' : prefersDark);
});

// ===== Models =====
const savedModels = ref([]);

function onSave(model) {
  savedModels.value.unshift({ ...model, id: model.id ?? Date.now() });
}

function onCancel() {
  // In a real app, close the modal or navigate away
}

function onTestSuccess(data) {
  console.log('[test-success]', data);
}

function onTestFail(data) {
  console.log('[test-fail]', data);
}

function removeModel(id) {
  savedModels.value = savedModels.value.filter(m => m.id !== id);
}
</script>

<style scoped>
/* ===== Page ===== */
.page {
  min-height: 100vh;
  background: var(--bg);
  display: flex;
  flex-direction: column;
}

/* ===== Header ===== */
.header {
  border-bottom: 1px solid var(--border);
  background: rgba(15, 23, 42, .85);
  backdrop-filter: blur(12px);
  position: sticky;
  top: 0;
  z-index: 100;
  transition: background var(--t), border-color var(--t);
}

:global([data-theme="light"]) .header {
  background: rgba(248, 250, 252, .88);
}

.header-inner {
  max-width: 860px;
  margin: 0 auto;
  padding: 0 24px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-text {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -.2px;
}

.logo-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 20px;
  background: var(--primary-dim);
  color: var(--primary);
  letter-spacing: .3px;
  text-transform: uppercase;
}

.header-nav {
  display: flex;
  gap: 4px;
}

.nav-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: var(--radius);
  font-size: 13px;
  color: var(--text-dim);
  text-decoration: none;
  transition: color var(--t), background var(--t);
}

.nav-link:hover {
  color: var(--text);
  background: var(--bg-elevated);
}

.theme-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: none;
  cursor: pointer;
  color: var(--text-dim);
  transition: color var(--t), background var(--t), border-color var(--t);
}

.theme-btn:hover {
  color: var(--text);
  background: var(--bg-elevated);
}

/* ===== Main ===== */
.main {
  flex: 1;
  max-width: 560px;
  margin: 0 auto;
  padding: 48px 24px 80px;
  width: 100%;
}

/* ===== Hero ===== */
.hero {
  margin-bottom: 32px;
}

.hero-title {
  font-size: 26px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 8px;
  letter-spacing: -.4px;
  line-height: 1.3;
}

.hero-desc {
  font-size: 14px;
  color: var(--text-dim);
  line-height: 1.6;
}

/* ===== Card ===== */
.card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  background: rgba(255, 255, 255, .02);
}

.card-body {
  padding: 24px 20px;
}

/* ===== Section ===== */
.section {
  margin-top: 32px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: .5px;
}

/* ===== Model List ===== */
.model-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-item {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 14px;
  transition: border-color var(--t);
}

.model-item:hover {
  border-color: var(--border-focus);
}

.model-icon {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: var(--primary-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.model-info {
  flex: 1;
  min-width: 0;
}

.model-name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-dim);
  margin-top: 2px;
}

.dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--text-muted);
  flex-shrink: 0;
}

.btn-icon-sm {
  background: none;
  border: none;
  padding: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  border-radius: 6px;
  transition: background var(--t), color var(--t);
}

.btn-icon-sm:hover {
  background: var(--error-dim);
  color: var(--error);
}
</style>
