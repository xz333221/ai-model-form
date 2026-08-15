<template>
  <div class="form-wrap" :style="themeVars">
    <!-- Field: API Endpoint -->
    <div class="field">
      <label class="field-label">
        {{ t('endpoint') }}
        <span class="required">*</span>
      </label>
      <div class="combobox" :class="{ open: endpointOpen, error: errors.endpoint }">
        <div class="combo-input-row">
          <img v-if="selectedProvider" class="field-icon provider-logo" :src="logoUrl(selectedProvider.icon)" :alt="selectedProvider.label" width="16" height="16" @error="$event.target.style.display='none'" />
          <SvgIcon v-else name="globe" :size="15" color="var(--text-dim)" class="field-icon" />
          <input
            ref="endpointInputRef"
            v-model="form.endpoint"
            class="combo-input"
            :placeholder="t('endpointPlaceholder')"
            autocomplete="off"
            @focus="endpointOpen = true"
            @blur="onEndpointBlur"
            @input="filterEndpoints"
            @keydown.enter.prevent="selectEndpointOption(filteredEndpoints[0])"
            @keydown.escape="endpointOpen = false"
            @keydown.tab="endpointOpen = false"
          />
          <button
            v-if="form.endpoint"
            type="button"
            class="combo-clear"
            tabindex="-1"
            @mousedown.prevent="form.endpoint = ''; endpointOpen = false"
          >
            <SvgIcon name="close" :size="12" color="var(--text-dim)" />
          </button>
          <button
            type="button"
            class="combo-arrow"
            tabindex="-1"
            @mousedown.prevent="toggleEndpointDropdown"
          >
            <SvgIcon :name="endpointOpen ? 'chevronUp' : 'chevronDown'" :size="14" color="var(--text-dim)" />
          </button>
        </div>
        <div v-if="endpointOpen && filteredEndpoints.length" class="dropdown">
          <button
            v-for="opt in filteredEndpoints"
            :key="opt.url"
            type="button"
            class="dropdown-item has-logo"
            :class="{ active: form.endpoint === opt.url }"
            @mousedown.prevent="selectEndpointOption(opt)"
          >
            <img class="item-logo" :src="logoUrl(opt.icon)" :alt="opt.label" width="16" height="16" @error="$event.target.style.display='none'" />
            <span class="item-label">{{ opt.label }}</span>
            <span class="item-url">{{ opt.url }}</span>
            <SvgIcon v-if="form.endpoint === opt.url" name="check" :size="13" color="var(--primary)" class="item-check" />
          </button>
        </div>
      </div>
      <span v-if="errors.endpoint" class="field-error">
        <SvgIcon name="alertCircle" :size="12" color="var(--error)" />
        {{ errors.endpoint }}
      </span>
    </div>

    <!-- Field: API Key -->
    <div class="field">
      <label class="field-label">{{ t('apiKey') }}</label>
      <div class="input-wrap">
        <SvgIcon name="key" :size="15" color="var(--text-dim)" class="field-icon" />
        <input
          v-model="form.apiKey"
          :type="showKey ? 'text' : 'password'"
          class="text-input has-two-right"
          :placeholder="t('apiKeyPlaceholder')"
          autocomplete="new-password"
          spellcheck="false"
        />
        <button
          v-show="form.apiKey"
          type="button"
          class="eye-btn"
          style="right: 34px"
          tabindex="-1"
          @click="form.apiKey = ''"
        >
          <SvgIcon name="close" :size="12" color="var(--text-dim)" />
        </button>
        <button
          type="button"
          class="eye-btn"
          tabindex="-1"
          @click="showKey = !showKey"
        >
          <SvgIcon :name="showKey ? 'eyeOff' : 'eye'" :size="15" color="var(--text-dim)" />
        </button>
      </div>
    </div>

    <!-- Field: Model -->
    <div class="field">
      <label class="field-label">
        {{ t('model') }}
        <span class="required">*</span>
      </label>
      <div class="combobox" :class="{ open: modelOpen, error: errors.modelName }">
        <div class="combo-input-row">
          <SvgIcon name="cpu" :size="15" color="var(--text-dim)" class="field-icon" />
          <input
            ref="modelInputRef"
            v-model="form.modelName"
            class="combo-input"
            :placeholder="t('modelPlaceholder')"
            autocomplete="off"
            @focus="onModelFocus"
            @blur="onModelBlur"
            @input="filterModels"
            @keydown.enter.prevent="selectModelOption(filteredModels[0])"
            @keydown.escape="modelOpen = false"
            @keydown.tab="modelOpen = false"
          />
          <button
            v-if="form.modelName"
            type="button"
            class="combo-clear"
            tabindex="-1"
            @mousedown.prevent="form.modelName = ''; modelOpen = false"
          >
            <SvgIcon name="close" :size="12" color="var(--text-dim)" />
          </button>
          <button
            type="button"
            class="combo-arrow"
            tabindex="-1"
            @mousedown.prevent="toggleModelDropdown"
          >
            <SvgIcon :name="modelOpen ? 'chevronUp' : 'chevronDown'" :size="14" color="var(--text-dim)" />
          </button>
        </div>
        <div v-if="modelOpen && filteredModels.length" class="dropdown">
          <div v-if="loadingModels" class="dropdown-loading">
            <SvgIcon name="loader" :size="14" color="var(--text-dim)" class="spin" />
            <span>{{ t('loadingModels') }}</span>
          </div>
          <template v-else>
            <button
              v-for="opt in filteredModels"
              :key="opt.id"
              type="button"
              class="dropdown-item"
              :class="{ active: form.modelName === opt.id }"
              @mousedown.prevent="selectModelOption(opt)"
            >
              <span class="item-label">{{ opt.id }}</span>
              <span v-if="opt.desc" class="item-url">{{ opt.desc }}</span>
              <SvgIcon v-if="form.modelName === opt.id" name="check" :size="13" color="var(--primary)" class="item-check" />
            </button>
          </template>
        </div>
      </div>
      <span v-if="errors.modelName" class="field-error">
        <SvgIcon name="alertCircle" :size="12" color="var(--error)" />
        {{ errors.modelName }}
      </span>
    </div>

    <!-- Field: Display Name -->
    <div class="field">
      <label class="field-label">{{ t('displayName') }}</label>
      <div class="input-wrap">
        <SvgIcon name="tag" :size="15" color="var(--text-dim)" class="field-icon" />
        <input
          v-model="form.displayName"
          class="text-input"
          :placeholder="t('displayNamePlaceholder')"
          autocomplete="off"
        />
        <button
          v-show="form.displayName"
          type="button"
          class="eye-btn"
          tabindex="-1"
          @click="form.displayName = ''"
        >
          <SvgIcon name="close" :size="12" color="var(--text-dim)" />
        </button>
      </div>
    </div>

    <!-- Test Result Banner -->
    <Transition name="banner">
      <div v-if="testResult" class="test-banner" :class="testResult.ok ? 'ok' : 'fail'">
        <SvgIcon :name="testResult.ok ? 'checkCircle' : 'xCircle'" :size="15" :color="testResult.ok ? 'var(--success)' : 'var(--error)'" />
        <span>{{ testResult.message }}</span>
      </div>
    </Transition>

    <!-- Actions -->
    <div class="actions">
      <button type="button" class="btn btn-ghost" @click="emit('cancel')">{{ t('cancel') }}</button>
      <div class="actions-right">
        <button type="button" class="btn btn-outline" :disabled="testing" @click="handleTest">
          <SvgIcon v-if="testing" name="loader" :size="14" color="currentColor" class="spin" />
          <SvgIcon v-else name="zap" :size="14" color="currentColor" />
          {{ testing ? t('testing') : t('test') }}
        </button>
        <button type="button" class="btn btn-primary" :disabled="saving" @click="handleSave">
          <SvgIcon v-if="saving" name="loader" :size="14" color="currentColor" class="spin" />
          <SvgIcon v-else name="check" :size="14" color="currentColor" />
          {{ saving ? t('saving') : t('save') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import SvgIcon from '../icons/SvgIcon.vue';
import { useI18n, resolveLocale, SUPPORTED_LOCALES, DEFAULT_LOCALE } from '../i18n/useI18n.js';

const props = defineProps({
  /** Base URL for the API middleware, e.g. '/api/ai-model' */
  apiBase: { type: String, default: '/api/ai-model' },
  /** Pre-fill values for editing an existing model */
  initial: { type: Object, default: null },
  /** Current theme: 'dark' | 'light' */
  theme: { type: String, default: 'dark' },
  /**
   * UI language: 'zh-CN' | 'en-US'.
   * Falls back to 'zh-CN' for unsupported values.
   */
  locale: {
    type: String,
    default: DEFAULT_LOCALE,
    validator: (v) => SUPPORTED_LOCALES.includes(v) || v == null || v === '',
  },
});

const localeRef = computed(() => resolveLocale(props.locale));
const { t } = useI18n(localeRef);

// ===== Theme CSS variables =====
const DARK_VARS = {
  '--bg':           '#0F172A',
  '--bg-surface':   '#1E293B',
  '--bg-elevated':  '#293548',
  '--border':       '#334155',
  '--border-focus': '#3B82F6',
  '--primary':      '#3B82F6',
  '--primary-hover':'#2563EB',
  '--primary-dim':  'rgba(59,130,246,.12)',
  '--success':      '#10B981',
  '--success-dim':  'rgba(16,185,129,.12)',
  '--error':        '#EF4444',
  '--error-dim':    'rgba(239,68,68,.12)',
  '--warning':      '#F59E0B',
  '--text':         '#E2E8F0',
  '--text-dim':     '#94A3B8',
  '--text-muted':   '#475569',
  '--font':         "'Inter', system-ui, -apple-system, sans-serif",
  '--radius':       '8px',
  '--radius-lg':    '12px',
  '--t':            '150ms ease',
};
const LIGHT_VARS = {
  '--bg':           '#F8FAFC',
  '--bg-surface':   '#FFFFFF',
  '--bg-elevated':  '#F1F5F9',
  '--border':       '#E2E8F0',
  '--border-focus': '#2563EB',
  '--primary':      '#2563EB',
  '--primary-hover':'#1D4ED8',
  '--primary-dim':  'rgba(37,99,235,.1)',
  '--success':      '#059669',
  '--success-dim':  'rgba(5,150,105,.1)',
  '--error':        '#DC2626',
  '--error-dim':    'rgba(220,38,38,.1)',
  '--warning':      '#D97706',
  '--text':         '#0F172A',
  '--text-dim':     '#475569',
  '--text-muted':   '#94A3B8',
  '--font':         "'Inter', system-ui, -apple-system, sans-serif",
  '--radius':       '8px',
  '--radius-lg':    '12px',
  '--t':            '150ms ease',
};
const themeVars = computed(() => props.theme === 'light' ? LIGHT_VARS : DARK_VARS);

// ===== Provider logos =====
const LOGO_CDN = 'https://cdn.jsdelivr.net/npm/@lobehub/icons-static-png';
// Official Agnes logo (PNG, base64) - the @lobehub icon pack has no agnes icon (404)
const AGNES_LOGO = 'data:image/png;base64,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';
function logoUrl(icon) {
  // Providers absent from the @lobehub icon pack use an inline SVG
  if (icon === 'agnes') return AGNES_LOGO;
  // Color icons (-color suffix) look good on any background; use dark/ folder
  if (icon.endsWith('-color')) return `${LOGO_CDN}/dark/${icon}.png`;
  // Mono icons: switch dark/light folder with theme
  return `${LOGO_CDN}/${props.theme}/${icon}.png`;
}

const emit = defineEmits(['save', 'cancel', 'test-success', 'test-fail']);

// ===== State =====

const form = ref({
  endpoint: props.initial?.endpoint ?? '',
  modelName: props.initial?.modelName ?? '',
  displayName: props.initial?.displayName ?? '',
  apiKey: props.initial?.apiKey ?? '',
});

const errors = ref({ endpoint: '', modelName: '' });
const showKey = ref(false);
const saving = ref(false);
const testing = ref(false);
const testResult = ref(null);

// Endpoint combobox
const endpointOpen = ref(false);
const endpointInputRef = ref(null);
const endpointQuery = ref('');

// Model combobox
const modelOpen = ref(false);
const modelInputRef = ref(null);
const modelQuery = ref('');
const loadingModels = ref(false);
const fetchedModels = ref([]);

// ===== Static provider list =====

const providers = [
  { id: 'openai',     url: 'https://api.openai.com/v1',                                 icon: 'openai' },
  { id: 'anthropic',  url: 'https://api.anthropic.com/v1',                             icon: 'claude-color' },
  { id: 'deepseek',   url: 'https://api.deepseek.com/v1',                               icon: 'deepseek-color' },
  { id: 'gemini',     url: 'https://generativelanguage.googleapis.com/v1beta/openai',   icon: 'gemini-color' },
  { id: 'xai',        url: 'https://api.x.ai/v1',                                       icon: 'grok' },
  { id: 'meta',       url: 'https://api.llama-api.com/v1',                              icon: 'meta-color' },
  { id: 'mistral',    url: 'https://api.mistral.ai/v1',                                 icon: 'mistral-color' },
  { id: 'minimax',    url: 'https://api.minimaxi.com/v1',                               icon: 'minimax-color' },
  { id: 'moonshot',   url: 'https://api.moonshot.cn/v1',                                icon: 'kimi-color' },
  { id: 'zhipu',      url: 'https://open.bigmodel.cn/api/paas/v4',                      icon: 'zhipu-color' },
  { id: 'qwen',       url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',         icon: 'qwen-color' },
  { id: 'cohere',     url: 'https://api.cohere.com/v2',                                  icon: 'cohere-color' },
  { id: 'groq',       url: 'https://api.groq.com/openai/v1',                            icon: 'groq' },
  { id: 'together',   url: 'https://api.together.xyz/v1',                               icon: 'together-color' },
  { id: 'openrouter', url: 'https://openrouter.ai/api/v1',                              icon: 'openrouter' },
  { id: 'agnes',      url: 'https://apihub.agnes-ai.com/v1',                            icon: 'agnes' },
  { id: 'ollama',     url: 'http://localhost:11434/v1',                                  icon: 'ollama' },
];

const localizedProviders = computed(() =>
  providers.map(p => ({ ...p, label: t(`provider.${p.id}`) }))
);

const selectedProvider = computed(() => localizedProviders.value.find(p => p.url === form.value.endpoint));

const filteredEndpoints = computed(() => {
  const list = localizedProviders.value;
  const q = endpointQuery.value.toLowerCase();
  if (!q) return list;
  return list.filter(p =>
    p.label.toLowerCase().includes(q) || p.url.toLowerCase().includes(q)
  );
});

function filterEndpoints() {
  endpointQuery.value = form.value.endpoint;
  endpointOpen.value = true;
  testResult.value = null;
}

function toggleEndpointDropdown() {
  endpointOpen.value = !endpointOpen.value;
  if (endpointOpen.value) endpointInputRef.value?.focus();
}

function selectEndpointOption(opt) {
  if (!opt) return;
  form.value.endpoint = opt.url;
  endpointQuery.value = opt.url;
  endpointOpen.value = false;
  errors.value.endpoint = '';
  testResult.value = null;
  // auto-fetch models for known provider
  fetchModelsForEndpoint(opt.url);
}

function onEndpointBlur() {
  setTimeout(() => { endpointOpen.value = false; }, 150);
}

// ===== Model combobox =====

const filteredModels = computed(() => {
  const q = modelQuery.value.toLowerCase();
  if (!q) return fetchedModels.value;
  return fetchedModels.value.filter(m =>
    m.id.toLowerCase().includes(q) || (m.desc || '').toLowerCase().includes(q)
  );
});

function filterModels() {
  modelQuery.value = form.value.modelName;
  modelOpen.value = true;
  testResult.value = null;
}

function toggleModelDropdown() {
  modelOpen.value = !modelOpen.value;
  if (modelOpen.value) {
    modelInputRef.value?.focus();
    if (!fetchedModels.value.length && form.value.endpoint) {
      fetchModelsForEndpoint(form.value.endpoint);
    }
  }
}

function selectModelOption(opt) {
  if (!opt) return;
  form.value.modelName = opt.id;
  modelQuery.value = opt.id;
  modelOpen.value = false;
  errors.value.modelName = '';
  testResult.value = null;
}

function onModelFocus() {
  modelOpen.value = true;
  if (!fetchedModels.value.length && form.value.endpoint) {
    fetchModelsForEndpoint(form.value.endpoint);
  }
}

function onModelBlur() {
  setTimeout(() => { modelOpen.value = false; }, 150);
}

async function fetchModelsForEndpoint(endpoint) {
  if (!endpoint) return;
  loadingModels.value = true;
  try {
    const headers = {};
    const key = form.value.apiKey.trim();
    if (key) headers['x-api-key'] = key;

    const res = await fetch(
      `${props.apiBase}/models?endpoint=${encodeURIComponent(endpoint)}`,
      { headers }
    );
    if (res.ok) {
      const data = await res.json();
      fetchedModels.value = (data.models || []).map(m =>
        typeof m === 'string' ? { id: m } : m
      );
    }
  } catch {
    // network error — silently ignore, user can type manually
  } finally {
    loadingModels.value = false;
  }
}

// Sync form when `initial` prop changes (e.g. switching between edit targets)
watch(() => props.initial, (val) => {
  form.value = {
    endpoint:    val?.endpoint    ?? '',
    modelName:   val?.modelName   ?? '',
    displayName: val?.displayName ?? '',
    apiKey:      val?.apiKey      ?? '',
  };
  errors.value = { endpoint: '', modelName: '' };
  testResult.value = null;
  endpointQuery.value = '';
  modelQuery.value = '';
  fetchedModels.value = [];
});

// Re-fetch model list when API Key is filled in (enables live model list)
watch(() => form.value.apiKey, (newKey, oldKey) => {
  const hadKey = oldKey && oldKey.trim().length > 0;
  const hasKey = newKey && newKey.trim().length > 0;
  // Only refresh when key transitions from empty→filled or filled→empty
  if (hadKey !== hasKey && form.value.endpoint) {
    fetchModelsForEndpoint(form.value.endpoint);
  }
});

// ===== Validation =====

function validate() {
  errors.value = { endpoint: '', modelName: '' };
  let ok = true;
  if (!form.value.endpoint.trim()) {
    errors.value.endpoint = t('errEndpointRequired');
    ok = false;
  }
  if (!form.value.modelName.trim()) {
    errors.value.modelName = t('errModelRequired');
    ok = false;
  }
  return ok;
}

// ===== Actions =====

async function handleTest() {
  if (!validate()) return;
  testing.value = true;
  testResult.value = null;
  try {
    const res = await fetch(`${props.apiBase}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: form.value.endpoint,
        modelName: form.value.modelName,
        apiKey: form.value.apiKey,
      }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      testResult.value = { ok: true, message: data.message || t('okDefault') };
      emit('test-success', data);
    } else {
      testResult.value = { ok: false, message: data.message || t('failDefault') };
      emit('test-fail', data);
    }
  } catch (e) {
    testResult.value = { ok: false, message: `${t('networkError')}: ${e.message}` };
    emit('test-fail', { message: e.message });
  } finally {
    testing.value = false;
  }
}

async function handleSave() {
  if (!validate()) return;
  saving.value = true;
  try {
    const payload = {
      endpoint: form.value.endpoint.trim(),
      modelName: form.value.modelName.trim(),
      displayName: form.value.displayName.trim() || form.value.modelName.trim(),
      apiKey: form.value.apiKey,
    };
    const res = await fetch(`${props.apiBase}/models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok) {
      emit('save', { ...payload, id: data.id });
    } else {
      testResult.value = { ok: false, message: data.message || t('saveFailDefault') };
    }
  } catch (e) {
    testResult.value = { ok: false, message: `${t('networkError')}: ${e.message}` };
  } finally {
    saving.value = false;
  }
}

// clear testResult when form changes
watch(() => [form.value.endpoint, form.value.modelName, form.value.apiKey], () => {
  testResult.value = null;
});
</script>

<style scoped>
/* ===== Layout ===== */
.form-wrap {
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 100%;
}

/* ===== Field ===== */
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 4px;
}

.required {
  color: var(--error);
  font-size: 12px;
}

/* ===== Text Input ===== */
.input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.field-icon {
  position: absolute;
  left: 10px;
  pointer-events: none;
  flex-shrink: 0;
}

.text-input {
  width: 100%;
  height: 38px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  font-family: var(--font);
  font-size: 13.5px;
  padding: 0 36px 0 34px;
  outline: none;
  transition: border-color var(--t), box-shadow var(--t);
}

.text-input::placeholder {
  color: var(--text-muted);
}

.text-input:focus {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px var(--primary-dim);
}

.eye-btn {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  color: var(--text-dim);
  border-radius: 4px;
  transition: color var(--t);
}

.eye-btn:hover {
  color: var(--text);
}

/* ===== Combobox ===== */
.combobox {
  position: relative;
}

.combo-input-row {
  display: flex;
  align-items: center;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  transition: border-color var(--t), box-shadow var(--t);
}

.combobox.open .combo-input-row,
.combo-input-row:focus-within {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px var(--primary-dim);
}

.combobox.error .combo-input-row {
  border-color: var(--error);
}

.combo-input {
  flex: 1;
  height: 38px;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text);
  font-family: var(--font);
  font-size: 13.5px;
  padding: 0 4px 0 34px;
}

.combo-input::placeholder {
  color: var(--text-muted);
}

.combo-arrow {
  background: none;
  border: none;
  padding: 0 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  height: 38px;
  color: var(--text-dim);
  transition: color var(--t);
  border-radius: 0 var(--radius) var(--radius) 0;
}

.combo-arrow:hover {
  color: var(--text);
}

.combo-clear {
  background: none;
  border: none;
  padding: 0 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  height: 38px;
  color: var(--text-dim);
  transition: color var(--t);
  flex-shrink: 0;
}

.combo-clear:hover {
  color: var(--text);
}

.text-input.has-two-right {
  padding-right: 68px;
}

/* ===== Dropdown ===== */
.dropdown {
  position: absolute;
  z-index: 200;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 8px 24px rgba(0, 0, 0, .45);
  max-height: 220px;
  overflow-y: auto;
  padding: 4px;
}

.dropdown-item {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  transition: background var(--t);
}

.dropdown-item.has-logo {
  grid-template-columns: 20px 1fr auto auto;
}

.dropdown-item:hover {
  background: var(--bg-surface);
}

.dropdown-item.active {
  background: var(--primary-dim);
}

.item-label {
  font-size: 13px;
  color: var(--text);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-url {
  font-size: 11.5px;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-check {
  flex-shrink: 0;
}

.item-logo {
  width: 16px;
  height: 16px;
  object-fit: contain;
  flex-shrink: 0;
  border-radius: 3px;
}

.provider-logo {
  width: 15px;
  height: 15px;
  object-fit: contain;
  pointer-events: none;
}

.dropdown-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  color: var(--text-dim);
  font-size: 13px;
}

/* ===== Error ===== */
.field-error {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--error);
}

/* ===== Test Banner ===== */
.test-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: var(--radius);
  font-size: 13px;
  font-weight: 500;
}

.test-banner.ok {
  background: var(--success-dim);
  color: var(--success);
  border: 1px solid rgba(16, 185, 129, .25);
}

.test-banner.fail {
  background: var(--error-dim);
  color: var(--error);
  border: 1px solid rgba(239, 68, 68, .25);
}

/* ===== Actions ===== */
.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 4px;
}

.actions-right {
  display: flex;
  gap: 10px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 16px;
  border-radius: var(--radius);
  border: 1px solid transparent;
  font-family: var(--font);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--t), border-color var(--t), opacity var(--t), box-shadow var(--t);
  white-space: nowrap;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-ghost {
  background: none;
  color: var(--text-dim);
  border-color: transparent;
}

.btn-ghost:hover:not(:disabled) {
  color: var(--text);
  background: var(--bg-elevated);
}

.btn-outline {
  background: none;
  color: var(--text);
  border-color: var(--border);
}

.btn-outline:hover:not(:disabled) {
  border-color: var(--border-focus);
  background: var(--primary-dim);
  color: var(--primary);
}

.btn-primary {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-hover);
  border-color: var(--primary-hover);
  box-shadow: 0 0 0 3px var(--primary-dim);
}

/* ===== Animations ===== */
.banner-enter-active,
.banner-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}

.banner-enter-from,
.banner-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.spin {
  animation: spin 0.8s linear infinite;
}
</style>
