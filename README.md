# ai-model-form

[![npm version](https://img.shields.io/npm/v/ai-model-form)](https://www.npmjs.com/package/ai-model-form)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A Vue 3 AI model configuration form component backed by an Express middleware.  
Supports adding, testing, and managing AI model providers (OpenAI-compatible).

## Features

- Add/edit AI model configurations (endpoint, model name, display name, API Key)
- Built-in provider presets (OpenAI, DeepSeek, MiniMax, Ollama, and more)
- Auto-fetch model list from any OpenAI-compatible `/v1/models` endpoint
- Test API connection before saving
- Packaged as an npm library — drop into any Vue 3 project

## Volcengine Ark plans

Agent Plan and Coding Plan share the `ark.<region>.volces.com` host but **not** the path — a wrong path returns 404:

| Plan | Base URL | Model list |
|------|----------|-----------|
| Agent Plan (personal / team) | `https://ark.cn-beijing.volces.com/api/plan/v3` | built-in, plan-verified |
| Coding Plan (personal / team) | `https://ark.cn-beijing.volces.com/api/coding/v3` | built-in, plan-verified |
| Ark pay-as-you-go (not a preset) | `https://ark.cn-beijing.volces.com/api/v3` | live `/models` + your endpoints |

Both plan endpoints are OpenAI-compatible (`POST /chat/completions`, `Authorization: Bearer`) and only accept **models inside your subscription** — not self-created endpoint IDs. Their `/models` route returns the full Ark catalogue rather than the plan's model list, so this package ships a curated list instead of fetching it. A model outside the plan comes back as `404 UnsupportedModel`, which the form reports as "not in this plan" rather than "model not found".

## Tech Stack

| Layer | Technology | Port |
|-------|-----------|------|
| Frontend | Vue 3 + Vite 7 | 7432 |
| Backend | Express 5 | 9271 |

## Quick Start

```bash
# Install all dependencies
npm install
npm install --prefix client
npm install --prefix server

# Start dev servers (both at once)
npm run dev
```

- Frontend: http://localhost:7432
- Backend API: http://localhost:9271/api/ai-model

## Usage as a Library

### Install

```bash
npm install ai-model-form
```

### Frontend (Vue 3)

```vue
<script setup>
import { AddModelForm } from 'ai-model-form/client'
import 'ai-model-form/dist/ai-model-form.css'

function onSave(model) {
  console.log('Saved:', model)
}
</script>

<template>
  <AddModelForm api-base="/api/ai-model" @save="onSave" @cancel="() => {}" />
</template>
```

### Backend (Express)

```js
import { createAiModelMiddleware } from 'ai-model-form/server'

app.use('/api', createAiModelMiddleware())
```

## API Reference

### `<AddModelForm>` Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `api-base` | `string` | `/api/ai-model` | Base path for backend API |
| `initial` | `object` | `null` | Pre-fill values for editing |

### `<AddModelForm>` Events

| Event | Payload | Description |
|-------|---------|-------------|
| `save` | `{ endpoint, modelName, displayName, apiKey, id }` | Model saved successfully |
| `cancel` | — | Cancel button clicked |
| `test-success` | `{ ok, message, status }` | API test passed |
| `test-fail` | `{ ok, message }` | API test failed |

### Backend Middleware Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/ai-model/providers` | List built-in provider presets |
| `GET` | `/ai-model/models?endpoint=` | Fetch model list from an endpoint |
| `POST` | `/ai-model/test` | Test an API connection |
| `POST` | `/ai-model/models` | Save a model config |
| `GET` | `/ai-model/models/saved` | List saved model configs |
| `DELETE` | `/ai-model/models/:id` | Delete a saved model config |

## License

MIT © [xuze](https://github.com/xz333221)
