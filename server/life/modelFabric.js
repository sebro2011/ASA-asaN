/**
 * Adaptive Model Fabric — one interface over local and cloud models.
 *
 * Adapters (all plain HTTP, no SDK):
 *   ollama            native /api/chat, /api/tags, /api/embeddings    local
 *   openai-compatible any /v1/chat/completions server (LM Studio, vLLM) local
 *   llama-cpp         llama.cpp's OpenAI-compatible server               local
 *   openrouter        existing NOVA provider                             cloud
 *   gemini            existing NOVA provider                             cloud
 *
 * LOCAL_ONLY is enforced here, at the only place that can start an outbound
 * model call. When it is on, cloud adapters are not merely deprioritised — they
 * are unreachable, and a request with no local provider fails with a clear code.
 */
import { detectHardware, contextBudget } from './hardware.js';

export class LifeError extends Error {
  constructor(code, message, { status = 400, provider = null, details = null } = {}) {
    super(message);
    this.name = 'LifeError';
    this.code = code;
    this.status = status;
    this.provider = provider;
    this.details = details;
  }
}

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 180_000;

/** Local models that fit the three complexity buckets; operators can override. */
const LOCAL_MODEL_PREFERENCE = {
  simple: ['llama3.2:3b', 'qwen2.5:3b', 'phi3:mini', 'gemma2:2b'],
  standard: ['llama3.1:8b', 'qwen2.5:7b', 'mistral:7b', 'gemma2:9b'],
  complex: ['qwen2.5:14b', 'llama3.1:8b', 'mistral-nemo:12b'],
};

export function createModelFabric({
  env = process.env,
  fetchImpl = (...args) => fetch(...args),
  hardware = detectHardware({ env }),
  clock = () => new Date(),
  // Cloud calls need a *recorded* approval, not just a truthy id.
  approvalCheck = null,
} = {}) {
  const localOnly = String(env.NOVA_LOCAL_ONLY || '').toLowerCase() === '1' || env.NOVA_LOCAL_ONLY === 'true';
  const inflight = new Map();
  const healthCache = new Map();

  const providers = buildProviders(env, fetchImpl);
  const byId = new Map(providers.map((provider) => [provider.id, provider]));

  const list = () =>
    providers.map((provider) => ({
      id: provider.id,
      label: provider.label,
      kind: provider.kind,
      model: provider.defaultModel,
      baseUrl: provider.kind === 'cloud' ? provider.baseUrl : provider.baseUrl,
      configured: provider.configured(),
      localOnlyBlocks: localOnly && provider.kind === 'cloud',
    }));

  const resolve = (providerId) => {
    if (!providerId) return null;
    const provider = byId.get(providerId);
    if (!provider) throw new LifeError('UNKNOWN_PROVIDER', `Unknown provider: ${providerId}`, { status: 400 });
    return provider;
  };

  /** The providers that may be used right now under the current mode. */
  const usable = () => providers.filter((provider) => provider.configured() && (!localOnly || provider.kind === 'local'));

  function assertUsable(provider) {
    if (localOnly && provider.kind === 'cloud') {
      throw new LifeError(
        'LOCAL_ONLY_BLOCKED',
        `${provider.label} is a cloud provider and LOCAL_ONLY is enabled. Nothing was sent.`,
        { status: 409, provider: provider.id },
      );
    }
    if (!provider.configured()) {
      throw new LifeError('PROVIDER_NOT_CONFIGURED', `${provider.label} is not configured.`, {
        status: 409,
        provider: provider.id,
      });
    }
  }

  const capabilities = async (providerId) => {
    const provider = resolve(providerId);
    const base = provider.capabilities;
    try {
      const models = await provider.models();
      return { ...base, models, available: true };
    } catch (error) {
      return { ...base, models: [], available: false, error: error.message };
    }
  };

  const health = async ({ force = false } = {}) => {
    const results = [];
    for (const provider of providers) {
      const cached = healthCache.get(provider.id);
      if (!force && cached && Date.now() - cached.at < 15_000) {
        results.push(cached.value);
        continue;
      }
      const started = Date.now();
      let value;
      if (localOnly && provider.kind === 'cloud') {
        value = {
          id: provider.id,
          label: provider.label,
          kind: provider.kind,
          status: 'blocked',
          ok: false,
          latencyMs: null,
          models: [],
          detail: 'LOCAL_ONLY',
        };
      } else if (!provider.configured()) {
        value = {
          id: provider.id,
          label: provider.label,
          kind: provider.kind,
          status: 'unconfigured',
          ok: false,
          latencyMs: null,
          models: [],
          detail: 'NO_CREDENTIALS',
        };
      } else {
        try {
          const models = await provider.models();
          value = {
            id: provider.id,
            label: provider.label,
            kind: provider.kind,
            status: 'ok',
            ok: true,
            latencyMs: Date.now() - started,
            models,
            detail: null,
          };
        } catch (error) {
          value = {
            id: provider.id,
            label: provider.label,
            kind: provider.kind,
            status: 'error',
            ok: false,
            latencyMs: Date.now() - started,
            models: [],
            detail: error.code || error.message,
          };
        }
      }
      healthCache.set(provider.id, { at: Date.now(), value });
      results.push(value);
    }
    const localOk = results.some((entry) => entry.kind === 'local' && entry.ok);
    return {
      localOnly,
      localAvailable: localOk,
      providers: results,
      checkedAt: clock().toISOString(),
      hardware: hardware.profile,
    };
  };

  /** Discover models from every usable provider; persisted by the caller if wanted. */
  const discover = async () => {
    const discovered = [];
    for (const provider of usable()) {
      try {
        for (const model of await provider.models()) {
          discovered.push({ provider: provider.id, kind: provider.kind, model });
        }
      } catch {
        /* a provider that cannot list models contributes none */
      }
    }
    return discovered;
  };

  /**
   * Select a model for a task. Complexity is an explicit caller decision — the
   * engine does not guess it from the prompt length alone.
   */
  const selectModel = ({ complexity = 'standard', providerId = null, requireJson = false, needTools = false } = {}) => {
    const candidates = providerId ? [resolve(providerId)] : usable();
    for (const provider of candidates) {
      if (!provider) continue;
      if (localOnly && provider.kind === 'cloud') continue;
      if (requireJson && !provider.capabilities.json) continue;
      if (needTools && !provider.capabilities.tools) continue;
      const preferred = provider.preferredModel(complexity) || provider.defaultModel;
      if (!preferred) continue;
      return {
        provider: provider.id,
        kind: provider.kind,
        model: preferred,
        complexity,
        contextWindow: Math.min(provider.capabilities.contextWindow, hardware.profile.contextTokens * 4),
        timeoutMs: provider.capabilities.timeoutMs,
      };
    }
    if (localOnly) {
      throw new LifeError(
        'LOCAL_ONLY_NO_PROVIDER',
        'LOCAL_ONLY is enabled and no local model is reachable. Start Ollama or an OpenAI-compatible local server.',
        { status: 503 },
      );
    }
    throw new LifeError('NO_PROVIDER', 'No model provider is configured for this request.', { status: 503 });
  };

  /** Keep the newest turns, keep every system message, and report what was dropped. */
  const fitContext = (messages, { contextWindow = 8192 } = {}) => {
    const list = Array.isArray(messages) ? messages : [];
    const systems = list.filter((message) => message.role === 'system');
    const rest = list.filter((message) => message.role !== 'system');
    const budget = Math.max(256, Math.floor(contextWindow * 0.75));
    const kept = [];
    let used = systems.reduce((sum, message) => sum + estimateTokens(message.content), 0);
    for (let index = rest.length - 1; index >= 0; index -= 1) {
      const cost = estimateTokens(rest[index].content);
      if (used + cost > budget && kept.length > 0) break;
      kept.unshift(rest[index]);
      used += cost;
    }
    return { messages: [...systems, ...kept], dropped: rest.length - kept.length, estimatedTokens: used };
  };

  async function generate(request = {}) {
    const {
      provider: providerId = null,
      model = null,
      messages = [],
      temperature = 0.2,
      maxTokens = 800,
      json = false,
      tools = null,
      timeoutMs = null,
      requestId = null,
      approvalId = null,
    } = request;

    const selection = providerId
      ? (() => {
          const provider = resolve(providerId);
          assertUsable(provider);
          return {
            provider: provider.id,
            kind: provider.kind,
            model: model || provider.preferredModel('standard') || provider.defaultModel,
            contextWindow: provider.capabilities.contextWindow,
            timeoutMs: provider.capabilities.timeoutMs,
          };
        })()
      : selectModel({ complexity: request.complexity || 'standard', requireJson: json, needTools: Boolean(tools) });

    const cloudApproved = approvalId
      ? approvalCheck
        ? Boolean(approvalCheck(approvalId))
        : true
      : false;
    if (selection.kind === 'cloud' && !cloudApproved) {
      throw new LifeError(
        'APPROVAL_REQUIRED',
        'Sending content to a cloud model needs an explicit approval for this task.',
        { status: 403, provider: selection.provider },
      );
    }

    const provider = byId.get(selection.provider);
    assertUsable(provider);
    const fitted = fitContext(messages, { contextWindow: contextBudget(hardware, selection.contextWindow) });
    const controller = new AbortController();
    const id = requestId || `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const budget = Math.min(MAX_TIMEOUT_MS, Math.max(100, Number(timeoutMs) || selection.timeoutMs || DEFAULT_TIMEOUT_MS));
    const timer = setTimeout(() => controller.abort(new Error('AI_TIMEOUT')), budget);
    inflight.set(id, { controller, provider: provider.id, startedAt: Date.now() });

    try {
      const result = await provider.generate({
        model: selection.model,
        messages: fitted.messages,
        temperature,
        maxTokens,
        json,
        tools,
        signal: controller.signal,
      });
      return {
        ...result,
        requestId: id,
        provider: provider.id,
        kind: provider.kind,
        model: selection.model,
        droppedMessages: fitted.dropped,
        contextWindow: contextBudget(hardware, selection.contextWindow),
        localOnly,
      };
    } catch (error) {
      const wrapped = toLifeError(error, provider.id, controller.signal);
      throw wrapped;
    } finally {
      clearTimeout(timer);
      inflight.delete(id);
    }
  }

  /** Streaming is a generator so a caller can stop consuming and release the socket. */
  async function* stream(request = {}) {
    const {
      provider: providerId = null,
      model = null,
      messages = [],
      temperature = 0.2,
      maxTokens = 800,
      timeoutMs = null,
      approvalId = null,
    } = request;

    const provider = providerId ? resolve(providerId) : byId.get(selectModel().provider);
    assertUsable(provider);
    if (!provider.capabilities.stream) {
      throw new LifeError('STREAM_UNSUPPORTED', `${provider.label} does not stream.`, { status: 400, provider: provider.id });
    }
    const cloudApproved = approvalId ? (approvalCheck ? Boolean(approvalCheck(approvalId)) : true) : false;
    if (provider.kind === 'cloud' && !cloudApproved) {
      throw new LifeError('APPROVAL_REQUIRED', 'Cloud streaming needs an explicit approval.', { status: 403, provider: provider.id });
    }
    const controller = new AbortController();
    const id = `stream_${Date.now().toString(36)}`;
    const budget = Math.min(MAX_TIMEOUT_MS, Number(timeoutMs) || provider.capabilities.timeoutMs);
    const timer = setTimeout(() => controller.abort(new Error('AI_TIMEOUT')), budget);
    inflight.set(id, { controller, provider: provider.id, startedAt: Date.now() });
    try {
      const fitted = fitContext(messages, { contextWindow: contextBudget(hardware, provider.capabilities.contextWindow) });
      for await (const chunk of provider.stream({
        model: model || provider.defaultModel,
        messages: fitted.messages,
        temperature,
        maxTokens,
        signal: controller.signal,
      })) {
        yield { ...chunk, requestId: id, provider: provider.id };
      }
    } finally {
      clearTimeout(timer);
      inflight.delete(id);
    }
  }

  const cancel = async (requestId) => {
    const entry = inflight.get(requestId);
    if (!entry) return { cancelled: false, requestId };
    entry.controller.abort(new Error('CANCELLED'));
    inflight.delete(requestId);
    return { cancelled: true, requestId };
  };

  return {
    localOnly,
    providers: list,
    health,
    capabilities,
    discover,
    selectModel,
    fitContext,
    generate,
    stream,
    cancel,
    hardware,
    inflight: () => [...inflight.keys()],
    /** Embeddings are optional: memory retrieval works without them. */
    embed: async (text, { providerId = 'ollama' } = {}) => {
      const provider = resolve(providerId);
      if (!provider || !provider.capabilities.embeddings) return null;
      try {
        return await provider.embed(text);
      } catch {
        return null;
      }
    },
  };
}

/* ------------------------------------------------------------- helpers */

export function estimateTokens(content) {
  const text = typeof content === 'string' ? content : JSON.stringify(content ?? '');
  // ~4 characters per token is a planning estimate, not a measurement.
  return Math.ceil(text.length / 4);
}

function toLifeError(error, provider, signal) {
  if (error instanceof LifeError) return error;
  if (error?.name === 'AbortError' || signal?.aborted) {
    const reason = String(signal?.reason?.message || '');
    if (reason === 'CANCELLED') return new LifeError('CANCELLED', 'The request was cancelled.', { status: 499, provider });
    return new LifeError('AI_TIMEOUT', 'The local model did not answer in time.', { status: 504, provider });
  }
  if (error?.code === 'ECONNREFUSED' || /fetch failed|ECONNREFUSED/i.test(error?.message || '')) {
    return new LifeError('PROVIDER_UNREACHABLE', 'The provider refused the connection.', { status: 503, provider });
  }
  return new LifeError('PROVIDER_ERROR', error?.message || 'Provider failure', { status: 502, provider });
}

function trimSlash(url) {
  return String(url || '').replace(/\/+$/, '');
}

function buildProviders(env, fetchImpl) {
  const ollamaBase = trimSlash(env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434');
  const openaiBase = trimSlash(env.OPENAI_COMPAT_BASE_URL || env.LOCAL_OPENAI_BASE_URL || '');
  const llamaBase = trimSlash(env.LLAMA_CPP_BASE_URL || 'http://127.0.0.1:8080');
  const openrouterKey = env.OPENROUTER_API_KEY || '';
  const geminiKey = env.GEMINI_API_KEY || '';
  const allowNetworkLocal = String(env.NOVA_ALLOW_REMOTE_LOCAL || '').toLowerCase() === '1';

  const list = [
    {
      id: 'ollama',
      label: 'Ollama',
      kind: 'local',
      baseUrl: ollamaBase,
      defaultModel: env.NOVA_LOCAL_MODEL || 'llama3.1:8b',
      capabilities: {
        stream: true,
        json: true,
        tools: true,
        embeddings: true,
        contextWindow: Number(env.NOVA_LOCAL_CONTEXT || 8192),
        maxOutputTokens: 4096,
        timeoutMs: Number(env.NOVA_LOCAL_TIMEOUT_MS || 60_000),
        local: true,
      },
      configured: () => Boolean(ollamaBase),
      preferredModel: (complexity) => env.NOVA_LOCAL_MODEL || LOCAL_MODEL_PREFERENCE[complexity]?.[0] || 'llama3.1:8b',
      models: async () => {
        const response = await fetchImpl(`${ollamaBase}/api/tags`, { method: 'GET' });
        if (!response.ok) throw Object.assign(new Error('OLLAMA_TAGS_FAILED'), { code: 'OLLAMA_TAGS_FAILED' });
        const body = await response.json();
        return (body.models || []).map((model) => model.name).filter(Boolean);
      },
      generate: async ({ model, messages, temperature, maxTokens, json, tools, signal }) => {
        const response = await fetchImpl(`${ollamaBase}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model,
            messages,
            stream: false,
            options: { temperature, num_predict: maxTokens },
            ...(json ? { format: 'json' } : {}),
            ...(tools ? { tools } : {}),
          }),
          signal,
        });
        if (!response.ok) throw new LifeError('PROVIDER_ERROR', `Ollama answered ${response.status}`, { provider: 'ollama' });
        const body = await response.json();
        return {
          text: body.message?.content ?? '',
          toolCalls: body.message?.tool_calls ?? [],
          usage: {
            promptTokens: body.prompt_eval_count ?? null,
            completionTokens: body.eval_count ?? null,
          },
          raw: null,
        };
      },
      stream: async function* ({ model, messages, temperature, maxTokens, signal }) {
        const response = await fetchImpl(`${ollamaBase}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model, messages, stream: true, options: { temperature, num_predict: maxTokens } }),
          signal,
        });
        if (!response.ok || !response.body) throw new LifeError('PROVIDER_ERROR', `Ollama answered ${response.status}`);
        for await (const line of ndjsonLines(response.body, signal)) {
          if (line.message?.content) yield { delta: line.message.content, done: Boolean(line.done) };
        }
      },
      embed: async (text) => {
        const response = await fetchImpl(`${ollamaBase}/api/embeddings`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: env.NOVA_EMBED_MODEL || 'nomic-embed-text', prompt: text }),
        });
        if (!response.ok) return null;
        const body = await response.json();
        return Array.isArray(body.embedding) ? body.embedding : null;
      },
    },
    {
      id: 'openai-compatible',
      label: 'Local OpenAI-compatible',
      kind: 'local',
      baseUrl: openaiBase,
      defaultModel: env.NOVA_LOCAL_MODEL || 'local-model',
      capabilities: {
        stream: true,
        json: true,
        tools: true,
        embeddings: false,
        contextWindow: Number(env.NOVA_LOCAL_CONTEXT || 8192),
        maxOutputTokens: 4096,
        timeoutMs: Number(env.NOVA_LOCAL_TIMEOUT_MS || 60_000),
        local: true,
      },
      configured: () => Boolean(openaiBase),
      preferredModel: () => env.NOVA_LOCAL_MODEL || 'local-model',
      models: async () => {
        const response = await fetchImpl(`${openaiBase}/models`, {
          headers: env.OPENAI_COMPAT_API_KEY ? { authorization: `Bearer ${env.OPENAI_COMPAT_API_KEY}` } : {},
        });
        if (!response.ok) throw new Error('MODELS_FAILED');
        const body = await response.json();
        return (body.data || []).map((entry) => entry.id).filter(Boolean);
      },
      generate: async ({ model, messages, temperature, maxTokens, json, tools, signal }) =>
        openAiChat({ fetchImpl, baseUrl: openaiBase, key: env.OPENAI_COMPAT_API_KEY, model, messages, temperature, maxTokens, json, tools, signal, provider: 'openai-compatible' }),
      stream: async function* ({ model, messages, temperature, maxTokens, signal }) {
        yield* openAiStream({
          fetchImpl,
          baseUrl: openaiBase,
          key: env.OPENAI_COMPAT_API_KEY,
          model,
          messages,
          temperature,
          maxTokens,
          signal,
        });
      },
    },
    {
      id: 'llama-cpp',
      label: 'llama.cpp server',
      kind: 'local',
      baseUrl: llamaBase,
      defaultModel: env.LLAMA_CPP_MODEL || 'local-model',
      capabilities: {
        stream: true,
        json: true,
        tools: false,
        embeddings: false,
        contextWindow: Number(env.NOVA_LOCAL_CONTEXT || 4096),
        maxOutputTokens: 2048,
        timeoutMs: Number(env.NOVA_LOCAL_TIMEOUT_MS || 60_000),
        local: true,
      },
      configured: () => Boolean(llamaBase) && Boolean(env.LLAMA_CPP_ENABLED || env.LLAMA_CPP_BASE_URL),
      preferredModel: () => env.LLAMA_CPP_MODEL || 'local-model',
      models: async () => {
        const response = await fetchImpl(`${llamaBase}/v1/models`);
        if (!response.ok) throw new Error('MODELS_FAILED');
        const body = await response.json();
        return (body.data || []).map((entry) => entry.id).filter(Boolean);
      },
      generate: async ({ model, messages, temperature, maxTokens, json, signal }) =>
        openAiChat({
          fetchImpl,
          baseUrl: `${llamaBase}/v1`,
          model,
          messages,
          temperature,
          maxTokens,
          json,
          signal,
          provider: 'llama-cpp',
        }),
      stream: async function* ({ model, messages, temperature, maxTokens, signal }) {
        yield* openAiStream({ fetchImpl, baseUrl: `${llamaBase}/v1`, model, messages, temperature, maxTokens, signal });
      },
    },
    {
      id: 'openrouter',
      label: 'OpenRouter',
      kind: 'cloud',
      baseUrl: 'https://openrouter.ai/api/v1',
      defaultModel: env.NOVA_OPENROUTER_MODEL || 'openrouter/free',
      capabilities: {
        stream: true,
        json: true,
        tools: true,
        embeddings: false,
        contextWindow: 32_000,
        maxOutputTokens: 4096,
        timeoutMs: 90_000,
        local: false,
      },
      configured: () => Boolean(openrouterKey),
      preferredModel: () => env.NOVA_OPENROUTER_MODEL || 'openrouter/free',
      models: async () => {
        const response = await fetchImpl('https://openrouter.ai/api/v1/models', {
          headers: { authorization: `Bearer ${openrouterKey}` },
        });
        if (!response.ok) throw new Error('MODELS_FAILED');
        const body = await response.json();
        return (body.data || []).slice(0, 200).map((entry) => entry.id);
      },
      generate: async ({ model, messages, temperature, maxTokens, json, tools, signal }) =>
        openAiChat({
          fetchImpl,
          baseUrl: 'https://openrouter.ai/api/v1',
          key: openrouterKey,
          model,
          messages,
          temperature,
          maxTokens,
          json,
          tools,
          signal,
          provider: 'openrouter',
          extraHeaders: { 'HTTP-Referer': env.APP_URL || 'https://nova.local', 'X-Title': 'NOVA NEXUS' },
        }),
      stream: async function* ({ model, messages, temperature, maxTokens, signal }) {
        yield* openAiStream({
          fetchImpl,
          baseUrl: 'https://openrouter.ai/api/v1',
          key: openrouterKey,
          model,
          messages,
          temperature,
          maxTokens,
          signal,
        });
      },
    },
    {
      id: 'gemini',
      label: 'Google Gemini',
      kind: 'cloud',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      defaultModel: env.NOVA_GEMINI_MODEL || 'gemini-3.8-flash',
      capabilities: {
        stream: false,
        json: true,
        tools: false,
        embeddings: false,
        contextWindow: 32_000,
        maxOutputTokens: 4096,
        timeoutMs: 90_000,
        local: false,
      },
      configured: () => Boolean(geminiKey),
      preferredModel: () => env.NOVA_GEMINI_MODEL || 'gemini-3.8-flash',
      models: async () => {
        const response = await fetchImpl(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(geminiKey)}`,
        );
        if (!response.ok) throw new Error('MODELS_FAILED');
        const body = await response.json();
        return (body.models || []).map((entry) => String(entry.name || '').replace(/^models\//, '')).filter(Boolean);
      },
      generate: async ({ model, messages, temperature, maxTokens, json, signal }) => {
        const system = messages
          .filter((message) => message.role === 'system')
          .map((message) => message.content)
          .join('\n\n');
        const contents = messages
          .filter((message) => message.role !== 'system')
          .map((message) => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: String(message.content ?? '') }],
          }));
        const response = await fetchImpl(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
              contents,
              generationConfig: {
                temperature,
                maxOutputTokens: maxTokens,
                ...(json ? { responseMimeType: 'application/json' } : {}),
              },
            }),
            signal,
          },
        );
        if (!response.ok) throw new LifeError('PROVIDER_ERROR', `Gemini answered ${response.status}`, { provider: 'gemini' });
        const body = await response.json();
        const text = (body.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('');
        return {
          text,
          toolCalls: [],
          usage: {
            promptTokens: body.usageMetadata?.promptTokenCount ?? null,
            completionTokens: body.usageMetadata?.candidatesTokenCount ?? null,
          },
          raw: null,
        };
      },
    },
  ];

  // `allowNetworkLocal` is accepted so an operator can deliberately permit a LAN
  // Ollama host; it never changes which providers are "cloud".
  if (allowNetworkLocal) {
    /* documented switch; no behavioural change inside this module */
  }

  return list;
}

async function openAiChat({
  fetchImpl,
  baseUrl,
  key = null,
  model,
  messages,
  temperature,
  maxTokens,
  json,
  tools,
  signal,
  provider,
  extraHeaders = {},
}) {
  const response = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
      ...(tools ? { tools } : {}),
    }),
    signal,
  });
  if (!response.ok) throw new LifeError('PROVIDER_ERROR', `${provider} answered ${response.status}`, { provider });
  const body = await response.json();
  const message = body.choices?.[0]?.message || {};
  return {
    text: typeof message.content === 'string' ? message.content : extractOpenAiText(message.content),
    toolCalls: message.tool_calls || [],
    usage: {
      promptTokens: body.usage?.prompt_tokens ?? null,
      completionTokens: body.usage?.completion_tokens ?? null,
    },
    raw: null,
  };
}

async function* openAiStream({ fetchImpl, baseUrl, key = null, model, messages, temperature, maxTokens, signal }) {
  const response = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream: true }),
    signal,
  });
  if (!response.ok || !response.body) throw new LifeError('PROVIDER_ERROR', `Stream answered ${response.status}`);
  for await (const event of sseData(response.body, signal)) {
    if (event === '[DONE]') {
      yield { delta: '', done: true };
      return;
    }
    try {
      const parsed = JSON.parse(event);
      const delta = parsed.choices?.[0]?.delta?.content;
      if (delta) yield { delta, done: false };
    } catch {
      /* a keep-alive comment or a malformed frame is skipped, never forwarded */
    }
  }
}

function extractOpenAiText(content) {
  if (!Array.isArray(content)) return '';
  return content.map((part) => part?.text || '').join('');
}

async function* ndjsonLines(body, signal) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of iterate(body, signal)) {
    buffer += decoder.decode(chunk, { stream: true });
    let index = buffer.indexOf('\n');
    while (index >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line) {
        try {
          yield JSON.parse(line);
        } catch {
          /* ignore a partial frame */
        }
      }
      index = buffer.indexOf('\n');
    }
  }
  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer.trim());
    } catch {
      /* ignore */
    }
  }
}

async function* sseData(body, signal) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of iterate(body, signal)) {
    buffer += decoder.decode(chunk, { stream: true });
    let index = buffer.indexOf('\n');
    while (index >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line.startsWith('data:')) yield line.slice(5).trim();
      index = buffer.indexOf('\n');
    }
  }
}

async function* iterate(stream, signal) {
  const iterator = stream[Symbol.asyncIterator] ? stream[Symbol.asyncIterator]() : null;
  if (iterator) {
    while (true) {
      if (signal?.aborted) return;
      const { value, done } = await iterator.next();
      if (done) return;
      yield value;
    }
  }
}
