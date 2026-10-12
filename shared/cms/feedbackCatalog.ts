/**
 * Default UI feedback catalog (toasts / alerts / modals / inline).
 * DB overlays override title/message/defaultType/active by key.
 * Keys must stay stable — edit copy via Admin → CMS → Toasts & messages.
 */

export type FeedbackKind = 'toast' | 'alert' | 'modal' | 'inline';
export type FeedbackType = 'success' | 'error' | 'info' | 'warning';

export type FeedbackCatalogEntry = {
  key: string;
  kind: FeedbackKind;
  category: string;
  title: string;
  message: string;
  defaultType: FeedbackType;
};

export const FEEDBACK_CATEGORIES = [
  'auth',
  'onboarding',
  'calls',
  'match',
  'discovery',
  'wallet',
  'gifts',
  'chat',
  'social',
  'profile',
  'media',
  'payout',
  'presence',
  'general',
  'admin',
] as const;

export const DEFAULT_FEEDBACK_CATALOG: FeedbackCatalogEntry[] = [
  {
    "key": "admin.4k_not_recommended",
    "kind": "toast",
    "category": "admin",
    "title": "4K not recommended",
    "message": "4K / high FPS increases freeze risk on mobile. Client caps phones to 720p30. Prefer 720p30 for smooth 1-on-1 calls.",
    "defaultType": "info"
  },
  {
    "key": "admin.agency_role_restriction",
    "kind": "toast",
    "category": "admin",
    "title": "Agency Role Restriction",
    "message": "Agencies cannot initiate calls. Your account is dedicated to managing female host teams and earning agency commission.",
    "defaultType": "info"
  },
  {
    "key": "admin.algorithm_weights_updated",
    "kind": "toast",
    "category": "admin",
    "title": "Algorithm Weights Updated ⚡",
    "message": "Rotational priority scoring parameters saved to Supabase system configs.",
    "defaultType": "success"
  },
  {
    "key": "admin.auth_required",
    "kind": "toast",
    "category": "admin",
    "title": "Auth Required 🔴",
    "message": "Sign in as admin to test LiveKit tokens.",
    "defaultType": "error"
  },
  {
    "key": "admin.batch_marked_paid",
    "kind": "toast",
    "category": "admin",
    "title": "Batch marked paid",
    "message": "Settlement event recorded via Finance API.",
    "defaultType": "info"
  },
  {
    "key": "admin.confirmation_required",
    "kind": "toast",
    "category": "admin",
    "title": "Confirmation Required",
    "message": "Type DELETE to confirm destructive user / admin / R2 purge options.",
    "defaultType": "error"
  },
  {
    "key": "admin.confirmation_required_2",
    "kind": "toast",
    "category": "admin",
    "title": "Confirmation Required",
    "message": "Type DELETE in the confirmation box before factory wipe.",
    "defaultType": "error"
  },
  {
    "key": "admin.currencies_reset",
    "kind": "toast",
    "category": "admin",
    "title": "Currencies Reset",
    "message": "Restored default placeholder FX rates.",
    "defaultType": "info"
  },
  {
    "key": "admin.database_synchronized",
    "kind": "toast",
    "category": "admin",
    "title": "Database Synchronized",
    "message": "Female creator performance metrics refreshed from Supabase.",
    "defaultType": "info"
  },
  {
    "key": "admin.default_restored",
    "kind": "toast",
    "category": "admin",
    "title": "Default Restored ⚡",
    "message": "System reset to 720p HD @ 2,200 kbps (30 FPS) — recommended for smooth calls",
    "defaultType": "info"
  },
  {
    "key": "admin.defaults_restored",
    "kind": "toast",
    "category": "admin",
    "title": "Defaults Restored",
    "message": "Algorithm weights reset to production optimal defaults.",
    "defaultType": "info"
  },
  {
    "key": "admin.economy_settings_saved",
    "kind": "toast",
    "category": "admin",
    "title": "Economy Settings Saved",
    "message": "Burn rates, shares, peg, and legacy engagement knobs updated.",
    "defaultType": "success"
  },
  {
    "key": "admin.error",
    "kind": "toast",
    "category": "admin",
    "title": "Error",
    "message": "Failed to test LiveKit token.",
    "defaultType": "error"
  },
  {
    "key": "admin.file_too_large",
    "kind": "toast",
    "category": "admin",
    "title": "File Too Large",
    "message": "Avatar image must be under 15MB",
    "defaultType": "info"
  },
  {
    "key": "admin.finance_config_saved",
    "kind": "toast",
    "category": "admin",
    "title": "Finance config saved",
    "message": "Cycle, UTC close time, and settlement switch updated.",
    "defaultType": "success"
  },
  {
    "key": "admin.flag_sizes_reset",
    "kind": "toast",
    "category": "admin",
    "title": "Flag Sizes Reset 🚩",
    "message": "Restored recommended default SVG flag dimensions.",
    "defaultType": "info"
  },
  {
    "key": "admin.grid_refreshed",
    "kind": "toast",
    "category": "admin",
    "title": "Grid Refreshed",
    "message": "Synced real-time surveillance matrix with signaling server.",
    "defaultType": "info"
  },
  {
    "key": "admin.invalid_discount",
    "kind": "toast",
    "category": "admin",
    "title": "Invalid Discount",
    "message": "Discount Price must be a valid number.",
    "defaultType": "error"
  },
  {
    "key": "admin.invalid_discount_2",
    "kind": "toast",
    "category": "admin",
    "title": "Invalid Discount",
    "message": "Discount Price must be ≤ Price.",
    "defaultType": "error"
  },
  {
    "key": "admin.invalid_email",
    "kind": "toast",
    "category": "admin",
    "title": "Invalid Email",
    "message": "Please provide a valid email address to test dispatch.",
    "defaultType": "error"
  },
  {
    "key": "admin.invalid_file",
    "kind": "toast",
    "category": "admin",
    "title": "Invalid File",
    "message": "Please select an image file (PNG, JPG, WEBP, GIF).",
    "defaultType": "error"
  },
  {
    "key": "admin.invalid_file_2",
    "kind": "toast",
    "category": "admin",
    "title": "Invalid File",
    "message": "Please select a valid image file (PNG, JPG, WEBP, GIF).",
    "defaultType": "error"
  },
  {
    "key": "admin.missing_fields",
    "kind": "toast",
    "category": "admin",
    "title": "Missing fields",
    "message": "Name, email, and office role are required.",
    "defaultType": "error"
  },
  {
    "key": "admin.payment_acknowledged",
    "kind": "toast",
    "category": "admin",
    "title": "Payment acknowledged",
    "message": "Your Agency commission receipt was recorded. Hosts acknowledge separately.",
    "defaultType": "info"
  },
  {
    "key": "admin.period_end_settlements_only",
    "kind": "toast",
    "category": "admin",
    "title": "Period-End Settlements Only",
    "message": "Manual withdrawals are disabled. Host salaries and Agency commissions pay out through settlement batches at period close.",
    "defaultType": "info"
  },
  {
    "key": "admin.role_assigned",
    "kind": "toast",
    "category": "admin",
    "title": "Role assigned",
    "message": "Updated",
    "defaultType": "success"
  },
  {
    "key": "admin.schema_api_unavailable",
    "kind": "toast",
    "category": "admin",
    "title": "Schema API Unavailable ⚠️",
    "message": "Could not load /supabase_schema.sql via /api/admin/schema. Open the root schema file directly.",
    "defaultType": "error"
  },
  {
    "key": "admin.schema_update_required",
    "kind": "toast",
    "category": "admin",
    "title": "Schema Update Required",
    "message": "Your existing Supabase table expects UUID keys. Go to Tab 5 (SQL Schema), copy the schema (which drops the old UUID table), and run it in your Supabase SQL Editor.",
    "defaultType": "error"
  },
  {
    "key": "admin.seed_failed",
    "kind": "toast",
    "category": "admin",
    "title": "Seed Failed",
    "message": "Could not reach the server.",
    "defaultType": "error"
  },
  {
    "key": "admin.select_category",
    "kind": "toast",
    "category": "admin",
    "title": "Select Category",
    "message": "Please check at least one data category to reset.",
    "defaultType": "info"
  },
  {
    "key": "admin.settings_saved",
    "kind": "toast",
    "category": "admin",
    "title": "Settings Saved 🎯",
    "message": "Creator targets saved. Period cycle & UTC close time synced to Financial Module.",
    "defaultType": "success"
  },
  {
    "key": "admin.smtp_saved_persisted",
    "kind": "toast",
    "category": "admin",
    "title": "SMTP Saved & Persisted! 💾✉️",
    "message": "Live Email & OTP settings saved to disk and database. Settings will persist across restarts.",
    "defaultType": "success"
  },
  {
    "key": "admin.starter_cms_loaded",
    "kind": "toast",
    "category": "admin",
    "title": "Starter CMS Loaded",
    "message": "Honest default banners, policies, and shortcuts saved to the database.",
    "defaultType": "success"
  },
  {
    "key": "admin.synced_with_supabase",
    "kind": "toast",
    "category": "admin",
    "title": "Synced with Supabase",
    "message": "Refreshed active creators and live metrics.",
    "defaultType": "info"
  },
  {
    "key": "admin.template_copied",
    "kind": "toast",
    "category": "admin",
    "title": "Template Copied! 📋",
    "message": "Paste into your Supabase Dashboard Email Templates.",
    "defaultType": "info"
  },
  {
    "key": "admin.token_verified",
    "kind": "toast",
    "category": "admin",
    "title": "Token Verified 🟢",
    "message": "LiveKit WebRTC token signed successfully!",
    "defaultType": "success"
  },
  {
    "key": "admin.validation_error",
    "kind": "toast",
    "category": "admin",
    "title": "Validation Error",
    "message": "Name is required",
    "defaultType": "error"
  },
  {
    "key": "admin.validation_error_2",
    "kind": "toast",
    "category": "admin",
    "title": "Validation Error",
    "message": "Login email is required so the agency can sign in.",
    "defaultType": "error"
  },
  {
    "key": "admin.validation_error_3",
    "kind": "toast",
    "category": "admin",
    "title": "Validation Error",
    "message": "Please enter creator name",
    "defaultType": "error"
  },
  {
    "key": "admin.validation_error_4",
    "kind": "toast",
    "category": "admin",
    "title": "Validation Error",
    "message": "A valid email address is required",
    "defaultType": "error"
  },
  {
    "key": "auth.email_verified_successfully",
    "kind": "toast",
    "category": "auth",
    "title": "Email Verified Successfully! 🟢",
    "message": "Proceeding to Profile Setup...",
    "defaultType": "success"
  },
  {
    "key": "auth.logged_out",
    "kind": "toast",
    "category": "auth",
    "title": "Logged Out 👋",
    "message": "You have been safely logged out of your session.",
    "defaultType": "info"
  },
  {
    "key": "auth.password_mismatch",
    "kind": "toast",
    "category": "auth",
    "title": "Password Mismatch",
    "message": "New password and confirmation password do not match.",
    "defaultType": "info"
  },
  {
    "key": "auth.password_required",
    "kind": "toast",
    "category": "auth",
    "title": "Password Required",
    "message": "Enter your password to permanently delete this account.",
    "defaultType": "error"
  },
  {
    "key": "auth.password_reset",
    "kind": "toast",
    "category": "auth",
    "title": "Password Reset",
    "message": "Your password was updated. Please sign in.",
    "defaultType": "success"
  },
  {
    "key": "auth.password_updated",
    "kind": "toast",
    "category": "auth",
    "title": "Password Updated! 🔒",
    "message": "Your account password has been updated successfully.",
    "defaultType": "success"
  },
  {
    "key": "auth.sign_in_failed",
    "kind": "toast",
    "category": "auth",
    "title": "Sign in failed",
    "message": "Missing authenticated profile.",
    "defaultType": "error"
  },
  {
    "key": "auth.sign_in_required",
    "kind": "toast",
    "category": "auth",
    "title": "Sign in required",
    "message": "Account switching without a password is disabled. Use email and password.",
    "defaultType": "error"
  },
  {
    "key": "auth.sign_in_required_10",
    "kind": "toast",
    "category": "auth",
    "title": "Sign in required",
    "message": "Please sign in to manage favorites.",
    "defaultType": "error"
  },
  {
    "key": "auth.sign_in_required_11",
    "kind": "toast",
    "category": "auth",
    "title": "Sign in required",
    "message": "Please sign in to like profiles.",
    "defaultType": "error"
  },
  {
    "key": "auth.sign_in_required_12",
    "kind": "toast",
    "category": "auth",
    "title": "Sign in required",
    "message": "Please sign in to pass profiles.",
    "defaultType": "error"
  },
  {
    "key": "auth.sign_in_required_13",
    "kind": "toast",
    "category": "auth",
    "title": "Sign in required",
    "message": "Please sign in to send friend requests.",
    "defaultType": "error"
  },
  {
    "key": "auth.sign_in_required_14",
    "kind": "toast",
    "category": "auth",
    "title": "Sign in required",
    "message": "Please sign in to accept friend requests.",
    "defaultType": "error"
  },
  {
    "key": "auth.sign_in_required_15",
    "kind": "toast",
    "category": "auth",
    "title": "Sign in required",
    "message": "Please sign in to decline friend requests.",
    "defaultType": "error"
  },
  {
    "key": "auth.sign_in_required_16",
    "kind": "toast",
    "category": "auth",
    "title": "Sign in required",
    "message": "Please sign in to manage friends.",
    "defaultType": "error"
  },
  {
    "key": "auth.sign_in_required_17",
    "kind": "toast",
    "category": "auth",
    "title": "Sign in required",
    "message": "Please sign in to block users.",
    "defaultType": "error"
  },
  {
    "key": "auth.sign_in_required_18",
    "kind": "toast",
    "category": "auth",
    "title": "Sign in required",
    "message": "Please sign in to unblock users.",
    "defaultType": "error"
  },
  {
    "key": "auth.sign_in_required_19",
    "kind": "toast",
    "category": "auth",
    "title": "Sign in required",
    "message": "Please sign in to report users.",
    "defaultType": "error"
  },
  {
    "key": "auth.sign_in_required_2",
    "kind": "toast",
    "category": "auth",
    "title": "Sign in required",
    "message": "Persona switching is disabled. Sign in with the correct account.",
    "defaultType": "error"
  },
  {
    "key": "auth.sign_in_required_3",
    "kind": "toast",
    "category": "auth",
    "title": "Sign in required",
    "message": "Use email and password to log in.",
    "defaultType": "error"
  },
  {
    "key": "auth.sign_in_required_4",
    "kind": "toast",
    "category": "auth",
    "title": "Sign in required",
    "message": "Please sign in to submit a rating.",
    "defaultType": "error"
  },
  {
    "key": "auth.sign_in_required_5",
    "kind": "toast",
    "category": "auth",
    "title": "Sign in required",
    "message": "Please sign in to ask for a rating.",
    "defaultType": "error"
  },
  {
    "key": "auth.sign_in_required_6",
    "kind": "toast",
    "category": "auth",
    "title": "Sign in required",
    "message": "Please sign in to like moments.",
    "defaultType": "error"
  },
  {
    "key": "auth.sign_in_required_7",
    "kind": "toast",
    "category": "auth",
    "title": "Sign in required",
    "message": "Please sign in to tip.",
    "defaultType": "error"
  },
  {
    "key": "auth.sign_in_required_8",
    "kind": "toast",
    "category": "auth",
    "title": "Sign in required",
    "message": "Please sign in to post a moment.",
    "defaultType": "error"
  },
  {
    "key": "auth.sign_in_required_9",
    "kind": "toast",
    "category": "auth",
    "title": "Sign in required",
    "message": "Please sign in to delete a moment.",
    "defaultType": "error"
  },
  {
    "key": "auth.welcome_back",
    "kind": "toast",
    "category": "auth",
    "title": "Welcome Back! 👋",
    "message": "Logged in as {name}",
    "defaultType": "success"
  },
  {
    "key": "calls.call_connected",
    "kind": "toast",
    "category": "calls",
    "title": "Call Connected! 📹",
    "message": "1-on-1 WebRTC Video Call connected live.",
    "defaultType": "success"
  },
  {
    "key": "calls.call_ended",
    "kind": "toast",
    "category": "calls",
    "title": "Call Ended",
    "message": "Call ended due to insufficient coin balance. Please recharge.",
    "defaultType": "info"
  },
  {
    "key": "calls.call_error",
    "kind": "toast",
    "category": "calls",
    "title": "Call Error",
    "message": "User not found",
    "defaultType": "error"
  },
  {
    "key": "calls.call_failed",
    "kind": "toast",
    "category": "calls",
    "title": "Call Failed",
    "message": "Could not reach the signaling server. Please refresh the page and try again.",
    "defaultType": "error"
  },
  {
    "key": "calls.call_missed",
    "kind": "toast",
    "category": "calls",
    "title": "Call Missed",
    "message": "No answer — ring timed out.",
    "defaultType": "warning"
  },
  {
    "key": "calls.camera_flip",
    "kind": "toast",
    "category": "calls",
    "title": "Camera Flip",
    "message": "Could not switch camera on this device.",
    "defaultType": "info"
  },
  {
    "key": "calls.unavailable_detail",
    "kind": "toast",
    "category": "calls",
    "title": "Call Unavailable 🚫",
    "message": "{detail}",
    "defaultType": "error"
  },
  {
    "key": "calls.user_busy",
    "kind": "toast",
    "category": "calls",
    "title": "User Busy 🚫",
    "message": "{name} is currently busy on another video call.",
    "defaultType": "warning"
  },
  {
    "key": "calls.user_offline",
    "kind": "toast",
    "category": "calls",
    "title": "User Offline 🚫",
    "message": "{name} is currently offline. Calls can only be placed when online.",
    "defaultType": "warning"
  },
  {
    "key": "chat.chat_cleared",
    "kind": "toast",
    "category": "chat",
    "title": "Chat Cleared",
    "message": "Conversation history has been cleared for you.",
    "defaultType": "info"
  },
  {
    "key": "chat.chats_marked_as_read",
    "kind": "toast",
    "category": "chat",
    "title": "Chats Marked as Read",
    "message": "All new message indicators have been cleared.",
    "defaultType": "info"
  },
  {
    "key": "chat.empty_message",
    "kind": "toast",
    "category": "chat",
    "title": "Empty message",
    "message": "Add text or wait for the image upload to finish.",
    "defaultType": "warning"
  },
  {
    "key": "general.accept_failed",
    "kind": "toast",
    "category": "general",
    "title": "Accept failed",
    "message": "Could not register this call on the server. Please try accepting again.",
    "defaultType": "error"
  },
  {
    "key": "general.account_deleted",
    "kind": "toast",
    "category": "general",
    "title": "Account Deleted",
    "message": "Your account has been permanently removed.",
    "defaultType": "info"
  },
  {
    "key": "general.action_locked",
    "kind": "toast",
    "category": "general",
    "title": "Action Locked",
    "message": "Admin permission required to use mock locations.",
    "defaultType": "error"
  },
  {
    "key": "general.action_restricted",
    "kind": "toast",
    "category": "general",
    "title": "Action Restricted",
    "message": "Only female hosts can initiate Friend Requests to callers.",
    "defaultType": "info"
  },
  {
    "key": "general.already_claimed",
    "kind": "toast",
    "category": "general",
    "title": "Already Claimed",
    "message": "You have already claimed today’s streak reward!",
    "defaultType": "success"
  },
  {
    "key": "general.already_claimed_2",
    "kind": "toast",
    "category": "general",
    "title": "Already Claimed",
    "message": "This mission reward was already claimed.",
    "defaultType": "success"
  },
  {
    "key": "general.already_claimed_3",
    "kind": "toast",
    "category": "general",
    "title": "Already Claimed",
    "message": "Master chest already claimed today.",
    "defaultType": "success"
  },
  {
    "key": "general.banner_deleted",
    "kind": "toast",
    "category": "general",
    "title": "Banner Deleted",
    "message": "Promo banner removed from Home page",
    "defaultType": "info"
  },
  {
    "key": "general.banner_save_failed",
    "kind": "toast",
    "category": "general",
    "title": "Banner Save Failed",
    "message": "Could not reach the server.",
    "defaultType": "error"
  },
  {
    "key": "general.bonus_claim_failed",
    "kind": "toast",
    "category": "general",
    "title": "Bonus Claim Failed",
    "message": "Network error claiming bonus.",
    "defaultType": "error"
  },
  {
    "key": "general.checkout_started",
    "kind": "toast",
    "category": "general",
    "title": "Checkout started",
    "message": "Complete payment to credit coins. Balance updates only after server confirmation.",
    "defaultType": "success"
  },
  {
    "key": "general.claim_failed",
    "kind": "toast",
    "category": "general",
    "title": "Claim Failed",
    "message": "Network error claiming streak reward.",
    "defaultType": "error"
  },
  {
    "key": "general.claim_failed_2",
    "kind": "toast",
    "category": "general",
    "title": "Claim Failed",
    "message": "Network error claiming mission reward.",
    "defaultType": "error"
  },
  {
    "key": "general.claim_failed_3",
    "kind": "toast",
    "category": "general",
    "title": "Claim Failed",
    "message": "Network error claiming master chest.",
    "defaultType": "error"
  },
  {
    "key": "general.confirmation_required_3",
    "kind": "toast",
    "category": "general",
    "title": "Confirmation Required",
    "message": "Type DELETE or your account email to continue.",
    "defaultType": "error"
  },
  {
    "key": "general.connecting",
    "kind": "toast",
    "category": "general",
    "title": "Connecting...",
    "message": "Securing the call channel. Your call will start automatically in a moment.",
    "defaultType": "info"
  },
  {
    "key": "general.connection_error",
    "kind": "toast",
    "category": "general",
    "title": "Connection Error",
    "message": "Could not reach server for LiveKit status.",
    "defaultType": "error"
  },
  {
    "key": "general.delete_failed",
    "kind": "toast",
    "category": "general",
    "title": "Delete Failed",
    "message": "Could not reach the server.",
    "defaultType": "error"
  },
  {
    "key": "general.directory_unchanged",
    "kind": "toast",
    "category": "general",
    "title": "Directory unchanged",
    "message": "No remote profiles returned; keeping your current session directory.",
    "defaultType": "info"
  },
  {
    "key": "general.error_detail",
    "kind": "toast",
    "category": "general",
    "title": "Error",
    "message": "{detail}",
    "defaultType": "error"
  },
  {
    "key": "general.gallery_save_failed",
    "kind": "toast",
    "category": "general",
    "title": "Gallery Save Failed",
    "message": "Photos uploaded to storage but were not saved to your profile. Please try again.",
    "defaultType": "error"
  },
  {
    "key": "general.go_live_restricted",
    "kind": "toast",
    "category": "general",
    "title": "Go Live Restricted",
    "message": "Only female creators and female members can broadcast live in Quick Match. Male users can discover & match with live female hosts!",
    "defaultType": "info"
  },
  {
    "key": "general.input_required",
    "kind": "toast",
    "category": "general",
    "title": "Input Required",
    "message": "Please enter a valid image URL",
    "defaultType": "error"
  },
  {
    "key": "general.invalid_file_type",
    "kind": "toast",
    "category": "general",
    "title": "Invalid File Type",
    "message": "Please select an image file (PNG, JPG, WEBP, GIF)",
    "defaultType": "error"
  },
  {
    "key": "general.invalid_target",
    "kind": "toast",
    "category": "general",
    "title": "Invalid Target",
    "message": "Earning override is only available for female creators.",
    "defaultType": "error"
  },
  {
    "key": "general.legacy_queue_read_only",
    "kind": "toast",
    "category": "general",
    "title": "Legacy Queue Read-Only",
    "message": "Approving manual payout_requests is disabled to prevent double-pay. Use Financial Module → settlement batches.",
    "defaultType": "info"
  },
  {
    "key": "general.legacy_queue_read_only_2",
    "kind": "toast",
    "category": "general",
    "title": "Legacy Queue Read-Only",
    "message": "Manual payout status changes are disabled. Historical payout_requests are view-only; cash-out is via settlements.",
    "defaultType": "info"
  },
  {
    "key": "general.navigation_save_failed",
    "kind": "toast",
    "category": "general",
    "title": "Navigation Save Failed",
    "message": "Could not reach the server.",
    "defaultType": "error"
  },
  {
    "key": "general.navigation_saved",
    "kind": "toast",
    "category": "general",
    "title": "Navigation Saved",
    "message": "Navigation bar updated.",
    "defaultType": "success"
  },
  {
    "key": "general.package_deleted",
    "kind": "toast",
    "category": "general",
    "title": "Package Deleted",
    "message": "Coin bundle removed from store",
    "defaultType": "info"
  },
  {
    "key": "general.policy_deleted",
    "kind": "toast",
    "category": "general",
    "title": "Policy Deleted",
    "message": "Policy document removed",
    "defaultType": "info"
  },
  {
    "key": "general.policy_save_failed",
    "kind": "toast",
    "category": "general",
    "title": "Policy Save Failed",
    "message": "Could not reach the server.",
    "defaultType": "error"
  },
  {
    "key": "general.publish_failed",
    "kind": "toast",
    "category": "general",
    "title": "Publish failed",
    "message": "Server did not return the new post.",
    "defaultType": "error"
  },
  {
    "key": "general.rating_failed",
    "kind": "toast",
    "category": "general",
    "title": "Rating failed",
    "message": "Only the caller can submit this rating.",
    "defaultType": "error"
  },
  {
    "key": "general.ready_now_failed",
    "kind": "toast",
    "category": "general",
    "title": "Ready Now Failed",
    "message": "Network error updating Ready Now.",
    "defaultType": "error"
  },
  {
    "key": "general.recipient_not_found",
    "kind": "toast",
    "category": "general",
    "title": "Recipient Not Found",
    "message": "Could not locate recipient user.",
    "defaultType": "info"
  },
  {
    "key": "general.remove_failed",
    "kind": "toast",
    "category": "general",
    "title": "Remove Failed",
    "message": "Could not save gallery changes. Please try again.",
    "defaultType": "error"
  },
  {
    "key": "general.remove_failed_2",
    "kind": "toast",
    "category": "general",
    "title": "Remove Failed",
    "message": "Could not save gallery video changes. Please try again.",
    "defaultType": "error"
  },
  {
    "key": "general.shortcut_removed",
    "kind": "toast",
    "category": "general",
    "title": "Shortcut Removed",
    "message": "Quick shortcut removed from Home page",
    "defaultType": "info"
  },
  {
    "key": "general.shortcut_save_failed",
    "kind": "toast",
    "category": "general",
    "title": "Shortcut Save Failed",
    "message": "Could not reach the server.",
    "defaultType": "error"
  },
  {
    "key": "general.signal_weak",
    "kind": "toast",
    "category": "general",
    "title": "Signal weak",
    "message": "Call accepted — waiting for caller via call log sync. Stay on this screen.",
    "defaultType": "info"
  },
  {
    "key": "general.signed_out",
    "kind": "toast",
    "category": "general",
    "title": "Signed out",
    "message": "Your account was signed in on another device. Only one login is allowed at a time.",
    "defaultType": "info"
  },
  {
    "key": "general.system_settings_saved",
    "kind": "toast",
    "category": "general",
    "title": "System Settings Saved ⚙️",
    "message": "Economy parameters, taxonomies, and platform settings saved live.",
    "defaultType": "success"
  },
  {
    "key": "general.unavailable_for_calls",
    "kind": "toast",
    "category": "general",
    "title": "Unavailable for Calls",
    "message": "Agencies cannot receive live calls. Agencies only manage agency hosts.",
    "defaultType": "error"
  },
  {
    "key": "general.update_failed",
    "kind": "toast",
    "category": "general",
    "title": "Update Failed",
    "message": "Could not reach the server.",
    "defaultType": "error"
  },
  {
    "key": "general.user_not_found",
    "kind": "toast",
    "category": "general",
    "title": "User not found",
    "message": "Could not find that user.",
    "defaultType": "info"
  },
  {
    "key": "general.validation_error_5",
    "kind": "toast",
    "category": "general",
    "title": "Validation Error",
    "message": "Agency name is required.",
    "defaultType": "error"
  },
  {
    "key": "general.validation_error_6",
    "kind": "toast",
    "category": "general",
    "title": "Validation Error",
    "message": "A valid login email is required so the agency can sign in.",
    "defaultType": "error"
  },
  {
    "key": "general.validation_error_7",
    "kind": "toast",
    "category": "general",
    "title": "Validation Error",
    "message": "Creator name is required.",
    "defaultType": "error"
  },
  {
    "key": "general.validation_error_8",
    "kind": "toast",
    "category": "general",
    "title": "Validation Error",
    "message": "A valid email address is required.",
    "defaultType": "error"
  },
  {
    "key": "general.validation_error_9",
    "kind": "toast",
    "category": "general",
    "title": "Validation Error",
    "message": "Placeholder emails are not allowed. Use a real email.",
    "defaultType": "error"
  },
  {
    "key": "general.video_save_failed",
    "kind": "toast",
    "category": "general",
    "title": "Video Save Failed",
    "message": "Videos may be in storage but were not saved to your profile. Please try again.",
    "defaultType": "error"
  },
  {
    "key": "general.you_are_now_live",
    "kind": "toast",
    "category": "general",
    "title": "🔴 YOU ARE NOW LIVE!",
    "message": "Live in Quick Match pool! Callers will discover your stream and can like/match with you.",
    "defaultType": "info"
  },
  {
    "key": "match.cannot_save",
    "kind": "toast",
    "category": "match",
    "title": "Cannot save",
    "message": "Fix overcrowded top corners on Mobile and Desktop (max 2 chip widgets per corner).",
    "defaultType": "info"
  },
  {
    "key": "match.it_s_a_match",
    "kind": "toast",
    "category": "match",
    "title": "It's a Match! 🎉",
    "message": "You both liked each other.",
    "defaultType": "info"
  },
  {
    "key": "match.mutual_discovery",
    "kind": "toast",
    "category": "match",
    "title": "🎉 Mutual Match!",
    "message": "You and {name} matched!",
    "defaultType": "success"
  },
  {
    "key": "match.mutual_quick",
    "kind": "toast",
    "category": "match",
    "title": "🎉 Mutual Match!",
    "message": "{name} matched with you in Quick Match!",
    "defaultType": "success"
  },
  {
    "key": "match.host_saved",
    "kind": "toast",
    "category": "match",
    "title": "🎉 Match Saved!",
    "message": "Matched with {name}! Added to your Matches tab.",
    "defaultType": "success"
  },
  {
    "key": "match.reset",
    "kind": "toast",
    "category": "match",
    "title": "Reset",
    "message": "Default layout restored in the editor (not saved yet).",
    "defaultType": "success"
  },
  {
    "key": "media.direct_upload_verified",
    "kind": "toast",
    "category": "media",
    "title": "Direct Upload Verified 🚀",
    "message": "File uploaded directly to Cloudflare R2 bucket with zero DB overhead.",
    "defaultType": "success"
  },
  {
    "key": "media.upload_failed",
    "kind": "toast",
    "category": "media",
    "title": "Upload Failed",
    "message": "Photo preview was shown locally, but the file was not saved to Cloudflare R2.",
    "defaultType": "error"
  },
  {
    "key": "media.upload_incomplete",
    "kind": "toast",
    "category": "media",
    "title": "Upload Incomplete",
    "message": "No durable photo URL was returned. Please try again.",
    "defaultType": "success"
  },
  {
    "key": "onboarding.avatar_uploaded",
    "kind": "toast",
    "category": "onboarding",
    "title": "Avatar Uploaded 📸",
    "message": "Profile photo uploaded to Cloudflare R2 storage!",
    "defaultType": "success"
  },
  {
    "key": "onboarding.registration_complete",
    "kind": "toast",
    "category": "onboarding",
    "title": "Registration Complete! 🎉",
    "message": "Your profile has been saved.",
    "defaultType": "success"
  },
  {
    "key": "onboarding.video_uploaded",
    "kind": "toast",
    "category": "onboarding",
    "title": "Video Uploaded 🎥",
    "message": "Introduction video uploaded successfully to R2!",
    "defaultType": "success"
  },
  {
    "key": "payout.payout",
    "kind": "toast",
    "category": "payout",
    "title": "Payout",
    "message": "Select a country first.",
    "defaultType": "info"
  },
  {
    "key": "payout.payout_2",
    "kind": "toast",
    "category": "payout",
    "title": "Payout",
    "message": "This method is already saved and locked. Remove it first or contact admin to change.",
    "defaultType": "warning"
  },
  {
    "key": "payout.payout_3",
    "kind": "toast",
    "category": "payout",
    "title": "Payout",
    "message": "This card is locked and cannot be edited.",
    "defaultType": "warning"
  },
  {
    "key": "payout.payout_4",
    "kind": "toast",
    "category": "payout",
    "title": "Payout",
    "message": "Payout card saved and locked.",
    "defaultType": "warning"
  },
  {
    "key": "payout.payout_5",
    "kind": "toast",
    "category": "payout",
    "title": "Payout",
    "message": "Payout card removed.",
    "defaultType": "info"
  },
  {
    "key": "profile.gender_lock_active",
    "kind": "toast",
    "category": "profile",
    "title": "Gender Lock Active",
    "message": "Gender cannot be modified after registration.",
    "defaultType": "warning"
  },
  {
    "key": "profile.photo_required",
    "kind": "toast",
    "category": "profile",
    "title": "Photo Required",
    "message": "Please upload a photo and add a caption for your moment.",
    "defaultType": "error"
  },
  {
    "key": "profile.picture_selected",
    "kind": "toast",
    "category": "profile",
    "title": "Picture Selected ✨",
    "message": "Avatar applied to Agency profile!",
    "defaultType": "info"
  },
  {
    "key": "profile.picture_selected_2",
    "kind": "toast",
    "category": "profile",
    "title": "Picture Selected ✨",
    "message": "Avatar applied to Female Host profile!",
    "defaultType": "info"
  },
  {
    "key": "profile.profile_picture_applied",
    "kind": "toast",
    "category": "profile",
    "title": "Profile Picture Applied ✨",
    "message": "Image applied to form preview.",
    "defaultType": "info"
  },
  {
    "key": "profile.profile_picture_applied_2",
    "kind": "toast",
    "category": "profile",
    "title": "Profile Picture Applied ✨",
    "message": "Image applied to host profile preview.",
    "defaultType": "info"
  },
  {
    "key": "profile.profile_picture_updated",
    "kind": "toast",
    "category": "profile",
    "title": "Profile Picture Updated",
    "message": "Your new profile picture was uploaded to Cloudflare R2.",
    "defaultType": "success"
  },
  {
    "key": "profile.profile_picture_updated_2",
    "kind": "toast",
    "category": "profile",
    "title": "Profile Picture Updated",
    "message": "New photo uploaded to Cloudflare R2 and saved to your profile.",
    "defaultType": "success"
  },
  {
    "key": "profile.profile_picture_updated_3",
    "kind": "toast",
    "category": "profile",
    "title": "Profile Picture Updated ✨",
    "message": "Avatar preset applied successfully!",
    "defaultType": "success"
  },
  {
    "key": "profile.profile_picture_updated_4",
    "kind": "toast",
    "category": "profile",
    "title": "Profile Picture Updated ✨",
    "message": "Custom avatar URL applied and saved!",
    "defaultType": "success"
  },
  {
    "key": "profile.profile_picture_uploaded",
    "kind": "toast",
    "category": "profile",
    "title": "Profile Picture Uploaded ☁️",
    "message": "Agency picture stored on Cloudflare R2.",
    "defaultType": "success"
  },
  {
    "key": "profile.profile_picture_uploaded_2",
    "kind": "toast",
    "category": "profile",
    "title": "Profile Picture Uploaded ☁️",
    "message": "Female Host picture stored on Cloudflare R2.",
    "defaultType": "success"
  },
  {
    "key": "profile.profile_updated",
    "kind": "toast",
    "category": "profile",
    "title": "Profile Updated",
    "message": "Changes saved successfully",
    "defaultType": "success"
  },
  {
    "key": "social.already_friends",
    "kind": "toast",
    "category": "social",
    "title": "Already Friends 👥",
    "message": "You and {name} are already connected as friends!",
    "defaultType": "info"
  },
  {
    "key": "social.already_reported",
    "kind": "toast",
    "category": "social",
    "title": "Already reported",
    "message": "You already have a pending report for this user with the same reason.",
    "defaultType": "warning"
  },
  {
    "key": "social.blocked",
    "kind": "toast",
    "category": "social",
    "title": "Blocked",
    "message": "You cannot message this user.",
    "defaultType": "error"
  },
  {
    "key": "social.client_grant_blocked",
    "kind": "toast",
    "category": "social",
    "title": "Client grant blocked",
    "message": "Coin credits must post via Financial Module API (wallet_ledger PURCHASE). Use Admin → Manual Coin Credit.",
    "defaultType": "error"
  },
  {
    "key": "social.friend_pending",
    "kind": "toast",
    "category": "social",
    "title": "Request Pending ⏳",
    "message": "Friend request already sent to {name}. Waiting for approval.",
    "defaultType": "info"
  },
  {
    "key": "social.friend_request_info",
    "kind": "toast",
    "category": "social",
    "title": "Friend Request Info 🌸",
    "message": "In this platform, Female Creators send Friend Requests to loyal callers. Start a chat or video call to connect with the creator!",
    "defaultType": "info"
  },
  {
    "key": "social.moment_published",
    "kind": "toast",
    "category": "social",
    "title": "Moment published",
    "message": "Your post is live in the Moments feed.",
    "defaultType": "success"
  },
  {
    "key": "social.moment_removed",
    "kind": "toast",
    "category": "social",
    "title": "Moment removed",
    "message": "Your moment was deleted.",
    "defaultType": "info"
  },
  {
    "key": "social.photo_required_2",
    "kind": "toast",
    "category": "social",
    "title": "Photo Required",
    "message": "Please upload or select a photo for your moment post.",
    "defaultType": "error"
  },
  {
    "key": "social.report_failed",
    "kind": "toast",
    "category": "social",
    "title": "Report failed",
    "message": "You cannot report yourself.",
    "defaultType": "error"
  },
  {
    "key": "social.report_submitted",
    "kind": "toast",
    "category": "social",
    "title": "Report submitted",
    "message": "Report submitted — our safety team will review.",
    "defaultType": "info"
  },
  {
    "key": "social.user_blocked",
    "kind": "toast",
    "category": "social",
    "title": "User Blocked 🚫",
    "message": "User has been blocked. Reason: {detail}",
    "defaultType": "warning"
  },
  {
    "key": "social.user_unblocked",
    "kind": "toast",
    "category": "social",
    "title": "User Unblocked 🔓",
    "message": "User has been unblocked successfully.",
    "defaultType": "error"
  },
  {
    "key": "wallet.already_requested",
    "kind": "toast",
    "category": "wallet",
    "title": "Already requested",
    "message": "An open rating request is already waiting for this caller.",
    "defaultType": "info"
  },
  {
    "key": "wallet.gift_insufficient",
    "kind": "toast",
    "category": "wallet",
    "title": "Insufficient Coins 🪙",
    "message": "Sending {gift} requires {amount} coins. Please buy coins!",
    "defaultType": "error"
  },
  {
    "key": "wallet.gift_removed",
    "kind": "toast",
    "category": "wallet",
    "title": "Gift Removed",
    "message": "Virtual gift removed from store",
    "defaultType": "info"
  },
  {
    "key": "wallet.gifts_reset",
    "kind": "toast",
    "category": "wallet",
    "title": "Gifts Reset 🎁",
    "message": "Virtual gifts restored to default catalog.",
    "defaultType": "info"
  },
  {
    "key": "wallet.goal_contribution",
    "kind": "toast",
    "category": "wallet",
    "title": "Goal Contribution Sent! 🎉",
    "message": "Dropped {amount} 🪙 into creator goal target!",
    "defaultType": "success"
  },
  {
    "key": "wallet.insufficient_coins",
    "kind": "toast",
    "category": "wallet",
    "title": "Insufficient Coins 🪙",
    "message": "You need at least 20 coins to tip a moment.",
    "defaultType": "info"
  },
  {
    "key": "wallet.insufficient_coins_2",
    "kind": "toast",
    "category": "wallet",
    "title": "Insufficient Coins 🪙",
    "message": "Please top up your wallet to contribute to this goal.",
    "defaultType": "info"
  },
  {
    "key": "wallet.master_chest",
    "kind": "toast",
    "category": "wallet",
    "title": "🏆 Master Chest Unlocked!",
    "message": "+{amount} Mega Bonus Coins added to your wallet!",
    "defaultType": "success"
  },
  {
    "key": "wallet.permission_denied",
    "kind": "toast",
    "category": "wallet",
    "title": "Permission Denied",
    "message": "Platform Admin has not granted mock location permissions to your account.",
    "defaultType": "error"
  },
  {
    "key": "wallet.permission_denied_2",
    "kind": "toast",
    "category": "wallet",
    "title": "Permission Denied",
    "message": "Only administrators can override female creator earning rates.",
    "defaultType": "error"
  },
  {
    "key": "wallet.purchase_failed",
    "kind": "toast",
    "category": "wallet",
    "title": "Purchase failed",
    "message": "Could not reach the funding API.",
    "defaultType": "error"
  },
  {
    "key": "wallet.quest_completed",
    "kind": "toast",
    "category": "wallet",
    "title": "Quest Completed! ✨",
    "message": "+{amount} Free Coins earned from daily mission!",
    "defaultType": "success"
  },
  {
    "key": "wallet.request_failed",
    "kind": "toast",
    "category": "wallet",
    "title": "Request failed",
    "message": "Only the host can ask for a rating.",
    "defaultType": "error"
  },
  {
    "key": "wallet.tip_failed",
    "kind": "toast",
    "category": "wallet",
    "title": "Tip failed",
    "message": "Missing moment post id.",
    "defaultType": "error"
  },
  {
    "key": "wallet.tip_failed_2",
    "kind": "toast",
    "category": "wallet",
    "title": "Tip failed",
    "message": "You cannot tip your own moment.",
    "defaultType": "error"
  }
];


export function feedbackFingerprint(title: string, message: string): string {
  return `${String(title || '').trim()}:::${String(message || '').trim()}`;
}

/** Map default title+message → key (static strings only; skips templates with {vars}). */
export function buildDefaultFingerprintIndex(
  catalog: FeedbackCatalogEntry[] = DEFAULT_FEEDBACK_CATALOG
): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of catalog) {
    if (e.message.includes('{') || e.title.includes('{')) continue;
    const fp = feedbackFingerprint(e.title, e.message);
    if (!map.has(fp)) map.set(fp, e.key);
  }
  return map;
}

export function applyFeedbackVars(
  template: string,
  vars?: Record<string, string | number | null | undefined>
): string {
  if (!vars) return template;
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name) => {
    const v = vars[name];
    return v == null ? '' : String(v);
  });
}

export type ResolvedFeedback = {
  key: string;
  title: string;
  message: string;
  type: FeedbackType;
  kind: FeedbackKind;
};

/** Resolve catalog entry by key (merged catalog preferred; falls back to defaults). */
export function resolveFeedback(
  key: string,
  vars?: Record<string, string | number | null | undefined>,
  catalog: FeedbackCatalogEntry[] = DEFAULT_FEEDBACK_CATALOG
): ResolvedFeedback {
  const entry =
    catalog.find((e) => e.key === key) ||
    DEFAULT_FEEDBACK_CATALOG.find((e) => e.key === key) ||
    null;
  if (!entry) {
    return {
      key,
      title: key,
      message: vars?.detail != null ? String(vars.detail) : '',
      type: 'info',
      kind: 'toast',
    };
  }
  return {
    key: entry.key,
    title: applyFeedbackVars(entry.title, vars),
    message: applyFeedbackVars(entry.message, vars),
    type: entry.defaultType,
    kind: entry.kind,
  };
}

/** Inactive DB rows keep code defaults (no override). */
export function mergeFeedbackCatalog(
  defaults: FeedbackCatalogEntry[],
  overrides: Array<Partial<FeedbackCatalogEntry> & { key: string; active?: boolean }>
): FeedbackCatalogEntry[] {
  const map = new Map(defaults.map((d) => [d.key, { ...d }]));
  for (const row of overrides || []) {
    const key = String(row.key || '').trim();
    if (!key) continue;
    if (row.active === false) continue;
    const base = map.get(key) || {
      key,
      kind: (row.kind as FeedbackKind) || 'toast',
      category: row.category || 'general',
      title: row.title || key,
      message: row.message || '',
      defaultType: (row.defaultType as FeedbackType) || 'info',
    };
    map.set(key, {
      ...base,
      title: row.title != null ? String(row.title) : base.title,
      message: row.message != null ? String(row.message) : base.message,
      defaultType: (row.defaultType as FeedbackType) || base.defaultType,
      kind: (row.kind as FeedbackKind) || base.kind,
      category: row.category != null ? String(row.category) : base.category,
    });
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export type FeedbackDbRow = FeedbackCatalogEntry & { active: boolean; updatedAt?: string | null };

/** Admin table: every default + DB overlay state. */
export function buildAdminFeedbackList(
  defaults: FeedbackCatalogEntry[],
  dbRows: Array<{
    key: string;
    kind?: string;
    category?: string;
    title?: string;
    message?: string;
    default_type?: string;
    defaultType?: string;
    active?: boolean;
    updated_at?: string | null;
    updatedAt?: string | null;
  }>
): FeedbackDbRow[] {
  const dbByKey = new Map((dbRows || []).map((r) => [String(r.key), r] as const));
  const keys = new Set<string>([...defaults.map((d) => d.key), ...dbByKey.keys()]);
  const out: FeedbackDbRow[] = [];
  for (const key of keys) {
    const def = defaults.find((d) => d.key === key);
    const row = dbByKey.get(key);
    out.push({
      key,
      kind: (row?.kind as FeedbackKind) || def?.kind || 'toast',
      category: row?.category || def?.category || 'general',
      title: row?.title != null ? String(row.title) : def?.title || key,
      message: row?.message != null ? String(row.message) : def?.message || '',
      defaultType:
        (row?.defaultType as FeedbackType) ||
        (row?.default_type as FeedbackType) ||
        def?.defaultType ||
        'info',
      active: row ? row.active !== false : true,
      updatedAt: row?.updatedAt ?? row?.updated_at ?? null,
    });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}
