export default {
  // Field labels
  endpoint: 'Endpoint',
  endpointPlaceholder: 'Select or type an endpoint URL',
  apiKey: 'API Key',
  apiKeyPlaceholder: 'Enter API Key',
  model: 'Model',
  modelPlaceholder: 'Select or type a model',
  displayName: 'Display Name',
  displayNamePlaceholder: 'Defaults to model name',

  // Validation
  errEndpointRequired: 'Endpoint is required',
  errModelRequired: 'Model is required',

  // Async states
  loadingModels: 'Loading models…',
  testing: 'Testing…',
  test: 'Test',
  saving: 'Saving…',
  save: 'Save Model',

  // Result fallbacks
  okDefault: 'Connection succeeded',
  failDefault: 'Connection failed',
  saveFailDefault: 'Save failed',
  networkError: 'Network error',

  // Actions
  cancel: 'Cancel',

  // Providers — 17 built-in
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
    zhipu: 'Zhipu (GLM)',
    qwen: 'Alibaba (Qwen)',
    cohere: 'Cohere',
    groq: 'Groq',
    together: 'Together AI',
    openrouter: 'OpenRouter',
    ollama: 'Ollama (local)',
    agnes: 'Agnes AI',
  },
};
