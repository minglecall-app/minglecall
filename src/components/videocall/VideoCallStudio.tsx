import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import {
  PhoneOff,
  Phone,
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  RefreshCw,
  Gift,
  MessageSquare,
  ShieldAlert,
  Lock,
  Coins,
  Sparkles,
  Send,
  X,
  Volume2,
  CheckCircle2,
  AlertCircle,
  Users,
  AlertTriangle,
  Sliders,
  Layers,
  Smile,
} from 'lucide-react';
import { MegaGiftOverlay } from './MegaGiftOverlay';
import { getCountryFlag } from '../../utils/flags';
import { SvgFlag } from '../common/SvgFlag';
import {
  Room,
  RoomEvent,
  Track,
  createLocalTracks,
  ConnectionQuality,
  ConnectionState,
  type LocalTrack,
  type LocalVideoTrack,
  type RemoteTrack,
  VideoPresets,
} from 'livekit-client';
import { authFetch } from '../../utils/apiClient';
import { isFemaleCreatorRole } from '../../types';

interface VideoCallStudioProps {
  onOpenStore: () => void;
}

export const VideoCallStudio: React.FC<VideoCallStudioProps> = ({ onOpenStore: _onOpenStore }) => {
  const {
    activeCall,
    acceptCall,
    rejectCall,
    endCall,
    markCallMediaConnected,
    currentUser,
    users,
    systemSettings,
    virtualGifts,
    sendGiftInCall,
    sendMessage,
    ingestInCallChatPreview,
    notifyInCallChatPreview,
    chatMessages,
    friends,
    getEffectiveCallRate,
    showToast,
  } = useApp();
  const markCallMediaConnectedRef = useRef(markCallMediaConnected);
  useEffect(() => {
    markCallMediaConnectedRef.current = markCallMediaConnected;
  }, [markCallMediaConnected]);

  const protectScreen = systemSettings.screenRecordingProtection !== false;
  const [screenCovered, setScreenCovered] = useState(false);
  useEffect(() => {
    if (!protectScreen) {
      setScreenCovered(false);
      return;
    }
    const syncCover = () => setScreenCovered(document.visibilityState !== 'visible');
    document.addEventListener('visibilitychange', syncCover);
    return () => document.removeEventListener('visibilitychange', syncCover);
  }, [protectScreen]);

  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  /** Front (user) vs rear (environment) — not CSS-only mirror */
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [showGiftDrawer, setShowGiftDrawer] = useState(false);
  const [showChatDrawer, setShowChatDrawer] = useState(false);
  const [chatInputText, setChatInputText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  /** PiP position inside the video stage (left/top px). null = default bottom-right. */
  const [pipPos, setPipPos] = useState<{ left: number; top: number } | null>(null);
  const [isFlippingCamera, setIsFlippingCamera] = useState(false);
  /** In-call overlay bubbles: message id + when first shown (30s TTL outside keep window). */
  const [overlayEntries, setOverlayEntries] = useState<{ id: string; shownAt: number }[]>([]);
  /** Message ids already present when the active call started — do not flood overlay with pre-call history. */
  const callChatBaselineRef = useRef<Set<string>>(new Set());
  /** Ids already shown on the overlay this call — never re-add after TTL prune. */
  const overlaySeenIdsRef = useRef<Set<string>>(new Set());
  /** Fresh temp overlay ids (shownAt) — grace so sync effect never drops them mid-send. */
  const overlayFreshTempAtRef = useRef<Map<string, number>>(new Map());
  /** temp_ → durable UUID once reconciled — blocks late LiveKit re-push of the same temp. */
  const overlayTempToDurableRef = useRef<Map<string, string>>(new Map());
  const overlayCallIdRef = useRef<string | null>(null);
  const chatMessagesRef = useRef(chatMessages);
  chatMessagesRef.current = chatMessages;
  const OVERLAY_KEEP_COUNT = 4;
  const OVERLAY_TTL_MS = 30_000;
  const OVERLAY_TEMP_GRACE_MS = 4_000;
  const IN_CALL_EMOJIS = [
    '😀', '😂', '😍', '🥰', '😘', '😊', '😉', '😎', '🤔', '😢', '😭', '😡',
    '👍', '👎', '👏', '🙏', '🔥', '❤️', '💕', '🌹', '🎉', '✨', '💯', '💋',
    '👋', '🤝', '💪', '🫡', '😴', '🤩', '😳', '🥺',
  ] as const;
  const [isPortrait, setIsPortrait] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight >= window.innerWidth : true
  );
  /** Remote peer muted their camera — show placeholder instead of a stuck last frame */
  const [remoteCameraOff, setRemoteCameraOff] = useState(false);

  // Mobile soft cap: phones prefer ≤720p even if admin selected 1080p/4k (avoids encoder backlog)
  const isLikelyMobile =
    typeof window !== 'undefined' &&
    (window.innerWidth < 768 ||
      (typeof window.matchMedia === 'function' &&
        window.matchMedia('(pointer: coarse)').matches));

  const adminCaptureResolution = systemSettings.livekitCaptureResolution || '720p';
  // Soft mobile cap — document: desktop may keep admin 1080p; mobile maxes at 720p
  const effectiveCaptureResolution: '1080p' | '720p' | '480p' | '4k' =
    isLikelyMobile && (adminCaptureResolution === '1080p' || adminCaptureResolution === '4k')
      ? '720p'
      : adminCaptureResolution;

  const adminQualityProfile: 'ultra_4k' | 'hd_1080p' | 'high_720p' | 'standard_480p' =
    effectiveCaptureResolution === '4k' ? 'ultra_4k' :
    effectiveCaptureResolution === '1080p' ? 'hd_1080p' :
    effectiveCaptureResolution === '480p' ? 'standard_480p' :
    'high_720p'; // Default sweet spot: 720p @ 24–30 fps

  // Hard clamp: admin 60 → 30; keep publish FPS in the 24–30 band for smooth 1-on-1
  const adminFpsRaw = systemSettings.livekitMaxFramerate || 30;
  const effectiveFps = Math.min(30, Math.max(24, adminFpsRaw));

  /** Clamp bitrate into resolution band so high-res never ships with a tiny bitrate. */
  const clampBitrateForResolution = (res: typeof effectiveCaptureResolution, adminKbps?: number) => {
    const bands: Record<string, { min: number; max: number; def: number }> = {
      '480p': { min: 800, max: 1500, def: 1200 },
      // Mobile prefers lower end of 720p band
      '720p': { min: 1800, max: 2500, def: isLikelyMobile ? 1800 : 2200 },
      '1080p': { min: 3500, max: 4500, def: 4000 },
      // 4K is not recommended for mobile 1-on-1; if enabled on desktop, require high bitrate
      '4k': { min: 8000, max: 12000, def: 8500 },
    };
    const band = bands[res] || bands['720p'];
    if (!adminKbps || adminKbps <= 0) return band.def;
    return Math.min(band.max, Math.max(band.min, adminKbps));
  };

  const effectiveBitrateKbps = clampBitrateForResolution(
    effectiveCaptureResolution,
    systemSettings.livekitMaxBitrateKbps
  );

  const enableSimulcast = systemSettings.livekitSimulcastEnabled !== false;
  const adaptiveStream = systemSettings.livekitAdaptiveStream !== false;
  const dynacast = systemSettings.livekitDynacast !== false;
  const preferredCodec = systemSettings.livekitVideoCodec || 'h264';

  // Soft capture constraints (ideal-only) so phones don't fail getUserMedia on hard mins
  const getVideoConstraints = (portrait: boolean = isPortrait) => {
    switch (adminQualityProfile) {
      case 'ultra_4k':
        return {
          width: portrait ? { ideal: 2160 } : { ideal: 3840 },
          height: portrait ? { ideal: 3840 } : { ideal: 2160 },
          aspectRatio: portrait ? { ideal: 9 / 16 } : { ideal: 16 / 9 },
          frameRate: { ideal: effectiveFps },
        };
      case 'hd_1080p':
        return {
          width: portrait ? { ideal: 1080 } : { ideal: 1920 },
          height: portrait ? { ideal: 1920 } : { ideal: 1080 },
          aspectRatio: portrait ? { ideal: 9 / 16 } : { ideal: 16 / 9 },
          frameRate: { ideal: effectiveFps },
        };
      case 'standard_480p':
        return {
          width: portrait ? { ideal: 480 } : { ideal: 854 },
          height: portrait ? { ideal: 854 } : { ideal: 480 },
          aspectRatio: portrait ? { ideal: 9 / 16 } : { ideal: 16 / 9 },
          frameRate: { ideal: effectiveFps },
        };
      case 'high_720p':
      default:
        return {
          width: portrait ? { ideal: 720 } : { ideal: 1280 },
          height: portrait ? { ideal: 1280 } : { ideal: 720 },
          aspectRatio: portrait ? { ideal: 9 / 16 } : { ideal: 16 / 9 },
          frameRate: { ideal: effectiveFps },
        };
    }
  };

  // Track viewport orientation for soft capture ideals (no room teardown)
  useEffect(() => {
    const syncOrientation = () => {
      setIsPortrait(window.innerHeight >= window.innerWidth);
    };
    window.addEventListener('resize', syncOrientation);
    window.addEventListener('orientationchange', syncOrientation);
    return () => {
      window.removeEventListener('resize', syncOrientation);
      window.removeEventListener('orientationchange', syncOrientation);
    };
  }, []);

  const qualityLabel = (q: ConnectionQuality) => {
    if (q === ConnectionQuality.Excellent) return 'Excellent';
    if (q === ConnectionQuality.Good) return 'Good';
    if (q === ConnectionQuality.Poor) return 'Poor';
    if (q === ConnectionQuality.Lost) return 'Lost';
    return '';
  };

  // LiveKit Connection State
  const [liveKitConnected, setLiveKitConnected] = useState(false);
  const [liveKitConfigured, setLiveKitConfigured] = useState<boolean | null>(null);
  const [connectionStatusText, setConnectionStatusText] = useState('Initializing…');
  const [isPreviewOnly, setIsPreviewOnly] = useState(false);

  // Refs for WebRTC video elements
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localMediaStreamRef = useRef<MediaStream | null>(null);
  const videoStageRef = useRef<HTMLDivElement | null>(null);
  const pipRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const pipDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origLeft: number;
    origTop: number;
    moved: boolean;
  } | null>(null);
  const facingModeRef = useRef(facingMode);
  facingModeRef.current = facingMode;

  // LiveKit room + local tracks refs
  const liveKitRoomRef = useRef<Room | null>(null);
  const localTracksRef = useRef<LocalTrack[]>([]);
  const currentUserIdRef = useRef(currentUser.id);
  currentUserIdRef.current = currentUser.id;
  const ingestInCallChatPreviewRef = useRef(ingestInCallChatPreview);
  ingestInCallChatPreviewRef.current = ingestInCallChatPreview;
  const pushInCallOverlayMessageRef = useRef<(id: string) => void>(() => {});
  const openInCallChatFromIncomingRef = useRef<() => void>(() => {});

  // Best-effort applyConstraints on rotate — never disconnect LiveKit
  useEffect(() => {
    const soft = getVideoConstraints(isPortrait);
    const mediaConstraints: MediaTrackConstraints = {
      width: soft.width,
      height: soft.height,
      aspectRatio: soft.aspectRatio,
      frameRate: soft.frameRate,
    };

    const tryApply = (mst: MediaStreamTrack | undefined | null) => {
      if (!mst || typeof mst.applyConstraints !== 'function') return;
      mst.applyConstraints(mediaConstraints).catch((err) => {
        console.warn('Orientation constraint apply failed:', err);
      });
    };

    for (const track of localTracksRef.current) {
      if (track.kind === Track.Kind.Video) {
        tryApply(track.mediaStreamTrack);
      }
    }
    localMediaStreamRef.current?.getVideoTracks().forEach((t) => tryApply(t));
    // Only re-apply on orientation / quality profile change — do not tear down the room
  }, [isPortrait, adminQualityProfile, effectiveFps]);

  // Privacy blur (manual) — not ML moderation
  const [privacyBlurActive, setPrivacyBlurActive] = useState(false);

  // Gift overlay active state
  const [activeGiftAnim, setActiveGiftAnim] = useState<{
    name: string;
    icon: string;
    type: string;
    cost: number;
  } | null>(null);

  // --- LiveKit WebRTC Connection & Local Camera Effect ---
  useEffect(() => {
    if (!activeCall || activeCall.status !== 'active') return;

    let isMounted = true;
    const abortController = new AbortController();
    const billingCallId = activeCall.id;
    let billingMarked = false;
    let billingFallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const clearVideoElements = () => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = null;
      }
    };

    const stopLocalTracks = () => {
      for (const track of localTracksRef.current) {
        try {
          track.stop();
          track.detach();
        } catch {
          // ignore cleanup errors
        }
      }
      localTracksRef.current = [];
      if (localMediaStreamRef.current) {
        localMediaStreamRef.current.getTracks().forEach((t) => t.stop());
        localMediaStreamRef.current = null;
      }
    };

    const attachRemoteTrack = async (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Video && remoteVideoRef.current) {
        track.attach(remoteVideoRef.current);
        setRemoteCameraOff(false);
        // iOS Safari: attach alone can leave a black/stuck frame without an explicit play()
        try {
          await remoteVideoRef.current.play();
        } catch {
          // Autoplay may be blocked briefly; Accept/call UI usually provides a user gesture
        }
      } else if (track.kind === Track.Kind.Audio && remoteAudioRef.current) {
        track.attach(remoteAudioRef.current);
        try {
          await remoteAudioRef.current.play();
        } catch {
          // ignore — unmute after gesture often recovers
        }
      }
    };

    const attachExistingRemoteTracks = (room: Room) => {
      room.remoteParticipants.forEach((participant) => {
        participant.trackPublications.forEach((publication) => {
          const track = publication.track;
          if (track && publication.isSubscribed) {
            attachRemoteTrack(track as RemoteTrack);
          }
        });
      });
    };

    const enablePreviewOnly = async (reason: string) => {
      if (!isMounted) return;
      setLiveKitConfigured(false);
      setLiveKitConnected(false);
      setIsPreviewOnly(true);
      setConnectionStatusText(`Preview only — ${reason}`);
      if (showToast) {
        showToast('LiveKit unavailable', reason, 'warning');
      }
      try {
        // Local preview only — not a 2-party call
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingModeRef.current }, ...getVideoConstraints() },
          audio: false,
        });
        if (!isMounted || abortController.signal.aborted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localMediaStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (mediaErr) {
        console.warn('Local preview unavailable:', mediaErr);
        if (isMounted) {
          setConnectionStatusText(`LiveKit unavailable — ${reason}`);
        }
      }
    };

    async function initLiveKit() {
      const vConstraints = getVideoConstraints();
      const maxBitrate = effectiveBitrateKbps * 1000;
      const maxFramerate = effectiveFps;

      const resolutionPreset =
        adminQualityProfile === 'ultra_4k' ? VideoPresets.h2160.resolution :
        adminQualityProfile === 'hd_1080p' ? VideoPresets.h1080.resolution :
        adminQualityProfile === 'standard_480p' ? VideoPresets.h360.resolution :
        VideoPresets.h720.resolution;

      // Additional simulcast layers only (main layer = capture resolution)
      // Avoid absurd 4K layer stacks on phones (mobile already soft-capped to 720p)
      const simulcastLayers =
        adminQualityProfile === 'ultra_4k'
          ? [VideoPresets.h1080, VideoPresets.h720]
          : adminQualityProfile === 'hd_1080p'
          ? [VideoPresets.h720, VideoPresets.h360]
          : adminQualityProfile === 'standard_480p'
          ? [VideoPresets.h180]
          : [VideoPresets.h360, VideoPresets.h180];

      /** Debounce local encoding relief under Poor/Lost (max once per ~8s) */
      let lastEncodingReliefAt = 0;
      const ENCODING_RELIEF_COOLDOWN_MS = 8000;

      const applyLocalEncodingRelief = async (room: Room) => {
        const now = Date.now();
        if (now - lastEncodingReliefAt < ENCODING_RELIEF_COOLDOWN_MS) return;
        lastEncodingReliefAt = now;
        try {
          const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
          const sender = (pub?.track as LocalVideoTrack | undefined)?.sender;
          if (!sender || typeof sender.getParameters !== 'function') return;
          const params = sender.getParameters();
          if (!params.encodings?.length) return;
          let changed = false;
          for (const enc of params.encodings) {
            if (typeof enc.maxBitrate === 'number' && enc.maxBitrate > 0) {
              const next = Math.max(400_000, Math.floor(enc.maxBitrate * 0.65));
              if (next < enc.maxBitrate) {
                enc.maxBitrate = next;
                changed = true;
              }
            }
            if (typeof enc.maxFramerate === 'number' && enc.maxFramerate > 24) {
              enc.maxFramerate = 24;
              changed = true;
            }
          }
          if (changed) await sender.setParameters(params);
        } catch {
          // Best-effort only — adaptiveStream/simulcast still handle subscriber side
        }
      };

      try {
        setIsPreviewOnly(false);
        setConnectionStatusText('Registering call room…');

        // Ensure call_logs row exists before token (Vercel membership check)
        const ensureCallSynced = async () => {
          try {
            const syncRes = await authFetch('/api/calls/sync', {
              method: 'POST',
              body: JSON.stringify({
                callId: activeCall!.id,
                callerId: activeCall!.callerId,
                receiverId: activeCall!.receiverId,
                status: 'active',
                startTime: new Date(activeCall!.startTime || Date.now()).toISOString(),
              }),
              signal: abortController.signal,
            });
            return syncRes.ok;
          } catch {
            return false;
          }
        };
        let syncedOk = await ensureCallSynced();
        if (!syncedOk) {
          await new Promise((r) => setTimeout(r, 600));
          syncedOk = await ensureCallSynced();
        }
        if (!isMounted || abortController.signal.aborted) return;
        if (!syncedOk) {
          await enablePreviewOnly(
            'Could not register this call on the server. Hang up and try again.'
          );
          return;
        }

        setConnectionStatusText('Fetching LiveKit access token…');

        const fetchToken = async () => {
          const tokenRes = await authFetch('/api/livekit/token', {
            method: 'POST',
            body: JSON.stringify({
              roomName: activeCall!.id,
              name: currentUser.name,
            }),
            signal: abortController.signal,
          });
          let data: any = null;
          try {
            data = await tokenRes.json();
          } catch {
            data = null;
          }
          return { tokenRes, data };
        };

        // Retry — Accept sync / profile-id race may land after UI flips to active
        let { tokenRes, data } = await fetchToken();
        const shouldRetryToken = () =>
          !tokenRes.ok ||
          !data?.configured ||
          !data?.token ||
          !data?.wsUrl ||
          tokenRes.status === 403 ||
          tokenRes.status === 404 ||
          tokenRes.status === 409;
        for (const delayMs of [500, 900, 1400]) {
          if (!shouldRetryToken()) break;
          if (tokenRes.status === 409) break; // call ended — no point retrying
          if (tokenRes.status === 403 || data?.code === 'NOT_CALL_MEMBER') {
            await ensureCallSynced();
          }
          await new Promise((r) => setTimeout(r, delayMs));
          if (!isMounted || abortController.signal.aborted) return;
          ({ tokenRes, data } = await fetchToken());
        }

        if (!isMounted || abortController.signal.aborted) return;

        if (!tokenRes.ok) {
          const detailReason =
            data?.detail?.reason === 'call_row_missing'
              ? ' Call was not saved — check /api/calls/sync on the server.'
              : '';
          const msg =
            (typeof data?.error === 'string' ? data.error : null) ||
            (tokenRes.status === 403
              ? 'Not authorized for this call room'
              : tokenRes.status === 404
              ? 'Call room not found'
              : tokenRes.status === 409
              ? 'This call has already ended'
              : 'Failed to get LiveKit token');
          await enablePreviewOnly(msg + detailReason);
          return;
        }

        const wsUrl = String(data?.wsUrl || '').trim();
        const wsOk =
          Boolean(data?.configured) &&
          Boolean(data?.token) &&
          Boolean(wsUrl) &&
          !wsUrl.includes('your-livekit') &&
          (wsUrl.startsWith('wss://') || wsUrl.startsWith('ws://'));

        if (!wsOk) {
          await enablePreviewOnly(
            data?.message ||
              'LiveKit is not configured on the server (missing LIVEKIT_URL / API key)'
          );
          return;
        }

        setLiveKitConfigured(true);
        setConnectionStatusText('Preparing LiveKit connection…');

        const room = new Room({
          adaptiveStream,
          dynacast,
          disconnectOnPageLeave: true,
          stopLocalTrackOnUnpublish: true,
          videoCaptureDefaults: {
            resolution: resolutionPreset,
            facingMode: facingModeRef.current,
          },
          audioCaptureDefaults: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
          publishDefaults: {
            simulcast: enableSimulcast,
            videoSimulcastLayers: enableSimulcast ? simulcastLayers : undefined,
            videoCodec: preferredCodec as any,
            backupCodec: { codec: 'vp8' },
            forceStereo: false,
            dtx: true,
            videoEncoding: {
              maxBitrate,
              maxFramerate,
            },
            // Prefer smooth calls under congestion; sharpness recovers when bandwidth allows
            degradationPreference: 'maintain-framerate',
          },
        });

        liveKitRoomRef.current = room;

        const baseStatus =
          adminQualityProfile === 'ultra_4k' ? 'LiveKit 4K' :
          adminQualityProfile === 'hd_1080p' ? 'LiveKit 1080p' :
          adminQualityProfile === 'high_720p' ? 'LiveKit 720p' :
          'LiveKit 480p';

        /**
         * Start coin burn when the call is truly live:
         * 1) Peer already/joined in the LiveKit room (preferred)
         * 2) Fallback: local room connected + call already accepted — peer may arrive a moment later
         */
        const markBillingReady = (reason: string) => {
          if (!isMounted || billingMarked) return;
          billingMarked = true;
          if (billingFallbackTimer != null) {
            clearTimeout(billingFallbackTimer);
            billingFallbackTimer = null;
          }
          console.info('[LiveKit] mediaConnected / billing ready:', reason, billingCallId);
          markCallMediaConnectedRef.current(billingCallId);
        };

        const tryMarkBillingReady = (opts?: { allowWithoutPeer?: boolean }) => {
          if (!isMounted || billingMarked) return;
          if (room.remoteParticipants.size >= 1) {
            markBillingReady('peer-in-room');
            return;
          }
          if (opts?.allowWithoutPeer) {
            markBillingReady('local-connected-fallback');
          }
        };

        const scheduleBillingFallback = () => {
          if (billingMarked || billingFallbackTimer != null) return;
          // Peer often joins 1–3s after the first party; don't wait forever.
          billingFallbackTimer = setTimeout(() => {
            billingFallbackTimer = null;
            if (!isMounted || billingMarked) return;
            tryMarkBillingReady({ allowWithoutPeer: true });
          }, 10_000);
        };

        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          void attachRemoteTrack(track);
          // Remote A/V subscribed = peer is live in the room
          tryMarkBillingReady();
        });

        room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          track.detach();
          // Clear last frame so unmute/off doesn't look "frozen forever"
          if (track.kind === Track.Kind.Video && remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
          }
          if (track.kind === Track.Kind.Audio && remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = null;
          }
        });

        room.on(RoomEvent.TrackMuted, (publication, participant) => {
          if (!isMounted || participant.isLocal) return;
          if (publication.kind === Track.Kind.Video || publication.source === Track.Source.Camera) {
            setRemoteCameraOff(true);
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = null;
            }
          }
        });

        room.on(RoomEvent.TrackUnmuted, (publication, participant) => {
          if (!isMounted || participant.isLocal) return;
          if (publication.kind === Track.Kind.Video || publication.source === Track.Source.Camera) {
            setRemoteCameraOff(false);
            if (publication.track) {
              void attachRemoteTrack(publication.track as RemoteTrack);
            }
          }
        });

        room.on(RoomEvent.Reconnecting, () => {
          if (isMounted) setConnectionStatusText('Reconnecting…');
        });

        room.on(RoomEvent.Reconnected, () => {
          if (isMounted) {
            setLiveKitConnected(true);
            setConnectionStatusText(`${baseStatus} · Reconnected`);
            attachExistingRemoteTracks(room);
            tryMarkBillingReady();
            scheduleBillingFallback();
          }
        });

        room.on(RoomEvent.ParticipantConnected, () => {
          if (!isMounted) return;
          setLiveKitConnected(true);
          tryMarkBillingReady();
        });

        room.on(RoomEvent.ParticipantDisconnected, () => {
          // Peer left the LiveKit room — close local call UI if still active
          if (!isMounted) return;
          if (room.remoteParticipants.size === 0) {
            try {
              endCall();
            } catch (e) {
              console.warn('[LiveKit] peer leave → endCall notice', e);
            }
          }
        });

        room.on(RoomEvent.Disconnected, () => {
          if (isMounted) {
            setLiveKitConnected(false);
            setConnectionStatusText('Disconnected from LiveKit');
          }
        });

        room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
          if (!isMounted || !participant.isLocal) return;
          const q = qualityLabel(quality);
          if (q) setConnectionStatusText(`${baseStatus} · ${q}`);
          // Do not disconnect/reconnect on Poor ticks — lightly relieve local encode load
          if (quality === ConnectionQuality.Poor || quality === ConnectionQuality.Lost) {
            void applyLocalEncodingRelief(room);
          }
        });

        // In-call chat fast path: peer receives bubble via LiveKit data (no DB wait)
        room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
          if (!isMounted) return;
          if (topic && topic !== 'incall_chat') return;
          try {
            const raw = new TextDecoder().decode(payload);
            const data = JSON.parse(raw);
            if (data?.type !== 'incall_chat') return;
            const clientTempId = typeof data.clientTempId === 'string' ? data.clientTempId.trim() : '';
            const text = typeof data.text === 'string' ? data.text : '';
            const senderId = typeof data.senderId === 'string' ? data.senderId : '';
            const receiverId = typeof data.receiverId === 'string' ? data.receiverId : '';
            const messageType = data.messageType === 'gift' ? 'gift' : 'text';
            const myId = currentUserIdRef.current;
            if (!clientTempId || !text || !senderId || !receiverId || !myId) return;
            if (senderId === myId) return; // ignore echo
            if (receiverId !== myId && senderId !== myId) return;

            ingestInCallChatPreviewRef.current({
              clientTempId,
              text,
              senderId,
              receiverId,
              messageType,
            });
            // Prefer durable id when Realtime/WS already landed — avoids temp_+UUID twin bubbles
            const existingDurable = chatMessagesRef.current.find(
              (m) =>
                !String(m.id).startsWith('temp_') &&
                m.senderId === senderId &&
                m.receiverId === receiverId &&
                m.text === text
            );
            pushInCallOverlayMessageRef.current(
              existingDurable ? existingDurable.id : clientTempId
            );
            // Auto-open composer so peer can reply (ignore own echo above)
            if (receiverId === myId && senderId !== myId) {
              openInCallChatFromIncomingRef.current();
            }
          } catch (err) {
            console.warn('[LiveKit] incall_chat parse failed:', err);
          }
        });

        // Connect to the room first so the peer call works even if camera permission is denied.
        setConnectionStatusText('Connecting to LiveKit…');
        try {
          await room.prepareConnection(wsUrl, data.token);
        } catch (prepErr) {
          console.warn('[LiveKit] prepareConnection notice:', prepErr);
        }

        await room.connect(wsUrl, data.token, {
          autoSubscribe: true,
        });

        if (!isMounted || abortController.signal.aborted) {
          await room.disconnect();
          return;
        }

        // Late-join / already-published remote tracks
        attachExistingRemoteTracks(room);

        if (isMounted) {
          setLiveKitConnected(true);
          setIsPreviewOnly(false);
          setConnectionStatusText(`${baseStatus} · Connected`);
          // Prefer peer-present; if alone in room, start billing after short fallback
          tryMarkBillingReady();
          scheduleBillingFallback();
        }

        // Capture + publish local media after room join (non-fatal on permission errors)
        let localTracks: LocalTrack[] = [];
        try {
          localTracks = await createLocalTracks({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: 1,
            },
            video: {
              facingMode: facingModeRef.current,
              ...vConstraints,
            },
          });
          localTracksRef.current = localTracks;
        } catch (mediaErr: any) {
          console.warn('[LiveKit] local media unavailable:', mediaErr);
          if (isMounted && showToast) {
            showToast(
              'Camera / Mic blocked',
              mediaErr?.message ||
                'Allow camera and microphone permissions, then toggle them in the call controls.',
              'warning'
            );
          }
        }

        if (!isMounted || abortController.signal.aborted) {
          stopLocalTracks();
          return;
        }

        for (const track of localTracks) {
          if (track.kind === Track.Kind.Video) {
            if (track.mediaStreamTrack) {
              try {
                (track.mediaStreamTrack as any).contentHint = 'motion';
              } catch {
                // contentHint unsupported
              }
            }

            await room.localParticipant.publishTrack(track, {
              name: 'camera',
              simulcast: enableSimulcast,
              videoSimulcastLayers: enableSimulcast ? simulcastLayers : undefined,
              videoCodec: preferredCodec as any,
              backupCodec: { codec: 'vp8' },
              videoEncoding: {
                maxBitrate,
                maxFramerate,
              },
              degradationPreference: 'maintain-framerate',
            });

            if (localVideoRef.current) {
              track.attach(localVideoRef.current);
            }
          } else {
            await room.localParticipant.publishTrack(track);
          }
        }

        if (localTracks.length) {
          await room.localParticipant.setMicrophoneEnabled(micEnabled);
          await room.localParticipant.setCameraEnabled(cameraEnabled);
        }

        // Peer may have joined while we published — re-check before relying on fallback timer
        tryMarkBillingReady();

        if (isMounted) {
          setConnectionStatusText(
            localTracks.length
              ? `${baseStatus} · Connected`
              : `${baseStatus} · Connected (no local camera/mic)`
          );
        }
      } catch (err: any) {
        if (abortController.signal.aborted) return;
        console.warn('LiveKit connection failed:', err);
        stopLocalTracks();
        if (billingFallbackTimer != null) {
          clearTimeout(billingFallbackTimer);
          billingFallbackTimer = null;
        }
        if (liveKitRoomRef.current) {
          try {
            await liveKitRoomRef.current.disconnect();
          } catch {
            // ignore
          }
          liveKitRoomRef.current = null;
        }
        await enablePreviewOnly(err?.message || 'Connection failed');
      }
    }

    initLiveKit();

    return () => {
      isMounted = false;
      abortController.abort();
      if (billingFallbackTimer != null) {
        clearTimeout(billingFallbackTimer);
        billingFallbackTimer = null;
      }
      const room = liveKitRoomRef.current;
      liveKitRoomRef.current = null;
      if (room) {
        try {
          room.removeAllListeners();
          room.disconnect();
        } catch {
          // ignore
        }
      }
      stopLocalTracks();
      clearVideoElements();
      setLiveKitConnected(false);
    };
    // Stable primitive deps — avoid reconnect loops from object identity churn
  }, [
    activeCall?.id,
    activeCall?.status,
    currentUser.name,
    adminQualityProfile,
    effectiveFps,
    effectiveBitrateKbps,
    enableSimulcast,
    adaptiveStream,
    dynacast,
    preferredCodec,
  ]);

  // Handle Mute Mic / Camera Toggles
  useEffect(() => {
    // LiveKit room audio/video mute
    if (liveKitRoomRef.current?.localParticipant) {
      liveKitRoomRef.current.localParticipant.setMicrophoneEnabled(micEnabled);
      liveKitRoomRef.current.localParticipant.setCameraEnabled(cameraEnabled);
    }
    // Local preview-only stream mute (video only; preview has no mic)
    if (localMediaStreamRef.current) {
      localMediaStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = micEnabled));
      localMediaStreamRef.current.getVideoTracks().forEach((t) => (t.enabled = cameraEnabled));
    }
  }, [micEnabled, cameraEnabled]);

  // Reset PiP dock + front camera when a new call session starts
  useEffect(() => {
    if (!activeCall?.id) return;
    setPipPos(null);
    setFacingMode('user');
    facingModeRef.current = 'user';
    setRemoteCameraOff(false);
  }, [activeCall?.id]);

  // Auto-focus in-call chat input as soon as the composer opens
  useEffect(() => {
    if (!showChatDrawer) return;
    const id = window.setTimeout(() => {
      chatInputRef.current?.focus({ preventScroll: true });
    }, 50);
    return () => window.clearTimeout(id);
  }, [showChatDrawer]);

  /** Open composer for a peer message so the receiver can reply immediately. */
  const openInCallChatFromIncoming = useCallback(() => {
    setShowGiftDrawer(false);
    setShowEmojiPicker(false);
    setShowChatDrawer(true);
  }, []);
  openInCallChatFromIncomingRef.current = openInCallChatFromIncoming;

  /** Real front ↔ back camera switch (keeps LiveKit room connected). */
  const flipCamera = useCallback(async () => {
    if (isFlippingCamera) return;
    const next: 'user' | 'environment' = facingModeRef.current === 'user' ? 'environment' : 'user';
    setIsFlippingCamera(true);
    try {
      const soft = getVideoConstraints();
      const videoTrack = localTracksRef.current.find(
        (t) => t.kind === Track.Kind.Video
      ) as LocalVideoTrack | undefined;

      if (videoTrack && typeof videoTrack.restartTrack === 'function') {
        await videoTrack.restartTrack({
          facingMode: next,
          ...soft,
        });
        if (videoTrack.mediaStreamTrack) {
          try {
            (videoTrack.mediaStreamTrack as any).contentHint = 'motion';
          } catch {
            // contentHint unsupported
          }
        }
        if (localVideoRef.current) {
          videoTrack.attach(localVideoRef.current);
        }
      } else if (localMediaStreamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: next }, ...soft },
          audio: false,
        });
        localMediaStreamRef.current.getTracks().forEach((t) => t.stop());
        localMediaStreamRef.current = stream;
        stream.getVideoTracks().forEach((t) => {
          t.enabled = cameraEnabled;
        });
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } else {
        throw new Error('No local video track to flip');
      }

      facingModeRef.current = next;
      setFacingMode(next);
    } catch (err) {
      console.warn('Camera flip failed:', err);
      if (showToast) {
        showToast('Camera Flip', 'Could not switch camera on this device.', 'warning');
      }
    } finally {
      setIsFlippingCamera(false);
    }
  }, [cameraEnabled, isFlippingCamera, isPortrait, adminQualityProfile, effectiveFps, showToast]);

  const clampPipPos = useCallback((left: number, top: number) => {
    const stage = videoStageRef.current;
    const pip = pipRef.current;
    if (!stage || !pip) return { left, top };
    const pad = 8;
    // Keep clear of bottom control chrome overlapping the stage
    const bottomClearance = 88;
    // Keep under call header (≈ --vc-header-offset 3.75rem + gap)
    const headerClearance = 68;
    const maxLeft = Math.max(pad, stage.clientWidth - pip.offsetWidth - pad);
    const maxTop = Math.max(headerClearance, stage.clientHeight - pip.offsetHeight - bottomClearance);
    return {
      left: Math.min(Math.max(pad, left), maxLeft),
      top: Math.min(Math.max(headerClearance, top), maxTop),
    };
  }, []);

  const onPipPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const stage = videoStageRef.current;
    const pip = pipRef.current;
    if (!stage || !pip) return;
    const stageRect = stage.getBoundingClientRect();
    const pipRect = pip.getBoundingClientRect();
    const left = pipPos?.left ?? pipRect.left - stageRect.left;
    const top = pipPos?.top ?? pipRect.top - stageRect.top;
    pipDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origLeft: left,
      origTop: top,
      moved: false,
    };
    pip.setPointerCapture(e.pointerId);
  };

  const onPipPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = pipDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
    if (!drag.moved) return;
    setPipPos(clampPipPos(drag.origLeft + dx, drag.origTop + dy));
  };

  const onPipPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = pipDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    pipDragRef.current = null;
    try {
      pipRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  // In-call transparent chat overlay — live for BOTH peers while call is active.
  // Composer open/close only toggles the input bar; bubbles stay (with TTL rules).
  const pushInCallOverlayMessage = useCallback((id: string) => {
    if (!id) return;
    const now = Date.now();
    const isTemp = id.startsWith('temp_');

    const durableForTemp = (tempId: string) => {
      const mapped = overlayTempToDurableRef.current.get(tempId);
      if (mapped) {
        const row = chatMessagesRef.current.find((m) => m.id === mapped);
        if (row && !String(row.id).startsWith('temp_')) return row;
      }
      const byClientTemp = chatMessagesRef.current.find(
        (m) => m.clientTempId === tempId && !String(m.id).startsWith('temp_')
      );
      if (byClientTemp) return byClientTemp;
      const tempRow = chatMessagesRef.current.find(
        (m) => m.id === tempId || m.clientTempId === tempId
      );
      if (!tempRow) return undefined;
      return chatMessagesRef.current.find(
        (m) =>
          !String(m.id).startsWith('temp_') &&
          m.senderId === tempRow.senderId &&
          m.receiverId === tempRow.receiverId &&
          m.text === tempRow.text
      );
    };

    // Late LiveKit re-push after durable reconcile — never append a second bubble
    if (isTemp) {
      if (overlaySeenIdsRef.current.has(id) || overlayTempToDurableRef.current.has(id)) {
        return;
      }
      const durable = durableForTemp(id);
      if (durable) {
        overlayTempToDurableRef.current.set(id, durable.id);
        overlaySeenIdsRef.current.add(id);
        overlaySeenIdsRef.current.add(durable.id);
        setOverlayEntries((prev) => {
          if (prev.some((e) => e.id === durable.id)) return prev;
          const idx = prev.findIndex((e) => e.id === id);
          if (idx < 0) return prev;
          const next = prev.map((e, i) => (i === idx ? { ...e, id: durable.id } : e));
          const collapsed: typeof prev = [];
          const seen = new Set<string>();
          for (const e of next) {
            if (seen.has(e.id)) continue;
            seen.add(e.id);
            collapsed.push(e);
          }
          return collapsed;
        });
        return;
      }
    }

    setOverlayEntries((prev) => {
      if (prev.some((e) => e.id === id)) {
        overlaySeenIdsRef.current.add(id);
        return prev;
      }

      if (isTemp) {
        const durable = durableForTemp(id);
        if (durable && prev.some((e) => e.id === durable.id)) {
          overlayTempToDurableRef.current.set(id, durable.id);
          overlaySeenIdsRef.current.add(id);
          overlaySeenIdsRef.current.add(durable.id);
          return prev;
        }
        overlayFreshTempAtRef.current.set(id, now);
        overlaySeenIdsRef.current.add(id);
        return [...prev, { id, shownAt: now }];
      }

      // Durable id: upgrade any temp entry for the same logical message
      const tempIds = new Set<string>();
      for (const [t, d] of overlayTempToDurableRef.current) {
        if (d === id) tempIds.add(t);
      }
      for (const m of chatMessagesRef.current) {
        if (m.id === id && m.clientTempId) tempIds.add(m.clientTempId);
      }
      for (const e of prev) {
        if (!e.id.startsWith('temp_')) continue;
        const row = chatMessagesRef.current.find(
          (m) => m.id === id && m.clientTempId === e.id
        );
        if (row) tempIds.add(e.id);
      }

      let changed = false;
      let next = prev.map((e) => {
        if (tempIds.has(e.id)) {
          changed = true;
          overlayTempToDurableRef.current.set(e.id, id);
          overlayFreshTempAtRef.current.delete(e.id);
          overlaySeenIdsRef.current.add(e.id);
          return { ...e, id };
        }
        return e;
      });

      const collapsed: typeof prev = [];
      const seen = new Set<string>();
      for (const e of next) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        collapsed.push(e);
      }
      next = collapsed;

      overlaySeenIdsRef.current.add(id);
      if (next.some((e) => e.id === id)) {
        return changed || next.length !== prev.length ? next : prev;
      }
      return [...next, { id, shownAt: now }];
    });
  }, []);
  pushInCallOverlayMessageRef.current = pushInCallOverlayMessage;

  const removeInCallOverlayMessage = useCallback((id: string) => {
    if (!id) return;
    overlayFreshTempAtRef.current.delete(id);
    overlaySeenIdsRef.current.delete(id);
    overlayTempToDurableRef.current.delete(id);
    const mapped = [...overlayTempToDurableRef.current.entries()].find(([, d]) => d === id);
    if (mapped) overlayTempToDurableRef.current.delete(mapped[0]);
    setOverlayEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const publishInCallChatData = useCallback(
    (payload: {
      clientTempId: string;
      text: string;
      senderId: string;
      receiverId: string;
      messageType: string;
    }) => {
      const room = liveKitRoomRef.current;
      if (!room?.localParticipant || room.state !== ConnectionState.Connected) return false;
      try {
        const bytes = new TextEncoder().encode(
          JSON.stringify({ type: 'incall_chat', ...payload })
        );
        void room.localParticipant.publishData(bytes as Uint8Array<ArrayBuffer>, {
          reliable: true,
          topic: 'incall_chat',
        });
        return true;
      } catch (err) {
        console.warn('[LiveKit] publish incall_chat failed:', err);
        return false;
      }
    },
    []
  );

  /** Fire instant local overlay + LiveKit/WS peer preview, then durable POST (non-blocking). */
  const sendInCallChatNow = useCallback(
    (text: string, messageType: 'text' | 'gift' = 'text') => {
      const trimmed = (text || '').trim();
      if (!trimmed || !activeCall || activeCall.status !== 'active') return;

      const peerId =
        activeCall.callerId === currentUser.id ? activeCall.receiverId : activeCall.callerId;
      const clientTempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Ensure chatMessages has the row in the same tick as overlay (resolve won't miss)
      ingestInCallChatPreview({
        clientTempId,
        text: trimmed,
        senderId: currentUser.id,
        receiverId: peerId,
        messageType,
      });
      // A) Instant sender bubble — do not wait for useEffect / HTTP
      pushInCallOverlayMessage(clientTempId);

      // B) Peer fast path: LiveKit data + WS preview (deduped on peer by clientTempId)
      publishInCallChatData({
        clientTempId,
        text: trimmed,
        senderId: currentUser.id,
        receiverId: peerId,
        messageType,
      });
      notifyInCallChatPreview({
        clientTempId,
        text: trimmed,
        receiverId: peerId,
        messageType,
      });

      // Durable POST — keep input responsive (don't await before clearing)
      void sendMessage(peerId, trimmed, 'English', undefined, messageType, clientTempId).then(
        (result) => {
          if (!result.ok) {
            removeInCallOverlayMessage(clientTempId);
          }
        }
      );
    },
    [
      activeCall,
      currentUser.id,
      ingestInCallChatPreview,
      pushInCallOverlayMessage,
      publishInCallChatData,
      notifyInCallChatPreview,
      sendMessage,
      removeInCallOverlayMessage,
    ]
  );

  useEffect(() => {
    if (!activeCall || activeCall.status !== 'active') {
      setOverlayEntries([]);
      callChatBaselineRef.current = new Set();
      overlaySeenIdsRef.current = new Set();
      overlayFreshTempAtRef.current = new Map();
      overlayTempToDurableRef.current = new Map();
      overlayCallIdRef.current = null;
      return;
    }

    const peerId =
      activeCall.callerId === currentUser.id ? activeCall.receiverId : activeCall.callerId;
    const callStartMs =
      typeof activeCall.startTime === 'number' && activeCall.startTime > 0
        ? activeCall.startTime
        : Date.now();
    const session = chatMessages.filter((m) => {
      const isPair =
        (m.senderId === currentUser.id && m.receiverId === peerId) ||
        (m.senderId === peerId && m.receiverId === currentUser.id);
      if (!isPair) return false;
      // Skip non-chat noise on the video overlay (allow text + gift bubbles)
      if (m.type && m.type !== 'text' && m.type !== 'gift') return false;
      const t = new Date(m.createdAt || m.timestamp).getTime();
      // Include unparseable/optimistic stamps; otherwise only msgs from this call window
      if (Number.isNaN(t)) return true;
      return t >= callStartMs - 5000;
    });
    const sorted = [...session].sort((a, b) => {
      const ta = new Date(a.createdAt || a.timestamp).getTime() || 0;
      const tb = new Date(b.createdAt || b.timestamp).getTime() || 0;
      return ta - tb;
    });

    // First enter this call: baseline existing pair msgs so we only show NEW live traffic
    if (overlayCallIdRef.current !== activeCall.id) {
      overlayCallIdRef.current = activeCall.id;
      callChatBaselineRef.current = new Set(sorted.map((m) => m.id));
      overlaySeenIdsRef.current = new Set();
      overlayFreshTempAtRef.current = new Map();
      overlayTempToDurableRef.current = new Map();
      setOverlayEntries([]);
      return;
    }

    setOverlayEntries((prev) => {
      const isTempId = (id: string) => id.startsWith('temp_');
      const markSeen = (...ids: Array<string | undefined | null>) => {
        for (const id of ids) {
          if (id) overlaySeenIdsRef.current.add(id);
        }
      };
      const collapseById = (entries: typeof prev) => {
        const out: typeof prev = [];
        const seen = new Set<string>();
        for (const e of entries) {
          if (seen.has(e.id)) continue;
          seen.add(e.id);
          out.push(e);
        }
        return out;
      };
      const now = Date.now();

      const findDurableForEntry = (entryId: string) => {
        const byTemp = sorted.find(
          (m) => m.clientTempId === entryId && !isTempId(m.id)
        );
        if (byTemp) return byTemp;
        const byId = sorted.find((m) => m.id === entryId);
        if (byId && !isTempId(byId.id)) return byId;
        // Mapped temp→durable from a prior reconcile / push
        const mapped = overlayTempToDurableRef.current.get(entryId);
        if (mapped) {
          const hit = sorted.find((m) => m.id === mapped);
          if (hit) return hit;
        }
        // Last resort: unmatched durable for this temp (Realtime often omits clientTempId)
        if (!isTempId(entryId)) return undefined;
        const tempRow = sorted.find((m) => m.id === entryId);
        const onOverlay = new Set(prev.map((e) => e.id));
        return sorted.find((m) => {
          if (isTempId(m.id)) return false;
          if (!tempRow) {
            // Temp row already replaced — link via prior map only (handled above)
            return (
              m.senderId === currentUser.id &&
              !onOverlay.has(m.id) &&
              !overlaySeenIdsRef.current.has(m.id)
            );
          }
          const sameLogical =
            m.senderId === tempRow.senderId &&
            m.receiverId === tempRow.receiverId &&
            m.text === tempRow.text &&
            (m.type || 'text') === (tempRow.type || 'text');
          if (!sameLogical) return false;
          // Match durable already on overlay (twin bubble case) OR not yet overlaid
          if (onOverlay.has(m.id)) return true;
          if (overlaySeenIdsRef.current.has(m.id)) return false;
          return true;
        });
      };

      // 1) Reconcile optimistic temp ids → durable server UUIDs (keep same bubble / shownAt)
      let next = prev.map((e) => {
        const durable = findDurableForEntry(e.id);
        if (durable && durable.id !== e.id) {
          markSeen(e.id, durable.id, durable.clientTempId);
          if (isTempId(e.id)) {
            overlayTempToDurableRef.current.set(e.id, durable.id);
            overlayFreshTempAtRef.current.delete(e.id);
          }
          return { ...e, id: durable.id };
        }
        return e;
      });

      // Collapse [uuid, uuid] when temp + durable both remapped to the same id
      next = collapseById(next);

      // Drop dangling temp entries that no longer exist in session and couldn't upgrade —
      // NEVER drop a fresh temp in the grace window (same-tick send / HTTP in flight).
      next = next.filter((e) => {
        if (!isTempId(e.id)) return true;
        const stillInSession = sorted.some((m) => m.id === e.id || m.clientTempId === e.id);
        if (stillInSession) return true;
        const durable = findDurableForEntry(e.id);
        if (durable && !isTempId(durable.id)) {
          return true;
        }
        const freshAt = overlayFreshTempAtRef.current.get(e.id) ?? e.shownAt;
        if (now - freshAt < OVERLAY_TEMP_GRACE_MS) {
          return true; // keep — sendMessage optimistic row may land next tick
        }
        overlaySeenIdsRef.current.delete(e.id);
        overlayFreshTempAtRef.current.delete(e.id);
        return false;
      });

      const known = new Set(next.map((e) => e.id));
      for (const m of sorted) {
        if (m.clientTempId && known.has(m.id)) known.add(m.clientTempId);
        if (m.clientTempId && known.has(m.clientTempId)) known.add(m.id);
      }
      // Temps already mapped to a durable on the overlay count as known
      for (const [tempId, durableId] of overlayTempToDurableRef.current) {
        if (known.has(durableId)) known.add(tempId);
        if (known.has(tempId)) known.add(durableId);
      }

      // Upgrade in place: durable arrived while temp still on overlay (don't append)
      next = next.map((e) => {
        if (!isTempId(e.id)) return e;
        const durable = sorted.find(
          (m) =>
            !isTempId(m.id) &&
            (m.clientTempId === e.id || overlayTempToDurableRef.current.get(e.id) === m.id)
        );
        if (!durable) return e;
        markSeen(e.id, durable.id, durable.clientTempId);
        overlayTempToDurableRef.current.set(e.id, durable.id);
        overlayFreshTempAtRef.current.delete(e.id);
        known.add(durable.id);
        known.add(e.id);
        return { ...e, id: durable.id };
      });
      next = collapseById(next);

      const additions = sorted
        .filter((m) => {
          if (callChatBaselineRef.current.has(m.id)) return false;
          if (known.has(m.id)) return false;
          // Still showing as optimistic temp on overlay — reconcile upgrades; don't duplicate
          if (m.clientTempId && known.has(m.clientTempId)) return false;
          // Durable id already shown or TTL-pruned — never resurrect
          if (overlaySeenIdsRef.current.has(m.id)) return false;
          // Temp already shown / mapped — never add a second bubble for the same logical msg
          if (m.clientTempId && overlaySeenIdsRef.current.has(m.clientTempId)) {
            // Allow only if that temp was never upgraded and is not on overlay (lost) —
            // then upgrade path below via addition of durable is OK only when temp gone.
            const tempStillOnOverlay = next.some((e) => e.id === m.clientTempId);
            if (tempStillOnOverlay) return false;
            // Temp was seen and mapped to something else already
            const mapped = overlayTempToDurableRef.current.get(m.clientTempId);
            if (mapped && (known.has(mapped) || overlaySeenIdsRef.current.has(mapped))) {
              return false;
            }
          }
          return true;
        })
        .map((m) => {
          markSeen(m.id, m.clientTempId);
          if (m.clientTempId) {
            overlayFreshTempAtRef.current.delete(m.clientTempId);
            if (!isTempId(m.id)) {
              overlayTempToDurableRef.current.set(m.clientTempId, m.id);
            }
          }
          return { id: m.id, shownAt: now };
        });

      const merged = collapseById(additions.length === 0 ? next : [...next, ...additions]);
      const hasNewPeerMsg = additions.some((a) => {
        const m = sorted.find((x) => x.id === a.id);
        return Boolean(
          m && m.senderId !== currentUser.id && m.receiverId === currentUser.id
        );
      });
      if (hasNewPeerMsg) {
        // Defer so we don't nest setState from inside overlay updater
        queueMicrotask(() => openInCallChatFromIncomingRef.current());
      }
      if (
        merged.length === prev.length &&
        merged.every((e, i) => e.id === prev[i]?.id)
      ) {
        return prev;
      }
      return merged;
    });
  }, [
    chatMessages,
    activeCall?.id,
    activeCall?.status,
    activeCall?.startTime,
    activeCall?.callerId,
    activeCall?.receiverId,
    currentUser.id,
  ]);

  // Prune overlay every second during active call
  useEffect(() => {
    if (!activeCall || activeCall.status !== 'active') return;
    const prune = () => {
      setOverlayEntries((prev) => {
        if (prev.length === 0) return prev;
        const now = Date.now();
        let next: typeof prev;
        if (showChatDrawer) {
          // Composer open: always keep newest 4; older fade after 30s
          const lastKeepIds = new Set(prev.slice(-OVERLAY_KEEP_COUNT).map((e) => e.id));
          next = prev.filter(
            (e) => lastKeepIds.has(e.id) || now - e.shownAt < OVERLAY_TTL_MS
          );
        } else {
          // Composer closed: all bubbles auto-fade after 30s (still cap to last 4 young ones)
          next = prev
            .filter((e) => now - e.shownAt < OVERLAY_TTL_MS)
            .slice(-OVERLAY_KEEP_COUNT);
        }
        // If a temp id is pruned before reconcile, clear it from seen so durable UUID can show once
        const kept = new Set(next.map((e) => e.id));
        for (const e of prev) {
          if (!kept.has(e.id) && e.id.startsWith('temp_')) {
            overlaySeenIdsRef.current.delete(e.id);
            overlayFreshTempAtRef.current.delete(e.id);
          }
        }
        return next.length === prev.length && next.every((e, i) => e.id === prev[i]?.id)
          ? prev
          : next;
      });
    };
    prune();
    const timer = window.setInterval(prune, 1000);
    return () => window.clearInterval(timer);
  }, [activeCall?.id, activeCall?.status, showChatDrawer]);

  if (!activeCall) return null;

  const otherUserId =
    activeCall.callerId === currentUser.id ? activeCall.receiverId : activeCall.callerId;
  const otherUser = users.find((u) => u.id === otherUserId) || {
    id: otherUserId,
    name: 'User',
    avatarUrl: '',
    gallery: [] as string[],
    countryCode: '',
    nationality: '',
    isVerified: false,
  } as any;

  const isMaleCaller = currentUser.role === 'male_user';
  const isFemaleCaller = currentUser.gender === 'female' || currentUser.role === 'female_creator' || currentUser.role === 'female_host';
  const canEarnCoins = currentUser.role === 'female_creator' || currentUser.role === 'female_host' || Boolean(currentUser.teamLeaderId) || Boolean(systemSettings.enableRegularFemaleCoinEarning);
  // Creators/hosts receive gifts — never show Send Gift for them. Payers (male / regular female / etc.)
  // only see it when the peer is a gift-eligible creator/host.
  const iAmInCallGiftReceiver =
    isFemaleCreatorRole(currentUser.role) || Boolean(currentUser.teamLeaderId);
  const peerIsInCallGiftReceiver =
    isFemaleCreatorRole(otherUser.role) || Boolean(otherUser.teamLeaderId);
  const showInCallGiftButton = !iAmInCallGiftReceiver && peerIsInCallGiftReceiver;
  const currentRatePerMin = getEffectiveCallRate(otherUserId, currentUser.id);

  // Exact 1-Minute Warning & Low Balance Calculations (initiator only, after billing started)
  const tickDuration = 60;
  const isCallInitiator = currentUser.id === activeCall.callerId;
  const currentMinuteEndSeconds = (activeCall.billedMinutes || 1) * tickDuration;
  const secondsLeftInCurrentMinute = Math.max(0, currentMinuteEndSeconds - activeCall.durationSeconds);
  const affordableFutureMinutes = Math.floor((currentUser.coinBalance || 0) / currentRatePerMin);
  const totalSecondsRemaining = secondsLeftInCurrentMinute + (affordableFutureMinutes * tickDuration);

  // Single once-per-call recharge toast for the call initiator (no banner/pill stack)
  const isFinalMinuteWarning =
    isCallInitiator &&
    Boolean(activeCall.mediaConnected) &&
    totalSecondsRemaining <= tickDuration;

  const hasAlertedRef = useRef(false);
  const rechargeWarnCallIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeCall?.id) {
      hasAlertedRef.current = false;
      rechargeWarnCallIdRef.current = null;
      return;
    }
    if (rechargeWarnCallIdRef.current !== activeCall.id) {
      rechargeWarnCallIdRef.current = activeCall.id;
      hasAlertedRef.current = false;
    }
    if (isFinalMinuteWarning && !hasAlertedRef.current) {
      hasAlertedRef.current = true;
      if (showToast) {
        showToast(
          'Low coins',
          `About ${totalSecondsRemaining}s left — please recharge to continue.`,
          'warning'
        );
      }
    }
  }, [activeCall?.id, isFinalMinuteWarning, totalSecondsRemaining, showToast]);

  // Format MM:SS
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleSendGift = (giftId: string) => {
    const gift = virtualGifts.find((g) => g.id === giftId);
    if (!gift) return;

    const success = sendGiftInCall(giftId);
    if (!success) return;

    setShowGiftDrawer(false);
    setActiveGiftAnim({
      name: gift.name,
      icon: gift.icon,
      type: gift.animationType,
      cost: gift.coinCost,
    });

    // Instant overlay + LiveKit/WS peer + durable gift bubble
    sendInCallChatNow(`${gift.icon} ${gift.name}`, 'gift');
  };

  const clearGiftAnim = useCallback(() => {
    setActiveGiftAnim(null);
  }, []);

  const handleSendInCallChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInputText.trim()) return;
    const text = chatInputText;
    setChatInputText('');
    setShowEmojiPicker(false);
    sendInCallChatNow(text, 'text');
  };

  const handlePickInCallEmoji = (emoji: string) => {
    setShowEmojiPicker(false);
    sendInCallChatNow(emoji, 'text');
  };

  const closeInCallChat = () => {
    setShowChatDrawer(false);
    setShowEmojiPicker(false);
    setChatInputText('');
    // Do NOT clear overlayEntries — peer bubbles must stay live during the call
  };

  const toggleInCallChat = () => {
    if (showChatDrawer) {
      closeInCallChat();
    } else {
      setShowGiftDrawer(false);
      setShowEmojiPicker(false);
      setShowChatDrawer(true);
    }
  };

  const toggleGiftDrawer = () => {
    if (showGiftDrawer) {
      setShowGiftDrawer(false);
    } else {
      closeInCallChat();
      setShowGiftDrawer(true);
    }
  };

  // Filter messages for current call session
  const sessionMessages = chatMessages.filter(
    (m) =>
      (m.senderId === currentUser.id && m.receiverId === otherUser.id) ||
      (m.senderId === otherUser.id && m.receiverId === currentUser.id)
  );

  // Resolve overlay entries → message objects (left stack, oldest→newest).
  // Dedupe by durable message id so temp_+UUID never paint as two bubbles.
  const overlayMessages = (() => {
    const seenMsgIds = new Set<string>();
    const out: Array<{ id: string; shownAt: number; msg: (typeof sessionMessages)[number] }> = [];
    for (const entry of overlayEntries) {
      const msg =
        sessionMessages.find((m) => m.id === entry.id) ||
        sessionMessages.find((m) => m.clientTempId === entry.id);
      if (!msg) continue;
      const logicalId = msg.id.startsWith('temp_')
        ? msg.clientTempId || msg.id
        : msg.id;
      if (seenMsgIds.has(logicalId)) continue;
      if (msg.clientTempId && seenMsgIds.has(msg.clientTempId)) continue;
      seenMsgIds.add(logicalId);
      if (msg.clientTempId) seenMsgIds.add(msg.clientTempId);
      seenMsgIds.add(msg.id);
      out.push({ id: msg.id, shownAt: entry.shownAt, msg });
    }
    return out;
  })();

  // ==========================================
  // RINGING SCREEN (INCOMING / OUTGOING CALL)
  // ==========================================
  if (activeCall.status === 'ringing') {
    const selfIds = new Set(
      [currentUser.id, currentUser.authId].map((id) => String(id || '').trim()).filter(Boolean)
    );
    const callerId = String(activeCall.callerId || '').trim();
    // Incoming Accept UI whenever we did not place the call (covers profile↔auth id aliases)
    const isReceiver = !selfIds.has(callerId);

    const displayName = String(otherUser.name || 'User').trim() || 'User';
    const callPicture = otherUser.avatarUrl || otherUser.gallery?.[0] || '';
    const age = Number(otherUser.age);
    const showAge = Number.isFinite(age) && age > 0;
    const showFlag = Boolean(otherUser.countryCode || otherUser.nationality);

    return (
      <div
        id="video-call-ringing-overlay"
        className="fixed inset-0 z-[10050] bg-app flex flex-col items-center justify-center text-center
          pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]
          pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]"
      >
        <p className="text-brand text-sm font-medium">
          {isReceiver ? 'Incoming call' : 'Calling'}
        </p>

        <div className="mt-6 w-36 h-36 rounded-full overflow-hidden border border-app bg-app-card shrink-0">
          {callPicture ? (
            <img
              src={callPicture}
              alt={displayName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-app-heading text-3xl font-medium" aria-hidden>
              {displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-center gap-2 min-w-0 max-w-full px-4">
          <h2 className="font-display text-[1.375rem] font-medium text-app-heading truncate">
            {displayName}
          </h2>
          {showAge && (
            <span className="text-app-muted text-base shrink-0">{age}</span>
          )}
          {showFlag && (
            <SvgFlag
              countryCode={otherUser.countryCode}
              nationality={otherUser.nationality}
              size="sm"
              shadow={false}
              className="shrink-0"
            />
          )}
        </div>

        <div className={`mt-10 flex items-start justify-center ${isReceiver ? 'gap-14' : ''}`}>
          <button
            type="button"
            onClick={rejectCall}
            className="flex flex-col items-center gap-2 transition-transform active:scale-95"
            aria-label="Cut"
          >
            <span className="w-16 h-16 rounded-full bg-[#E11D48] text-white flex items-center justify-center">
              <PhoneOff className="w-7 h-7" />
            </span>
            <span className="text-xs font-medium text-app-muted">Cut</span>
          </button>

          {isReceiver && (
            <button
              type="button"
              onClick={acceptCall}
              className="flex flex-col items-center gap-2 transition-transform active:scale-95"
              aria-label="Receive"
            >
              <span className="w-16 h-16 rounded-full bg-[#10B981] text-white flex items-center justify-center">
                <Phone className="w-7 h-7" />
              </span>
              <span className="text-xs font-medium text-app-muted">Receive</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // ==========================================
  // ACTIVE WEBRTC VIDEO CALL STUDIO
  // ==========================================
  return (
    <div
      id="video-call-studio-overlay"
      className="call-cinema-dark fixed inset-0 z-[10050] bg-slate-950 flex flex-col overflow-hidden selection:bg-pink-500 selection:text-white"
      onContextMenu={protectScreen ? (e) => e.preventDefault() : undefined}
      style={{
        // Shared chrome metrics so PiP / drawers / floaters clear the control bar + home indicator
        ['--vc-safe-top' as string]: 'env(safe-area-inset-top, 0px)',
        ['--vc-safe-bottom' as string]: 'env(safe-area-inset-bottom, 0px)',
        ['--vc-controls-h' as string]: '5rem',
        ['--vc-composer-h' as string]: showChatDrawer ? '3.5rem' : '0px',
        ['--vc-float-bottom' as string]:
          'calc(var(--vc-controls-h) + var(--vc-safe-bottom) + 0.5rem + var(--vc-composer-h))',
        ['--vc-header-offset' as string]: 'calc(3.75rem + var(--vc-safe-top))',
        ['--vc-drawer-bottom' as string]:
          'calc(var(--vc-controls-h) + var(--vc-safe-bottom))',
      }}
    >
      {/* Hidden WebRTC Audio Element */}
      <audio ref={remoteAudioRef} autoPlay />
      {protectScreen && screenCovered && (
        <div className="absolute inset-0 z-[80] bg-slate-950 flex items-center justify-center text-slate-300 text-sm font-semibold">
          Video hidden while this tab is in the background
        </div>
      )}

      {/* Top Header Controls Bar */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between gap-2 min-w-0
        pt-[max(0.75rem,env(safe-area-inset-top))] pb-3
        pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]
        sm:pt-[max(1rem,env(safe-area-inset-top))] sm:pb-4
        bg-gradient-to-b from-slate-950/95 via-slate-950/60 to-transparent">
        {/* User Info & Verified Badge */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="relative shrink-0">
            <img
              src={otherUser.avatarUrl}
              alt={otherUser.name}
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-full object-cover ring-2 ring-pink-500 shadow-lg"
            />
            <span className="absolute -top-0.5 -left-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-slate-950" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-white min-w-0">
              <h3 className="font-black text-xs sm:text-sm truncate max-w-[7rem] sm:max-w-[10rem] md:max-w-none">{otherUser.name}</h3>
              {otherUser.isVerified && <span className="text-blue-400 text-xs font-bold shrink-0">✓</span>}
              <span className="hidden sm:inline-flex shrink-0">
                <SvgFlag countryCode={otherUser.countryCode} nationality={otherUser.nationality} size="sm" />
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono min-w-0">
              <span className={`flex items-center gap-1 font-bold truncate ${
                liveKitConnected
                  ? 'text-emerald-400'
                  : isPreviewOnly
                  ? 'text-amber-400'
                  : 'text-slate-400'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  liveKitConnected
                    ? 'bg-emerald-400 animate-ping'
                    : isPreviewOnly
                    ? 'bg-amber-400'
                    : 'bg-slate-500 animate-pulse'
                }`} />
                <span className="truncate max-w-[9rem] sm:max-w-none">{connectionStatusText}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Host session earnings — updates from burn / call_logs (coins_earned) */}
        {currentUser.id === activeCall.receiverId && canEarnCoins ? (
          <div
            className="flex items-center gap-1.5 bg-app-card/90 border border-app backdrop-blur-md px-2.5 sm:px-3 py-1.5 rounded-app shadow-app-sm shrink-0"
            title="Coins earned this call (updates each billed minute)"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 text-xs font-ticker font-bold tabular-nums">
              +{Math.max(0, Math.round(activeCall.coinsEarned || 0))} 🪙
            </span>
            <span className="hidden sm:inline text-[9px] text-app-muted font-medium">this call</span>
          </div>
        ) : (
          <div className="shrink-0 w-0 sm:w-auto" aria-hidden />
        )}

        {/* Right Badges & Screen Protection & Quality Setting */}
        <div className="flex items-center gap-1.5 sm:gap-2 font-mono shrink-0 min-w-0">
          {/* Admin Managed Quality Indicator Badge — icon-only on narrow phones */}
          <div
            className="flex items-center gap-1.5 bg-app-card/90 border border-app backdrop-blur-md p-1.5 sm:px-2.5 sm:py-1 rounded-app text-[10px] text-brand shadow-app-sm"
            title={
              adminQualityProfile === 'ultra_4k' ? '4K Ultra HD' :
              adminQualityProfile === 'hd_1080p' ? '1080p Full HD' :
              adminQualityProfile === 'standard_480p' ? '480p SD' :
              '720p HD'
            }
          >
            <Layers className="w-3.5 h-3.5 text-pink-400 sm:hidden" />
            <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse hidden sm:inline-block" />
            <span className="font-bold uppercase hidden sm:inline">
              {adminQualityProfile === 'ultra_4k' ? '4K Ultra HD' :
               adminQualityProfile === 'hd_1080p' ? '1080p Full HD' :
               adminQualityProfile === 'standard_480p' ? '480p SD' :
               '720p HD'}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 bg-app-card/90 border border-app backdrop-blur-md px-2.5 py-1 rounded-app text-[10px] text-app-muted shadow-app-sm">
            <Users className="w-3 h-3 text-pink-400" />
            <span className="font-bold">2 in Room</span>
          </div>

          <button
            onClick={() => setPrivacyBlurActive(!privacyBlurActive)}
            className={`p-1.5 sm:px-2.5 sm:py-1 rounded-xl border text-[10px] font-bold flex items-center gap-1 transition-all ${privacyBlurActive
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                : 'bg-[#161920] text-slate-400 border-slate-800 hover:text-white'
              }`}
            title="Toggle privacy blur on remote video"
            aria-label="Toggle privacy blur"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden md:inline">Privacy blur {privacyBlurActive ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </div>

      {/* Safety Warning Notification Banner */}
      {activeCall.warningMessage && (
        <div
          className="absolute left-4 right-4 z-40 bg-amber-950/90 border border-amber-500/60 backdrop-blur-md px-4 py-2.5 rounded-2xl text-amber-200 text-xs flex items-center justify-between shadow-2xl animate-fade-in font-sans"
          style={{ top: 'var(--vc-header-offset)' }}
        >
          <div className="flex items-center space-x-2.5 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="min-w-0">
              <strong className="text-amber-300 font-bold">Safety Advisory:</strong> {activeCall.warningMessage}
            </span>
          </div>
        </div>
      )}

      {/* Main Video Stream Canvas */}
      <div
        ref={videoStageRef}
        className="relative flex-1 bg-slate-950 flex items-center justify-center overflow-hidden"
      >
        {/* Remote Video Track or High Quality Feed */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={`w-full h-full object-cover transition-all duration-300 ${
            remoteCameraOff ? 'opacity-0' : ''
          } ${privacyBlurActive ? 'blur-2xl scale-110 opacity-60' : ''
            }`}
          style={{
            imageRendering: 'auto',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
          }}
          poster={otherUser.gallery[0] || otherUser.avatarUrl}
        />

        {/* Fallback image if remote video track is not publishing */}
        <img
          src={otherUser.gallery[0] || otherUser.avatarUrl}
          alt="Remote Stream"
          className={`absolute inset-0 w-full h-full object-cover transition-all duration-300 -z-10 ${privacyBlurActive ? 'blur-2xl scale-110 opacity-60' : ''
            }`}
        />

        {remoteCameraOff && !privacyBlurActive && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/90 text-center space-y-2">
            <VideoOff className="w-12 h-12 text-slate-500" />
            <span className="text-sm font-semibold text-slate-300">Camera off</span>
            <span className="text-[11px] text-slate-500">{otherUser.name} turned off their camera</span>
          </div>
        )}

        {/* Privacy blur overlay (manual — not ML moderation) */}
        {privacyBlurActive && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-slate-950/70 text-center space-y-3 backdrop-blur-md">
            <ShieldAlert className="w-16 h-16 text-amber-400 animate-bounce" />
            <h3 className="text-xl font-bold text-white">Privacy blur on</h3>
            <p className="text-xs text-slate-300 max-w-sm">
              Remote video is manually blurred for privacy. This is not automated content moderation.
            </p>
            <button
              onClick={() => setPrivacyBlurActive(false)}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-colors"
            >
              Turn off blur
            </button>
          </div>
        )}

        {isPreviewOnly && (
          <div
            className="absolute left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 rounded-full bg-amber-950/90 border border-amber-500/50 text-[10px] font-bold text-amber-200 whitespace-nowrap max-w-[calc(100%-2rem)] truncate"
            style={{ top: 'calc(var(--vc-header-offset) + 0.25rem)' }}
          >
            Preview only — LiveKit unavailable (not a live 2-party call)
          </div>
        )}

        {/* PIP Local User Camera Preview — draggable within the stage */}
        <div
          ref={pipRef}
          onPointerDown={onPipPointerDown}
          onPointerMove={onPipPointerMove}
          onPointerUp={onPipPointerUp}
          onPointerCancel={onPipPointerUp}
          className="absolute z-20 w-28 h-40 sm:w-36 sm:h-52 lg:w-40 lg:h-56 bg-slate-900 rounded-2xl border-2 border-slate-800 overflow-hidden shadow-2xl touch-none cursor-grab active:cursor-grabbing select-none"
          style={
            pipPos
              ? { left: pipPos.left, top: pipPos.top }
              : {
                  // Default dock: top-right, just under the call header
                  top: 'calc(var(--vc-header-offset) + 0.35rem)',
                  right: 'max(1rem, env(safe-area-inset-right, 0px))',
                }
          }
          title="Drag to move your preview"
        >
          {cameraEnabled ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover pointer-events-none ${
                facingMode === 'user' ? 'scale-x-[-1]' : ''
              }`}
              style={{
                imageRendering: 'auto',
                transform: facingMode === 'user' ? 'scaleX(-1) translateZ(0)' : 'translateZ(0)',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
              }}
            />
          ) : (
            <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center text-slate-500 pointer-events-none">
              <VideoOff className="w-7 h-7 mb-1 text-slate-600" />
              <span className="text-[10px] font-mono">Camera Off</span>
            </div>
          )}

          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between bg-slate-950/80 px-2 py-1 rounded-xl backdrop-blur-sm">
            <span className="text-[10px] text-white font-semibold pointer-events-none">
              {isPreviewOnly ? 'Preview' : 'You'}
            </span>
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void flipCamera();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={isFlippingCamera}
                className="text-slate-400 hover:text-white disabled:opacity-50"
                title={facingMode === 'user' ? 'Switch to rear camera' : 'Switch to front camera'}
                aria-label="Flip camera"
              >
                <RefreshCw className={`w-3 h-3 ${isFlippingCamera ? 'animate-spin' : ''}`} />
              </button>
              {!micEnabled && <MicOff className="w-3 h-3 text-rose-400" />}
            </div>
          </div>
        </div>
      </div>

      {/* Mega Gift Drawer Overlay */}
      {showInCallGiftButton && showGiftDrawer && (
        <div
          className="absolute left-0 right-0 z-40 bg-slate-900/95 border-t border-slate-800 backdrop-blur-xl p-4 shadow-2xl animate-in slide-in-from-bottom duration-300"
          style={{ bottom: 'var(--vc-drawer-bottom)' }}
        >
          <div className="max-w-xl mx-auto space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center space-x-2">
                <Gift className="w-4 h-4 text-pink-400" />
                <h4 className="font-extrabold text-xs text-white">Send Animated Mega Gift</h4>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-xs font-bold text-amber-300">Balance: {currentUser.coinBalance} 🪙</span>
                <button
                  onClick={() => setShowGiftDrawer(false)}
                  className="p-1 text-slate-400 hover:text-white"
                  aria-label="Close gift drawer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Gift Grid */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 max-h-[40vh] overflow-y-auto">
              {virtualGifts.map((gift) => (
                <button
                  key={gift.id}
                  onClick={() => handleSendGift(gift.id)}
                  className="p-3 bg-slate-950/80 hover:bg-slate-800 border border-slate-800 hover:border-pink-500/50 rounded-2xl flex flex-col items-center text-center transition-all group"
                >
                  <span className="text-3xl mb-1 group-hover:scale-125 transition-transform">{gift.icon}</span>
                  <span className="text-[11px] font-bold text-slate-200 truncate">{gift.name}</span>
                  <span className="text-[10px] text-amber-400 font-extrabold mt-0.5">🪙 {gift.coinCost}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Transparent in-call chat overlay — mobile 50% left; sm+ 70% centered */}
      {overlayMessages.length > 0 && (
        <div
          className="absolute z-[25] pointer-events-none flex flex-col justify-end gap-1.5
            left-[max(0.5rem,env(safe-area-inset-left,0px))] w-[50%] max-w-[50vw]
            sm:left-1/2 sm:-translate-x-1/2 sm:w-[70%] sm:max-w-[70vw]"
          style={{
            top: 'var(--vc-header-offset)',
            bottom: 'calc(var(--vc-drawer-bottom) + var(--vc-composer-h) + 0.5rem)',
          }}
          aria-live="polite"
        >
          {overlayMessages.map(({ id, msg }) => {
            const isMine = msg.senderId === currentUser.id;
            const isPending = isMine && String(msg.id).startsWith('temp_');
            const isGift = msg.type === 'gift';
            const giftMatch = isGift
              ? (msg.text || '').match(/^(\S+)\s+(.+)$/)
              : null;
            const giftIcon =
              (isGift && msg.giftInfo?.icon) ||
              (giftMatch ? giftMatch[1] : isGift ? '🎁' : '');
            const giftName =
              (isGift && msg.giftInfo?.name) ||
              (giftMatch ? giftMatch[2].replace(/\s*[·•].*$/, '').replace(/\s*\d+\s*🪙.*$/, '').trim() : '') ||
              (isGift ? 'Gift' : '');
            return (
              <div
                key={id}
                className={`w-full flex ${isMine ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-200 ${
                  isPending ? 'opacity-75' : 'opacity-100'
                }`}
              >
                <div
                  className={`px-2.5 py-1.5 rounded-2xl text-xs text-white shadow-lg max-w-[95%]
                    line-clamp-4 break-words [text-shadow:0_1px_2px_rgba(0,0,0,0.55)]
                    ${isMine
                      ? 'bg-pink-600/70 backdrop-blur-sm rounded-br-md'
                      : 'bg-black/45 backdrop-blur-sm border border-white/10 rounded-bl-md'
                    }`}
                >
                  {isGift ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="text-2xl sm:text-3xl leading-none drop-shadow-md" aria-hidden>
                        {giftIcon}
                      </span>
                      <span className="font-semibold text-sm">{giftName}</span>
                    </span>
                  ) : (
                    msg.text
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Sliding translucent composer — mobile 95%; sm+ 90% */}
      {showChatDrawer && (
        <div
          className="absolute z-40 pointer-events-auto left-1/2 -translate-x-1/2
            w-[95%] max-w-[95vw] sm:w-[90%] sm:max-w-[90vw]
            bg-slate-950/70 backdrop-blur-md border border-white/10 rounded-2xl
            px-2.5 py-2 shadow-xl
            animate-in slide-in-from-bottom duration-300"
          style={{ bottom: 'var(--vc-drawer-bottom)' }}
        >
          {/* Emoji picker popover */}
          {showEmojiPicker && (
            <div
              className="absolute left-0 right-0 bottom-full mb-2
                p-2 rounded-2xl bg-slate-950/90 backdrop-blur-md border border-white/15 shadow-2xl
                grid grid-cols-8 gap-1 max-h-40 overflow-y-auto"
              role="listbox"
              aria-label="Emoji picker"
            >
              {IN_CALL_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handlePickInCallEmoji(emoji)}
                  className="h-8 w-full text-lg rounded-lg hover:bg-white/10 active:scale-95 transition-transform"
                  title={`Send ${emoji}`}
                  aria-label={`Send ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handleSendInCallChat} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowEmojiPicker((v) => !v)}
              className={`p-2 rounded-xl border shrink-0 transition-colors ${
                showEmojiPicker
                  ? 'bg-pink-600/30 border-pink-400/50 text-pink-200'
                  : 'bg-slate-900/50 border-white/10 text-slate-300 hover:text-white'
              }`}
              aria-label="Open emoji picker"
              aria-expanded={showEmojiPicker}
              title="Emoji"
            >
              <Smile className="w-4 h-4" />
            </button>
            <input
              ref={chatInputRef}
              type="text"
              placeholder="Message…"
              value={chatInputText}
              onChange={(e) => setChatInputText(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2 bg-slate-950/60 border border-white/15 rounded-xl text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-pink-500/70"
              autoComplete="off"
              autoFocus
            />
            <button
              type="submit"
              className="p-2 bg-pink-600/90 hover:bg-pink-500 text-white rounded-xl shrink-0"
              aria-label="Send message"
              title="Send"
            >
              <Send className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={closeInCallChat}
              className="p-2 text-slate-300 hover:text-white bg-slate-900/50 border border-white/10 rounded-xl shrink-0"
              aria-label="Close chat"
              title="Close chat"
            >
              <X className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Bottom Floating Control Island */}
      <div
        className="absolute bottom-0 left-0 right-0 z-30
        flex items-center justify-center
        pt-3
        pb-[max(0.75rem,env(safe-area-inset-bottom))]
        pl-[max(0.5rem,env(safe-area-inset-left))]
        pr-[max(0.5rem,env(safe-area-inset-right))]
        pointer-events-none
        bg-gradient-to-t from-black/70 via-black/20 to-transparent"
      >
        <div className="pointer-events-auto flex items-center gap-2 sm:gap-3 px-2.5 py-2 rounded-full bg-[#09090C]/75 backdrop-blur-xl border border-white/10 shadow-app-lg">
        {/* Mic Toggle Button */}
        <button
          onClick={() => setMicEnabled(!micEnabled)}
          className={`p-3 rounded-full border transition-all shrink-0 ${micEnabled
              ? 'bg-white/10 text-white border-white/10 hover:bg-white/15'
              : 'bg-[#E11D48] text-white border-transparent'
            }`}
          title={micEnabled ? 'Mute Microphone' : 'Unmute Microphone'}
          aria-label={micEnabled ? 'Mute Microphone' : 'Unmute Microphone'}
        >
          {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </button>

        {/* Camera Toggle Button */}
        <button
          onClick={() => setCameraEnabled(!cameraEnabled)}
          className={`p-3 rounded-full border transition-all shrink-0 ${cameraEnabled
              ? 'bg-white/10 text-white border-white/10 hover:bg-white/15'
              : 'bg-[#E11D48] text-white border-transparent'
            }`}
          title={cameraEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
          aria-label={cameraEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
        >
          {cameraEnabled ? <VideoIcon className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>

        {/* Flip Camera Button — real front ↔ back */}
        <button
          onClick={() => void flipCamera()}
          disabled={isFlippingCamera}
          className="p-3 rounded-full bg-white/10 text-white border border-white/10 hover:bg-white/15 transition-colors shrink-0 disabled:opacity-50 hidden sm:inline-flex"
          title={facingMode === 'user' ? 'Switch to rear camera' : 'Switch to front camera'}
          aria-label="Flip camera"
        >
          <RefreshCw className={`w-5 h-5 ${isFlippingCamera ? 'animate-spin' : ''}`} />
        </button>

        {/* Single call clock (seconds) */}
        <div className="px-3 sm:px-4 py-2 rounded-full glass-pill flex flex-col items-center min-w-[5.5rem]">
          <span className="font-ticker font-bold text-base text-white leading-none tabular-nums">
            {formatTime(activeCall.durationSeconds || 0)}
          </span>
          <span className="font-ticker text-[9px] text-amber-300 mt-0.5 leading-none">
            {currentRatePerMin}/m
          </span>
        </div>

        {/* Send Gift Button — payers only, when peer is creator/host */}
        {showInCallGiftButton && (
          <button
            id="incall-send-gift-btn"
            onClick={toggleGiftDrawer}
            className={`p-3 rounded-full bg-coin text-slate-950 font-bold shadow-app-sm hover:scale-105 transition-transform shrink-0 ${
              showGiftDrawer ? 'ring-2 ring-amber-300/60' : ''
            }`}
            title="Send Virtual Mega Gift"
            aria-label="Send Virtual Mega Gift"
          >
            <Gift className="w-5 h-5" />
          </button>
        )}

        {/* In-Call Chat Button */}
        <button
          onClick={toggleInCallChat}
          className={`p-3 rounded-full bg-white/10 text-white border border-white/10 hover:bg-white/15 transition-colors shrink-0 ${
            showChatDrawer ? 'ring-2 ring-[#FF3366]/50' : ''
          }`}
          title="Toggle In-Call Live Chat"
          aria-label="Toggle In-Call Live Chat"
          aria-expanded={showChatDrawer}
        >
          <MessageSquare className="w-5 h-5 text-[#FF6584]" />
        </button>

        {/* End Call Button */}
        <button
          id="incall-end-call-btn"
          onClick={endCall}
          className="p-3.5 rounded-full bg-[#E11D48]/90 hover:bg-[#F43F5E] text-white shadow-lg shadow-rose-600/30 transition-transform active:scale-95 shrink-0"
          title="End Call"
          aria-label="End Call"
        >
          <PhoneOff className="w-5 h-5" />
        </button>
        </div>
      </div>

      {/* Mega Gift Overlay FX — auto-dismisses via stable onComplete */}
      {activeGiftAnim && (
        <MegaGiftOverlay
          giftName={activeGiftAnim.name}
          giftIcon={activeGiftAnim.icon}
          animationType={activeGiftAnim.type}
          cost={activeGiftAnim.cost}
          onComplete={clearGiftAnim}
        />
      )}
    </div>
  );
};
