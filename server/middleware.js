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
import { randomUUID } from 'node:crypto';

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
  { id: 'nvidia',     label: 'NVIDIA',                url: 'https://integrate.api.nvidia.com/v1' },
  { id: 'mistral',    label: 'Mistral AI',            url: 'https://api.mistral.ai/v1' },
  { id: 'minimax',    label: 'MiniMax',               url: 'https://api.minimaxi.com/v1' },
  { id: 'moonshot',   label: 'Moonshot (Kimi)',       url: 'https://api.moonshot.cn/v1' },
  { id: 'zhipu',      label: '智谱 (GLM)',             url: 'https://open.bigmodel.cn/api/paas/v4' },
  { id: 'qwen',       label: '阿里 (Qwen)',            url: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'cohere',     label: 'Cohere',                url: 'https://api.cohere.com/v2' },
  { id: 'groq',       label: 'Groq',                  url: 'https://api.groq.com/openai/v1' },
  { id: 'together',   label: 'Together AI',           url: 'https://api.together.xyz/v1' },
  { id: 'openrouter', label: 'OpenRouter',            url: 'https://openrouter.ai/api/v1' },
  { id: 'opencode',   label: 'OpenCode Go',           url: 'https://opencode.ai/zen/go/v1' },
  { id: 'agnes',      label: 'Agnes AI',               url: 'https://apihub.agnes-ai.com/v1' },
  { id: 'ollama',     label: 'Ollama (本地)',          url: 'http://localhost:11434/v1' },
];

// ============================================================
// OpenCode Go — https://opencode.ai/docs/go
// $10/月订阅网关（国际），API Key 从 https://opencode.ai/auth 获取。
//
// 同一个 base URL 下混了三套协议，模型属于哪一族决定了路径、
// 鉴权头和请求体形状：
//   chat      → OpenAI 兼容   POST /chat/completions  (Authorization: Bearer)
//   messages  → Anthropic 兼容 POST /messages          (x-api-key)
//   responses → OpenAI 新协议  POST /responses
// ============================================================

const OPENCODE_GO_URL = 'https://opencode.ai/zen/go/v1';

const OPENCODE_GO_MODELS = {
  // 大多数模型走 OpenAI 兼容
  chat: [
    'deepseek-v4.1-flash', 'deepseek-v4-pro', 'deepseek-v4-flash',
    'deepseek-v4-flash-vision-exp', 'deepseek-flash',
    'glm-5.3', 'glm-5.3-flash', 'glm-5.2', 'glm-5.1', 'glm-5',
    'kimi-k3', 'kimi-k2.7-code', 'kimi-k2.6', 'kimi-k2.5',
    'longcat-2.0',
    'mimo-v2.5', 'mimo-v2.5-pro', 'mimo-v2-pro', 'mimo-v2-omni',
    'hy4-preview', 'hy3', 'hy3-preview',
    'omen-alpha',
  ],
  // Anthropic 兼容 —— 注意鉴权走 x-api-key，不是 Bearer
  messages: [
    'minimax-m3', 'minimax-m2.7', 'minimax-m2.5',
    'qwen3.8-max', 'qwen3.8-flash', 'qwen3.7-max', 'qwen3.7-plus',
    'qwen3.6-plus', 'qwen3.5-plus',
    'union-alpha',
  ],
  // OpenAI Responses API
  responses: [
    'grok-4.6', 'grok-4.5', 'gpt-5.6-luna',
    'muse-spark-1.3-contributor', 'muse-spark-1.2-contributor',
  ],
};

// modelId -> 协议族，用于给连通性测试选对路径
const OPENCODE_GO_ROUTE = Object.fromEntries(
  Object.entries(OPENCODE_GO_MODELS).flatMap(([family, ids]) => ids.map(id => [id, family]))
);

// 下拉框里的副标题，提示该模型不是 OpenAI 协议
const OPENCODE_GO_DESC = {
  messages: '/messages · Anthropic 协议',
  responses: '/responses · OpenAI 新协议',
};

/**
 * Go 要求客户端表明身份并在 x-opencode-session 里带上稳定的会话 ID，
 * 否则请求可能被限流。见 opencode.ai/docs/go「可以在哪里使用？」。
 */
function openCodeGoHeaders(apiKey, family) {
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'ai-model-form/0.3.0',
    'x-opencode-session': randomUUID(),
  };
  if (family === 'messages') {
    headers['x-api-key'] = apiKey || '';
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers['Authorization'] = apiKey ? `Bearer ${apiKey}` : '';
  }
  return headers;
}

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
  'https://apihub.agnes-ai.com/v1': [
    'agnes-2.5-pro-alpha', 'agnes-2.0-flash', 'agnes-image-2.0', 'agnes-video-v2.0',
  ],
  'http://localhost:11434/v1': [
    'qwen2.5', 'llama3.1', 'mistral', 'deepseek-r1:7b', 'qwen3', 'llama4',
  ],
  'https://integrate.api.nvidia.com/v1': [
    'nvidia/llama-3.3-nemotron-super-49b-v1',
    'nvidia/nemotron-3-nano-30b-a3b',
    'nvidia/nemotron-3-super-120b-a12b',
    'nvidia/llama-3.1-nemotron-ultra-253b-v1',
    'meta/llama-3.3-70b-instruct',
    'meta/llama-4-maverick-17b-128e-instruct',
    'deepseek-ai/deepseek-r1',
    'qwen/qwq-32b',
  ],
  // OpenCode Go — 更新: 2026-09-17（来自 /models 实时列表 + 官方文档的协议归属）
  // 只有非 OpenAI 协议的模型带 desc，用来在下拉框里做提示
  'https://opencode.ai/zen/go/v1': [
    ...OPENCODE_GO_MODELS.chat,
    ...OPENCODE_GO_MODELS.responses.map(id => ({ id, desc: OPENCODE_GO_DESC.responses })),
    ...OPENCODE_GO_MODELS.messages.map(id => ({ id, desc: OPENCODE_GO_DESC.messages })),
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
// OpenCode Go — public /models, no auth, cached 1h
// ============================================================

let _openCodeGoCache = null;
let _openCodeGoFetchedAt = 0;

async function fetchOpenCodeGoModels(timeoutMs) {
  const now = Date.now();
  if (_openCodeGoCache && now - _openCodeGoFetchedAt < 3_600_000) return _openCodeGoCache;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    const res = await fetch(`${OPENCODE_GO_URL}/models`, {
      headers: openCodeGoHeaders(),
      signal: ac.signal,
    });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    _openCodeGoCache = (data.data || data.models || [])
      .map(m => (typeof m === 'string' ? m : m.id))
      .filter(Boolean)
      .map(id => ({ id, desc: OPENCODE_GO_DESC[OPENCODE_GO_ROUTE[id]] || '' }));
    _openCodeGoFetchedAt = Date.now();
    console.log(`[ai-model-form] OpenCode Go: ${_openCodeGoCache.length} models`);
    return _openCodeGoCache;
  } catch (err) {
    console.warn(`[ai-model-form] OpenCode Go fetch failed: ${err.message}`);
    return _openCodeGoCache || null;
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
  const { testTimeoutMs = 30000 } = options;
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

    const builtin = (BUILTIN_MODELS[ep] || []).map(m =>
      typeof m === 'string' ? { id: m, desc: '' } : { id: m.id, desc: m.desc || '' }
    );

    // OpenCode Go: public /models, no auth required, real-time
    // (annotated with each model's protocol family from the local table)
    if (ep === OPENCODE_GO_URL) {
      const live = await fetchOpenCodeGoModels(testTimeoutMs);
      if (live && live.length) return res.json({ models: live, source: 'live' });
      return res.json({ models: builtin, source: builtin.length ? 'builtin' : 'empty' });
    }

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

    const ep = endpoint.replace(/\/$/, '');

    // OpenCode Go exposes three protocol families behind one base URL —
    // pick the path / auth / body that matches the selected model.
    const family = ep === OPENCODE_GO_URL ? OPENCODE_GO_ROUTE[modelName.trim()] : null;

    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), testTimeoutMs);

      let url, headers, payload;
      if (family) {
        url = `${ep}/${family === 'chat' ? 'chat/completions' : family}`;
        headers = openCodeGoHeaders(apiKey, family);
        payload = family === 'messages'
          ? { model: modelName, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }
          : family === 'responses'
            ? { model: modelName, input: 'hi', max_output_tokens: 16 }
            : { model: modelName, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1, stream: false };
      } else {
        url = `${ep}/chat/completions`;
        headers = {
          'Authorization': apiKey ? `Bearer ${apiKey}` : '',
          'Content-Type': 'application/json',
        };
        payload = {
          model: modelName,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
          stream: false,
        };
      }

      const fetchRes = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: ac.signal,
      });
      clearTimeout(timer);
      if (fetchRes.ok || fetchRes.status === 400)
        return res.json({ ok: true, message: '连接成功', status: fetchRes.status });
      if (fetchRes.status === 401)
        return res.json({ ok: false, message: 'API Key 无效或未授权 (401)' });
      if (fetchRes.status === 404)
        return res.json({ ok: false, message: `模型 "${modelName}" 不存在 (404)` });
      if (fetchRes.status === 410 && endpoint.includes('nvidia.com'))
        return res.json({ ok: false, message: 'NVIDIA 账号缺少 Public API Endpoints 权限 (410)，请在 build.nvidia.com 申请开通后再试' });
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
