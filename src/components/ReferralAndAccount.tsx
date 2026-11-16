import { useEffect, useState } from 'react';
import {
  Bell,
  Check,
  CheckCircle2,
  Copy,
  Moon,
  ShieldCheck,
  Sun,
  Users,
} from 'lucide-react';
import { apiRequest, formatDateTime, formatPKR } from '../lib/api';
import type { AppNotification, AppRoute, AuthUser, Referral, WithdrawalMethod } from '../types';

interface ReferralAndAccountProps {
  mode: 'referral' | 'notifications' | 'profile' | 'settings';
  user: AuthUser;
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
  onUserRefresh: (user: AuthUser) => void;
  onNotificationsRead: () => void;
  onNavigate: (route: AppRoute) => void;
}

export function ReferralAndAccount({
  mode,
  user,
  theme,
  onThemeChange,
  onUserRefresh,
  onNotificationsRead,
  onNavigate,
}: ReferralAndAccountProps) {
  // Referral state
  const [referralData, setReferralData] = useState<{
    referralCode: string;
    referralBonusPKR: number;
    totalReferred: number;
    qualifiedCount: number;
    referralEarnedPKR: number;
    referrals: Referral[];
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Notifications state
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // Profile & Settings form state
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [country, setCountry] = useState(user.country);
  const [defaultMethod, setDefaultMethod] = useState<WithdrawalMethod>(
    user.payoutPreferences.defaultMethod
  );
  const [accountTitle, setAccountTitle] = useState(user.payoutPreferences.accountTitle);
  const [accountNumber, setAccountNumber] = useState(user.payoutPreferences.accountNumber);
  const [bankName, setBankName] = useState(user.payoutPreferences.bankName);
  const [emailAlertsEnabled, setEmailAlertsEnabled] = useState(user.emailAlertsEnabled);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setStatusMsg(null);
    setErrorMsg(null);
    async function load() {
      setLoading(true);
      try {
        if (mode === 'referral') {
          const res = await apiRequest<typeof referralData>('/api/referrals');
          setReferralData(res);
        } else if (mode === 'notifications') {
          const res = await apiRequest<{ notifications: AppNotification[] }>('/api/notifications');
          setNotifications(res.notifications);
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to load records.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [mode]);

  const inviteUrl = `${window.location.origin}/?ref=${encodeURIComponent(user.referralCode)}`;

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function handleMarkAllRead() {
    await apiRequest('/api/notifications/read', { method: 'POST', body: {} });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    onNotificationsRead();
  }

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatusMsg(null);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ user: AuthUser }>('/api/profile', {
        method: 'PATCH',
        body: {
          name,
          phone,
          country,
          payoutPreferences: {
            defaultMethod,
            accountTitle,
            accountNumber,
            bankName,
          },
        },
      });
      onUserRefresh(res.user);
      setStatusMsg('Profile and payout preferences saved.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save profile.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSettingsSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatusMsg(null);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ user: AuthUser }>('/api/profile', {
        method: 'PATCH',
        body: {
          themePreference: theme,
          emailAlertsEnabled,
          ...(newPassword ? { currentPassword, newPassword } : {}),
        },
      });
      onUserRefresh(res.user);
      setCurrentPassword('');
      setNewPassword('');
      setStatusMsg('Security and display settings updated.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to update settings.');
    } finally {
      setSaving(false);
    }
  }

  if (loading && (mode === 'referral' || mode === 'notifications')) {
    return (
      <div className="h-64 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
    );
  }

  // ========================
  // REFERRAL PAGE
  // ========================
  if (mode === 'referral' && referralData) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
              3-Level Referral Commission · Level 1: 10% · Level 2: 2% · Level 3: 2%
            </p>
            <h1 className="font-display text-2xl font-bold">Referral Dashboard</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Earn <span className="font-mono font-semibold">10%</span> on Level 1,{' '}
              <span className="font-mono font-semibold">2%</span> on Level 2, and{' '}
              <span className="font-mono font-semibold">2%</span> on Level 3 approved member
              deposits, plus <span className="font-mono font-semibold">{formatPKR(referralData.referralBonusPKR)}</span> verified signup bonus.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              readOnly
              value={inviteUrl}
              className="h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono w-72 max-w-full"
            />
            <button
              type="button"
              onClick={handleCopyLink}
              className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied Link' : 'Copy Invite Link'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
            <p className="text-xs text-slate-500">Total Invited Friends</p>
            <p className="mt-2 font-display text-2xl font-bold tabular-nums">
              {referralData.totalReferred}
            </p>
          </div>
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
            <p className="text-xs text-slate-500">Qualified Referrals</p>
            <p className="mt-2 font-display text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {referralData.qualifiedCount}
            </p>
          </div>
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
            <p className="text-xs text-slate-500">Referral Earnings</p>
            <p className="mt-2 font-display text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
              {formatPKR(referralData.referralEarnedPKR)}
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="font-display text-base font-bold flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" />
              Registered Referrals
            </h2>
            <span className="text-xs font-mono text-slate-500">Code: {referralData.referralCode}</span>
          </div>
          {referralData.referrals.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No referrals registered yet. Share your unique invite link above to invite friends.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                    <th className="py-3 px-5 font-medium">Member</th>
                    <th className="py-3 px-4 font-medium">Registered</th>
                    <th className="py-3 px-4 font-medium">Anti-Fraud Status</th>
                    <th className="py-3 px-5 font-medium text-right">Bonus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {referralData.referrals.map((r) => (
                    <tr key={r.id}>
                      <td className="py-3.5 px-5">
                        <p className="font-medium text-slate-900 dark:text-white">
                          {r.referredUserName}
                        </p>
                        <p className="text-xs text-slate-500">{r.referredUserEmail}</p>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-500 whitespace-nowrap">
                        {formatDateTime(r.createdAt)}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-semibold capitalize whitespace-nowrap">
                        <span
                          className={
                            r.status === 'qualified'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : r.status === 'registered'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-red-600 dark:text-red-400'
                          }
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-right font-mono font-semibold tabular-nums">
                        {formatPKR(r.rewardAmountPKR)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ========================
  // NOTIFICATIONS PAGE
  // ========================
  if (mode === 'notifications') {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold flex items-center gap-2">
              <Bell className="h-5 w-5 text-blue-600" />
              Notifications
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Account alerts, task reward approvals, and payout updates.
            </p>
          </div>
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            Mark all as read
          </button>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
          {notifications.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">No notifications found.</div>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className="p-5 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {n.title}
                    {!n.read && (
                      <span className="ml-2 text-xs font-medium text-blue-600 dark:text-blue-400">
                        · Unread
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{n.message}</p>
                  <p className="text-xs text-slate-500 capitalize">
                    {n.category} · {formatDateTime(n.createdAt)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // ========================
  // USER PROFILE PAGE
  // ========================
  if (mode === 'profile') {
    return (
      <div className="max-w-3xl space-y-6">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold">User Profile</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Manage your personal contact info and default local payout destination.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
          >
            Security &amp; Theme Settings
          </button>
        </div>

        {statusMsg && (
          <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
            {errorMsg}
          </div>
        )}

        <form
          onSubmit={handleProfileSave}
          className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Email Address ({user.emailVerified ? 'Verified' : 'Unverified'})
              </label>
              <input
                type="email"
                readOnly
                value={user.email}
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Phone Number
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+92 300 1234567"
                className="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Country
              </label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
            <h2 className="font-display text-base font-bold">Default Payout Preferences</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Preferred Method
                </label>
                <select
                  value={defaultMethod}
                  onChange={(e) => setDefaultMethod(e.target.value as WithdrawalMethod)}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  <option value="easypaisa">Easypaisa</option>
                  <option value="jazzcash">JazzCash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Account Title
                </label>
                <input
                  type="text"
                  value={accountTitle}
                  onChange={(e) => setAccountTitle(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Account / Mobile Number
                </label>
                <input
                  type="text"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Bank Name (if Bank Transfer)
                </label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Optional"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </div>
    );
  }

  // ========================
  // SETTINGS PAGE
  // ========================
  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
        <h1 className="font-display text-2xl font-bold">Account Settings</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Configure appearance mode, notification alerts, and account password.
        </p>
      </div>

      {statusMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-sm text-emerald-700 dark:text-emerald-300">
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      <form
        onSubmit={handleSettingsSave}
        className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-6"
      >
        <div className="flex items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
          <div>
            <p className="text-sm font-semibold">Interface Theme</p>
            <p className="text-xs text-slate-500">Switch between clean Light and Dark fintech workspace</p>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => onThemeChange('light')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${
                theme === 'light'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Sun className="h-3.5 w-3.5" />
              Light
            </button>
            <button
              type="button"
              onClick={() => onThemeChange('dark')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${
                theme === 'dark'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Moon className="h-3.5 w-3.5" />
              Dark
            </button>
          </div>
        </div>

        <label className="flex items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800 cursor-pointer">
          <div>
            <p className="text-sm font-semibold">Email Payout &amp; Task Alerts</p>
            <p className="text-xs text-slate-500">Receive status updates on task approvals and withdrawals</p>
          </div>
          <input
            type="checkbox"
            checked={emailAlertsEnabled}
            onChange={(e) => setEmailAlertsEnabled(e.target.checked)}
            className="h-4 w-4 accent-blue-600"
          />
        </label>

        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            <span>Change Password (Optional)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              className="h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
            <input
              type="password"
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 8 chars)"
              className="h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
        >
          {saving ? 'Updating...' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
}
