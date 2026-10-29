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
  { id: 'commandcode', label: 'Command Code',          url: 'https://api.commandcode.ai/provider/v1' },
  { id: 'agnes',      label: 'Agnes AI',               url: 'https://apihub.agnes-ai.com/v1' },
  { id: 'opendesign', label: 'OpenDesign (AMR)',       url: 'https://amr-link.open-design.ai/v1' },
  { id: 'ark-agent-plan',  label: '火山方舟 Agent Plan',  url: 'https://ark.cn-beijing.volces.com/api/plan/v3' },
  { id: 'ark-coding-plan', label: '火山方舟 Coding Plan', url: 'https://ark.cn-beijing.volces.com/api/coding/v3' },
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
// Command Code — https://commandcode.ai/docs/provider
// 订阅制编码 agent 的官方 Provider API。同一个 base URL 下混两套协议：
//   claude-*  → Anthropic 兼容  POST /messages          （Claude 只有这一条路）
//   其它模型   → OpenAI 兼容     POST /chat/completions
// /models 免鉴权，且每个模型带 supported_endpoints 字段标明可用路由。
// 鉴权：Authorization: Bearer <API Key> 对所有路由都有效（Anthropic SDK 也可用 x-api-key）。
// 注意：Go 套餐不含 API 访问权限（403 upgrade_required），需 GOAT / Pro / Max / Provider 套餐。
// ============================================================

const COMMAND_CODE_URL = 'https://api.commandcode.ai/provider/v1';

// 内置兜底列表（实时 /models 拿不到时用），Claude 系在下拉框里带协议提示
const COMMAND_CODE_MODELS = [
  'claude-sonnet-5-5', 'claude-sonnet-5', 'claude-sonnet-4-6',
  'claude-opus-5-5', 'claude-opus-5', 'claude-opus-4-8',
  'claude-haiku-5-5', 'claude-haiku-4-5-20251001',
  'gpt-6.1-sol', 'gpt-6-sol', 'gpt-6-luna', 'gpt-5.6-sol', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.4',
  'deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4.1-flash',
  'moonshotai/Kimi-K3', 'moonshotai/Kimi-K2.7-Code', 'moonshotai/Kimi-K2.6',
  'zai-org/GLM-5.3', 'zai-org/GLM-5.2', 'z-ai/glm-5.3-flash',
  'MiniMaxAI/MiniMax-M3', 'MiniMaxAI/MiniMax-M2.7',
  'xiaomi/mimo-v2.6-pro', 'xiaomi/mimo-v2.5',
  'Qwen/Qwen3.8-Max', 'Qwen/Qwen3.8-Flash', 'Qwen/Qwen3.7-Max',
  'google/gemini-3.8-flash', 'google/gemini-3.5-flash',
  'xai/grok-4.7', 'xai/grok-4.6',
  'meta/muse-spark-1.3', 'tencent/hy3-paid', 'mistral/mistral-large-4',
  'nvidia/nemotron-3-ultra-550b-a55b',
  'inclusionai/ling-3.1-flash:free', 'poolside/laguna-s-2.1-free',
];

const COMMAND_CODE_ANTHROPIC_DESC = '/messages · Anthropic 协议';

/** Command Code 按模型名选路由：claude-* 只能走 /messages，其余走 /chat/completions */
function commandCodeFamily(modelName) {
  return /^claude-/i.test((modelName || '').trim()) ? 'messages' : 'chat';
}

function commandCodeHeaders(apiKey) {
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'ai-model-form/0.3.1',
  };
  // /models 免鉴权，此时不要发空的 Authorization 头
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  return headers;
}

/** 读取错误响应里的错误码和可读信息（只用于把上游原因透给用户，读失败就算了） */
async function readErrorBody(response) {
  try {
    const body = await response.json();
    const err = body?.error || body || {};
    return {
      code: typeof err.code === 'string' ? err.code : '',
      message: typeof err.message === 'string' ? err.message : '',
    };
  } catch {
    return null;
  }
}

// ============================================================
// OpenDesign AMR — https://open-design.ai
//
// 官方托管的模型路由服务（AMR = Agentic Model Router）。Key 在控制台生成：
//   https://open-design.ai/cloud/api-keys?workspaceId=<workspace>
// 一把 sk-amr- 开头的 Key 就能调全部模型，按 token 从 workspace 余额里扣。
//
// 三处和别的供应商不一样，填错会很难看出来：
//  1) **数据面域名是 amr-link.open-design.ai，不是站点主域名**。主域名是 SPA，
//     任何 /v1/... 都会回 index.html（200 + 一段 HTML），不会报错 —— 填成
//     https://open-design.ai/v1 只会得到"模型列表解析失败"，看不出是域名错了。
//  2) /models 需要鉴权（无 Key 回 401），所以没填 Key 时只能用内置兜底清单。
//  3) 协议只有一套：OpenAI Chat Completions + Authorization: Bearer，
//     没有 OpenCode / Command Code 那种同域名多协议族的问题。
//
// 响应里 deepseek / gpt 系会额外带 reasoning 字段，但 choices[].message.content
// 仍是标准形状，本表单只做连通性测试，不需要特殊处理。
// ============================================================

const OPENDESIGN_URL = 'https://amr-link.open-design.ai/v1';

// 内置兜底清单：2026-10-29 用真实 Key 拉 /models 得到（13 个，全部 enabled）。
// 这个网关换模型比较勤，实时拉取成功时以线上为准，这里只保证"没填 Key 也有东西可选"。
const OPENDESIGN_MODELS = [
  'deepseek-v4.1-flash', 'deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp',
  'claude-haiku-5.5', 'gpt-6-luna',
  'glm-5.3-flash', 'glm-5.3-flashx',
  'kimi-k2.7-code', 'minimax-m3.1-flash',
  'mimo-v2.6-pro', 'mimo-v2.6-flash', 'hy4-preview',
];

// ============================================================
// 火山方舟 订阅套餐 Agent Plan / Coding Plan — https://www.volcengine.com/product/ark
//
// 两套套餐共用同一个域名，但**数据面路径前缀不同**，填错直接 404：
//   https://ark.<region>.volces.com/api/plan/v3     Agent Plan（个人版 / 团队版）
//   https://ark.<region>.volces.com/api/coding/v3   Coding Plan（个人版 / 团队版）
//   （第三个路径 /api/v3 是平台按量付费，需要自建 Endpoint，不属于套餐预设）
//
// 两个端点的调用形状与 OpenAI 兼容一致：POST /chat/completions + Authorization: Bearer。
// 用户给的接口地址里已含区域，所以不做 region 派生（换成 cn-shanghai 等改 URL 即可）。
//
// 鉴权与额度边界（决定用户该填哪把 Key）：
//   Agent Plan    —— 套餐 Key / 团队席位 Key，三种模态都走套餐（无按量兜底）
//   Coding Plan   —— 个人版文本通道用**后付费 API Key**（不是另一种"Coding Plan Key"）；
//                    团队版文本用席位 Key；image/video 不属于本表单的能力范围
//
// 两个坑，代码里都绕着走：
//   1) 这两个端点的 /models 返回的是方舟**全量模型目录**（含向量/视频/已下线模型，
//      2026-10-27 实测 138 个），不是套餐清单 —— 拿它渲染下拉框，用户会看到一堆
//      套餐里根本调不通的模型。
//      2026-10-10 因此**只发内置清单**，代价是上游发了新模型下拉框里永远看不到
//      （10-17 的 deepseek-v4-1-flash-261017 就漏了一个月）。2026-10-27 用户拍板
//      反过来：**实时拉 /models**，宁可看到用不了的，也别看不到新发的。内置清单
//      降级成「没填 Key / 拉取失败」时的兜底，不再是权威清单。
//   2) 模型不在套餐内时服务端回 **404 UnsupportedModel**（"does not support the
//      coding/agent plan feature"），语义是"不在套餐里"，不是"模型名写错了"。
//     把这两个说法混起来会让用户白折腾半天模型名，所以 test 接口单独映射。
//      注意下拉框现在是全量目录，所以「选得到但调不通」是常态，test 结果才是判据。
//
// 内置兜底清单来源：2026-10-10 用真实套餐 Key 逐个 POST /chat/completions 实测
// （max_tokens=1），只收 200 的。Agent Plan 的成员资格用同一把 Coding Plan Key 也能
// 判 —— /api/plan/v3 先校验模型再校验鉴权：模型不在套餐 → 404 UnsupportedModel，
// 模型在套餐 → 放行到鉴权层 → 401。两个清单因此有实质差异（如 doubao-seed-code
// 只在 Coding Plan，kimi-k2 系只在 Coding Plan，doubao-seed-1-6 系两边都不在）。
//
// 2026-10-27 另补了 DeepSeek-V4.1-Flash 1017 版（deepseek-v4-1-flash-261017 /
// -economy-261017，同权重、经济版八折但更慢）。改成实时拉取后这两条只影响
// 「没 Key 时的兜底」，不用再为漏模型改这份数组了。
// ============================================================

const ARK_AGENT_PLAN_URL = 'https://ark.cn-beijing.volces.com/api/plan/v3';
const ARK_CODING_PLAN_URL = 'https://ark.cn-beijing.volces.com/api/coding/v3';

const ARK_PLAN_URLS = new Set([ARK_AGENT_PLAN_URL, ARK_CODING_PLAN_URL]);

const ARK_AGENT_PLAN_MODELS = [
  'doubao-seed-2-1-pro-260915', 'doubao-seed-2-1-pro-260628', 'doubao-seed-2-1-turbo-260628',
  'doubao-seed-2-1-lite-260915',
  'doubao-seed-2-0-pro-260215', 'doubao-seed-2-0-lite-260428', 'doubao-seed-2-0-lite-260215',
  'doubao-seed-2-0-mini-260428', 'doubao-seed-2-0-mini-260215',
  'doubao-seed-2-0-code-preview-260215', 'doubao-seed-evolving',
  'deepseek-v4-pro-ga-260813', 'deepseek-v4-pro-260425',
  'deepseek-v4-1-flash-261017', 'deepseek-v4-1-flash-economy-261017',
  'deepseek-v4-1-flash-260910', 'deepseek-v4-flash-ga-260731',
  'glm-5-3-flash-260828', 'glm-5-2-260617',
];

const ARK_CODING_PLAN_MODELS = [
  'doubao-seed-code', 'doubao-seed-evolving',
  'doubao-seed-2-1-pro-260915', 'doubao-seed-2-1-pro-260628', 'doubao-seed-2-1-turbo-260628',
  'doubao-seed-2-1-lite-260915',
  'doubao-seed-2-0-pro-260215', 'doubao-seed-2-0-mini-260428', 'doubao-seed-2-0-mini-260215',
  'doubao-seed-2-0-code-preview-260215',
  'deepseek-v4-pro-ga-260813', 'deepseek-v4-pro-260425',
  'deepseek-v4-1-flash-261017', 'deepseek-v4-1-flash-economy-261017',
  'deepseek-v4-1-flash-260910', 'deepseek-v4-flash-ga-260731',
  'glm-5-3-flash-260828', 'glm-5-2-260617',
  'kimi-k2-thinking-251104', 'kimi-k2-turbo-preview-250905', 'kimi-k2-250905',
];

/**
 * 套餐端点把"不在套餐里"表达成 404 UnsupportedModel，和"模型名不存在"用同一个状态码。
 * 只有读到这句专属文案才能确定是套餐外，所以认文案不认状态码。
 * @param {{code?: string, message?: string}|null} err - readErrorBody 的结果
 * @param {'agent'|'coding'} plan
 */
function isArkPlanModelError(err, plan) {
  const blob = `${err?.code || ''} ${err?.message || ''}`;
  // 错误码是 camelCase 的 UnsupportedModel（不是 Command Code 那种 unsupported_model），
  // 两种写法都认，免得以后网关改名又要来改一遍。
  return /unsupported[_\s-]?model/i.test(blob) && new RegExp(`does not support the ${plan} plan`, 'i').test(blob);
}

/** 套餐端点的展示名，用来拼面向用户的错误文案 */
function arkPlanLabel(url) {
  return url === ARK_CODING_PLAN_URL ? 'Coding Plan' : 'Agent Plan';
}

/** 套餐端点上的 404：区分"不在套餐里"与"模型名写错"，两者解法完全不同 */
function arkPlanNotFoundMessage(url, modelName, err) {
  const label = arkPlanLabel(url);
  if (isArkPlanModelError(err, url === ARK_CODING_PLAN_URL ? 'coding' : 'agent'))
    return `${label} 套餐不含模型 "${modelName}"：请从下拉框里选套餐内的模型，`
      + `或在火山方舟控制台确认 ${label} 的可用模型清单`;
  return `模型 "${modelName}" 不存在 (404)`;
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
  // OpenDesign AMR — 更新: 2026-10-29（真实 Key 拉 /models 得到，13 个全部 enabled）
  [OPENDESIGN_URL]: OPENDESIGN_MODELS,
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
  // Command Code — 更新: 2026-10-08（官方 Provider API，Claude 系走 /messages）
  'https://api.commandcode.ai/provider/v1': COMMAND_CODE_MODELS.map(id =>
    commandCodeFamily(id) === 'messages' ? { id, desc: COMMAND_CODE_ANTHROPIC_DESC } : id
  ),
  // 火山方舟套餐 — 更新: 2026-10-10（真实套餐 Key 逐个实测，不带 desc 是因为
  // 这里没有"协议族"要提示，模型名本身就是唯一的坑）
  [ARK_AGENT_PLAN_URL]: ARK_AGENT_PLAN_MODELS,
  [ARK_CODING_PLAN_URL]: ARK_CODING_PLAN_MODELS,
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
// Command Code — public /models, no auth, cached 1h
// ============================================================

let _commandCodeCache = null;
let _commandCodeFetchedAt = 0;

async function fetchCommandCodeModels(timeoutMs) {
  const now = Date.now();
  if (_commandCodeCache && now - _commandCodeFetchedAt < 3_600_000) return _commandCodeCache;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    const res = await fetch(`${COMMAND_CODE_URL}/models`, {
      headers: commandCodeHeaders(),
      signal: ac.signal,
    });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    _commandCodeCache = (data.data || data.models || [])
      .map(m => (typeof m === 'string' ? { id: m } : m))
      .filter(m => m && m.id)
      .map(m => {
        // supported_endpoints 里没有 /chat/completions 的就是 Claude 系，只能走 /messages
        const eps = Array.isArray(m.supported_endpoints) ? m.supported_endpoints : [];
        const anthropicOnly = eps.length > 0 && !eps.includes('/chat/completions');
        return { id: m.id, desc: anthropicOnly ? COMMAND_CODE_ANTHROPIC_DESC : '' };
      });
    _commandCodeFetchedAt = Date.now();
    console.log(`[ai-model-form] Command Code: ${_commandCodeCache.length} models`);
    return _commandCodeCache;
  } catch (err) {
    console.warn(`[ai-model-form] Command Code fetch failed: ${err.message}`);
    return _commandCodeCache || null;
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

    // Command Code: public /models (no auth), Claude 系带协议提示
    if (ep === COMMAND_CODE_URL) {
      const live = await fetchCommandCodeModels(testTimeoutMs);
      if (live && live.length) return res.json({ models: live, source: 'live' });
      return res.json({ models: builtin, source: builtin.length ? 'builtin' : 'empty' });
    }

    // 火山方舟套餐：**实时拉** /models（2026-10-27 用户拍板的方向，理由见文件头）。
    // 这个目录是全量模型目录而不是套餐清单，所以会混进 qwen3 / seedream / 已下线
    // 模型 —— 已知且接受：宁可下拉框里看到用不了的，也别看不到上游新发的。
    // 没有 Key 时 /models 回 401，fetchLiveModels 返 null → 退回内置兜底清单。
    if (ARK_PLAN_URLS.has(ep)) {
      if (apiKey) {
        const live = await fetchLiveModels(ep, apiKey, testTimeoutMs);
        if (live && live.length) return res.json({ models: live, source: 'live' });
      }
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

    // OpenCode Go exposes three protocol families behind one base URL — pick the
    // path / auth / body that matches the selected model. Command Code does the
    // same with two families: claude-* on /messages, everything else on /chat/completions.
    const isCommandCode = ep === COMMAND_CODE_URL;
    const family = ep === OPENCODE_GO_URL ? OPENCODE_GO_ROUTE[modelName.trim()]
      : isCommandCode ? commandCodeFamily(modelName)
      : null;

    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), testTimeoutMs);

      let url, headers, payload;
      if (family) {
        url = `${ep}/${family === 'chat' ? 'chat/completions' : family}`;
        headers = isCommandCode ? commandCodeHeaders(apiKey) : openCodeGoHeaders(apiKey, family);
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
      if (fetchRes.ok)
        return res.json({ ok: true, message: '连接成功', status: fetchRes.status });
      // 400 有两种含义，必须看错误码区分：
      //   「探活参数被拒」(如 o 系/Gemini 嫌 max_tokens 太小) → 模型和 Key 都是好的，算成功
      //   「模型不可用」(模型名不存在 / 走错了协议族)     → 必须报失败，否则打错模型名也会显示连接成功
      if (fetchRes.status === 400) {
        const err = await readErrorBody(fetchRes);
        const blob = `${err?.code || ''} ${err?.message || ''}`;
        if (/unsupported[_\s-]?model|must be called via|is not supported on this endpoint/i.test(blob))
          return res.json({ ok: false, message: `模型 "${modelName}" 在该接口不可用 (400)${err?.message ? '：' + err.message : ''}` });
        // 限流 / 配额类 400 不是"探活参数太小被拒"，不能算连接成功，
        // 否则套餐额度用尽时界面会显示绿色的"连接成功"。
        if (/rate.?limit|quota|throttl|too many|overload|busy|concurrenc/i.test(blob))
          return res.json({ ok: false, message: `接口限流或额度不足 (400)${err?.message ? '：' + err.message : ''}` });
        return res.json({ ok: true, message: '连接成功', status: 400 });
      }
      if (fetchRes.status === 401) {
        if (ARK_PLAN_URLS.has(ep))
          return res.json({ ok: false, message: `API Key 无效或与套餐不匹配 (401)：${arkPlanLabel(ep)} 需要该套餐下发的 Key` });
        return res.json({ ok: false, message: 'API Key 无效或未授权 (401)' });
      }
      if (fetchRes.status === 403) {
        const hint = (await readErrorBody(fetchRes))?.message || '';
        if (/doesn't include API access/i.test(hint))
          return res.json({ ok: false, message: '当前套餐不含 API 访问权限：Command Code 的 Go 套餐需升级到 GOAT / Pro / Max / Provider 才能调用 API' });
        return res.json({ ok: false, message: `无访问权限 (403)${hint ? '：' + hint : ''}` });
      }
      if (fetchRes.status === 404) {
        if (ARK_PLAN_URLS.has(ep))
          return res.json({ ok: false, message: arkPlanNotFoundMessage(ep, modelName, await readErrorBody(fetchRes)) });
        return res.json({ ok: false, message: `模型 "${modelName}" 不存在 (404)` });
      }
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
