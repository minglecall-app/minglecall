import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { getCoinUsdPeg, coinsToUsd } from '../../../shared/finance/fx';
import {
  User,
  MapPin,
  Navigation,
  Globe,
  Compass,
  Sparkles,
  Coins,
  Crown,
  DollarSign,
  PhoneCall,
  Video,
  ShieldCheck,
  Lock,
  Unlock,
  Camera,
  Edit3,
  Save,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Eye,
  Sliders,
  Heart,
  MessageCircle,
  Share2,
  Calendar,
  Layers,
  Award,
  Zap,
  Info,
  ChevronRight,
  TrendingUp,
  KeyRound,
  EyeOff,
  Check,
  Shield,
  Cloud,
  Image as ImageIcon,
  Plus,
  Trash2,
  X,
  FileText,
  Film,
} from 'lucide-react';
import type { FeedPost, GalleryVideoItem } from '../../types';
import {
  POPULAR_MOCK_LOCATIONS,
  detectExactBrowserLocation,
  getUserEffectiveLocation,
} from '../../utils/location';
import { getCountryFlag } from '../../utils/flags';
import {
  uploadMediaDirectlyToR2,
  normalizeMediaUrl,
  isPersistableMediaUrl,
  snapshotFilesForUpload,
  extractStorageKeyFromMediaUrl,
  deleteMediaFromR2,
} from '../../utils/r2Storage';
import { getUserRoleLabel, getFemaleRoleMark } from '../../types';
import { UnifiedImageUploader } from '../common/UnifiedImageUploader';
import { getFallbackAvatar } from '../../utils/avatars';
import { CountrySelector } from '../common/CountrySelector';
import { LanguageSelector } from '../common/LanguageSelector';
import { ZodiacSelector } from '../common/ZodiacSelector';
import { InterestSelector } from '../common/InterestSelector';
import { PasswordStrengthField } from '../auth/PasswordStrengthField';
import { getPasswordPolicyError, isPasswordPolicyValid } from '../../../shared/passwordPolicy';
import { authFetch } from '../../utils/apiClient';
import { signOutSupabase } from '../../services/supabaseAuthService';
import { ProfileShell } from './ProfileShell';
import {
  PROFILE_NAV_ITEMS,
  ProfileNavItem,
  ProfileSectionKey,
} from './profileNavConfig';

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=400',
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=80&w=400',
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=400',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=400',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=400',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=400',
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=400',
];

interface UserProfilePageProps {
  onOpenStore?: () => void;
  onOpenChat?: (userId?: string) => void;
  onNavigateToTab?: (tab: string) => void;
}

export const UserProfilePage: React.FC<UserProfilePageProps> = ({
  onOpenStore,
  onOpenChat,
  onNavigateToTab,
}) => {
  const {
    currentUser,
    systemSettings,
    updateUserProfile,
    changeUserPassword,
    showToast,
    toggleUserStatus,
    claimDailyBonus,
    dailyBonusClaimed,
    feedPosts,
    addFeedPost,
    deleteFeedPost,
    fetchUserMoments,
    callLogs,
    logoutUser,
    users,
  } = useApp();

  const latestSelfGallery = () => {
    const fromUsers = users.find(
      (u) => u.id === currentUser.id || (currentUser.email && u.email === currentUser.email)
    );
    return Array.isArray(fromUsers?.gallery)
      ? fromUsers!.gallery!
      : Array.isArray(currentUser.gallery)
        ? currentUser.gallery
        : [];
  };

  const isTeamLeader = currentUser.role === 'team_leader' || currentUser.role === 'agency_manager';
  const isFemale =
    !isTeamLeader &&
    (currentUser.gender === 'female' ||
      currentUser.role === 'female_creator' ||
      currentUser.role === 'female_host');
  const isMale = !isTeamLeader && (currentUser.gender === 'male' || currentUser.role === 'male_user');
  const isAdmin = currentUser.role === 'admin';
  const canEarnCoins = isFemale
    ? Boolean(currentUser.teamLeaderId) || Boolean(systemSettings.enableRegularFemaleCoinEarning)
    : false;

  // Navigation section inside profile shell
  const [profileSection, setProfileSection] = useState<ProfileSectionKey>('overview');
  const [mediaSubTab, setMediaSubTab] = useState<'photos' | 'videos' | 'moments'>('photos');
  const [isAddMomentModalOpen, setIsAddMomentModalOpen] = useState(false);
  const [momentCaption, setMomentCaption] = useState('');
  const [momentMediaUrl, setMomentMediaUrl] = useState('');
  const [momentPublishing, setMomentPublishing] = useState(false);
  const [myMoments, setMyMoments] = useState<FeedPost[]>([]);
  const [momentsLoading, setMomentsLoading] = useState(false);

  const navItems = useMemo((): ProfileNavItem[] => {
    return PROFILE_NAV_ITEMS.flatMap((item) => {
      if (item.id === 'location') {
        return [
          {
            ...item,
            badge:
              isFemale && currentUser.allowMockLocation ? 'MOCK READY' : undefined,
          },
        ];
      }
      if (item.id === 'rates_earnings') {
        if (isFemale) {
          if (!canEarnCoins) return [];
          return [
            {
              ...item,
              label: 'Earnings',
              icon: 'DollarSign',
              badge:
                currentUser.totalLifetimeEarnedUSD != null
                  ? `$${(currentUser.totalLifetimeEarnedUSD || 0).toFixed(2)}`
                  : undefined,
            },
          ];
        }
        return [{ ...item, label: 'Wallet', icon: 'Coins' }];
      }
      return [item];
    });
  }, [
    isFemale,
    canEarnCoins,
    currentUser.allowMockLocation,
    currentUser.totalLifetimeEarnedUSD,
  ]);

  const handleNavigateSection = useCallback(
    (section: ProfileSectionKey) => {
      if (section === 'rates_earnings' && isFemale && canEarnCoins && onNavigateToTab) {
        onNavigateToTab('earnings');
        return;
      }
      setProfileSection(section);
    },
    [isFemale, canEarnCoins, onNavigateToTab]
  );

  // Password change state
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  // Self-delete account state (hidden for admin)
  const [deleteConfirmPhrase, setDeleteConfirmPhrase] = useState('');
  const [deletePasswordInput, setDeletePasswordInput] = useState('');
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // Avatar upload & R2 storage modal state
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarUploadProgress, setAvatarUploadProgress] = useState(0);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [customAvatarUrlInput, setCustomAvatarUrlInput] = useState('');
  const [isAvatarDragOver, setIsAvatarDragOver] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  const [isAddGalleryModalOpen, setIsAddGalleryModalOpen] = useState(false);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  /** Optimistic gallery so quota + preview update immediately (survives sync races). */
  const [localGalleryVideos, setLocalGalleryVideos] = useState<GalleryVideoItem[] | null>(null);
  /** Blob object URLs keyed by storageKey for instant preview before proxy is ready. */
  const [videoBlobPreviews, setVideoBlobPreviews] = useState<Record<string, string>>({});
  const videoBlobPreviewsRef = useRef(videoBlobPreviews);
  videoBlobPreviewsRef.current = videoBlobPreviews;
  /** Blob previews for gallery photos keyed by durable URL (and storageKey when known). */
  const [photoBlobPreviews, setPhotoBlobPreviews] = useState<Record<string, string>>({});
  const photoBlobPreviewsRef = useRef(photoBlobPreviews);
  photoBlobPreviewsRef.current = photoBlobPreviews;

  const profileVideoQuotaMb = Math.max(1, Number(systemSettings.profileVideoQuotaMb) || 100);
  const maxSingleVideoMb = Math.max(1, Number(systemSettings.r2MaxVideoSizeMb) || 100);
  const galleryVideos = localGalleryVideos ?? currentUser.galleryVideos ?? [];
  const usedVideoBytes = galleryVideos.reduce((sum, v) => sum + (Number(v.sizeBytes) || 0), 0);
  const quotaBytes = profileVideoQuotaMb * 1024 * 1024;
  const remainingVideoBytes = Math.max(0, quotaBytes - usedVideoBytes);

  useEffect(() => {
    if (!localGalleryVideos) return;
    const fromUser = currentUser.galleryVideos || [];
    const keyOf = (v: GalleryVideoItem) => String(v.storageKey || v.url || '');
    const localKeys = localGalleryVideos.map(keyOf).join('|');
    const userKeys = fromUser.map(keyOf).join('|');
    // Drop optimistic overlay only once context matches exactly (add + remove safe).
    if (localKeys === userKeys) {
      setLocalGalleryVideos(null);
    }
  }, [currentUser.galleryVideos, localGalleryVideos]);

  useEffect(() => {
    return () => {
      Object.values(videoBlobPreviewsRef.current).forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch {
          /* ignore */
        }
      });
      Object.values(photoBlobPreviewsRef.current).forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch {
          /* ignore */
        }
      });
    };
  }, []);

  const resolveGalleryVideoSrc = (vid: GalleryVideoItem): string => {
    const key = String(vid.storageKey || '').trim();
    if (key && videoBlobPreviews[key]) return videoBlobPreviews[key];
    const urlKey = String(vid.url || '').trim();
    if (urlKey && videoBlobPreviews[urlKey]) return videoBlobPreviews[urlKey];
    return normalizeMediaUrl(vid.url, vid.storageKey) || (key ? `/api/storage/media?key=${encodeURIComponent(key)}` : '');
  };

  const resolveGalleryPhotoSrc = (url: string): string => {
    const raw = String(url || '').trim();
    if (!raw) return '';
    if (photoBlobPreviews[raw]) return photoBlobPreviews[raw];
    const key = extractStorageKeyFromMediaUrl(raw);
    if (key && photoBlobPreviews[key]) return photoBlobPreviews[key];
    return normalizeMediaUrl(raw, key) || raw;
  };

  const loadMyMoments = useCallback(async () => {
    if (!currentUser?.id || currentUser.id === 'guest_user') {
      setMyMoments([]);
      return;
    }
    setMomentsLoading(true);
    try {
      const fromApi = await fetchUserMoments(currentUser.id);
      if (fromApi.length > 0) {
        setMyMoments(fromApi);
      } else {
        setMyMoments(feedPosts.filter((p) => p.creatorId === currentUser.id));
      }
    } catch {
      setMyMoments(feedPosts.filter((p) => p.creatorId === currentUser.id));
    } finally {
      setMomentsLoading(false);
    }
  }, [currentUser.id, fetchUserMoments, feedPosts]);

  useEffect(() => {
    if (profileSection === 'media' && mediaSubTab === 'moments') {
      void loadMyMoments();
    }
  }, [profileSection, mediaSubTab, loadMyMoments]);

  const handlePublishMoment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (momentPublishing) return;
    if (!momentCaption.trim() || !momentMediaUrl.trim()) {
      showToast('Photo Required', 'Please upload a photo and add a caption for your moment.', 'warning');
      return;
    }
    setMomentPublishing(true);
    const ok = await addFeedPost({
      creatorId: currentUser.id,
      creatorName: currentUser.name,
      creatorAvatar: currentUser.avatarUrl,
      creatorCountry: `${currentUser.countryCode} ${currentUser.nationality}`,
      mediaType: 'image',
      mediaUrl: momentMediaUrl,
      caption: momentCaption,
    });
    setMomentPublishing(false);
    if (ok) {
      setMomentCaption('');
      setMomentMediaUrl('');
      setIsAddMomentModalOpen(false);
      await loadMyMoments();
    }
  };

  const handleRemoveMoment = async (postId: string) => {
    const ok = await deleteFeedPost(postId);
    if (ok) {
      setMyMoments((prev) => prev.filter((p) => p.id !== postId));
    }
  };

  // Direct file upload to Cloudflare R2
  const handleUploadAvatarFile = async (file: File) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Invalid File Type', 'Please select an image file (PNG, JPG, WEBP, GIF)', 'error');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      showToast('File Too Large', 'Avatar image must be under 15MB', 'error');
      return;
    }

    setIsUploadingAvatar(true);
    setAvatarUploadProgress(15);

    try {
      const result = await uploadMediaDirectlyToR2({
        file,
        userId: currentUser.id,
        category: 'avatar',
        onProgress: (percent) => setAvatarUploadProgress(Math.max(15, percent)),
      });

      if (result?.publicUrl && isPersistableMediaUrl(result.publicUrl)) {
        updateUserProfile(currentUser.id, {
          avatarUrl: result.publicUrl,
        });

        setFormData((prev) => ({
          ...prev,
          avatarUrl: result.publicUrl,
        }));

        showToast(
          'Profile Picture Updated',
          'Your new profile picture was uploaded to Cloudflare R2.',
          'success'
        );
        setIsAvatarModalOpen(false);
      } else {
        throw new Error('Upload completed but no cloud storage URL was returned');
      }
    } catch (err: any) {
      console.error('Avatar upload failed:', err?.message || err);
      showToast(
        'Upload Failed',
        err?.message || 'Could not upload your profile photo to Cloudflare R2. Please try again.',
        'error'
      );
    } finally {
      setIsUploadingAvatar(false);
      setAvatarUploadProgress(0);
    }
  };

  const handleAddGalleryPhotos = async (
    items: { publicUrl: string; storageKey?: string; localPreviewUrl?: string }[] | string
  ) => {
    const list =
      typeof items === 'string'
        ? [{ publicUrl: items }]
        : Array.isArray(items)
          ? items
          : [];
    const prepared = list
      .map((i) => ({
        publicUrl: String(i.publicUrl || '').trim(),
        storageKey: String(i.storageKey || '').trim() || undefined,
        localPreviewUrl: String(i.localPreviewUrl || '').trim() || undefined,
      }))
      .filter((i) => i.publicUrl && isPersistableMediaUrl(i.publicUrl));
    if (!prepared.length) {
      showToast('Upload Incomplete', 'No durable photo URL was returned. Please try again.', 'error');
      return;
    }

    // Keep local blob previews so 2nd+ tiles stay visible while CDN/proxy catches up.
    setPhotoBlobPreviews((prev) => {
      const next = { ...prev };
      for (const item of prepared) {
        if (!item.localPreviewUrl) continue;
        next[item.publicUrl] = item.localPreviewUrl;
        if (item.storageKey) next[item.storageKey] = item.localPreviewUrl;
      }
      return next;
    });

    const currentGallery = latestSelfGallery();
    const seen = new Set(currentGallery);
    const added = prepared.map((i) => i.publicUrl).filter((u) => !seen.has(u));
    const updatedGallery = [...currentGallery, ...added];
    const saved = await updateUserProfile(currentUser.id, { gallery: updatedGallery }, {
      silentSuccess: true,
    });
    if (saved) {
      showToast(
        'Gallery Updated',
        `${added.length || prepared.length} photo(s) saved to your gallery.`,
        'success'
      );
      setIsAddGalleryModalOpen(false);
    } else {
      showToast(
        'Gallery Save Failed',
        'Photos uploaded to storage but were not saved to your profile. Please try again.',
        'error'
      );
    }
  };

  const handleRemoveGalleryPhoto = async (indexToRemove: number) => {
    const currentGallery = latestSelfGallery();
    const removedUrl = currentGallery[indexToRemove];
    if (!removedUrl) return;
    const updatedGallery = currentGallery.filter((_, i) => i !== indexToRemove);

    // Best-effort R2 delete (skip silently for external/preset URLs)
    const r2Result = await deleteMediaFromR2({ url: removedUrl });
    if (!r2Result.success && !r2Result.skipped) {
      console.warn('[Gallery] R2 photo delete failed:', r2Result.error);
    }

    const saved = await updateUserProfile(currentUser.id, { gallery: updatedGallery }, {
      silentSuccess: true,
    });
    if (saved) {
      showToast(
        'Photo Removed',
        r2Result.success && !r2Result.skipped
          ? 'Removed from gallery and R2 storage.'
          : 'Gallery updated.',
        'info'
      );
    } else {
      showToast('Remove Failed', 'Could not save gallery changes. Please try again.', 'error');
    }
  };

  const formatMb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 1 : 2);

  const handleUploadGalleryVideos = async (files: FileList | File[]) => {
    // Snapshot before any await — later FileList entries go stale on many devices.
    const list = await snapshotFilesForUpload(files);
    if (!list.length) return;

    const allowed = new Set([
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'video/x-m4v',
    ]);

    setIsUploadingVideo(true);
    setVideoUploadProgress(0);

    try {
      const nextVideos: GalleryVideoItem[] = [...(localGalleryVideos ?? currentUser.galleryVideos ?? [])];
      let used = nextVideos.reduce((s, v) => s + (Number(v.sizeBytes) || 0), 0);
      let uploaded = 0;

      for (const file of list) {
        const mime = file.type || '';
        if (!allowed.has(mime) && !/\.(mp4|webm|mov|m4v)$/i.test(file.name)) {
          showToast('Unsupported Video', `${file.name} is not a supported video type.`, 'warning');
          continue;
        }

        const singleCap = maxSingleVideoMb * 1024 * 1024;
        if (file.size > singleCap) {
          showToast(
            'Video Too Large',
            `${file.name} exceeds the ${maxSingleVideoMb} MB per-file limit.`,
            'warning'
          );
          continue;
        }

        if (used + file.size > quotaBytes) {
          showToast(
            'Video Quota Full',
            `Only ${formatMb(Math.max(0, quotaBytes - used))} MB left of your ${profileVideoQuotaMb} MB profile video quota.`,
            'warning'
          );
          break;
        }

        // Some browsers leave file.type empty for videos — infer for R2 MIME validation.
        let uploadFile = file;
        if (!file.type) {
          const lower = file.name.toLowerCase();
          const inferred = lower.endsWith('.webm')
            ? 'video/webm'
            : lower.endsWith('.mov')
              ? 'video/quicktime'
              : lower.endsWith('.m4v')
                ? 'video/x-m4v'
                : 'video/mp4';
          uploadFile = new File([file], file.name, { type: inferred, lastModified: file.lastModified });
        }

        const localBlob = URL.createObjectURL(file);

        const res = await uploadMediaDirectlyToR2({
          file: uploadFile,
          userId: currentUser.id,
          category: 'gallery_video',
          onProgress: (pct) => setVideoUploadProgress(pct),
        });

        const durableUrl =
          normalizeMediaUrl(res.publicUrl, res.storageKey) ||
          (res.storageKey
            ? `/api/storage/media?key=${encodeURIComponent(res.storageKey)}`
            : res.publicUrl);

        if (!durableUrl && !res.storageKey) {
          try {
            URL.revokeObjectURL(localBlob);
          } catch {
            /* ignore */
          }
          showToast('Upload Incomplete', `${file.name} uploaded but no playable URL was returned.`, 'warning');
          continue;
        }

        // Keep blob under storageKey and durable URL so every tile in a batch previews.
        setVideoBlobPreviews((prev) => {
          const next = { ...prev, [durableUrl]: localBlob };
          if (res.storageKey) next[res.storageKey] = localBlob;
          return next;
        });

        nextVideos.push({
          url: durableUrl,
          storageKey: res.storageKey,
          sizeBytes: res.fileSize || file.size,
          contentType: res.contentType || uploadFile.type || 'video/mp4',
          createdAt: new Date().toISOString(),
        });
        used += res.fileSize || file.size;
        uploaded += 1;
        // Update UI immediately so quota meter + grid show this video.
        setLocalGalleryVideos([...nextVideos]);
      }

      if (uploaded > 0) {
        setLocalGalleryVideos(nextVideos);
        const saved = await updateUserProfile(
          currentUser.id,
          { galleryVideos: nextVideos },
          { silentSuccess: true }
        );
        if (saved) {
          showToast(
            'Videos Added',
            `${uploaded} video(s) uploaded. ${formatMb(used)} / ${profileVideoQuotaMb} MB used.`,
            'success'
          );
        } else {
          setLocalGalleryVideos(null);
          showToast(
            'Video Save Failed',
            'Videos may be in storage but were not saved to your profile. Please try again.',
            'error'
          );
        }
      }
    } catch (err: any) {
      console.error('Gallery video upload failed:', err);
      showToast('Upload Failed', err?.message || 'Could not upload video to R2.', 'error');
    } finally {
      setIsUploadingVideo(false);
      setVideoUploadProgress(0);
      if (videoFileInputRef.current) videoFileInputRef.current.value = '';
    }
  };

  const handleRemoveGalleryVideo = async (indexToRemove: number) => {
    const current = localGalleryVideos ?? currentUser.galleryVideos ?? [];
    const removed = current[indexToRemove];
    if (!removed) return;
    const next = current.filter((_, i) => i !== indexToRemove);
    setLocalGalleryVideos(next);
    if (removed?.storageKey && videoBlobPreviews[removed.storageKey]) {
      try {
        URL.revokeObjectURL(videoBlobPreviews[removed.storageKey]);
      } catch {
        /* ignore */
      }
      setVideoBlobPreviews((prev) => {
        const copy = { ...prev };
        delete copy[removed.storageKey!];
        if (removed.url) delete copy[removed.url];
        return copy;
      });
    }

    // Best-effort R2 delete using storageKey and/or URL
    const r2Result = await deleteMediaFromR2({
      key: removed.storageKey,
      url: removed.url,
    });
    if (!r2Result.success && !r2Result.skipped) {
      console.warn('[Gallery] R2 video delete failed:', r2Result.error);
    }

    const saved = await updateUserProfile(
      currentUser.id,
      { galleryVideos: next },
      { silentSuccess: true }
    );
    if (saved) {
      showToast(
        'Video Removed',
        r2Result.success && !r2Result.skipped
          ? 'Removed from gallery and R2 storage.'
          : 'Profile video gallery updated.',
        'info'
      );
    } else {
      setLocalGalleryVideos(null);
      showToast('Remove Failed', 'Could not save gallery video changes. Please try again.', 'error');
    }
  };

  const handleAvatarFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleUploadAvatarFile(e.target.files[0]);
    }
  };

  const handleAvatarDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsAvatarDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUploadAvatarFile(e.dataTransfer.files[0]);
    }
  };

  const handleSelectPresetAvatar = (presetUrl: string) => {
    updateUserProfile(currentUser.id, {
      avatarUrl: presetUrl,
    });
    setFormData((prev) => ({ ...prev, avatarUrl: presetUrl }));
    showToast('Profile Picture Updated ✨', 'Avatar preset applied successfully!', 'success');
    setIsAvatarModalOpen(false);
  };

  const handleSaveCustomAvatarUrl = () => {
    if (!customAvatarUrlInput.trim()) {
      showToast('Input Required', 'Please enter a valid image URL', 'warning');
      return;
    }
    updateUserProfile(currentUser.id, {
      avatarUrl: customAvatarUrlInput.trim(),
    });
    setFormData((prev) => ({ ...prev, avatarUrl: customAvatarUrlInput.trim() }));
    showToast('Profile Picture Updated ✨', 'Custom avatar URL applied and saved!', 'success');
    setCustomAvatarUrlInput('');
    setIsAvatarModalOpen(false);
  };

  const handleCopyEmail = () => {
    const emailToCopy = currentUser.email || `${currentUser.id.slice(0, 8)}@livecall.app`;
    navigator.clipboard.writeText(emailToCopy);
    showToast('Email Copied', `${emailToCopy} copied to clipboard!`, 'info');
  };

  // Handle password submission
  const handleChangePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const policyError = getPasswordPolicyError(newPasswordInput);
    if (policyError) {
      showToast('Password Requirements', policyError, 'error');
      return;
    }
    if (newPasswordInput !== confirmPasswordInput) {
      showToast('Password Mismatch', 'New password and confirmation password do not match.', 'error');
      return;
    }

    setPasswordSubmitting(true);
    const result = changeUserPassword(currentUser.id, currentPasswordInput, newPasswordInput);
    setPasswordSubmitting(false);

    if (result.success) {
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmPasswordInput('');
    }
  };

  const handleSelfDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAdmin) return;

    const phrase = deleteConfirmPhrase.trim();
    const email = (currentUser.email || '').trim().toLowerCase();
    const phraseOk =
      phrase.toUpperCase() === 'DELETE' || (email && phrase.toLowerCase() === email);
    if (!phraseOk) {
      showToast('Confirmation Required', 'Type DELETE or your account email to continue.', 'warning');
      return;
    }
    if (!deletePasswordInput.trim()) {
      showToast('Password Required', 'Enter your password to permanently delete this account.', 'warning');
      return;
    }

    const ok = window.confirm(
      'This permanently deletes your account, login, and profile data. This cannot be undone. Continue?'
    );
    if (!ok) return;

    setDeleteSubmitting(true);
    try {
      const res = await authFetch('/api/users/me/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmPhrase: phrase,
          password: deletePasswordInput,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        const errMsg =
          (typeof data?.error === 'string' && data.error) ||
          data?.error?.message ||
          'Could not delete your account.';
        showToast('Delete Failed', errMsg, 'error');
        return;
      }

      showToast('Account Deleted', 'Your account has been permanently removed.', 'success');
      setDeleteConfirmPhrase('');
      setDeletePasswordInput('');
      try {
        await signOutSupabase();
      } catch {
        /* ignore */
      }
      logoutUser();
      try {
        localStorage.removeItem('livecall_logged_in');
        localStorage.removeItem('livecall_current_user_id');
      } catch {
        /* ignore */
      }
      if (typeof window !== 'undefined') {
        window.location.assign('/');
      }
    } catch (err: any) {
      showToast('Delete Failed', err?.message || 'Network error during account deletion.', 'error');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // Location detection states
  const [isDetectingGps, setIsDetectingGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Track whether user has active uncommitted edits in the form to prevent heartbeat wipes
  const isDirtyRef = useRef<boolean>(false);
  const saveInFlightRef = useRef<boolean>(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const lastUserIdRef = useRef<string>(currentUser.id);

  // Editable Bio form fields
  const [formData, setFormData] = useState({
    name: currentUser.name || '',
    bio: currentUser.bio || '',
    extendedBio: currentUser.extendedBio || '',
    locationCity: currentUser.locationCity || '',
    zodiac: currentUser.zodiac || '',
    nationality: currentUser.nationality || '',
    countryCode: currentUser.countryCode || '',
    hourlyCoinRate: currentUser.hourlyCoinRate || 10,
    avatarUrl: currentUser.avatarUrl || '',
    responseRate: currentUser.responseRate || '98% instant',
    interestedIn: currentUser.interestedIn && currentUser.interestedIn.length > 0 ? currentUser.interestedIn[0] : (isFemale ? 'male' : 'female'),
    spokenLanguages: currentUser.spokenLanguages && currentUser.spokenLanguages.length > 0 ? currentUser.spokenLanguages : ['English'],
    interests: currentUser.interests && currentUser.interests.length > 0 ? currentUser.interests : [],
  });

  // Synchronize when switching accounts OR when initial profile data loads (never overwrite while user is editing)
  useEffect(() => {
    const isUserSwitch = lastUserIdRef.current !== currentUser.id;
    if (isUserSwitch) {
      lastUserIdRef.current = currentUser.id;
      isDirtyRef.current = false;
    }

    // Only update formData from currentUser if user has not made uncommitted edits
    if (!isDirtyRef.current) {
      setFormData({
        name: currentUser.name || '',
        bio: currentUser.bio || '',
        extendedBio: currentUser.extendedBio || '',
        locationCity: currentUser.locationCity || '',
        zodiac: currentUser.zodiac || '',
        nationality: currentUser.nationality || '',
        countryCode: currentUser.countryCode || '',
        hourlyCoinRate: currentUser.hourlyCoinRate || 10,
        avatarUrl: currentUser.avatarUrl || '',
        responseRate: currentUser.responseRate || '98% instant',
        interestedIn: currentUser.interestedIn && currentUser.interestedIn.length > 0 ? currentUser.interestedIn[0] : (isFemale ? 'male' : 'female'),
        spokenLanguages: currentUser.spokenLanguages && currentUser.spokenLanguages.length > 0 ? currentUser.spokenLanguages : ['English'],
        interests: currentUser.interests && currentUser.interests.length > 0 ? currentUser.interests : [],
      });
    }
  }, [
    currentUser.id,
    currentUser.name,
    currentUser.bio,
    currentUser.extendedBio,
    currentUser.locationCity,
    currentUser.zodiac,
    currentUser.nationality,
    currentUser.countryCode,
    currentUser.hourlyCoinRate,
    currentUser.avatarUrl,
    currentUser.responseRate,
    currentUser.interestedIn,
    currentUser.spokenLanguages,
    currentUser.interests,
    isFemale,
  ]);

  // Current effective location
  const effectiveLocation = getUserEffectiveLocation(currentUser);

  // Handle GPS location detection
  const handleDetectExactLocation = async () => {
    setIsDetectingGps(true);
    setGpsError(null);
    try {
      const detected = await detectExactBrowserLocation();
      updateUserProfile(currentUser.id, {
        exactLocation: {
          latitude: detected.latitude,
          longitude: detected.longitude,
          city: detected.city,
          country: detected.country,
          countryCode: detected.countryCode,
          accuracyMeters: detected.accuracyMeters,
          detectedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
        locationCity: `${detected.city}, ${detected.country}`,
        countryCode: detected.countryCode,
        nationality: detected.country,
      });
      showToast(
        'GPS Location Detected! 📍',
        `Successfully locked exact coordinates: ${detected.city}, ${detected.country}`,
        'success'
      );
    } catch (err: any) {
      setGpsError(err.message || 'Could not acquire browser GPS location.');
      showToast('Location Detection Error', err.message || 'Please allow GPS access', 'error');
    } finally {
      setIsDetectingGps(false);
    }
  };

  // Toggle Mock Location state (For female host)
  const handleToggleMockLocation = (enabled: boolean) => {
    if (!currentUser.allowMockLocation) {
      showToast(
        'Permission Denied',
        'Platform Admin has not granted mock location permissions to your account.',
        'warning'
      );
      return;
    }

    updateUserProfile(currentUser.id, {
      isUsingMockLocation: enabled,
      mockLocationCity: currentUser.mockLocationCity || 'Miami',
      mockLocationCountry: currentUser.mockLocationCountry || 'United States',
      mockLocationCountryCode: currentUser.mockLocationCountryCode || 'US',
    });

    showToast(
      enabled ? 'Mock Location Active 🎭' : 'Real Location Restored 📍',
      enabled
        ? `Callers will now see your location as ${currentUser.mockLocationCity || 'Miami'}`
        : 'Displaying your original profile/GPS location.',
      'info'
    );
  };

  // Select Preset Mock Location
  const handleSelectMockPreset = (preset: typeof POPULAR_MOCK_LOCATIONS[0]) => {
    if (!currentUser.allowMockLocation) {
      showToast('Action Locked', 'Admin permission required to use mock locations.', 'warning');
      return;
    }

    updateUserProfile(currentUser.id, {
      isUsingMockLocation: true,
      mockLocationCity: preset.city,
      mockLocationCountry: preset.country,
      mockLocationCountryCode: preset.countryCode,
    });

    showToast(
      'Virtual Location Updated ✈️',
      `Your public host location set to ${preset.city}, ${preset.country} ${preset.flag}`,
      'success'
    );
  };

  // Save general profile edits
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    isDirtyRef.current = true;
    setIsSavingProfile(true);

    const newNationality = formData.nationality || currentUser.nationality || 'United States';
    const newCountryCode = (formData.countryCode || currentUser.countryCode || 'US').toUpperCase();

    // Dynamically identify what changed for intuitive user toast feedback
    const changes: string[] = [];
    if (formData.name && formData.name !== currentUser.name) changes.push(`Name set to "${formData.name}"`);
    if (newNationality !== (currentUser.nationality || 'United States') || newCountryCode !== (currentUser.countryCode || 'US').toUpperCase()) {
      changes.push(`Country set to ${newNationality} (${newCountryCode})`);
    }
    if (formData.zodiac !== (currentUser.zodiac || '')) {
      changes.push(`Zodiac set to ${formData.zodiac || 'None'}`);
    }
    if (formData.locationCity !== (currentUser.locationCity || '')) changes.push('Location updated');
    if (formData.bio !== (currentUser.bio || '') || formData.extendedBio !== (currentUser.extendedBio || '')) changes.push('Bio updated');
    if (JSON.stringify(formData.spokenLanguages || []) !== JSON.stringify(currentUser.spokenLanguages || [])) changes.push('Languages updated');
    if (JSON.stringify(formData.interests || []) !== JSON.stringify(currentUser.interests || [])) changes.push('Interests updated');
    if (formData.avatarUrl && formData.avatarUrl !== currentUser.avatarUrl) changes.push('Profile picture updated');
    if (formData.responseRate !== (currentUser.responseRate || '98% instant')) changes.push('Response rate updated');

    const toastMsg = changes.length > 0
      ? `Profile updated: ${changes.join(' • ')}`
      : 'Profile updated successfully!';

    try {
      const saved = await updateUserProfile(currentUser.id, {
        name: formData.name,
        bio: formData.bio,
        extendedBio: formData.extendedBio,
        locationCity: formData.locationCity || newNationality,
        zodiac: formData.zodiac,
        nationality: newNationality,
        countryCode: newCountryCode,
        hourlyCoinRate: currentUser.hourlyCoinRate,
        avatarUrl: formData.avatarUrl,
        responseRate: formData.responseRate,
        interestedIn: [formData.interestedIn],
        spokenLanguages: formData.spokenLanguages,
        interests: formData.interests,
        exactLocation: currentUser.exactLocation ? {
          ...currentUser.exactLocation,
          country: newNationality,
          countryCode: newCountryCode,
          city: formData.locationCity || currentUser.exactLocation.city || newNationality,
        } : undefined,
      });
      if (saved) {
        isDirtyRef.current = false;
        showToast('Profile Saved ✨', toastMsg, 'success');
      }
    } finally {
      saveInFlightRef.current = false;
      setIsSavingProfile(false);
    }
  };

  const sidebarUserChip = (
    <button
      type="button"
      onClick={() => handleNavigateSection('overview')}
      className="w-full flex items-center gap-2.5 text-left rounded-xl p-1.5 hover:bg-slate-800/60 transition-colors cursor-pointer"
    >
      <img
        src={normalizeMediaUrl(currentUser.avatarUrl)}
        alt={currentUser.name}
        onError={(e) => {
          (e.target as HTMLImageElement).src = getFallbackAvatar(
            currentUser.name,
            currentUser.gender,
            currentUser.role
          );
        }}
        className="w-9 h-9 rounded-lg object-cover ring-2 ring-indigo-500/40 shrink-0"
      />
      <div className="min-w-0">
        <div className="text-xs font-bold text-white truncate">{currentUser.name}</div>
        <div className="text-[10px] text-slate-400 truncate font-mono">
          {getUserRoleLabel(currentUser)}
        </div>
      </div>
    </button>
  );

  return (
    <ProfileShell
      activeSection={profileSection}
      onNavigateSection={handleNavigateSection}
      navItems={navItems}
      brandName="My Profile"
      brandSubtitle="Account"
      sidebarUserChip={sidebarUserChip}
    >
      {/* Hidden file input for fast avatar upload */}
      <input
        type="file"
        ref={avatarFileInputRef}
        onChange={handleAvatarFileInputChange}
        accept="image/*"
        className="hidden"
      />

      {/* Overview: compact identity + summary links */}
      {profileSection === 'overview' && (
      <div className="space-y-4">
      {/* Slim identity hero */}
      <div className="relative rounded-2xl bg-app-card border border-hairline p-4 sm:p-6 shadow-app-lg overflow-hidden">
        <div
          className={`absolute -top-20 -right-20 w-56 h-56 rounded-full blur-3xl pointer-events-none opacity-15 ${
            isFemale ? 'bg-pink-500' : 'bg-indigo-500'
          }`}
        />

        <div className="relative z-10 flex flex-col gap-4">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <button
              type="button"
              onClick={() => setIsAvatarModalOpen(true)}
              disabled={isUploadingAvatar}
              className="relative shrink-0 group cursor-pointer"
              title="Change profile picture"
            >
              <img
                src={normalizeMediaUrl(currentUser.avatarUrl)}
                alt={currentUser.name}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = getFallbackAvatar(
                    currentUser.name,
                    currentUser.gender,
                    currentUser.role
                  );
                }}
                className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover ring-2 shadow-lg bg-app-input ${
                  isFemale ? 'ring-pink-500/50' : 'ring-indigo-500/50'
                }`}
              />
              <span className="absolute inset-0 rounded-2xl flex items-center justify-center bg-black/50 text-white opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                {isUploadingAvatar ? (
                  <RefreshCw className="w-4 h-4 text-indigo-300 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4 text-indigo-200" />
                )}
              </span>
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[var(--app-card)] z-10 ${
                  currentUser.onlineStatus === 'online'
                    ? 'bg-emerald-400'
                    : currentUser.onlineStatus === 'busy' || currentUser.onlineStatus === 'in_call'
                      ? 'bg-amber-400'
                      : 'bg-rose-500'
                }`}
                title={`Status: ${currentUser.onlineStatus}`}
              />
            </button>

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black text-app-heading tracking-tight truncate">
                  {currentUser.name}
                </h2>
                {currentUser.isVerified && (
                  <span className="px-1.5 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 font-mono text-[10px] font-bold">
                    Verified
                  </span>
                )}
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-black uppercase tracking-wider border inline-flex items-center gap-1 ${
                    getFemaleRoleMark(currentUser) === 'creator'
                      ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                      : getFemaleRoleMark(currentUser) === 'user'
                        ? 'bg-pink-500/20 border-pink-500/40 text-pink-300'
                        : getUserRoleLabel(currentUser) === 'Male User'
                          ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                          : currentUser.role === 'team_leader' ||
                            currentUser.role === 'agency_manager'
                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                            : getUserRoleLabel(currentUser) === 'Admin'
                              ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                              : 'bg-teal-500/20 border-teal-500/40 text-teal-300'
                  }`}
                >
                  {getUserRoleLabel(currentUser)}
                </span>
              </div>

              <div className="flex items-center gap-1 bg-app-input p-1 rounded-xl border border-hairline w-fit">
                {(['online', 'busy', 'offline'] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => toggleUserStatus(currentUser.id, status)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono capitalize transition-all cursor-pointer ${
                      currentUser.onlineStatus === status ||
                      (status === 'busy' && currentUser.onlineStatus === 'in_call')
                        ? status === 'online'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                          : status === 'busy'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/50'
                        : 'text-app-muted hover:text-app-heading border border-transparent'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {isTeamLeader && onNavigateToTab && (
            <button
              type="button"
              onClick={() => onNavigateToTab('team_leader')}
              className="w-full sm:w-auto self-start px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-mono font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Crown className="w-3.5 h-3.5" />
              <span>Agency Hub</span>
            </button>
          )}
        </div>
      </div>

      {/* About teaser */}
      <div className="p-4 sm:p-5 bg-app-card border border-hairline rounded-2xl space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-app-heading font-mono uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>{isFemale ? 'Creator Bio' : 'About'}</span>
          </h3>
          <button
            type="button"
            onClick={() => setProfileSection('edit_bio')}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-mono font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Edit3 className="w-3 h-3" />
            <span>Edit</span>
          </button>
        </div>
        <p className="text-sm text-app-heading italic font-serif line-clamp-3">
          &ldquo;{currentUser.bio || 'No short bio yet.'}&rdquo;
        </p>
        {currentUser.extendedBio && (
          <p className="text-xs text-app-muted line-clamp-2 whitespace-pre-line">
            {currentUser.extendedBio}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {(currentUser.spokenLanguages || []).slice(0, 4).map((lang, idx) => (
            <span
              key={`lang-${idx}`}
              className="px-2 py-0.5 rounded-lg bg-app-input border border-hairline text-app-heading text-[11px] font-mono"
            >
              {lang}
            </span>
          ))}
          {(currentUser.interests || []).slice(0, 4).map((tag, idx) => (
            <span
              key={`int-${idx}`}
              className="px-2 py-0.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-[11px]"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Activity highlights */}
      {isFemale && (
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3.5 bg-app-card border border-hairline rounded-2xl">
            <div className="text-[10px] text-app-muted font-mono uppercase">Calls Hosted</div>
            <div className="text-lg font-black text-pink-400 font-mono mt-0.5">
              {currentUser.totalCallsHosted || 0}
            </div>
          </div>
          <div className="p-3.5 bg-app-card border border-hairline rounded-2xl">
            <div className="text-[10px] text-app-muted font-mono uppercase">Call Minutes</div>
            <div className="text-lg font-black text-indigo-400 font-mono mt-0.5">
              {currentUser.totalCallMinutes || 0}m
            </div>
          </div>
          <div className="p-3.5 bg-app-card border border-hairline rounded-2xl">
            <div className="text-[10px] text-app-muted font-mono uppercase">Gifts</div>
            <div className="text-lg font-black text-amber-400 font-mono mt-0.5">
              {currentUser.totalGiftsReceivedCount || 0}
            </div>
          </div>
          <div className="p-3.5 bg-app-card border border-hairline rounded-2xl">
            <div className="text-[10px] text-app-muted font-mono uppercase">Response</div>
            <div className="text-xs font-bold text-emerald-400 font-mono mt-1 truncate">
              {currentUser.responseRate || '—'}
            </div>
          </div>
        </div>
      )}

      {/* Deep links — avoid duplicating section content */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => setProfileSection('location')}
          className="flex items-center justify-between gap-2 p-3.5 rounded-2xl bg-app-card border border-hairline hover:border-pink-500/40 text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <MapPin className="w-4 h-4 text-pink-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-app-heading">Location</div>
              <div className="text-[11px] text-app-muted truncate">{effectiveLocation.displayCity}</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-app-muted shrink-0" />
        </button>

        {!isFemale && (
          <button
            type="button"
            onClick={() => setProfileSection('rates_earnings')}
            className="flex items-center justify-between gap-2 p-3.5 rounded-2xl bg-app-card border border-hairline hover:border-amber-500/40 text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Coins className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold text-app-heading">Wallet</div>
                <div className="text-[11px] text-app-muted truncate">
                  {currentUser.coinBalance} coins
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-app-muted shrink-0" />
          </button>
        )}

        {isFemale && canEarnCoins && onNavigateToTab && (
          <button
            type="button"
            id="profile-host-earnings-amount-btn"
            onClick={() => onNavigateToTab('earnings')}
            className="flex items-center justify-between gap-2 p-3.5 rounded-2xl bg-app-card border border-hairline hover:border-emerald-500/40 text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <DollarSign className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold text-app-heading">Earnings</div>
                <div className="text-[11px] text-app-muted truncate">
                  ${(currentUser.totalLifetimeEarnedUSD || 0).toFixed(2)} lifetime
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-app-muted shrink-0" />
          </button>
        )}

        <button
          type="button"
          onClick={() => setProfileSection('media')}
          className="flex items-center justify-between gap-2 p-3.5 rounded-2xl bg-app-card border border-hairline hover:border-purple-500/40 text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Camera className="w-4 h-4 text-purple-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-app-heading">Gallery</div>
              <div className="text-[11px] text-app-muted truncate">
                {(currentUser.gallery || []).length} photos
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-app-muted shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => setProfileSection('security')}
          className="flex items-center justify-between gap-2 p-3.5 rounded-2xl bg-app-card border border-hairline hover:border-rose-500/40 text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <KeyRound className="w-4 h-4 text-rose-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-app-heading">Security</div>
              <div className="text-[11px] text-app-muted truncate">Password & account</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-app-muted shrink-0" />
        </button>
      </div>
      </div>
      )}

      {/* 3. TAB CONTENT 2: LOCATION & GEOLOCATION (CORE USER REQUIREMENT) */}
      {profileSection === 'location' && (
        <div className="space-y-6">
          
          {/* Header Description */}
          <div className="p-5 bg-app-card border border-hairline rounded-2xl space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-pink-500/20 border border-pink-500/40 flex items-center justify-center text-pink-400">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-app-heading font-mono uppercase tracking-wider">
                    Geolocation & Mock Location Studio
                  </h2>
                  <p className="text-xs text-app-muted">
                    Manage your exact physical GPS telemetry and virtual broadcast coordinates.
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono text-app-muted">Current Broadcast:</span>
                <span className="px-3 py-1 rounded-xl bg-app-input border border-hairline text-app-heading font-bold text-xs flex items-center space-x-1.5 shadow-sm">
                  <span>{effectiveLocation.displayCity}</span>
                  <span>{effectiveLocation.flag}</span>
                  {effectiveLocation.isMock && (
                    <span className="px-1 py-0.2 rounded bg-pink-600 text-white text-[8px] font-mono">
                      MOCK
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* SECTION A: EXACT DEVICE GPS TELEMETRY (For All Users) */}
            <div className="p-5 sm:p-6 bg-app-card border border-hairline rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Navigation className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-bold text-app-heading font-mono uppercase tracking-wider">
                    Real Device GPS Coordinates
                  </h3>
                </div>
                {currentUser.exactLocation && (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono font-bold">
                    GPS LOCKED
                  </span>
                )}
              </div>

              <p className="text-xs text-app-muted leading-relaxed">
                Connects with your device's browser Geolocation API to fetch physical latitude, longitude, and country ISO data with satellite precision.
              </p>

              {/* Exact Location Card Display */}
              {currentUser.exactLocation ? (
                <div className="p-4 rounded-xl bg-app-input border border-hairline space-y-3 font-mono text-xs">
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-app-muted block">Latitude:</span>
                      <span className="text-app-heading font-bold">{(currentUser.exactLocation.latitude ?? 0).toFixed(5)}° N</span>
                    </div>
                    <div>
                      <span className="text-app-muted block">Longitude:</span>
                      <span className="text-app-heading font-bold">{(currentUser.exactLocation.longitude ?? 0).toFixed(5)}° E</span>
                    </div>
                    <div>
                      <span className="text-app-muted block">Detected City:</span>
                      <span className="text-emerald-400 font-bold">{currentUser.exactLocation.city}, {currentUser.exactLocation.country}</span>
                    </div>
                    <div>
                      <span className="text-app-muted block">Accuracy Radius:</span>
                      <span className="text-indigo-400 font-bold">±{currentUser.exactLocation.accuracyMeters || 15} meters</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-hairline text-[10px] text-app-muted flex items-center justify-between">
                    <span>Detected: {currentUser.exactLocation.detectedAt || 'Just now'}</span>
                    <span className="text-emerald-400 flex items-center space-x-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Verified Signal</span>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-app-input border border-dashed border-hairline text-center space-y-2 py-6">
                  <Compass className="w-8 h-8 text-app-muted mx-auto" />
                  <p className="text-xs text-app-muted">No exact GPS coordinates stored yet.</p>
                  <p className="text-[11px] text-app-muted">
                    Click the button below to allow your browser to detect your current city and location.
                  </p>
                </div>
              )}

              {gpsError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{gpsError}</span>
                </div>
              )}

              {/* Action Button */}
              <button
                onClick={handleDetectExactLocation}
                disabled={isDetectingGps}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-mono font-bold text-xs transition-all shadow-md flex items-center justify-center space-x-2 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isDetectingGps ? 'animate-spin' : ''}`} />
                <span>{isDetectingGps ? 'Acquiring GPS Fix...' : 'Acquire Exact Real GPS Location'}</span>
              </button>
            </div>

            {/* SECTION B: FEMALE HOST MOCK LOCATION (Special Feature) */}
            <div className="p-5 sm:p-6 bg-app-card border border-hairline rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-pink-400" />
                  <h3 className="text-xs font-bold text-app-heading font-mono uppercase tracking-wider">
                    Female Host Mock Location Spoof
                  </h3>
                </div>
                {isFemale && (
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                      currentUser.allowMockLocation
                        ? 'bg-pink-500/20 border-pink-500/40 text-pink-300'
                        : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                    }`}
                  >
                    {currentUser.allowMockLocation ? 'ADMIN ALLOWED' : 'ADMIN PERMISSION REQUIRED'}
                  </span>
                )}
              </div>

              {isFemale ? (
                currentUser.allowMockLocation ? (
                  <div className="space-y-4">
                    <p className="text-xs text-app-muted leading-relaxed">
                      As an authorized female host, you can choose a virtual location (e.g. Miami, Paris, Tokyo) to protect your real physical privacy and match with callers from specific countries.
                    </p>

                    {/* Mock Location Master Switch */}
                    <div className="p-4 rounded-xl bg-app-input border border-pink-500/30 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-app-heading text-xs flex items-center space-x-2">
                          <span>Enable Virtual Mock Location</span>
                          {currentUser.isUsingMockLocation && (
                            <span className="px-1.5 py-0.2 rounded bg-pink-600 text-white font-mono text-[9px]">
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-app-muted mt-0.5">
                          {currentUser.isUsingMockLocation
                            ? `Broadcasting: ${currentUser.mockLocationCity || 'Miami'}, ${currentUser.mockLocationCountry || 'United States'}`
                            : 'Currently using your real profile location.'}
                        </p>
                      </div>

                      <button
                        onClick={() => handleToggleMockLocation(!currentUser.isUsingMockLocation)}
                        className={`px-3 py-1.5 rounded-xl font-mono font-bold text-xs transition-all cursor-pointer ${
                          currentUser.isUsingMockLocation
                            ? 'bg-pink-600 text-white border border-pink-500 shadow-md shadow-pink-600/30'
                            : 'bg-app-input text-app-muted border border-hairline hover:text-app-heading'
                        }`}
                      >
                        {currentUser.isUsingMockLocation ? '✓ Mock ON' : '○ Mock OFF'}
                      </button>
                    </div>

                    {/* Popular City Preset Grid */}
                    <div className="space-y-2">
                      <label className="block text-[11px] font-bold text-app-muted font-mono uppercase flex items-center space-x-1.5">
                        <span>Quick Mock Location Presets</span>
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {POPULAR_MOCK_LOCATIONS.map((preset) => {
                          const isSelected =
                            currentUser.isUsingMockLocation &&
                            currentUser.mockLocationCity === preset.city;
                          return (
                            <button
                              key={preset.id}
                              onClick={() => handleSelectMockPreset(preset)}
                              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                                isSelected
                                  ? 'bg-pink-500/20 border-pink-500 text-app-heading ring-1 ring-pink-500/40 shadow-sm'
                                  : 'bg-app-input border-hairline text-app-muted hover:border-hairline hover:bg-app-input'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm">{preset.flag}</span>
                                <span className="text-[9px] font-mono text-app-muted uppercase">
                                  {preset.countryCode}
                                </span>
                              </div>
                              <div className="mt-1">
                                <div className="font-bold text-xs truncate">{preset.city}</div>
                                <div className="text-[10px] text-app-muted truncate">{preset.country}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Custom Mock City Input */}
                    <div className="pt-3 border-t border-hairline space-y-2">
                      <label className="block text-[11px] font-bold text-app-muted font-mono uppercase">
                        Or Enter Custom Virtual Location
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={currentUser.mockLocationCity || ''}
                          onChange={(e) =>
                            updateUserProfile(currentUser.id, {
                              mockLocationCity: e.target.value,
                              isUsingMockLocation: true,
                            })
                          }
                          placeholder="City name (e.g. Rome)"
                          className="px-3 py-2 bg-app-input border border-hairline rounded-xl text-app-heading font-mono text-xs focus:outline-none focus:border-pink-500"
                        />
                        <input
                          type="text"
                          value={currentUser.mockLocationCountry || ''}
                          onChange={(e) =>
                            updateUserProfile(currentUser.id, {
                              mockLocationCountry: e.target.value,
                              isUsingMockLocation: true,
                            })
                          }
                          placeholder="Country (e.g. Italy)"
                          className="px-3 py-2 bg-app-input border border-hairline rounded-xl text-app-heading font-mono text-xs focus:outline-none focus:border-pink-500"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-5 rounded-2xl bg-app-input border border-hairline text-center space-y-3 py-8">
                    <Lock className="w-8 h-8 text-amber-400 mx-auto" />
                    <h4 className="font-bold text-app-heading text-xs">Mock Location Permission Locked</h4>
                    <p className="text-[11px] text-app-muted max-w-sm mx-auto leading-relaxed">
                      To activate the virtual location spoofer, the platform admin must toggle <strong className="text-app-heading font-mono">"Allow Mock Location"</strong> on your creator account in the Admin Terminal.
                    </p>
                    <div className="inline-block px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-mono font-bold">
                      Status: Waiting for Admin Enablement
                    </div>
                  </div>
                )
              ) : (
                <div className="p-5 rounded-2xl bg-app-input border border-hairline text-center space-y-3 py-8">
                  <ShieldCheck className="w-8 h-8 text-indigo-400 mx-auto" />
                  <h4 className="font-bold text-app-heading text-xs">Caller Real Location Policy</h4>
                  <p className="text-[11px] text-app-muted max-w-sm mx-auto leading-relaxed">
                    Mock locations are exclusively reserved for verified female creators to protect creator privacy. Male callers broadcast their genuine device location.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. TAB CONTENT 3: EDIT BIO & PROFILE INFORMATION */}
      {profileSection === 'edit_bio' && (
        <form onSubmit={handleSaveProfile} className="p-4 sm:p-6 bg-app-card border border-hairline rounded-2xl space-y-5 pb-24 md:pb-6 relative">
          <div className="border-b border-hairline pb-4">
            <h2 className="text-sm font-bold text-app-heading font-mono uppercase tracking-wider">
              Edit Bio & Profile Information
            </h2>
            <p className="text-xs text-app-muted mt-0.5">
              Update your public introduction, languages, and personal details.
            </p>
          </div>

          {/* Compact avatar preview — change opens modal */}
          <div className="flex items-center gap-3 p-3 bg-app-input border border-hairline rounded-2xl">
            <button
              type="button"
              onClick={() => setIsAvatarModalOpen(true)}
              className="relative shrink-0 group cursor-pointer"
              title="Change profile picture"
            >
              <img
                src={formData.avatarUrl || currentUser.avatarUrl}
                alt="Avatar preview"
                className="w-14 h-14 rounded-xl object-cover ring-2 ring-indigo-500/50 shadow-md"
              />
              <span className="absolute inset-0 rounded-xl flex items-center justify-center bg-black/50 text-white opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                <Camera className="w-3.5 h-3.5" />
              </span>
            </button>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-app-heading">Profile picture</div>
              <p className="text-[11px] text-app-muted">Tap photo to upload or choose a preset</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center space-x-1.5">
              <span className="text-[11px] font-bold text-app-muted font-mono uppercase">Demographics & Taxonomies</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-app-muted font-mono mb-1">
                  Display Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => {
                    isDirtyRef.current = true;
                    setFormData({ ...formData, name: e.target.value });
                  }}
                  className="w-full px-3 py-2 bg-app-input border border-hairline rounded-xl text-app-heading font-semibold text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-app-muted font-mono mb-1">
                  Account Email (Registered)
                </label>
                <div className="relative">
                  <input
                    type="email"
                    disabled
                    value={currentUser.email || `${currentUser.id.slice(0, 8)}@livecall.app`}
                    className="w-full px-3 py-2 bg-app-input border border-hairline rounded-xl text-app-muted font-mono text-xs cursor-not-allowed pr-16"
                  />
                  <button
                    type="button"
                    onClick={handleCopyEmail}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded bg-app-input hover:bg-brand-soft text-[10px] font-mono font-bold text-app-muted"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div>
                <CountrySelector
                  value={formData.countryCode || formData.nationality}
                  onChange={(c) => {
                    isDirtyRef.current = true;
                    const newNationality = c.name;
                    const newCountryCode = c.code.toUpperCase();
                    setFormData((prev) => ({
                      ...prev,
                      nationality: newNationality,
                      countryCode: newCountryCode,
                      locationCity: prev.locationCity === prev.nationality || !prev.locationCity ? newNationality : prev.locationCity,
                    }));
                  }}
                  label="Country / Nationality (Real SVG Flag)"
                />
              </div>

              <div>
                <ZodiacSelector
                  value={formData.zodiac}
                  onChange={(z) => {
                    isDirtyRef.current = true;
                    setFormData((prev) => ({
                      ...prev,
                      zodiac: z ? z.name : '',
                    }));
                  }}
                  label="Zodiac Sign (Real Vector Glyph)"
                />
              </div>
            </div>
          </div>

          {/* Spoken Languages Multi-Select */}
          <div>
            <LanguageSelector
              selectedLanguages={formData.spokenLanguages}
              onChange={(langs) => {
                isDirtyRef.current = true;
                setFormData((prev) => ({
                  ...prev,
                  spokenLanguages: langs,
                }));
              }}
              label="Spoken Languages (Click & Add Multiple)"
            />
          </div>

          {/* Categorized Interests Multi-Select */}
          <div>
            <InterestSelector
              selectedInterests={formData.interests}
              onChange={(ints) => {
                isDirtyRef.current = true;
                setFormData((prev) => ({
                  ...prev,
                  interests: ints,
                }));
              }}
              label="Interests & Passions (Categorized Multi-Select)"
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center space-x-1.5">
              <span className="text-[11px] font-bold text-app-muted font-mono uppercase">Story & Tagline</span>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-app-muted font-mono mb-1">
                Catchy Tagline / Short Bio
              </label>
              <input
                type="text"
                value={formData.bio}
                onChange={(e) => {
                  isDirtyRef.current = true;
                  setFormData({ ...formData, bio: e.target.value });
                }}
                className="w-full px-3 py-2 bg-app-input border border-hairline rounded-xl text-app-heading text-xs focus:outline-none focus:border-indigo-500"
                placeholder="A short sentence summarizing your vibe..."
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-app-muted font-mono mb-1">
                Extended About Me Story
              </label>
              <textarea
                rows={4}
                value={formData.extendedBio}
                onChange={(e) => {
                  isDirtyRef.current = true;
                  setFormData({ ...formData, extendedBio: e.target.value });
                }}
                className="w-full px-3 py-2 bg-app-input border border-hairline rounded-xl text-app-heading text-xs focus:outline-none focus:border-indigo-500 resize-none"
                placeholder="Tell callers about your background, hobbies, stream schedule, languages, and what you enjoy discussing..."
              />
            </div>
          </div>

          {/* Connection / Gender Preference */}
          <div>
            <label className="block text-[11px] font-bold text-app-muted font-mono mb-2 uppercase flex items-center space-x-1.5">
              <span>Interested in Connecting With (Dating & Match Preferences)</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {[
                { id: 'female', label: 'Women', sub: 'Creators & Users', icon: '👩' },
                { id: 'male', label: 'Men', sub: 'Male Users', icon: '👨' },
                { id: 'everyone', label: 'Everyone', sub: 'All Members', icon: '👥' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    isDirtyRef.current = true;
                    setFormData({ ...formData, interestedIn: opt.id });
                  }}
                  className={`p-3 rounded-xl border text-xs font-bold text-left transition-all cursor-pointer ${
                    formData.interestedIn === opt.id
                      ? 'bg-indigo-600/25 border-indigo-500 text-app-heading shadow-md shadow-indigo-500/20'
                      : 'bg-app-input border-hairline text-app-muted hover:border-hairline'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-base">{opt.icon}</span>
                      <div>
                        <div className="text-app-heading font-bold">{opt.label}</div>
                        <div className="text-[10px] text-app-muted font-normal">{opt.sub}</div>
                      </div>
                    </div>
                    {formData.interestedIn === opt.id && <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {isFemale && canEarnCoins && (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-pink-300 font-mono mb-1">
                  Response Rate Label
                </label>
                <input
                  type="text"
                  value={formData.responseRate}
                  onChange={(e) => {
                    isDirtyRef.current = true;
                    setFormData({ ...formData, responseRate: e.target.value });
                  }}
                  className="w-full px-3 py-2 bg-app-input border border-hairline rounded-xl text-app-heading font-mono text-xs focus:outline-none focus:border-pink-500"
                  placeholder="e.g. 99% Instant Reply"
                />
              </div>
              {onNavigateToTab && (
                <button
                  type="button"
                  onClick={() => onNavigateToTab('earnings')}
                  className="w-full flex items-center justify-between gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-left cursor-pointer hover:bg-emerald-500/15 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <DollarSign className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-xs font-bold text-emerald-200 truncate">
                      View rates & earnings
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-emerald-400/80 shrink-0" />
                </button>
              )}
            </div>
          )}

          {/* Sticky save on mobile; inline on desktop */}
          <div className="fixed bottom-[4.5rem] left-0 right-0 z-20 px-3 md:static md:px-0 md:pt-2 md:flex md:justify-end">
            <div className="max-w-7xl mx-auto md:max-w-none md:mx-0">
              <button
                type="submit"
                disabled={isSavingProfile}
                className="w-full md:w-auto px-6 py-3 md:py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-pink-600 hover:brightness-110 text-white font-mono font-bold text-xs transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                <span>{isSavingProfile ? 'Saving...' : 'Save & Publish Profile'}</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* 5. TAB CONTENT 4: RATES, WALLET & EARNINGS */}
      {profileSection === 'rates_earnings' && (
        <div className="space-y-6">
          {isFemale ? (
            /* Female Creator Studio & Payouts Card */
            <div className="p-5 sm:p-7 bg-app-card border border-hairline rounded-2xl space-y-6">
              <div className="flex items-center justify-between border-b border-hairline pb-4">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-app-heading font-mono uppercase tracking-wider">
                      Female Creator Earnings & Payouts Studio
                    </h2>
                    <p className="text-xs text-app-muted">
                      Real-time coin conversion, hosted call logs, and payout requests.
                    </p>
                  </div>
                </div>

                {onNavigateToTab && (
                  <button
                    onClick={() => onNavigateToTab('earnings')}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-xs transition-all shadow-md flex items-center space-x-1"
                  >
                    <span>Full Dashboard ➔</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 bg-app-input border border-hairline rounded-xl space-y-1">
                  <div className="text-[10px] text-app-muted font-mono uppercase">Unclaimed Coins</div>
                  <div className="text-2xl font-black text-amber-400 font-mono flex items-center space-x-1">
                    <span>🪙</span>
                    <span>{currentUser.earningsCoins || 8400}</span>
                  </div>
                  <div className="text-[11px] text-app-muted">
                    Value: ~${coinsToUsd(currentUser.earningsCoins || 8400, getCoinUsdPeg(systemSettings)).toFixed(2)} USD
                  </div>
                </div>

                <div className="p-4 bg-app-input border border-hairline rounded-xl space-y-1">
                  <div className="text-[10px] text-app-muted font-mono uppercase">Lifetime USD Earned</div>
                  <div className="text-2xl font-black text-emerald-400 font-mono">
                    ${(currentUser.totalLifetimeEarnedUSD || 672.00).toFixed(2)}
                  </div>
                  <div className="text-[11px] text-emerald-400 flex items-center space-x-1">
                    <TrendingUp className="w-3 h-3" />
                    <span>Fixed Peg: ${getCoinUsdPeg(systemSettings)} / coin</span>
                  </div>
                </div>

                <div className="p-4 bg-app-input border border-hairline rounded-xl space-y-1">
                  <div className="text-[10px] text-app-muted font-mono uppercase">Call Host Rate</div>
                  <div className="text-2xl font-black text-pink-400 font-mono">
                    {systemSettings.coinBurnRatePerMin || 120} 🪙/min
                  </div>
                  <div className="text-[11px] text-app-muted">Shares from Economy config (call + gift %)</div>
                </div>
              </div>
            </div>
          ) : (
            /* Male User Wallet */
            <div className="p-5 sm:p-7 bg-app-card border border-hairline rounded-2xl space-y-6">
              <div className="flex items-center justify-between border-b border-hairline pb-4">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                    <Coins className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-app-heading font-mono uppercase tracking-wider">
                      Coin Wallet
                    </h2>
                    <p className="text-xs text-app-muted">
                      Manage your call balance and top-ups.
                    </p>
                  </div>
                </div>

                {onOpenStore && (
                  <button
                    onClick={onOpenStore}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-all shadow-md"
                  >
                    + Top Up Coins
                  </button>
                )}
              </div>

              <div className="p-5 bg-app-input border border-amber-500/30 rounded-2xl space-y-3 max-w-lg">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-app-muted font-mono uppercase">Available Coins</span>
                  <span className="text-xs font-mono text-amber-400 font-bold">
                    Friend rates apply when matched as friends
                  </span>
                </div>
                <div className="text-3xl font-black text-amber-300 font-mono flex items-center space-x-2">
                  <span>🪙</span>
                  <span>{currentUser.coinBalance}</span>
                </div>
                <p className="text-xs text-app-muted">
                  Coins are spent per minute on 1-on-1 private video calls and for sending virtual gifts.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 6. TAB CONTENT 5: GALLERY & MOMENTS (Photos / Videos / Moments) */}
      {profileSection === 'media' && (
        <div className="p-4 sm:p-6 bg-app-card border border-hairline rounded-2xl space-y-4">
          <input
            ref={videoFileInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/x-m4v,.mp4,.webm,.mov,.m4v"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) handleUploadGalleryVideos(e.target.files);
            }}
          />

          <div className="border-b border-hairline pb-3 space-y-3">
            <div>
              <h2 className="text-sm font-bold text-app-heading font-mono uppercase tracking-wider flex items-center gap-2">
                <Camera className="w-4 h-4 text-pink-400" />
                <span>Gallery & Moments</span>
              </h2>
              <p className="text-xs text-app-muted mt-0.5">
                Photos, profile videos, and feed moments — square tiles, same layout.
              </p>
            </div>

            <div className="flex rounded-xl border border-hairline bg-app-input p-0.5 gap-0.5">
              {(
                [
                  { id: 'photos' as const, label: 'Photos', icon: ImageIcon },
                  { id: 'videos' as const, label: 'Videos', icon: Film },
                  { id: 'moments' as const, label: 'Moments', icon: Sparkles },
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                const active = mediaSubTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMediaSubTab(tab.id)}
                    className={`flex-1 min-h-9 px-2 py-1.5 rounded-lg text-[11px] font-mono font-bold uppercase tracking-wide flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      active
                        ? 'bg-app-card text-app-heading shadow-sm border border-hairline'
                        : 'text-app-muted hover:text-app-heading border border-transparent'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${active ? (tab.id === 'videos' ? 'text-cyan-400' : 'text-pink-400') : ''}`} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Photos */}
          {mediaSubTab === 'photos' && (
            <div className="space-y-3">
              <p className="text-xs text-app-muted">Photos sync to your public profile via Cloudflare R2.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddGalleryModalOpen(true)}
                  className="aspect-square rounded-2xl border-2 border-dashed border-hairline hover:border-pink-500/60 bg-app-input flex flex-col items-center justify-center text-center p-3 transition-all cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-xl bg-pink-500/10 group-hover:bg-pink-500/20 text-pink-400 flex items-center justify-center mb-1.5 transition-colors">
                    <Plus className="w-5 h-5" />
                  </div>
                  <span className="font-bold text-app-heading text-xs">Add photo</span>
                </button>

                {(() => {
                  const rawGallery = Array.isArray(currentUser.gallery) ? currentUser.gallery : [];
                  const displayGallery = rawGallery.filter((url) => {
                    const u = String(url || '').trim();
                    if (!u || u.startsWith('__mc_gv1__:') || u.startsWith('blob:') || u.startsWith('data:')) {
                      return false;
                    }
                    return (
                      u.startsWith('http://') ||
                      u.startsWith('https://') ||
                      u.startsWith('/api/storage/media')
                    );
                  });
                  const tiles = displayGallery.length > 0 ? displayGallery : [currentUser.avatarUrl];
                  return tiles.map((img, idx) => (
                  <div
                    key={`photo-${extractStorageKeyFromMediaUrl(img) || img || idx}`}
                    className="relative aspect-square rounded-2xl overflow-hidden border border-hairline group shadow-md bg-app-input"
                  >
                    <img
                      src={resolveGalleryPhotoSrc(img)}
                      alt="gallery"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      onError={(e) => {
                        const el = e.currentTarget;
                        const key = extractStorageKeyFromMediaUrl(img);
                        const blob = (key && photoBlobPreviews[key]) || photoBlobPreviews[img];
                        if (blob && el.src !== blob) {
                          el.src = blob;
                          return;
                        }
                        el.style.opacity = '0.35';
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex items-end justify-between p-2.5">
                      <span className="text-[10px] text-app-heading font-mono font-bold">
                        Photo #{idx + 1}
                      </span>
                      {displayGallery.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const realIndex = rawGallery.indexOf(img);
                            handleRemoveGalleryPhoto(realIndex >= 0 ? realIndex : idx);
                          }}
                          className="p-1 rounded-lg bg-rose-600/80 hover:bg-rose-500 text-white transition-colors cursor-pointer"
                          title="Remove from gallery"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  ));
                })()}
              </div>
            </div>
          )}

          {/* Videos */}
          {mediaSubTab === 'videos' && (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs text-app-muted">
                  Shared quota: {profileVideoQuotaMb} MB total per account.
                </p>
                <span className="shrink-0 text-[10px] font-mono font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 px-2 py-1 rounded-lg">
                  {formatMb(usedVideoBytes)} / {profileVideoQuotaMb} MB
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-app-input overflow-hidden border border-hairline">
                <div
                  className={`h-full rounded-full transition-all ${
                    usedVideoBytes / quotaBytes > 0.9 ? 'bg-rose-500' : 'bg-cyan-500'
                  }`}
                  style={{
                    width: `${Math.min(100, (usedVideoBytes / Math.max(quotaBytes, 1)) * 100)}%`,
                  }}
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                <button
                  type="button"
                  disabled={isUploadingVideo || remainingVideoBytes <= 0}
                  onClick={() => videoFileInputRef.current?.click()}
                  className="aspect-square rounded-2xl border-2 border-dashed border-hairline hover:border-cyan-500/60 bg-app-input flex flex-col items-center justify-center text-center p-3 transition-all cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 group-hover:bg-cyan-500/20 text-cyan-400 flex items-center justify-center mb-1.5 transition-colors">
                    {isUploadingVideo ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <Plus className="w-5 h-5" />
                    )}
                  </div>
                  <span className="font-bold text-app-heading text-xs">
                    {isUploadingVideo ? `Uploading… ${videoUploadProgress}%` : 'Add video'}
                  </span>
                  <span className="text-[10px] text-app-muted font-mono mt-1 px-1 leading-tight">
                    {remainingVideoBytes > 0
                      ? `${formatMb(remainingVideoBytes)} MB left`
                      : 'Quota full'}
                  </span>
                </button>

                {galleryVideos.map((vid, idx) => (
                  <div
                    key={`vid-${vid.storageKey || vid.url}-${idx}`}
                    className="relative aspect-square rounded-2xl overflow-hidden border border-hairline group shadow-md bg-black"
                  >
                    <video
                      src={resolveGalleryVideoSrc(vid)}
                      controls
                      playsInline
                      preload="metadata"
                      className="absolute inset-0 w-full h-full object-cover bg-black"
                      onError={(e) => {
                        const el = e.currentTarget;
                        const key = String(vid.storageKey || '').trim();
                        const blob =
                          (key && videoBlobPreviews[key]) ||
                          (vid.url && videoBlobPreviews[vid.url]) ||
                          '';
                        if (blob && el.src !== blob) {
                          el.src = blob;
                        }
                      }}
                    />
                    <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/40 to-transparent opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex items-end justify-between p-2.5 pointer-events-none">
                      <span className="text-[10px] text-white font-mono font-bold truncate pr-2">
                        Video #{idx + 1} · {formatMb(vid.sizeBytes || 0)} MB
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveGalleryVideo(idx)}
                        className="p-1 rounded-lg bg-rose-600/80 hover:bg-rose-500 text-white transition-colors cursor-pointer pointer-events-auto shrink-0"
                        title="Remove video"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Moments */}
          {mediaSubTab === 'moments' && (
            <div className="space-y-3">
              <p className="text-xs text-app-muted">
                Share photos to the public Moments feed. Stored on R2 and published via the Moments API.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddMomentModalOpen(true)}
                  className="aspect-square rounded-2xl border-2 border-dashed border-hairline hover:border-pink-500/60 bg-app-input flex flex-col items-center justify-center text-center p-3 transition-all cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-xl bg-pink-500/10 group-hover:bg-pink-500/20 text-pink-400 flex items-center justify-center mb-1.5 transition-colors">
                    <Plus className="w-5 h-5" />
                  </div>
                  <span className="font-bold text-app-heading text-xs">Add moment</span>
                </button>

                {momentsLoading && myMoments.length === 0 ? (
                  <div className="aspect-square rounded-2xl border border-hairline bg-app-input flex items-center justify-center">
                    <RefreshCw className="w-5 h-5 text-app-muted animate-spin" />
                  </div>
                ) : (
                  myMoments.map((post) => (
                    <div
                      key={post.id}
                      className="relative aspect-square rounded-2xl overflow-hidden border border-hairline group shadow-md bg-app-input"
                    >
                      <img
                        src={normalizeMediaUrl(post.mediaUrl)}
                        alt={post.caption || 'Moment'}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex items-end justify-between gap-2 p-2.5">
                        <div className="min-w-0">
                          <p className="text-[10px] text-white font-mono font-bold truncate">
                            {post.caption || 'Moment'}
                          </p>
                          <p className="text-[9px] text-white/70 font-mono">
                            {post.likes || 0} likes
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleRemoveMoment(post.id)}
                          className="p-1 rounded-lg bg-rose-600/80 hover:bg-rose-500 text-white transition-colors cursor-pointer shrink-0"
                          title="Delete moment"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {/* 6. TAB CONTENT 5: SECURITY & PASSWORD MANAGEMENT */}
      {profileSection === 'security' && (
        <div id="profile-security-section" className="space-y-6">
          {/* Main Password Change Card */}
          <div className="p-5 sm:p-7 bg-app-card border border-hairline rounded-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-hairline pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-app-heading font-mono uppercase tracking-wider">
                    Change Account Password
                  </h2>
                  <p className="text-xs text-app-muted">
                    Update your security credentials for profile protection and seamless login.
                  </p>
                </div>
              </div>

              <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase ${
                currentUser.hasPasswordSet
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                  : 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
              }`}>
                {currentUser.hasPasswordSet ? '🔒 Password Active' : '⚠️ Password Not Set'}
              </span>
            </div>

            <form onSubmit={handleChangePasswordSubmit} className="space-y-4 max-w-xl">
              {currentUser.hasPasswordSet && (
                <div>
                  <label className="block text-[11px] font-bold text-app-muted font-mono mb-1">
                    Current Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      required
                      value={currentPasswordInput}
                      onChange={(e) => setCurrentPasswordInput(e.target.value)}
                      placeholder="Enter your current password"
                      className="w-full px-3 py-2.5 bg-app-input border border-hairline rounded-xl text-app-heading font-mono text-xs focus:outline-none focus:border-rose-500 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-app-muted hover:text-app-heading"
                    >
                      {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              <PasswordStrengthField
                id="profile-new-password"
                label="New Password"
                value={newPasswordInput}
                onChange={setNewPasswordInput}
                placeholder="Create a strong password"
                autoComplete="new-password"
                inputClassName="w-full px-3 py-2.5 bg-app-input border border-hairline rounded-xl text-app-heading font-mono text-xs focus:outline-none focus:border-rose-500 pl-10 pr-10"
              />

              <PasswordStrengthField
                id="profile-confirm-password"
                label="Confirm New Password"
                value={confirmPasswordInput}
                onChange={setConfirmPasswordInput}
                placeholder="Re-type new password"
                autoComplete="new-password"
                showStrengthUi={false}
                matchAgainst={newPasswordInput}
                showMatchStatus
                inputClassName="w-full px-3 py-2.5 bg-app-input border border-hairline rounded-xl text-app-heading font-mono text-xs focus:outline-none focus:border-rose-500 pl-10 pr-10"
              />

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={
                    passwordSubmitting ||
                    !isPasswordPolicyValid(newPasswordInput) ||
                    newPasswordInput !== confirmPasswordInput
                  }
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-mono font-bold text-xs transition-all shadow-lg flex items-center space-x-2 cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{passwordSubmitting ? 'Updating Password...' : 'Save New Password'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Account Security Overview Matrix */}
          <div className="space-y-1.5">
            <div className="flex items-center space-x-1.5 px-1">
              <span className="text-[11px] font-bold text-app-muted font-mono uppercase">Security Standards Matrix</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="p-4 bg-app-card border border-hairline rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-app-muted font-mono">Gender Lock</span>
                  <Lock className="w-4 h-4 text-pink-400" />
                </div>
                <div className="text-sm font-bold text-app-heading capitalize">{currentUser.gender} Profile</div>
                <p className="text-[11px] text-app-muted leading-relaxed">
                  Gender identity is permanently locked to protect video match integrity and creator payouts.
                </p>
              </div>

              <div className="p-4 bg-app-card border border-hairline rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-app-muted font-mono">End-to-End Encryption</span>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-sm font-bold text-emerald-400">WebRTC DTLS / SRTP</div>
                <p className="text-[11px] text-app-muted leading-relaxed">
                  All 1-on-1 video streams, live audio, and direct chat messages are securely peer-encrypted.
                </p>
              </div>

              <div className="p-4 bg-app-card border border-hairline rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-app-muted font-mono">Account ID & Token</span>
                  <User className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="text-xs font-mono font-bold text-app-heading truncate">{currentUser.id}</div>
                <p className="text-[11px] text-app-muted leading-relaxed">
                  Unique persistent account identifier synced with Cloud / Supabase database.
                </p>
              </div>
            </div>
          </div>

          {!isAdmin && (
            <div className="p-5 sm:p-7 bg-app-card border border-rose-900/60 rounded-2xl space-y-4">
              <div className="flex items-start space-x-3 border-b border-rose-900/40 pb-4">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-rose-200 font-mono uppercase tracking-wider">
                    Delete Account
                  </h2>
                  <p className="text-xs text-app-muted mt-1 leading-relaxed">
                    Permanently removes your profile, login, and associated data. This cannot be undone.
                    You will not be able to sign in with this email afterward.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSelfDeleteAccount} className="space-y-3 max-w-xl">
                <div>
                  <label className="block text-[11px] font-bold text-app-muted font-mono mb-1">
                    Type DELETE or your email to confirm
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmPhrase}
                    onChange={(e) => setDeleteConfirmPhrase(e.target.value)}
                    placeholder="DELETE"
                    autoComplete="off"
                    className="w-full px-3 py-2.5 bg-app-input border border-rose-900/50 rounded-xl text-app-heading font-mono text-xs focus:outline-none focus:border-rose-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-app-muted font-mono mb-1">
                    Current password
                  </label>
                  <div className="relative">
                    <input
                      type={showDeletePassword ? 'text' : 'password'}
                      value={deletePasswordInput}
                      onChange={(e) => setDeletePasswordInput(e.target.value)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      className="w-full px-3 py-2.5 bg-app-input border border-rose-900/50 rounded-xl text-app-heading font-mono text-xs focus:outline-none focus:border-rose-500 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowDeletePassword(!showDeletePassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-app-muted hover:text-app-heading"
                    >
                      {showDeletePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={deleteSubmitting || !deleteConfirmPhrase.trim() || !deletePasswordInput.trim()}
                  className="px-6 py-2.5 rounded-xl bg-rose-700 hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-mono font-bold text-xs transition-all flex items-center space-x-2 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{deleteSubmitting ? 'Deleting Account...' : 'Permanently Delete My Account'}</span>
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* 7. AVATAR & CLOUDFLARE R2 UPLOAD MODAL DIALOG */}
      {isAvatarModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div
            className="bg-app-card border border-hairline rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 relative max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-hairline pb-4">
              <div className="flex items-center space-x-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-app-heading font-mono flex items-center space-x-2">
                    <span>Update Profile Picture</span>
                  </h3>
                  <div className="flex items-center space-x-1.5 text-[11px] text-app-muted">
                    <Cloud className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Cloudflare R2 Bucket Storage Sync</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAvatarModalOpen(false)}
                className="p-2 rounded-xl bg-app-input hover:bg-brand-soft text-app-muted hover:text-app-heading transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Current Avatar Preview */}
            <div className="flex items-center space-x-4 p-3.5 bg-app-input border border-hairline rounded-2xl">
              <img
                src={normalizeMediaUrl(currentUser.avatarUrl)}
                alt={currentUser.name}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = getFallbackAvatar(currentUser.name, currentUser.gender, currentUser.role);
                }}
                className="w-14 h-14 rounded-2xl object-cover ring-2 ring-indigo-500/50 shadow-md shrink-0 bg-app-input"
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-app-heading truncate">{currentUser.name}</div>
                <div className="text-[11px] text-app-muted font-mono truncate">{currentUser.email || `${currentUser.id.slice(0, 8)}@livecall.app`}</div>
                <div className="text-[10px] text-emerald-400 font-mono flex items-center space-x-1 mt-0.5">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Current Active Photo</span>
                </div>
              </div>
            </div>

            {/* Interactive Unified Avatar Uploader & Cloudflare R2 Upload */}
            <UnifiedImageUploader
              currentImageUrl={formData.avatarUrl || currentUser.avatarUrl}
              onImageUploaded={(newUrl) => {
                if (!isPersistableMediaUrl(newUrl)) {
                  showToast(
                    'Upload Failed',
                    'Photo preview was shown locally, but the file was not saved to Cloudflare R2.',
                    'error'
                  );
                  return;
                }
                updateUserProfile(currentUser.id, { avatarUrl: newUrl });
                setFormData((prev) => ({ ...prev, avatarUrl: newUrl }));
                showToast('Profile Picture Updated', 'New photo uploaded to Cloudflare R2 and saved to your profile.', 'success');
              }}
              userId={currentUser.id}
              category="avatar"
              aspectRatio="1:1"
              targetRole={currentUser.role}
              targetName={currentUser.name}
              accentColor={currentUser.role === 'team_leader' ? 'amber' : currentUser.gender === 'female' ? 'pink' : 'indigo'}
              title="Profile Picture (Avatar)"
              subtitle="Drag & drop your photo or browse files (Cloudflare R2 Direct Upload)"
              showPresets={true}
              showUrlInput={true}
            />

            {/* Footer Close */}
            <div className="pt-3 border-t border-hairline flex justify-end">
              <button
                type="button"
                onClick={() => setIsAvatarModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-app-input hover:bg-brand-soft text-app-muted text-xs font-mono font-bold cursor-pointer transition-colors"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. GALLERY PHOTO UPLOAD MODAL DIALOG */}
      {isAddGalleryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div
            className="bg-app-card border border-hairline rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 relative max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-hairline pb-4">
              <div className="flex items-center space-x-2.5">
                <div className="w-10 h-10 rounded-2xl bg-pink-500/20 border border-pink-500/40 flex items-center justify-center text-pink-400">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-app-heading font-mono">Add Photo to Gallery</h3>
                  <p className="text-[11px] text-app-muted">Cloudflare R2 Bucket High-Speed CDN</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddGalleryModalOpen(false)}
                className="p-2 rounded-xl bg-app-input hover:bg-brand-soft text-app-muted hover:text-app-heading transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <UnifiedImageUploader
              onImageUploaded={(url) => void handleAddGalleryPhotos(url)}
              onImagesUploaded={(items) => void handleAddGalleryPhotos(items)}
              userId={currentUser.id}
              category="gallery"
              aspectRatio="4:5"
              targetRole={currentUser.role}
              targetName={currentUser.name}
              accentColor="pink"
              title="Gallery Photo"
              subtitle="Upload one or more photos (PNG, JPG, WEBP, GIF — Max 10MB each)"
              showPresets={false}
              showUrlInput={true}
              multiple
            />

            <div className="pt-3 border-t border-hairline flex justify-end">
              <button
                type="button"
                onClick={() => setIsAddGalleryModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-app-input hover:bg-brand-soft text-app-muted text-xs font-mono font-bold cursor-pointer transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. ADD MOMENT MODAL */}
      {isAddMomentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div
            className="bg-app-card border border-hairline rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 relative max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-10 h-10 rounded-2xl bg-pink-500/20 border border-pink-500/40 flex items-center justify-center text-pink-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-app-heading font-mono">Share a Moment</h3>
                  <p className="text-[11px] text-app-muted">Stored via R2 · published to Moments feed</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddMomentModalOpen(false)}
                className="p-2 rounded-xl bg-app-input hover:bg-brand-soft text-app-muted hover:text-app-heading transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handlePublishMoment(e)} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-app-muted font-mono mb-2">Moment Photo</label>
                <UnifiedImageUploader
                  currentImageUrl={momentMediaUrl}
                  onImageUploaded={(url) => setMomentMediaUrl(url)}
                  userId={currentUser.id}
                  category="moment"
                  aspectRatio="16:9"
                  targetRole={currentUser.role}
                  targetName={currentUser.name}
                  accentColor="pink"
                  title="Moment Photo"
                  subtitle="Upload a photo for your moment post"
                  showPresets={false}
                  showUrlInput={true}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-app-muted font-mono mb-1">Caption</label>
                <textarea
                  rows={3}
                  value={momentCaption}
                  onChange={(e) => setMomentCaption(e.target.value)}
                  placeholder="What's on your mind today?"
                  className="w-full px-3 py-2 bg-app-input border border-hairline rounded-xl text-xs text-app-heading focus:outline-none focus:border-pink-500"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-hairline">
                <button
                  type="button"
                  onClick={() => setIsAddMomentModalOpen(false)}
                  disabled={momentPublishing}
                  className="w-1/2 py-2.5 bg-app-input hover:bg-brand-soft text-app-muted rounded-xl font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={momentPublishing || !momentMediaUrl.trim() || !momentCaption.trim()}
                  className="w-1/2 py-2.5 bg-pink-600 hover:bg-pink-500 text-white rounded-xl font-bold text-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {momentPublishing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Publishing…</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Publish Moment</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ProfileShell>
  );
};
