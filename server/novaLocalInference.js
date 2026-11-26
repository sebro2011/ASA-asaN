/**
 * Workspace-chat local inference boundary.
 *
 * The runtime adapters are shared with NOVA L.I.F.E. (`modelFabric.js`); this
 * module deliberately exposes only its three local adapters. It requires an
 * explicitly configured model id, accepts loopback endpoints only, forces the
 * model fabric into LOCAL_ONLY mode, and blocks redirects/non-loopback fetches.
 * It never probes or selects a model during configuration discovery.
 */
import { isIP } from 'node:net';
import { createModelFabric } from './life/modelFabric.js';

const LOCAL_PROVIDERS = new Set(['ollama', 'openai-compatible', 'llama-cpp']);

const LOCAL_PROVIDER_LABELS = {
  ollama: 'Ollama (local)',
  'openai-compatible': 'OpenAI-compatible local runtime',
  'llama-cpp': 'llama.cpp (local)',
};

function envString(env, name) {
  return typeof env?.[name] === 'string' ? env[name].trim() : '';
}

function envEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function validModelId(value) {
  const model = typeof value === 'string' ? value.trim() : '';
  if (!model || model.length > 160 || /[\u0000-\u001f\u007f]/.test(model)) return null;
  return model;
}

/**
 * Accept literal loopback IPs only. In particular, don't let a chat request
 * turn a provider labelled "local" into a request to a hosted API or a redirect
 * from a local model server to an internet host.
 */
export function isLoopbackModelEndpoint(value) {
  try {
    const url = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    if (url.username || url.password || url.search || url.hash) return false;
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (isIP(host) === 4) {
      const octets = host.split('.').map(Number);
      return octets.length === 4 && octets.every((part) => part >= 0 && part <= 255) && octets[0] === 127;
    }
    return isIP(host) === 6 && host === '::1';
  } catch {
    return false;
  }
}

function providerEndpoint(env, provider) {
  if (provider === 'ollama') return envString(env, 'OLLAMA_BASE_URL') || 'http://127.0.0.1:11434';
  if (provider === 'openai-compatible') {
    return envString(env, 'OPENAI_COMPAT_BASE_URL') || envString(env, 'LOCAL_OPENAI_BASE_URL');
  }
  if (provider === 'llama-cpp') return envString(env, 'LLAMA_CPP_BASE_URL') || 'http://127.0.0.1:8080';
  return '';
}

/**
 * Resolve configuration without making a request or choosing a model size.
 * The model id must come from the operator's existing configuration; an unset
 * id leaves the established deterministic engine as the Local-mode response.
 */
export function getNovaLocalInferenceConfig({ env = process.env } = {}) {
  const providerValue = envString(env, 'NOVA_CHAT_LOCAL_PROVIDER') || 'ollama';
  const provider = providerValue.toLowerCase();
  if (!LOCAL_PROVIDERS.has(provider)) {
    return {
      mode: 'deterministic',
      configured: false,
      provider: null,
      model: null,
      code: 'LOCAL_MODEL_PROVIDER_INVALID',
      status: 400,
    };
  }

  const rawModel = provider === 'llama-cpp'
    ? envString(env, 'NOVA_LOCAL_MODEL') || envString(env, 'LLAMA_CPP_MODEL')
    : envString(env, 'NOVA_LOCAL_MODEL');
  const model = validModelId(rawModel);
  if (rawModel && !model) {
    return {
      mode: 'deterministic',
      configured: false,
      provider: null,
      model: null,
      code: 'LOCAL_MODEL_ID_INVALID',
      status: 400,
    };
  }
  if (!model) {
    return {
      mode: 'deterministic',
      configured: false,
      provider: null,
      model: null,
      code: 'LOCAL_MODEL_NOT_CONFIGURED',
      status: 0,
    };
  }

  const endpoint = providerEndpoint(env, provider);
  const explicitlyEnabled = provider !== 'llama-cpp'
    || envEnabled(env?.LLAMA_CPP_ENABLED)
    || Boolean(envString(env, 'LLAMA_CPP_BASE_URL'));
  if (!endpoint || !explicitlyEnabled) {
    return {
      mode: 'deterministic',
      configured: false,
      provider: null,
      model: null,
      code: 'LOCAL_MODEL_ENDPOINT_NOT_CONFIGURED',
      status: 0,
    };
  }
  if (!isLoopbackModelEndpoint(endpoint)) {
    return {
      mode: 'deterministic',
      configured: false,
      provider: null,
      model: null,
      code: 'LOCAL_MODEL_REMOTE_BLOCKED',
      status: 403,
    };
  }

  return { mode: 'local-model', configured: true, provider, model, code: 'OK', status: 200 };
}

function guardedLocalFetch(fetchImpl) {
  return async (input, init = {}) => {
    const rawUrl = typeof input === 'string' || input instanceof URL
      ? String(input)
      : typeof input?.url === 'string'
        ? input.url
        : '';
    if (!isLoopbackModelEndpoint(rawUrl)) {
      const error = new Error('LOCAL_MODEL_REMOTE_BLOCKED');
      error.code = 'LOCAL_MODEL_REMOTE_BLOCKED';
      throw error;
    }
    // Do not follow a redirect from a loopback server to a remote destination.
    return fetchImpl(input, { ...init, redirect: 'manual' });
  };
}

function safeErrorCode(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  return /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : 'LOCAL_MODEL_UNAVAILABLE';
}

function safeStatus(error) {
  const status = Number(error?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 503;
}

export function createNovaLocalInference({
  env = process.env,
  fetchImpl = (...args) => globalThis.fetch(...args),
  modelFabric = null,
  createFabric = createModelFabric,
} = {}) {
  const configuration = getNovaLocalInferenceConfig({ env });
  // The fabric is the existing L.I.F.E. implementation, but this chat boundary
  // is independently local-only even if the main chat's Auto mode has cloud keys.
  // Pass an allowlist of local settings rather than the full process environment:
  // hosted credentials never enter this model-fabric instance.
  const localEnv = {
    NOVA_LOCAL_ONLY: '1',
    NOVA_RESOURCE_PROFILE: env?.NOVA_RESOURCE_PROFILE,
    NOVA_GPU_VRAM_GB: env?.NOVA_GPU_VRAM_GB,
    NOVA_GPU_VENDOR: env?.NOVA_GPU_VENDOR,
    NOVA_LOCAL_MODEL: configuration.model || '',
    NOVA_LOCAL_CONTEXT: envString(env, 'NOVA_LOCAL_CONTEXT'),
    NOVA_LOCAL_TIMEOUT_MS: envString(env, 'NOVA_LOCAL_TIMEOUT_MS'),
    OLLAMA_BASE_URL: envString(env, 'OLLAMA_BASE_URL') || 'http://127.0.0.1:11434',
    OPENAI_COMPAT_BASE_URL: envString(env, 'OPENAI_COMPAT_BASE_URL'),
    LOCAL_OPENAI_BASE_URL: envString(env, 'LOCAL_OPENAI_BASE_URL'),
    LLAMA_CPP_BASE_URL: envString(env, 'LLAMA_CPP_BASE_URL') || 'http://127.0.0.1:8080',
    LLAMA_CPP_ENABLED: envString(env, 'LLAMA_CPP_ENABLED'),
    LLAMA_CPP_MODEL: envString(env, 'LLAMA_CPP_MODEL'),
    ...(configuration.provider === 'openai-compatible' && envString(env, 'OPENAI_COMPAT_API_KEY')
      ? { OPENAI_COMPAT_API_KEY: envString(env, 'OPENAI_COMPAT_API_KEY') }
      : {}),
  };
  const fabric = modelFabric || createFabric({
    env: localEnv,
    fetchImpl: guardedLocalFetch(fetchImpl),
  });

  return {
    configuration: { ...configuration },
    async generate({ messages = [], timeoutMs = 15_000 } = {}) {
      if (!configuration.configured) {
        return {
          ok: false,
          attempted: false,
          code: configuration.code,
          status: configuration.status,
        };
      }

      try {
        const output = await fabric.generate({
          provider: configuration.provider,
          model: configuration.model,
          messages,
          temperature: 0.2,
          maxTokens: 800,
          timeoutMs,
        });
        // Treat an unexpected provider identity as a hard boundary violation.
        if (output?.kind !== 'local' || output?.provider !== configuration.provider) {
          return { ok: false, attempted: true, code: 'LOCAL_MODEL_PROVIDER_MISMATCH', status: 502 };
        }
        const text = typeof output.text === 'string' ? output.text.trim().slice(0, 20_000) : '';
        if (!text) return { ok: false, attempted: true, code: 'EMPTY_LOCAL_MODEL_RESPONSE', status: 502 };
        return {
          ok: true,
          attempted: true,
          text,
          provider: LOCAL_PROVIDER_LABELS[configuration.provider],
          model: configuration.model,
        };
      } catch (error) {
        return {
          ok: false,
          attempted: true,
          code: safeErrorCode(error),
          status: safeStatus(error),
        };
      }
    },
  };
}
