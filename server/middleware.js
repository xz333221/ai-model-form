/**
 * ai-model-form Express middleware
 *
 * Model list strategy (in priority order):
 *   1. OpenRouter  — public /models API, no auth, real-time
 *   2. Ollama      — local /api/tags, no auth, real-time
 *   3. Live fetch  — provider /models endpoint, requires API Key, real-time
 *   4. Built-in    — curated list bundled in the package, always available
 */
import { Router } from 'express';

// ============================================================
// Provider presets
// ============================================================

const PROVIDERS = [
  { id: 'openai',     label: 'OpenAI',                url: 'https://api.openai.com/v1' },
  { id: 'anthropic',  label: 'Anthropic (Claude)',     url: 'https://api.anthropic.com/v1' },
  { id: 'deepseek',   label: 'DeepSeek',              url: 'https://api.deepseek.com/v1' },
  { id: 'gemini',     label: 'Google (Gemini)',        url: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  { id: 'xai',        label: 'xAI (Grok)',            url: 'https://api.x.ai/v1' },
  { id: 'meta',       label: 'Meta (Llama)',          url: 'https://api.llama-api.com/v1' },
  { id: 'mistral',    label: 'Mistral AI',            url: 'https://api.mistral.ai/v1' },
  { id: 'minimax',    label: 'MiniMax',               url: 'https://api.minimaxi.com/v1' },
  { id: 'moonshot',   label: 'Moonshot (Kimi)',       url: 'https://api.moonshot.cn/v1' },
  { id: 'zhipu',      label: '智谱 (GLM)',             url: 'https://open.bigmodel.cn/api/paas/v4' },
  { id: 'qwen',       label: '阿里 (Qwen)',            url: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'cohere',     label: 'Cohere',                url: 'https://api.cohere.com/v2' },
  { id: 'groq',       label: 'Groq',                  url: 'https://api.groq.com/openai/v1' },
  { id: 'together',   label: 'Together AI',           url: 'https://api.together.xyz/v1' },
  { id: 'openrouter', label: 'OpenRouter',            url: 'https://openrouter.ai/api/v1' },
  { id: 'ollama',     label: 'Ollama (本地)',          url: 'http://localhost:11434/v1' },
];

// ============================================================
// Built-in curated model list (no API Key needed)
// Updated with each package release.
// ============================================================

const BUILTIN_MODELS = {
  // Updated: 2026-05-28
  'https://api.openai.com/v1': [
    'gpt-5.5', 'gpt-5.5-instant', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano',
    'gpt-4.1', 'gpt-4.1-mini', 'o3', 'o4-mini', 'gpt-4o',
  ],
  'https://api.anthropic.com/v1': [
    'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5',
  ],
  'https://api.deepseek.com/v1': [
    'deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-chat', 'deepseek-reasoner',
  ],
  'https://generativelanguage.googleapis.com/v1beta/openai': [
    'gemini-3.5-flash', 'gemini-3.5-pro', 'gemini-3.1-pro', 'gemini-3-flash',
    'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite',
  ],
  'https://api.x.ai/v1': [
    'grok-4', 'grok-4.3', 'grok-3', 'grok-3-mini',
  ],
  'https://api.llama-api.com/v1': [
    'llama-4-maverick', 'llama-4-scout', 'llama-3.1-70b', 'llama-3.1-8b',
  ],
  'https://api.mistral.ai/v1': [
    'mistral-medium-3.5', 'mistral-large-3', 'codestral-latest', 'open-mixtral-8x22b',
  ],
  'https://api.minimaxi.com/v1': [
    'minimax-m2.7',
  ],
  'https://api.moonshot.cn/v1': [
    'kimi-k2.6', 'kimi-k2.5', 'moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k',
  ],
  'https://open.bigmodel.cn/api/paas/v4': [
    'glm-5.1', 'glm-5v-turbo', 'glm-4-plus', 'glm-4-flash',
  ],
  'https://dashscope.aliyuncs.com/compatible-mode/v1': [
    'qwen3.7-max', 'qwen3.6-max-preview', 'qwen3.6-plus', 'qwen3.6-flash',
    'qwen3.5-omni-plus', 'qwen3-vl-plus', 'qwen3-235b-a22b', 'qwen3-32b',
  ],
  'https://api.cohere.com/v2': [
    'command-r-plus-4', 'command-r-4', 'command-r', 'command-r-plus',
  ],
  'https://api.groq.com/openai/v1': [
    'llama-3.1-70b-versatile', 'llama-3.1-8b-instant',
    'llama3-70b-8192', 'mixtral-8x7b-32768', 'gemma2-9b-it',
  ],
  'https://api.together.xyz/v1': [
    'meta-llama/Llama-4-Maverick', 'Qwen/Qwen3-72B',
    'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    'deepseek-ai/DeepSeek-V3',
  ],
  'http://localhost:11434/v1': [
    'qwen2.5', 'llama3.1', 'mistral', 'deepseek-r1:7b', 'qwen3', 'llama4',
  ],
};

// ============================================================
// OpenRouter — public /models, no auth, cached 1h
// ============================================================

let _openRouterCache = null;
let _openRouterFetchedAt = 0;
const OPENROUTER_TTL = 3_600_000;

async function fetchOpenRouterModels(timeoutMs) {
  const now = Date.now();
  if (_openRouterCache && now - _openRouterFetchedAt < OPENROUTER_TTL) return _openRouterCache;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    const res = await fetch('https://openrouter.ai/api/v1/models', { signal: ac.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    _openRouterCache = (data.data || []).map(m => ({ id: m.id, desc: m.name || '' }));
    _openRouterFetchedAt = Date.now();
    console.log(`[ai-model-form] OpenRouter: ${_openRouterCache.length} models`);
    return _openRouterCache;
  } catch (err) {
    console.warn(`[ai-model-form] OpenRouter fetch failed: ${err.message}`);
    return _openRouterCache || [];
  }
}

// ============================================================
// Ollama — local /api/tags, no auth
// ============================================================

async function fetchOllamaModels(baseUrl, timeoutMs) {
  try {
    const host = baseUrl.replace(/\/v1$/, '');
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    const res = await fetch(`${host}/api/tags`, { signal: ac.signal });
    clearTimeout(t);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || []).map(m => ({ id: m.name, desc: m.details?.parameter_size || '' }));
  } catch {
    return [];
  }
}

// ============================================================
// Live /models endpoint — requires API Key
// ============================================================

async function fetchLiveModels(ep, apiKey, timeoutMs) {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    const res = await fetch(`${ep}/models`, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: ac.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    return (data.data || data.models || [])
      .slice(0, 400)
      .map(m => ({ id: typeof m === 'string' ? m : (m.id || ''), desc: m.description || '' }))
      .filter(m => m.id);
  } catch {
    return null;
  }
}

// ============================================================
// In-memory store (replace with DB in production)
// ============================================================

const savedModels = new Map();
let nextId = 1;

// ============================================================
// Middleware factory
// ============================================================

export function createAiModelMiddleware(options = {}) {
  const { testTimeoutMs = 8000 } = options;
  const router = Router();

  router.get('/ai-model/providers', (_req, res) => {
    res.json({ providers: PROVIDERS });
  });

  router.get('/ai-model/models', async (req, res) => {
    const { endpoint } = req.query;
    if (!endpoint || typeof endpoint !== 'string')
      return res.status(400).json({ message: 'Missing endpoint parameter' });

    let parsedUrl;
    try { parsedUrl = new URL(endpoint); } catch {
      return res.status(400).json({ message: 'Invalid endpoint URL' });
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol))
      return res.status(400).json({ message: 'Only http/https endpoints are allowed' });

    const apiKey = (req.headers['x-api-key'] || '').trim();
    const ep = endpoint.replace(/\/$/, '');

    // OpenRouter: real-time public API
    if (ep === 'https://openrouter.ai/api/v1') {
      const models = await fetchOpenRouterModels(testTimeoutMs);
      return res.json({ models, source: 'live' });
    }

    // Ollama: real-time local API
    if (ep === 'http://localhost:11434/v1') {
      const models = await fetchOllamaModels(ep, testTimeoutMs);
      return res.json({ models, source: models.length ? 'live' : 'empty' });
    }

    const builtin = (BUILTIN_MODELS[ep] || []).map(id => ({ id, desc: '' }));

    // Live fetch when API Key is provided
    if (apiKey) {
      const live = await fetchLiveModels(ep, apiKey, testTimeoutMs);
      if (live && live.length) {
        const liveIds = new Set(live.map(m => m.id));
        return res.json({
          models: [...live, ...builtin.filter(m => !liveIds.has(m.id))],
          source: 'live',
        });
      }
    }

    return res.json({ models: builtin, source: builtin.length ? 'builtin' : 'empty' });
  });

  router.post('/ai-model/test', async (req, res) => {
    const { endpoint, modelName, apiKey } = req.body || {};
    if (!endpoint || !modelName)
      return res.status(400).json({ ok: false, message: '缺少必填参数: endpoint 或 modelName' });

    let parsedUrl;
    try { parsedUrl = new URL(endpoint); } catch {
      return res.status(400).json({ ok: false, message: '接口地址格式不正确' });
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol))
      return res.status(400).json({ ok: false, message: '接口地址只支持 http/https' });

    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), testTimeoutMs);
      const fetchRes = await fetch(`${endpoint.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': apiKey ? `Bearer ${apiKey}` : '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
          stream: false,
        }),
        signal: ac.signal,
      });
      clearTimeout(timer);
      if (fetchRes.ok || fetchRes.status === 400)
        return res.json({ ok: true, message: '连接成功', status: fetchRes.status });
      if (fetchRes.status === 401)
        return res.json({ ok: false, message: 'API Key 无效或未授权 (401)' });
      if (fetchRes.status === 404)
        return res.json({ ok: false, message: `模型 "${modelName}" 不存在 (404)` });
      return res.json({ ok: false, message: `服务器返回错误: ${fetchRes.status}` });
    } catch (err) {
      if (err.name === 'AbortError')
        return res.json({ ok: false, message: `连接超时 (>${testTimeoutMs / 1000}s)` });
      return res.json({ ok: false, message: `连接失败: ${err.message}` });
    }
  });

  router.post('/ai-model/models', (req, res) => {
    const { endpoint, modelName, displayName, apiKey } = req.body || {};
    if (!endpoint || !modelName)
      return res.status(400).json({ message: '缺少必填参数: endpoint 或 modelName' });
    try {
      const u = new URL(endpoint);
      if (!['http:', 'https:'].includes(u.protocol)) throw new Error();
    } catch {
      return res.status(400).json({ message: '接口地址格式不正确' });
    }
    const id = nextId++;
    savedModels.set(id, {
      id,
      endpoint: endpoint.trim(),
      modelName: modelName.trim(),
      displayName: (displayName || modelName).trim(),
      apiKeyMasked: apiKey ? `${apiKey.slice(0, 6)}****${apiKey.slice(-4)}` : '',
      createdAt: new Date().toISOString(),
    });
    res.status(201).json({ id, message: '保存成功' });
  });

  router.get('/ai-model/models/saved', (_req, res) => {
    res.json({ models: Array.from(savedModels.values()) });
  });

  router.delete('/ai-model/models/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!savedModels.has(id)) return res.status(404).json({ message: '模型不存在' });
    savedModels.delete(id);
    res.json({ message: '删除成功' });
  });

  return router;
}
