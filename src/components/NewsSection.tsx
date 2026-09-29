import React from 'react';
import { SupportedLanguage } from '../i18n/translations';
import NasaNewsFeed from './NasaNewsFeed.jsx';

interface NewsSectionProps {
  lang: SupportedLanguage;
}

export const NewsSection: React.FC<NewsSectionProps> = ({ lang }) => {
  return (
    <div className="w-full">
      <NasaNewsFeed />
    </div>
  );
};
