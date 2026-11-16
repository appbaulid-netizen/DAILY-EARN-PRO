import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Search,
  Wallet as WalletIcon,
} from 'lucide-react';
import { apiRequest, formatDateTime, formatPKR } from '../lib/api';
import type { AppRoute, AuthUser, Transaction, Wallet, Withdrawal, WithdrawalMethod } from '../types';

interface WalletAndWithdrawProps {
  mode: 'wallet' | 'transactions' | 'withdraw';
  user: AuthUser;
  onNavigate: (route: AppRoute) => void;
}

export function WalletAndWithdraw({ mode, user, onNavigate }: WalletAndWithdrawProps) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [minWithdrawalPKR, setMinWithdrawalPKR] = useState(50);
  const [requireEmailVerify, setRequireEmailVerify] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state for Transaction History
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | Transaction['type']>('all');

  // Withdraw form state
  const [method, setMethod] = useState<WithdrawalMethod>(user.payoutPreferences.defaultMethod);
  const [accountTitle, setAccountTitle] = useState(user.payoutPreferences.accountTitle || user.name);
  const [accountNumber, setAccountNumber] = useState(user.payoutPreferences.accountNumber || '');
  const [bankName, setBankName] = useState(user.payoutPreferences.bankName || '');
  const [amountPKR, setAmountPKR] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      if (mode === 'withdraw') {
        const res = await apiRequest<{
          wallet: Wallet;
          withdrawals: Withdrawal[];
          minWithdrawalPKR: number;
          requireEmailVerificationForWithdraw: boolean;
        }>('/api/withdrawals');
        setWallet(res.wallet);
        setWithdrawals(res.withdrawals);
        setMinWithdrawalPKR(res.minWithdrawalPKR);
        setRequireEmailVerify(res.requireEmailVerificationForWithdraw);
      } else {
        const res = await apiRequest<{ wallet: Wallet; transactions: Transaction[] }>(
          '/api/wallet'
        );
        setWallet(res.wallet);
        setTransactions(res.transactions);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load financial records.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [mode]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (
        searchQuery.trim() &&
        !t.description.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !t.id.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [transactions, typeFilter, searchQuery]);

  async function handleWithdrawSubmit(e: React.FormEvent) {
    e.preventDefault();
    setWithdrawError(null);
    setWithdrawSuccess(null);
    setSubmitting(true);
    try {
      const res = await apiRequest<{ withdrawal: Withdrawal; wallet: Wallet }>('/api/withdrawals', {
        method: 'POST',
        body: {
          method,
          accountTitle,
          accountNumber,
          bankName: method === 'bank_transfer' ? bankName : '',
          amountPKR: Number(amountPKR),
        },
      });
      setWallet(res.wallet);
      setWithdrawals((prev) => [res.withdrawal, ...prev]);
      setAmountPKR('');
      setWithdrawSuccess(
        `Withdrawal request (${formatPKR(res.withdrawal.amountPKR)}) submitted and pending admin verification.`
      );
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : 'Withdrawal failed.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="h-64 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
    );
  }

  if (error || !wallet) {
    return (
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <p className="text-sm text-red-600 dark:text-red-400">{error || 'Wallet unavailable.'}</p>
      </div>
    );
  }

  // ========================
  // WITHDRAW PAGE
  // ========================
  if (mode === 'withdraw') {
    const blockedByVerification = requireEmailVerify && !user.emailVerified;

    return (
      <div className="space-y-6">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
              Payout Settlement · Easypaisa · JazzCash · Bank Transfer
            </p>
            <h1 className="font-display text-2xl font-bold mt-1">Withdraw Rewards</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Minimum withdrawal threshold is <span className="font-mono font-semibold">{formatPKR(minWithdrawalPKR)}</span>. All balances are verified server-side.
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs text-slate-500">Available for Withdrawal</p>
            <p className="font-display text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatPKR(wallet.availableBalancePKR)}
            </p>
          </div>
        </div>

        {blockedByVerification && (
          <div className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm text-amber-900 dark:text-amber-200">
              Your email address must be verified before requesting a withdrawal.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold whitespace-nowrap shrink-0"
            >
              Verify on Dashboard
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Request Form */}
          <section className="lg:col-span-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5">
            <h2 className="font-display text-lg font-bold flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              New Withdrawal Request
            </h2>

            {withdrawError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{withdrawError}</span>
              </div>
            )}

            {withdrawSuccess && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{withdrawSuccess}</span>
              </div>
            )}

            <form onSubmit={handleWithdrawSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Payout Method
                </label>
                <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                  {(
                    [
                      ['easypaisa', 'Easypaisa'],
                      ['jazzcash', 'JazzCash'],
                      ['bank_transfer', 'Bank'],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setMethod(val)}
                      className={`py-2 px-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                        method === val
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Account Holder Name
                </label>
                <input
                  type="text"
                  required
                  value={accountTitle}
                  onChange={(e) => setAccountTitle(e.target.value)}
                  placeholder="Full legal account title"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  {method === 'bank_transfer' ? 'Account Number / IBAN' : 'Mobile Wallet Number'}
                </label>
                <input
                  type="text"
                  required
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder={method === 'bank_transfer' ? 'PK00MEZN0000000000' : '03001234567'}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
                />
              </div>

              {method === 'bank_transfer' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Bank Name
                  </label>
                  <input
                    type="text"
                    required
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="Meezan Bank / HBL / UBL"
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Amount (PKR · Min {minWithdrawalPKR})
                </label>
                <input
                  type="number"
                  required
                  min={minWithdrawalPKR}
                  max={wallet.availableBalancePKR}
                  value={amountPKR}
                  onChange={(e) => setAmountPKR(e.target.value)}
                  placeholder={String(minWithdrawalPKR)}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || blockedByVerification}
                className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold"
              >
                {submitting ? 'Submitting Request...' : 'Submit Withdrawal Request'}
              </button>
            </form>
          </section>

          {/* Withdrawal History */}
          <section className="lg:col-span-7 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-display text-lg font-bold">Withdrawal History</h2>
            </div>
            {withdrawals.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                No withdrawal requests submitted yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                      <th className="py-3 px-5 font-medium">Channel &amp; Account</th>
                      <th className="py-3 px-4 font-medium">Date</th>
                      <th className="py-3 px-4 font-medium">Status</th>
                      <th className="py-3 px-5 font-medium text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {withdrawals.map((w) => (
                      <tr key={w.id}>
                        <td className="py-3.5 px-5">
                          <p className="font-medium capitalize text-slate-900 dark:text-white">
                            {w.method.replace('_', ' ')}
                            {w.bankName ? ` · ${w.bankName}` : ''}
                            {w.isDemo ? ' · Demo' : ''}
                          </p>
                          <p className="text-xs font-mono text-slate-500 mt-0.5">
                            {w.accountTitle} · {w.accountNumber}
                          </p>
                          {w.adminNote && (
                            <p className="text-xs text-slate-500 mt-0.5">{w.adminNote}</p>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-500 whitespace-nowrap">
                          {formatDateTime(w.createdAt)}
                        </td>
                        <td className="py-3.5 px-4 text-xs font-semibold capitalize whitespace-nowrap">
                          <span
                            className={
                              w.status === 'paid' || w.status === 'approved'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : w.status === 'pending'
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-red-600 dark:text-red-400'
                            }
                          >
                            {w.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-5 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                          {formatPKR(w.amountPKR)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  // ========================
  // WALLET & TRANSACTION HISTORY
  // ========================
  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
            Server-Calculated Ledger
          </p>
          <h1 className="font-display text-2xl font-bold mt-1">
            {mode === 'wallet' ? 'Reward Wallet' : 'Transaction History'}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('deposit')}
            className="px-4 py-2 rounded-xl border border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-500 text-xs font-semibold hover:bg-blue-50 dark:hover:bg-blue-950/40 whitespace-nowrap"
          >
            Deposit (Easypaisa / JazzCash)
          </button>
          {mode === 'wallet' && (
            <button
              type="button"
              onClick={() => onNavigate('transactions')}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              Full Ledger
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate('withdraw')}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold whitespace-nowrap"
          >
            Withdraw Funds
          </button>
        </div>
      </div>

      {/* Wallet Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs text-slate-500">Available Balance</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatPKR(wallet.availableBalancePKR)}
          </p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs text-slate-500">Pending Approval</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
            {formatPKR(wallet.pendingBalancePKR)}
          </p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs text-slate-500">Lifetime Approved Earnings</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {formatPKR(wallet.totalEarnedPKR)}
          </p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs text-slate-500">Total Settled Payouts</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
            {formatPKR(wallet.totalWithdrawnPKR)}
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <WalletIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h2 className="font-display text-base font-bold">Ledger Entries</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search description or ID"
                className="h-9 pl-9 pr-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
              />
            </div>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
              {(
                [
                  ['all', 'All'],
                  ['task_reward', 'Tasks'],
                  ['deposit', 'Deposits'],
                  ['referral_bonus', 'Referrals'],
                  ['withdrawal', 'Withdrawals'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTypeFilter(key)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap ${
                    typeFilter === key
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredTransactions.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No matching ledger records found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                  <th className="py-3 px-5 font-medium">Reference &amp; Description</th>
                  <th className="py-3 px-4 font-medium">Type</th>
                  <th className="py-3 px-4 font-medium">Timestamp</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-5 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTransactions.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3.5 px-5">
                      <p className="font-medium text-slate-900 dark:text-white">{t.description}</p>
                      <p className="text-xs font-mono text-slate-500 mt-0.5">{t.id}</p>
                    </td>
                    <td className="py-3.5 px-4 text-xs capitalize text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {t.type.replace('_', ' ')}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-500 whitespace-nowrap">
                      {formatDateTime(t.createdAt)}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-semibold capitalize whitespace-nowrap">
                      <span
                        className={
                          t.status === 'completed'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : t.status === 'pending'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-red-600 dark:text-red-400'
                        }
                      >
                        {t.status}
                      </span>
                    </td>
                    <td
                      className={`py-3.5 px-5 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                        t.amountPKR >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-900 dark:text-slate-200'
                      }`}
                    >
                      {t.amountPKR >= 0 ? `+${formatPKR(t.amountPKR)}` : formatPKR(t.amountPKR)}
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
