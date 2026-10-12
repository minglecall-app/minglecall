import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { UserProfile, QuickMatchItem } from '../../types';
import {
  X,
  Zap,
  RefreshCw,
  Video,
  Radio,
  MessageSquare,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  VolumeX,
  Volume2,
  Eye,
  Flame,
  Clock,
  Play,
  RotateCcw,
  Heart,
  FastForward,
  Gift,
  ShieldCheck,
  MapPin,
  Camera,
  Layers,
  Star,
  Users,
  CheckCircle2,
  Search,
  Sparkle,
  PhoneCall,
  Crown,
  Activity,
  Sliders,
  Send,
  UserCheck,
  PartyPopper,
  RadioTower,
} from 'lucide-react';
import { getCountryFlag } from '../../utils/flags';
import { getUserEffectiveLocation } from '../../utils/location';
import { normalizeMediaUrl } from '../../utils/r2Storage';
import { getFallbackAvatar } from '../../utils/avatars';

// Curated Real-Time HD Live Video Streams by Gender & Persona
const getLiveStreamVideoUrl = (user?: UserProfile | null): string => {
  if (!user) return 'https://assets.mixkit.co/videos/preview/mixkit-young-woman-talking-on-a-video-call-with-her-phone-41557-large.mp4';
  if (user.verificationVideoUrl) return normalizeMediaUrl(user.verificationVideoUrl);
  if ((user as any).introVideoUrl) return normalizeMediaUrl((user as any).introVideoUrl);
  if ((user as any).videoUrl) return normalizeMediaUrl((user as any).videoUrl);

  const isFemale = user.gender === 'female' || user.role === 'female_creator' || user.role === 'female_host';
  
  if (isFemale) {
    const femaleStreams = [
      'https://assets.mixkit.co/videos/preview/mixkit-young-woman-talking-on-a-video-call-with-her-phone-41557-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-young-woman-waving-and-talking-on-a-video-call-41558-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-beautiful-woman-talking-on-a-video-call-41556-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-girl-having-a-video-call-on-her-smartphone-41555-large.mp4',
    ];
    const hash = (user.id || user.name || 'female').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return femaleStreams[hash % femaleStreams.length];
  } else {
    const maleStreams = [
      'https://assets.mixkit.co/videos/preview/mixkit-man-talking-on-a-video-call-on-his-phone-41559-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-young-man-talking-on-a-video-call-41560-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-man-having-a-video-call-on-his-smartphone-41561-large.mp4',
    ];
    const hash = (user.id || user.name || 'male').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return maleStreams[hash % maleStreams.length];
  }
};

interface QuickMatchRouletteProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenChat?: (userId: string) => void;
}

interface FlyingParticle {
  id: number;
  emoji: string;
  x: number;
  y: number;
}

export const QuickMatchRoulette: React.FC<QuickMatchRouletteProps> = ({
  isOpen,
  onClose,
  onOpenChat,
}) => {
  const {
    users,
    currentUser,
    startCall,
    liveHostIds,
    toggleGoLiveQuickMatch,
    isHostLive,
    systemSettings,
    quickMatches,
    recordQuickMatch,
    sendQuickMatchGift,
    showToast,
    showToastKey,
    activeQuickMatchCallerIds,
    connectedCallersByHost,
    connectCallerToHost,
    disconnectCallerFromHost,
    setCallerQuickMatchBrowsing,
    blockedUserIds,
    blockedByUserIds,
  } = useApp();

  // Rule: Only female creators and regular females can go live
  const isFemaleUser =
    currentUser.gender === 'female' ||
    currentUser.role === 'female_creator' ||
    currentUser.role === 'female_host';

  const isCurrentlyLiveHost = isHostLive(currentUser.id);

  // Top Nav Tab: 'matcher' vs 'matches' (Matches tab is ONLY available for female live broadcasters)
  const [activeTab, setActiveTab] = useState<'matcher' | 'matches'>('matcher');

  // Active View Mode: 'browse' (for callers) vs 'host_studio' (for female creators/users)
  const [activeMode, setActiveMode] = useState<'browse' | 'host_studio'>(
    isFemaleUser ? 'host_studio' : 'browse'
  );

  // Ensure male users can never enter host_studio or matches tab
  useEffect(() => {
    if (!isFemaleUser) {
      setActiveMode('browse');
      setActiveTab('matcher');
    }
  }, [isFemaleUser]);

  // Host live duration timer
  const [hostLiveDuration, setHostLiveDuration] = useState<number>(0);
  const hostTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Candidate index for caller browsing
  const [currentCandidateIndex, setCurrentCandidateIndex] = useState<number>(0);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);

  // Caller Matching Lifecycle (Start Match Button -> Searching -> Live Host Feed / Empty Notice)
  const [isMatchingStarted, setIsMatchingStarted] = useState<boolean>(false);
  const [isSearchingPool, setIsSearchingPool] = useState<boolean>(false);

  const handleStartMatch = () => {
    setIsSearchingPool(true);
    setIsMatchingStarted(true);
    setIsLiked(false);
    setTimeLeft(configuredTimerSec);

    setTimeout(() => {
      setIsSearchingPool(false);
      if (candidatePool.hosts.length > 0) {
        setCurrentCandidateIndex(0);
        setTimeLeft(configuredTimerSec);
      }
    }, 700);
  };

  // Match decision state
  const [isLiked, setIsLiked] = useState<boolean>(false);
  const [flyingParticles, setFlyingParticles] = useState<FlyingParticle[]>([]);

  // Search filter for Matches Tab (Female Host Only)
  const [matchSearchQuery, setMatchSearchQuery] = useState<string>('');

  // Host Studio Auto-Cycle Callers Timer & Queue
  const [autoCycleCallers, setAutoCycleCallers] = useState<boolean>(true);
  const [hostCallerTimeLeft, setHostCallerTimeLeft] = useState<number>(8);
  const hostCallerTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Video Controls
  const [isPiPVisible, setIsPiPVisible] = useState<boolean>(true);
  const [isFacingUser, setIsFacingUser] = useState<boolean>(true);
  const [beautyGlow, setBeautyGlow] = useState<boolean>(true);

  // Configurable Timer (from System Settings, default 5s)
  const configuredTimerSec = Number(systemSettings?.quickMatchTimerSeconds) || 5;
  const [timeLeft, setTimeLeft] = useState<number>(configuredTimerSec);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Synchronize timeLeft whenever configuredTimerSec or modal opens
  useEffect(() => {
    setTimeLeft(configuredTimerSec);
  }, [configuredTimerSec, isOpen]);

  // Camera stream for local user
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const hostBroadcastVideoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(true);
  const localMediaStreamRef = useRef<MediaStream | null>(null);

  // User interest matching
  const userInterestedIn = useMemo(() => {
    if (currentUser.interestedIn && currentUser.interestedIn.length > 0) {
      return currentUser.interestedIn;
    }
    return currentUser.gender === 'female' ? ['male'] : ['female'];
  }, [currentUser.interestedIn, currentUser.gender]);

  // Available live hosts matching user interest (STRICT live-only; no offline filler)
  const candidatePool = useMemo(() => {
    const validUsers = users.filter((u) => {
      if (u.role === 'team_leader' || u.role === 'agency_manager' || u.role === 'admin') {
        return false;
      }
      if (u.id === currentUser.id) return false;
      if (blockedUserIds.includes(u.id) || blockedByUserIds.includes(u.id)) return false;

      const isFemaleTarget = u.gender === 'female' || u.role === 'female_creator' || u.role === 'female_host';
      const isMaleTarget = u.gender === 'male' || u.role === 'male_user';
      const isOtherTarget = u.gender === 'other' || u.role === 'other_user';

      let isInterestMatch = false;
      if (userInterestedIn.includes('everyone') || userInterestedIn.includes('all')) isInterestMatch = true;
      else if (isFemaleTarget && userInterestedIn.includes('female')) isInterestMatch = true;
      else if (isMaleTarget && userInterestedIn.includes('male')) isInterestMatch = true;
      else if (isOtherTarget && (userInterestedIn.includes('other') || userInterestedIn.includes('others'))) isInterestMatch = true;

      return isInterestMatch;
    });

    // Rule: ONLY show female creators/users who are currently live in the Quick Match broadcast pool
    const liveHosts = validUsers.filter((u) => liveHostIds.includes(u.id));
    return { hosts: liveHosts, isFallback: false };
  }, [users, currentUser.id, userInterestedIn, liveHostIds, blockedUserIds, blockedByUserIds]);

  const currentHost: UserProfile | undefined =
    candidatePool.hosts.length > 0 && currentCandidateIndex < candidatePool.hosts.length
      ? candidatePool.hosts[currentCandidateIndex]
      : undefined;

  // Active callers queue for Female Host Studio mode (STRICT REAL-TIME ONLY - No mock data, no offline users)
  const hostCallerCandidates = useMemo(() => {
    const notBlocked = (u: UserProfile) =>
      !blockedUserIds.includes(u.id) && !blockedByUserIds.includes(u.id);

    // 1. Direct callers actively connected to this host right now
    const directCallers = connectedCallersByHost[currentUser.id] || [];
    if (directCallers.length > 0) {
      return directCallers.filter((u) => u.id !== currentUser.id && notBlocked(u));
    }

    // 2. Active callers currently matching in the Quick Match pool
    return users.filter((u) => {
      if (u.id === currentUser.id) return false;
      if (!notBlocked(u)) return false;
      return activeQuickMatchCallerIds.includes(u.id);
    });
  }, [
    connectedCallersByHost,
    currentUser.id,
    users,
    activeQuickMatchCallerIds,
    blockedUserIds,
    blockedByUserIds,
  ]);

  const [hostCallerIndex, setHostCallerIndex] = useState<number>(0);
  const currentHostCaller =
    hostCallerCandidates.length > 0
      ? hostCallerCandidates[hostCallerIndex % hostCallerCandidates.length]
      : null;

  // Quick Gifts dynamically derived from system settings
  const quickGiftsList = useMemo(() => {
    const giftPrices = systemSettings?.quickMatchGiftPrices || {
      rose: 10,
      heart: 25,
      cheers: 50,
      tiara: 100,
      diamond: 200,
      rocket: 500,
    };

    return [
      { key: 'rose', name: 'Rose', icon: '🌹', cost: Number(giftPrices.rose) || 10, color: 'from-pink-500 to-rose-600' },
      { key: 'heart', name: 'Love Heart', icon: '💖', cost: Number(giftPrices.heart) || 25, color: 'from-red-500 to-pink-500' },
      { key: 'cheers', name: 'Cheers', icon: '🥂', cost: Number(giftPrices.cheers) || 50, color: 'from-amber-400 to-yellow-500' },
      { key: 'tiara', name: 'Tiara', icon: '👑', cost: Number(giftPrices.tiara) || 100, color: 'from-yellow-400 to-amber-500' },
      { key: 'diamond', name: 'Diamond', icon: '💎', cost: Number(giftPrices.diamond) || 200, color: 'from-cyan-400 to-blue-500' },
      { key: 'rocket', name: 'Rocket', icon: '🚀', cost: Number(giftPrices.rocket) || 500, color: 'from-purple-500 to-indigo-600' },
    ];
  }, [systemSettings?.quickMatchGiftPrices]);

  // Setup camera stream
  useEffect(() => {
    let active = true;

    async function setupCamera() {
      if (!isOpen) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: isFacingUser ? 'user' : 'environment' },
          audio: false,
        });

        if (active) {
          localMediaStreamRef.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
          if (hostBroadcastVideoRef.current) {
            hostBroadcastVideoRef.current.srcObject = stream;
          }
          setCameraActive(true);
        }
      } catch {
        if (active) {
          setCameraActive(false);
        }
      }
    }

    if (isOpen) {
      setupCamera();
      setIsLiked(false);
      setTimeLeft(configuredTimerSec);
      setIsMatchingStarted(false);
      setIsSearchingPool(false);
    }

    return () => {
      active = false;
      if (localMediaStreamRef.current) {
        localMediaStreamRef.current.getTracks().forEach((track) => track.stop());
        localMediaStreamRef.current = null;
      }
    };
  }, [isOpen, isFacingUser, configuredTimerSec]);

  // Continuous Video Stream Attachment Hook
  useEffect(() => {
    if (localMediaStreamRef.current && cameraActive && isOpen) {
      if (localVideoRef.current && localVideoRef.current.srcObject !== localMediaStreamRef.current) {
        localVideoRef.current.srcObject = localMediaStreamRef.current;
        localVideoRef.current.play().catch(() => {});
      }
      if (hostBroadcastVideoRef.current && hostBroadcastVideoRef.current.srcObject !== localMediaStreamRef.current) {
        hostBroadcastVideoRef.current.srcObject = localMediaStreamRef.current;
        hostBroadcastVideoRef.current.play().catch(() => {});
      }
    }
  }, [isOpen, activeTab, activeMode, cameraActive, isPiPVisible]);

  // Modal close cleanup: automatically end live broadcast if host was live
  useEffect(() => {
    if (!isOpen) {
      if (isHostLive(currentUser.id)) {
        toggleGoLiveQuickMatch(currentUser.id, false);
      }
      if (localMediaStreamRef.current) {
        localMediaStreamRef.current.getTracks().forEach((track) => track.stop());
        localMediaStreamRef.current = null;
      }
      setCameraActive(false);
      setIsMatchingStarted(false);
      setIsSearchingPool(false);
      setCallerQuickMatchBrowsing(false);
    }
  }, [isOpen, currentUser.id, setCallerQuickMatchBrowsing]);

  // Caller real-time browsing presence synchronization
  useEffect(() => {
    if (isOpen && activeMode === 'browse' && isMatchingStarted && !isSearchingPool) {
      setCallerQuickMatchBrowsing(true);
    } else {
      setCallerQuickMatchBrowsing(false);
    }
    return () => {
      setCallerQuickMatchBrowsing(false);
    };
  }, [isOpen, activeMode, isMatchingStarted, isSearchingPool, setCallerQuickMatchBrowsing]);

  // Direct 1-to-1 Caller to Host Real-Time Link
  const prevConnectedHostIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      isOpen &&
      activeMode === 'browse' &&
      isMatchingStarted &&
      !isSearchingPool &&
      currentHost?.id
    ) {
      if (prevConnectedHostIdRef.current && prevConnectedHostIdRef.current !== currentHost.id) {
        disconnectCallerFromHost(currentUser.id, prevConnectedHostIdRef.current);
      }
      prevConnectedHostIdRef.current = currentHost.id;
      connectCallerToHost(currentUser, currentHost.id);
    } else {
      if (prevConnectedHostIdRef.current) {
        disconnectCallerFromHost(currentUser.id, prevConnectedHostIdRef.current);
        prevConnectedHostIdRef.current = null;
      }
    }

    return () => {
      if (prevConnectedHostIdRef.current) {
        disconnectCallerFromHost(currentUser.id, prevConnectedHostIdRef.current);
        prevConnectedHostIdRef.current = null;
      }
    };
  }, [
    isOpen,
    activeMode,
    isMatchingStarted,
    isSearchingPool,
    currentHost?.id,
    currentUser,
    connectCallerToHost,
    disconnectCallerFromHost,
  ]);

  // Host live duration timer
  useEffect(() => {
    if (isCurrentlyLiveHost) {
      if (!hostTimerRef.current) {
        hostTimerRef.current = setInterval(() => {
          setHostLiveDuration((prev) => prev + 1);
        }, 1000);
      }
    } else {
      if (hostTimerRef.current) {
        clearInterval(hostTimerRef.current);
        hostTimerRef.current = null;
      }
      setHostLiveDuration(0);
    }

    return () => {
      if (hostTimerRef.current) {
        clearInterval(hostTimerRef.current);
        hostTimerRef.current = null;
      }
    };
  }, [isCurrentlyLiveHost]);

  // Auto-Cycle Incoming Callers in Host Studio every 8s
  useEffect(() => {
    if (hostCallerTimerRef.current) {
      clearInterval(hostCallerTimerRef.current);
      hostCallerTimerRef.current = null;
    }

    if (
      isOpen &&
      activeTab === 'matcher' &&
      activeMode === 'host_studio' &&
      isCurrentlyLiveHost &&
      autoCycleCallers &&
      hostCallerCandidates.length > 1
    ) {
      hostCallerTimerRef.current = setInterval(() => {
        setHostCallerTimeLeft((prev) => {
          if (prev <= 1) {
            setHostCallerIndex((idx) => (idx + 1) % hostCallerCandidates.length);
            return 8;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (hostCallerTimerRef.current) {
        clearInterval(hostCallerTimerRef.current);
      }
    };
  }, [isOpen, activeTab, activeMode, isCurrentlyLiveHost, autoCycleCallers, hostCallerCandidates.length]);

  // =========================================================================
  // RELIABLE CALLER COUNTDOWN TIMER (Auto Skips when reaches 0)
  // =========================================================================
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Run timer only when caller is in live browsing mode, match has started, not currently searching, not liked, and current host exists within bounds
    if (
      isOpen &&
      activeTab === 'matcher' &&
      activeMode === 'browse' &&
      isMatchingStarted &&
      !isSearchingPool &&
      !isLiked &&
      candidatePool.hosts.length > 0 &&
      currentCandidateIndex < candidatePool.hosts.length
    ) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            // Advance to next candidate host
            setCurrentCandidateIndex((curr) => curr + 1);
            return configuredTimerSec;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isOpen, activeTab, activeMode, isMatchingStarted, isSearchingPool, isLiked, candidatePool.hosts.length, currentCandidateIndex, configuredTimerSec]);

  // Manual Skip Next Handler (Advances to next live host, or shows empty state if no next host exists)
  const handleSkipNext = () => {
    if (candidatePool.hosts.length === 0) return;
    setIsTransitioning(true);
    setIsLiked(false);
    setTimeLeft(configuredTimerSec);

    setTimeout(() => {
      setCurrentCandidateIndex((prev) => prev + 1);
      setIsTransitioning(false);
    }, 150);
  };

  const handleSkipPrev = () => {
    if (candidatePool.hosts.length === 0) return;
    if (currentCandidateIndex === 0) return;
    setIsTransitioning(true);
    setIsLiked(false);
    setTimeLeft(configuredTimerSec);

    setTimeout(() => {
      setCurrentCandidateIndex((prev) => Math.max(0, prev - 1));
      setIsTransitioning(false);
    }, 150);
  };

  // Caller Match / Like Button Handler — persists mutual Quick Match via Express
  const handleMatch = async () => {
    if (isLiked || !currentHost) return;
    setIsLiked(true);

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    spawnParticles('💖');

    const ok = await recordQuickMatch(currentHost);
    if (ok) {
      showToastKey('match.mutual_discovery', { vars: { name: currentHost.name } });
    } else {
      setIsLiked(false);
    }
  };

  // Host Match with Caller Button Handler
  const handleHostMatchWithCaller = async (caller: UserProfile) => {
    const ok = await recordQuickMatch(caller);
    if (ok) {
      spawnParticles('💖');
      showToastKey('match.host_saved', { vars: { name: caller.name } });
    }
  };

  // Quick Gift Handler — routes through /api/gifts/send when catalog-mapped
  const handleSendGift = async (gift: { key: string; name: string; icon: string; cost: number }) => {
    if (!currentHost) return;
    const success = await sendQuickMatchGift(currentHost.id, gift.key, gift.cost, gift.name);
    if (success) {
      spawnParticles(gift.icon);
      if (!isLiked) {
        await handleMatch();
      }
    }
  };

  const spawnParticles = (emoji: string) => {
    const newItems: FlyingParticle[] = Array.from({ length: 10 }).map((_, i) => ({
      id: Date.now() + i,
      emoji,
      x: 25 + Math.random() * 50,
      y: 65 + Math.random() * 25,
    }));
    setFlyingParticles((prev) => [...prev, ...newItems]);

    setTimeout(() => {
      setFlyingParticles((prev) => prev.filter((p) => !newItems.some((n) => n.id === p.id)));
    }, 1500);
  };

  // Host Toggle Live Broadcast
  const handleHostToggleLive = () => {
    toggleGoLiveQuickMatch();
  };

  // Clean Modal Close Handler (Terminates Live Broadcast & Releases Camera)
  const handleClose = () => {
    if (isHostLive(currentUser.id)) {
      toggleGoLiveQuickMatch(currentUser.id, false);
    }
    if (localMediaStreamRef.current) {
      localMediaStreamRef.current.getTracks().forEach((track) => track.stop());
      localMediaStreamRef.current = null;
    }
    setCameraActive(false);
    onClose();
  };

  // Chat & Call Actions
  const handleStartChatWithUser = (userId: string) => {
    if (onOpenChat) {
      onOpenChat(userId);
      handleClose();
    }
  };

  const handleStartVideoCallWithUser = (userId: string) => {
    startCall(userId);
    handleClose();
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || activeTab !== 'matcher' || activeMode !== 'browse' || !isMatchingStarted || isSearchingPool) return;
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        handleSkipNext();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleMatch();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeTab, activeMode, isMatchingStarted, isSearchingPool, candidatePool.hosts.length, isLiked]);

  if (!isOpen) return null;

  // Filter last 50 matches by search query
  const filteredMatches = quickMatches.filter((m) => {
    if (!matchSearchQuery) return true;
    const q = matchSearchQuery.toLowerCase();
    return (
      m.matchedUserName.toLowerCase().includes(q) ||
      (m.matchedUserCity || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-0 sm:p-3 md:p-4 bg-slate-950/95 backdrop-blur-2xl animate-in fade-in duration-200 select-none">
      
      {/* Full-Screen Immersive Matching Container */}
      <div className="relative w-full h-full max-w-5xl max-h-[100vh] sm:max-h-[96vh] bg-[#090B10] border-0 sm:border border-slate-800/90 sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* ========================================================= */}
        {/* TOP MODERN NAVIGATION BAR                                 */}
        {/* ========================================================= */}
        <div className="flex items-center justify-between px-3.5 sm:px-6 py-3 bg-[#0D1017]/95 border-b border-slate-800/80 shrink-0 z-30">
          
          {/* Left: Brand Identity */}
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-rose-500 via-pink-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-rose-500/25 shrink-0 ring-1 ring-white/20">
              <Zap className="w-5 h-5 fill-current animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider font-mono">
                  Quick Match
                </h2>
                <span className="px-2 py-0.5 text-[9px] font-mono rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-extrabold flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5 text-emerald-400" />
                  FREE 1-ON-1
                </span>
              </div>
              <p className="text-[10px] text-slate-400 hidden sm:block">
                {isFemaleUser && activeMode === 'host_studio'
                  ? 'Female Live Broadcast Studio • Connect with live callers in real-time'
                  : 'Fast-paced live speed video matching with instant skip & direct chat'}
              </p>
            </div>
          </div>

          {/* Center Navigation: Matches tab is ONLY for female live broadcasters */}
          {isFemaleUser && activeMode === 'host_studio' ? (
            <div className="flex items-center bg-slate-900/90 border border-slate-800 p-1 rounded-2xl text-xs font-bold shadow-inner">
              <button
                id="quick-match-live-tab-btn"
                onClick={() => setActiveTab('matcher')}
                className={`px-4 py-1.5 rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer ${
                  activeTab === 'matcher'
                    ? 'bg-gradient-to-r from-rose-600 via-pink-600 to-purple-600 text-white shadow-lg shadow-rose-600/30 font-black ring-1 ring-white/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Live Studio</span>
              </button>
              <button
                id="quick-match-matches-tab-btn"
                onClick={() => setActiveTab('matches')}
                className={`px-4 py-1.5 rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer ${
                  activeTab === 'matches'
                    ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-lg shadow-pink-600/30 font-black ring-1 ring-white/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Heart className="w-3.5 h-3.5 text-pink-400 fill-current" />
                <span>Matches ({quickMatches.length})</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono font-black">
              <Zap className="w-3.5 h-3.5 text-rose-400 fill-current animate-pulse" />
              <span>LIVE SPEED MATCHING</span>
            </div>
          )}

          {/* Right: Studio Toggle for Females & Close Button */}
          <div className="flex items-center space-x-2">
            {isFemaleUser && (
              <button
                onClick={() => {
                  const nextMode = activeMode === 'host_studio' ? 'browse' : 'host_studio';
                  setActiveMode(nextMode);
                  setActiveTab('matcher');
                }}
                className={`hidden md:flex px-3 py-1.5 rounded-xl text-xs font-bold items-center space-x-1.5 border transition-all cursor-pointer ${
                  activeMode === 'host_studio'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>{activeMode === 'host_studio' ? 'Explore Hosts' : 'Host Live Studio'}</span>
              </button>
            )}

            <button
              onClick={handleClose}
              className="p-2 rounded-full text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 transition-colors shrink-0 cursor-pointer shadow-md"
              title="Close Quick Match"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* ========================================================= */}
        {/* VIEW 1: MATCHES TAB (ONLY FOR FEMALE LIVE BROADCASTER)    */}
        {/* ========================================================= */}
        {activeTab === 'matches' && isFemaleUser ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 overscroll-contain bg-[#090B10]">
            
            {/* Header & Search Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#11141D] border border-slate-800/90 rounded-2xl p-4 shadow-lg">
              <div>
                <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                  <Heart className="w-4 h-4 text-pink-500 fill-current animate-pulse" />
                  <span>Broadcast Matches ({quickMatches.length})</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Showing callers you matched with during live broadcast. Start a private chat or call anytime!
                </p>
              </div>

              {/* Search Box */}
              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search matches by name or city..."
                  value={matchSearchQuery}
                  onChange={(e) => setMatchSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-pink-500 font-mono"
                />
              </div>
            </div>

            {/* Match Cards Grid */}
            {filteredMatches.length === 0 ? (
              <div className="text-center py-20 bg-[#11141D] border border-slate-800/80 rounded-3xl p-8 space-y-4 shadow-xl">
                <div className="w-16 h-16 rounded-3xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center mx-auto text-pink-400 shadow-2xl">
                  <Heart className="w-8 h-8 fill-current" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-base font-black text-white">
                    {matchSearchQuery ? 'No matches found matching your search' : 'No matches recorded yet'}
                  </h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Go live in your Host Live Studio and tap "Match & Chat" on incoming callers to add them here!
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('matcher')}
                  className="px-6 py-3 bg-gradient-to-r from-rose-500 via-pink-500 to-indigo-600 text-white text-xs font-black uppercase tracking-wider rounded-2xl shadow-xl shadow-rose-500/30 cursor-pointer transform hover:scale-105 transition-all"
                >
                  Return to Live Studio ⚡
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {filteredMatches.map((match) => {
                  const mDate = new Date(match.matchedAt).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={match.id}
                      className="p-3.5 bg-gradient-to-b from-[#131620] to-[#0E1017] border border-slate-800 hover:border-pink-500/50 rounded-2xl flex flex-col justify-between space-y-3.5 transition-all hover:shadow-2xl hover:shadow-pink-950/20 group"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="relative shrink-0">
                          <img
                            src={normalizeMediaUrl(match.matchedUserAvatar)}
                            alt={match.matchedUserName}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = getFallbackAvatar(
                                match.matchedUserName,
                                match.matchedUserGender as any
                              );
                            }}
                            className="w-13 h-13 rounded-2xl object-cover border-2 border-pink-500/60 shadow-lg group-hover:scale-105 transition-transform"
                          />
                          <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-slate-950 rounded-full flex items-center justify-center">
                            <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                          </span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-1.5">
                            <h4 className="text-sm font-black text-white truncate">
                              {match.matchedUserName}
                            </h4>
                            {match.matchedUserAge && (
                              <span className="text-xs text-slate-400 font-bold">{match.matchedUserAge}</span>
                            )}
                            <span className="text-xs">{getCountryFlag(match.matchedUserCountryCode)}</span>
                          </div>
                          <div className="flex items-center space-x-1 text-[11px] text-slate-400 truncate mt-0.5">
                            <MapPin className="w-3 h-3 text-pink-400 shrink-0" />
                            <span className="truncate">{match.matchedUserCity || 'Online Member'}</span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                            Matched {mDate}
                          </span>
                        </div>
                      </div>

                      {/* Gift Badge if exchanged */}
                      {match.giftsExchangedCoins ? (
                        <div className="px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[10px] font-mono font-bold flex items-center justify-between shadow-sm">
                          <span>🎁 Gifts Sent</span>
                          <span>+{match.giftsExchangedCoins} 🪙</span>
                        </div>
                      ) : null}

                      {/* Action Buttons: Direct Chat & Call */}
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
                        <button
                          onClick={() => handleStartChatWithUser(match.matchedUserId)}
                          className="py-2.5 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white font-black text-xs rounded-xl shadow-lg shadow-pink-500/20 flex items-center justify-center space-x-1.5 cursor-pointer transition-transform active:scale-95 border border-white/10"
                        >
                          <MessageSquare className="w-3.5 h-3.5 fill-current" />
                          <span>Chat</span>
                        </button>
                        <button
                          onClick={() => handleStartVideoCallWithUser(match.matchedUserId)}
                          className="py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-emerald-500 text-emerald-300 hover:text-emerald-200 font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5 cursor-pointer transition-transform active:scale-95 shadow-sm"
                        >
                          <PhoneCall className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Call</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* ========================================================= */
          /* VIEW 2: LIVE MATCHER / FEMALE HOST LIVE STUDIO            */
          /* ========================================================= */
          <div className="relative flex-1 overflow-hidden flex flex-col justify-between bg-black">
            
            {/* ========================================================= */}
            {/* FEMALE HOST LIVE STUDIO (TOP-TIER INDUSTRY BROADCAST)     */}
            {/* ========================================================= */}
            {isFemaleUser && activeMode === 'host_studio' ? (
              <div className="flex-1 p-3 sm:p-5 overflow-y-auto flex flex-col justify-between space-y-4">
                
                {/* Broadcast Control HUD Banner */}
                <div className="p-4 rounded-3xl bg-gradient-to-r from-rose-950/70 via-purple-950/50 to-slate-950 border border-rose-500/40 flex flex-col sm:flex-row items-center justify-between gap-3.5 shadow-2xl shrink-0">
                  <div className="flex items-center space-x-3.5 text-left">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-xl ${
                      isCurrentlyLiveHost
                        ? 'bg-rose-500 text-white animate-pulse shadow-rose-500/40 ring-2 ring-rose-400'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      <RadioTower className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs sm:text-sm font-black text-white tracking-wide">
                          {isCurrentlyLiveHost ? '🔴 BROADCASTING LIVE ON AIR' : '⚪ Host Live Studio (Offline)'}
                        </span>
                        {isCurrentlyLiveHost && (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-black border border-emerald-500/30 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            <span>{formatDuration(hostLiveDuration)}</span>
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-300">
                        {isCurrentlyLiveHost
                          ? 'Callers matching your preference are actively connecting one-by-one in your studio stream.'
                          : 'Go live to appear in callers\' Quick Match roulette queue and receive instant gifts!'}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleHostToggleLive}
                    className={`w-full sm:w-auto px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center space-x-2 transition-all shadow-xl cursor-pointer ${
                      isCurrentlyLiveHost
                        ? 'bg-slate-800 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40'
                        : 'bg-gradient-to-r from-rose-500 via-pink-500 to-indigo-600 hover:from-rose-400 hover:to-indigo-500 text-white shadow-rose-500/40 border border-white/20'
                    }`}
                  >
                    <Radio className="w-4 h-4" />
                    <span>{isCurrentlyLiveHost ? 'End Live Broadcast' : '🔴 Go Live as Host'}</span>
                  </button>
                </div>

                {/* Main Studio Viewport (Dual Full-Bleed Video Display) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0">
                  
                  {/* Screen 1: Female Host HD Camera Broadcast */}
                  <div className={`relative rounded-3xl overflow-hidden bg-slate-950 border-2 aspect-[4/3] sm:aspect-auto flex items-center justify-center shadow-2xl ${
                    isCurrentlyLiveHost ? 'border-rose-500/70 shadow-rose-950/40 ring-1 ring-rose-500/30' : 'border-slate-800'
                  }`}>
                    {cameraActive ? (
                      <video
                        ref={hostBroadcastVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className={`w-full h-full object-cover -scale-x-100 ${beautyGlow ? 'brightness-105 contrast-105' : ''}`}
                      />
                    ) : (
                      <video
                        src={getLiveStreamVideoUrl(currentUser)}
                        autoPlay
                        playsInline
                        muted
                        loop
                        onCanPlay={(e) => e.currentTarget.play().catch(() => {})}
                        className={`w-full h-full object-cover -scale-x-100 ${beautyGlow ? 'brightness-105 contrast-105' : ''}`}
                      />
                    )}

                    {/* Top Floating Live Badges */}
                    <div className="absolute top-3 left-3 flex items-center space-x-2 z-10">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black font-mono flex items-center space-x-1.5 shadow-xl backdrop-blur-md ${
                        isCurrentlyLiveHost ? 'bg-rose-600 text-white animate-pulse ring-1 ring-white/30' : 'bg-slate-900/90 text-slate-400'
                      }`}>
                        <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                        <span>{isCurrentlyLiveHost ? 'LIVE ON AIR' : 'STANDBY'}</span>
                      </span>
                    </div>

                    {/* Camera Control Toolbar */}
                    <div className="absolute top-3 right-3 flex items-center space-x-1.5 z-10">
                      <button
                        onClick={() => setBeautyGlow(!beautyGlow)}
                        className={`p-2 rounded-xl backdrop-blur-md border text-xs cursor-pointer transition-all ${
                          beautyGlow
                            ? 'bg-pink-500/40 border-pink-400 text-pink-200 shadow-lg shadow-pink-500/30 ring-1 ring-pink-300'
                            : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                        title="Toggle Beauty Studio Lighting"
                      >
                        <Sparkles className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setIsFacingUser(!isFacingUser)}
                        className="p-2 rounded-xl bg-slate-950/80 backdrop-blur-md border border-slate-800 text-slate-300 hover:text-white cursor-pointer shadow-md"
                        title="Flip Camera"
                      >
                        <Camera className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Bottom Info Pill */}
                    <div className="absolute bottom-3 left-3 right-3 p-3 rounded-2xl bg-slate-950/85 backdrop-blur-md border border-slate-800/90 flex items-center justify-between text-xs z-10 shadow-lg">
                      <div className="flex items-center space-x-2 truncate">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="font-bold text-white truncate">{currentUser.name} (You)</span>
                      </div>
                      <span className="text-[10px] text-emerald-400 font-mono font-bold">1-on-1 Ready</span>
                    </div>
                  </div>

                  {/* Screen 2: Connected Caller Live Video Stream (CHANGES AS CALLERS CONNECT) */}
                  <div className="relative rounded-3xl overflow-hidden bg-slate-950 border-2 border-indigo-500/50 aspect-[4/3] sm:aspect-auto flex flex-col justify-between p-4 shadow-2xl group">
                    
                    {/* Full-Bleed Caller Background Video Stream */}
                    {currentHostCaller && (
                      <div className="absolute inset-0 z-0 overflow-hidden">
                        <video
                          src={getLiveStreamVideoUrl(currentHostCaller)}
                          autoPlay
                          playsInline
                          muted
                          loop
                          onCanPlay={(e) => e.currentTarget.play().catch(() => {})}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-slate-950/70" />
                      </div>
                    )}

                    {currentHostCaller ? (
                      <>
                        {/* Top HUD: Connected Searcher Badge & Cycle Controls */}
                        <div className="relative z-10 flex items-center justify-between">
                          <span className="px-3 py-1 rounded-full bg-indigo-600/90 text-white border border-indigo-400/40 text-[10px] font-mono font-black flex items-center gap-1.5 shadow-lg backdrop-blur-md">
                            <Eye className="w-3.5 h-3.5 text-indigo-200" />
                            <span>CONNECTED SEARCHER</span>
                          </span>

                          <div className="flex items-center space-x-2">
                            {/* Auto-Cycle Countdown Timer */}
                            {autoCycleCallers && (
                              <span className="px-2 py-0.5 rounded-md bg-slate-950/80 backdrop-blur-md text-amber-300 border border-slate-800 text-[10px] font-mono font-bold flex items-center gap-1">
                                <Clock className="w-3 h-3 text-amber-400" />
                                <span>{hostCallerTimeLeft}s</span>
                              </span>
                            )}

                            {/* Next Caller Button */}
                            <button
                              id="host-next-caller-btn"
                              onClick={() => {
                                setHostCallerIndex((prev) => (prev + 1) % hostCallerCandidates.length);
                                setHostCallerTimeLeft(8);
                              }}
                              className="px-2.5 py-1 rounded-xl bg-slate-950/80 hover:bg-slate-900 border border-slate-700 text-[11px] text-white font-mono flex items-center gap-1.5 shadow-md cursor-pointer transition-all hover:border-slate-500"
                              title="Switch to next waiting caller"
                            >
                              <RefreshCw className="w-3 h-3 text-indigo-400" />
                              <span>Next Caller ⏭️</span>
                            </button>
                          </div>
                        </div>

                        {/* Center: Live Sound Waves Equalizer & Caller Info */}
                        <div className="relative z-10 flex flex-col items-center justify-center text-center space-y-2 py-2">
                          <div className="relative">
                            <img
                              src={normalizeMediaUrl(currentHostCaller.avatarUrl)}
                              alt={currentHostCaller.name}
                              className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl object-cover border-4 border-indigo-500/80 shadow-2xl shadow-indigo-500/30"
                            />
                            <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 border-2 border-slate-950 rounded-full flex items-center justify-center">
                              <span className="w-2 h-2 bg-white rounded-full animate-ping" />
                            </span>
                          </div>

                          {/* Sound waves visualization simulation */}
                          <div className="flex items-center space-x-1 py-1">
                            <span className="w-1 h-3 bg-indigo-400 rounded-full animate-pulse" />
                            <span className="w-1 h-5 bg-pink-400 rounded-full animate-pulse delay-75" />
                            <span className="w-1 h-4 bg-emerald-400 rounded-full animate-pulse delay-150" />
                            <span className="w-1 h-6 bg-purple-400 rounded-full animate-pulse delay-200" />
                            <span className="w-1 h-3 bg-indigo-400 rounded-full animate-pulse delay-300" />
                          </div>

                          <div>
                            <div className="flex items-center justify-center space-x-1.5">
                              <h4 className="font-black text-white text-base sm:text-lg drop-shadow-md">
                                {currentHostCaller.name}, {currentHostCaller.age}
                              </h4>
                              <span className="text-base">{getCountryFlag(currentHostCaller.countryCode)}</span>
                            </div>
                            <p className="text-xs text-slate-300 font-mono drop-shadow">
                              {getUserEffectiveLocation(currentHostCaller).displayCity}
                            </p>
                          </div>
                        </div>

                        {/* Bottom Actions: Auto-Match Indicator & Direct Chat / Call */}
                        {(() => {
                          const isCallerMatched = currentHostCaller && quickMatches.some((m) => m.matchedUserId === currentHostCaller.id);
                          return (
                            <div className="relative z-10 pt-2 border-t border-slate-800/90 flex flex-col gap-2">
                              <div className="flex items-center justify-center space-x-1.5 py-1 px-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-[10px] font-mono">
                                {isCallerMatched ? (
                                  <span className="text-pink-400 font-bold flex items-center gap-1">
                                    <Sparkles className="w-3 h-3 text-yellow-300 animate-spin" />
                                    <span>🎉 Mutual Match Active!</span>
                                  </span>
                                ) : (
                                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                                    <span>⚡ Auto-Matched (Waiting for caller decision: Match or Skip)</span>
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center justify-between gap-2.5">
                                <button
                                  id="host-chat-btn"
                                  onClick={() => {
                                    handleHostMatchWithCaller(currentHostCaller);
                                    handleStartChatWithUser(currentHostCaller.id);
                                  }}
                                  className="flex-1 py-3 bg-gradient-to-r from-pink-500 via-rose-500 to-purple-600 hover:from-pink-400 hover:to-rose-400 text-white font-black text-xs rounded-xl shadow-xl shadow-pink-500/25 flex items-center justify-center space-x-1.5 cursor-pointer transform hover:scale-102 active:scale-98 transition-all border border-white/20"
                                >
                                  <MessageSquare className="w-4 h-4 fill-current" />
                                  <span>Private Chat 💬</span>
                                </button>
                                
                                <button
                                  id="host-call-btn"
                                  onClick={() => handleStartVideoCallWithUser(currentHostCaller.id)}
                                  className="px-5 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs rounded-xl shadow-lg flex items-center space-x-1 cursor-pointer transition-transform active:scale-95"
                                >
                                  <Video className="w-4 h-4 fill-current" />
                                  <span>Video Call</span>
                                </button>
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    ) : (
                      /* STRICT REAL-TIME EMPTY STATE FOR FEMALE CREATOR BROADCAST STUDIO */
                      <div className="relative z-10 m-auto flex flex-col items-center justify-center text-center p-6 space-y-4 max-w-sm">
                        <div className="relative">
                          <div className="w-16 h-16 rounded-full bg-rose-500/10 border-2 border-rose-500/30 flex items-center justify-center animate-ping" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Radio className="w-7 h-7 text-rose-400 animate-pulse" />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-[10px] font-mono font-bold text-rose-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
                            <span>LIVE & BROADCASTING</span>
                          </div>
                          <h4 className="text-sm sm:text-base font-black text-white font-mono">
                            Waiting for Incoming Callers...
                          </h4>
                          <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                            Your live stream is broadcasting in real time. As soon as an active caller clicks <strong>Start Match ⚡</strong>, their live video card will connect here instantly!
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                </div>

                {/* Incoming Callers Queue Carousel Bar */}
                {hostCallerCandidates.length > 1 && (
                  <div className="p-3 bg-slate-950/80 border border-slate-800/90 rounded-2xl flex items-center justify-between gap-2 overflow-x-auto scrollbar-none shrink-0">
                    <div className="flex items-center space-x-2 shrink-0 pr-2 border-r border-slate-800">
                      <Users className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="text-[10px] font-mono font-black text-slate-300 uppercase">
                        Incoming Queue ({hostCallerCandidates.length}):
                      </span>
                    </div>

                    <div className="flex items-center space-x-2 overflow-x-auto scrollbar-none">
                      {hostCallerCandidates.map((caller, cIdx) => {
                        const isSelected = cIdx === hostCallerIndex;
                        return (
                          <button
                            key={caller.id}
                            onClick={() => {
                              setHostCallerIndex(cIdx);
                              setHostCallerTimeLeft(8);
                            }}
                            className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl border transition-all shrink-0 cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-600/30 border-indigo-500 text-white font-bold ring-1 ring-indigo-400'
                                : 'bg-slate-900/90 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                            }`}
                          >
                            <img
                              src={normalizeMediaUrl(caller.avatarUrl)}
                              alt={caller.name}
                              className="w-5 h-5 rounded-full object-cover"
                            />
                            <span className="text-xs truncate max-w-[80px]">{caller.name}</span>
                            <span className="text-[10px]">{getCountryFlag(caller.countryCode)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Host Live Real-time Stats Footer */}
                <div className="grid grid-cols-3 gap-3 shrink-0">
                  <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-2xl text-center shadow-lg">
                    <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">Active Searchers</span>
                    <span className="text-xs sm:text-sm font-black text-white font-mono flex items-center justify-center gap-1 mt-0.5">
                      <Flame className="w-3.5 h-3.5 text-orange-400" />
                      <span>{users.filter((u) => u.onlineStatus === 'online').length} Online</span>
                    </span>
                  </div>
                  <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-2xl text-center shadow-lg">
                    <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">Total Matches</span>
                    <span className="text-xs sm:text-sm font-black text-pink-400 font-mono flex items-center justify-center gap-1 mt-0.5">
                      <Heart className="w-3.5 h-3.5 fill-current" />
                      <span>{quickMatches.length} Saved</span>
                    </span>
                  </div>
                  <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-2xl text-center shadow-lg">
                    <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">Session Coins</span>
                    <span className="text-xs sm:text-sm font-black text-emerald-400 font-mono block mt-0.5">
                      +{currentUser.earningsCoins || 0} 🪙
                    </span>
                  </div>
                </div>

              </div>
            ) : (
              /* ========================================================= */
              /* CALLER SPEED MATCHING VIEW                                */
              /* ========================================================= */
              <div className="relative flex-1 flex flex-col justify-between overflow-hidden">
                
                {/* 1. INITIAL LAUNCHPAD STATE: User must click 'Start Match' */}
                {!isMatchingStarted ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 text-center max-w-lg mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-200">
                    <div className="relative">
                      <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-gradient-to-tr from-rose-600 via-pink-600 to-indigo-600 p-0.5 shadow-2xl shadow-rose-600/30 flex items-center justify-center">
                        <div className="w-full h-full bg-[#0D1017] rounded-[22px] flex items-center justify-center">
                          <Zap className="w-12 h-12 text-pink-400 fill-current animate-pulse" />
                        </div>
                      </div>
                      <span className="absolute -top-1 -right-1 px-2.5 py-0.5 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-black font-mono shadow-lg animate-bounce">
                        100% FREE
                      </span>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-xl sm:text-2xl font-black text-white font-mono tracking-wide">
                        Quick Video Match
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                        Tap below to search for female creators broadcasting live. Preview live video streams, skip with 1-click, and match for private chat & video calls!
                      </p>
                    </div>

                    {/* Feature Highlights Grid */}
                    <div className="grid grid-cols-2 gap-2.5 w-full text-left">
                      <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800/80 flex items-center space-x-2.5">
                        <Radio className="w-4 h-4 text-rose-400 shrink-0 animate-pulse" />
                        <div>
                          <span className="text-[11px] font-bold text-white block">Live Broadcasters</span>
                          <span className="text-[10px] text-slate-400 font-mono">Real-time video feeds</span>
                        </div>
                      </div>
                      <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800/80 flex items-center space-x-2.5">
                        <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                        <div>
                          <span className="text-[11px] font-bold text-white block">{configuredTimerSec}s Speed Timer</span>
                          <span className="text-[10px] text-slate-400 font-mono">Instant match or skip</span>
                        </div>
                      </div>
                      <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800/80 flex items-center space-x-2.5">
                        <Heart className="w-4 h-4 text-pink-400 fill-current shrink-0" />
                        <div>
                          <span className="text-[11px] font-bold text-white block">Mutual Match</span>
                          <span className="text-[10px] text-slate-400 font-mono">Unlock private chat</span>
                        </div>
                      </div>
                      <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800/80 flex items-center space-x-2.5">
                        <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div>
                          <span className="text-[11px] font-bold text-white block">100% Free Browse</span>
                          <span className="text-[10px] text-slate-400 font-mono">Zero coins to discover</span>
                        </div>
                      </div>
                    </div>

                    {/* START MATCH PROMINENT BUTTON */}
                    <button
                      id="start-quick-match-btn"
                      onClick={handleStartMatch}
                      className="w-full py-4 px-6 bg-gradient-to-r from-rose-500 via-pink-500 to-indigo-600 hover:from-rose-400 hover:to-indigo-500 text-white font-black text-sm sm:text-base uppercase tracking-wider rounded-2xl shadow-2xl shadow-rose-500/30 flex items-center justify-center space-x-2 cursor-pointer transform hover:scale-102 active:scale-98 transition-all border border-white/20"
                    >
                      <Zap className="w-5 h-5 fill-current animate-pulse" />
                      <span>Start Match ⚡</span>
                    </button>
                  </div>
                ) : isSearchingPool ? (
                  /* 2. SEARCHING RADAR STATE */
                  <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-5 my-auto text-center">
                    <div className="relative">
                      <div className="w-20 h-20 rounded-full bg-rose-500/10 border-2 border-rose-500/30 flex items-center justify-center animate-ping" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Radio className="w-8 h-8 text-rose-400 animate-pulse" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-base font-black text-white font-mono">Searching for Live Creators...</h4>
                      <p className="text-xs text-slate-400 font-mono">Connecting you to live broadcasts matching your interest...</p>
                    </div>
                  </div>
                ) : currentHost && candidatePool.hosts.length > 0 ? (
                  /* 3. ACTIVE LIVE BROADCASTER FEED */
                  <div className="relative w-full h-full flex flex-col justify-between overflow-hidden">
                    
                    {/* Full-Screen Host Live HD Stream Background */}
                    <div className="absolute inset-0 z-0 bg-slate-950 overflow-hidden">
                      <video
                        src={getLiveStreamVideoUrl(currentHost)}
                        autoPlay
                        playsInline
                        muted
                        loop
                        onCanPlay={(e) => e.currentTarget.play().catch(() => {})}
                        className={`w-full h-full object-cover transition-all duration-300 ${
                          isTransitioning ? 'scale-105 opacity-50 blur-sm' : 'scale-100 opacity-100 blur-0'
                        }`}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-slate-950/70" />
                      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-transparent to-slate-950/90" />
                    </div>

                    {/* Floating Heart / Gift Particles */}
                    {flyingParticles.map((particle) => (
                      <div
                        key={particle.id}
                        style={{ left: `${particle.x}%`, top: `${particle.y}%` }}
                        className="absolute z-40 text-3xl pointer-events-none animate-in fade-in slide-out-to-top duration-1000 transform -translate-x-1/2"
                      >
                        {particle.emoji}
                      </div>
                    ))}

                    {/* Top Floating HUD */}
                    <div className="relative z-20 flex items-center justify-between p-3.5 sm:p-4">
                      <div className="flex items-center space-x-2">
                        <span className="px-3 py-1 rounded-full bg-rose-600/95 text-white text-[10px] font-black font-mono flex items-center space-x-1.5 shadow-xl backdrop-blur-md">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                          <span>LIVE HOST</span>
                        </span>
                        {currentHost.isVerified && (
                          <span className="p-1 rounded-full bg-blue-500/30 border border-blue-400/50 text-blue-300 backdrop-blur-md" title="AI Verified">
                            <ShieldCheck className="w-3.5 h-3.5" />
                          </span>
                        )}
                        <span className="px-2.5 py-0.5 rounded-lg bg-slate-950/80 backdrop-blur-md text-slate-300 text-[10px] font-mono border border-slate-800 flex items-center gap-1">
                          <Star className="w-3 h-3 text-amber-400 fill-current" />
                          <span>{currentHost.ratingScore || '5.0'}</span>
                        </span>
                      </div>

                      {/* Caller Camera PiP (Picture-in-Picture) */}
                      {isPiPVisible && (
                        <div className="relative w-20 h-28 sm:w-28 sm:h-36 rounded-2xl overflow-hidden bg-slate-950 border-2 border-indigo-500/60 shadow-2xl group">
                          {cameraActive ? (
                            <video
                              ref={localVideoRef}
                              autoPlay
                              playsInline
                              muted
                              className="w-full h-full object-cover transform scale-x-[-1]"
                            />
                          ) : (
                            <video
                              src={getLiveStreamVideoUrl(currentUser)}
                              autoPlay
                              playsInline
                              muted
                              loop
                              onCanPlay={(e) => e.currentTarget.play().catch(() => {})}
                              className="w-full h-full object-cover transform scale-x-[-1]"
                            />
                          )}

                          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent pointer-events-none" />

                          {/* Flip Camera Controls */}
                          <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between z-10">
                            <span className="px-1.5 py-0.5 rounded bg-slate-900/90 text-[8px] font-mono font-bold text-slate-300 border border-slate-700">
                              YOU
                            </span>
                            <button
                              onClick={() => setIsFacingUser((prev) => !prev)}
                              className="p-1 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
                              title="Flip Camera"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bottom Control Bar */}
                    <div className="relative z-20 p-3.5 sm:p-5 space-y-3 bg-gradient-to-t from-[#090B10] via-[#090B10]/95 to-transparent">
                      
                      {/* Host Profile Info & Countdown Timer */}
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <div className="flex items-center space-x-2">
                            <h3 className="text-xl sm:text-2xl font-black text-white drop-shadow-lg">
                              {currentHost.name}, {currentHost.age || 22}
                            </h3>
                            <span className="text-lg">{getCountryFlag(currentHost.countryCode)}</span>
                          </div>
                          <div className="flex items-center space-x-2 text-xs text-slate-300 font-mono mt-0.5">
                            <MapPin className="w-3.5 h-3.5 text-pink-400" />
                            <span>{getUserEffectiveLocation(currentHost).displayCity}</span>
                            <span>•</span>
                            <span className="text-emerald-400 font-bold">{currentHost.hourlyCoinRate || 10} Coins/min</span>
                          </div>
                        </div>

                        {/* Decision Countdown Timer Ring (Active & Ticking) */}
                        {!isLiked && (
                          <div className="flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-slate-950/90 backdrop-blur-md border border-slate-700/80 text-xs font-mono shadow-xl">
                            <Clock className={`w-4 h-4 ${timeLeft <= 2 ? 'text-red-400 animate-ping' : 'text-amber-400 animate-pulse'}`} />
                            <span className={`text-sm font-black ${timeLeft <= 2 ? 'text-red-400' : 'text-amber-300'}`}>
                              {timeLeft}s
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Quick Gift Tray */}
                      <div className="p-2 rounded-2xl bg-slate-950/75 backdrop-blur-md border border-slate-800/80 flex items-center justify-between gap-1 overflow-x-auto scrollbar-none shadow-lg">
                        <span className="text-[9px] font-mono uppercase font-black text-pink-400 px-1 hidden sm:inline">
                          Quick Gifts:
                        </span>
                        {quickGiftsList.map((gift) => (
                          <button
                            key={gift.key}
                            onClick={() => handleSendGift(gift)}
                            className="flex-1 min-w-[50px] py-1.5 px-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-pink-500/50 flex flex-col items-center justify-center transition-all transform hover:scale-105 active:scale-95 cursor-pointer group"
                            title={`Send ${gift.name} (${gift.cost} Coins)`}
                          >
                            <span className="text-base sm:text-lg group-hover:scale-125 transition-transform">
                              {gift.icon}
                            </span>
                            <span className="text-[9px] font-mono font-bold text-amber-300 mt-0.5">
                              {gift.cost}🪙
                            </span>
                          </button>
                        ))}
                      </div>

                      {/* Matched Success Banner (Unlocked Chat & Call) */}
                      {isLiked && (
                        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-pink-600/40 via-rose-600/40 to-purple-600/40 border-2 border-pink-500 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-2.5 animate-in zoom-in-95 duration-200">
                          <div className="flex items-center space-x-2 text-pink-200 text-xs font-black">
                            <Sparkles className="w-4 h-4 text-yellow-300 animate-spin" />
                            <span>MATCHED! CHAT OR CALL DIRECTLY</span>
                          </div>
                          <div className="flex items-center space-x-2 w-full sm:w-auto">
                            <button
                              id="quick-match-chat-btn"
                              onClick={() => handleStartChatWithUser(currentHost.id)}
                              className="flex-1 sm:flex-none px-4 py-2.5 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white font-black text-xs rounded-xl shadow-lg flex items-center justify-center space-x-1.5 cursor-pointer"
                            >
                              <MessageSquare className="w-3.5 h-3.5 fill-current" />
                              <span>Private Chat 💬</span>
                            </button>
                            <button
                              id="quick-match-call-btn"
                              onClick={() => handleStartVideoCallWithUser(currentHost.id)}
                              className="flex-1 sm:flex-none px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs rounded-xl shadow-lg flex items-center justify-center space-x-1.5 cursor-pointer"
                            >
                              <Video className="w-3.5 h-3.5 fill-current" />
                              <span>Video Call 📞</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* MAIN CONTROLS: PREV, SKIP NEXT, MATCH BUTTON */}
                      <div className="flex items-center justify-between gap-3 pt-1">
                        
                        {/* Prev Button */}
                        <button
                          onClick={handleSkipPrev}
                          disabled={isTransitioning}
                          className="h-12 px-3 sm:px-4 bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-2xl font-mono text-xs font-bold flex items-center justify-center space-x-1 transition-all cursor-pointer disabled:opacity-50 shadow-md"
                          title="Previous host"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          <span className="hidden sm:inline">PREV</span>
                        </button>

                        {/* Prominent SKIP BUTTON (Next) */}
                        <button
                          id="quick-match-skip-btn"
                          onClick={handleSkipNext}
                          disabled={isTransitioning}
                          className="flex-1 h-12 py-2 px-4 bg-slate-900/90 hover:bg-slate-800 text-white border border-slate-700/80 hover:border-slate-600 rounded-2xl font-mono text-xs sm:text-sm font-black flex items-center justify-center space-x-2 transition-all transform hover:scale-102 active:scale-98 cursor-pointer shadow-lg disabled:opacity-50"
                        >
                          <FastForward className="w-4 h-4 text-amber-400" />
                          <span>SKIP (NEXT) ⏭️</span>
                        </button>

                        {/* Big Glowing MATCH Button */}
                        <button
                          id="quick-match-like-btn"
                          onClick={handleMatch}
                          disabled={isLiked}
                          className={`flex-1 h-12 py-2 px-4 rounded-2xl font-mono text-xs sm:text-sm font-black flex items-center justify-center space-x-2 transition-all transform hover:scale-102 active:scale-98 cursor-pointer shadow-xl ${
                            isLiked
                              ? 'bg-pink-600 text-white shadow-pink-600/40 border border-pink-400'
                              : 'bg-gradient-to-r from-rose-500 via-pink-500 to-indigo-600 hover:from-rose-400 hover:to-indigo-500 text-white shadow-rose-500/30 border border-white/20'
                          }`}
                        >
                          <Heart className={`w-4 h-4 ${isLiked ? 'fill-current animate-ping' : 'fill-current'}`} />
                          <span>{isLiked ? 'MATCHED 💖' : 'MATCH (FREE) ⚡'}</span>
                        </button>

                      </div>

                    </div>

                  </div>
                ) : (
                  /* 4. STANDARD EMPTY STATE: No Live People Available */
                  <div className="flex flex-col items-center justify-center text-center p-8 sm:p-12 space-y-5 my-auto max-w-md mx-auto">
                    <div className="relative">
                      <div className="w-20 h-20 rounded-3xl bg-slate-900/90 border border-slate-800 flex items-center justify-center shadow-2xl text-rose-400">
                        <Radio className="w-10 h-10 animate-pulse" />
                      </div>
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full border-2 border-slate-950 flex items-center justify-center">
                        <span className="w-2 h-2 bg-amber-300 rounded-full animate-ping" />
                      </span>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-lg sm:text-xl font-black text-white font-mono">
                        {candidatePool.hosts.length > 0 && currentCandidateIndex >= candidatePool.hosts.length
                          ? "No More Live Creators Available"
                          : "No Live People Available at the Moment"}
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                        {candidatePool.hosts.length > 0 && currentCandidateIndex >= candidatePool.hosts.length
                          ? "You have browsed all creators broadcasting live right now. Re-scan the live pool or explore active members in Discovery!"
                          : "There are currently no female creators broadcasting live in Quick Match. Please check back shortly or explore active members in Discovery!"}
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full pt-2">
                      <button
                        onClick={handleStartMatch}
                        className="w-full sm:flex-1 py-3 px-4 bg-gradient-to-r from-rose-500 via-pink-500 to-indigo-600 hover:from-rose-400 hover:to-indigo-500 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-xl shadow-rose-500/25 transition-all transform hover:scale-102 active:scale-98 cursor-pointer flex items-center justify-center space-x-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>{candidatePool.hosts.length > 0 && currentCandidateIndex >= candidatePool.hosts.length ? "Re-Scan Pool 🔄" : "Try Again 🔄"}</span>
                      </button>
                      <button
                        onClick={handleClose}
                        className="w-full sm:flex-1 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 font-bold text-xs uppercase tracking-wider rounded-2xl transition-all cursor-pointer"
                      >
                        Explore Profiles 🔍
                      </button>
                    </div>
                  </div>
                )}

              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
};
