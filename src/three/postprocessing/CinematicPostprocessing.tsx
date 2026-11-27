'use client';

/**
 * CinematicPostprocessing — tier-adaptive ACES Filmic + mipmap Bloom + Vignette rig.
 *
 * Enforces `multisampling={0}` across every GPU tier so EffectComposer FBOs never
 * stall mobile or integrated GPUs, and raises the bloom luminance threshold so
 * only genuine specular highlights (sunlit cloud tops, gold JWST mirrors, limb
 * scatter) emit optical bloom.
 */

import React, { memo } from 'react';
import { EffectComposer, Bloom, Vignette, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';

export interface CinematicPostprocessingProps {
  /** Mount postprocessing composer when active. */
  enabled: boolean;
  /** Mipmap bloom intensity. Defaults to 0.78. */
  bloomIntensity?: number;
  /** Luminance threshold above which optical bloom triggers. Defaults to 0.86. */
  luminanceThreshold?: number;
  /** Subtle edge vignette darkness. Defaults to 0.52. */
  vignetteDarkness?: number;
}

export const CinematicPostprocessing: React.FC<CinematicPostprocessingProps> = memo(
  function CinematicPostprocessing({
    enabled,
    bloomIntensity = 0.78,
    luminanceThreshold = 0.86,
    vignetteDarkness = 0.52,
  }) {
    if (!enabled) {
      return null;
    }

    return (
      <EffectComposer multisampling={0}>
        <Bloom
          mipmapBlur
          luminanceThreshold={luminanceThreshold}
          luminanceSmoothing={0.28}
          intensity={bloomIntensity}
          radius={0.55}
        />
        <Vignette eskil={false} offset={0.28} darkness={vignetteDarkness} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    );
  }
);

export default CinematicPostprocessing;
