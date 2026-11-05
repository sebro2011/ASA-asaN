/**
 * Mobile primary bar (phones and small tablets).
 *
 * Four destinations plus "More", which opens the same drawer as the top-bar
 * menu. Explore is in the bar because it is the only fully live surface in this
 * build; the rest of the workspace is one tap deeper, never hidden.
 */
import { useTranslation } from 'react-i18next';
import { Menu } from 'lucide-react';
import { Link } from './router';
import type { AppRoute } from './router';
import { findNavItem, MOBILE_NAV_IDS } from './navConfig';

export default function MobileBar({
  route,
  onOpenMenu,
}: {
  route: AppRoute;
  onOpenMenu: () => void;
}) {
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t('wsMobileNavigation')}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ws-line bg-[var(--ws-glass-strong)] backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.375rem)' }}
    >
      <ul className="mx-auto flex max-w-lg list-none items-stretch justify-between px-1.5 pt-1.5 pb-1">
        {MOBILE_NAV_IDS.map((id) => {
          const item = findNavItem(id);
          if (!item) return null;
          const Icon = item.icon;
          const active = route.name === item.route;
          return (
            <li key={id} className="flex-1">
              <Link
                to={item.href}
                aria-current={active ? 'page' : undefined}
                className="flex flex-col items-center gap-1 rounded-lg py-1.5"
                style={{ color: active ? 'var(--color-ws-text)' : 'var(--color-ws-text-3)' }}
              >
                <span
                  className="grid h-7 w-12 place-items-center rounded-full"
                  style={{
                    background: active ? 'color-mix(in srgb, var(--color-ws-accent) 16%, transparent)' : 'transparent',
                    color: active ? 'var(--color-ws-accent-ink)' : 'inherit',
                  }}
                >
                  <Icon size={18} strokeWidth={active ? 2.1 : 1.7} aria-hidden="true" />
                </span>
                <span className="max-w-full truncate text-[10.5px] font-medium">{t(item.labelKey)}</span>
              </Link>
            </li>
          );
        })}
        <li className="flex-1">
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label={t('wsMore')}
            title={t('wsDrawerNavigation')}
            className="flex w-full flex-col items-center gap-1 rounded-lg py-1.5"
            style={{ color: 'var(--color-ws-text-3)' }}
          >
            <span className="grid h-7 w-12 place-items-center rounded-full">
              <Menu size={18} strokeWidth={1.7} aria-hidden="true" />
            </span>
            <span className="text-[10.5px] font-medium">{t('wsMore')}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
