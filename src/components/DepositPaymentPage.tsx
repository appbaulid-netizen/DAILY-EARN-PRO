import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  FileImage,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import {
  apiRequest,
  fetchAuthorizedImageBlobUrl,
  formatDateTime,
  formatPKR,
} from '../lib/api';
import type { DepositMethod, DepositReceiver, PaymentRecord, Wallet } from '../types';

const DEFAULT_RECEIVERS: DepositReceiver[] = [
  {
    method: 'Easypaisa',
    accountNumber: '03424800275',
    accountHolderName: 'Muhammadanwar',
  },
  {
    method: 'JazzCash',
    accountNumber: '03094987870',
    accountHolderName: 'Shemem Akhtar',
  },
];

interface DepositPaymentPageProps {
  onWalletUpdated?: () => void;
}

export function DepositPaymentPage({ onWalletUpdated }: DepositPaymentPageProps) {
  const [receivers, setReceivers] = useState<DepositReceiver[]>(DEFAULT_RECEIVERS);
  const [selectedMethod, setSelectedMethod] = useState<DepositMethod>('Easypaisa');
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [copiedMethod, setCopiedMethod] = useState<DepositMethod | null>(null);

  // Payment submission state
  const [amountPKR, setAmountPKR] = useState(() => {
    const prefilled = sessionStorage.getItem('asad_selected_deposit_amount');
    if (prefilled) {
      sessionStorage.removeItem('asad_selected_deposit_amount');
      return prefilled;
    }
    return '';
  });
  const [transactionId, setTransactionId] = useState('');
  const [note, setNote] = useState(() => {
    const prefilledPlan = sessionStorage.getItem('asad_selected_deposit_plan');
    if (prefilledPlan) {
      sessionStorage.removeItem('asad_selected_deposit_plan');
      return `Plan deposit: ${prefilledPlan}`;
    }
    return '';
  });
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string>('');
  const [screenshotName, setScreenshotName] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Screenshot lightbox state
  const [previewPayment, setPreviewPayment] = useState<PaymentRecord | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);

  const activeReceiver =
    receivers.find((r) => r.method === selectedMethod) || receivers[0] || DEFAULT_RECEIVERS[0];

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;
    if (!previewPayment) {
      setPreviewBlobUrl(null);
      return;
    }
    fetchAuthorizedImageBlobUrl(`/api/payments/${previewPayment.id}/screenshot`)
      .then((url) => {
        if (!active) {
          URL.revokeObjectURL(url);
          return;
        }
        createdUrl = url;
        setPreviewBlobUrl(url);
      })
      .catch(() => {
        if (active) setPreviewBlobUrl(null);
      });
    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [previewPayment]);

  async function loadPayments() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiRequest<{
        receivers?: DepositReceiver[];
        receiver?: DepositReceiver;
        wallet: Wallet;
        payments: PaymentRecord[];
      }>('/api/payments');
      if (Array.isArray(res.receivers) && res.receivers.length > 0) {
        setReceivers(res.receivers);
      } else if (res.receiver) {
        setReceivers([res.receiver]);
      }
      setWallet(res.wallet);
      setPayments(res.payments);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to load payment records.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPayments();
  }, []);

  async function handleCopyAccountNumber(receiver: DepositReceiver) {
    try {
      await navigator.clipboard.writeText(receiver.accountNumber);
      setCopiedMethod(receiver.method);
      setTimeout(() => setCopiedMethod((prev) => (prev === receiver.method ? null : prev)), 2000);
    } catch {
      setCopiedMethod(null);
    }
  }

  function handleScreenshotFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSubmitError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setScreenshotDataUrl('');
      setScreenshotName('');
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setSubmitError('Please select a PNG, JPG, or WEBP payment screenshot.');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setSubmitError('Screenshot file size must be 4MB or smaller.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setScreenshotDataUrl(reader.result);
        setScreenshotName(file.name);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmitPayment(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!screenshotDataUrl) {
      setSubmitError(`Please upload your ${selectedMethod} payment screenshot before submitting.`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<{ payment: PaymentRecord; message: string }>('/api/payments', {
        method: 'POST',
        body: {
          method: selectedMethod,
          amountPKR: Number(amountPKR),
          transactionId,
          screenshotDataUrl,
          note,
        },
      });
      setPayments((prev) => [res.payment, ...prev]);
      setAmountPKR('');
      setTransactionId('');
      setNote('');
      setScreenshotDataUrl('');
      setScreenshotName('');
      setSubmitSuccess(res.message);
      onWalletUpdated?.();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to submit payment request.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="h-72 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
    );
  }

  if (loadError) {
    return (
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Summary */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
            Easypaisa &amp; JazzCash Manual Verification · Admin Approved
          </p>
          <h1 className="font-display text-2xl font-bold mt-1">Deposit &amp; Payment Verification</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Send payment to our official Easypaisa or JazzCash account, upload your receipt
            screenshot, and wait for administrator verification. Wallet balance updates strictly
            after admin approval.
          </p>
        </div>
        {wallet && (
          <div className="text-left sm:text-right shrink-0">
            <p className="text-xs text-slate-500">Current Available Balance</p>
            <p className="font-display text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatPKR(wallet.availableBalancePKR)}
            </p>
          </div>
        )}
      </div>

      {/* Main Split: Left Receiver Details + Status Guide, Right Submission Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Official Easypaisa & JazzCash Accounts Card */}
        <section className="lg:col-span-5 space-y-6">
          <div className="rounded-2xl bg-slate-900 text-white border border-slate-800 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Official Deposit Accounts</h2>
              <ShieldCheck className="h-5 w-5 text-blue-400 shrink-0" />
            </div>

            <div className="space-y-4">
              {receivers.map((acc) => {
                const isSelected = selectedMethod === acc.method;
                const isCopied = copiedMethod === acc.method;
                return (
                  <div
                    key={acc.method}
                    className={`rounded-xl border p-4 space-y-3 transition-colors ${
                      isSelected
                        ? 'border-blue-500 bg-slate-950/90'
                        : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-slate-400">
                          Payment Method
                        </p>
                        <p className="text-base font-bold text-white">{acc.method}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedMethod(acc.method)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {isSelected ? 'Selected' : `Pay via ${acc.method}`}
                      </button>
                    </div>

                    <div>
                      <p className="text-xs text-slate-400">Account Number</p>
                      <div className="mt-1.5 flex items-center justify-between gap-3 rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5">
                        <span className="font-mono text-lg font-bold tracking-wide text-blue-400 tabular-nums">
                          {acc.accountNumber}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyAccountNumber(acc)}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                        >
                          {isCopied ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          {isCopied ? 'Copied' : 'Copy Number'}
                        </button>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-slate-400">Account Holder Name</p>
                      <p className="mt-0.5 text-sm font-semibold text-white">
                        {acc.accountHolderName}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-slate-800 text-xs text-slate-300 space-y-1.5 leading-relaxed">
              <p className="font-semibold text-white">Verification Policy</p>
              <p>• Uploading a screenshot does not credit your balance automatically.</p>
              <p>
                • Every Transaction ID is verified against Easypaisa / JazzCash records before
                approval.
              </p>
            </div>
          </div>

          {/* Payment Status Reference */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-3">
            <h3 className="font-display text-sm font-bold">Payment Status Definitions</h3>
            <div className="space-y-2.5 text-xs text-slate-600 dark:text-slate-400">
              <p>
                <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                  PENDING:
                </span>{' '}
                Payment is waiting for verification.
              </p>
              <p>
                <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  APPROVED:
                </span>{' '}
                Admin has verified the payment.
              </p>
              <p>
                <span className="font-mono font-semibold text-red-600 dark:text-red-400">
                  REJECTED:
                </span>{' '}
                Admin has rejected the payment.
              </p>
            </div>
          </div>
        </section>

        {/* Right: Payment Submission Form */}
        <section className="lg:col-span-7 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5">
          <div>
            <h2 className="font-display text-lg font-bold">Submit Payment Proof</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Select Easypaisa or JazzCash, enter your exact transfer amount and Transaction ID
              (TID), and upload the screenshot receipt.
            </p>
          </div>

          {submitError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          {submitSuccess && (
            <div
              role="status"
              className="flex items-start gap-2.5 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-sm text-emerald-800 dark:text-emerald-300"
            >
              <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
              <span>{submitSuccess}</span>
            </div>
          )}

          <form onSubmit={handleSubmitPayment} className="space-y-4">
            <div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                Select Deposit Method
              </p>
              <div className="grid grid-cols-2 gap-3">
                {receivers.map((acc) => {
                  const active = selectedMethod === acc.method;
                  return (
                    <button
                      key={acc.method}
                      type="button"
                      onClick={() => setSelectedMethod(acc.method)}
                      className={`p-3 rounded-xl border text-left transition-colors ${
                        active
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-white'
                          : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-blue-500'
                      }`}
                    >
                      <p className="text-xs font-bold">{acc.method}</p>
                      <p className="text-xs font-mono mt-0.5">{acc.accountNumber}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {acc.accountHolderName}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                Quick-Select Investment Plan Amount (Min Deposit PKR 300)
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  300, 900, 1500, 2700, 4500, 9000, 18000, 36000, 72000, 144000, 210000, 300000,
                  510000,
                ].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      setAmountPKR(String(amt));
                      setNote(`Investment ${amt.toLocaleString()} Plan`);
                    }}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-semibold transition-colors ${
                      Number(amountPKR) === amt
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-blue-500'
                    }`}
                  >
                    {amt.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Payment Amount (PKR · Min 300)
                </label>
                <input
                  type="number"
                  required
                  min={300}
                  max={5000000}
                  value={amountPKR}
                  onChange={(e) => setAmountPKR(e.target.value)}
                  placeholder="e.g. 300"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  {selectedMethod} Transaction ID (TID)
                </label>
                <input
                  type="text"
                  required
                  minLength={6}
                  maxLength={40}
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  placeholder={selectedMethod === 'JazzCash' ? 'e.g. JC8923410982' : 'e.g. EP8923410982'}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Upload Payment Screenshot (PNG, JPG, WEBP · Max 4MB)
              </label>
              <label className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-6 cursor-pointer hover:border-blue-600 transition-colors">
                <Upload className="h-5 w-5 text-blue-600 dark:text-blue-400 mb-2" />
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {screenshotName ? screenshotName : `Click to select ${selectedMethod} screenshot`}
                </span>
                <span className="text-[11px] text-slate-500 mt-1">
                  Must clearly display amount, receiver {activeReceiver.accountNumber} (
                  {activeReceiver.accountHolderName}), and TID
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleScreenshotFileChange}
                  className="sr-only"
                />
              </label>

              {screenshotDataUrl && (
                <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={screenshotDataUrl}
                      alt="Selected payment receipt preview"
                      className="h-12 w-12 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{screenshotName}</p>
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                        Image ready for secure upload
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setScreenshotDataUrl('');
                      setScreenshotName('');
                    }}
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
                    aria-label="Remove screenshot"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Note (Optional)
              </label>
              <input
                type="text"
                maxLength={200}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Investment 300 Plan payment"
                className="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
            >
              {submitting ? 'Uploading & Submitting...' : `Submit ${selectedMethod} Payment Request`}
            </button>
          </form>
        </section>
      </div>

      {/* User Payment History */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold">My Payment History</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Track your Easypaisa &amp; JazzCash submissions, screenshots, verification statuses,
              and admin notes.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500">{payments.length} record(s)</span>
        </div>

        {payments.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <FileImage className="h-8 w-8 text-slate-300 dark:text-slate-700 mx-auto" />
            <p className="text-sm text-slate-500">
              No Easypaisa or JazzCash payment requests submitted yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                  <th className="py-3.5 px-5 font-medium">Transaction ID &amp; Method</th>
                  <th className="py-3.5 px-4 font-medium">Payment Date</th>
                  <th className="py-3.5 px-4 font-medium">Screenshot</th>
                  <th className="py-3.5 px-4 font-medium">Status &amp; Verification</th>
                  <th className="py-3.5 px-5 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3.5 px-5">
                      <p className="font-mono font-semibold text-slate-900 dark:text-white">
                        {p.transactionId}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {p.method} · To {p.receiverAccountNumber} ({p.receiverAccountHolder})
                      </p>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-500 whitespace-nowrap">
                      {formatDateTime(p.createdAt)}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setPreviewPayment(p)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-blue-600 text-xs font-semibold inline-flex items-center gap-1.5"
                      >
                        <Eye className="h-3.5 w-3.5 text-blue-600" />
                        View Screenshot
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      {p.status === 'PENDING' && (
                        <div>
                          <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                            PENDING
                          </span>
                          <p className="text-slate-500 mt-0.5">
                            Payment is waiting for verification.
                          </p>
                        </div>
                      )}
                      {p.status === 'APPROVED' && (
                        <div>
                          <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                            APPROVED
                          </span>
                          <p className="text-slate-500 mt-0.5">
                            Admin has verified the payment.
                          </p>
                        </div>
                      )}
                      {p.status === 'REJECTED' && (
                        <div>
                          <span className="font-mono font-semibold text-red-600 dark:text-red-400">
                            REJECTED
                          </span>
                          <p className="text-slate-500 mt-0.5">
                            Admin has rejected the payment.
                          </p>
                          {p.rejectionReason && (
                            <p className="text-red-600 dark:text-red-400 font-medium mt-0.5">
                              Reason: {p.rejectionReason}
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-5 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                      {formatPKR(p.amountPKR)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Secure Screenshot Viewer Modal */}
      {previewPayment && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-bold">
                  Payment Screenshot · {previewPayment.transactionId}
                </h3>
                <p className="text-xs text-slate-500">
                  {formatPKR(previewPayment.amountPKR)} · Status: {previewPayment.status}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close screenshot viewer"
                onClick={() => setPreviewPayment(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 bg-slate-100 dark:bg-slate-950 flex items-center justify-center max-h-[75vh] overflow-auto">
              {previewBlobUrl ? (
                <img
                  src={previewBlobUrl}
                  alt={`Payment receipt for ${previewPayment.transactionId}`}
                  className="max-h-[65vh] w-auto rounded-lg border border-slate-200 dark:border-slate-800 object-contain"
                />
              ) : (
                <p className="text-xs text-slate-500 py-8">Loading screenshot...</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
