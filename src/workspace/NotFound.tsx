import { useTranslation } from 'react-i18next';
import { ArrowLeft, Compass } from 'lucide-react';
import { Link } from '../app/router';

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto flex w-full max-w-[620px] flex-col items-start px-4 py-14 sm:px-6 sm:py-20">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ws-text-3">404</p>
      <h1 className="mt-3 text-[24px] font-semibold tracking-[-0.02em] text-ws-text">
        {t('wsNotFoundTitle')}
      </h1>
      <p className="mt-2.5 text-[13.5px] leading-relaxed text-ws-text-2">{t('wsNotFoundBody')}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link to="/" className="nova-btn nova-btn--primary">
          <ArrowLeft size={15} strokeWidth={2} aria-hidden="true" />
          {t('wsBackHome')}
        </Link>
        <Link to="/explore" className="nova-btn nova-btn--secondary">
          <Compass size={15} strokeWidth={1.9} aria-hidden="true" />
          {t('wsOpenExplore')}
        </Link>
      </div>
    </div>
  );
}
