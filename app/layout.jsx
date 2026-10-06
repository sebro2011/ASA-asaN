import React from 'react';
import '../src/globals.css';
import TrilingualProvider from '../src/context/TrilingualProvider';

export const metadata = {
  title: 'NASA Trilingual Space Exploration & APOD',
  description: 'Trilingual (Sinhala, Tamil, English) NASA space exploration app featuring real-time APOD with keyless AI dynamic translation, interactive 3D space visualizations, and crisp cosmic dark design.',
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
  manifest: '/manifest.json',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#030712] text-slate-100 antialiased selection:bg-cyan-500/30 selection:text-cyan-200 relative overflow-x-hidden">
        {/* Trilingual Provider & App Content */}
        <TrilingualProvider>
          <div className="relative z-10 flex flex-col min-h-screen pb-40">
            {children}
          </div>
        </TrilingualProvider>
      </body>
    </html>
  );
}
