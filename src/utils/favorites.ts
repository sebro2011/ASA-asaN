import { useState, useEffect, useCallback } from 'react';

export interface SavedApod {
  date: string;
  title: string;
  explanation: string;
  url: string;
  hdurl?: string;
  media_type: string;
  copyright?: string;
  savedAt: number;
  translatedTitle?: string;
  translatedExplanation?: string;
}

export interface SavedMissionItem {
  missionId: string;
  savedAt: number;
}

const APOD_STORAGE_KEY = 'nasa_cosmic_saved_apods';
const MISSIONS_STORAGE_KEY = 'nasa_cosmic_saved_missions';
const FAVORITES_EVENT = 'nasa_favorites_updated';

// Safe LocalStorage Readers
export function getSavedApods(): SavedApod[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(APOD_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('Failed to read saved APODs from localStorage', err);
    return [];
  }
}

export function getSavedMissionIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(MISSIONS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('Failed to read saved Missions from localStorage', err);
    return [];
  }
}

function notifyFavoritesChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(FAVORITES_EVENT));
  }
}

export function isApodSaved(date: string): boolean {
  const list = getSavedApods();
  return list.some(item => item.date === date);
}

export function saveApod(
  apod: {
    date: string;
    title: string;
    explanation: string;
    url: string;
    hdurl?: string;
    media_type?: string;
    copyright?: string;
  },
  translations?: {
    translatedTitle?: string;
    translatedExplanation?: string;
  }
): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const current = getSavedApods();
    const existingIndex = current.findIndex(item => item.date === apod.date);
    
    if (existingIndex >= 0) {
      // Already saved - remove it (toggle off)
      current.splice(existingIndex, 1);
      localStorage.setItem(APOD_STORAGE_KEY, JSON.stringify(current));
      notifyFavoritesChanged();
      return false;
    } else {
      // Add new
      const newItem: SavedApod = {
        date: apod.date,
        title: apod.title,
        explanation: apod.explanation,
        url: apod.url,
        hdurl: apod.hdurl,
        media_type: apod.media_type || 'image',
        copyright: apod.copyright,
        savedAt: Date.now(),
        translatedTitle: translations?.translatedTitle,
        translatedExplanation: translations?.translatedExplanation
      };
      const updated = [newItem, ...current];
      localStorage.setItem(APOD_STORAGE_KEY, JSON.stringify(updated));
      notifyFavoritesChanged();
      return true;
    }
  } catch (err) {
    console.error('Error saving APOD to favorites', err);
    return false;
  }
}

export function removeSavedApod(date: string): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getSavedApods();
    const filtered = current.filter(item => item.date !== date);
    localStorage.setItem(APOD_STORAGE_KEY, JSON.stringify(filtered));
    notifyFavoritesChanged();
  } catch (err) {
    console.error('Error removing APOD from favorites', err);
  }
}

export function isMissionSaved(missionId: string): boolean {
  const list = getSavedMissionIds();
  return list.includes(missionId);
}

export function toggleSaveMission(missionId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const current = getSavedMissionIds();
    const index = current.indexOf(missionId);
    let isNowSaved = false;

    if (index >= 0) {
      current.splice(index, 1);
      isNowSaved = false;
    } else {
      current.unshift(missionId);
      isNowSaved = true;
    }

    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(current));
    notifyFavoritesChanged();
    return isNowSaved;
  } catch (err) {
    console.error('Error toggling saved mission', err);
    return false;
  }
}

export function removeSavedMission(missionId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getSavedMissionIds();
    const filtered = current.filter(id => id !== missionId);
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(filtered));
    notifyFavoritesChanged();
  } catch (err) {
    console.error('Error removing saved mission', err);
  }
}

export function clearAllFavorites(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(APOD_STORAGE_KEY);
    localStorage.removeItem(MISSIONS_STORAGE_KEY);
    notifyFavoritesChanged();
  } catch (err) {
    console.error('Error clearing favorites', err);
  }
}

/**
 * Custom React Hook for Reactive Local Storage Favorites
 */
export function useFavorites() {
  const [savedApods, setSavedApods] = useState<SavedApod[]>([]);
  const [savedMissionIds, setSavedMissionIds] = useState<string[]>([]);

  const refresh = useCallback(() => {
    setSavedApods(getSavedApods());
    setSavedMissionIds(getSavedMissionIds());
  }, []);

  useEffect(() => {
    refresh();

    const handleStorageChange = () => refresh();
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener(FAVORITES_EVENT, handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener(FAVORITES_EVENT, handleStorageChange);
    };
  }, [refresh]);

  const toggleApod = useCallback(
    (
      apod: {
        date: string;
        title: string;
        explanation: string;
        url: string;
        hdurl?: string;
        media_type?: string;
        copyright?: string;
      },
      translations?: {
        translatedTitle?: string;
        translatedExplanation?: string;
      }
    ) => {
      const res = saveApod(apod, translations);
      refresh();
      return res;
    },
    [refresh]
  );

  const toggleMission = useCallback(
    (missionId: string) => {
      const res = toggleSaveMission(missionId);
      refresh();
      return res;
    },
    [refresh]
  );

  const checkIsApodSaved = useCallback(
    (date: string) => savedApods.some(item => item.date === date),
    [savedApods]
  );

  const checkIsMissionSaved = useCallback(
    (missionId: string) => savedMissionIds.includes(missionId),
    [savedMissionIds]
  );

  return {
    savedApods,
    savedMissionIds,
    totalCount: savedApods.length + savedMissionIds.length,
    isApodSaved: checkIsApodSaved,
    toggleSaveApod: toggleApod,
    removeSavedApod: (date: string) => {
      removeSavedApod(date);
      refresh();
    },
    isMissionSaved: checkIsMissionSaved,
    toggleSaveMission: toggleMission,
    removeSavedMission: (missionId: string) => {
      removeSavedMission(missionId);
      refresh();
    },
    clearAll: () => {
      clearAllFavorites();
      refresh();
    }
  };
}
