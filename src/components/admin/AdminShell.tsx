import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Award,
  Banknote,
  BarChart3,
  Building2,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Coins,
  Crown,
  Database,
  FileCode2,
  FileText,
  FlaskConical,
  Gift,
  Globe,
  Heart,
  History,
  Image as ImageIcon,
  Key,
  Landmark,
  Languages,
  Layers,
  LayoutDashboard,
  LayoutTemplate,
  Mail,
  Menu,
  Package,
  Percent,
  Radio,
  Rocket,
  Ruler,
  Settings,
  Shield,
  ShieldAlert,
  Sliders,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import {
  ADMIN_NAV_GROUPS,
  AdminNavActionKey,
  AdminNavIconName,
  AdminSubTabKey,
  defaultL2ForTab,
  findAdminNavL1,
} from './adminNavConfig';

const ICON_MAP: Record<AdminNavIconName, LucideIcon> = {
  TrendingUp,
  Radio,
  Coins,
  Package,
  Gift,
  Landmark,
  History,
  Users,
  Crown,
  Target,
  Globe,
  Key,
  Database,
  Activity,
  Mail,
  Layers,
  Rocket,
  Trash2,
  LayoutDashboard,
  Building2,
  ShieldAlert,
  Award,
  Percent,
  Wallet,
  Banknote,
  CalendarClock,
  Cloud,
  Shield,
  Sliders,
  FileCode2,
  Image: ImageIcon,
  FileText,
  FlaskConical,
  Zap,
  LayoutTemplate,
  BarChart3,
  Ruler,
  Languages,
  Sparkles,
  Heart,
};

const COLLAPSE_STORAGE_KEY = 'minglecall:admin-sidebar-collapsed';

export interface AdminShellHeaderKpi {
  label: string;
  value: string;
  accentClass?: string;
}

export interface AdminShellProps {
  activeSubTab: AdminSubTabKey;
  /** Active L2 key for the current L1 (undefined when L1 has no children). */
  activeNestedKey?: string;
  onNavigateTab: (tab: AdminSubTabKey, nestedKey?: string) => void;
  onSetupWizard: () => void;
  onResetData: () => void;
  /** Optional badge text per L1 id (e.g. live call count). */
  badges?: Partial<Record<AdminSubTabKey | AdminNavActionKey, string | number>>;
  headerKpis?: AdminShellHeaderKpi[];
  children: React.ReactNode;
}

function NavIcon({ name, className }: { name: AdminNavIconName; className?: string }) {
  const Icon = ICON_MAP[name];
  return <Icon className={className || 'w-4 h-4 shrink-0'} />;
}

export const AdminShell: React.FC<AdminShellProps> = ({
  activeSubTab,
  activeNestedKey,
  onNavigateTab,
  onSetupWizard,
  onResetData,
  badges,
  headerKpis,
  children,
}) => {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedL1, setExpandedL1] = useState<string | null>(activeSubTab);

  useEffect(() => {
    setExpandedL1(activeSubTab);
  }, [activeSubTab]);

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

  const currentLabel = useMemo(() => {
    const item = findAdminNavL1(activeSubTab);
    if (!item) return 'Admin';
    if (activeNestedKey && item.children) {
      const child = item.children.find((c) => c.id === activeNestedKey);
      if (child) return `${item.label} · ${child.label}`;
    }
    return item.label;
  }, [activeSubTab, activeNestedKey]);

  const handleL1Click = (id: string, kind: 'tab' | 'action', hasChildren: boolean) => {
    if (kind === 'action') {
      if (id === 'setup-wizard') onSetupWizard();
      else if (id === 'reset-data') onResetData();
      closeMobile();
      return;
    }

    const tab = id as AdminSubTabKey;
    if (hasChildren) {
      setExpandedL1((prev) => (prev === tab ? null : tab));
      const nested = activeSubTab === tab && activeNestedKey ? activeNestedKey : defaultL2ForTab(tab);
      onNavigateTab(tab, nested);
      // Mobile: keep drawer open until an L2 item is chosen
      return;
    }

    onNavigateTab(tab);
    closeMobile();
  };

  const handleL2Click = (tab: AdminSubTabKey, nestedKey: string) => {
    onNavigateTab(tab, nestedKey);
    closeMobile();
  };

  const renderNav = (mode: 'desktop' | 'mobile') => {
    const iconOnly = mode === 'desktop' && collapsed;

    return (
      <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-3 px-2 space-y-4 scrollbar-thin">
        {ADMIN_NAV_GROUPS.map((group) => (
          <div key={group.id}>
            {!iconOnly && (
              <div className="px-2.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {group.label}
              </div>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = item.kind === 'tab' && item.id === activeSubTab;
                const isExpanded = expandedL1 === item.id;
                const hasChildren = Boolean(item.children?.length);
                const badge = badges?.[item.id];
                const showChildren = hasChildren && isExpanded && !iconOnly;

                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      id={item.buttonId}
                      title={iconOnly ? item.label : item.title}
                      onClick={() => handleL1Click(item.id, item.kind, hasChildren)}
                      className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition-colors cursor-pointer ${
                        item.kind === 'action' && item.id === 'reset-data'
                          ? 'text-rose-200 hover:bg-rose-950/60 border border-transparent hover:border-rose-700/40'
                          : item.kind === 'action' && item.id === 'setup-wizard'
                            ? 'text-pink-100 bg-gradient-to-r from-purple-600/80 to-pink-600/80 hover:from-purple-500 hover:to-pink-500'
                            : isActive
                              ? 'bg-indigo-600/90 text-white shadow-sm'
                              : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                      } ${iconOnly ? 'justify-center' : ''}`}
                    >
                      <NavIcon
                        name={item.icon}
                        className={`w-4 h-4 shrink-0 ${
                          item.id === 'monitoring' && isActive ? 'text-rose-200 animate-pulse' : ''
                        }`}
                      />
                      {!iconOnly && (
                        <>
                          <span className="flex-1 truncate">{item.label}</span>
                          {badge != null && badge !== '' && (
                            <span className="text-[10px] font-mono text-slate-400 tabular-nums">{badge}</span>
                          )}
                          {hasChildren && (
                            <ChevronDown
                              className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                                isExpanded ? 'rotate-0' : '-rotate-90'
                              }`}
                            />
                          )}
                        </>
                      )}
                    </button>

                    {showChildren && item.children && item.kind === 'tab' && (
                      <ul className="mt-0.5 ml-3 border-l border-slate-800 pl-2 space-y-0.5">
                        {item.children.map((child) => {
                          const childActive = isActive && activeNestedKey === child.id;
                          return (
                            <li key={child.id}>
                              <button
                                type="button"
                                onClick={() => handleL2Click(item.id as AdminSubTabKey, child.id)}
                                className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] font-medium transition-colors cursor-pointer ${
                                  childActive
                                    ? 'bg-slate-800 text-white'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                                }`}
                              >
                                {child.icon && <NavIcon name={child.icon} className="w-3.5 h-3.5 shrink-0" />}
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
      id="admin-dashboard-root"
      className="h-full min-h-0 w-full overflow-hidden bg-[#0B0D13]"
    >
      <div className="mx-auto max-w-7xl h-full min-h-0 flex overflow-hidden border-x border-slate-800">
      {/* Desktop sidebar — viewport-locked; nav scrolls independently */}
      <aside
        className={`hidden md:flex flex-col shrink-0 self-stretch h-full max-h-full min-h-0 overflow-hidden border-r border-slate-800 bg-[#12151F] transition-[width] duration-200 ${
          collapsed ? 'w-[64px]' : 'w-[260px]'
        }`}
      >
        <div
          className={`flex items-center gap-2 border-b border-slate-800 h-14 shrink-0 px-3 ${
            collapsed ? 'justify-center' : 'justify-between'
          }`}
        >
          {!collapsed && (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-indigo-400 text-[9px] font-mono font-bold uppercase tracking-wider">
                <Settings className="w-3 h-3" />
                <span className="truncate">Admin</span>
              </div>
              <div className="text-sm font-bold text-white truncate">Control Center</div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            title={collapsed ? 'Expand menu' : 'Collapse menu'}
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
        {renderNav('desktop')}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 cursor-pointer"
            aria-label="Close menu"
            onClick={closeMobile}
          />
          <aside className="relative z-10 flex flex-col w-[80%] max-w-[320px] h-full min-h-0 bg-[#12151F] border-r border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between h-14 shrink-0 px-3 border-b border-slate-800">
              <div>
                <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-indigo-400">Admin</div>
                <div className="text-sm font-bold text-white">Control Center</div>
              </div>
              <button
                type="button"
                onClick={closeMobile}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {renderNav('mobile')}
          </aside>
        </div>
      )}

      {/* Main column — header pinned; content scrolls independently */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col h-full max-h-full overflow-hidden">
        <header className="shrink-0 z-30 border-b border-slate-800 bg-[#12151F]/95 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-3 sm:px-5 h-14">
            <button
              type="button"
              className="md:hidden p-2 rounded-lg text-slate-300 hover:bg-slate-800 cursor-pointer"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-sm sm:text-base font-bold text-white truncate">{currentLabel}</h1>
              <p className="hidden sm:block text-[11px] text-slate-500 truncate">
                Platform control &amp; moderation
              </p>
            </div>
            {headerKpis && headerKpis.length > 0 && (
              <div className="hidden lg:flex items-center gap-2">
                {headerKpis.map((kpi) => (
                  <div
                    key={kpi.label}
                    className="px-3 py-1.5 rounded-lg bg-[#0F1115] border border-slate-800 min-w-[88px]"
                  >
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">{kpi.label}</div>
                    <div className={`text-sm font-extrabold font-mono ${kpi.accentClass || 'text-white'}`}>
                      {kpi.value}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Mobile / tablet header KPIs */}
          {headerKpis && headerKpis.length > 0 && (
            <div className="lg:hidden grid grid-cols-2 gap-2 px-3 pb-3">
              {headerKpis.map((kpi) => (
                <div
                  key={kpi.label}
                  className="px-3 py-2 rounded-xl bg-[#0F1115] border border-slate-800 border-l-2 border-l-indigo-500/60"
                >
                  <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">{kpi.label}</div>
                  <div className={`text-base font-extrabold font-mono ${kpi.accentClass || 'text-white'}`}>
                    {kpi.value}
                  </div>
                </div>
              ))}
            </div>
          )}
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-5 lg:px-6 pt-2 pb-24 md:pb-8">
          <div className="space-y-6 w-full max-w-none">{children}</div>
        </div>
      </div>
      </div>
    </div>
  );
};
