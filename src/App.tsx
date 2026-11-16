import { useEffect, useState } from 'react';
import {
  Bell,
  CreditCard,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  PlayCircle,
  ReceiptText,
  Settings,
  ShieldCheck,
  User,
  Users,
  Wallet as WalletIcon,
  X,
} from 'lucide-react';
import { AdminDashboard } from './components/AdminDashboard';
import { AuthPages } from './components/AuthPages';
import { BrandLogo } from './components/BrandLogo';
import { DepositPaymentPage } from './components/DepositPaymentPage';
import { MemberDashboard } from './components/MemberDashboard';
import { PlansAndTasks } from './components/PlansAndTasks';
import { PublicInfoPages } from './components/PublicInfoPages';
import { ReferralAndAccount } from './components/ReferralAndAccount';
import { WalletAndWithdraw } from './components/WalletAndWithdraw';
import { apiRequest, formatPKR, setSessionToken } from './lib/api';
import type { AppRoute, AuthUser, Wallet } from './types';

const PUBLIC_INFO_ROUTES: AppRoute[] = ['about', 'contact', 'privacy', 'terms'];
const AUTH_ONLY_ROUTES: AppRoute[] = ['login', 'register', 'forgot-password'];

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [booting, setBooting] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('asad_theme');
    return saved === 'dark' ? 'dark' : 'light';
  });

  // Read optional ?ref= parameter on initial boot
  const [initialRefCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('ref') || '';
  });

  // Strict Login-First Requirement: initial route is always login (or register if ?ref= present)
  const [route, setRoute] = useState<AppRoute>(() => (initialRefCode ? 'register' : 'login'));

  // Sync Tailwind dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('asad_theme', theme);
  }, [theme]);

  async function refreshSession() {
    try {
      const res = await apiRequest<{
        user: AuthUser;
        wallet: Wallet;
        unreadNotifications: number;
      }>('/api/auth/me');
      setUser(res.user);
      setWallet(res.wallet);
      setUnreadNotifications(res.unreadNotifications);
      setRoute((prev) => {
        if (AUTH_ONLY_ROUTES.includes(prev)) {
          return res.user.isOwner && res.user.role === 'admin' ? 'admin' : 'dashboard';
        }
        return prev;
      });
    } catch {
      setUser(null);
      setWallet(null);
    } finally {
      setBooting(false);
    }
  }

  useEffect(() => {
    refreshSession();
  }, []);

  // Route guard: never render protected pages before login
  function navigate(nextRoute: AppRoute) {
    setMobileMenuOpen(false);
    if (!user) {
      if (AUTH_ONLY_ROUTES.includes(nextRoute) || PUBLIC_INFO_ROUTES.includes(nextRoute)) {
        setRoute(nextRoute);
      } else {
        setRoute('login');
      }
      return;
    }
    if (nextRoute === 'admin' && !(user.isOwner && user.role === 'admin')) {
      setRoute('dashboard');
      return;
    }
    setRoute(nextRoute);
  }

  function handleAuthenticated(authedUser: AuthUser) {
    setUser(authedUser);
    refreshSession();
    setRoute(authedUser.isOwner && authedUser.role === 'admin' ? 'admin' : 'dashboard');
  }

  async function handleLogout() {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setSessionToken(null);
    setUser(null);
    setWallet(null);
    setUnreadNotifications(0);
    setRoute('login');
  }

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 text-sm">
        Verifying session...
      </div>
    );
  }

  // Unauthenticated gate: strictly show Login / Register / Forgot Password or Public Info
  if (!user) {
    if (
      route === 'about' ||
      route === 'contact' ||
      route === 'privacy' ||
      route === 'terms'
    ) {
      return <PublicInfoPages route={route} isAuthenticated={false} onNavigate={navigate} />;
    }

    const authRoute =
      route === 'register' || route === 'forgot-password'
        ? route
        : 'login';

    return (
      <AuthPages
        route={authRoute}
        initialReferralCode={initialRefCode}
        onNavigate={navigate}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  // Authenticated Sidebar Navigation (strictly matches requested menu items)
  const navItems: Array<{
    id: AppRoute;
    label: string;
    icon: typeof LayoutDashboard;
    matches: AppRoute[];
  }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, matches: ['dashboard'] },
    { id: 'plans', label: 'Plans', icon: Layers, matches: ['plans'] },
    { id: 'tasks', label: 'Earn', icon: PlayCircle, matches: ['tasks', 'watch', 'rewards'] },
    { id: 'wallet', label: 'Wallet', icon: WalletIcon, matches: ['wallet', 'transactions'] },
    { id: 'deposit', label: 'Deposit / Pay', icon: ReceiptText, matches: ['deposit'] },
    { id: 'withdraw', label: 'Withdraw', icon: CreditCard, matches: ['withdraw'] },
    { id: 'referral', label: 'Referral', icon: Users, matches: ['referral'] },
    {
      id: 'profile',
      label: 'Profile',
      icon: User,
      matches: ['profile', 'settings', 'notifications'],
    },
  ];

  if (user.isOwner && user.role === 'admin') {
    navItems.push({
      id: 'admin',
      label: 'Owner Approvals',
      icon: ShieldCheck,
      matches: ['admin'],
    });
  }

  const pageLabels: Record<AppRoute, string> = {
    login: 'Sign In',
    register: 'Register',
    'forgot-password': 'Forgot Password',
    dashboard: 'Home Dashboard',
    plans: 'Membership Plans',
    tasks: 'Available Tasks',
    watch: 'Watch & Earn',
    rewards: 'My Rewards',
    wallet: 'Reward Wallet',
    deposit: 'Deposit / Easypaisa & JazzCash',
    transactions: 'Transaction History',
    withdraw: 'Withdraw',
    referral: 'Referral Program',
    notifications: 'Notifications',
    profile: 'User Profile',
    settings: 'Account Settings',
    about: 'About Us',
    contact: 'Contact Us',
    privacy: 'Privacy Policy',
    terms: 'Terms & Conditions',
    admin: 'Owner Approvals',
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col justify-between border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <div className="space-y-8">
          <button
            type="button"
            onClick={() => navigate('dashboard')}
            className="text-left focus-visible:outline-2 focus-visible:outline-blue-600 rounded-md"
          >
            <BrandLogo size="sm" />
          </button>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = item.matches.includes(route);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Sub-links for quick access */}
          <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-1">
            <button
              type="button"
              onClick={() => navigate('rewards')}
              className="w-full text-left px-3.5 py-2 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              My Rewards History
            </button>
            <button
              type="button"
              onClick={() => navigate('transactions')}
              className="w-full text-left px-3.5 py-2 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              Transaction Ledger
            </button>
            <button
              type="button"
              onClick={() => navigate('notifications')}
              className="w-full text-left px-3.5 py-2 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-between"
            >
              <span>Notifications</span>
              {unreadNotifications > 0 && (
                <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                  {unreadNotifications}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => navigate('settings')}
              className="w-full text-left px-3.5 py-2 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-2"
            >
              <Settings className="h-3.5 w-3.5" />
              <span>Settings</span>
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="text-xs">
            <p className="font-semibold text-slate-900 dark:text-white truncate">{user.name}</p>
            <p className="text-slate-500 truncate">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 h-10 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb/Title — Quick Links — Primary Action */}
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-6 flex items-center justify-between gap-8 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              <Menu className="h-4 w-4" />
            </button>
            <span className="font-display font-bold text-sm sm:text-base truncate">
              {pageLabels[route]}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-6 text-xs text-slate-500 dark:text-slate-400">
            <button
              type="button"
              onClick={() => navigate('wallet')}
              className="hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0 font-mono tabular-nums"
            >
              Available: {wallet ? formatPKR(wallet.availableBalancePKR) : 'PKR 0'}
            </button>
            <button
              type="button"
              onClick={() => navigate('notifications')}
              className="hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Bell className="h-3.5 w-3.5" />
              <span>Alerts ({unreadNotifications})</span>
            </button>
          </div>

          <div className="shrink-0">
            <button
              type="button"
              onClick={handleLogout}
              className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold whitespace-nowrap"
            >
              Sign Out
            </button>
          </div>
        </header>

        {/* Viewport Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {route === 'dashboard' && (
            <MemberDashboard
              onNavigate={navigate}
              onUserRefresh={(updated) => setUser(updated)}
            />
          )}
          {(route === 'plans' || route === 'tasks' || route === 'watch' || route === 'rewards') && (
            <PlansAndTasks
              mode={route}
              selectedTaskId={selectedTaskId}
              onSelectTask={setSelectedTaskId}
              onNavigate={navigate}
              onUserRefresh={(updated) => setUser(updated)}
            />
          )}
          {(route === 'wallet' || route === 'transactions' || route === 'withdraw') && (
            <WalletAndWithdraw mode={route} user={user} onNavigate={navigate} />
          )}
          {route === 'deposit' && <DepositPaymentPage onWalletUpdated={refreshSession} />}
          {(route === 'referral' ||
            route === 'notifications' ||
            route === 'profile' ||
            route === 'settings') && (
            <ReferralAndAccount
              mode={route}
              user={user}
              theme={theme}
              onThemeChange={setTheme}
              onUserRefresh={(updated) => setUser(updated)}
              onNotificationsRead={() => setUnreadNotifications(0)}
              onNavigate={navigate}
            />
          )}
          {(route === 'about' ||
            route === 'contact' ||
            route === 'privacy' ||
            route === 'terms') && (
            <PublicInfoPages route={route} isAuthenticated={true} onNavigate={navigate} />
          )}
          {route === 'admin' && user.isOwner && user.role === 'admin' && <AdminDashboard />}
        </main>

        {/* Quiet Authenticated Footer */}
        <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-6 py-4">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <span>Honey &amp; Bunny Invest · Secure Investment &amp; Payouts</span>
            <div className="flex flex-wrap items-center gap-4">
              <button type="button" onClick={() => navigate('about')} className="hover:text-slate-900 dark:hover:text-white">
                About Us
              </button>
              <button type="button" onClick={() => navigate('contact')} className="hover:text-slate-900 dark:hover:text-white">
                Contact Us
              </button>
              <button type="button" onClick={() => navigate('privacy')} className="hover:text-slate-900 dark:hover:text-white">
                Privacy Policy
              </button>
              <button type="button" onClick={() => navigate('terms')} className="hover:text-slate-900 dark:hover:text-white">
                Terms &amp; Conditions
              </button>
            </div>
          </div>
        </footer>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-white dark:bg-slate-900 h-full p-5 flex flex-col justify-between border-r border-slate-200 dark:border-slate-800 z-10">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <BrandLogo size="sm" />
                <button
                  type="button"
                  aria-label="Close navigation"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-slate-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <nav className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = item.matches.includes(route);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigate(item.id)}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium ${
                        active
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full h-11 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold flex items-center justify-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}
