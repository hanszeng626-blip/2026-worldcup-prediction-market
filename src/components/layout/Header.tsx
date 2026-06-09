'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Menu, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { X_URL } from '@/lib/social';

const NAV_ITEMS = [
  { href: '/#simulate', key: 'nav_simulate' as const },
  { href: '/prematch', key: 'nav_prematch' as const },
  { href: '/backtest', key: 'backtest' as const, label: 'Backtest' },
  { href: '/demo', key: 'nav_demo' as const },
  { href: '/methodology', key: 'nav_methodology' as const },
] as const;

function XSocialIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M18.9 2h3.3l-7.2 8.2L23.5 22h-6.6l-5.2-6.8L5.8 22H2.5l7.7-8.8L2 2h6.8l4.7 6.2L18.9 2Zm-1.2 17.9h1.8L7.8 4H5.9l11.8 15.9Z" />
    </svg>
  );
}

export function Header() {
  const t = useTranslations('header');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  const switchLocale = (to: 'es' | 'en' | 'zh') => {
    router.replace(pathname, { locale: to });
  };

  const navLinkClass = (href: string, mobile: boolean) => {
    const path = href.split('#')[0] || '/';
    const active = path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`);

    return cn(
      'font-medium transition-colors',
      mobile
        ? 'block rounded-xl px-4 py-3 text-base'
        : 'text-sm',
      active ? 'text-gold' : 'text-fg-0/85 hover:text-gold',
      mobile && !active && 'text-fg-1 hover:bg-bg-1/60',
      mobile && active && 'bg-gold/10',
    );
  };

  const renderNavItem = (item: (typeof NAV_ITEMS)[number], mobile = false) => (
    <Link
      key={item.key}
      href={item.href}
      onClick={() => setMenuOpen(false)}
      className={navLinkClass(item.href, mobile)}
    >
      {'label' in item ? item.label : t(item.key)}
    </Link>
  );

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled ? 'py-2' : 'py-3 sm:py-4',
      )}
    >
      <div className="mx-auto flex max-w-[1440px] items-center gap-2 px-3 sm:gap-3 sm:px-6">
        <div
          className={cn(
            'flex min-w-0 flex-1 items-center justify-between gap-2 rounded-full border px-3 transition-all duration-300 sm:gap-6 sm:px-5',
            scrolled
              ? 'glass h-12 border-border'
              : 'h-12 border-transparent sm:h-14',
          )}
        >
          <Link href="/" className="group flex min-w-0 flex-1 items-center gap-2 sm:flex-initial sm:gap-2.5">
            <Image
              src="/logo-worldcup2026.webp"
              alt="FIFA World Cup 2026"
              width={250}
              height={386}
              priority
              className="h-7 w-auto shrink-0 object-contain transition-transform group-hover:scale-105 sm:h-9"
            />
            <span className="hidden truncate text-sm font-medium tracking-wide text-fg-0 min-[420px]:inline sm:max-w-none">
              {t('brand')}
            </span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm md:flex">
            {NAV_ITEMS.map((item) => renderNavItem(item))}
          </nav>

          <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
            <div className="flex items-center gap-0.5 rounded-full border border-border bg-bg-1/40 p-0.5">
              <button
                onClick={() => switchLocale('es')}
                className={cn(
                  'rounded-full px-2 py-1 text-xs font-medium transition-colors sm:px-3',
                  locale === 'es' ? 'bg-gold text-bg-0' : 'text-fg-0/80 hover:text-fg-0',
                )}
                aria-label="Español"
              >
                {t('lang_es')}
              </button>
              <button
                onClick={() => switchLocale('en')}
                className={cn(
                  'rounded-full px-2 py-1 text-xs font-medium transition-colors sm:px-3',
                  locale === 'en' ? 'bg-gold text-bg-0' : 'text-fg-0/80 hover:text-fg-0',
                )}
                aria-label="English"
              >
                {t('lang_en')}
              </button>
              <button
                onClick={() => switchLocale('zh')}
                className={cn(
                  'rounded-full px-2 py-1 text-xs font-medium transition-colors sm:px-3',
                  locale === 'zh' ? 'bg-gold text-bg-0' : 'text-fg-0/80 hover:text-fg-0',
                )}
                aria-label="中文"
              >
                {t('lang_zh')}
              </button>
            </div>

            <a
              href={X_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="X @hanszeng626"
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full border border-border bg-bg-1/40 px-3 text-sm font-semibold text-fg-0 transition hover:border-gold/50 hover:text-gold"
            >
              <XSocialIcon className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">@hanszeng626</span>
            </a>

            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-bg-1/40 text-fg-0 md:hidden"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            >
              {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

      </div>

      {menuOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 top-14 z-40 bg-bg-0/60 backdrop-blur-sm md:hidden"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <nav
            className="glass absolute inset-x-3 top-[calc(100%+0.5rem)] z-50 rounded-2xl border border-border p-2 shadow-card md:hidden"
            aria-label="Mobile navigation"
          >
            {NAV_ITEMS.map((item) => renderNavItem(item, true))}
          </nav>
        </>
      )}
    </header>
  );
}
