import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  X,
  Send,
  Video,
  CheckCheck,
  UserPlus,
  Users,
  MessageCircle,
  Settings,
  UserMinus,
  Trash2,
  ShieldAlert,
  UserX,
  ExternalLink,
  User,
  Check,
  CheckCircle2,
  UserCheck,
  ArrowLeft,
  Search,
  Sparkles,
  Clock,
  Image,
  Paperclip,
  Loader2,
  Star,
  MoreVertical,
  Menu,
  Unlock,
} from 'lucide-react';
import { uploadMediaDirectlyToR2, normalizeMediaUrl } from '../../utils/r2Storage';
import { getCountryFlag } from '../../utils/flags';

function formatChatTime(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface ChatDrawerProps {
  isOpen?: boolean;
  userId: string | null;
  onClose: () => void;
  onStartCall: (userId: string) => void;
  onOpenProfile?: (userId: string) => void;
}

export const ChatDrawer: React.FC<ChatDrawerProps> = ({
  isOpen = true,
  userId,
  onClose,
  onStartCall,
  onOpenProfile,
}) => {
  const {
    users,
    currentUser,
    chatMessages,
    sendMessage,
    loadOlderMessages,
    friends,
    addFriend,
    removeFriend,
    isFriend,
    systemSettings,
    openBlockReportModal,
    clearChatHistory,
    sendFriendRequest,
    friendRequests,
    acceptFriendRequest,
    declineFriendRequest,
    unreadMessagesCount,
    pendingFriendRequestsCount,
    readMessageIds,
    markChatAsRead,
    markAllChatsAsRead,
    sendRatingRequest,
    submitCreatorReview,
    setPendingRatingCall,
    unblockUser,
    blockedUserIds,
  } = useApp();

  const [activeChatUserId, setActiveChatUserId] = useState<string | null>(userId);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'creators' | 'callers' | 'friends'>('all');
  const [inputText, setInputText] = useState('');
  const [showGearMenu, setShowGearMenu] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [mediaUploadProgress, setMediaUploadProgress] = useState(0);
  const [pendingAttachment, setPendingAttachment] = useState<{
    file: File;
    previewUrl: string;
    publicUrl?: string;
    isUploading: boolean;
    progress: number;
  } | null>(null);
  const [expandedImageModalUrl, setExpandedImageModalUrl] = useState<string | null>(null);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gearMenuRef = useRef<HTMLDivElement>(null);
  const threadScrollRef = useRef<HTMLDivElement>(null);

  // Sync activeChatUserId if userId prop changes
  useEffect(() => {
    setActiveChatUserId(userId);
  }, [userId]);

  // Reset cursor when switching threads; pull first durable page if local cache is thin
  useEffect(() => {
    setHistoryCursor(null);
    setHasMoreHistory(true);
    if (!activeChatUserId || !currentUser?.id) return;
    let cancelled = false;
    (async () => {
      setIsLoadingHistory(true);
      try {
        const { nextCursor, loaded } = await loadOlderMessages(activeChatUserId, null);
        if (cancelled) return;
        setHistoryCursor(nextCursor);
        setHasMoreHistory(Boolean(nextCursor) && loaded > 0);
      } finally {
        if (!cancelled) setIsLoadingHistory(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeChatUserId, currentUser?.id]);

  // Mark chat as read when opening a specific conversation
  useEffect(() => {
    if (activeChatUserId) {
      markChatAsRead(activeChatUserId);
    }
  }, [activeChatUserId, chatMessages]);

  const handleThreadScroll = async (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop > 48 || !hasMoreHistory || isLoadingHistory || !activeChatUserId || !historyCursor) {
      return;
    }
    const prevHeight = el.scrollHeight;
    setIsLoadingHistory(true);
    try {
      const { nextCursor, loaded } = await loadOlderMessages(activeChatUserId, historyCursor);
      setHistoryCursor(nextCursor);
      setHasMoreHistory(Boolean(nextCursor) && loaded > 0);
      requestAnimationFrame(() => {
        if (threadScrollRef.current) {
          const delta = threadScrollRef.current.scrollHeight - prevHeight;
          threadScrollRef.current.scrollTop = Math.max(0, delta);
        }
      });
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Close gear menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (gearMenuRef.current && !gearMenuRef.current.contains(e.target as Node)) {
        setShowGearMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClose = () => {
    setActiveChatUserId(null);
    onClose();
  };

  // Online status indicator helper
  const getStatusDot = (status: string) => {
    if (status === 'online') return 'bg-emerald-500 ring-2 ring-emerald-500/30';
    if (status === 'busy' || status === 'in_call') return 'bg-amber-500 ring-2 ring-amber-500/30';
    return 'bg-rose-500';
  };

  // -------------------------------------------------------------
  // DATA FOR INBOX LIST VIEW
  // -------------------------------------------------------------
  const allOtherUsers = users.filter((u) => u.id !== currentUser.id);

  // Helper to get latest message associated with a user
  const getUserLatestMessage = (targetId: string) => {
    const userMsgs = chatMessages.filter(
      (m) =>
        (m.senderId === currentUser.id && m.receiverId === targetId) ||
        (m.senderId === targetId && m.receiverId === currentUser.id) ||
        m.senderId === targetId ||
        m.receiverId === targetId
    );
    if (userMsgs.length === 0) return null;
    return userMsgs[userMsgs.length - 1];
  };

  // Filter and sort users for Inbox view
  const filteredUsers = allOtherUsers.filter((user) => {
    // Search query match
    const nameMatch = user.name.toLowerCase().includes(searchQuery.toLowerCase());
    const countryMatch = user.nationality.toLowerCase().includes(searchQuery.toLowerCase());
    const latestMsg = getUserLatestMessage(user.id);
    const msgMatch = latestMsg ? latestMsg.text.toLowerCase().includes(searchQuery.toLowerCase()) : false;
    const matchesSearch = nameMatch || countryMatch || msgMatch;

    if (!matchesSearch) return false;

    // Filter type match
    if (filterType === 'creators') return user.gender === 'female' || user.role === 'female_creator';
    if (filterType === 'callers') return user.gender === 'male' || user.role === 'male_user';
    if (filterType === 'friends') return isFriend(user.id);
    return true;
  });

  // Sort by recent messages first
  const sortedUsers = [...filteredUsers].sort((a, b) => {
    const msgA = getUserLatestMessage(a.id);
    const msgB = getUserLatestMessage(b.id);
    if (!msgA && !msgB) return 0;
    if (!msgA) return 1;
    if (!msgB) return -1;
    return 0; // Maintain natural order
  });

  // -------------------------------------------------------------
  // DATA FOR SINGLE 1-ON-1 CHAT VIEW
  // -------------------------------------------------------------
  const currentChatUser = activeChatUserId ? users.find((u) => u.id === activeChatUserId) || null : null;

  const conversation = currentChatUser
    ? chatMessages.filter(
        (m) =>
          (m.senderId === currentUser.id && m.receiverId === currentChatUser.id) ||
          (m.senderId === currentChatUser.id && m.receiverId === currentUser.id)
      )
    : [];

  const isUserFriend = currentChatUser ? isFriend(currentChatUser.id) : false;
  const friendBurnRate = systemSettings.coinBurnRateFriendPerMin ?? 5;
  const standardBurnRate = systemSettings.coinBurnRatePerMin;
  const currentRate = isUserFriend ? friendBurnRate : standardBurnRate;

  const isFemaleUser =
    currentUser.gender === 'female' ||
    currentUser.role === 'female_creator' ||
    currentUser.role === 'female_host';
  const isMaleUser = currentUser.gender === 'male' || currentUser.role === 'male_user';

  const isTargetMale = currentChatUser
    ? currentChatUser.gender === 'male' || currentChatUser.role === 'male_user'
    : false;
  const isTargetFemale = currentChatUser
    ? currentChatUser.gender === 'female' ||
      currentChatUser.role === 'female_creator' ||
      currentChatUser.role === 'female_host'
    : false;

  // Check if currentChatUser (female) sent a pending request to currentUser (male)
  const pendingIncomingRequest = currentChatUser
    ? friendRequests.find(
        (r) =>
          r.senderId === currentChatUser.id &&
          r.receiverId === currentUser.id &&
          r.status === 'pending'
      )
    : null;

  // Check if currentUser (female) sent a pending request to currentChatUser (male)
  const pendingOutgoingRequest = currentChatUser
    ? friendRequests.find(
        (r) =>
          r.senderId === currentUser.id &&
          r.receiverId === currentChatUser.id &&
          r.status === 'pending'
      )
    : null;



  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputText.trim() && !pendingAttachment) || !currentChatUser) return;

    if (pendingAttachment?.isUploading) {
      return;
    }

    // Only durable R2/public URLs — never blob:/data: previews
    const mediaToSend = pendingAttachment?.publicUrl || undefined;
    if (pendingAttachment && !mediaToSend) {
      return;
    }

    const messageText = inputText.trim() || (mediaToSend ? '📷 Photo Attachment' : '');

    void sendMessage(currentChatUser.id, messageText, undefined, mediaToSend, mediaToSend ? 'image' : 'text');
    setInputText('');
    setPendingAttachment(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentChatUser) return;

    // 1. Instant local preview
    const localPreview = URL.createObjectURL(file);
    setPendingAttachment({
      file,
      previewUrl: localPreview,
      isUploading: true,
      progress: 15,
    });

    try {
      const uploadRes = await uploadMediaDirectlyToR2({
        file,
        userId: currentUser.id,
        category: 'chat_media',
        onProgress: (p) => {
          setPendingAttachment((prev) => (prev ? { ...prev, progress: Math.max(15, p) } : null));
        },
      });

      if (uploadRes && uploadRes.publicUrl) {
        setPendingAttachment((prev) =>
          prev ? { ...prev, publicUrl: uploadRes.publicUrl, isUploading: false, progress: 100 } : null
        );
      } else {
        setPendingAttachment(null);
      }
    } catch (err: any) {
      console.warn('[Chat] R2 upload failed:', err?.message || err);
      setPendingAttachment(null);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // If drawer is closed, don't render
  if (!isOpen && !userId && activeChatUserId === null) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end backdrop-blur-md cursor-pointer"
      style={{ backgroundColor: 'var(--app-overlay)' }}
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md bg-app-card border-l border-hairline h-full flex flex-col justify-between shadow-app-lg animate-in slide-in-from-right duration-300 cursor-default pb-16 md:pb-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ========================================================= */}
        {/* VIEW 1: INBOX / ALL CHATS LIST (When no specific chat selected) */}
        {/* ========================================================= */}
        {!currentChatUser ? (
          <div className="flex-1 flex flex-col overflow-hidden bg-app">
            {/* Header Top Bar */}
            <div className="bg-app-card border-b border-hairline p-3.5 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-pink-500/10 border border-pink-500/30 flex items-center justify-center text-pink-400 relative">
                  <MessageCircle className="w-4 h-4" />
                  {unreadMessagesCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse border border-[var(--app-card)]" />
                  )}
                </div>
                <div>
                  <h2 className="font-extrabold text-sm text-app-heading flex items-center space-x-2">
                    <span>Chat Box & Inbox</span>
                    {unreadMessagesCount > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500 text-white font-black shadow-sm animate-pulse">
                        {unreadMessagesCount} new
                      </span>
                    )}
                    {pendingFriendRequestsCount > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-pink-500 text-slate-950 font-black shadow-sm">
                        {pendingFriendRequestsCount} Req
                      </span>
                    )}
                  </h2>
                  <p className="text-[10px] text-app-muted">Select any user below to open direct messages</p>
                </div>
              </div>

              <div className="flex items-center space-x-1.5">
                {unreadMessagesCount > 0 && (
                  <button
                    onClick={markAllChatsAsRead}
                    className="px-2 py-1 bg-app-input hover:bg-brand-soft border border-hairline text-[10px] font-bold text-pink-400 rounded-lg transition-colors cursor-pointer"
                    title="Mark all messages as read"
                  >
                    Mark read
                  </button>
                )}
                <button
                  onClick={handleClose}
                  className="p-1.5 text-app-muted hover:text-app-heading hover:bg-app-input rounded-full transition-colors shrink-0 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Prominent Pending Friend Requests Alert Banner */}
            {pendingFriendRequestsCount > 0 && (
              <div className="p-3 bg-gradient-to-r from-pink-950/50 via-purple-950/40 to-slate-900 border-b border-pink-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 text-xs font-black text-pink-300">
                    <span className="animate-bounce">👥</span>
                    <span className="tracking-wide uppercase text-[10px]">Incoming Friend Requests ({pendingFriendRequestsCount})</span>
                  </div>
                  <span className="text-[9px] bg-pink-500/20 text-pink-200 border border-pink-500/40 px-2 py-0.5 rounded-full font-bold">
                    Special 50% Call Discount Rate
                  </span>
                </div>

                <div className="space-y-1.5">
                  {friendRequests
                    .filter((r) => r.receiverId === currentUser.id && r.status === 'pending')
                    .map((req) => (
                      <div
                        key={req.id}
                        className="bg-app-card border border-pink-500/40 rounded-xl p-2.5 flex items-center justify-between gap-2 shadow-md hover:border-pink-400 transition-all"
                      >
                        <div
                          className="flex items-center space-x-2.5 min-w-0 flex-1 cursor-pointer"
                          onClick={() => setActiveChatUserId(req.senderId)}
                        >
                          <img
                            src={req.senderAvatar}
                            alt={req.senderName}
                            className="w-10 h-10 rounded-full object-cover ring-2 ring-pink-500 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-extrabold text-app-heading truncate flex items-center space-x-1">
                              <span>{req.senderName}</span>
                              <span className="text-[10px] text-pink-400 font-normal">wants to be friends</span>
                            </p>
                            <p className="text-[10px] text-emerald-400 font-semibold truncate">
                              Unlocked Rate: <span className="text-amber-300 font-black">{friendBurnRate} 🪙/min</span> (Standard: {standardBurnRate} 🪙)
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-1.5 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              acceptFriendRequest(req.id);
                            }}
                            className="px-2.5 py-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-[11px] rounded-lg shadow transition-all active:scale-95 flex items-center space-x-1 cursor-pointer"
                            title="Accept Friend Request"
                          >
                            <Check className="w-3 h-3 stroke-[3]" />
                            <span>Accept</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              declineFriendRequest(req.id);
                            }}
                            className="p-1 bg-app-input hover:bg-app-card border border-hairline text-app-muted hover:text-rose-400 rounded-lg transition-all cursor-pointer"
                            title="Decline Request"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Search & Filter Controls Bar */}
            <div className="p-3 bg-app-card-subtle border-b border-hairline space-y-2.5">
              {/* Search Box */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-app-muted absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search user, country or message..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-app-input border border-hairline rounded-xl text-xs text-app-heading placeholder:text-app-muted focus:outline-none focus:border-pink-500 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2.5 text-app-muted hover:text-app-heading text-xs"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filter Pills */}
              <div className="flex items-center space-x-1.5 overflow-x-auto pb-0.5 text-[11px] font-bold scrollbar-none">
                <button
                  onClick={() => setFilterType('all')}
                  className={`px-3 py-1 rounded-lg transition-all shrink-0 cursor-pointer ${
                    filterType === 'all'
                      ? 'bg-pink-600 text-white shadow-sm'
                      : 'bg-app-input text-app-muted hover:text-app-heading border border-hairline'
                  }`}
                >
                  All Chats ({allOtherUsers.length})
                </button>
                <button
                  onClick={() => setFilterType('creators')}
                  className={`px-3 py-1 rounded-lg transition-all shrink-0 cursor-pointer ${
                    filterType === 'creators'
                      ? 'bg-pink-600 text-white shadow-sm'
                      : 'bg-app-input text-app-muted hover:text-app-heading border border-hairline'
                  }`}
                >
                  🌸 Creators
                </button>
                <button
                  onClick={() => setFilterType('callers')}
                  className={`px-3 py-1 rounded-lg transition-all shrink-0 cursor-pointer ${
                    filterType === 'callers'
                      ? 'bg-pink-600 text-white shadow-sm'
                      : 'bg-app-input text-app-muted hover:text-app-heading border border-hairline'
                  }`}
                >
                  ♂️ Callers
                </button>
                <button
                  onClick={() => setFilterType('friends')}
                  className={`px-3 py-1 rounded-lg transition-all shrink-0 cursor-pointer ${
                    filterType === 'friends'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-app-input text-app-muted hover:text-app-heading border border-hairline'
                  }`}
                >
                  👥 Friends ({friends.length})
                </button>
              </div>
            </div>

            {/* Conversation Inbox List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {sortedUsers.length === 0 ? (
                <div className="text-center py-16 text-app-muted font-mono text-xs space-y-2">
                  <Users className="w-10 h-10 text-app-muted mx-auto opacity-60" />
                  <p className="text-app-heading font-bold">No Users Found</p>
                  <p className="text-[10px] text-app-muted">Try adjusting your search query or filter selection.</p>
                </div>
              ) : (
                sortedUsers.map((user) => {
                  const latestMsg = getUserLatestMessage(user.id);
                  const isUserAFriend = isFriend(user.id);
                  const userRate = isUserAFriend ? friendBurnRate : standardBurnRate;
                  const hasIncomingReq = friendRequests.some(
                    (r) => r.senderId === user.id && r.receiverId === currentUser.id && r.status === 'pending'
                  );
                  const unreadForUser = chatMessages.filter(
                    (m) =>
                      m.senderId === user.id &&
                      m.receiverId === currentUser.id &&
                      m.isRead !== true &&
                      !readMessageIds.includes(m.id)
                  ).length;

                  return (
                    <div
                      key={user.id}
                      onClick={() => setActiveChatUserId(user.id)}
                      className={`border rounded-2xl p-3 flex items-center justify-between transition-all shadow-md cursor-pointer group ${
                        hasIncomingReq
                          ? 'bg-gradient-to-r from-pink-500/10 via-app-card to-purple-500/10 border-pink-500/60 ring-1 ring-pink-500/30'
                          : unreadForUser > 0
                          ? 'bg-app-card-subtle border-pink-500/40 hover:border-pink-500'
                          : 'bg-app-card-subtle border-hairline hover:border-pink-500/50 hover:bg-app-card'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0 flex-1">
                        {/* Profile Avatar with Status Dot */}
                        <div className="relative shrink-0">
                          <img
                            src={user.avatarUrl}
                            alt={user.name}
                            className={`w-12 h-12 rounded-full object-cover ring-2 transition-all ${
                              hasIncomingReq ? 'ring-pink-500' : unreadForUser > 0 ? 'ring-rose-500' : 'ring-[var(--app-hairline)] group-hover:ring-pink-500/50'
                            }`}
                          />
                          <span
                            className={`absolute -top-0.5 -left-0.5 w-3.5 h-3.5 rounded-full border-2 border-[var(--app-card)] ${getStatusDot(
                              user.onlineStatus
                            )}`}
                          />
                          {unreadForUser > 0 && (
                            <span className="absolute -bottom-1 -right-1 px-1 min-w-[15px] h-[15px] rounded-full bg-rose-500 text-white font-black text-[9px] flex items-center justify-center border border-[var(--app-card)] shadow animate-pulse">
                              {unreadForUser}
                            </span>
                          )}
                        </div>

                        {/* User Details & Last Message */}
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="flex items-center justify-between">
                            <div className="font-extrabold text-app-heading text-xs flex items-center space-x-1.5 truncate">
                              <span className="truncate">{user.name}</span>
                              <span className="text-xs shrink-0" title={user.nationality}>
                                {getCountryFlag(user.countryCode, user.nationality)}
                              </span>
                              {hasIncomingReq && (
                                <span className="px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-400 text-[9px] font-bold border border-pink-500/40 shrink-0">
                                  Request 🌸
                                </span>
                              )}
                              {unreadForUser > 0 && !hasIncomingReq && (
                                <span className="px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[9px] font-bold shrink-0">
                                  {unreadForUser} new
                                </span>
                              )}
                            </div>
                            {latestMsg && (
                              <span className="text-[10px] text-app-muted font-mono shrink-0 ml-1">
                                {formatChatTime(latestMsg.createdAt || latestMsg.timestamp)}
                              </span>
                            )}
                          </div>

                          {/* Message Preview */}
                          <p className={`text-xs truncate mt-1 transition-colors ${unreadForUser > 0 ? 'text-app-heading font-semibold' : 'text-app-muted group-hover:text-app-heading'}`}>
                            {hasIncomingReq ? (
                              <span className="text-pink-400 font-semibold flex items-center space-x-1">
                                <span>🌸 Sent you a Friend Request! Tap to accept</span>
                              </span>
                            ) : latestMsg ? (
                              <span>
                                <span className="font-semibold text-app-heading/80">
                                  {latestMsg.senderId === currentUser.id ? 'You: ' : ''}
                                </span>
                                {(latestMsg.text || '').replace(/^\[Translated to [^\]]+\]:\s*/i, '')}
                              </span>
                            ) : (
                              <span className="italic text-app-muted">Tap to start chatting with {user.name}...</span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Right Action Arrow */}
                      <div className="shrink-0 pl-1">
                        <button className={`p-2 rounded-xl transition-all ${
                          hasIncomingReq
                            ? 'bg-pink-600 text-white shadow-md'
                            : unreadForUser > 0
                            ? 'bg-rose-600 text-white shadow-md'
                            : 'bg-app-input group-hover:bg-pink-600 group-hover:text-white text-app-muted'
                        }`}>
                          <MessageCircle className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          /* ========================================================= */
          /* VIEW 2: SINGLE 1-ON-1 CHAT SESSION                        */
          /* ========================================================= */
          <div className="flex-1 flex flex-col justify-between overflow-hidden">
            {/* Header Top Navigation */}
            <div className="p-3 bg-app-card border-b border-hairline flex items-center justify-between relative z-20">
              <div className="flex items-center space-x-2.5 min-w-0">
                {/* Back to All Chats Inbox Button */}
                <button
                  onClick={() => setActiveChatUserId(null)}
                  className="p-2 bg-app-input hover:bg-brand-soft border border-hairline text-app-muted hover:text-app-heading rounded-xl text-xs font-bold flex items-center space-x-1 shrink-0 transition-colors cursor-pointer"
                  title="Return to All Chats Inbox"
                >
                  <ArrowLeft className="w-4 h-4 text-pink-400" />
                  <span className="hidden sm:inline">Inbox</span>
                </button>

                {/* Selected User Avatar + name → public profile */}
                <button
                  type="button"
                  onClick={() => onOpenProfile?.(currentChatUser.id)}
                  className="flex items-center space-x-3 min-w-0 text-left rounded-xl hover:bg-app-input/60 px-1 py-0.5 -mx-1 transition-colors cursor-pointer"
                  title={`View ${currentChatUser.name}'s profile`}
                >
                  <div className="relative shrink-0">
                    <img
                      src={currentChatUser.avatarUrl}
                      alt={currentChatUser.name}
                      className="w-10 h-10 rounded-full object-cover ring-2 ring-[var(--app-hairline)]"
                    />
                    <span
                      className={`absolute -top-0.5 -left-0.5 w-3.5 h-3.5 rounded-full border-2 border-[var(--app-card)] ${getStatusDot(
                        currentChatUser.onlineStatus
                      )}`}
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center space-x-1.5">
                      <h3 className="font-extrabold text-sm text-app-heading truncate">{currentChatUser.name}</h3>
                      <span className="text-xs shrink-0" title={currentChatUser.nationality}>
                        {getCountryFlag(currentChatUser.countryCode, currentChatUser.nationality)}
                      </span>
                      {isUserFriend && (
                        <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono font-bold shrink-0 hidden sm:inline-flex items-center gap-0.5">
                          <UserCheck className="w-3 h-3 text-emerald-400" />
                          <span>Friend</span>
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </div>

              {/* Header Right Action Buttons */}
              <div className="flex items-center space-x-2 shrink-0">
                {onOpenProfile && (
                  <button
                    type="button"
                    onClick={() => onOpenProfile(currentChatUser.id)}
                    className="p-2 bg-app-input hover:bg-brand-soft border border-hairline text-app-muted hover:text-app-heading rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0"
                    title={`View ${currentChatUser.name}'s profile`}
                    aria-label={`View ${currentChatUser.name}'s profile`}
                  >
                    <User className="w-4 h-4 text-pink-400" />
                  </button>
                )}

                {/* Direct Video Call Button */}
                <button
                  onClick={() => {
                    onClose();
                    onStartCall(currentChatUser.id);
                  }}
                  className="p-2 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white rounded-xl border border-pink-400/60 shadow-md shadow-pink-500/20 transition-all cursor-pointer flex items-center justify-center shrink-0"
                  title={`Start Video Call with ${currentChatUser.name}`}
                >
                  <Video className="w-4 h-4 fill-current text-white" />
                </button>

                {/* More Options / Hamburger / 3-Dots Dropdown Menu */}
                {currentChatUser.id !== currentUser.id && (
                  <div className="relative" ref={gearMenuRef}>
                    <button
                      onClick={() => setShowGearMenu(!showGearMenu)}
                      className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
                        showGearMenu
                          ? 'bg-pink-600/20 border-pink-500/60 text-pink-300'
                          : 'bg-app-input hover:bg-brand-soft border-hairline text-app-muted hover:text-app-heading'
                      }`}
                      title="More Options"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {showGearMenu && (
                      <div className="absolute right-0 mt-2 w-56 bg-app-card border border-hairline rounded-2xl shadow-2xl p-1.5 z-40 text-xs font-medium space-y-1 animate-in fade-in zoom-in-95 duration-150">
                        {/* 1. Female Host Action: Ask For Rating */}
                        {isFemaleUser && (
                          <button
                            onClick={() => {
                              setShowGearMenu(false);
                              void sendRatingRequest(currentUser.id, currentChatUser.id);
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl text-yellow-500 hover:bg-yellow-500/10 flex items-center space-x-2.5 transition-colors cursor-pointer"
                          >
                            <div className="w-6 h-6 rounded-lg bg-yellow-500/20 flex items-center justify-center shrink-0">
                              <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-xs text-app-heading">Ask for a rating</div>
                              <div className="text-[10px] text-app-muted">Send review request in chat</div>
                            </div>
                          </button>
                        )}

                        {/* 2. Friend Management Actions */}
                        {!isUserFriend ? (
                          isFemaleUser ? (
                            pendingOutgoingRequest ? (
                              <div className="w-full px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-center space-x-2.5 text-xs">
                                <div className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                                  <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-bold text-xs text-amber-300">Request Pending ⏳</div>
                                  <div className="text-[10px] text-amber-400/80">Waiting for approval</div>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setShowGearMenu(false);
                                  sendFriendRequest(currentUser.id, currentChatUser.id);
                                }}
                                className="w-full text-left px-3 py-2 rounded-xl text-pink-300 hover:bg-pink-500/10 flex items-center space-x-2.5 transition-colors cursor-pointer"
                              >
                                <div className="w-6 h-6 rounded-lg bg-pink-500/20 flex items-center justify-center shrink-0">
                                  <UserPlus className="w-3.5 h-3.5 text-pink-400" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-bold text-xs text-app-heading">Add Friend 👥</div>
                                  <div className="text-[10px] text-app-muted">Grant {friendBurnRate} 🪙/m rate</div>
                                </div>
                              </button>
                            )
                          ) : (
                            <button
                              onClick={() => {
                                setShowGearMenu(false);
                                addFriend(currentChatUser.id);
                              }}
                              className="w-full text-left px-3 py-2 rounded-xl text-emerald-300 hover:bg-emerald-500/10 flex items-center space-x-2.5 transition-colors cursor-pointer"
                            >
                              <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                                <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="font-bold text-xs text-app-heading">Add to Friends</div>
                                <div className="text-[10px] text-app-muted">Save to friend circle</div>
                              </div>
                            </button>
                          )
                        ) : (
                          <button
                            onClick={() => {
                              setShowGearMenu(false);
                              removeFriend(currentChatUser.id);
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl text-rose-400 hover:bg-rose-500/10 flex items-center space-x-2.5 transition-colors cursor-pointer"
                          >
                            <div className="w-6 h-6 rounded-lg bg-rose-500/20 flex items-center justify-center shrink-0">
                              <UserMinus className="w-3.5 h-3.5 text-rose-400" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-xs text-rose-300">Remove Friend</div>
                              <div className="text-[10px] text-slate-400">Revert friend rate</div>
                            </div>
                          </button>
                        )}

                        <div className="my-1 border-t border-hairline" />

                        {/* 3. View Full Profile */}
                        {onOpenProfile && (
                          <button
                            onClick={() => {
                              setShowGearMenu(false);
                              onOpenProfile(currentChatUser.id);
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl text-slate-200 hover:bg-slate-800/90 flex items-center space-x-2.5 transition-colors cursor-pointer"
                          >
                            <ExternalLink className="w-4 h-4 text-indigo-400 shrink-0" />
                            <span className="text-xs font-semibold">View Full Profile</span>
                          </button>
                        )}

                        {/* 4. Clear Chat History */}
                        <button
                          onClick={() => {
                            setShowGearMenu(false);
                            clearChatHistory(currentChatUser.id);
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl text-slate-300 hover:bg-slate-800/90 flex items-center space-x-2.5 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4 text-slate-400 shrink-0" />
                          <span className="text-xs font-semibold">Clear Chat History</span>
                        </button>

                        <div className="my-1 border-t border-hairline" />

                        {/* 5. Block / Unblock User */}
                        {blockedUserIds.includes(currentChatUser.id) ? (
                          <button
                            onClick={() => {
                              setShowGearMenu(false);
                              unblockUser(currentChatUser.id);
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl text-emerald-400 hover:bg-emerald-500/10 flex items-center space-x-2.5 transition-colors cursor-pointer"
                          >
                            <Unlock className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span className="text-xs font-semibold">Unblock User 🔓</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setShowGearMenu(false);
                              openBlockReportModal(currentChatUser.id, 'block');
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl text-app-muted hover:bg-app-input hover:text-app-heading flex items-center space-x-2.5 transition-colors cursor-pointer"
                          >
                            <UserX className="w-4 h-4 text-slate-500 shrink-0" />
                            <span className="text-xs font-semibold">Block User</span>
                          </button>
                        )}

                        {/* 6. Report User */}
                        <button
                          onClick={() => {
                            setShowGearMenu(false);
                            openBlockReportModal(currentChatUser.id, 'report');
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl text-amber-400 hover:bg-amber-500/10 flex items-center space-x-2.5 transition-colors cursor-pointer"
                        >
                          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                          <span className="text-xs font-semibold">Report User</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Close Drawer Button */}
                <button
                  onClick={handleClose}
                  className="p-1.5 text-app-muted hover:text-app-heading hover:bg-app-input rounded-full transition-colors shrink-0 cursor-pointer ml-0.5"
                  title="Close Chat"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Conversation info bar */}
            <div className="bg-app-card-subtle px-3.5 py-1.5 border-b border-hairline flex items-center justify-between text-xs gap-2">
              <div className="flex items-center space-x-1.5 text-slate-400 text-[11px] shrink-0">
                <MessageCircle className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                <span>Messages sync securely across your devices.</span>
              </div>
            </div>

            {/* In-Chat Blocked User Banner */}
            {blockedUserIds.includes(currentChatUser.id) && (
              <div className="mx-3 mt-2 px-3 py-2 bg-rose-950/40 border border-rose-500/40 rounded-xl flex items-center justify-between gap-2 shadow-sm text-xs text-rose-300 animate-in fade-in slide-in-from-top-1">
                <span className="flex items-center space-x-1.5 truncate">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span className="truncate">You have blocked <strong>{currentChatUser.name}</strong>.</span>
                </span>
                <button
                  onClick={() => unblockUser(currentChatUser.id)}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] rounded-lg shadow transition-all shrink-0 cursor-pointer flex items-center space-x-1"
                >
                  <Unlock className="w-3 h-3" />
                  <span>Unblock</span>
                </button>
              </div>
            )}

            {/* In-Chat Host Action: Send Friend Request Prompt Banner for Female Hosts */}
            {isFemaleUser && !isUserFriend && !pendingOutgoingRequest && !pendingIncomingRequest && (
              <div className="mx-3 mt-2 px-3 py-2 bg-gradient-to-r from-pink-950/70 via-slate-900 to-indigo-950/70 border border-pink-500/40 rounded-xl flex items-center justify-between gap-2 shadow-sm animate-in fade-in slide-in-from-top-1">
                <div className="flex items-center space-x-2 min-w-0">
                  <UserPlus className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                  <span className="text-xs text-slate-200 truncate">
                    Grant friend rate to <strong>{currentChatUser.name}</strong> (<strong className="text-emerald-400">{friendBurnRate} 🪙/min</strong>)
                  </span>
                </div>
                <button
                  onClick={() => sendFriendRequest(currentUser.id, currentChatUser.id)}
                  className="px-2.5 py-1 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold text-[11px] rounded-lg shadow transition-all shrink-0 cursor-pointer flex items-center space-x-1"
                >
                  <UserPlus className="w-3 h-3" />
                  <span>Add Friend</span>
                </button>
              </div>
            )}

            {/* In-Chat Host Pending Indicator Banner */}
            {isFemaleUser && pendingOutgoingRequest && (
              <div className="mx-3 mt-2 px-3 py-1.5 bg-amber-950/30 border border-amber-500/30 rounded-xl flex items-center justify-between text-xs text-amber-300 shadow-sm">
                <span className="flex items-center space-x-1.5 truncate">
                  <Clock className="w-3 h-3 animate-pulse text-amber-400 shrink-0" />
                  <span className="truncate">Friend Request sent to <strong>{currentChatUser.name}</strong> (Pending)</span>
                </span>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-mono font-bold shrink-0 ml-1.5">Pending ⏳</span>
              </div>
            )}

            {/* In-Chat Friend Request Notification Banner for Recipient User */}
            {pendingIncomingRequest && (
              <div className="mx-3 mt-2 px-3 py-2 bg-gradient-to-r from-pink-950/80 via-slate-900 to-indigo-950/80 border border-pink-500/50 rounded-xl shadow-md flex items-center justify-between gap-2 animate-in fade-in slide-in-from-top-1">
                <div className="flex items-center space-x-2 min-w-0">
                  <UserPlus className="w-4 h-4 text-pink-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">
                      {currentChatUser.name} sent you a Friend Request
                    </p>
                    <p className="text-[10px] text-emerald-300">
                      Unlock Friend Rate: <strong>{friendBurnRate} 🪙/min</strong> (save 50%)
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-1.5 shrink-0">
                  <button
                    onClick={() => acceptFriendRequest(pendingIncomingRequest.id)}
                    className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white font-bold text-xs rounded-lg shadow cursor-pointer flex items-center space-x-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Accept</span>
                  </button>
                  <button
                    onClick={() => declineFriendRequest(pendingIncomingRequest.id)}
                    className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-lg cursor-pointer"
                  >
                    Decline
                  </button>
                </div>
              </div>
            )}

            {/* Message History Stream — cursor pages load on scroll-up */}
            <div
              ref={threadScrollRef}
              onScroll={handleThreadScroll}
              className="flex-1 overflow-y-auto p-4 space-y-3"
            >
              {isLoadingHistory && (
                <div className="flex justify-center py-2 text-[10px] font-mono text-slate-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  Loading earlier messages…
                </div>
              )}
              {conversation.length === 0 ? (
                <div className="text-center py-12 text-slate-500 font-mono text-xs space-y-2">
                  <Sparkles className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-slate-300 font-bold">Start a conversation with {currentChatUser.name}!</p>
                  <p className="text-[10px] text-slate-500">Your messages are saved securely and sync in real time.</p>
                </div>
              ) : (
                conversation.map((m) => {
                  const isMine = m.senderId === currentUser.id;
                  const isFriendReq = m.type === 'friend_request' || !!m.friendRequestInfo;
                  const reqInfo =
                    m.friendRequestInfo ||
                    friendRequests.find(
                      (r) =>
                        r.id === m.friendRequestInfo?.id ||
                        (r.senderId === m.senderId && r.receiverId === m.receiverId) ||
                        (r.senderId === m.senderId && r.receiverId === currentUser.id)
                    );
                  const currentReqStatus = reqInfo?.status || m.friendRequestInfo?.status || 'pending';
                  const isRecipient = currentUser.id === (reqInfo?.receiverId || m.receiverId);

                  if (isFriendReq) {
                    return null;
                  }

                  // Handle Call Rating Message Cards
                  if (m.type === 'call_rating' || m.ratingInfo) {
                    const ratingInfo = m.ratingInfo;
                    const isSubmitted = Boolean(ratingInfo?.isSubmitted);
                    const isCaller = currentUser.id === (ratingInfo?.callerId || m.receiverId);

                    return (
                      <div key={m.id} className="flex justify-center my-2 w-full px-2">
                        <div className="w-full max-w-sm p-4 bg-gradient-to-br from-[#12151F] to-[#181C26] border border-yellow-500/30 rounded-2xl shadow-xl space-y-3 relative overflow-hidden">
                          {/* Top Header */}
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                            <div className="flex items-center space-x-2">
                              <div className="w-8 h-8 rounded-xl bg-yellow-500/20 text-yellow-400 flex items-center justify-center border border-yellow-500/30">
                                <Star className="w-4 h-4 fill-yellow-400" />
                              </div>
                              <div>
                                <div className="text-xs font-black text-white font-mono flex items-center space-x-1">
                                  <span>
                                    {ratingInfo?.creatorName
                                      ? `Rating requested by ${ratingInfo.creatorName}`
                                      : 'Rating request'}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {formatChatTime(m.createdAt || m.timestamp)}
                                </div>
                              </div>
                            </div>

                            {isSubmitted ? (
                              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold flex items-center space-x-1">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Rated ✓</span>
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 text-[10px] font-bold animate-pulse">
                                ⭐ Feedback Request
                              </span>
                            )}
                          </div>

                          {/* Body Content */}
                          {isSubmitted ? (
                            <div className="space-y-2">
                              <div className="flex items-center space-x-1 text-yellow-400 text-sm">
                                {[1, 2, 3, 4, 5].map((s) => (
                                  <Star
                                    key={s}
                                    className={`w-4 h-4 ${
                                      s <= (ratingInfo?.stars || 5)
                                        ? 'fill-yellow-400 text-yellow-400 drop-shadow-[0_0_6px_rgba(250,204,21,0.5)]'
                                        : 'text-slate-700'
                                    }`}
                                  />
                                ))}
                                <span className="text-xs font-bold text-white ml-1.5 font-mono">
                                  {(ratingInfo?.stars || 5).toFixed(1)} / 5.0 Rating
                                </span>
                              </div>

                              {ratingInfo?.comment && (
                                <p className="text-xs text-slate-300 italic bg-black/40 p-2.5 rounded-xl border border-slate-800/80">
                                  "{ratingInfo.comment}"
                                </p>
                              )}

                              {ratingInfo?.tags && ratingInfo.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-1">
                                  {ratingInfo.tags.map((t) => (
                                    <span
                                      key={t}
                                      className="px-2 py-0.5 rounded-md bg-pink-500/10 border border-pink-500/20 text-pink-300 text-[10px] font-mono"
                                    >
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              )}

                              <div className="text-[10px] text-emerald-400 font-mono pt-1 flex items-center space-x-1">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Saved to host reviews</span>
                              </div>
                            </div>
                          ) : isCaller ? (
                            <div className="space-y-3">
                              <p className="text-xs text-slate-300 leading-relaxed font-mono">
                                {m.text ||
                                  `Rating requested by ${ratingInfo?.creatorName || 'the host'}. Share feedback when you are ready — optional.`}
                              </p>

                              {/* Interactive 1-tap star buttons */}
                              <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800/80 flex flex-col items-center justify-center space-y-1">
                                <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider font-bold">
                                  Tap stars to rate
                                </span>
                                <div className="flex items-center space-x-2 py-1">
                                  {[1, 2, 3, 4, 5].map((starVal) => (
                                    <button
                                      key={starVal}
                                      type="button"
                                      onClick={() =>
                                        void submitCreatorReview({
                                          creatorId: ratingInfo?.creatorId || currentChatUser.id,
                                          creatorName: ratingInfo?.creatorName || currentChatUser.name,
                                          creatorAvatar:
                                            ratingInfo?.creatorAvatar || currentChatUser.avatarUrl,
                                          callerId: currentUser.id,
                                          callerName: currentUser.name,
                                          callerAvatar: currentUser.avatarUrl,
                                          callerCountry: currentUser.nationality,
                                          callLogId: ratingInfo?.callLogId,
                                          ratingRequestMessageId: m.id,
                                          stars: starVal,
                                          communication: starVal,
                                          friendliness: starVal,
                                          clarity: starVal,
                                          energy: starVal,
                                          callDurationSeconds: ratingInfo?.callDurationSeconds || 60,
                                        })
                                      }
                                      className="p-1 text-slate-600 hover:text-yellow-400 hover:scale-125 transition-all cursor-pointer group"
                                      title={`Rate ${starVal} Stars`}
                                    >
                                      <Star className="w-6 h-6 hover:fill-yellow-400 group-hover:text-yellow-400" />
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  setPendingRatingCall({
                                    creatorId: ratingInfo?.creatorId || currentChatUser.id,
                                    creatorName: ratingInfo?.creatorName || currentChatUser.name,
                                    creatorAvatar: ratingInfo?.creatorAvatar || currentChatUser.avatarUrl,
                                    callLogId: ratingInfo?.callLogId || '',
                                    durationSeconds: ratingInfo?.callDurationSeconds || 60,
                                    ratingRequestMessageId: m.id,
                                  })
                                }
                                className="w-full py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-yellow-300 border border-yellow-500/30 text-xs font-mono font-bold transition-all cursor-pointer text-center flex items-center justify-center space-x-1.5"
                              >
                                <Star className="w-3.5 h-3.5 fill-yellow-400" />
                                <span>Detailed Review & Badges 💬</span>
                              </button>
                            </div>
                          ) : (
                            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
                              <div className="text-xs text-yellow-400 font-mono font-bold flex items-center space-x-1">
                                <Clock className="w-3.5 h-3.5 animate-pulse" />
                                <span>Ask for a rating — sent</span>
                              </div>
                              <p className="text-[11px] text-slate-400 font-mono">
                                Waiting for {currentChatUser.name} to respond. Ratings are optional.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={m.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                      <div
                        className={`p-3 rounded-2xl max-w-[85%] text-xs space-y-1.5 shadow-md ${
                          isMine
                            ? 'bg-flirt text-white rounded-tr-none'
                            : 'bg-app-input text-app-heading rounded-tl-none border border-hairline'
                        }`}
                      >
                        {m.mediaUrl && (
                          <div
                            onClick={() => setExpandedImageModalUrl(m.mediaUrl || null)}
                            className="rounded-xl overflow-hidden border border-white/20 my-1 max-w-[260px] cursor-pointer group/img relative shadow-lg bg-black/40"
                          >
                            <img
                              src={normalizeMediaUrl(m.mediaUrl)}
                              alt="Attachment"
                              className="w-full h-auto max-h-56 object-cover rounded-xl transition-transform group-hover/img:scale-105"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                              <span className="px-2.5 py-1 rounded-full bg-black/70 text-white font-mono text-[10px] flex items-center gap-1">
                                🔍 Click to expand
                              </span>
                            </div>
                          </div>
                        )}

                        <p className="leading-relaxed">
                          {(m.text || '').replace(/^\[Translated to [^\]]+\]:\s*/i, '')}
                        </p>

                        <div className="flex items-center justify-between pt-1 text-[9px] text-slate-300/80 border-t border-white/10">
                          <span className="text-slate-400/90">
                            {m.originalLanguage ? m.originalLanguage : 'Message'}
                          </span>
                          <span className="flex items-center space-x-1">
                            <span>{formatChatTime(m.createdAt || m.timestamp)}</span>
                            <CheckCheck className={`w-3 h-3 ${m.isRead || isMine ? 'text-emerald-300' : 'text-slate-500'}`} />
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Inline Attachment Preview Bar (Above Input Box) */}
            {pendingAttachment && (
              <div className="mx-3 mb-2 p-2.5 bg-app-card border border-pink-500/50 rounded-2xl flex items-center justify-between gap-3 shadow-xl animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center space-x-3 min-w-0 flex-1">
                  <div className="relative shrink-0">
                    <img
                      src={pendingAttachment.previewUrl}
                      alt="Attachment Preview"
                      className="w-12 h-12 rounded-xl object-cover ring-2 ring-pink-500 shadow-md bg-slate-950"
                    />
                    {pendingAttachment.isUploading && (
                      <div className="absolute inset-0 bg-black/60 rounded-xl flex items-center justify-center">
                        <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-app-heading font-bold text-xs truncate flex items-center space-x-1.5">
                      <span>Photo Attachment</span>
                      {pendingAttachment.isUploading ? (
                        <span className="text-[10px] text-cyan-400 font-mono">({pendingAttachment.progress}%)</span>
                      ) : (
                        <span className="text-[10px] text-emerald-400 font-mono">✓ Ready to send</span>
                      )}
                    </div>
                    <div className="text-[10px] text-app-muted font-mono truncate">
                      {pendingAttachment.file.name} • {(pendingAttachment.file.size / 1024).toFixed(0)} KB
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setPendingAttachment(null)}
                  className="p-1.5 rounded-full bg-app-input hover:bg-brand-soft text-app-muted hover:text-app-heading border border-hairline transition-colors cursor-pointer shrink-0"
                  title="Remove Attachment"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Input Form */}
            <form onSubmit={handleSend} className="p-3 bg-app-card border-t border-hairline space-y-2">
              <div className="flex items-center space-x-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach Photo (Cloudflare R2 Direct)"
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                    pendingAttachment
                      ? 'bg-pink-500/20 border-pink-500 text-pink-400'
                      : 'bg-app-input hover:bg-brand-soft text-app-muted hover:text-pink-400 border-hairline'
                  }`}
                >
                  <Image className="w-4 h-4" />
                </button>

                <input
                  type="text"
                  placeholder={pendingAttachment ? 'Add a caption to your photo...' : `Message ${currentChatUser.name}...`}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="flex-1 px-3.5 py-2.5 bg-app-input border border-hairline rounded-app text-xs text-app-heading placeholder:text-app-muted focus:outline-none focus:border-brand"
                />
                <button
                  type="submit"
                  disabled={
                    (!inputText.trim() && !pendingAttachment?.publicUrl) ||
                    Boolean(pendingAttachment?.isUploading)
                  }
                  className="p-2.5 bg-flirt hover:brightness-110 text-white rounded-app shadow-brand cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Fullscreen Image Preview Inspection Modal */}
      {expandedImageModalUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setExpandedImageModalUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={expandedImageModalUrl}
              alt="Fullscreen Preview"
              className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl border border-slate-800"
            />
            <button
              onClick={() => setExpandedImageModalUrl(null)}
              className="absolute -top-3 -right-3 p-2 bg-slate-900 border border-slate-700 hover:bg-slate-800 text-white rounded-full shadow-xl cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
