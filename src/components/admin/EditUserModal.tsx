import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import {
  X,
  User,
  ShieldCheck,
  Coins,
  DollarSign,
  Crown,
  Activity,
  Image as ImageIcon,
  Plus,
  Trash2,
  Lock,
  Unlock,
  Check,
  Sparkles,
  Globe,
  Phone,
  Mail,
  Calendar,
  Layers,
  Heart,
  Video,
  Award,
  MapPin,
  Navigation,
  Compass,
  Upload,
  Cloud,
  RefreshCw,
} from 'lucide-react';
import { UserProfile, UserRole, UserGender, OnlineStatus } from '../../types';
import { POPULAR_MOCK_LOCATIONS } from '../../utils/location';
import { uploadMediaDirectlyToR2 } from '../../utils/r2Storage';
import { UnifiedImageUploader } from '../common/UnifiedImageUploader';
import { getFallbackAvatar } from '../../utils/avatars';
import { ALL_WORLDWIDE_COUNTRIES } from '../../utils/countries';
import { CountrySelector } from '../common/CountrySelector';
import { LanguageSelector } from '../common/LanguageSelector';
import { ZodiacSelector } from '../common/ZodiacSelector';
import { InterestSelector } from '../common/InterestSelector';

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile | null;
}

export const EditUserModal: React.FC<EditUserModalProps> = ({
  isOpen,
  onClose,
  user,
}) => {
  const { adminUpdateUser, showToast } = useApp();

  const [activeTab, setActiveTab] = useState<'profile' | 'identity' | 'economy' | 'media' | 'stats'>('profile');

  // Form State
  const [formData, setFormData] = useState<Partial<UserProfile>>({});
  const [spokenLanguagesInput, setSpokenLanguagesInput] = useState('');
  const [interestsInput, setInterestsInput] = useState('');
  const [newGalleryUrl, setNewGalleryUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingGallery, setIsUploadingGallery] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const lastSyncedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (user && (lastSyncedUserIdRef.current !== user.id || !formData.id)) {
      lastSyncedUserIdRef.current = user.id;
      setFormData({
        ...user,
        payoutMethod: user.payoutMethod || { type: 'paypal', details: '' },
      });
      setSpokenLanguagesInput((user.spokenLanguages || []).join(', '));
      setInterestsInput((user.interests || []).join(', '));
      setNewGalleryUrl('');
      setActiveTab('profile');
    }
  }, [user?.id, isOpen]);

  if (!isOpen || !user) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    const finalUpdates: Partial<UserProfile> = {
      ...formData,
      spokenLanguages: formData.spokenLanguages && formData.spokenLanguages.length > 0 ? formData.spokenLanguages : (user.spokenLanguages || ['English']),
      interests: formData.interests && formData.interests.length > 0 ? formData.interests : (user.interests || []),
      age: Number(formData.age) || user.age || 21,
      coinBalance: Number(formData.coinBalance) ?? user.coinBalance,
      hourlyCoinRate: Number(formData.hourlyCoinRate) ?? user.hourlyCoinRate,
      earningsCoins: Number(formData.earningsCoins) ?? user.earningsCoins,
      totalLifetimeEarnedUSD: Number(formData.totalLifetimeEarnedUSD) ?? user.totalLifetimeEarnedUSD,
      totalCallsHosted: Number(formData.totalCallsHosted) ?? user.totalCallsHosted,
      totalCallMinutes: Number(formData.totalCallMinutes) ?? user.totalCallMinutes,
      totalGiftsReceivedCount: Number(formData.totalGiftsReceivedCount) ?? user.totalGiftsReceivedCount,
    };

    setTimeout(() => {
      adminUpdateUser(user.id, finalUpdates);
      setIsSaving(false);
      onClose();
    }, 250);
  };

  const handleAddGalleryItem = () => {
    if (!newGalleryUrl.trim()) return;
    const currentGallery = formData.gallery || [];
    setFormData({
      ...formData,
      gallery: [...currentGallery, newGalleryUrl.trim()],
    });
    setNewGalleryUrl('');
  };

  const handleRemoveGalleryItem = (index: number) => {
    const currentGallery = formData.gallery || [];
    setFormData({
      ...formData,
      gallery: currentGallery.filter((_, i) => i !== index),
    });
  };

  const handleUploadAvatarToR2 = async (file: File) => {
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) {
      showToast?.('Invalid File', 'Please select an image file', 'error');
      return;
    }
    // Instant local preview
    const localUrl = URL.createObjectURL(file);
    setFormData((prev) => ({ ...prev, avatarUrl: localUrl }));

    setIsUploadingAvatar(true);
    try {
      const result = await uploadMediaDirectlyToR2({
        file,
        userId: user.id,
        category: 'avatar',
      });
      if (result && result.publicUrl) {
        setFormData((prev) => ({ ...prev, avatarUrl: result.publicUrl }));
      }
      showToast?.('Avatar Uploaded ☁️', 'New picture uploaded directly to Cloudflare R2 bucket!', 'success');
    } catch (err: any) {
      console.warn('R2 upload note, local preview active:', err.message);
      showToast?.('Avatar Applied ✨', 'Image applied to user profile preview.', 'info');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleUploadGalleryToR2 = async (file: File) => {
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) {
      showToast?.('Invalid File', 'Please select an image file', 'error');
      return;
    }
    // Instant local preview
    const localUrl = URL.createObjectURL(file);
    setFormData((prev) => ({
      ...prev,
      gallery: [...(prev.gallery || []), localUrl],
    }));

    setIsUploadingGallery(true);
    try {
      const result = await uploadMediaDirectlyToR2({
        file,
        userId: user.id,
        category: 'gallery',
      });
      if (result && result.publicUrl) {
        setFormData((prev) => {
          const filtered = (prev.gallery || []).filter((u) => u !== localUrl);
          return {
            ...prev,
            gallery: [...filtered, result.publicUrl],
          };
        });
      }
      showToast?.('Photo Added ☁️', 'New gallery photo uploaded to Cloudflare R2 bucket!', 'success');
    } catch (err: any) {
      console.warn('R2 gallery upload note:', err.message);
      showToast?.('Photo Applied ✨', 'Image added to gallery preview.', 'info');
    } finally {
      setIsUploadingGallery(false);
    }
  };

  const presetAvatars = [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400',
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=400',
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=80&w=400',
    'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=400',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=400',
    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=400',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-[#14171E] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-6 flex flex-col max-h-[92vh]">
        {/* Modal Top Header */}
        <div className="flex items-center justify-between p-4 bg-[#0D0F14] border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <img
                src={formData.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=400'}
                alt="Avatar Preview"
                className="w-10 h-10 rounded-full object-cover border-2 border-indigo-500 shadow-md"
              />
              {formData.isVerified && (
                <div className="absolute -bottom-0.5 -right-0.5 bg-blue-500 text-white rounded-full p-0.5 shadow">
                  <Check className="w-2.5 h-2.5" />
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm sm:text-base font-extrabold text-white font-mono">
                  Edit User: <span className="text-indigo-400">{formData.name || user.id}</span>
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono font-bold uppercase">
                  {formData.role?.replace('_', ' ')}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                ID: <span className="text-slate-300">{user.id}</span> • Joined {user.createdAt || 'Recent'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Sub-Tabs */}
        <div className="flex items-center overflow-x-auto border-b border-slate-800 bg-[#0F1218] px-3 gap-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`px-3 py-2.5 text-xs font-bold font-mono transition-all flex items-center space-x-1.5 border-b-2 whitespace-nowrap ${
              activeTab === 'profile'
                ? 'border-indigo-500 text-white bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Profile & Bio</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('identity')}
            className={`px-3 py-2.5 text-xs font-bold font-mono transition-all flex items-center space-x-1.5 border-b-2 whitespace-nowrap ${
              activeTab === 'identity'
                ? 'border-indigo-500 text-white bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Role, Gender & Age</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('economy')}
            className={`px-3 py-2.5 text-xs font-bold font-mono transition-all flex items-center space-x-1.5 border-b-2 whitespace-nowrap ${
              activeTab === 'economy'
                ? 'border-indigo-500 text-white bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            <span>Wallet & Rates</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('media')}
            className={`px-3 py-2.5 text-xs font-bold font-mono transition-all flex items-center space-x-1.5 border-b-2 whitespace-nowrap ${
              activeTab === 'media'
                ? 'border-indigo-500 text-white bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
            <span>Gallery & Video</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('stats')}
            className={`px-3 py-2.5 text-xs font-bold font-mono transition-all flex items-center space-x-1.5 border-b-2 whitespace-nowrap ${
              activeTab === 'stats'
                ? 'border-indigo-500 text-white bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-purple-400" />
            <span>Status & Stats</span>
          </button>
        </div>

        {/* Form Body with Scroll */}
        <form id="edit-user-form" onSubmit={handleSave} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs font-sans">
          
          {/* TAB 1: Profile & Bio */}
          {activeTab === 'profile' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 font-mono mb-1">
                    Display Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0C0E12] border border-slate-800 rounded-lg text-white font-semibold focus:outline-none focus:border-indigo-500"
                    placeholder="Full name or stage name"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 font-mono mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0C0E12] border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-indigo-500"
                    placeholder="user@example.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 font-mono mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0C0E12] border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-indigo-500"
                    placeholder="+1 (555) 000-0000"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 font-mono mb-1">
                    City / Location
                  </label>
                  <input
                    type="text"
                    value={formData.locationCity || ''}
                    onChange={(e) => setFormData({ ...formData, locationCity: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0C0E12] border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. Los Angeles, CA"
                  />
                </div>

                <div>
                  <ZodiacSelector
                    value={formData.zodiac}
                    onChange={(z) => setFormData((prev) => ({ ...prev, zodiac: z ? z.name : '' }))}
                    label="Zodiac Sign (Real Vector Glyph)"
                  />
                </div>
              </div>

              {/* Avatar Photo & Cloudflare R2 Storage Selector */}
              <UnifiedImageUploader
                currentImageUrl={formData.avatarUrl || user.avatarUrl}
                onImageUploaded={(newUrl) => setFormData((prev) => ({ ...prev, avatarUrl: newUrl }))}
                userId={user.id}
                category="avatar"
                targetRole={formData.role || user.role}
                targetName={formData.name || user.name}
                accentColor={formData.role === 'team_leader' ? 'amber' : formData.gender === 'female' ? 'pink' : 'indigo'}
                title="Profile Picture & Cloudflare R2 Storage"
                subtitle="Direct upload to Cloudflare R2 bucket or select from curated high-definition avatar collections."
                showPresets={true}
                showUrlInput={true}
              />

              {/* Bio & Extended Bio */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 font-mono mb-1">
                  Short Tagline / Bio
                </label>
                <input
                  type="text"
                  value={formData.bio || ''}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0C0E12] border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  placeholder="Catchy profile quote or bio..."
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 font-mono mb-1">
                  Extended Creator / About Me Bio
                </label>
                <textarea
                  rows={3}
                  value={formData.extendedBio || ''}
                  onChange={(e) => setFormData({ ...formData, extendedBio: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0C0E12] border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500 resize-none"
                  placeholder="Detailed background, hobbies, schedule, stream topics..."
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 font-mono mb-1">
                  Response Rate Label
                </label>
                <input
                  type="text"
                  value={formData.responseRate || ''}
                  onChange={(e) => setFormData({ ...formData, responseRate: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0C0E12] border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. 99% within 1m"
                />
              </div>
            </div>
          )}

          {/* TAB 2: Identity, Role, Gender & Demographics */}
          {activeTab === 'identity' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 font-mono mb-1">
                    System Role *
                  </label>
                  <select
                    value={formData.role || 'male_user'}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                    className="w-full px-3 py-2 bg-[#0C0E12] border border-slate-800 rounded-lg text-white font-mono font-bold focus:outline-none focus:border-indigo-500"
                  >
                    <option value="male_user">Male User</option>
                    <option value="female_user">Female User</option>
                    <option value="female_creator">Female Creator (Agency Host)</option>
                    <option value="other_user">Other User</option>
                    <option value="team_leader">Agency</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 font-mono mb-1">
                    Gender *
                  </label>
                  <select
                    value={formData.gender || 'male'}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value as UserGender })}
                    className="w-full px-3 py-2 bg-[#0C0E12] border border-slate-800 rounded-lg text-white font-mono font-bold focus:outline-none focus:border-indigo-500"
                  >
                    <option value="male">Male ♂</option>
                    <option value="female">Female ♀</option>
                    <option value="other">Other / Non-Binary</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 font-mono mb-1">
                    Gender Lock Status
                  </label>
                  <div className="flex items-center space-x-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, genderLocked: !formData.genderLocked })}
                      className={`px-3 py-1.5 rounded-lg border font-mono font-bold text-xs flex items-center space-x-1.5 transition-all ${
                        formData.genderLocked
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      }`}
                    >
                      {formData.genderLocked ? (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          <span>Locked</span>
                        </>
                      ) : (
                        <>
                          <Unlock className="w-3.5 h-3.5" />
                          <span>Unlocked</span>
                        </>
                      )}
                    </button>
                    <span className="text-[10px] text-slate-400">
                      {formData.genderLocked ? 'User cannot self-change gender' : 'User can freely edit gender'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 font-mono mb-1">
                    Age (Years)
                  </label>
                  <input
                    type="number"
                    min={18}
                    max={99}
                    value={formData.age ?? 21}
                    onChange={(e) => setFormData({ ...formData, age: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-[#0C0E12] border border-slate-800 rounded-lg text-white font-mono font-bold focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 font-mono mb-1">
                    Date of Birth (DOB)
                  </label>
                  <input
                    type="date"
                    value={formData.dob || '2000-01-01'}
                    onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0C0E12] border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Country Selector with Real SVG Flags */}
              <div>
                <CountrySelector
                  value={formData.countryCode || formData.nationality}
                  onChange={(c) =>
                    setFormData((prev) => ({
                      ...prev,
                      nationality: c.name,
                      countryCode: c.code,
                    }))
                  }
                  label="Nationality / Country (Real Vector SVG Flag)"
                />
              </div>

              {/* Spoken Languages Multi-Select */}
              <div>
                <LanguageSelector
                  selectedLanguages={formData.spokenLanguages || []}
                  onChange={(langs) =>
                    setFormData((prev) => ({
                      ...prev,
                      spokenLanguages: langs,
                    }))
                  }
                  label="Spoken Languages (Click & Add Multiple)"
                />
              </div>

              {/* Categorized Interests Multi-Select */}
              <div>
                <InterestSelector
                  selectedInterests={formData.interests || []}
                  onChange={(ints) =>
                    setFormData((prev) => ({
                      ...prev,
                      interests: ints,
                    }))
                  }
                  label="Interests & Passions (Categorized Multi-Select)"
                />
              </div>

              {/* Interested In (Connection Preferences) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 font-mono mb-1">
                  Interested in Connecting With (Target Gender / Match Preferences)
                </label>
                <select
                  value={formData.interestedIn && formData.interestedIn.length > 0 ? formData.interestedIn[0] : (formData.gender === 'female' ? 'male' : 'female')}
                  onChange={(e) => setFormData({ ...formData, interestedIn: [e.target.value] })}
                  className="w-full px-3 py-2 bg-[#0C0E12] border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500 text-xs font-mono"
                >
                  <option value="female">Women (Female Creators & Users)</option>
                  <option value="male">Men (Male Users)</option>
                  <option value="everyone">Everyone (All Genders & Creators)</option>
                </select>
              </div>

              {/* Location & Mock Location Permissions Section */}
              <div className="pt-2 border-t border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <MapPin className="w-4 h-4 text-pink-400" />
                    <h3 className="text-xs font-bold text-white font-mono uppercase tracking-wide">
                      Location & Geolocation Controls
                    </h3>
                  </div>
                  {(formData.gender === 'female' || formData.role === 'female_creator') && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-pink-500/15 border border-pink-500/30 text-pink-300 font-mono font-bold">
                      Host Location Feature
                    </span>
                  )}
                </div>

                {/* Admin Mock Location Permission Switch for Female Host */}
                {(formData.gender === 'female' || formData.role === 'female_creator') ? (
                  <div className="p-3 bg-[#0B0D12] border border-pink-500/30 rounded-xl space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="pr-4">
                        <div className="font-bold text-white text-xs flex items-center space-x-1.5">
                          <span>Allow Female Host to Select Mock Location</span>
                          {formData.allowMockLocation && (
                            <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded text-[9px] font-mono font-bold">
                              ALLOWED
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                          When turned ON, this female host is permitted to select and display a mock/virtual location on her profile page (e.g. Miami, Paris, Tokyo) instead of exposing her exact physical GPS location.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            allowMockLocation: !formData.allowMockLocation,
                          })
                        }
                        className={`px-3 py-1.5 rounded-lg border font-mono font-bold text-xs shrink-0 transition-all ${
                          formData.allowMockLocation
                            ? 'bg-pink-600 text-white border-pink-500 shadow-md shadow-pink-600/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        {formData.allowMockLocation ? '✓ Permission Granted' : '✕ Disabled'}
                      </button>
                    </div>

                    {/* Admin Direct Mock Location Configuration */}
                    <div className="pt-2 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 font-mono mb-1 flex items-center justify-between">
                          <span>Active Mock Location Toggle</span>
                          <span className="text-[9px] text-pink-400">
                            {formData.isUsingMockLocation ? 'Mock Active' : 'Real/Original Location'}
                          </span>
                        </label>
                        <select
                          value={formData.isUsingMockLocation ? 'mock' : 'real'}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              isUsingMockLocation: e.target.value === 'mock',
                            })
                          }
                          className="w-full px-2.5 py-1.5 bg-[#08090C] border border-slate-800 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-pink-500"
                        >
                          <option value="real">Real / Profile Location</option>
                          <option value="mock">Virtual Mock Location (Active)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 font-mono mb-1">
                          Select Mock Location Preset
                        </label>
                        <select
                          value={
                            POPULAR_MOCK_LOCATIONS.find((p) => p.city === formData.mockLocationCity)?.id || ''
                          }
                          onChange={(e) => {
                            const found = POPULAR_MOCK_LOCATIONS.find((p) => p.id === e.target.value);
                            if (found) {
                              setFormData({
                                ...formData,
                                isUsingMockLocation: true,
                                mockLocationCity: found.city,
                                mockLocationCountry: found.country,
                                mockLocationCountryCode: found.countryCode,
                              });
                            }
                          }}
                          className="w-full px-2.5 py-1.5 bg-[#08090C] border border-slate-800 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-pink-500"
                        >
                          <option value="">-- Choose Preset City --</option>
                          {POPULAR_MOCK_LOCATIONS.map((preset) => (
                            <option key={preset.id} value={preset.id}>
                              {preset.city}, {preset.country} ({preset.countryCode})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 font-mono mb-1">
                          Mock City Name
                        </label>
                        <input
                          type="text"
                          value={formData.mockLocationCity || ''}
                          onChange={(e) =>
                            setFormData({ ...formData, mockLocationCity: e.target.value })
                          }
                          className="w-full px-2.5 py-1.5 bg-[#08090C] border border-slate-800 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-pink-500"
                          placeholder="e.g. Miami, Paris"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 font-mono mb-1">
                          Mock Country & ISO Code
                        </label>
                        <div className="flex space-x-1.5">
                          <input
                            type="text"
                            value={formData.mockLocationCountry || ''}
                            onChange={(e) =>
                              setFormData({ ...formData, mockLocationCountry: e.target.value })
                            }
                            className="flex-1 px-2.5 py-1.5 bg-[#08090C] border border-slate-800 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-pink-500"
                            placeholder="United States"
                          />
                          <input
                            type="text"
                            maxLength={3}
                            value={formData.mockLocationCountryCode || ''}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                mockLocationCountryCode: e.target.value.toUpperCase(),
                              })
                            }
                            className="w-14 px-2 py-1.5 bg-[#08090C] border border-slate-800 rounded-lg text-white font-mono text-xs uppercase font-bold focus:outline-none focus:border-pink-500 text-center"
                            placeholder="US"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-[#0B0D12] border border-slate-800 rounded-xl">
                    <div className="flex items-center space-x-2 text-slate-300 font-mono text-xs">
                      <Compass className="w-4 h-4 text-indigo-400" />
                      <span className="font-bold">Caller Location Info:</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Male users and callers use their exact/real device GPS location. Mock location spoofing is reserved for verified female creators when authorized by an administrator.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Economy, Wallet & Rates */}
          {activeTab === 'economy' && (
            <div className="space-y-4">
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center space-x-3">
                <div className="text-xl">🪙</div>
                <div className="text-[11px] text-amber-300">
                  <span className="font-bold">Coin Economy Controller:</span> Changes here will directly update user balances, call rates, and payout cashout records.
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 font-mono mb-1">
                    Coin Balance (Male User / General Wallet)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      value={formData.coinBalance ?? 0}
                      onChange={(e) => setFormData({ ...formData, coinBalance: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-[#0C0E12] border border-slate-800 rounded-lg text-amber-300 font-mono font-extrabold text-sm focus:outline-none focus:border-amber-500"
                    />
                    <span className="absolute right-3 top-2.5 text-slate-500 font-mono">🪙 COINS</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 font-mono mb-1">
                    Video Call Rate (Coins/Min)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={formData.hourlyCoinRate ?? 10}
                    onChange={(e) => setFormData({ ...formData, hourlyCoinRate: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-[#0C0E12] border border-slate-800 rounded-lg text-indigo-300 font-mono font-bold focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-[10px] text-slate-500">Coins charged per minute of video call</span>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 font-mono mb-1">
                    Accumulated Earnings (Coins)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formData.earningsCoins ?? 0}
                    onChange={(e) => setFormData({ ...formData, earningsCoins: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-[#0C0E12] border border-slate-800 rounded-lg text-emerald-400 font-mono font-bold focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-slate-500">Ready for USD withdrawal conversion</span>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 font-mono mb-1">
                    Total Lifetime Earned ($ USD)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={formData.totalLifetimeEarnedUSD ?? 0}
                    onChange={(e) => setFormData({ ...formData, totalLifetimeEarnedUSD: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-[#0C0E12] border border-slate-800 rounded-lg text-emerald-400 font-mono font-bold focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-slate-500">Lifetime withdrawn + pending USD</span>
                </div>
              </div>

              {/* Creator Payout Method */}
              <div className="p-3 bg-[#0F1218] border border-slate-800 rounded-xl space-y-2">
                <div className="font-bold text-white font-mono text-[11px] flex items-center space-x-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Creator Withdrawal Account</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 font-mono mb-1">Payout Method</label>
                    <select
                      value={formData.payoutMethod?.type || 'paypal'}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          payoutMethod: {
                            type: e.target.value as any,
                            details: formData.payoutMethod?.details || '',
                          },
                        })
                      }
                      className="w-full px-2.5 py-1.5 bg-[#0C0E12] border border-slate-800 rounded text-white font-mono capitalize"
                    >
                      <option value="paypal">PayPal</option>
                      <option value="bank">Direct Bank Transfer</option>
                      <option value="crypto">Crypto (USDT / TRC20)</option>
                      <option value="local">Local Wallet / UPI / GCash</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[10px] text-slate-400 font-mono mb-1">Account / IBAN / Wallet Details</label>
                    <input
                      type="text"
                      value={formData.payoutMethod?.details || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          payoutMethod: {
                            type: formData.payoutMethod?.type || 'paypal',
                            details: e.target.value,
                          },
                        })
                      }
                      className="w-full px-2.5 py-1.5 bg-[#0C0E12] border border-slate-800 rounded text-white font-mono"
                      placeholder="e.g. creator@paypal.com or TRC20 address"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Gallery & Media */}
          {activeTab === 'media' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-[#0C0E12] border border-slate-800 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-slate-300 font-mono">
                    Upload New Media to Cloudflare R2 Bucket
                  </label>
                  <span className="text-[10px] font-mono text-emerald-400 flex items-center space-x-1">
                    <Cloud className="w-3 h-3" />
                    <span>R2 Cloud Storage</span>
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="file"
                    ref={galleryInputRef}
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadGalleryToR2(file);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    disabled={isUploadingGallery}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-mono font-bold text-xs flex items-center space-x-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {isUploadingGallery ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Uploading to R2...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload File to R2</span>
                      </>
                    )}
                  </button>

                  <div className="flex-1 min-w-[200px] flex space-x-2">
                    <input
                      type="url"
                      value={newGalleryUrl}
                      onChange={(e) => setNewGalleryUrl(e.target.value)}
                      placeholder="Or paste image URL (https://...)"
                      className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono text-[11px] focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddGalleryItem}
                      className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-mono font-bold text-xs flex items-center space-x-1 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add URL</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Gallery Items Grid */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 font-mono mb-2">
                  Current Gallery Media ({formData.gallery?.length || 0} items)
                </label>
                {(!formData.gallery || formData.gallery.length === 0) ? (
                  <div className="p-6 text-center border border-dashed border-slate-800 rounded-xl text-slate-500 font-mono text-xs">
                    No gallery images uploaded yet. Paste an image URL above to add.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {formData.gallery.map((url, idx) => (
                      <div key={idx} className="relative group rounded-lg overflow-hidden border border-slate-800 aspect-square bg-slate-900">
                        <img src={url} alt={`Gallery item ${idx}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleRemoveGalleryItem(idx)}
                          className="absolute top-1.5 right-1.5 p-1 bg-rose-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                          title="Delete photo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <span className="absolute bottom-1 left-1 bg-black/60 px-1 rounded text-[9px] font-mono text-white">
                          #{idx + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 font-mono mb-1">
                  AI Face Verification Video URL (Selfie Proof)
                </label>
                <input
                  type="url"
                  value={formData.verificationVideoUrl || ''}
                  onChange={(e) => setFormData({ ...formData, verificationVideoUrl: e.target.value })}
                  placeholder="https://.../verification.mp4"
                  className="w-full px-3 py-2 bg-[#0C0E12] border border-slate-800 rounded-lg text-white font-mono text-[11px] focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          {/* TAB 5: Verification, Status & Stats */}
          {activeTab === 'stats' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* AI Verification Toggle */}
                <div className="p-3.5 bg-[#0F1218] border border-slate-800 rounded-xl flex items-center justify-between">
                  <div>
                    <div className="font-bold text-white font-mono text-xs flex items-center space-x-1.5">
                      <ShieldCheck className="w-4 h-4 text-blue-400" />
                      <span>AI Face Verified Badge</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Displays official blue verification badge on profile & match roulette.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isVerified: !formData.isVerified })}
                    className={`px-3 py-1.5 rounded-lg border font-mono font-bold text-xs transition-all ${
                      formData.isVerified
                        ? 'bg-blue-500/20 text-blue-300 border-blue-500/50'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {formData.isVerified ? '✓ Verified' : 'Unverified'}
                  </button>
                </div>

                {/* Online Status */}
                <div className="p-3.5 bg-[#0F1218] border border-slate-800 rounded-xl">
                  <label className="block font-bold text-white font-mono text-xs mb-1">
                    Live Presence Status
                  </label>
                  <select
                    value={formData.onlineStatus || 'online'}
                    onChange={(e) => setFormData({ ...formData, onlineStatus: e.target.value as OnlineStatus })}
                    className="w-full px-3 py-1.5 bg-[#0C0E12] border border-slate-800 rounded-lg text-white font-mono font-bold text-xs focus:outline-none focus:border-indigo-500 capitalize"
                  >
                    <option value="online">🟢 Online</option>
                    <option value="in_call">📞 In Call</option>
                    <option value="busy">🔴 Busy</option>
                    <option value="offline">⚪ Offline</option>
                  </select>
                </div>
              </div>

              {/* Call & Gift Activity Stats */}
              <div className="p-3.5 bg-[#0F1218] border border-slate-800 rounded-xl space-y-3">
                <div className="font-bold text-white font-mono text-xs flex items-center space-x-1.5">
                  <Award className="w-4 h-4 text-amber-400" />
                  <span>Activity Metrics & Call Telemetry</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-400 font-mono mb-1">Total Calls Hosted</label>
                    <input
                      type="number"
                      min={0}
                      value={formData.totalCallsHosted ?? 0}
                      onChange={(e) => setFormData({ ...formData, totalCallsHosted: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 bg-[#0C0E12] border border-slate-800 rounded text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 font-mono mb-1">Total Call Minutes</label>
                    <input
                      type="number"
                      min={0}
                      value={formData.totalCallMinutes ?? 0}
                      onChange={(e) => setFormData({ ...formData, totalCallMinutes: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 bg-[#0C0E12] border border-slate-800 rounded text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 font-mono mb-1">Gifts Received Count</label>
                    <input
                      type="number"
                      min={0}
                      value={formData.totalGiftsReceivedCount ?? 0}
                      onChange={(e) => setFormData({ ...formData, totalGiftsReceivedCount: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 bg-[#0C0E12] border border-slate-800 rounded text-white font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

        </form>

        {/* Modal Bottom Action Footer */}
        <div className="flex items-center justify-between p-4 bg-[#0D0F14] border-t border-slate-800">
          <div className="text-[11px] text-slate-400 font-mono">
            Modifying user: <span className="text-white font-bold">{formData.name}</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono font-bold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-user-form"
              disabled={isSaving}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-mono font-bold transition-all shadow-lg shadow-indigo-600/30 flex items-center space-x-1.5 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Save All Changes</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
