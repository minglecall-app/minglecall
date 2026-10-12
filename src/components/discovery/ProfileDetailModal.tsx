import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  X,
  Video,
  MessageSquare,
  ShieldCheck,
  Globe,
  Languages,
  Crown,
  Heart,
  Sparkles,
  Star,
  Camera,
  Clock,
  Flame,
  PhoneCall,
  MapPin,
  Eye,
  CheckCircle2,
  Share2,
  ThumbsUp,
  Maximize2,
  UserPlus,
  UserCheck,
  Settings,
  UserMinus,
  Trash2,
  UserX,
  ShieldAlert,
  Venus,
  Mars,
  User,
} from 'lucide-react';
import { UserProfile, CreatorMoment } from '../../types';
import { getCountryFlag, getLanguageFlag } from '../../utils/flags';
import { getUserEffectiveLocation } from '../../utils/location';
import { normalizeMediaUrl } from '../../utils/r2Storage';
import { getFallbackAvatar } from '../../utils/avatars';
import { SvgFlag } from '../common/SvgFlag';
import { ZodiacIcon } from '../common/ZodiacIcon';

interface ProfileDetailModalProps {
  user: UserProfile | null;
  onClose: () => void;
  onStartCall: (userId: string) => void;
  onOpenChat: (userId: string) => void;
}

export const ProfileDetailModal: React.FC<ProfileDetailModalProps> = ({
  user,
  onClose,
  onStartCall,
  onOpenChat,
}) => {
  const {
    users,
    systemSettings,
    favorites,
    toggleFavorite,
    showToast,
    isFriend,
    addFriend,
    removeFriend,
    openBlockReportModal,
    clearChatHistory,
    currentUser,
    likeUserMoment,
    fetchUserMoments,
  } = useApp();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'about' | 'moments'>('about');
  const [lightboxMoment, setLightboxMoment] = useState<CreatorMoment | null>(null);
  const [showGearMenu, setShowGearMenu] = useState(false);
  const [momentsList, setMomentsList] = useState<CreatorMoment[]>([]);
  const [momentsLoading, setMomentsLoading] = useState(false);

  // Track liked moments locally for interactive feedback
  const [likedMoments, setLikedMoments] = useState<Record<string, { liked: boolean; count: number }>>({});

  const profileUserId = user?.id;

  useEffect(() => {
    if (!profileUserId) {
      setMomentsList([]);
      return;
    }
    let cancelled = false;
    setMomentsLoading(true);
    fetchUserMoments(profileUserId)
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
  }, [profileUserId]);

  // Bind to reactive live user in context
  const liveUser = user ? (users.find((u) => u.id === user.id) || user) : null;
  if (!liveUser) return null;

  const isFemale = liveUser.gender === 'female';
  const isFav = favorites.includes(liveUser.id);
  const allImages = [normalizeMediaUrl(liveUser.avatarUrl), ...(liveUser.gallery || []).map((img) => normalizeMediaUrl(img))];

  const handleLikeMoment = async (momentId: string, currentLikes: number) => {
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

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-app-card border border-app rounded-app-xl shadow-app-lg overflow-hidden my-auto flex flex-col max-h-[88vh] sm:max-h-[90vh] app-scale-in">
        
        {/* Top Header Bar with Close & Favorite Controls */}
        <div className="absolute top-3 right-3 z-30 flex items-center space-x-2">
          <button
            onClick={() => toggleFavorite(user.id)}
            className={`p-2 rounded-full backdrop-blur-md border transition-all shadow-lg ${
              isFav
                ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:text-white'
            }`}
            title={isFav ? 'Remove from Favorites' : 'Add to Favorites'}
          >
            <Star className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
          </button>

          <button
            onClick={onClose}
            className="p-2 rounded-full bg-slate-900/80 text-slate-300 hover:text-white border border-slate-700 backdrop-blur-md transition-colors shadow-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Hero Gallery Viewport */}
        <div className="relative h-64 sm:h-80 bg-slate-950 shrink-0 overflow-hidden">
          <img
            src={allImages[activeImageIndex]}
            alt={user.name}
            onError={(e) => {
              (e.target as HTMLImageElement).src = getFallbackAvatar(user.name, user.gender, user.role);
            }}
            className="w-full h-full object-cover transition-all duration-500 bg-slate-900"
          />

          {/* Vignette Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--app-card)] via-transparent to-black/30" />

          {/* Top Left Badges */}
          <div className="absolute top-3 left-3 z-20 flex items-center space-x-2">
            <div
              className={`px-2.5 py-1 rounded-full backdrop-blur-md border shadow-md flex items-center space-x-1.5 ${
                liveUser.onlineStatus === 'online'
                  ? 'bg-emerald-950/85 border-emerald-500/70 text-emerald-300 ring-1 ring-emerald-500/30'
                  : liveUser.onlineStatus === 'busy' || liveUser.onlineStatus === 'in_call'
                  ? 'bg-amber-950/85 border-amber-500/70 text-amber-300 ring-1 ring-amber-500/30'
                  : 'bg-slate-950/85 border-slate-700/60 text-slate-400'
              }`}
              title={
                liveUser.onlineStatus === 'online'
                  ? 'Available for Video Call'
                  : liveUser.onlineStatus === 'busy' || liveUser.onlineStatus === 'in_call'
                  ? 'Busy on Video Call'
                  : 'Offline'
              }
            >
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  liveUser.onlineStatus === 'online'
                    ? 'bg-emerald-400 animate-pulse ring-2 ring-emerald-400/50'
                    : liveUser.onlineStatus === 'busy' || liveUser.onlineStatus === 'in_call'
                    ? 'bg-amber-400 animate-pulse ring-2 ring-amber-400/50'
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
                <span>AI Verified</span>
              </span>
            )}
          </div>

          {/* Image Thumbnails Strip */}
          {allImages.length > 1 && (
            <div className="absolute bottom-3 left-3 right-3 z-20 flex space-x-2 overflow-x-auto p-1 scrollbar-none">
              {allImages.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveImageIndex(idx)}
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

        {/* Modal Navigation Tabs Header */}
        <div className="flex items-center border-b border-app bg-app px-4 sm:px-6 pt-3 shrink-0 space-x-4">
          <button
            onClick={() => setActiveTab('about')}
            className={`pb-3 text-xs sm:text-sm font-semibold flex items-center space-x-2 border-b-2 transition-all ${
              activeTab === 'about'
                ? 'border-brand text-brand'
                : 'border-transparent text-app-muted hover:text-app-heading'
            }`}
          >
            <User className="w-4 h-4" />
            <span>About</span>
          </button>

          <button
            onClick={() => setActiveTab('moments')}
            className={`pb-3 text-xs sm:text-sm font-semibold flex items-center space-x-2 border-b-2 transition-all ${
              activeTab === 'moments'
                ? 'border-brand text-brand'
                : 'border-transparent text-app-muted hover:text-app-heading'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>Moments ({momentsList.length})</span>
          </button>
        </div>

        {/* Scrollable Content Area */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'about' ? (
            <>
              {/* Name, Age, Country & Call Rate Header */}
              <div className="bg-app-card p-4 rounded-app-lg border border-app space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-2 min-w-0">
                    <h2 className="text-lg sm:text-xl font-black text-white truncate">{user.name}</h2>
                    <span className="text-sm sm:text-base font-bold text-slate-400 shrink-0">{user.age}</span>
                    <SvgFlag countryCode={user.countryCode} nationality={user.nationality} size="md" />
                    {user.zodiac && (
                      <ZodiacIcon sign={user.zodiac} withBadge={true} size="xs" />
                    )}
                  </div>

                  {isFemale && (
                    <div className="flex items-center space-x-2 shrink-0 relative">
                      {isFriend(user.id) && (
                            /* Gear Settings Icon when user IS a friend */
                            <div className="relative">
                              <button
                                onClick={() => setShowGearMenu(!showGearMenu)}
                                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition-colors"
                                title="Friend & Account Options"
                              >
                                <Settings className="w-4 h-4" />
                              </button>

                              {showGearMenu && (
                                <div className="absolute right-0 mt-2 w-48 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-1.5 z-30 text-xs font-medium space-y-0.5 animate-in fade-in zoom-in-95 duration-150">
                                  <button
                                    onClick={() => {
                                      removeFriend(user.id);
                                      setShowGearMenu(false);
                                    }}
                                    className="w-full text-left px-3 py-2 rounded-xl text-rose-400 hover:bg-rose-500/10 flex items-center space-x-2 transition-colors font-semibold"
                                  >
                                    <UserMinus className="w-3.5 h-3.5 text-rose-400" />
                                    <span>Remove Friend</span>
                                  </button>

                                  <button
                                    onClick={() => {
                                      clearChatHistory(user.id);
                                      setShowGearMenu(false);
                                    }}
                                    className="w-full text-left px-3 py-2 rounded-xl text-slate-300 hover:bg-slate-800 flex items-center space-x-2 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                                    <span>Clear Chat History</span>
                                  </button>

                                  <div className="my-1 border-t border-slate-800" />

                                  <button
                                    onClick={() => {
                                      setShowGearMenu(false);
                                      openBlockReportModal(user.id, 'block');
                                    }}
                                    className="w-full text-left px-3 py-2 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white flex items-center space-x-2 transition-colors"
                                  >
                                    <UserX className="w-3.5 h-3.5 text-slate-500" />
                                    <span>Block User</span>
                                  </button>

                                  <button
                                    onClick={() => {
                                      setShowGearMenu(false);
                                      openBlockReportModal(user.id, 'report');
                                    }}
                                    className="w-full text-left px-3 py-2 rounded-xl text-amber-400 hover:bg-amber-500/10 flex items-center space-x-2 transition-colors"
                                  >
                                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                                    <span>Report User</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                      <div className={`flex items-center space-x-1 px-2.5 py-1 rounded-xl font-mono text-xs sm:text-sm font-bold border ${
                        isFriend(user.id)
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                      }`}>
                        <span>🪙</span>
                        <span>
                          {isFriend(user.id)
                            ? `${systemSettings.coinBurnRateFriendPerMin ?? 80}/min (Friend Rate)`
                            : `${systemSettings.coinBurnRatePerMin || 120}/min`}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <p className="text-xs text-slate-400 flex flex-wrap items-center gap-2 font-mono">
                    <span className="flex items-center space-x-1">
                      <Globe className="w-3.5 h-3.5 text-slate-500" />
                      <span>{user.nationality}</span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center space-x-1">
                      {user.gender === 'female' ? (
                        <Venus className="w-3.5 h-3.5 text-pink-400" />
                      ) : user.gender === 'male' ? (
                        <Mars className="w-3.5 h-3.5 text-sky-400" />
                      ) : (
                        <User className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span
                        className={
                          user.gender === 'female'
                            ? 'text-pink-300'
                            : user.gender === 'male'
                            ? 'text-sky-300'
                            : 'text-slate-300'
                        }
                      >
                        {user.gender === 'female'
                          ? 'Female'
                          : user.gender === 'male'
                          ? 'Male'
                          : 'Other'}
                      </span>
                    </span>
                  </p>
                </div>
              </div>

              {/* Extended Bio Story */}
              <div className="space-y-2">
                <h4 className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-wider flex items-center space-x-1.5">
                  <Flame className="w-3.5 h-3.5" />
                  <span>Bio & Intro Story</span>
                </h4>
                <div className="bg-app-card p-4 rounded-app-lg border border-app text-xs sm:text-sm text-slate-200 leading-relaxed space-y-2">
                  <p className="font-semibold text-white">{user.bio}</p>
                  {user.extendedBio && (
                    <p className="text-slate-300 text-xs leading-relaxed pt-1 border-t border-slate-800/80">
                      {user.extendedBio}
                    </p>
                  )}
                </div>
              </div>

              {/* Quick Facts Grid */}
              <div className="space-y-2">
                <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">Quick Facts & Account Details</h4>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="bg-app-card p-3 rounded-app border border-app space-y-0.5">
                    <div className="text-slate-500 text-[10px] flex items-center justify-between">
                      <span>Location</span>
                      {getUserEffectiveLocation(user).isMock && (
                        <span className="px-1 py-0.2 rounded bg-pink-500/20 text-pink-300 text-[8px] font-bold">
                          MOCK
                        </span>
                      )}
                    </div>
                    <div className="font-bold text-slate-200 truncate flex items-center space-x-1.5">
                      <MapPin className={`w-3 h-3 ${getUserEffectiveLocation(user).isMock ? 'text-pink-400' : 'text-emerald-400'} shrink-0`} />
                      <span className="truncate">{getUserEffectiveLocation(user).displayCity}</span>
                      <SvgFlag countryCode={user.countryCode} nationality={getUserEffectiveLocation(user).country || user.nationality} size="sm" />
                    </div>
                  </div>

                  <div className="bg-app-card p-3 rounded-app border border-app space-y-0.5">
                    <div className="text-slate-500 text-[10px]">Zodiac Sign</div>
                    <div className="font-bold text-slate-200">
                      {user.zodiac ? (
                        <ZodiacIcon sign={user.zodiac} withBadge={true} size="xs" />
                      ) : (
                        <span className="text-slate-500 text-[11px] font-mono">Not set</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Spoken Languages */}
              <div className="space-y-2">
                <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1">
                  <Languages className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Spoken Languages (Auto-Translated)</span>
                </h4>
                <div className="flex flex-wrap gap-2">
                  {user.spokenLanguages.map((lang) => (
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

              {/* Interests & Tags */}
              <div className="space-y-2">
                <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">Interests & Tags</h4>
                <div className="flex flex-wrap gap-2">
                  {user.interests.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1.5 rounded-app bg-brand-soft border border-brand/25 text-brand text-xs font-semibold"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            /* Recent Moments Section */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-mono font-bold text-white flex items-center space-x-2">
                    <Camera className="w-4 h-4 text-indigo-400" />
                    <span>Latest Moments Feed</span>
                  </h3>
                  <p className="text-xs text-slate-400 font-sans mt-0.5">
                    Photos & updates posted recently by {user.name}
                  </p>
                </div>
              </div>

              {momentsLoading ? (
                <div className="text-center py-12 text-xs text-slate-500 font-mono">Loading moments…</div>
              ) : momentsList.length === 0 ? (
                <div className="text-center py-12 px-4 bg-[#161920] border border-slate-800 rounded-2xl space-y-3 font-mono">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto text-xl">
                    <Camera className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-slate-200">No Moments Shared Yet</h4>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto font-sans">
                      {liveUser.name} hasn&apos;t posted any moments yet.
                    </p>
                  </div>
                </div>
              ) : (
                momentsList.map((m) => {
                  const momentLikeState = likedMoments[m.id] || { liked: Boolean(m.isLiked), count: m.likes || 0 };

                  return (
                    <div
                      key={m.id}
                      className="bg-[#161920] border border-slate-800 rounded-2xl overflow-hidden shadow-xl space-y-3 p-4"
                    >
                      {/* Creator Header on Moment */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2.5">
                          <img
                            src={user.avatarUrl}
                            alt={user.name}
                            className="w-8 h-8 rounded-full object-cover ring-2 ring-indigo-500/30"
                          />
                          <div>
                            <div className="text-xs font-bold text-white flex items-center space-x-1">
                              <span>{user.name}</span>
                              {user.isVerified && <ShieldCheck className="w-3 h-3 text-blue-400" />}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">{m.createdAt}</div>
                          </div>
                        </div>

                        <button
                          onClick={() => setLightboxMoment(m)}
                          className="p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white border border-slate-800 text-xs flex items-center space-x-1 font-mono"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Enlarge</span>
                        </button>
                      </div>

                      {/* Media Preview Box */}
                      <div
                        className="relative h-64 bg-slate-950 rounded-xl overflow-hidden cursor-pointer group"
                        onClick={() => setLightboxMoment(m)}
                      >
                        <img
                          src={m.mediaUrl}
                          alt="Moment media"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="px-3 py-1.5 rounded-full bg-slate-950/80 border border-slate-700 text-white text-xs font-mono font-bold flex items-center space-x-1.5">
                            <Eye className="w-3.5 h-3.5 text-indigo-400" />
                            <span>View Full Screen</span>
                          </span>
                        </div>
                      </div>

                      {/* Caption */}
                      <p className="text-xs text-slate-200 leading-relaxed font-sans">{m.caption}</p>

                      {/* Moment Footer Bar */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs font-mono">
                        <button
                          onClick={() => void handleLikeMoment(m.id, momentLikeState.count)}
                          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border transition-all ${
                            momentLikeState.liked
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 font-bold'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                          }`}
                        >
                          <ThumbsUp className={`w-3.5 h-3.5 ${momentLikeState.liked ? 'fill-current text-rose-400' : ''}`} />
                          <span>{momentLikeState.count} Likes</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Modal Sticky Bottom Action Footer */}
        <div className="p-4 bg-app border-t border-app grid grid-cols-2 gap-3 shrink-0">
          <button
            id="profile-start-chat-btn"
            onClick={() => {
              onClose();
              onOpenChat(liveUser.id);
            }}
            className="h-11 w-full bg-app-card hover:bg-brand-soft text-app-heading rounded-app font-semibold text-sm flex items-center justify-center space-x-2 transition-colors border border-app cursor-pointer"
          >
            <MessageSquare className="w-4 h-4 text-brand shrink-0" />
            <span>Chat Box</span>
          </button>

          {liveUser.role === 'team_leader' || liveUser.role === 'agency_manager' ? (
            <div className="h-11 w-full bg-amber-950/40 border border-amber-500/30 text-amber-300 rounded-xl font-mono font-bold text-[11px] flex items-center justify-center space-x-1.5 px-2 text-center">
              <span>👑 Agency</span>
            </div>
          ) : currentUser.role === 'team_leader' ? (
            <div className="h-11 w-full bg-slate-900 border border-slate-800 text-slate-400 rounded-xl font-mono text-[11px] flex items-center justify-center space-x-1.5 px-2 text-center">
              <span>Agency Mode (Manage Only)</span>
            </div>
          ) : liveUser.onlineStatus === 'busy' || liveUser.onlineStatus === 'in_call' ? (
            <button
              id="profile-start-call-btn"
              onClick={() => {
                onClose();
                onStartCall(liveUser.id);
              }}
              className="h-11 w-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 rounded-xl font-mono font-bold text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer"
            >
              <PhoneCall className="w-4 h-4 text-amber-400 shrink-0" />
              <span>User Busy on Call</span>
            </button>
          ) : (
            <button
              id="profile-start-call-btn"
              onClick={() => {
                onClose();
                onStartCall(liveUser.id);
              }}
              className={`h-11 w-full rounded-xl font-mono font-bold text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                liveUser.onlineStatus === 'online'
                  ? 'bg-flirt hover:brightness-110 text-white shadow-brand active:scale-95'
                  : 'bg-slate-800/80 hover:bg-slate-750 text-slate-400 hover:text-slate-200 border border-slate-700/80'
              }`}
            >
              <Video className="w-4 h-4 fill-current shrink-0 animate-pulse" />
              <span>{liveUser.onlineStatus === 'online' ? 'Start HD Call' : 'Call (Offline)'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Lightbox Modal for Enlarged Moment Viewing */}
      {lightboxMoment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-lg animate-fadeIn">
          <div className="relative max-w-3xl w-full bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <button
              onClick={() => setLightboxMoment(null)}
              className="absolute top-4 right-4 z-20 p-2 rounded-full bg-slate-950/80 text-white hover:bg-slate-950 border border-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden min-h-[300px]">
              <img
                src={lightboxMoment.mediaUrl}
                alt="Enlarged moment"
                className="max-h-[70vh] w-auto object-contain"
              />
            </div>

            <div className="p-4 sm:p-6 bg-[#12151C] border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-white">{user.name}</span>
                  <span className="text-slate-500">•</span>
                  <span className="text-slate-400">{lightboxMoment.createdAt}</span>
                </div>
                <div className="text-rose-400 font-bold flex items-center space-x-1">
                  <ThumbsUp className="w-3.5 h-3.5 fill-current" />
                  <span>{lightboxMoment.likes} Likes</span>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-sans">{lightboxMoment.caption}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
