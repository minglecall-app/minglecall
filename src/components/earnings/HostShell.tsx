import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  History,
  LayoutDashboard,
  Menu,
  PhoneCall,
  ShieldCheck,
  Star,
  TrendingUp,
  UserPlus,
  Users,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import {
  HostNavIconName,
  HostTabKey,
  defaultL2ForHostTab,
  getHostNavGroups,
  getHostSectionLabel,
} from './hostNavConfig';

const ICON_MAP: Record<HostNavIconName, LucideIcon> = {
  LayoutDashboard,
  Zap,
  TrendingUp,
  PhoneCall,
  Star,
  ShieldCheck,
  CreditCard,
  History,
  Calendar,
  Users,
  UserPlus,
};

const COLLAPSE_STORAGE_KEY = 'minglecall:host-sidebar-collapsed';

export interface HostShellProps {
  activeTab: HostTabKey;
  activeNestedKey?: string;
  canEarnCoins?: boolean;
  onNavigateTab: (tab: HostTabKey, nestedKey?: string) => void;
  brandName?: string;
  brandSubtitle?: string;
  badges?: Partial<Record<HostTabKey, string | number>>;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}

function NavIcon({ name, className }: { name: HostNavIconName; className?: string }) {
  const Icon = ICON_MAP[name];
  return <Icon className={className || 'w-4 h-4 shrink-0'} />;
}

export const HostShell: React.FC<HostShellProps> = ({
  activeTab,
  activeNestedKey,
  canEarnCoins = true,
  onNavigateTab,
  brandName = 'Host Studio',
  brandSubtitle = 'Creator',
  badges,
  headerActions,
  children,
}) => {
  const navGroups = useMemo(() => getHostNavGroups(canEarnCoins), [canEarnCoins]);

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedL1, setExpandedL1] = useState<string | null>(activeTab);

  useEffect(() => {
    setExpandedL1(activeTab);
  }, [activeTab]);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const currentLabel = useMemo(
    () => getHostSectionLabel(activeTab, activeNestedKey, canEarnCoins),
    [activeTab, activeNestedKey, canEarnCoins]
  );

  const handleL1Click = (id: HostTabKey, hasChildren: boolean) => {
    if (hasChildren) {
      setExpandedL1((prev) => (prev === id ? null : id));
      const nested =
        activeTab === id && activeNestedKey
          ? activeNestedKey
          : defaultL2ForHostTab(id, canEarnCoins);
      onNavigateTab(id, nested);
      return;
    }
    onNavigateTab(id);
    closeMobile();
  };

  const handleL2Click = (tab: HostTabKey, nestedKey: string) => {
    onNavigateTab(tab, nestedKey);
    closeMobile();
  };

  const renderNav = (mode: 'desktop' | 'mobile') => {
    const iconOnly = mode === 'desktop' && collapsed;

    return (
      <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-3 px-2 space-y-4 scrollbar-thin">
        {navGroups.map((group) => (
          <div key={group.id}>
            {!iconOnly && (
              <div className="px-2.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-app-muted">
                {group.label}
              </div>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = item.id === activeTab;
                const isExpanded = expandedL1 === item.id;
                const hasChildren = Boolean(item.children?.length);
                const badge = badges?.[item.id];
                const showChildren = hasChildren && isExpanded && !iconOnly;

                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      id={item.buttonId}
                      title={iconOnly ? item.label : item.title || item.label}
                      onClick={() => handleL1Click(item.id, hasChildren)}
                      className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 min-h-11 md:min-h-0 md:py-2 text-left text-xs font-semibold transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 shadow-sm'
                          : 'text-app-muted hover:bg-app-input hover:text-app-heading border border-transparent'
                      } ${iconOnly ? 'justify-center' : ''}`}
                    >
                      <NavIcon name={item.icon} className="w-4 h-4 shrink-0" />
                      {!iconOnly && (
                        <>
                          <span className="flex-1 truncate">{item.label}</span>
                          {badge != null && badge !== '' && (
                            <span className="text-[10px] font-mono text-app-muted tabular-nums">
                              {badge}
                            </span>
                          )}
                          {hasChildren && (
                            <ChevronDown
                              className={`w-3.5 h-3.5 text-app-muted transition-transform ${
                                isExpanded ? 'rotate-0' : '-rotate-90'
                              }`}
                            />
                          )}
                        </>
                      )}
                    </button>

                    {showChildren && item.children && (
                      <ul className="mt-0.5 ml-3 border-l border-hairline pl-2 space-y-0.5">
                        {item.children.map((child) => {
                          const childActive = isActive && activeNestedKey === child.id;
                          return (
                            <li key={child.id}>
                              <button
                                type="button"
                                onClick={() => handleL2Click(item.id, child.id)}
                                className={`w-full flex items-center gap-2 rounded-md px-2 py-2 min-h-10 md:min-h-0 md:py-1.5 text-left text-[11px] font-medium transition-colors cursor-pointer ${
                                  childActive
                                    ? 'bg-app-input text-emerald-200'
                                    : 'text-app-muted hover:text-app-heading hover:bg-app-input/60'
                                }`}
                              >
                                {child.icon && (
                                  <NavIcon name={child.icon} className="w-3.5 h-3.5 shrink-0" />
                                )}
                                <span className="truncate">{child.label}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    );
  };

  return (
    <div
      id="host-studio-shell"
      className="h-full min-h-0 w-full overflow-hidden bg-app text-app-heading"
    >
      <div className="mx-auto max-w-7xl h-full min-h-0 flex overflow-hidden border-x border-hairline md:border-hairline">
        {/* Desktop sidebar */}
        <aside
          className={`hidden md:flex flex-col shrink-0 h-full min-h-0 border-r border-hairline bg-app-card transition-[width] duration-200 ${
            collapsed ? 'w-[64px]' : 'w-[240px]'
          }`}
        >
          <div
            className={`flex items-center gap-2 border-b border-hairline h-14 shrink-0 px-3 ${
              collapsed ? 'justify-center' : 'justify-between'
            }`}
          >
            {!collapsed && (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-emerald-400 text-[9px] font-mono font-bold uppercase tracking-wider">
                  <Zap className="w-3 h-3" />
                  <span className="truncate">{brandSubtitle}</span>
                </div>
                <div className="text-sm font-bold text-app-heading truncate">{brandName}</div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="p-1.5 rounded-lg text-app-muted hover:text-app-heading hover:bg-app-input cursor-pointer"
              title={collapsed ? 'Expand menu' : 'Collapse menu'}
              aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
            >
              {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>
          {renderNav('desktop')}
        </aside>

        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-40 flex">
            <button
              type="button"
              className="absolute inset-0 bg-black/60 cursor-pointer"
              aria-label="Close menu"
              onClick={closeMobile}
            />
            <aside className="relative z-10 flex flex-col w-[80%] max-w-[320px] h-full min-h-0 bg-app-card border-r border-hairline shadow-2xl">
              <div className="flex items-center justify-between h-14 shrink-0 px-3 border-b border-hairline">
                <div>
                  <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-emerald-400">
                    {brandSubtitle}
                  </div>
                  <div className="text-sm font-bold text-app-heading truncate">{brandName}</div>
                </div>
                <button
                  type="button"
                  onClick={closeMobile}
                  className="p-2 rounded-lg text-app-muted hover:text-app-heading hover:bg-app-input cursor-pointer min-h-11 min-w-11 flex items-center justify-center"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {renderNav('mobile')}
            </aside>
          </div>
        )}

        <div className="flex-1 min-w-0 min-h-0 flex flex-col h-full">
          <header className="shrink-0 z-30 border-b border-hairline bg-app-card/95 backdrop-blur-sm">
            <div className="flex items-center gap-3 px-3 sm:px-5 h-14">
              <button
                type="button"
                className="md:hidden p-2 rounded-lg text-app-muted hover:bg-app-input cursor-pointer min-h-11 min-w-11 flex items-center justify-center"
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="min-w-0 flex-1">
                <h1 className="text-sm sm:text-base font-bold text-app-heading truncate">
                  {currentLabel}
                </h1>
                <p className="hidden sm:block text-[11px] text-app-muted truncate">
                  {brandName} · performance & call history
                </p>
              </div>
              {headerActions}
            </div>
          </header>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-5 lg:px-6 pt-3 pb-24 md:pb-8">
            <div className="space-y-5 w-full max-w-none">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
