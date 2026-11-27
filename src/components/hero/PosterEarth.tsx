'use client';

/**
 * PosterEarth — the static, art-directed Earth composition.
 *
 * Kept in its own module so the hero can render the poster immediately without
 * pulling three.js / @react-three/fiber into the initial bundle. The 3D scene in
 * `OrbitalEarth.tsx` is loaded lazily and falls back to this same image.
 */

import { memo } from 'react';

export const PosterEarth = memo(function PosterEarth({ className = '' }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      {/* Subtle orbital sky-scatter aura behind Earth */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_74%_62%,rgba(42,134,224,0.26),rgba(5,9,18,0)_60%)]" />

      {/* NASA Blue Marble static globe with sunlit Rayleigh limb and night terminator */}
      <div
        className="absolute -right-[18%] bottom-[-38%] h-[118%] w-[92%] rounded-full bg-cover bg-center shadow-[0_0_130px_38px_rgba(38,128,224,0.34),inset_16px_14px_46px_rgba(125,211,252,0.42),inset_-62px_-44px_110px_rgba(2,6,16,0.92)] sm:-right-[8%] sm:bottom-[-30%] sm:h-[108%] sm:w-[62%]"
        style={{
          backgroundImage: 'url(/textures/earth/earth-day.jpg)',
          transform: 'rotate(-12deg)',
          maskImage: 'radial-gradient(circle at 50% 50%, black 58%, transparent 72%)',
          WebkitMaskImage: 'radial-gradient(circle at 50% 50%, black 58%, transparent 72%)'
        }}
      />

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_38%_18%,rgba(94,211,242,0.12),transparent_58%)]" />
    </div>
  );
});

export default PosterEarth;
