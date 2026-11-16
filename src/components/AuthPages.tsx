import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  UserPlus,
  X,
} from 'lucide-react';
import { apiRequest, setSessionToken } from '../lib/api';
import type { AppRoute, AuthUser } from '../types';
import { BrandLogo } from './BrandLogo';

interface AuthPagesProps {
  route: 'login' | 'register' | 'forgot-password';
  initialReferralCode?: string;
  onNavigate: (route: AppRoute) => void;
  onAuthenticated: (user: AuthUser) => void;
}

export function AuthPages({
  route,
  initialReferralCode = '',
  onNavigate,
  onAuthenticated,
}: AuthPagesProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [referralCode, setReferralCode] = useState(initialReferralCode);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Anti-bot challenge state for registration
  const [challengeSeed, setChallengeSeed] = useState(() => ({
    a: Math.floor(Math.random() * 8) + 2,
    b: Math.floor(Math.random() * 7) + 2,
  }));
  const [humanAnswer, setHumanAnswer] = useState('');

  // Forgot password state
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetHint, setResetHint] = useState<string | null>(null);

  // Sandbox Google Sign-In dialog state
  const [googleDialogOpen, setGoogleDialogOpen] = useState(false);
  const [googleEmail, setGoogleEmail] = useState('alex.google.demo@gmail.com');
  const [googleName, setGoogleName] = useState('Alex Google Demo');

  const [heroImgError, setHeroImgError] = useState(false);

  const [duplicateEmailDetected, setDuplicateEmailDetected] = useState(false);

  const expectedHumanAnswer = useMemo(
    () => challengeSeed.a + challengeSeed.b,
    [challengeSeed]
  );

  function switchAuthRoute(next: 'login' | 'register' | 'forgot-password') {
    setError(null);
    setSuccessMsg(null);
    setDuplicateEmailDetected(false);
    onNavigate(next);
  }

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDuplicateEmailDetected(false);
    setLoading(true);
    try {
      const res = await apiRequest<{ user: AuthUser; token?: string }>('/api/auth/login', {
        method: 'POST',
        body: {
          email,
          password,
        },
      });
      if (res.token) setSessionToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDuplicateEmailDetected(false);
    setLoading(true);
    try {
      const res = await apiRequest<{ user: AuthUser; token?: string; verificationCodeHint?: string }>(
        '/api/auth/register',
        {
          method: 'POST',
          body: {
            name,
            email,
            password,
            referralCode: referralCode.trim() || undefined,
            humanCheckAnswer: Number(humanAnswer),
            humanCheckExpected: expectedHumanAnswer,
          },
        }
      );
      if (res.token) setSessionToken(res.token);
      if (res.verificationCodeHint) {
        sessionStorage.setItem('asad_verify_hint', res.verificationCodeHint);
      }
      onAuthenticated(res.user);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed.';
      setError(msg);
      if (msg.toLowerCase().includes('already exists')) {
        setDuplicateEmailDetected(true);
      }
      setChallengeSeed({
        a: Math.floor(Math.random() * 8) + 2,
        b: Math.floor(Math.random() * 7) + 2,
      });
      setHumanAnswer('');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      if (resetStep === 'request') {
        const res = await apiRequest<{ message: string; resetCodeHint?: string }>(
          '/api/auth/forgot-password',
          {
            method: 'POST',
            body: { email },
          }
        );
        setSuccessMsg(res.message);
        if (res.resetCodeHint) {
          setResetHint(res.resetCodeHint);
        }
        setResetStep('confirm');
      } else {
        const res = await apiRequest<{ message: string }>('/api/auth/reset-password', {
          method: 'POST',
          body: { email, code: resetCode, newPassword },
        });
        setSuccessMsg(res.message);
        setResetStep('request');
        setResetCode('');
        setNewPassword('');
        setResetHint(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleDemoSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest<{ user: AuthUser; token?: string }>('/api/auth/google-demo', {
        method: 'POST',
        body: { email: googleEmail, name: googleName },
      });
      if (res.token) setSessionToken(res.token);
      setGoogleDialogOpen(false);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  }

  function fillDemoMember() {
    setEmail('member.demo@asadrewardhub.com');
    setPassword('DemoMember@2026');
    setError(null);
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Clean 3-Zone Top Bar */}
      <header className="w-full border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => switchAuthRoute('login')}
            className="text-left focus-visible:outline-2 focus-visible:outline-blue-600 rounded-md"
          >
            <BrandLogo />
          </button>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <button
              type="button"
              onClick={() => onNavigate('about')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              About Us
            </button>
            <button
              type="button"
              onClick={() => onNavigate('contact')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Contact
            </button>
            <button
              type="button"
              onClick={() => onNavigate('privacy')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Privacy
            </button>
            <button
              type="button"
              onClick={() => onNavigate('terms')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Terms
            </button>
          </nav>

          <div className="shrink-0">
            {route === 'login' ? (
              <button
                type="button"
                onClick={() => switchAuthRoute('register')}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
              >
                Create Account
              </button>
            ) : (
              <button
                type="button"
                onClick={() => switchAuthRoute('login')}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Split Content */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 py-8 lg:py-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left Institutional Showcase Panel */}
        <section className="lg:col-span-6 rounded-2xl overflow-hidden bg-slate-900 text-white border border-slate-800 flex flex-col justify-between">
          <div className="relative h-56 sm:h-64 lg:h-72 overflow-hidden bg-slate-950">
            {!heroImgError ? (
              <img
                src="/src/assets/images/auth_hero_banner_1794576038118.jpg"
                alt="Architectural blue and slate fintech security illustration"
                referrerPolicy="no-referrer"
                onError={() => setHeroImgError(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />
          </div>

          <div className="p-6 sm:p-8 flex-1 flex flex-col justify-between gap-8">
            <div className="space-y-4">
              <p className="text-xs font-medium text-blue-400">
                Honey &amp; Bunny Invest · Protected Member Access
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white [text-wrap:balance]">
                100-Day Investment Plans, Daily Profit &amp; Instant Payouts
              </h1>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl">
                Honey &amp; Bunny Invest offers 13 transparent 100-day plans starting from PKR 300,
                with a PKR 35 registration bonus, Easypaisa &amp; JazzCash deposits, fast withdrawals from PKR 50,
                and 3-level referral commissions (10% · 2% · 2%).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-slate-800">
              <div>
                <p className="text-xs text-slate-400">Register Bonus</p>
                <p className="mt-1 text-sm font-semibold text-white">PKR 35 Instant Bonus</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Min Deposit / Withdraw</p>
                <p className="mt-1 text-sm font-semibold text-white">PKR 300 / PKR 50</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Referral Commission</p>
                <p className="mt-1 text-sm font-semibold text-white">L1 10% · L2 2% · L3 2%</p>
              </div>
            </div>
          </div>
        </section>

        {/* Right Authentication Form Panel */}
        <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-10 flex flex-col justify-center">
          <div className="w-full max-w-md mx-auto space-y-6">
            {/* Mode Switch Tabs for Login / Register */}
            {(route === 'login' || route === 'register') && (
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => switchAuthRoute('login')}
                  className={`py-2.5 px-4 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    route === 'login'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => switchAuthRoute('register')}
                  className={`py-2.5 px-4 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    route === 'register'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Create Account
                </button>
              </div>
            )}

            {/* Page Title */}
            <div>
              <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                {route === 'login' && 'Sign in to your account'}
                {route === 'register' && 'Create a verified member account'}
                {route === 'forgot-password' && 'Reset your password'}
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {route === 'login' &&
                  'Access your Honey & Bunny Invest dashboard, plans, deposits, and withdrawals.'}
                {route === 'register' &&
                  'Join now and receive a PKR 35 Register Bonus directly in your wallet.'}
                {route === 'forgot-password' &&
                  'Verify your registered email with a 6-digit recovery code.'}
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="space-y-2">
                  <p>{error}</p>
                  {duplicateEmailDetected && route === 'register' && (
                    <button
                      type="button"
                      onClick={() => switchAuthRoute('login')}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
                    >
                      Sign In to Existing Account
                    </button>
                  )}
                </div>
              </div>
            )}

            {successMsg && (
              <div
                role="status"
                className="flex items-start gap-2.5 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-sm text-emerald-700 dark:text-emerald-300"
              >
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p>{successMsg}</p>
                  {resetHint && (
                    <p className="mt-1 font-mono text-xs">
                      Demo recovery code: <strong>{resetHint}</strong>
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* LOGIN FORM */}
            {route === 'login' && (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="member.demo@asadrewardhub.com"
                      className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => switchAuthRoute('forgot-password')}
                      className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full h-11 pl-10 pr-11 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? 'Verifying credentials...' : 'Sign In to Dashboard'}
                </button>

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200 dark:border-slate-800" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-white dark:bg-slate-900 px-3 text-slate-500">
                      or continue with
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setGoogleDialogOpen(true)}
                  className="w-full h-11 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-200 transition-colors flex items-center justify-center gap-2.5"
                >
                  <span className="h-4 w-4 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                    G
                  </span>
                  Continue with Google (Demo Sandbox)
                </button>

                {/* Clearly labeled Demo Access Box */}
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Demo Test Account (Clearly Labeled Sample Data)
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={fillDemoMember}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:border-blue-600 text-slate-800 dark:text-slate-200 transition-colors"
                      >
                        Fill Demo Member
                      </button>
                      <span className="text-xs font-mono text-slate-500">
                        member.demo@asadrewardhub.com
                      </span>
                    </div>
                  </div>
                </div>
              </form>
            )}

            {/* REGISTER FORM */}
            {route === 'register' && (
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Full name
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Muhammad Asad"
                    className="w-full h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Email address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Password (minimum 8 characters)
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a strong password"
                      className="w-full h-11 pl-4 pr-11 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Referral code (optional)
                    </label>
                    <input
                      type="text"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value)}
                      placeholder="ASAD-DEMO01"
                      className="w-full h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Security check: {challengeSeed.a} + {challengeSeed.b} = ?
                    </label>
                    <input
                      type="number"
                      required
                      value={humanAnswer}
                      onChange={(e) => setHumanAnswer(e.target.value)}
                      placeholder="Answer"
                      className="w-full h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm tabular-nums text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <UserPlus className="h-4 w-4" />
                  {loading ? 'Creating account...' : 'Register Free Account'}
                </button>
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                  One account per email address. Already registered? Sign in with your email and
                  password to open your saved balance.
                </p>
              </form>
            )}

            {/* FORGOT PASSWORD FORM */}
            {route === 'forgot-password' && (
              <form onSubmit={handleForgotSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Registered email address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                {resetStep === 'confirm' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        6-digit recovery code
                      </label>
                      <input
                        type="text"
                        required
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value)}
                        placeholder="123456"
                        className="w-full h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        New password (min 8 chars)
                      </label>
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password"
                        className="w-full h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <KeyRound className="h-4 w-4" />
                  {loading
                    ? 'Processing...'
                    : resetStep === 'request'
                      ? 'Send Recovery Code'
                      : 'Update Password'}
                </button>

                <button
                  type="button"
                  onClick={() => switchAuthRoute('login')}
                  className="w-full h-10 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Sign In
                </button>
              </form>
            )}
          </div>
        </section>
      </main>

      {/* Footer with legal & info links */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-5 px-4 sm:px-6">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span>© {new Date().getFullYear()} Honey &amp; Bunny Invest. Daily Profit &amp; Payout Platform.</span>
          <div className="flex flex-wrap items-center gap-5">
            <button type="button" onClick={() => onNavigate('about')} className="hover:text-slate-900 dark:hover:text-white">
              About Us
            </button>
            <button type="button" onClick={() => onNavigate('contact')} className="hover:text-slate-900 dark:hover:text-white">
              Contact Us
            </button>
            <button type="button" onClick={() => onNavigate('privacy')} className="hover:text-slate-900 dark:hover:text-white">
              Privacy Policy
            </button>
            <button type="button" onClick={() => onNavigate('terms')} className="hover:text-slate-900 dark:hover:text-white">
              Terms &amp; Conditions
            </button>
          </div>
        </div>
      </footer>

      {/* Sandbox Google Sign-In Dialog */}
      {googleDialogOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Google Sign-In (Sandbox Mode)
              </h3>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setGoogleDialogOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Firebase Auth provisioning was skipped in this workspace, so Google Sign-In runs in
              local sandbox mode. Connect Firebase Authentication in <code className="font-mono">FIREBASE_SETUP.md</code> for live Google OAuth.
            </p>
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <form onSubmit={handleGoogleDemoSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={googleName}
                  onChange={(e) => setGoogleName(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Google Account Email
                </label>
                <input
                  type="email"
                  required
                  value={googleEmail}
                  onChange={(e) => setGoogleEmail(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setGoogleDialogOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {loading ? 'Signing in...' : 'Continue with Google'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
