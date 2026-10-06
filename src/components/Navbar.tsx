import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Logo from './Logo';
import { 
  Globe, 
  ChevronDown, 
  Check, 
  Compass, 
  Orbit, 
  Rocket, 
  Newspaper, 
  FileText, 
  FileCode, 
  Download,
  Menu,
  X,
  Radio,
  Flame
} from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface NavbarProps {
  activeTab: 'apod' | '3d' | 'missions' | 'news' | 'launch' | string;
  onTabChange: (tab: any) => void;
  onOpenExportModal: () => void;
}

interface LanguageOption {
  code: 'en' | 'si' | 'ta';
  label: string;
  nativeName: string;
  flag: string;
  country: string;
}

const LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English', nativeName: 'English', flag: '🇬🇧', country: 'Global' },
  { code: 'si', label: 'Sinhala', nativeName: 'සිංහල', flag: '🇱🇰', country: 'Sri Lanka' },
  { code: 'ta', label: 'Tamil', nativeName: 'தமிழ்', flag: '🇮🇳', country: 'India / SL' },
];

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  onOpenExportModal,
}) => {
  const { t, i18n } = useTranslation();
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLangCode = (i18n.language || 'en').slice(0, 2) as 'en' | 'si' | 'ta';
  const currentLang = LANGUAGES.find(l => l.code === currentLangCode) || LANGUAGES[0];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const changeLanguage = (code: 'en' | 'si' | 'ta') => {
    i18n.changeLanguage(code);
    document.documentElement.lang = code;
    setDropdownOpen(false);
  };

  // Generate and export PDF using html2canvas & jsPDF
  const exportToPdf = async () => {
    try {
      setIsExportingPdf(true);
      const captureElement = document.getElementById('root') || document.body;
      
      const canvas = await html2canvas(captureElement, {
        scale: 1.5,
        useCORS: true,
        logging: false,
        backgroundColor: '#020617'
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.85);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`NASA-Cosmic-Explorer-${currentLang.code}-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-cyan-500/20 bg-slate-950/85 backdrop-blur-2xl transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20 gap-4">
          {/* Brand Logo */}
          <div 
            className="flex items-center gap-3.5 cursor-pointer group"
            onClick={() => onTabChange('apod')}
          >
            <Logo size="md" />

            <div>
              <div className="flex items-center gap-2">
                <span className="font-['Orbitron'] font-bold text-base md:text-lg tracking-tight text-white group-hover:text-cyan-200 transition-colors">
                  {t('appName')}
                </span>
                <span className="hidden lg:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  <Radio className="w-2.5 h-2.5 text-cyan-400 animate-pulse" />
                  i18n
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium tracking-wide">
                {t('appSubtitle')}
              </p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/70 border border-slate-800">
            <button
              onClick={() => onTabChange('apod')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'apod'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>{t('navApod')}</span>
            </button>

            <button
              onClick={() => onTabChange('3d')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === '3d'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Orbit className="w-3.5 h-3.5" />
              <span>{t('nav3D')}</span>
            </button>

            <button
              onClick={() => onTabChange('missions')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'missions'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Rocket className="w-3.5 h-3.5" />
              <span>{t('navMissions')}</span>
            </button>

            <button
              onClick={() => onTabChange('launch')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'launch'
                  ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              <span>Launch Sim</span>
            </button>

            <button
              onClick={() => onTabChange('news')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'news'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Newspaper className="w-3.5 h-3.5" />
              <span>{t('navNews')}</span>
            </button>
          </nav>

          {/* Right Action Bar: Language Switcher Dropdown, PDF Export, Single HTML */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Language Switcher Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/90 border border-cyan-500/30 text-white hover:border-cyan-400 text-xs font-semibold transition-all shadow-md hover:shadow-cyan-500/20"
                aria-expanded={dropdownOpen}
                aria-haspopup="true"
              >
                <span className="text-base leading-none">{currentLang.flag}</span>
                <span className="font-medium tracking-wide">{currentLang.nativeName}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-cyan-400 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {dropdownOpen && (
                <div 
                  className="absolute right-0 mt-2 w-52 rounded-2xl bg-slate-900/95 border border-cyan-500/30 shadow-2xl backdrop-blur-xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150"
                  role="menu"
                >
                  <div className="px-3 py-2 border-b border-slate-800 text-[10px] font-mono text-cyan-400 uppercase tracking-wider">
                    {t('selectLanguage')}
                  </div>
                  <div className="py-1 space-y-1">
                    {LANGUAGES.map((lang) => {
                      const isSelected = lang.code === currentLangCode;
                      return (
                        <button
                          key={lang.code}
                          onClick={() => changeLanguage(lang.code)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                            isSelected
                              ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md'
                              : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                          }`}
                          role="menuitem"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-lg leading-none">{lang.flag}</span>
                            <div className="text-left">
                              <div className="leading-snug">{lang.nativeName}</div>
                              <div className="text-[10px] opacity-70 font-normal">{lang.label}</div>
                            </div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-white" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Cosmic PDF Export Button */}
            <button
              onClick={exportToPdf}
              disabled={isExportingPdf}
              className="hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-cyan-500/40 transition shadow-sm disabled:opacity-50"
              title={t('exportPdf')}
            >
              <FileText className="w-3.5 h-3.5 text-cyan-400" />
              <span>{isExportingPdf ? t('generatingPdf') : t('exportPdf')}</span>
            </button>

            {/* Single HTML Export shortcut button */}
            <button
              onClick={onOpenExportModal}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition shadow-sm"
              title={t('navExportHtml')}
            >
              <FileCode className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline">{t('navExportHtml')}</span>
            </button>

            {/* Mobile menu hamburger button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 transition"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-slate-800 space-y-2 animate-in slide-in-from-top duration-200">
            <div className="grid grid-cols-2 gap-2 pb-3">
              <button
                onClick={() => { onTabChange('apod'); setMobileMenuOpen(false); }}
                className={`p-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 ${
                  activeTab === 'apod' ? 'bg-cyan-600 text-white' : 'bg-slate-900 text-slate-300'
                }`}
              >
                <Compass className="w-4 h-4" />
                <span>{t('navApod')}</span>
              </button>

              <button
                onClick={() => { onTabChange('3d'); setMobileMenuOpen(false); }}
                className={`p-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 ${
                  activeTab === '3d' ? 'bg-cyan-600 text-white' : 'bg-slate-900 text-slate-300'
                }`}
              >
                <Orbit className="w-4 h-4" />
                <span>{t('nav3D')}</span>
              </button>

              <button
                onClick={() => { onTabChange('missions'); setMobileMenuOpen(false); }}
                className={`p-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 ${
                  activeTab === 'missions' ? 'bg-cyan-600 text-white' : 'bg-slate-900 text-slate-300'
                }`}
              >
                <Rocket className="w-4 h-4" />
                <span>{t('navMissions')}</span>
              </button>

              <button
                onClick={() => { onTabChange('news'); setMobileMenuOpen(false); }}
                className={`p-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 ${
                  activeTab === 'news' ? 'bg-cyan-600 text-white' : 'bg-slate-900 text-slate-300'
                }`}
              >
                <Newspaper className="w-4 h-4" />
                <span>{t('navNews')}</span>
              </button>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
              <button
                onClick={() => { exportToPdf(); setMobileMenuOpen(false); }}
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-slate-200 border border-slate-800 flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                <span>{t('exportPdf')}</span>
              </button>

              <button
                onClick={() => { onOpenExportModal(); setMobileMenuOpen(false); }}
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center gap-1.5"
              >
                <FileCode className="w-3.5 h-3.5 text-amber-400" />
                <span>{t('navExportHtml')}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
