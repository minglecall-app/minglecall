import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import {
  X,
  Lock,
  CheckCircle2,
  Mail,
  User,
  Sparkles,
  ArrowRight,
  LogIn,
  KeyRound,
  AlertCircle,
  RefreshCw,
  Check,
  Copy,
  Loader2,
  ShieldCheck,
  Eye,
  EyeOff,
} from 'lucide-react';
import { UserRole, UserProfile } from '../../types';
import {
  signUpWithEmailOtp,
  verifyEmailOtp,
  signInWithEmailPassword,
  resendEmailOtp,
  requestPasswordResetOtp,
  resetPasswordWithOtp,
} from '../../services/supabaseAuthService';
import { OnboardingWizard } from '../onboarding/OnboardingWizard';
import { PasswordStrengthField } from './PasswordStrengthField';
import { evaluatePasswordStrength, getPasswordPolicyError } from '../../../shared/passwordPolicy';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register';
  defaultRole?: UserRole;
  onNavigateToTab?: (tab: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'login',
  defaultRole = 'male_user',
  onNavigateToTab,
}) => {
  const { completeAuthenticatedLogin, showToast, showToastKey, updateUserProfile } = useApp();

  const [mode, setMode] = useState<'login' | 'register' | 'reset'>(initialMode);

  // Register Form State
  const [selectedRole, setSelectedRole] = useState<UserRole>(defaultRole);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [dob, setDob] = useState('2000-01-01');
  const [age, setAge] = useState(24);

  // OTP Verification State
  const [showOtpScreen, setShowOtpScreen] = useState(false);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpTimer, setOtpTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [receivedOtpCode, setReceivedOtpCode] = useState<string | null>(null);
  const [copiedOtp, setCopiedOtp] = useState(false);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Onboarding Screen State
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingProfile, setOnboardingProfile] = useState<UserProfile | null>(null);

  // Login Form State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Password reset
  const [resetEmail, setResetEmail] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetOtpSent, setResetOtpSent] = useState(false);

  // UI / Error / Loading States
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setSelectedRole(defaultRole);
      setShowOtpScreen(false);
      setShowOnboarding(false);
      setErrorMessage(null);
      setSuccessMessage(null);
      setShowLoginPassword(false);
      setReceivedOtpCode(null);
      setCopiedOtp(false);
      setIsLoading(false);
      setResetOtpSent(false);
      setResetPassword('');
      setResetConfirmPassword('');
    }
  }, [isOpen, initialMode, defaultRole]);

  // OTP Timer countdown (registration OTP screen + password reset)
  useEffect(() => {
    let interval: any = null;
    const otpActive = showOtpScreen || (mode === 'reset' && resetOtpSent);
    if (otpActive && otpTimer > 0) {
      interval = setInterval(() => {
        setOtpTimer((prev) => prev - 1);
      }, 1000);
    } else if (otpTimer === 0) {
      setCanResend(true);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [showOtpScreen, resetOtpSent, mode, otpTimer]);

  if (!isOpen) return null;

  // ============================================================================
  // REGISTRATION & OTP HANDLERS
  // ============================================================================

  const handleStartRegistration = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isLoading) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    // Validation
    if (!name.trim()) {
      setErrorMessage('Please enter your full name or display handle.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Please provide a valid email address.');
      return;
    }
    const passwordError = getPasswordPolicyError(password);
    if (passwordError) {
      setErrorMessage(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please check again.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await signUpWithEmailOtp({
        email: email.trim(),
        password,
        name: name.trim(),
        role: selectedRole,
      });

      if (!res.success) {
        setErrorMessage(res.error || 'Registration failed. Please try again.');
        setIsLoading(false);
        return;
      }

      if (res.skipOtp) {
        setSuccessMessage(
          res.message ||
            'Account created without email verification (admin policy). Signing you in…'
        );
        // Password-only path: switch to login with same credentials
        setMode('login');
        setShowOtpScreen(false);
        setIsLoading(false);
        return;
      }

      if (res.otpCode) {
        setReceivedOtpCode(res.otpCode);
      }

      setSuccessMessage(`A 6-digit verification code has been dispatched to ${email}. Please check your inbox.`);
      setShowOtpScreen(true);
      setOtpTimer(60);
      setCanResend(false);
      setOtpDigits(['', '', '', '', '', '']);

      // Focus first OTP box
      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 150);
    } catch (err: any) {
      console.error('Registration exception:', err);
      setErrorMessage('An error occurred during account creation. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpDigitChange = (index: number, val: string) => {
    if (val.length > 1) {
      // User pasted multiple characters (e.g. 6-digit code)
      const cleaned = val.replace(/\D/g, '').slice(0, 6);
      if (cleaned.length > 0) {
        const newDigits = [...otpDigits];
        for (let i = 0; i < 6; i++) {
          newDigits[i] = cleaned[i] || '';
        }
        setOtpDigits(newDigits);
        const nextIndex = Math.min(cleaned.length, 5);
        otpInputRefs.current[nextIndex]?.focus();
        if (cleaned.length === 6 && mode !== 'reset') {
          handleVerifyOtpCode(cleaned);
        }
        return;
      }
    }

    const singleDigit = val.slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = singleDigit;
    setOtpDigits(newDigits);

    if (singleDigit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    const fullCode = newDigits.join('');
    if (fullCode.length === 6 && !newDigits.includes('') && mode !== 'reset') {
      handleVerifyOtpCode(fullCode);
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtpCode = async (tokenString?: string) => {
    const token = tokenString || otpDigits.join('');
    if (token.length < 6 || isLoading) {
      if (token.length < 6) {
        setErrorMessage('Please enter the complete 6-digit code received in your email.');
      }
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    try {
      const res = await verifyEmailOtp({
        email: email.trim(),
        token,
        role: selectedRole,
        name: name.trim(),
        password,
      });
      if (!res.success || !res.user) {
        setErrorMessage(res.error || 'Invalid or expired verification code. Please check your email inbox.');
        return;
      }

      // Ensure a live Supabase session before onboarding (required for profile persistence)
      let verifiedUser = res.user;
      if (!res.session && password) {
        const sessionRes = await signInWithEmailPassword(email.trim(), password);
        if (sessionRes.success && sessionRes.user) {
          verifiedUser = {
            ...sessionRes.user,
            // Prefer freshly verified email/onboarding flags from OTP path
            emailVerified: true,
            isOnboarded: Boolean(sessionRes.user.isOnboarded),
          };
        } else if (!sessionRes.success) {
          setErrorMessage(
            sessionRes.error ||
              'Email verified, but we could not start your session. Please sign in with your password to continue.'
          );
          setMode('login');
          setLoginEmail(email.trim());
          setShowOtpScreen(false);
          return;
        }
      }

      showToast('Email Verified Successfully! 🟢', 'Proceeding to Profile Setup...', 'success');
      
      // Check if user is already onboarded or needs wizard
      if (verifiedUser.isOnboarded) {
        completeAuthenticatedLogin(verifiedUser);
        if (onNavigateToTab) {
          if (verifiedUser.role === 'admin') {
            onNavigateToTab('admin');
          } else if (verifiedUser.role === 'team_leader') {
            onNavigateToTab('team_leader');
          } else {
            onNavigateToTab('profile');
          }
        }
        onClose();
      } else {
        setOnboardingProfile({
          ...verifiedUser,
          dob: dob || verifiedUser.dob || '2000-01-01',
          age: age || verifiedUser.age || 24,
        });
        setShowOnboarding(true);
      }
    } catch (err: any) {
      console.error('Verify OTP exception:', err);
      setErrorMessage('OTP verification failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!canResend || !email || isLoading) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await resendEmailOtp(email, {
        password: password || undefined,
        name: name.trim() || undefined,
        role: selectedRole,
      });
      if (res.success) {
        if (res.otpCode) {
          setReceivedOtpCode(res.otpCode);
        }
        setSuccessMessage('A fresh 6-digit verification code has been dispatched to your email inbox.');
        setOtpTimer(60);
        setCanResend(false);
      } else {
        setErrorMessage(res.error || 'Failed to resend code.');
      }
    } catch (e: any) {
      console.error('Resend OTP exception:', e);
      setErrorMessage('Could not resend verification code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================================
  // LOGIN HANDLERS
  // ============================================================================

  const handleLoginSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isLoading) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!loginEmail.trim()) {
      setErrorMessage('Please enter your email address.');
      return;
    }
    if (!loginPassword) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await signInWithEmailPassword(loginEmail.trim(), loginPassword);
      if (!res.success || !res.user) {
        setErrorMessage(res.error || 'Invalid email or password. Please check your credentials.');
        return;
      }

      // Check onboarding state
      if (!res.user.isOnboarded) {
        setOnboardingProfile(res.user);
        setShowOnboarding(true);
      } else {
        completeAuthenticatedLogin(res.user);
        showToastKey('auth.welcome_back', { vars: { name: res.user.name } });
        if (onNavigateToTab) {
          if (res.user.role === 'admin') {
            onNavigateToTab('admin');
          } else if (res.user.role === 'team_leader') {
            onNavigateToTab('team_leader');
          } else {
            onNavigateToTab('profile');
          }
        }
        onClose();
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setErrorMessage('Authentication error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestResetOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    const targetEmail = resetEmail.trim().toLowerCase();
    if (!targetEmail.includes('@')) {
      setErrorMessage('Please provide a valid email address.');
      return;
    }
    setIsLoading(true);
    try {
      const res = await requestPasswordResetOtp(targetEmail);
      if (!res.success) {
        setErrorMessage(res.error || 'Failed to send reset code.');
        return;
      }
      if (res.otpCode) setReceivedOtpCode(res.otpCode);
      setResetOtpSent(true);
      setOtpDigits(['', '', '', '', '', '']);
      setOtpTimer(60);
      setCanResend(false);
      setSuccessMessage(`A 6-digit reset code was sent to ${targetEmail}.`);
      setTimeout(() => otpInputRefs.current[0]?.focus(), 150);
    } catch (err: any) {
      console.error('Request reset OTP exception:', err);
      setErrorMessage('Failed to send reset code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompletePasswordReset = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isLoading) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    const code = otpDigits.join('');
    if (code.length !== 6) {
      setErrorMessage('Please enter the full 6-digit verification code.');
      return;
    }
    const passwordError = getPasswordPolicyError(resetPassword);
    if (passwordError) {
      setErrorMessage(passwordError);
      return;
    }
    if (resetPassword !== resetConfirmPassword) {
      setErrorMessage('Passwords do not match. Please check again.');
      return;
    }
    setIsLoading(true);
    try {
      const res = await resetPasswordWithOtp({
        email: resetEmail.trim(),
        token: code,
        newPassword: resetPassword,
      });
      if (!res.success) {
        setErrorMessage(res.error || 'Password reset failed.');
        return;
      }
      setSuccessMessage(res.message || 'Password updated. You can sign in now.');
      showToast('Password Reset', 'Your password was updated. Please sign in.', 'success');
      setMode('login');
      setLoginEmail(resetEmail.trim());
      setLoginPassword('');
      setResetOtpSent(false);
      setResetPassword('');
      setResetConfirmPassword('');
      setReceivedOtpCode(null);
      setOtpDigits(['', '', '', '', '', '']);
    } catch (err: any) {
      console.error('Password reset exception:', err);
      setErrorMessage('Password reset failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // If in Onboarding flow, render full Onboarding Wizard
  if (showOnboarding && onboardingProfile) {
    return (
      <OnboardingWizard
        user={onboardingProfile}
        onComplete={(updated) => {
          updateUserProfile(updated.id, updated);
          completeAuthenticatedLogin(updated);
          if (onNavigateToTab) {
            onNavigateToTab('profile');
          }
          onClose();
        }}
        onCancel={() => {
          setShowOnboarding(false);
          onClose();
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-md" style={{ backgroundColor: 'var(--app-overlay)' }}>
      <div className="relative w-full max-w-lg bg-app-card border border-hairline rounded-t-app-xl sm:rounded-app-xl shadow-app-lg flex flex-col overflow-hidden my-auto app-sheet-up max-h-[94vh]">
        {/* Top Header */}
        <div className="px-5 pt-5 pb-4 bg-app-card-subtle border-b border-hairline shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-app bg-flirt text-white flex items-center justify-center font-bold shadow-brand shrink-0">
                {mode === 'login' ? <LogIn className="w-5 h-5" /> : <User className="w-5 h-5" />}
              </div>
              <div>
                <h2 className="font-display text-lg font-bold text-app-heading">
                  {showOtpScreen
                    ? 'Confirm your email'
                    : mode === 'login'
                    ? 'Welcome back'
                    : mode === 'reset'
                    ? 'Reset password'
                    : 'Join Minglecall'}
                </h2>
                {showOtpScreen ? (
                  <p className="text-xs text-app-muted">Enter the 6-digit code sent to {email}</p>
                ) : mode === 'login' ? (
                  <p className="text-xs text-app-muted">Sign in for private calls and messages</p>
                ) : mode === 'reset' ? (
                  <p className="text-xs text-app-muted">Verify your email, then set a new password</p>
                ) : (
                  <p className="text-xs text-app-muted">18+ only · Create your free profile</p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full text-app-muted hover:text-app-heading bg-app-card hover:bg-brand-soft border border-hairline transition-colors cursor-pointer shrink-0"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mode Switcher Tabs (Hidden during OTP / reset) */}
          {!showOtpScreen && mode !== 'reset' && (
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-app-input rounded-app border border-hairline mt-4">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMessage(null);
                }}
                className={`py-2 rounded-[var(--radius-sm)] text-xs font-semibold transition-all ${
                  mode === 'login'
                    ? 'bg-app-card text-app-heading shadow-app-sm'
                    : 'text-app-muted hover:text-app-heading'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setErrorMessage(null);
                }}
                className={`py-2 rounded-[var(--radius-sm)] text-xs font-semibold transition-all ${
                  mode === 'register'
                    ? 'bg-flirt text-white shadow-brand'
                    : 'text-app-muted hover:text-app-heading'
                }`}
              >
                Create Account
              </button>
            </div>
          )}
          {mode === 'reset' && !showOtpScreen && (
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setResetOtpSent(false);
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className="mt-3 text-xs text-app-muted hover:text-app-heading"
            >
              ← Back to Sign In
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto max-h-[75vh] space-y-4">
          {/* Notifications */}
          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start space-x-2.5 text-rose-300 text-xs animate-shake">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-start space-x-2.5 text-emerald-300 text-xs">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* ========================================================================= */}
          {/* OTP VERIFICATION VIEW                                                     */}
          {/* ========================================================================= */}
          {showOtpScreen ? (
            <div className="space-y-5 py-2">
              <div className="text-center space-y-2">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                  <Mail className="w-7 h-7 animate-bounce" />
                </div>
                <h3 className="text-base font-bold text-app-heading">Enter 6-Digit Verification Code</h3>
                <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-app-input border border-hairline rounded-full text-[11px] text-app-muted">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Dual Verification: 6-Digit OTP + Instant Email Link</span>
                </div>
              </div>

              {/* Dev / delivery-fallback OTP (shown when API returns otpCode) */}
              {receivedOtpCode && (
                <div className="p-3.5 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-indigo-950/40 border border-emerald-500/40 rounded-2xl space-y-2.5 shadow-lg shadow-emerald-950/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-400">
                        Dev / Delivery-Fallback OTP
                      </span>
                    </div>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-mono font-semibold">
                      Temporary
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-app-input border border-hairline rounded-xl p-2.5 gap-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-app-muted font-mono">OTP:</span>
                      <span className="text-xl font-mono font-black tracking-widest text-emerald-300">
                        {receivedOtpCode}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(receivedOtpCode);
                          setCopiedOtp(true);
                          setTimeout(() => setCopiedOtp(false), 2000);
                        }}
                        className="px-2.5 py-1.5 bg-app-card-subtle hover:bg-app-card border border-hairline text-app-muted hover:text-app-heading rounded-lg text-[11px] font-mono flex items-center space-x-1 transition-colors cursor-pointer"
                        title="Copy Code"
                      >
                        {copiedOtp ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedOtp ? 'Copied' : 'Copy'}</span>
                      </button>
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => {
                          const digits = receivedOtpCode.split('').slice(0, 6);
                          setOtpDigits(digits);
                          handleVerifyOtpCode(receivedOtpCode);
                        }}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[11px] flex items-center space-x-1 shadow-md shadow-emerald-600/30 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Auto-fill & Verify</span>
                      </button>
                    </div>
                  </div>

                  <p className="text-[10px] text-app-muted flex items-center space-x-1">
                    <span>
                      <em>
                        Temporary: shown when OTP_DEBUG is on or email delivery failed. Prefer the code from your inbox when email arrives.
                      </em>
                    </span>
                  </p>
                </div>
              )}

              {/* 6 OTP Input Boxes */}
              <div className="flex justify-center space-x-2 sm:space-x-2.5">
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      otpInputRefs.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    className="w-11 h-13 sm:w-12 sm:h-14 bg-app-input border-2 border-hairline focus:border-rose-500 rounded-xl text-center text-lg sm:text-xl font-bold font-mono text-app-heading focus:outline-none focus:ring-2 focus:ring-rose-500/30 transition-all"
                  />
                ))}
              </div>

              <div className="flex items-center justify-between text-xs text-app-muted px-1">
                <span className="flex items-center space-x-1.5">
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>
                    {otpTimer > 0 ? (
                      `Resend code in ${otpTimer}s`
                    ) : (
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        className="text-rose-400 font-bold hover:underline cursor-pointer"
                        disabled={isLoading}
                      >
                        Resend Verification Code
                      </button>
                    )}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowOtpScreen(false)}
                  className="text-app-muted hover:text-app-heading hover:underline cursor-pointer"
                >
                  Change Email
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleVerifyOtpCode()}
                disabled={isLoading || otpDigits.join('').length < 6}
                className="w-full py-3 bg-flirt hover:brightness-110 text-white rounded-app font-semibold text-sm flex items-center justify-center space-x-2 shadow-brand transition-all disabled:opacity-50 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying 6-Digit Code...</span>
                  </>
                ) : (
                  <>
                    <span>Verify Code & Proceed to Profile Setup</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          ) : mode === 'register' ? (
            /* ========================================================================= */
            /* REGISTRATION FORM: ROLE SELECTION + ACCOUNT CREATION                      */
            /* ========================================================================= */
            <form onSubmit={handleStartRegistration} className="space-y-4">
              {/* Role Selection */}
              <div>
                <label className="block text-xs font-semibold text-app-muted font-mono tracking-wider mb-2">
                  Gender *
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSelectedRole('male_user')}
                    className={`py-3 px-2 rounded-2xl border text-center transition-all relative overflow-hidden flex items-center justify-center space-x-1.5 ${
                      selectedRole === 'male_user'
                        ? 'bg-indigo-950/40 border-indigo-500 ring-2 ring-indigo-500/40'
                        : 'bg-app-input border-hairline text-app-muted hover:border-brand/40'
                    }`}
                  >
                    <span className="text-base">👨</span>
                    <span className="text-xs font-bold text-app-heading">Male</span>
                    {selectedRole === 'male_user' && (
                      <Check className="w-3 h-3 text-indigo-400 absolute top-2 right-2" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedRole('female_user')}
                    className={`py-3 px-2 rounded-2xl border text-center transition-all relative overflow-hidden flex items-center justify-center space-x-1.5 ${
                      selectedRole === 'female_user' || selectedRole === 'female_creator'
                        ? 'bg-rose-950/40 border-rose-500 ring-2 ring-rose-500/40'
                        : 'bg-app-input border-hairline text-app-muted hover:border-brand/40'
                    }`}
                  >
                    <span className="text-base">👩</span>
                    <span className="text-xs font-bold text-app-heading">Female</span>
                    {(selectedRole === 'female_user' || selectedRole === 'female_creator') && (
                      <Check className="w-3 h-3 text-rose-400 absolute top-2 right-2" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedRole('other_user')}
                    className={`py-3 px-2 rounded-2xl border text-center transition-all relative overflow-hidden flex items-center justify-center space-x-1.5 ${
                      selectedRole === 'other_user'
                        ? 'bg-purple-950/40 border-purple-500 ring-2 ring-purple-500/40'
                        : 'bg-app-input border-hairline text-app-muted hover:border-brand/40'
                    }`}
                  >
                    <span className="text-base">✨</span>
                    <span className="text-xs font-bold text-app-heading">Other</span>
                    {selectedRole === 'other_user' && (
                      <Check className="w-3 h-3 text-purple-400 absolute top-2 right-2" />
                    )}
                  </button>
                </div>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-app-muted font-mono tracking-wider mb-1">
                  Full Name / Display Handle *
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Jessica Sterling or Alex Hunter"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-app-input border border-hairline rounded-xl pl-10 pr-4 py-2.5 text-xs text-app-heading placeholder:text-app-muted focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              {/* Email Address */}
              <div>
                <label className="block text-xs font-semibold text-app-muted font-mono tracking-wider mb-1">
                  Email *
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    required
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-app-input border border-hairline rounded-xl pl-10 pr-4 py-2.5 text-xs text-app-heading placeholder:text-app-muted focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              {/* Password & Confirm Password */}
              <div className="space-y-3">
                <PasswordStrengthField
                  id="auth-register-password"
                  label="PASSWORD"
                  value={password}
                  onChange={setPassword}
                  placeholder="Create a strong password"
                  autoComplete="new-password"
                />
                <PasswordStrengthField
                  id="auth-register-confirm"
                  label="CONFIRM PASSWORD"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="Repeat password"
                  autoComplete="new-password"
                  showStrengthUi={false}
                  matchAgainst={password}
                  showMatchStatus
                />
              </div>

              <button
                type="submit"
                disabled={
                  isLoading ||
                  !evaluatePasswordStrength(password).isValid ||
                  password !== confirmPassword
                }
                className="w-full py-3 bg-flirt hover:brightness-110 text-white rounded-app font-semibold text-sm flex items-center justify-center space-x-2 shadow-brand transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sending Supabase Email OTP...</span>
                  </>
                ) : (
                  <>
                    <span>Send OTP & Continue</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : mode === 'reset' ? (
            /* ========================================================================= */
            /* PASSWORD RESET: EMAIL OTP + NEW PASSWORD                                  */
            /* ========================================================================= */
            <div className="space-y-4">
              {!resetOtpSent ? (
                <form onSubmit={handleRequestResetOtp} className="space-y-3.5">
                  <p className="text-xs text-app-muted">
                    Enter the email on your account. We will send a 6-digit code so you can set a new password.
                  </p>
                  <div>
                    <label className="block text-xs font-semibold text-app-muted uppercase font-mono tracking-wider mb-1">
                      EMAIL ADDRESS
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="email"
                        required
                        placeholder="you@example.com"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        className="w-full bg-app-input border border-hairline rounded-xl pl-10 pr-4 py-2.5 text-xs text-app-heading placeholder:text-app-muted focus:outline-none focus:border-rose-500"
                        autoFocus
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 bg-flirt hover:brightness-110 text-white rounded-app font-semibold text-sm flex items-center justify-center space-x-2 shadow-brand transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Sending Reset Code...</span>
                      </>
                    ) : (
                      <>
                        <Mail className="w-4 h-4" />
                        <span>Send Reset Code</span>
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleCompletePasswordReset} className="space-y-4">
                  <div className="text-center space-y-1">
                    <p className="text-xs text-app-muted">
                      Enter the code sent to <strong className="text-app-heading">{resetEmail}</strong>, then choose a strong password.
                    </p>
                  </div>

                  {receivedOtpCode && (
                    <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-xl flex items-center justify-between gap-2">
                      <span className="text-[11px] text-emerald-300 font-mono">
                        Dev / delivery-fallback OTP:{' '}
                        <strong className="tracking-widest">{receivedOtpCode}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(receivedOtpCode);
                          setCopiedOtp(true);
                          setTimeout(() => setCopiedOtp(false), 1500);
                        }}
                        className="text-[10px] text-emerald-400 hover:text-white flex items-center gap-1"
                      >
                        {copiedOtp ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copiedOtp ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-app-muted uppercase font-mono tracking-wider mb-2">
                      6-DIGIT CODE
                    </label>
                    <div className="flex justify-between gap-2">
                      {otpDigits.map((digit, idx) => (
                        <input
                          key={idx}
                          ref={(el) => {
                            otpInputRefs.current[idx] = el;
                          }}
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={digit}
                          onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                          className="w-10 h-11 sm:w-11 sm:h-12 text-center text-base font-bold font-mono bg-app-input border border-hairline rounded-xl text-app-heading focus:outline-none focus:border-rose-500"
                          aria-label={`Digit ${idx + 1}`}
                        />
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                      <span>{canResend ? 'Code expired — resend available' : `Resend in ${otpTimer}s`}</span>
                      <button
                        type="button"
                        disabled={!canResend || isLoading}
                        onClick={async () => {
                          setIsLoading(true);
                          const res = await requestPasswordResetOtp(resetEmail.trim());
                          setIsLoading(false);
                          if (res.success) {
                            if (res.otpCode) setReceivedOtpCode(res.otpCode);
                            setOtpTimer(60);
                            setCanResend(false);
                            setSuccessMessage('A new reset code was sent.');
                          } else {
                            setErrorMessage(res.error || 'Failed to resend code.');
                          }
                        }}
                        className="text-rose-400 hover:text-rose-300 disabled:opacity-40"
                      >
                        Resend code
                      </button>
                    </div>
                  </div>

                  <PasswordStrengthField
                    id="auth-reset-password"
                    label="New Password"
                    value={resetPassword}
                    onChange={setResetPassword}
                    placeholder="Create a strong password"
                    autoComplete="new-password"
                  />
                  <PasswordStrengthField
                    id="auth-reset-confirm"
                    label="Confirm New Password"
                    value={resetConfirmPassword}
                    onChange={setResetConfirmPassword}
                    placeholder="Repeat password"
                    autoComplete="new-password"
                    showStrengthUi={false}
                    matchAgainst={resetPassword}
                    showMatchStatus
                  />

                  <button
                    type="submit"
                    disabled={
                      isLoading ||
                      otpDigits.join('').length < 6 ||
                      !evaluatePasswordStrength(resetPassword).isValid ||
                      resetPassword !== resetConfirmPassword
                    }
                    className="w-full py-3 bg-flirt hover:brightness-110 text-white rounded-app font-semibold text-sm flex items-center justify-center space-x-2 shadow-brand transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Updating Password...</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        <span>Reset Password</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          ) : (
            /* ========================================================================= */
            /* LOGIN FORM (EMAIL + PASSWORD)                                             */
            /* ========================================================================= */
            <form onSubmit={handleLoginSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-app-muted uppercase font-mono tracking-wider mb-1">
                  EMAIL ADDRESS
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    required
                    placeholder="alex@example.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full bg-app-input border border-hairline rounded-xl pl-10 pr-4 py-2.5 text-xs text-app-heading placeholder:text-app-muted focus:outline-none focus:border-rose-500"
                    autoFocus
                    autoComplete="email"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-app-muted uppercase font-mono tracking-wider">
                    PASSWORD
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('reset');
                      setResetEmail(loginEmail.includes('@') ? loginEmail.trim() : '');
                      setResetOtpSent(false);
                      setErrorMessage(null);
                      setSuccessMessage(null);
                    }}
                    className="text-[11px] text-rose-400 hover:text-rose-300 font-mono"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    autoComplete="current-password"
                    className="w-full bg-app-input border border-hairline rounded-xl pl-10 pr-10 py-2.5 text-xs text-app-heading placeholder:text-app-muted focus:outline-none focus:border-rose-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-app-muted hover:text-app-heading transition-colors"
                    title={showLoginPassword ? 'Hide password' : 'Show password'}
                    aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                  >
                    {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-flirt hover:brightness-110 text-white rounded-app font-semibold text-sm flex items-center justify-center space-x-2 shadow-brand transition-all cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Signing In...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Sign In</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
export default AuthModal;
