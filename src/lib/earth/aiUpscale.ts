/**
 * Optional AI super-resolution adapter.
 *
 * ---------------------------------------------------------------------------
 * EVALUATION (2026-10-27, against the live npm registry)
 * ---------------------------------------------------------------------------
 * Candidate: UpscalerJS 1.0.0 (https://github.com/thekevinscott/UpscalerJS)
 *
 *  - License:        MIT (UpscalerJS); Apache-2.0 (@tensorflow/tfjs).
 *  - Peer dep:       @tensorflow/tfjs ~4.11.0 — pinned to the 4.11 line while
 *                    the current tfjs release is 4.22.0, so installation needs
 *                    `--legacy-peer-deps` / an npm override in this repo.
 *  - Install weight: @tensorflow/tfjs unpacks to ~147 MB; even the minimal
 *                    tfjs-core + converter + WebGL backend path ships several
 *                    MB of minified JS, versus this app's mobile budget where
 *                    GLB spacecraft models are kept under ~125 KB each.
 *  - Model weights:  @upscalerjs/default-model ≈ 1.1 MB, downloaded at runtime
 *                    from a Google-hosted origin (storage.googleapis.com) —
 *                    a new external host and a second fetch before first use.
 *  - Execution:      WebGL/WebGPU via tfjs, WASM/CPU backend available but
 *                    heavy; inference cannot be verified in this sandbox (no
 *                    browser/GPU), so shipping it untested would risk a broken
 *                    "AI" button in production.
 *
 * Decision: do NOT add tfjs/UpscalerJS to the dependency tree yet. The viewer
 * ships the fully working browser canvas pipeline (`enhance.ts`) and the UI
 * reports processing honestly as "Browser-enhanced visualization". This module
 * defines the contract a verified AI backend must implement so it can be added
 * later without touching the viewer's state machine. No CSS/canvas output is
 * ever labelled as AI.
 *
 * To enable a real backend later:
 *  1. Add `upscaler` + `@upscalerjs/default-model` with an explicit tfjs
 *     override; document the new runtime host (model weights origin).
 *  2. Implement `AiUpscaleBackend.upscale` with a dynamic `import('upscaler')`
 *     so the library stays in its own lazy chunk (never in the initial bundle).
 *  3. Surface real model-load/inference progress; keep the AbortSignal and the
 *     automatic fallback to `enhanceFrame` on any failure.
 * ---------------------------------------------------------------------------
 */

import type { EnhancementSettings, PixelFrame } from './enhance';

export type AiBackendStatus = 'unavailable' | 'ready' | 'error';

export interface AiUpscaleOptions {
  signal?: AbortSignal;
  /** Real, measurable progress 0..1. Never report completion before inference. */
  onProgress?: (fraction: number) => void;
}

export interface AiUpscaleResult {
  frame: PixelFrame;
  backendId: string;
  modelLabel: string;
}

export interface AiUpscaleBackend {
  id: string;
  status: AiBackendStatus;
  /** Human-readable reason when the backend is not available. */
  statusDetail: string;
  /** True only when a model is actually loaded and can run locally. */
  isAvailable(): boolean;
  upscale(frame: PixelFrame, options?: AiUpscaleOptions): Promise<AiUpscaleResult>;
}

/**
 * Placeholder backend. It never performs or simulates AI work and never
 * resolves with a "success": the viewer treats `unavailable` as a signal to
 * stay on the browser-enhancement pipeline.
 */
class UnavailableAiBackend implements AiUpscaleBackend {
  readonly id = 'none';

  status: AiBackendStatus = 'unavailable';

  statusDetail =
    'AI super-resolution is not bundled in this build. Browser-based canvas enhancement is applied locally; no model weights are downloaded.';

  isAvailable(): boolean {
    return false;
  }

  async upscale(): Promise<AiUpscaleResult> {
    throw new Error('No AI super-resolution backend is configured.');
  }
}

let backend: AiUpscaleBackend | null = null;

/** Resolve the AI backend. Replace this factory when wiring a real model. */
export function getAiUpscaleBackend(): AiUpscaleBackend {
  if (!backend) backend = new UnavailableAiBackend();
  return backend;
}

/** Convenience guard used by the viewer to decide which label to show. */
export function aiSuperResolutionAvailable(): boolean {
  return getAiUpscaleBackend().isAvailable();
}

/** Settings the future AI stage would accept alongside the browser pipeline. */
export interface PlannedAiStage {
  enabled: boolean;
  settings: EnhancementSettings;
}
