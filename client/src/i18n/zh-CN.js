export default {
  // Field labels
  endpoint: '接口地址',
  endpointPlaceholder: '选择或输入接口地址',
  apiKey: 'API Key',
  apiKeyPlaceholder: '输入 API Key',
  model: '模型',
  modelPlaceholder: '选择或输入模型',
  displayName: '显示名称',
  displayNamePlaceholder: '默认使用模型名称',

  // Validation
  errEndpointRequired: '请填写接口地址',
  errModelRequired: '请填写模型',

  // Async states
  loadingModels: '加载模型列表…',
  testing: '测试中…',
  test: '测试',
  saving: '保存中…',
  save: '保存模型',

  // Result fallbacks
  okDefault: '连接成功',
  failDefault: '连接失败',
  saveFailDefault: '保存失败',
  networkError: '网络错误',

  // Actions
  cancel: '取消',

  // Providers — 16 built-in
  provider: {
    openai: 'OpenAI',
    anthropic: 'Anthropic (Claude)',
    deepseek: 'DeepSeek',
    gemini: 'Google (Gemini)',
    xai: 'xAI (Grok)',
    meta: 'Meta (Llama)',
    mistral: 'Mistral AI',
    minimax: 'MiniMax',
    moonshot: 'Moonshot (Kimi)',
    zhipu: '智谱 (GLM)',
    qwen: '阿里 (Qwen)',
    cohere: 'Cohere',
    groq: 'Groq',
    together: 'Together AI',
    openrouter: 'OpenRouter',
    ollama: 'Ollama (本地)',
  },
};
