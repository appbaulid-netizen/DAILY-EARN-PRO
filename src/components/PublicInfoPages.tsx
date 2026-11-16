import { useState } from 'react';
import { ArrowLeft, CheckCircle2, Mail, Send, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { AppRoute } from '../types';
import { BrandLogo } from './BrandLogo';

interface PublicInfoPagesProps {
  route: 'about' | 'contact' | 'privacy' | 'terms';
  isAuthenticated: boolean;
  onNavigate: (route: AppRoute) => void;
}

export function PublicInfoPages({ route, isAuthenticated, onNavigate }: PublicInfoPagesProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContactSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest('/api/contact', {
        method: 'POST',
        body: { name, email, subject, message },
      });
      setSent(true);
      setName('');
      setEmail('');
      setSubject('');
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send message.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {!isAuthenticated && (
        <header className="w-full border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
            <button type="button" onClick={() => onNavigate('login')}>
              <BrandLogo />
            </button>
            <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
              <button type="button" onClick={() => onNavigate('about')} className="hover:text-slate-900 dark:hover:text-white whitespace-nowrap">
                About Us
              </button>
              <button type="button" onClick={() => onNavigate('contact')} className="hover:text-slate-900 dark:hover:text-white whitespace-nowrap">
                Contact Us
              </button>
              <button type="button" onClick={() => onNavigate('privacy')} className="hover:text-slate-900 dark:hover:text-white whitespace-nowrap">
                Privacy
              </button>
              <button type="button" onClick={() => onNavigate('terms')} className="hover:text-slate-900 dark:hover:text-white whitespace-nowrap">
                Terms
              </button>
            </nav>
            <button
              type="button"
              onClick={() => onNavigate('login')}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap shrink-0"
            >
              Sign In
            </button>
          </div>
        </header>
      )}

      <main className="flex-1 mx-auto w-full max-w-4xl px-4 sm:px-6 py-8 sm:py-12 space-y-6">
        <button
          type="button"
          onClick={() => onNavigate(isAuthenticated ? 'dashboard' : 'login')}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          {isAuthenticated ? 'Back to Dashboard' : 'Back to Login'}
        </button>

        {route === 'about' && (
          <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-10 space-y-6">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">About Honey &amp; Bunny Invest</p>
              <h1 className="font-display text-3xl font-bold tracking-tight">
                100-Day Investment Plans &amp; Fast Local Payouts
              </h1>
            </div>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              Honey &amp; Bunny Invest offers 13 structured 100-day plans from PKR 300 up to PKR 510,000,
              a PKR 35 signup register bonus, verified Easypaisa &amp; JazzCash deposits, fast withdrawals starting
              at PKR 50, and a 3-level referral commission system (10% Level 1, 2% Level 2, 2% Level 3).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="font-display font-semibold text-base">Register Bonus &amp; Min Deposit</h2>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                  Receive a PKR 35 bonus upon signup. Start investing from PKR 300 via Easypaisa or JazzCash.
                </p>
              </div>
              <div>
                <h2 className="font-display font-semibold text-base">Server-Verified Callbacks</h2>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                  Watch timers, anti-bot checks, and wallet ledgers are verified server-side.
                </p>
              </div>
              <div>
                <h2 className="font-display font-semibold text-base">Local Payout Support</h2>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                  Withdraw approved balances through Easypaisa, JazzCash, or local Bank Transfer.
                </p>
              </div>
            </div>
          </article>
        )}

        {route === 'contact' && (
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-10 space-y-6">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">Support Desk</p>
              <h1 className="font-display text-3xl font-bold tracking-tight">Contact Us</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Questions about account verification, sponsor compliance, or withdrawal status? Send
                a message directly to our review team.
              </p>
            </div>

            {sent && (
              <div className="flex items-center gap-2.5 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-sm text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Message submitted. Administrators can review your ticket from the Admin Dashboard.</span>
              </div>
            )}

            {error && (
              <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            <form onSubmit={handleContactSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Your Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Asad Khan"
                    className="w-full h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Email Address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Subject</label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Withdrawal verification inquiry"
                  className="w-full h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Message</label>
                <textarea
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe your question or provide a transaction reference ID..."
                  className="w-full p-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center gap-2"
              >
                <Send className="h-4 w-4" />
                {submitting ? 'Sending...' : 'Send Message'}
              </button>
            </form>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 text-xs text-slate-500">
              <Mail className="h-4 w-4" />
              <span>Support email: support@honeybunnyinvest.com</span>
            </div>
          </section>
        )}

        {route === 'privacy' && (
          <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-10 space-y-5">
            <h1 className="font-display text-3xl font-bold tracking-tight">Privacy Policy</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Honey &amp; Bunny Invest collects only the account information required for authentication,
              email verification, anti-fraud referral checks, and payout fulfillment.
            </p>
            <div className="space-y-4 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-white">1. Credential Security</h2>
                <p className="mt-1">
                  Passwords are salted and hashed with scrypt on the server. Plain-text passwords are
                  never stored or logged.
                </p>
              </div>
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-white">2. Payment Details Isolation</h2>
                <p className="mt-1">
                  Easypaisa, JazzCash, and Bank account numbers are accessible only to the account
                  owner and authorized payout administrators for settlement verification.
                </p>
              </div>
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-white">3. Anti-Fraud Protection</h2>
                <p className="mt-1">
                  One-way cryptographic hashes of network addresses may be evaluated during referral
                  registration to prevent duplicate or automated account abuse.
                </p>
              </div>
            </div>
          </article>
        )}

        {route === 'terms' && (
          <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-10 space-y-5">
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 text-xs font-semibold">
              <ShieldCheck className="h-4 w-4" />
              <span>Platform Compliance Rules</span>
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Terms &amp; Conditions</h1>
            <div className="space-y-4 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-white">1. Permitted Sponsor Engagement</h2>
                <p className="mt-1">
                  Rewards are granted exclusively for direct sponsor campaigns that explicitly allow
                  incentivized reviews. Incentivized clicking on Google Ads or YouTube advertisements
                  and artificial view generation are strictly prohibited.
                </p>
              </div>
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-white">2. No Guaranteed Profit Claims</h2>
                <p className="mt-1">
                  Honey &amp; Bunny Invest maintains server-side deposit, plan profit, and withdrawal
                  verification. All account balances and plan payouts follow verified platform records.
                </p>
              </div>
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-white">3. Server-Side Verification</h2>
                <p className="mt-1">
                  All task rewards start as Pending until validated via server-side callback and
                  administrator review. Automated scripts or duplicate submissions result in account
                  suspension.
                </p>
              </div>
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
