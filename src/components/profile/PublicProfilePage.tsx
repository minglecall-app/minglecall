import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  X,
  Video,
  MessageSquare,
  ShieldCheck,
  Globe,
  Languages,
  Star,
  Flame,
  PhoneCall,
  MapPin,
  Eye,
  ThumbsUp,
  Maximize2,
  UserPlus,
  UserMinus,
  Trash2,
  UserX,
  ShieldAlert,
  Venus,
  Mars,
  User,
  Settings,
  Camera,
  Play,
  Pencil,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { CreatorMoment, GalleryVideoItem, UserProfile } from '../../types';
import { getLanguageFlag } from '../../utils/flags';
import { getUserEffectiveLocation } from '../../utils/location';
import { normalizeMediaUrl } from '../../utils/r2Storage';
import { getFallbackAvatar } from '../../utils/avatars';
import { SvgFlag } from '../common/SvgFlag';
import { ZodiacIcon } from '../common/ZodiacIcon';
import { fetchPublicProfile, publicProfileToUserProfile } from '../../services/publicProfileApi';

interface PublicProfilePageProps {
  userId: string;
  onClose: () => void;
  onStartCall: (userId: string) => void;
  onOpenChat: (userId: string) => void;
  onEditOwnProfile?: () => void;
}

type ProfileTab = 'about' | 'media' | 'moments';

function resolveGalleryVideoSrc(vid: GalleryVideoItem): string {
  const key = String(vid.storageKey || '').trim();
  return (
    normalizeMediaUrl(vid.url, vid.storageKey) ||
    (key ? `/api/storage/media?key=${encodeURIComponent(key)}` : '')
  );
}

type MediaLightboxItem =
  | { type: 'photo'; src: string }
  | { type: 'video'; src: string };

const SWIPE_THRESHOLD_PX = 50;

function useLightboxCarousel(open: boolean, count: number, index: number | null, setIndex: (i: number | null) => void) {
  const touchStartX = useRef<number | null>(null);

  const go = useCallback(
    (dir: -1 | 1) => {
      if (index == null || count <= 1) return;
      setIndex((index + dir + count) % count);
    },
    [count, index, setIndex]
  );

  useEffect(() => {
    if (!open || index == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      } else if (e.key === 'Escape') {
        setIndex(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, index, go, setIndex]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.changedTouches[0]?.clientX ?? null;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const dx = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    go(dx > 0 ? -1 : 1);
  };

  return { go, onTouchStart, onTouchEnd };
}

export const PublicProfilePage: React.FC<PublicProfilePageProps> = ({
  userId,
  onClose,
  onStartCall,
  onOpenChat,
  onEditOwnProfile,
}) => {
  const {
    users,
    systemSettings,
    favorites,
    toggleFavorite,
    isFriend,
    addFriend,
    removeFriend,
    openBlockReportModal,
    clearChatHistory,
    currentUser,
    likeUserMoment,
    fetchUserMoments,
  } = useApp();

  const [fetchedUser, setFetchedUser] = useState<UserProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<ProfileTab>('about');
  const [mediaLightboxIndex, setMediaLightboxIndex] = useState<number | null>(null);
  const [momentLightboxIndex, setMomentLightboxIndex] = useState<number | null>(null);
  const [showGearMenu, setShowGearMenu] = useState(false);
  const [momentsList, setMomentsList] = useState<CreatorMoment[]>([]);
  const [momentsLoading, setMomentsLoading] = useState(false);
  const [likedMoments, setLikedMoments] = useState<Record<string, { liked: boolean; count: number }>>({});

  const contextUser = users.find((u) => u.id === userId) || null;
  const isSelf = currentUser?.id === userId;

  useEffect(() => {
    setActiveImageIndex(0);
    setActiveTab('about');
    setShowGearMenu(false);
    setMediaLightboxIndex(null);
    setMomentLightboxIndex(null);
    setLoadError(null);
    setFetchedUser(null);

    if (contextUser || isSelf) return;

    let cancelled = false;
    setLoading(true);
    fetchPublicProfile(userId)
      .then((dto) => {
        if (cancelled) return;
        if (!dto) {
          setLoadError('Profile not found or unavailable.');
          return;
        }
        setFetchedUser(publicProfileToUserProfile(dto));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, contextUser?.id, isSelf]);

  useEffect(() => {
    let cancelled = false;
    setMomentsLoading(true);
    fetchUserMoments(userId)
      .then((posts) => {
        if (cancelled) return;
        const mapped: CreatorMoment[] = posts.map((p) => ({
          id: p.id,
          mediaUrl: p.mediaUrl,
          caption: p.caption,
          likes: p.likes,
          commentsCount: p.commentsCount || 0,
          createdAt: p.createdAt,
          mediaType: p.mediaType,
          isLiked: p.isLiked,
        }));
        setMomentsList(mapped);
        const likeMap: Record<string, { liked: boolean; count: number }> = {};
        for (const m of mapped) {
          likeMap[m.id] = { liked: Boolean(m.isLiked), count: m.likes || 0 };
        }
        setLikedMoments(likeMap);
      })
      .finally(() => {
        if (!cancelled) setMomentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, fetchUserMoments]);

  const liveUser: UserProfile | null =
    (contextUser ? users.find((u) => u.id === userId) || contextUser : null) ||
    (isSelf ? currentUser : null) ||
    fetchedUser;

  const galleryVideos = Array.isArray(liveUser?.galleryVideos) ? liveUser!.galleryVideos! : [];
  const allImages = liveUser
    ? [
        normalizeMediaUrl(liveUser.avatarUrl),
        ...(liveUser.gallery || []).map((img) => normalizeMediaUrl(img)),
      ].filter(Boolean)
    : [];

  const mediaItems: MediaLightboxItem[] = [
    ...allImages.map((src) => ({ type: 'photo' as const, src })),
    ...galleryVideos
      .map((video) => {
        const src = resolveGalleryVideoSrc(video);
        return src ? ({ type: 'video' as const, src } as const) : null;
      })
      .filter((item): item is Extract<MediaLightboxItem, { type: 'video' }> => Boolean(item)),
  ];

  const mediaCarousel = useLightboxCarousel(
    mediaLightboxIndex != null,
    mediaItems.length,
    mediaLightboxIndex,
    setMediaLightboxIndex
  );
  const momentCarousel = useLightboxCarousel(
    momentLightboxIndex != null,
    momentsList.length,
    momentLightboxIndex,
    setMomentLightboxIndex
  );

  const activeMedia =
    mediaLightboxIndex != null ? mediaItems[mediaLightboxIndex] ?? null : null;
  const activeMoment =
    momentLightboxIndex != null ? momentsList[momentLightboxIndex] ?? null : null;

  useEffect(() => {
    if (mediaLightboxIndex == null) return;
    if (mediaLightboxIndex < allImages.length) {
      setActiveImageIndex(mediaLightboxIndex);
    }
  }, [mediaLightboxIndex, allImages.length]);

  const openPhotoAt = (idx: number) => {
    if (idx < 0 || idx >= allImages.length) return;
    setActiveImageIndex(idx);
    setMediaLightboxIndex(idx);
  };

  const openVideoAt = (videoIdx: number) => {
    const mediaIdx = allImages.length + videoIdx;
    if (mediaIdx < 0 || mediaIdx >= mediaItems.length) return;
    setMediaLightboxIndex(mediaIdx);
  };

  const shell = (body: React.ReactNode) => (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-app-card border border-app rounded-app-xl shadow-app-lg overflow-hidden my-auto flex flex-col max-h-[88vh] sm:max-h-[90vh] app-scale-in">
        {body}
      </div>
    </div>
  );

  if (loading && !liveUser) {
    return shell(
      <div className="flex items-center justify-center min-h-[40vh] px-4 relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-2 rounded-full bg-slate-900/80 text-slate-300 hover:text-white border border-slate-700"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="text-sm text-app-muted font-mono">Loading profile…</div>
      </div>
    );
  }

  if (!liveUser) {
    return shell(
      <div className="flex flex-col items-center justify-center gap-4 min-h-[40vh] px-4 relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-2 rounded-full bg-slate-900/80 text-slate-300 hover:text-white border border-slate-700"
        >
          <X className="w-4 h-4" />
        </button>
        <p className="text-sm text-app-muted font-mono text-center">
          {loadError || 'Profile not found or unavailable.'}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-xl bg-app border border-app text-app-heading text-sm font-semibold"
        >
          Close
        </button>
      </div>
    );
  }

  const isFemale = liveUser.gender === 'female';
  const isFav = favorites.includes(liveUser.id);

  const handleLikeMoment = async (momentId: string) => {
    const result = await likeUserMoment(liveUser.id, momentId);
    if (!result) return;
    setLikedMoments((prev) => ({
      ...prev,
      [momentId]: { liked: result.liked, count: result.likes },
    }));
    setMomentsList((prev) =>
      prev.map((m) =>
        m.id === momentId ? { ...m, isLiked: result.liked, likes: result.likes } : m
      )
    );
  };

  return shell(
    <>
      {/* Top controls */}
      <div className="absolute top-3 right-3 z-30 flex items-center space-x-2">
        {isSelf && onEditOwnProfile && (
          <button
            type="button"
            onClick={onEditOwnProfile}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-brand/20 border border-brand/40 text-brand text-xs font-semibold backdrop-blur-md"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
        )}
        {!isSelf && (
          <button
            type="button"
            onClick={() => toggleFavorite(liveUser.id)}
            className={`p-2 rounded-full backdrop-blur-md border transition-all shadow-lg ${
              isFav
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:text-white'
            }`}
            title={isFav ? 'Remove from Favorites' : 'Add to Favorites'}
          >
            <Star className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-full bg-slate-900/80 text-slate-300 hover:text-white border border-slate-700 backdrop-blur-md transition-colors shadow-lg"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Hero gallery */}
      <div className="relative h-56 sm:h-72 bg-slate-950 shrink-0 overflow-hidden">
        <button
          type="button"
          className="w-full h-full cursor-zoom-in"
          onClick={() => openPhotoAt(activeImageIndex)}
        >
          <img
            src={
              allImages[activeImageIndex] ||
              getFallbackAvatar(liveUser.name, liveUser.gender, liveUser.role)
            }
            alt={liveUser.name}
            onError={(e) => {
              (e.target as HTMLImageElement).src = getFallbackAvatar(
                liveUser.name,
                liveUser.gender,
                liveUser.role
              );
            }}
            className="w-full h-full object-cover bg-slate-900"
          />
        </button>
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--app-card)] via-transparent to-black/30 pointer-events-none" />

        <div className="absolute top-3 left-3 z-20 flex items-center space-x-2 pointer-events-none">
          <div
            className={`px-2.5 py-1 rounded-full backdrop-blur-md border shadow-md flex items-center space-x-1.5 ${
              liveUser.onlineStatus === 'online'
                ? 'bg-emerald-950/85 border-emerald-500/70 text-emerald-300'
                : liveUser.onlineStatus === 'busy' || liveUser.onlineStatus === 'in_call'
                  ? 'bg-amber-950/85 border-amber-500/70 text-amber-300'
                  : 'bg-slate-950/85 border-slate-700/60 text-slate-400'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                liveUser.onlineStatus === 'online'
                  ? 'bg-emerald-400 animate-pulse'
                  : liveUser.onlineStatus === 'busy' || liveUser.onlineStatus === 'in_call'
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-rose-500'
              }`}
            />
            <span className="text-[10px] font-bold tracking-tight uppercase font-mono">
              {liveUser.onlineStatus === 'online'
                ? 'Online'
                : liveUser.onlineStatus === 'busy' || liveUser.onlineStatus === 'in_call'
                  ? 'Busy'
                  : 'Offline'}
            </span>
          </div>
          {liveUser.isVerified && (
            <span className="px-2.5 py-1 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 text-[11px] font-mono font-bold flex items-center space-x-1 backdrop-blur-md">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
              <span>Verified</span>
            </span>
          )}
        </div>

        {allImages.length > 1 && (
          <div className="absolute bottom-3 left-3 right-3 z-20 flex space-x-2 overflow-x-auto p-1 scrollbar-none">
            {allImages.map((img, idx) => (
              <button
                key={`${img}-${idx}`}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveImageIndex(idx);
                }}
                onDoubleClick={() => openPhotoAt(idx)}
                className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl overflow-hidden border-2 transition-all shrink-0 ${
                  activeImageIndex === idx
                    ? 'border-brand scale-105'
                    : 'border-transparent opacity-70 hover:opacity-100'
                }`}
              >
                <img src={img} alt="thumb" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-app bg-app px-4 sm:px-6 pt-3 shrink-0 space-x-4">
        {(
          [
            { key: 'about' as const, label: 'About', icon: User },
            {
              key: 'media' as const,
              label: `Media (${allImages.length + galleryVideos.length})`,
              icon: Play,
            },
            { key: 'moments' as const, label: `Moments (${momentsList.length})`, icon: Camera },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`pb-3 text-xs sm:text-sm font-semibold flex items-center space-x-2 border-b-2 transition-all ${
              activeTab === key
                ? 'border-brand text-brand'
                : 'border-transparent text-app-muted hover:text-app-heading'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Scrollable content */}
      <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 min-h-0">
        {activeTab === 'about' && (
          <>
            <div className="bg-app p-4 rounded-app-lg border border-app space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2 min-w-0">
                  <h2 className="text-lg sm:text-xl font-black text-white truncate">{liveUser.name}</h2>
                  <span className="text-sm sm:text-base font-bold text-slate-400 shrink-0">
                    {liveUser.age}
                  </span>
                  <SvgFlag
                    countryCode={liveUser.countryCode}
                    nationality={liveUser.nationality}
                    size="md"
                  />
                  {liveUser.zodiac && <ZodiacIcon sign={liveUser.zodiac} withBadge size="xs" />}
                </div>

                {isFemale && !isSelf && (
                  <div className="flex items-center space-x-2 shrink-0 relative">
                    {isFriend(liveUser.id) && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowGearMenu(!showGearMenu)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition-colors"
                          title="Friend & Account Options"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                        {showGearMenu && (
                          <div className="absolute right-0 mt-2 w-48 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-1.5 z-30 text-xs font-medium space-y-0.5">
                            <button
                              type="button"
                              onClick={() => {
                                removeFriend(liveUser.id);
                                setShowGearMenu(false);
                              }}
                              className="w-full text-left px-3 py-2 rounded-xl text-rose-400 hover:bg-rose-500/10 flex items-center space-x-2"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                              <span>Remove Friend</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                clearChatHistory(liveUser.id);
                                setShowGearMenu(false);
                              }}
                              className="w-full text-left px-3 py-2 rounded-xl text-slate-300 hover:bg-slate-800 flex items-center space-x-2"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Clear Chat History</span>
                            </button>
                            <div className="my-1 border-t border-slate-800" />
                            <button
                              type="button"
                              onClick={() => {
                                setShowGearMenu(false);
                                openBlockReportModal(liveUser.id, 'block');
                              }}
                              className="w-full text-left px-3 py-2 rounded-xl text-slate-400 hover:bg-slate-800 flex items-center space-x-2"
                            >
                              <UserX className="w-3.5 h-3.5" />
                              <span>Block User</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowGearMenu(false);
                                openBlockReportModal(liveUser.id, 'report');
                              }}
                              className="w-full text-left px-3 py-2 rounded-xl text-amber-400 hover:bg-amber-500/10 flex items-center space-x-2"
                            >
                              <ShieldAlert className="w-3.5 h-3.5" />
                              <span>Report User</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <div
                      className={`flex items-center space-x-1 px-2.5 py-1 rounded-xl font-mono text-xs font-bold border ${
                        isFriend(liveUser.id)
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                      }`}
                    >
                      <span>
                        {isFriend(liveUser.id)
                          ? `${systemSettings.coinBurnRateFriendPerMin ?? 80}/min`
                          : `${systemSettings.coinBurnRatePerMin || 120}/min`}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-400 flex flex-wrap items-center gap-2 font-mono">
                <span className="flex items-center space-x-1">
                  <Globe className="w-3.5 h-3.5 text-slate-500" />
                  <span>{liveUser.nationality}</span>
                </span>
                <span>•</span>
                <span className="flex items-center space-x-1">
                  {liveUser.gender === 'female' ? (
                    <Venus className="w-3.5 h-3.5 text-pink-400" />
                  ) : liveUser.gender === 'male' ? (
                    <Mars className="w-3.5 h-3.5 text-sky-400" />
                  ) : (
                    <User className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span>
                    {liveUser.gender === 'female'
                      ? 'Female'
                      : liveUser.gender === 'male'
                        ? 'Male'
                        : 'Other'}
                  </span>
                </span>
                {liveUser.ratingScore != null && (
                  <>
                    <span>•</span>
                    <span className="flex items-center space-x-1 text-amber-300">
                      <Star className="w-3.5 h-3.5 fill-current" />
                      <span>
                        {liveUser.ratingScore.toFixed(1)}
                        {liveUser.totalReviewsCount != null
                          ? ` (${liveUser.totalReviewsCount})`
                          : ''}
                      </span>
                    </span>
                  </>
                )}
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-wider flex items-center space-x-1.5">
                <Flame className="w-3.5 h-3.5" />
                <span>Bio</span>
              </h3>
              <div className="bg-app p-4 rounded-app-lg border border-app text-xs sm:text-sm text-slate-200 leading-relaxed space-y-2">
                <p className="font-semibold text-white">{liveUser.bio || 'No bio yet.'}</p>
                {liveUser.extendedBio && (
                  <p className="text-slate-300 text-xs leading-relaxed pt-1 border-t border-slate-800/80">
                    {liveUser.extendedBio}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-app p-3 rounded-app border border-app space-y-0.5">
                <div className="text-slate-500 text-[10px]">Location</div>
                <div className="font-bold text-slate-200 truncate flex items-center space-x-1.5">
                  <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span className="truncate">{getUserEffectiveLocation(liveUser).displayCity}</span>
                </div>
              </div>
              <div className="bg-app p-3 rounded-app border border-app space-y-0.5">
                <div className="text-slate-500 text-[10px]">Zodiac</div>
                <div className="font-bold text-slate-200">
                  {liveUser.zodiac ? (
                    <ZodiacIcon sign={liveUser.zodiac} withBadge size="xs" />
                  ) : (
                    <span className="text-slate-500 text-[11px]">Not set</span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1">
                <Languages className="w-3.5 h-3.5 text-indigo-400" />
                <span>Languages</span>
              </h3>
              <div className="flex flex-wrap gap-2">
                {(liveUser.spokenLanguages || []).map((lang) => (
                  <span
                    key={lang}
                    className="px-3 py-1.5 rounded-xl bg-[#161920] border border-slate-800 text-slate-200 text-xs font-mono font-semibold flex items-center space-x-1.5"
                  >
                    <span>{getLanguageFlag(lang)}</span>
                    <span>{lang}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
                Interests & Tags
              </h3>
              <div className="flex flex-wrap gap-2">
                {[...(liveUser.interests || []), ...(liveUser.tags || [])].map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1.5 rounded-app bg-brand-soft border border-brand/25 text-brand text-xs font-semibold"
                  >
                    #{tag}
                  </span>
                ))}
                {(liveUser.interests || []).length === 0 && (liveUser.tags || []).length === 0 && (
                  <span className="text-xs text-slate-500 font-mono">No interests listed</span>
                )}
              </div>
            </div>

            {!isSelf && !isFriend(liveUser.id) && (
              <button
                type="button"
                onClick={() => addFriend(liveUser.id)}
                className="w-full h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold text-sm flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                Add Friend
              </button>
            )}
          </>
        )}

        {activeTab === 'media' && (
          <div className="space-y-5">
            <div className="space-y-2">
              <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
                Photos ({allImages.length})
              </h3>
              {allImages.length === 0 ? (
                <p className="text-xs text-slate-500 font-mono">No photos yet.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {allImages.map((img, idx) => (
                    <button
                      key={`photo-${idx}`}
                      type="button"
                      onClick={() => openPhotoAt(idx)}
                      className="aspect-square rounded-xl overflow-hidden border border-app bg-slate-900"
                    >
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
                Video clips ({galleryVideos.length})
              </h3>
              {galleryVideos.length === 0 ? (
                <p className="text-xs text-slate-500 font-mono">No video clips yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {galleryVideos.map((vid, idx) => {
                    const url = resolveGalleryVideoSrc(vid);
                    return (
                      <button
                        key={vid.storageKey || vid.url || idx}
                        type="button"
                        onClick={() => openVideoAt(idx)}
                        className="relative aspect-video rounded-xl overflow-hidden border border-app bg-slate-950 group"
                      >
                        {url ? (
                          <video
                            src={url}
                            className="w-full h-full object-cover opacity-90"
                            muted
                            playsInline
                            preload="metadata"
                          />
                        ) : (
                          <div className="w-full h-full bg-slate-900" />
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
                          <span className="w-10 h-10 rounded-full bg-white/90 text-slate-900 flex items-center justify-center">
                            <Play className="w-5 h-5 fill-current ml-0.5" />
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'moments' && (
          <div className="space-y-4">
            {momentsLoading ? (
              <div className="text-center py-12 text-xs text-slate-500 font-mono">Loading moments…</div>
            ) : momentsList.length === 0 ? (
              <div className="text-center py-12 px-4 bg-[#161920] border border-slate-800 rounded-2xl space-y-3 font-mono">
                <Camera className="w-6 h-6 text-indigo-400 mx-auto" />
                <h3 className="text-sm font-bold text-slate-200">No Moments Shared Yet</h3>
                <p className="text-xs text-slate-400 font-sans">
                  {liveUser.name} hasn&apos;t posted any moments yet.
                </p>
              </div>
            ) : (
              momentsList.map((m, mIdx) => {
                const momentLikeState = likedMoments[m.id] || {
                  liked: Boolean(m.isLiked),
                  count: m.likes || 0,
                };
                return (
                  <div
                    key={m.id}
                    className="bg-[#161920] border border-slate-800 rounded-2xl overflow-hidden shadow-xl space-y-3 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2.5">
                        <img
                          src={normalizeMediaUrl(liveUser.avatarUrl)}
                          alt={liveUser.name}
                          className="w-8 h-8 rounded-full object-cover ring-2 ring-indigo-500/30"
                        />
                        <div>
                          <div className="text-xs font-bold text-white flex items-center space-x-1">
                            <span>{liveUser.name}</span>
                            {liveUser.isVerified && <ShieldCheck className="w-3 h-3 text-blue-400" />}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">{m.createdAt}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMomentLightboxIndex(mIdx)}
                        className="p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white border border-slate-800 text-xs flex items-center space-x-1 font-mono"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div
                      className="relative h-56 bg-slate-950 rounded-xl overflow-hidden cursor-pointer group"
                      onClick={() => setMomentLightboxIndex(mIdx)}
                    >
                      {m.mediaType === 'video' ? (
                        <video
                          src={normalizeMediaUrl(m.mediaUrl)}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <img
                          src={normalizeMediaUrl(m.mediaUrl)}
                          alt="Moment media"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      )}
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="px-3 py-1.5 rounded-full bg-slate-950/80 border border-slate-700 text-white text-xs font-mono font-bold flex items-center space-x-1.5">
                          <Eye className="w-3.5 h-3.5 text-indigo-400" />
                          <span>View</span>
                        </span>
                      </div>
                    </div>

                    {m.caption && (
                      <p className="text-xs text-slate-200 leading-relaxed font-sans">{m.caption}</p>
                    )}

                    {!isSelf && (
                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs font-mono">
                        <button
                          type="button"
                          onClick={() => void handleLikeMoment(m.id)}
                          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border transition-all ${
                            momentLikeState.liked
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 font-bold'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                          }`}
                        >
                          <ThumbsUp
                            className={`w-3.5 h-3.5 ${momentLikeState.liked ? 'fill-current text-rose-400' : ''}`}
                          />
                          <span>{momentLikeState.count} Likes</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Modal footer actions */}
      {!isSelf && (
        <div className="p-4 bg-app border-t border-app grid grid-cols-2 gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onOpenChat(liveUser.id)}
            className="h-11 w-full bg-app-card hover:bg-brand-soft text-app-heading rounded-app font-semibold text-sm flex items-center justify-center space-x-2 transition-colors border border-app"
          >
            <MessageSquare className="w-4 h-4 text-brand shrink-0" />
            <span>Chat</span>
          </button>

          {liveUser.role === 'team_leader' || liveUser.role === 'agency_manager' ? (
            <div className="h-11 w-full bg-amber-950/40 border border-amber-500/30 text-amber-300 rounded-xl font-mono font-bold text-[11px] flex items-center justify-center px-2 text-center">
              Agency
            </div>
          ) : currentUser.role === 'team_leader' ? (
            <div className="h-11 w-full bg-slate-900 border border-slate-800 text-slate-400 rounded-xl font-mono text-[11px] flex items-center justify-center px-2 text-center">
              Agency Mode
            </div>
          ) : liveUser.onlineStatus === 'busy' || liveUser.onlineStatus === 'in_call' ? (
            <button
              type="button"
              onClick={() => onStartCall(liveUser.id)}
              className="h-11 w-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 rounded-xl font-mono font-bold text-xs flex items-center justify-center space-x-2"
            >
              <PhoneCall className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Busy — Call</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onStartCall(liveUser.id)}
              className={`h-11 w-full rounded-xl font-mono font-bold text-xs flex items-center justify-center space-x-2 transition-all ${
                liveUser.onlineStatus === 'online'
                  ? 'bg-flirt hover:brightness-110 text-white shadow-brand'
                  : 'bg-slate-800/80 text-slate-400 border border-slate-700/80'
              }`}
            >
              <Video className="w-4 h-4 fill-current shrink-0" />
              <span>{liveUser.onlineStatus === 'online' ? 'Start HD Call' : 'Call (Offline)'}</span>
            </button>
          )}
        </div>
      )}

      {/* Unified photo/video lightbox with prev/next */}
      {activeMedia && mediaLightboxIndex != null && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/90 backdrop-blur-lg"
          onTouchStart={mediaCarousel.onTouchStart}
          onTouchEnd={mediaCarousel.onTouchEnd}
        >
          <div className="relative max-w-3xl w-full bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            <button
              type="button"
              onClick={() => setMediaLightboxIndex(null)}
              className="absolute top-4 right-4 z-20 p-2 rounded-full bg-slate-950/80 text-white border border-slate-700"
            >
              <X className="w-5 h-5" />
            </button>

            {mediaItems.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => mediaCarousel.go(-1)}
                  className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-slate-950/80 text-white border border-slate-700 hover:bg-slate-900"
                  aria-label="Previous media"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  type="button"
                  onClick={() => mediaCarousel.go(1)}
                  className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-slate-950/80 text-white border border-slate-700 hover:bg-slate-900"
                  aria-label="Next media"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}

            <div className="bg-black flex items-center justify-center min-h-[300px] p-2">
              {activeMedia.type === 'video' ? (
                <video
                  key={activeMedia.src}
                  src={activeMedia.src}
                  className="w-full max-h-[80vh] bg-black"
                  controls
                  autoPlay
                  playsInline
                />
              ) : (
                <img
                  key={activeMedia.src}
                  src={activeMedia.src}
                  alt="Full size"
                  className="max-h-[80vh] w-auto max-w-full object-contain"
                />
              )}
            </div>

            {mediaItems.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-slate-950/80 border border-slate-700 text-[11px] font-mono text-slate-200">
                {mediaLightboxIndex + 1} / {mediaItems.length}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Moment lightbox with prev/next */}
      {activeMoment && momentLightboxIndex != null && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/90 backdrop-blur-lg"
          onTouchStart={momentCarousel.onTouchStart}
          onTouchEnd={momentCarousel.onTouchEnd}
        >
          <div className="relative max-w-3xl w-full bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <button
              type="button"
              onClick={() => setMomentLightboxIndex(null)}
              className="absolute top-4 right-4 z-20 p-2 rounded-full bg-slate-950/80 text-white border border-slate-700"
            >
              <X className="w-5 h-5" />
            </button>

            {momentsList.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => momentCarousel.go(-1)}
                  className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-slate-950/80 text-white border border-slate-700 hover:bg-slate-900"
                  aria-label="Previous moment"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  type="button"
                  onClick={() => momentCarousel.go(1)}
                  className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-slate-950/80 text-white border border-slate-700 hover:bg-slate-900"
                  aria-label="Next moment"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}

            <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden min-h-[300px]">
              {activeMoment.mediaType === 'video' ? (
                <video
                  key={activeMoment.id}
                  src={normalizeMediaUrl(activeMoment.mediaUrl)}
                  className="max-h-[70vh] w-auto"
                  controls
                  autoPlay
                  playsInline
                />
              ) : (
                <img
                  key={activeMoment.id}
                  src={normalizeMediaUrl(activeMoment.mediaUrl)}
                  alt="Enlarged moment"
                  className="max-h-[70vh] w-auto object-contain"
                />
              )}
            </div>
            <div className="p-4 sm:p-6 bg-[#12151C] border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="font-bold text-white">{liveUser.name}</span>
                <div className="flex items-center gap-3">
                  {momentsList.length > 1 && (
                    <span className="text-slate-400">
                      {momentLightboxIndex + 1} / {momentsList.length}
                    </span>
                  )}
                  <span className="text-rose-400 font-bold flex items-center space-x-1">
                    <ThumbsUp className="w-3.5 h-3.5 fill-current" />
                    <span>{activeMoment.likes} Likes</span>
                  </span>
                </div>
              </div>
              {activeMoment.caption && (
                <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-sans">
                  {activeMoment.caption}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
