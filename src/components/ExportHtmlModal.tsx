import React, { useState, useEffect } from 'react';
import { SupportedLanguage, translations } from '../i18n/translations';
import { Copy, Check, Download, ExternalLink, X, Code2, Eye, FileCode } from 'lucide-react';

interface ExportHtmlModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: SupportedLanguage;
}

export const ExportHtmlModal: React.FC<ExportHtmlModalProps> = ({ isOpen, onClose, lang }) => {
  const t = translations[lang];
  const [copied, setCopied] = useState<boolean>(false);
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'code' | 'preview'>('code');

  useEffect(() => {
    if (isOpen) {
      fetch('/standalone.html')
        .then(res => res.text())
        .then(code => {
          if (code) setHtmlContent(code);
        })
        .catch(() => {
          // Graceful fallback handled in UI
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(htmlContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownload = () => {
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nasa-apod-trilingual.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-950 border border-cyan-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{t.exportModalTitle}</h3>
              <p className="text-xs text-slate-400">{t.exportModalDesc}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab & Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-slate-800 bg-slate-900/40">
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setActiveTab('code')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'code' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              Source HTML
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'preview' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Live Preview
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 transition flex items-center gap-1.5 shadow-sm"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-cyan-400" />}
              <span>{copied ? t.copiedText : t.copyHtmlCode}</span>
            </button>

            <button
              onClick={handleDownload}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition flex items-center gap-1.5 shadow-md shadow-cyan-600/30"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t.downloadHtmlFile}</span>
            </button>

            <a
              href="/standalone.html"
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 transition flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t.openStandaloneTab}</span>
            </a>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-auto p-5 bg-slate-950 font-mono text-xs text-slate-300">
          {activeTab === 'code' ? (
            <pre className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 overflow-x-auto selection:bg-cyan-500/30 whitespace-pre">
              <code>{htmlContent || 'Loading single-file HTML code...'}</code>
            </pre>
          ) : (
            <div className="w-full h-[500px] rounded-xl overflow-hidden border border-slate-800 bg-black">
              <iframe
                src="/standalone.html"
                title="Single HTML Preview"
                className="w-full h-full border-none"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
