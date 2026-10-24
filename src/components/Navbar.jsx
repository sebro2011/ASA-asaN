import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Logo from './Logo';
import { 
  Rocket, 
  Compass, 
  Newspaper, 
  Orbit, 
  Sparkles, 
  Globe2, 
  ChevronDown, 
  Check, 
  Menu, 
  X,
  Bot,
  Flame
} from 'lucide-react';

/**
 * Trilingual Navigation definitions
 */
const NAV_ITEMS = [
  {
    id: 'apod',
    icon: Compass,
    labels: {
      en: 'APOD',
      si: 'දවසේ ඡායාරූපය',
      ta: 'வானியல் படம்'
    }
  },
  {
    id: 'launch',
    icon: Flame,
    badge: 'SIM',
    labels: {
      en: 'Launch Sim',
      si: 'දියත්කිරීම',
      ta: 'ஏவுதல்'
    }
  },
  {
    id: 'news',
    icon: Newspaper,
    labels: {
      en: 'News',
      si: 'නාසා පුවත්',
      ta: 'செய்திகள்'
    }
  },
  {
    id: '3d',
    icon: Orbit,
    labels: {
      en: '3D Space Lab',
      si: '3D අභ්‍යවකාශගාරය',
      ta: '3D ஆய்வகம்'
    }
  },
  {
    id: 'assistant',
    icon: Bot,
    badge: 'AI',
    labels: {
      en: 'AI Assistant',
      si: 'AI සහකරු',
      ta: 'AI உதவியாளர்'
    }
  }
];

const LANGUAGES = [
  { code: 'en', label: 'English', nativeName: 'English', flag: '🇬🇧' },
  { code: 'si', label: 'Sinhala', nativeName: 'සිංහල', flag: '🇱🇰' },
  { code: 'ta', label: 'Tamil', nativeName: 'தமிழ்', flag: '🇮🇳' }
];

/**
 * Navbar component for NASA Space Explorer Web Application
 * 
 * @param {Object} props
 * @param {string} [props.activeTab='apod'] - Currently selected tab id
 * @param {(tabId: string) => void} [props.onTabChange=() => {}] - Callback when navigation tab is clicked
 * @param {() => void} [props.onOpenAssistant] - Optional callback to trigger AI assistant modal
 * @param {string} [props.className=''] - Additional container classes
 */
export default function Navbar({
  activeTab = 'apod',
  onTabChange = () => {},
  onOpenAssistant,
  className = ''
}) {
  const { i18n } = useTranslation();
  const currentLang = (i18n.language || 'en').slice(0, 2);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close language switcher dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLanguageSelect = (code) => {
    i18n.changeLanguage(code);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = code;
    }
    setDropdownOpen(false);
  };

  const handleNavClick = (tabId) => {
    if (tabId === 'assistant' && onOpenAssistant) {
      onOpenAssistant();
    } else {
      onTabChange(tabId);
    }
    setMobileMenuOpen(false);
  };

  const activeLang = LANGUAGES.find(l => l.code === currentLang) || LANGUAGES[0];

  return (
    <nav className={`sticky top-0 z-40 w-full bg-abyss/95 backdrop-blur-md border-b border-line transition-colors ${className}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20 gap-4">
          
          {/* Logo & Branding: NASA Space Explorer with Logo Component */}
          <div 
            onClick={() => handleNavClick('apod')}
            className="flex items-center gap-3 cursor-pointer select-none group"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && handleNavClick('apod')}
          >
            <Logo size="md" />

            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-base sm:text-lg tracking-tight font-['Orbitron',sans-serif]">
                  NASA <span className="text-cyan-400">Space Explorer</span>
                </span>
              </div>
              <p className="text-[11px] text-ink-3 font-medium tracking-wide hidden sm:block">
                {currentLang === 'si' ? 'තුන්භාෂා අභ්‍යවකාශ ද්වාරය' : currentLang === 'ta' ? 'முமொழி விண்வெளி தளம்' : 'Cosmic Exploration Portal'}
              </p>
            </div>
          </div>

          {/* Desktop Trilingual Navigation Links */}
          <div className="hidden md:flex items-center gap-1 lg:gap-2">
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;
              const label = item.labels[currentLang] || item.labels.en;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={`px-3.5 py-2 rounded-[10px] text-xs sm:text-sm font-semibold transition-all duration-150 flex items-center gap-2 select-none ${
                    isActive
                      ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm'
                      : 'text-ink-3 hover:text-ink hover:bg-surface/60 border border-transparent'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-ink-3'}`} />
                  <span>{label}</span>
                  {item.badge && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-signal border border-emerald-500/30">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right Action: Language Switcher Dropdown & Mobile Toggle */}
          <div className="flex items-center gap-2.5">
            {/* Language Switcher Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-[10px] bg-surface/60 border border-line text-ink-2 hover:text-ink hover:border-line text-xs sm:text-sm font-medium transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                aria-haspopup="true"
                aria-expanded={dropdownOpen}
                aria-label="Select Language"
              >
                <Globe2 className="w-4 h-4 text-cyan-400" />
                <span className="hidden sm:inline text-xs font-semibold">{activeLang.flag}</span>
                <span className="text-xs font-semibold">{activeLang.nativeName}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-ink-3 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropdownOpen && (
                <div 
                  className="absolute right-0 mt-2 w-44 rounded-[10px] bg-surface/60 border border-line shadow-2xl p-1 z-50 animate-in fade-in zoom-in-95 duration-100"
                  role="menu"
                >
                  <div className="px-3 py-1.5 text-[10px] font-mono text-ink-3 uppercase tracking-wider border-b border-line">
                    Language / භාෂාව / மொழி
                  </div>
                  <div className="py-1">
                    {LANGUAGES.map((lang) => {
                      const isSelected = lang.code === currentLang;
                      return (
                        <button
                          key={lang.code}
                          type="button"
                          onClick={() => handleLanguageSelect(lang.code)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-[8px] text-xs font-medium transition-colors ${
                            isSelected
                              ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                              : 'text-ink-2 hover:text-ink hover:bg-surface-2/60'
                          }`}
                          role="menuitem"
                        >
                          <div className="flex items-center gap-2">
                            <span>{lang.flag}</span>
                            <span>{lang.nativeName}</span>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Hamburger Toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-[10px] bg-surface/60 border border-line text-ink-2 hover:text-ink hover:border-line transition"
              aria-label="Toggle Navigation Menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-5 h-5 text-white" /> : <Menu className="w-5 h-5 text-ink-2" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Navigation Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-line py-3 space-y-1 animate-in fade-in slide-in-from-top-2 duration-150">
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;
              const label = item.labels[currentLang] || item.labels.en;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center justify-between px-4 py-2.5 rounded-[10px] text-xs sm:text-sm font-semibold transition ${
                    isActive
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'text-ink-2 hover:text-ink hover:bg-surface/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-ink-3'}`} />
                    <span>{label}</span>
                  </div>
                  {item.badge && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-signal border border-emerald-500/30">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
}
