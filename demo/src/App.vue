<script setup>
import { ref, computed } from 'vue'
import { AddModelForm, SvgIcon, icons } from 'ai-model-form/client'
import 'ai-model-form/dist/ai-model-form.css'

// === Props（可改） ===
const apiBase = ref('/api/ai-model')
const theme = ref('dark')
const locale = ref('zh-CN')
const useInitial = ref(false)
const initial = ref({
  endpoint: 'https://api.openai.com/v1',
  modelName: 'gpt-4o-mini',
  displayName: '',
  apiKey: ''
})

const initialJson = computed({
  get: () => JSON.stringify(initial.value, null, 2),
  set: (v) => {
    try {
      const obj = JSON.parse(v)
      if (obj && typeof obj === 'object') initial.value = obj
    } catch (_) {
      // ignore parse error while editing
    }
  }
})

// === Event toggles（可关） ===
const listenSave = ref(true)
const listenCancel = ref(true)
const listenTestSuccess = ref(true)
const listenTestFail = ref(true)

function onSave(model) {
  if (!listenSave.value) return
  events.value.unshift({ name: 'save', payload: model, at: now() })
  trim()
  refreshSaved()
}
function onCancel() {
  if (!listenCancel.value) return
  events.value.unshift({ name: 'cancel', payload: null, at: now() })
  trim()
}
function onTestSuccess(result) {
  if (!listenTestSuccess.value) return
  events.value.unshift({ name: 'test-success', payload: result, at: now() })
  trim()
}
function onTestFail(result) {
  if (!listenTestFail.value) return
  events.value.unshift({ name: 'test-fail', payload: result, at: now() })
  trim()
}

// === Event log ===
const events = ref([])
function now() { return new Date().toLocaleTimeString() }
function trim() { if (events.value.length > 20) events.value.pop() }

// === Saved models ===
const savedModels = ref([])
async function refreshSaved() {
  try {
    const res = await fetch(`${apiBase.value}/models/saved`)
    const data = await res.json()
    savedModels.value = data.models || []
  } catch (e) {
    events.value.unshift({ name: 'fetch-saved-error', payload: { message: e.message }, at: now() })
    trim()
  }
}
async function deleteSaved(id) {
  await fetch(`${apiBase.value}/models/${id}`, { method: 'DELETE' })
  refreshSaved()
}

// === Icon preview ===
const iconNames = Object.keys(icons)
</script>

<template>
  <main class="demo">
    <header>
      <h1>ai-model-form demo</h1>
      <p>引用 <code>ai-model-form@latest</code>，下面所有控件都是组件的属性和事件，改完即时生效。</p>
    </header>

    <section class="grid">
      <!-- Props panel -->
      <div class="panel">
        <h2>Props</h2>

        <label class="row">
          <span class="k">apiBase</span>
          <input v-model="apiBase" placeholder="/api/ai-model" />
        </label>

        <label class="row">
          <span class="k">theme</span>
          <select v-model="theme">
            <option value="dark">dark</option>
            <option value="light">light</option>
          </select>
        </label>

        <label class="row">
          <span class="k">locale</span>
          <select v-model="locale">
            <option value="zh-CN">zh-CN</option>
            <option value="en-US">en-US</option>
          </select>
        </label>

        <label class="row check">
          <input type="checkbox" v-model="useInitial" />
          <span class="k">使用 initial（编辑场景）</span>
        </label>

        <label class="col" v-if="useInitial">
          <span class="k">initial（JSON）</span>
          <textarea v-model="initialJson" rows="6" spellcheck="false"></textarea>
        </label>
      </div>

      <!-- Events panel -->
      <div class="panel">
        <h2>Events</h2>
        <label class="row check"><input type="checkbox" v-model="listenSave" /> <span class="k">save</span></label>
        <label class="row check"><input type="checkbox" v-model="listenCancel" /> <span class="k">cancel</span></label>
        <label class="row check"><input type="checkbox" v-model="listenTestSuccess" /> <span class="k">test-success</span></label>
        <label class="row check"><input type="checkbox" v-model="listenTestFail" /> <span class="k">test-fail</span></label>

        <div class="hint">
          取消勾选后，对应事件不再写进日志。
        </div>
      </div>
    </section>

    <section class="form-wrap">
      <AddModelForm
        :api-base="apiBase"
        :theme="theme"
        :locale="locale"
        :initial="useInitial ? initial : null"
        @save="onSave"
        @cancel="onCancel"
        @test-success="onTestSuccess"
        @test-fail="onTestFail"
      />
    </section>

    <section class="panel">
      <h2>事件日志 <button class="mini" @click="events = []">清空</button></h2>
      <p v-if="!events.length" class="empty">尚未触发事件</p>
      <ul v-else>
        <li v-for="(e, i) in events" :key="i">
          <span class="ts">{{ e.at }}</span>
          <span class="name">{{ e.name }}</span>
          <pre>{{ e.payload == null ? '—' : JSON.stringify(e.payload, null, 2) }}</pre>
        </li>
      </ul>
    </section>

    <section class="panel">
      <h2>
        已保存的模型
        <button class="mini" @click="refreshSaved">刷新</button>
      </h2>
      <p v-if="!savedModels.length" class="empty">暂无</p>
      <ul v-else>
        <li v-for="m in savedModels" :key="m.id">
          <div class="row top">
            <strong>{{ m.displayName || m.modelName }}</strong>
            <code>{{ m.modelName }}</code>
            <button class="mini danger" @click="deleteSaved(m.id)">删除</button>
          </div>
          <span class="endpoint">{{ m.endpoint }}</span>
        </li>
      </ul>
    </section>

    <section class="panel">
      <h2>Icons（来自 <code>ai-model-form/client</code>）</h2>
      <p class="empty" v-if="!iconNames.length">未发现图标</p>
      <div class="icons">
        <div v-for="name in iconNames" :key="name" class="icon">
          <SvgIcon :name="name" :size="22" />
          <span>{{ name }}</span>
        </div>
      </div>
    </section>
  </main>
</template>

<style>
html, body, #app {
  margin: 0;
  padding: 0;
  min-height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #0F172A;
  color: #E2E8F0;
}

.demo {
  max-width: 1180px;
  margin: 0 auto;
  padding: 32px 24px 80px;
}

header h1 { margin: 0 0 8px; font-size: 28px; }
header p { margin: 0 0 24px; color: #94A3B8; }
header code { background: #1E293B; padding: 2px 6px; border-radius: 4px; color: #93C5FD; }

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

@media (max-width: 800px) {
  .grid { grid-template-columns: 1fr; }
}

.panel {
  background: #1E293B;
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 20px;
}

.panel h2 {
  margin: 0 0 12px;
  font-size: 16px;
  color: #93C5FD;
  display: flex;
  align-items: center;
  gap: 8px;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.row.top { justify-content: space-between; }
.row.check { cursor: pointer; }

.col {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
}

.k {
  color: #CBD5E1;
  font-size: 13px;
  min-width: 90px;
}

input[type="text"], input:not([type]), select, textarea {
  background: #0F172A;
  border: 1px solid #334155;
  border-radius: 6px;
  color: #E2E8F0;
  padding: 6px 10px;
  font-size: 13px;
  font-family: inherit;
  flex: 1;
}
input:focus, select:focus, textarea:focus {
  outline: none;
  border-color: #3B82F6;
}
textarea {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  resize: vertical;
}

.hint { color: #64748B; font-size: 12px; margin-top: 8px; }

button.mini {
  background: #293548;
  border: 1px solid #334155;
  color: #E2E8F0;
  border-radius: 6px;
  padding: 2px 10px;
  font-size: 12px;
  cursor: pointer;
}
button.mini:hover { background: #334155; }
button.mini.danger { color: #FCA5A5; border-color: #7F1D1D; }
button.mini.danger:hover { background: #7F1D1D; color: #fff; }

.form-wrap { margin-bottom: 24px; }

.empty { color: #64748B; font-style: italic; margin: 0; }

ul { list-style: none; padding: 0; margin: 0; }
li { padding: 8px 0; border-bottom: 1px solid #293548; font-size: 13px; }
li:last-child { border-bottom: 0; }

.ts { color: #64748B; margin-right: 8px; }
.name {
  display: inline-block;
  min-width: 110px;
  color: #10B981;
  font-weight: 600;
  margin-right: 8px;
}

pre {
  margin: 4px 0 0;
  font-size: 12px;
  color: #CBD5E1;
  white-space: pre-wrap;
  word-break: break-all;
}

.endpoint { display: block; color: #94A3B8; font-size: 12px; margin-top: 4px; }

.icons {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}
.icon {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #0F172A;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
  color: #CBD5E1;
}
.icon svg { flex-shrink: 0; }
</style>
