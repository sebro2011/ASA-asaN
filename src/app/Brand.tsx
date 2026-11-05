/**
 * NOVA brand marks.
 *
 * The artwork is inlined (not an <img>) so the mark inherits the workspace
 * theme, animates with currentColor where useful, and never costs a network
 * request on the critical path. `public/brand/*.svg` carries the same geometry
 * for favicons, the PWA icon set and social previews.
 */
import { useId } from 'react';

export function NovaMark({ size = 22, className = '' }: { size?: number; className?: string }) {
  const gradientId = useId().replace(/:/g, '');
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="NOVA"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="4" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#C3D2FF" />
          <stop offset="0.52" stopColor="#5B84FF" />
          <stop offset="1" stopColor="#7A58FF" />
        </linearGradient>
      </defs>
      <path
        d="M13 2.4c.92 5.6 4.08 8.76 9.68 9.68-5.6.92-8.76 4.08-9.68 9.68-.92-5.6-4.08-8.76-9.68-9.68C8.92 11.16 12.08 8 13 2.4Z"
        fill={`url(#${gradientId})`}
      />
      <path
        d="M23.6 17.8c.42 2.56 1.86 4 4.42 4.42-2.56.42-4 1.86-4.42 4.42-.42-2.56-1.86-4-4.42-4.42 2.56-.42 4-1.86 4.42-4.42Z"
        fill="currentColor"
        fillOpacity="0.92"
      />
    </svg>
  );
}

export function NovaWordmark({
  collapsed = false,
  showTag = true,
}: {
  collapsed?: boolean;
  showTag?: boolean;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] border border-ws-line bg-[linear-gradient(160deg,rgba(23,28,43,0.95),rgba(8,10,17,0.95))]">
        <NovaMark size={19} className="text-white" />
      </span>
      {collapsed ? null : (
        <span className="min-w-0">
          <span className="flex items-baseline gap-1.5">
            <span className="text-[14.5px] font-semibold leading-none tracking-[-0.02em] text-ws-text">
              NOVA
            </span>
            <span className="text-[14.5px] font-semibold leading-none tracking-[-0.01em] text-ws-accent-ink">
              AI
            </span>
          </span>
          {showTag ? (
            <span className="mt-1 block truncate font-mono text-[8.5px] uppercase tracking-[0.18em] text-ws-text-3">
              AI Workspace
            </span>
          ) : null}
        </span>
      )}
    </span>
  );
}
