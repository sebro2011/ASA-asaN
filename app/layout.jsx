import React from 'react';
import '../src/globals.css';
import TrilingualProvider from '../src/context/TrilingualProvider';
import DynamicLiquidFilter from '../src/components/DynamicLiquidFilter.jsx';

export const metadata = {
  title: 'NASA Trilingual Space Exploration & APOD',
  description: 'Trilingual (Sinhala, Tamil, English) NASA space exploration app featuring real-time APOD with keyless AI dynamic translation, interactive 3D space visualizations, and Apple Liquid Glass design.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#030712] text-slate-100 antialiased selection:bg-cyan-500/30 selection:text-cyan-200 relative overflow-x-hidden">
        {/* Dynamic Interactive SVG Displacement Filter */}
        <DynamicLiquidFilter />

        {/* Fixed Glowing Ambient Blur Spots (Cyan, Purple, Blue with blur-[140px] opacity-20) */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          {/* Cyan Glowing Ambient Spot */}
          <div 
            className="fixed top-12 left-16 w-[560px] h-[560px] rounded-full bg-cyan-400 blur-[140px] opacity-20 animate-orb-1"
            aria-hidden="true"
          />
          {/* Purple Glowing Ambient Spot */}
          <div 
            className="fixed top-1/3 right-12 w-[620px] h-[620px] rounded-full bg-purple-500 blur-[140px] opacity-20 animate-orb-2"
            aria-hidden="true"
          />
          {/* Blue Glowing Ambient Spot */}
          <div 
            className="fixed bottom-12 left-1/4 w-[680px] h-[680px] rounded-full bg-blue-600 blur-[140px] opacity-20 animate-orb-3"
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
