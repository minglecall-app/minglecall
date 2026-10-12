import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { AppNavItem } from '../../../shared/appNav';
import { childNavItems, itemsForSlice, resolveAudienceRole, type NavAudienceRole } from '../../../shared/appNav';
import {
  dispatchNavAction,
  isNavItemActive,
  navDomId,
  NavIcon,
  type NavDispatchContext,
} from '../../navigation/appNavConfig';

export function activeNavItems(
  items: AppNavItem[],
  audience: NavAudienceRole,
  bar: AppNavItem['bar'],
  slot?: AppNavItem['slot']
) {
  return itemsForSlice(items, audience, bar, slot).filter((item) => item.active);
}

export function BrandLockup({
  item,
  onNavigate,
  logoUrlFallback,
}: {
  item?: AppNavItem;
  onNavigate: (tab: string) => void;
  /** CMS SEO branding logo when nav meta.imageUrl is empty */
  logoUrlFallback?: string;
}) {
  const meta = item?.meta || {};
  const mark = meta.markText || 'M';
  const primary = meta.wordmarkPrimary || 'Mingle';
  const accent = meta.wordmarkAccent || 'call';
  const showMark = meta.showMark !== false;
  const showWord = meta.showWordmark !== false;
  const target = item?.actionTarget || 'home';
  const logoSrc = String(meta.imageUrl || logoUrlFallback || '').trim();
  return (
    <div
      className="flex items-center space-x-2 cursor-pointer shrink-0"
      onClick={() => onNavigate(target)}
    >
      {logoSrc ? (
        <img src={logoSrc} alt={primary} className="w-8 h-8 rounded-xl object-cover shrink-0" />
      ) : showMark ? (
        <div className="w-8 h-8 rounded-xl bg-flirt text-white flex items-center justify-center font-display font-bold text-sm shadow-brand shrink-0">
          {mark}
        </div>
      ) : null}
      {showWord && (
        <span className="font-display font-bold text-base sm:text-lg tracking-tight text-app-heading whitespace-nowrap">
          {primary}
          <span className="text-brand">{accent}</span>
        </span>
      )}
    </div>
  );
}

function badgeCount(kind: AppNavItem['badge'], counts: { unread: number; missed: number; friends: number; rewards: boolean }) {
  if (kind === 'unread_messages') return counts.unread;
  if (kind === 'missed_calls') return counts.missed;
  if (kind === 'friend_requests') return counts.friends;
  if (kind === 'unclaimed_rewards') return counts.rewards ? 1 : 0;
  return 0;
}

function DesktopSubmenu({
  childrenItems,
  ctx,
  align = 'left',
  trigger,
}: {
  childrenItems: AppNavItem[];
  ctx: NavDispatchContext;
  align?: 'left' | 'right';
  trigger: (opts: { open: boolean; toggle: () => void; hasMenu: boolean }) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useRef(`nav-menu-${Math.random().toString(36).slice(2)}`);
  const hasMenu = childrenItems.length > 0;

  const announceOpen = () => {
    window.dispatchEvent(new CustomEvent('minglecall-nav-menu', { detail: menuId.current }));
  };

  useEffect(() => {
    const onOther = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (id !== menuId.current) setOpen(false);
    };
    window.addEventListener('minglecall-nav-menu', onOther);
    return () => window.removeEventListener('minglecall-nav-menu', onOther);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => {
        if (!hasMenu) return;
        announceOpen();
        setOpen(true);
      }}
      onMouseLeave={() => setOpen(false)}
    >
      {trigger({
        open,
        toggle: () => {
          if (!hasMenu) return;
          setOpen((value) => {
            const next = !value;
            if (next) announceOpen();
            return next;
          });
        },
        hasMenu,
      })}
      {open && hasMenu && (
        <div
          role="menu"
          className={`absolute top-full z-[60] mt-1 min-w-[11rem] rounded-xl border border-hairline bg-app-card p-1 shadow-app-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {childrenItems.map((child) => (
            <button
              key={child.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                dispatchNavAction(child, ctx);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-app-muted hover:bg-brand-soft hover:text-app-heading"
            >
              <NavIcon name={child.icon} className="h-3.5 w-3.5 shrink-0" />
              <span>{child.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function HeaderLeftButtons({
  items,
  ctx,
}: {
  items: AppNavItem[];
  ctx: NavDispatchContext;
}) {
  if (!items.length) return null;
  return (
    <nav className="hidden md:flex items-center space-x-1 bg-app-card-subtle p-1 rounded-full border border-hairline shrink-0">
      {items.filter((item) => !item.parentId).map((item) => {
        const active = isNavItemActive(item, { ...ctx, bar: 'main_header' });
        const children = childNavItems(items, item.id, true);
        return (
          <DesktopSubmenu key={item.id} childrenItems={children} ctx={ctx} trigger={({ toggle, hasMenu }) => (
            <button
              id={navDomId(item)}
              type="button"
              onClick={() => (hasMenu ? toggle() : dispatchNavAction(item, ctx))}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                active
                  ? item.actionTarget === 'admin'
                    ? 'bg-app-card text-app-heading border border-hairline'
                    : 'bg-flirt text-white shadow-brand'
                  : 'text-app-muted hover:text-app-heading hover:bg-brand-soft'
              }`}
            >
              <NavIcon name={item.icon} className="w-3.5 h-3.5" />
              <span>{item.label}</span>
              {hasMenu && <ChevronDown className="w-3 h-3 opacity-70" />}
            </button>
          )} />
        );
      })}
    </nav>
  );
}

export function HeaderRightButtons({
  items,
  ctx,
  coinBalance,
  streakLabel,
  hasUnclaimedRewards,
  agencyName,
}: {
  items: AppNavItem[];
  ctx: NavDispatchContext;
  coinBalance: number;
  streakLabel: string;
  hasUnclaimedRewards: boolean;
  agencyName?: string;
}) {
  return (
    <>
      {items.filter((item) => !item.parentId).map((item) => {
        const menuItems = childNavItems(items, item.id, true);
        const onActivate = (hasMenu: boolean, toggle: () => void) =>
          hasMenu ? toggle() : dispatchNavAction(item, ctx);
        return (
          <DesktopSubmenu
            key={item.id}
            childrenItems={menuItems}
            ctx={ctx}
            align="right"
            trigger={({ toggle, hasMenu }) => {
              if (item.actionTarget === 'daily_rewards') {
                return (
                  <button
                    id={navDomId(item) || item.id}
                    type="button"
                    onClick={() => onActivate(hasMenu, toggle)}
                    title={item.label}
                    className={`relative flex items-center space-x-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full border text-xs font-mono font-bold transition-all shrink-0 cursor-pointer ${
                      hasUnclaimedRewards
                        ? 'bg-gradient-to-r from-amber-500/20 via-yellow-500/20 to-amber-500/10 border-amber-500/50 text-amber-300 hover:border-amber-400 shadow-md shadow-amber-500/10 animate-pulse'
                        : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <span className="text-sm">🎁</span>
                    <span className="hidden sm:inline-block">{streakLabel || item.label}</span>
                    {hasMenu && <ChevronDown className="w-3 h-3 opacity-70" />}
                    {hasUnclaimedRewards && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 absolute -top-0.5 -right-0.5" />
                    )}
                  </button>
                );
              }
              if (item.actionTarget === 'store') {
                return (
                  <button
                    id={navDomId(item) || item.id}
                    type="button"
                    onClick={() => onActivate(hasMenu, toggle)}
                    className="flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-500/40 text-amber-300 hover:border-amber-400 transition-all shadow-sm group shrink-0"
                  >
                    <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center font-bold text-[10px] sm:text-xs shadow-inner group-hover:scale-110 transition-transform shrink-0">
                      🪙
                    </div>
                    <span className="font-bold text-xs text-amber-200">{coinBalance}</span>
                    <span className="hidden sm:inline-block text-[10px] bg-amber-500 text-slate-950 px-1.5 py-0.2 font-extrabold rounded-full uppercase">
                      {item.label || 'Buy'}
                    </span>
                    {hasMenu && <ChevronDown className="w-3 h-3 opacity-70" />}
                  </button>
                );
              }
              if (item.actionTarget === 'team_leader') {
                return (
                  <button
                    id={navDomId(item) || item.id}
                    type="button"
                    onClick={() => onActivate(hasMenu, toggle)}
                    className="flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:border-amber-400 transition-all shrink-0 cursor-pointer"
                  >
                    <NavIcon name={item.icon} className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="font-bold text-xs text-amber-200">{agencyName || item.label}</span>
                    <span className="hidden sm:inline-block text-[10px] bg-amber-500 text-slate-950 px-1.5 py-0.2 font-extrabold rounded-full uppercase">
                      Leader
                    </span>
                    {hasMenu && <ChevronDown className="w-3 h-3 opacity-70" />}
                  </button>
                );
              }
              return (
                <button
                  id={navDomId(item) || item.id}
                  type="button"
                  onClick={() => onActivate(hasMenu, toggle)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-app-muted hover:text-app-heading hover:bg-brand-soft border border-hairline cursor-pointer"
                >
                  <NavIcon name={item.icon} className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                  {hasMenu && <ChevronDown className="w-3 h-3 opacity-70" />}
                </button>
              );
            }}
          />
        );
      })}
    </>
  );
}

export function LoggedOutButtons({
  items,
  ctx,
}: {
  items: AppNavItem[];
  ctx: NavDispatchContext;
}) {
  return (
    <div id="header-logged-out-actions" className="flex items-center space-x-2 shrink-0">
      {items.map((item) => {
        const register = item.actionTarget === 'auth_register';
        return (
          <button
            key={item.id}
            id={navDomId(item) || item.id}
            type="button"
            onClick={() => dispatchNavAction(item, ctx)}
            className={
              register
                ? 'flex items-center space-x-1.5 px-3.5 sm:px-4 py-1.5 rounded-full bg-flirt hover:brightness-110 text-white font-semibold text-xs sm:text-sm shadow-brand transition-all shrink-0 cursor-pointer active:scale-95'
                : 'flex items-center space-x-1.5 px-3.5 sm:px-4 py-1.5 rounded-app bg-app-card hover:bg-app-card-subtle border border-app text-app-heading text-xs sm:text-sm font-semibold transition-all shadow-app-sm shrink-0 cursor-pointer active:scale-95'
            }
          >
            <NavIcon name={item.icon} className={`w-3.5 h-3.5 ${register ? '' : 'text-brand'}`} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function SubheaderBar({
  items,
  ctx,
  counts,
}: {
  items: AppNavItem[];
  ctx: NavDispatchContext;
  counts: { unread: number; missed: number; friends: number };
}) {
  const tops = items.filter((item) => !item.parentId);
  const primary = tops.filter((item) => item.meta?.group !== 'secondary');
  const secondary = tops.filter((item) => item.meta?.group === 'secondary');
  const clusters = secondary.length ? [primary, secondary] : [tops];
  return (
    <div id="desktop-sub-header" className="hidden md:block w-full bg-chrome border-t border-hairline backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-2">
        {clusters.map((group, index) => (
          <div key={index} className="flex items-center space-x-1.5 lg:space-x-2">
            <div className="flex items-center space-x-1 bg-app-card-subtle p-1 rounded-app border border-hairline">
              {group.map((item) => {
                const active = isNavItemActive(item, { ...ctx, bar: 'subheader' });
                const count = badgeCount(item.badge, { ...counts, rewards: false });
                const menuItems = childNavItems(items, item.id, true);
                const alert =
                  !active &&
                  ((item.badge === 'unread_messages' && count > 0) ||
                    (item.badge === 'missed_calls' && count > 0) ||
                    (item.badge === 'friend_requests' && count > 0));
                return (
                  <DesktopSubmenu
                    key={item.id}
                    childrenItems={menuItems}
                    ctx={ctx}
                    trigger={({ toggle, hasMenu }) => (
                      <button
                        id={navDomId(item) || item.id}
                        type="button"
                        title={item.label}
                        onClick={() => (hasMenu ? toggle() : dispatchNavAction(item, ctx))}
                        className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-semibold transition-all cursor-pointer relative ${
                          active
                            ? 'bg-brand text-white shadow-brand'
                            : alert
                              ? 'bg-brand-soft text-brand border border-brand/30'
                              : 'text-app-muted hover:text-app-heading hover:bg-brand-soft'
                        }`}
                      >
                        <div className="relative">
                          <NavIcon name={item.icon} className="w-3.5 h-3.5" />
                          {count > 0 && item.badge !== 'none' && (
                            <span className="absolute -top-1.5 -right-2 px-1 min-w-[14px] h-[14px] rounded-full bg-brand text-white text-[8px] font-bold flex items-center justify-center border border-[var(--app-bg)]">
                              {count > 9 ? '9+' : count}
                            </span>
                          )}
                        </div>
                        <span>{item.label}</span>
                        {hasMenu && <ChevronDown className="w-3 h-3 opacity-70" />}
                      </button>
                    )}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PersonaMenuItems({
  items,
  ctx,
  onlineStatus,
  coinBalance,
}: {
  items: AppNavItem[];
  ctx: NavDispatchContext;
  onlineStatus?: string;
  coinBalance: number;
}) {
  const visible = items.filter((item) => !item.parentId);
  const statuses = visible.filter((item) => item.actionTarget.startsWith('status_'));
  const rest = visible.filter((item) => !item.actionTarget.startsWith('status_'));
  return (
    <>
      {statuses.length > 0 && (
        <div className="pb-3 mb-3 border-b border-hairline">
          <p className="text-[10px] font-semibold text-app-muted uppercase tracking-wider mb-1.5">My Live Availability</p>
          <div className="grid grid-cols-3 gap-1.5">
            {statuses.map((item) => {
              const tone =
                item.actionTarget === 'status_online'
                  ? 'emerald'
                  : item.actionTarget === 'status_busy'
                    ? 'amber'
                    : 'rose';
              const selected =
                (item.actionTarget === 'status_online' && onlineStatus === 'online') ||
                (item.actionTarget === 'status_busy' && (onlineStatus === 'busy' || onlineStatus === 'in_call')) ||
                (item.actionTarget === 'status_offline' && onlineStatus === 'offline');
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => dispatchNavAction(item, { ...ctx, onCloseMenus: undefined })}
                  className={`py-1.5 px-1.5 rounded-xl text-[10px] font-bold flex items-center justify-center space-x-1 border transition-all cursor-pointer ${
                    selected
                      ? tone === 'emerald'
                        ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/50'
                        : tone === 'amber'
                          ? 'bg-amber-500/20 text-amber-500 border-amber-500/50'
                          : 'bg-rose-500/20 text-rose-500 border-rose-500/50'
                      : 'bg-app-input text-app-muted border-hairline hover:text-app-heading'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${tone === 'emerald' ? 'bg-emerald-400' : tone === 'amber' ? 'bg-amber-400' : 'bg-rose-500'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="space-y-1">
        {rest.map((item) => {
          if (item.actionTarget === 'logout') {
            return (
              <button
                key={item.id}
                id={navDomId(item) || item.id}
                type="button"
                onClick={() => dispatchNavAction(item, ctx)}
                className="w-full flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer border-t border-hairline pt-2.5 mt-1"
              >
                <NavIcon name={item.icon} className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          }
          return (
            <button
              key={item.id}
              id={navDomId(item) || item.id}
              type="button"
              onClick={() => dispatchNavAction(item, ctx)}
              className="w-full flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold text-app-muted hover:text-app-heading bg-app-input hover:bg-brand-soft transition-colors border border-hairline cursor-pointer"
            >
              <NavIcon name={item.icon} className="w-4 h-4 shrink-0" />
              <span className="font-bold">{item.label}</span>
              {item.actionTarget === 'store' && (
                <span className="ml-auto text-[10px] font-mono text-amber-500">{coinBalance}</span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

export function audienceForUser(user: { role?: string | null; gender?: string | null } | null | undefined) {
  return resolveAudienceRole(user);
}
