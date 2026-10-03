import React from 'react';
import '../src/globals.css';
import TrilingualProvider from '../src/context/TrilingualProvider';
import DynamicLiquidFilter from '../src/components/DynamicLiquidFilter.jsx';

export const metadata = {
  title: 'NASA Trilingual Space Exploration & APOD',
  description: 'Trilingual (Sinhala, Tamil, English) NASA space exploration app featuring real-time APOD with keyless AI dynamic translation, interactive 3D space visualizations, and Apple Liquid Glass design with dynamic mouse/scroll SVG displacement refraction.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#030712] text-slate-100 antialiased selection:bg-cyan-500/30 selection:text-cyan-200 relative overflow-x-hidden">
        {/* Dynamic Interactive SVG Displacement Liquid Glass Refraction Filter */}
        <DynamicLiquidFilter />

        {/* Apple Exact Liquid Glass: 3 Animated Background Ambient Light Orbs with Dynamic Chromatic Refraction */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          {/* Orb 1: Vibrant Cyan Light Orb */}
          <div 
            className="absolute top-[6%] left-[10%] w-[580px] h-[580px] rounded-full bg-gradient-to-tr from-cyan-500/30 to-teal-400/20 blur-[130px] animate-orb-1"
            aria-hidden="true"
          />
          {/* Orb 2: Vibrant Magenta / Fuchsia Light Orb */}
          <div 
            className="absolute top-[35%] right-[6%] w-[620px] h-[620px] rounded-full bg-gradient-to-br from-fuchsia-500/25 to-pink-500/20 blur-[140px] animate-orb-2"
            aria-hidden="true"
          />
          {/* Orb 3: Deep Royal Blue / Indigo Light Orb */}
          <div 
            className="absolute bottom-[4%] left-[22%] w-[680px] h-[680px] rounded-full bg-gradient-to-r from-blue-600/30 via-indigo-600/25 to-violet-600/20 blur-[150px] animate-orb-3"
            aria-hidden="true"
          />
        </div>

        {/* Trilingual Provider & App Content */}
        <TrilingualProvider>
          <div className="relative z-10 flex flex-col min-h-screen">
            {children}
          </div>
        </TrilingualProvider>
      </body>
    </html>
  );
}
