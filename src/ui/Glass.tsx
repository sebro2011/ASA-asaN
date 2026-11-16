'use client';

/**
 * Glass — the only place a translucent surface is chosen in this product.
 *
 * The interface had 69 raw `backdrop-blur-*` utilities across 27 files: the same
 * kind of panel was 4 px of blur on one page and 40 px on another, and every
 * adjustment meant editing each site by hand. The three tones below are the whole
 * vocabulary:
 *
 *   panel  — the default surface (cards, strips, nav)
 *   strong — sheets, modals, anything whose text sits over imagery
 *   inset  — a surface *inside* a surface (nested lists, code, metrics)
 *
 * The blur, fill and edge come from tokens in `src/styles/tokens.css`, so a
 * redesign is a token change, not a sweep through components. Tone classes live in
 * the components layer, which means a caller can still override the fill
 * (`bg-surface/40`) or the edge (`border-line`) with a utility when a surface
 * genuinely needs to differ — the blur stays shared.
 *
 * Server-render safe: no hooks, no effects, no measurement.
 */

import React from 'react';
import { cx } from './primitives';

export type GlassTone = 'panel' | 'strong' | 'inset';

const TONE_CLASS: Record<GlassTone, string> = {
  panel: 'glass',
  strong: 'glass-strong',
  inset: 'glass-inset'
};

const TAGS = ['div', 'section', 'aside', 'article', 'header', 'footer', 'nav', 'form', 'li'] as const;
export type GlassTag = (typeof TAGS)[number];

export interface GlassProps extends React.HTMLAttributes<HTMLElement> {
  /** React 19 passes refs as props; a measured surface must still be measurable. */
  ref?: React.Ref<HTMLElement>;
  /** Element to render. Defaults to `div`; semantics are never traded for style. */
  as?: GlassTag;
  tone?: GlassTone;
  /** Adds the one-pixel specular hairline that makes glass read as a physical edge. */
  specular?: boolean;
  children?: React.ReactNode;
}

export function Glass({
  as = 'div',
  tone = 'panel',
  specular = false,
  className,
  children,
  ref,
  ...rest
}: GlassProps) {
  const Component = as as React.ElementType;
  return (
    <Component
      ref={ref}
      className={cx(TONE_CLASS[tone], specular && 'surface-highlight', className)}
      {...rest}
    >
      {children}
    </Component>
  );
}

export default Glass;
