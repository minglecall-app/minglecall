import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { MapPin } from 'lucide-react';
import { getUserEffectiveLocation } from '../utils/location';
import { normalizeMediaUrl } from '../utils/r2Storage';
import { getFallbackAvatar } from '../utils/avatars';
import { SvgFlag } from './common/SvgFlag';
import {
  activeNavItems,
  audienceForUser,
  BrandLockup,
  HeaderLeftButtons,
  HeaderRightButtons,
  LoggedOutButtons,
  PersonaMenuItems,
  SubheaderBar,
} from './navigation/ConfiguredChrome';
import { itemsForSlice } from '../../shared/appNav';
import type { NavDispatchContext } from '../navigation/appNavConfig';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenStore: () => void;
  onOpenAuth: (mode?: 'login' | 'register') => void;
  onOpenSocialCircle?: () => void;
  onOpenChat?: (userId?: string) => void;
  onOpenMatch?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenStore,
  onOpenAuth,
  onOpenSocialCircle,
  onOpenChat,
  onOpenMatch,
}) => {
  const {
    currentUser,
    isLoggedIn,
    logoutUser,
    toggleUserStatus,
    openDailyRewardsModal,
    hasUnclaimedDailyRewards,
    dailyRewardRecord,
    unreadMessagesCount,
    pendingFriendRequestsCount,
    missedCallsCount,
    markCallLogsSeen,
    appNavItems,
    siteBranding,
  } = useApp();
  const [showPersonaMenu, setShowPersonaMenu] = useState(false);
  const personaMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPersonaMenu) return;

    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (personaMenuRef.current && !personaMenuRef.current.contains(e.target as Node)) {
        setShowPersonaMenu(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowPersonaMenu(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick, true);
    document.addEventListener('touchstart', handleOutsideClick, true);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick, true);
      document.removeEventListener('touchstart', handleOutsideClick, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showPersonaMenu]);

  const handleNav = (tab: string) => {
    if (tab === 'call_logs') markCallLogsSeen();
    setActiveTab(tab);
    setShowPersonaMenu(false);
  };

  const navAudience = isLoggedIn ? audienceForUser(currentUser) : 'guest';
  const brandRow = itemsForSlice(appNavItems, '*', 'brand')[0];
  const brandItem = brandRow?.active === false ? undefined : brandRow;
  const showBrand = brandRow?.active !== false;
  const leftNav = isLoggedIn ? activeNavItems(appNavItems, navAudience, 'main_header', 'left') : [];
  const rightNav = isLoggedIn ? activeNavItems(appNavItems, navAudience, 'main_header', 'right') : [];
  const guestNav = activeNavItems(appNavItems, 'guest', 'logged_out_header');
  const subNav = isLoggedIn ? activeNavItems(appNavItems, navAudience, 'subheader') : [];
  const personaNav = isLoggedIn ? activeNavItems(appNavItems, navAudience, 'persona_menu') : [];
  const navCtx: NavDispatchContext = {
    activeTab,
    setActiveTab: handleNav,
    onOpenStore,
    onOpenAuth,
    onOpenSocialCircle,
    onOpenChat,
    onOpenMatch,
    onOpenRewards: openDailyRewardsModal,
    onLogout: () => {
      logoutUser();
    },
    onStatus: (status) => toggleUserStatus(currentUser.id, status),
    onCloseMenus: () => setShowPersonaMenu(false),
    markCallLogsSeen,
  };

  return (
    <header id="main-app-header" className="sticky top-0 z-50 shrink-0 bg-chrome backdrop-blur-xl border-b border-hairline text-app w-full">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-12 sm:h-14 min-w-0">
          {/* Left Side: Brand Logo + Home & Admin Navigation */}
          <div className="flex items-center space-x-3 sm:space-x-4 min-w-0">
            {/* Brand Logo & Name */}
            {showBrand && (
              <BrandLockup
                item={brandItem}
                onNavigate={handleNav}
                logoUrlFallback={siteBranding?.logoUrl}
              />
            )}

            {isLoggedIn && <HeaderLeftButtons items={leftNav} ctx={navCtx} />}
          </div>

          {/* Right Action Bar */}
          <div className="flex items-center space-x-1 sm:space-x-2.5 shrink-0">
            {/* Logged In Only: Daily Rewards & Quests Modal Button */}
            {isLoggedIn && (
              <HeaderRightButtons
                items={rightNav}
                ctx={navCtx}
                coinBalance={currentUser.coinBalance}
                streakLabel={dailyRewardRecord?.streakCount ? `Day ${dailyRewardRecord.streakCount}` : 'Rewards'}
                hasUnclaimedRewards={hasUnclaimedDailyRewards}
                agencyName={currentUser.agencyName || 'Agency Guild'}
              />
            )}

            {/* ========================================================================= */}
            {/* LOGGED OUT STATE: ONLY SIGN IN & REGISTER (NO GUEST PROFILE MENU) */}
            {/* ========================================================================= */}
            {!isLoggedIn ? (
              <LoggedOutButtons items={guestNav} ctx={navCtx} />
            ) : (
              /* ========================================================================= */
              /* LOGGED IN STATE: PROFILE DROPDOWN MENU */
              /* ========================================================================= */
              <div id="header-logged-in-actions" className="flex items-center space-x-1 sm:space-x-2 shrink-0">
                {/* Logged-In User Profile Dropdown Trigger */}
                <div className="relative shrink-0" ref={personaMenuRef}>
                  <button
                    id="header-role-switcher-btn"
                    onClick={() => setShowPersonaMenu(!showPersonaMenu)}
                    className="flex items-center space-x-1.5 sm:space-x-2 p-1 sm:pl-2 sm:pr-3 sm:py-1 rounded-full bg-app-card-subtle hover:bg-brand-soft border border-hairline hover:border-brand/40 transition-all shrink-0 cursor-pointer"
                    title="Open Account & Profile Menu"
                  >
                    <div className="relative shrink-0">
                      <img
                        src={normalizeMediaUrl(currentUser.avatarUrl)}
                        alt={currentUser.name}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = getFallbackAvatar(currentUser.name, currentUser.gender, currentUser.role);
                        }}
                        className="w-6 h-6 sm:w-7 sm:h-7 rounded-full object-cover ring-2 ring-pink-500/50 shrink-0 bg-app-input"
                      />
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-[var(--app-card)] ${
                          currentUser.onlineStatus === 'online'
                            ? 'bg-emerald-400'
                            : currentUser.onlineStatus === 'busy' || currentUser.onlineStatus === 'in_call'
                            ? 'bg-amber-400'
                            : 'bg-rose-500'
                        }`}
                      />
                    </div>
                    <div className="text-left hidden sm:block">
                      <div className="text-xs font-semibold text-app-heading flex items-center space-x-1">
                        <span className="truncate max-w-[90px]">{currentUser.name}</span>
                        {currentUser.isVerified && <span className="text-blue-400 text-[10px]">✓</span>}
                      </div>
                      <div className="text-[10px] text-app-muted capitalize">
                        {currentUser.role.replace('_', ' ')}
                      </div>
                    </div>
                  </button>

                  {/* Logged-In Profile Dropdown Menu */}
                  {showPersonaMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowPersonaMenu(false)} />
                      <div id="persona-dropdown-menu" className="absolute right-0 mt-2 w-76 sm:w-80 bg-app-card border border-hairline rounded-2xl shadow-app-lg p-3.5 z-50 text-app-heading animate-in fade-in zoom-in-95 duration-150">
                        <div id="profile-menu-logged-in-state">
                          {/* Current User Card */}
                          <div
                            onClick={() => {
                              setShowPersonaMenu(false);
                              handleNav('profile');
                            }}
                            className="flex items-center space-x-3 pb-3 mb-3 border-b border-hairline cursor-pointer hover:bg-app-input p-1.5 rounded-xl transition-all"
                            title="Click to open full Profile Page"
                          >
                            <div className="relative shrink-0">
                              <img
                                src={normalizeMediaUrl(currentUser.avatarUrl)}
                                alt={currentUser.name}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = getFallbackAvatar(currentUser.name, currentUser.gender, currentUser.role);
                                }}
                                className="w-11 h-11 rounded-full object-cover ring-2 ring-pink-500/50 bg-app-input"
                              />
                              <span
                                className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[var(--app-card)] ${
                                  currentUser.onlineStatus === 'online'
                                    ? 'bg-emerald-400'
                                    : currentUser.onlineStatus === 'busy' || currentUser.onlineStatus === 'in_call'
                                    ? 'bg-amber-400'
                                    : 'bg-rose-500'
                                }`}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center space-x-1">
                                <span className="font-bold text-sm text-app-heading truncate">{currentUser.name}</span>
                                {currentUser.isVerified && <span className="text-blue-400 text-xs">✓</span>}
                                <span className="text-xs">{currentUser.gender === 'female' ? '👩' : '👨'}</span>
                              </div>
                              <div className="text-[11px] text-app-muted capitalize flex items-center space-x-1.5 mt-0.5 flex-wrap">
                                <span className="px-1.5 py-0.2 rounded bg-app-input text-app-muted font-mono text-[10px] border border-hairline">
                                  {currentUser.role.replace('_', ' ')}
                                </span>
                                <span className="flex items-center space-x-1.5 text-app-muted font-medium text-[10px]">
                                  <MapPin className={`w-3 h-3 ${currentUser.isUsingMockLocation ? 'text-pink-400' : 'text-emerald-400'}`} />
                                  <span className="truncate max-w-[90px]">{getUserEffectiveLocation(currentUser).displayCity}</span>
                                  <SvgFlag
                                    countryCode={currentUser.countryCode}
                                    nationality={getUserEffectiveLocation(currentUser).country || currentUser.nationality}
                                    size="xs"
                                    rounded={true}
                                  />
                                </span>
                              </div>
                            </div>
                          </div>

                          <PersonaMenuItems
                            items={personaNav}
                            ctx={navCtx}
                            onlineStatus={currentUser.onlineStatus}
                            coinBalance={currentUser.coinBalance}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {isLoggedIn && (
        <SubheaderBar
          items={subNav}
          ctx={navCtx}
          counts={{
            unread: unreadMessagesCount,
            missed: missedCallsCount,
            friends: pendingFriendRequestsCount,
          }}
        />
      )}
    </header>
  );
};

