import React, { useState, useEffect, Suspense, lazy } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { DiscoveryGrid } from './components/discovery/DiscoveryGrid';
import { SwipeMatchDeck } from './components/discovery/SwipeMatchDeck';
import { ProfileDetailModal } from './components/discovery/ProfileDetailModal';
import { QuickMatchRoulette } from './components/discovery/QuickMatchRoulette';
import { UserProfilePage } from './components/profile/UserProfilePage';
import { PublicProfilePage } from './components/profile/PublicProfilePage';
import { HomePage } from './components/home/HomePage';
import { PolicyDetailModal } from './components/home/PolicyDetailModal';
import { PostCallRatingModal } from './components/videocall/PostCallRatingModal';
import { CoinStoreModal } from './components/store/CoinStoreModal';
import { AuthModal } from './components/auth/AuthModal';
import { DailyRewardsModal } from './components/rewards/DailyRewardsModal';
import { ChatDrawer } from './components/chat/ChatDrawer';
import { FriendsFavoritesDrawer } from './components/social/FriendsFavoritesDrawer';
import { BlockReportModal } from './components/social/BlockReportModal';
import { GlobalBottomNav } from './components/navigation/GlobalBottomNav';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { OnboardingWizard } from './components/onboarding/OnboardingWizard';
import { ServerSetupWizard } from './components/setup/ServerSetupWizard';
import { UserProfile } from './types';
import { CheckCircle2, AlertTriangle, Info, AlertCircle, X } from 'lucide-react';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { isSetupLocation } from './navigation/appRoutes';
import { useAppNavigation } from './navigation/useAppNavigation';

/** Heavy screens — split so Vercel refresh does not parse admin/video on first paint. */
const MomentsFeed = lazy(() =>
  import('./components/social/MomentsFeed').then((m) => ({ default: m.MomentsFeed }))
);
const FemaleEarningsDashboard = lazy(() =>
  import('./components/earnings/FemaleEarningsDashboard').then((m) => ({
    default: m.FemaleEarningsDashboard,
  }))
);
const FemaleCallLogsView = lazy(() =>
  import('./components/earnings/FemaleCallLogsView').then((m) => ({
    default: m.FemaleCallLogsView,
  }))
);
const HostDashboard = lazy(() =>
  import('./components/earnings/HostDashboard').then((m) => ({ default: m.HostDashboard }))
);
const AdminDashboard = lazy(() =>
  import('./components/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
);
const TeamLeaderDashboard = lazy(() =>
  import('./components/teamleader/TeamLeaderDashboard').then((m) => ({
    default: m.TeamLeaderDashboard,
  }))
);
const VideoCallStudio = lazy(() =>
  import('./components/videocall/VideoCallStudio').then((m) => ({ default: m.VideoCallStudio }))
);

const RouteFallback: React.FC = () => (
  <div className="flex min-h-[40vh] items-center justify-center text-sm text-app-muted">Loading…</div>
);



const MainApp: React.FC = () => {
  const {
    activeCall,
    startCall,
    toast,
    hideToast,
    users,
    currentUser,
    updateUserProfile,
    isLoggedIn,
    pendingRatingCall,
    setPendingRatingCall,
    isDailyRewardsModalOpen,
    closeDailyRewardsModal,
    blockReportModal,
    closeBlockReportModal,
  } = useApp();

  const {
    activeTab,
    viewingProfileId,
    setActiveTab,
    replaceTab,
    openPublicProfile,
    closePublicProfile,
    exitApp,
  } = useAppNavigation();
  const [currentUtcTime, setCurrentUtcTime] = useState<string>(() =>
    new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentUtcTime(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC');
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Keep setup flag in sync with URL (pathname / legacy hash) without pushing history.
  const [isSetupRoute, setIsSetupRoute] = useState<boolean>(() => isSetupLocation());

  useEffect(() => {
    const syncSetupRoute = () => {
      setIsSetupRoute(isSetupLocation() || activeTab === 'server_setup');
    };
    syncSetupRoute();
    window.addEventListener('hashchange', syncSetupRoute);
    window.addEventListener('popstate', syncSetupRoute);
    return () => {
      window.removeEventListener('hashchange', syncSetupRoute);
      window.removeEventListener('popstate', syncSetupRoute);
    };
  }, [activeTab]);

  // Automatically kick out from admin/team_leader tab if permissions do not match
  // Use replaceTab so auth redirects do not pollute / loop history.
  useEffect(() => {
    if (activeTab === 'admin' && (!isLoggedIn || currentUser.role !== 'admin')) {
      replaceTab('home');
    }
    if (activeTab === 'team_leader' && (!isLoggedIn || (currentUser.role !== 'team_leader' && currentUser.role !== 'admin'))) {
      replaceTab('home');
    }
  }, [activeTab, isLoggedIn, currentUser.role, replaceTab]);

  const [isStoreOpen, setIsStoreOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<'login' | 'register'>('login');
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isSocialCircleOpen, setIsSocialCircleOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isMatchOpen, setIsMatchOpen] = useState(false);
  const [chatUserId, setChatUserId] = useState<string | null>(null);
  const [selectedDeckUser, setSelectedDeckUser] = useState<UserProfile | null>(null);

  const handleOpenAuth = (mode: 'login' | 'register' = 'register') => {
    setAuthInitialMode(mode);
    setIsAuthOpen(true);
  };

  const handleOpenChat = (targetUserId?: string) => {
    setIsChatOpen(true);
    setChatUserId(targetUserId || null);
  };

  const dismissTransientOverlays = () => {
    setIsChatOpen(false);
    setChatUserId(null);
    setIsMatchOpen(false);
    setIsSocialCircleOpen(false);
    setIsStoreOpen(false);
    setIsAuthOpen(false);
    setSelectedDeckUser(null);
  };

  /** Close drawers/modals; soft-clear public profile URL without history.back race. */
  const handleCloseOverlays = () => {
    dismissTransientOverlays();
    if (viewingProfileId) {
      replaceTab(activeTab);
    }
  };

  const navigateTab = (tab: string) => {
    dismissTransientOverlays();
    setActiveTab(tab);
  };

  const openProfileAndClear = (id: string) => {
    dismissTransientOverlays();
    openPublicProfile(id);
  };

  // Dedicated full-screen Server Setup Wizard when accessing /server-setup
  if (isSetupRoute || activeTab === 'server_setup') {
    return (
      <ServerSetupWizard
        onExit={() => {
          setIsSetupRoute(false);
          if (window.location.hash) {
            window.location.hash = '';
          }
          replaceTab('home');
        }}
        onComplete={() => {
          setIsSetupRoute(false);
          if (window.location.hash) {
            window.location.hash = '';
          }
          replaceTab('home');
        }}
      />
    );
  }

  const isFemaleHostStudioUser =
    currentUser.role === 'female_creator' ||
    currentUser.role === 'female_host' ||
    currentUser.role === 'team_leader' ||
    currentUser.role === 'agency_manager';

  const isHostStudioSurface =
    isFemaleHostStudioUser && (activeTab === 'earnings' || activeTab === 'call_logs');

  const isShellLayout =
    activeTab === 'admin' ||
    activeTab === 'team_leader' ||
    activeTab === 'profile' ||
    isHostStudioSurface;

  return (
    <div
      className={`bg-app text-app flex flex-col font-sans selection-brand ${
        isShellLayout ? 'h-dvh max-h-dvh overflow-hidden' : 'min-h-screen'
      }`}
    >
      {/* App Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={navigateTab}
        onOpenStore={() => {
          handleCloseOverlays();
          setIsStoreOpen(true);
        }}
        onOpenAuth={(mode) => {
          handleCloseOverlays();
          handleOpenAuth(mode || 'register');
        }}
        onOpenSocialCircle={() => {
          handleCloseOverlays();
          setIsSocialCircleOpen(true);
        }}
        onOpenChat={(id) => {
          handleCloseOverlays();
          handleOpenChat(id);
        }}
        onOpenMatch={() => {
          handleCloseOverlays();
          setIsMatchOpen(true);
        }}
      />

      {/* Main View Content — shell layouts (admin / TL / profile) own their own scroll panes */}
      <main
        className={`flex-1 min-h-0 app-fade-up ${
          isShellLayout
            ? 'relative overflow-hidden pb-0 h-full'
            : isLoggedIn
              ? 'pb-24 md:pb-10'
              : 'pb-6'
        }`}
      >
        {activeTab === 'home' && (
          <HomePage
            onStartCall={(id) => startCall(id)}
            onOpenChat={(id) => handleOpenChat(id)}
            onOpenMatch={() => setIsMatchOpen(true)}
            onOpenStore={() => setIsStoreOpen(true)}
            onOpenAuth={(mode) => handleOpenAuth(mode || 'register')}
            onNavigateToTab={(tab) => navigateTab(tab)}
          />
        )}

        {activeTab === 'discovery' && (
          <DiscoveryGrid
            onStartCall={(id) => startCall(id)}
            onOpenChat={(id) => setChatUserId(id)}
            onOpenMatch={() => setIsMatchOpen(true)}
            onNavigateToSwipe={() => navigateTab('swipe')}
          />
        )}

        {activeTab === 'swipe' && (
          <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
            <SwipeMatchDeck onOpenDetailModal={(user) => setSelectedDeckUser(user)} />
            <ProfileDetailModal
              user={selectedDeckUser}
              onClose={() => setSelectedDeckUser(null)}
              onStartCall={(id) => startCall(id)}
              onOpenChat={(id) => handleOpenChat(id)}
            />
          </div>
        )}

        <Suspense fallback={<RouteFallback />}>
          {activeTab === 'moments' && (
            <MomentsFeed
              onStartCall={(id) => startCall(id)}
              onOpenChat={(id) => setChatUserId(id)}
              onOpenStore={() => setIsStoreOpen(true)}
            />
          )}

          {isHostStudioSurface && (
            <HostDashboard
              appSurface={activeTab === 'call_logs' ? 'call_logs' : 'earnings'}
              onAppSurfaceChange={(surface) => navigateTab(surface)}
              onOpenChat={(id) => setChatUserId(id)}
              onStartCall={(id) => startCall(id)}
              onOpenProfile={(id) => openProfileAndClear(id)}
            />
          )}

          {activeTab === 'earnings' && !isHostStudioSurface && (
            <FemaleEarningsDashboard
              onOpenStore={() => setIsStoreOpen(true)}
              onStartCall={(id) => startCall(id)}
              onOpenChat={(id) => setChatUserId(id)}
              onOpenCallLogs={() => navigateTab('call_logs')}
            />
          )}

          {activeTab === 'call_logs' && !isHostStudioSurface && (
            <FemaleCallLogsView
              onOpenChat={(id) => setChatUserId(id)}
              onStartCall={(id) => startCall(id)}
              onOpenProfile={(id) => openProfileAndClear(id)}
            />
          )}

          {activeTab === 'team_leader' &&
            isLoggedIn &&
            (currentUser.role === 'team_leader' || currentUser.role === 'admin') && (
              <TeamLeaderDashboard
                onStartCall={(id) => startCall(id)}
                onOpenChat={(id) => handleOpenChat(id)}
                onNavigateToTab={(tab) => navigateTab(tab)}
              />
            )}

          {activeTab === 'admin' && isLoggedIn && currentUser.role === 'admin' && <AdminDashboard />}
        </Suspense>

        {activeTab === 'profile' && (
          <UserProfilePage
            onOpenStore={() => setIsStoreOpen(true)}
            onOpenChat={(id) => handleOpenChat(id)}
            onNavigateToTab={(tab) => navigateTab(tab)}
          />
        )}
      </main>

      {viewingProfileId && (
        <PublicProfilePage
          userId={viewingProfileId}
          onClose={() => closePublicProfile()}
          onStartCall={(id) => {
            closePublicProfile();
            startCall(id);
          }}
          onOpenChat={(id) => {
            closePublicProfile();
            handleOpenChat(id);
          }}
          onEditOwnProfile={() => {
            closePublicProfile();
            navigateTab('profile');
          }}
        />
      )}

      {!isShellLayout && (
      <footer className="h-8 bg-app-surface border-t border-app px-4 sm:px-8 flex items-center justify-between text-[10px] text-app-muted">
        <div className="flex gap-4 items-center">
          <span>LiveCall</span>
          <span className="hidden sm:inline">Video ready</span>
          <span className="hidden md:inline">{users.length} people nearby</span>
        </div>
        <div className="flex gap-4 items-center">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Live
          </span>
          <span className="hidden sm:inline text-app-muted">{currentUtcTime}</span>
        </div>
      </footer>
      )}

      {/* Global Active Call Studio */}
      {activeCall && (
        <Suspense fallback={null}>
          <VideoCallStudio onOpenStore={() => setIsStoreOpen(true)} />
        </Suspense>
      )}

      {/* Global Modals */}
      <CoinStoreModal isOpen={isStoreOpen} onClose={() => setIsStoreOpen(false)} />
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        initialMode={authInitialMode}
        onNavigateToTab={(tab) => navigateTab(tab)}
      />
      {isOnboardingOpen && currentUser && (
        <OnboardingWizard
          user={currentUser}
          onComplete={(updated) => {
            updateUserProfile(updated.id, updated);
            setIsOnboardingOpen(false);
          }}
          onCancel={() => setIsOnboardingOpen(false)}
        />
      )}
      <DailyRewardsModal
        isOpen={isDailyRewardsModalOpen}
        onClose={closeDailyRewardsModal}
        onNavigateTab={(tab) => navigateTab(tab)}
      />
      <BlockReportModal
        key={blockReportModal ? `${blockReportModal.userId}-${blockReportModal.action}` : 'closed'}
        isOpen={!!blockReportModal}
        onClose={closeBlockReportModal}
        targetUserId={blockReportModal?.userId ?? null}
        initialAction={blockReportModal?.action ?? 'report'}
      />
      <QuickMatchRoulette
        isOpen={isMatchOpen}
        onClose={() => setIsMatchOpen(false)}
        onOpenChat={(id) => handleOpenChat(id)}
      />
      <FriendsFavoritesDrawer
        isOpen={isSocialCircleOpen}
        onClose={() => setIsSocialCircleOpen(false)}
        onStartCall={(id) => startCall(id)}
        onOpenChat={(id) => setChatUserId(id)}
      />
      <ChatDrawer
        isOpen={isChatOpen || chatUserId !== null}
        userId={chatUserId}
        onClose={() => {
          setIsChatOpen(false);
          setChatUserId(null);
        }}
        onStartCall={(id) => startCall(id)}
        onOpenProfile={(id) => openProfileAndClear(id)}
      />
      <PolicyDetailModal onNavigateToTab={(tab) => navigateTab(tab)} />
      {pendingRatingCall && (
        <PostCallRatingModal
          creatorId={pendingRatingCall.creatorId}
          creatorName={pendingRatingCall.creatorName}
          creatorAvatar={pendingRatingCall.creatorAvatar}
          callLogId={pendingRatingCall.callLogId || undefined}
          durationSeconds={pendingRatingCall.durationSeconds}
          ratingRequestMessageId={pendingRatingCall.ratingRequestMessageId}
          onClose={() => setPendingRatingCall(null)}
        />
      )}

      {/* Global Bottom Sticky Navigation — hidden entirely during 1-on-1 call */}
      {isLoggedIn && !activeCall && (
        <GlobalBottomNav
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onExitApp={exitApp}
          onOpenMatch={() => setIsMatchOpen(true)}
          onOpenChat={(id) => handleOpenChat(id)}
          isChatOpen={isChatOpen || chatUserId !== null}
          isMatchOpen={isMatchOpen}
          onCloseOverlays={handleCloseOverlays}
        />
      )}

      {/* PWA Install Banner Prompt — hide during call so it never covers End Call */}
      {!activeCall && <PWAInstallPrompt />}

      {/* Toast Notification Banner - Positioned directly below top header for clear visibility in mobile & desktop */}
      {toast && (
        <div
          id="global-toast-alert"
          className="fixed top-16 left-1/2 -translate-x-1/2 z-[11000] w-[calc(100%-1.25rem)] max-w-md pointer-events-none transition-all animate-in slide-in-from-top-3 fade-in duration-200"
        >
          <div
            className={`p-3.5 sm:p-4 rounded-2xl border shadow-2xl backdrop-blur-xl flex items-start space-x-3 text-xs pointer-events-auto overflow-hidden relative ${
              toast.type === 'success'
                ? 'bg-[#0b1b14]/95 border-emerald-500/70 text-emerald-100 shadow-emerald-950/50'
                : toast.type === 'error'
                ? 'bg-[#220d13]/95 border-rose-500/70 text-rose-100 shadow-rose-950/50'
                : toast.type === 'warning'
                ? 'bg-[#231808]/95 border-amber-500/70 text-amber-100 shadow-amber-950/50'
                : 'bg-[#101420]/95 border-sky-500/70 text-sky-100 shadow-sky-950/50'
            }`}
          >
            {/* Type Indicator Icon */}
            <div className="shrink-0 mt-0.5">
              {toast.type === 'success' ? (
                <div className="w-7 h-7 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                </div>
              ) : toast.type === 'error' ? (
                <div className="w-7 h-7 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
                  <AlertCircle className="w-4 h-4 stroke-[2.5]" />
                </div>
              ) : toast.type === 'warning' ? (
                <div className="w-7 h-7 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <AlertTriangle className="w-4 h-4 stroke-[2.5]" />
                </div>
              ) : (
                <div className="w-7 h-7 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
                  <Info className="w-4 h-4 stroke-[2.5]" />
                </div>
              )}
            </div>

            {/* Alert Message Content */}
            <div className="flex-1 min-w-0 pr-1 space-y-0.5">
              <h4 className="font-extrabold text-xs sm:text-sm text-white tracking-tight flex items-center space-x-1.5">
                <span>{toast.title}</span>
              </h4>
              <p className="leading-snug text-[11px] sm:text-xs opacity-90 break-words">{toast.message}</p>
            </div>

            {/* Quick Dismiss Button */}
            <button
              onClick={hideToast}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
              title="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <MainApp />
      </AppProvider>
    </ErrorBoundary>
  );
}
