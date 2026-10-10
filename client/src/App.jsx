import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { KeyRound, LogOut, Menu as MenuIcon, Building2 } from 'lucide-react'
import Login from '../components/Login'
import Dashboard from '../components/dashboard/Dashboard'
import Sidebar from '../components/Sidebar'
import StaffManagement from '../components/StaffManagement'
import IncidentLogs from '../components/IncidentLogs'
import ControlRoom from '../components/ControlRoom'
import ActivityLog from '../components/ActivityLog'
import Settings from '../components/Settings'
import ChangePassword from '../components/ChangePassword'
import AlertBanner from '../components/AlertBanner'
import ToastContainer from '../components/ToastContainer'
import IncomingRequestAlert from '../components/dispatch/IncomingRequestAlert'
import DriverApp from '../components/driver/DriverApp'
import { getToken, getStoredUser, saveSession, clearSession, connectSocket, disconnectSocket, AUTH_EVENT, socket } from './api'
import { TooltipProvider, Tip, Button, Skeleton, cn } from './ui'

// Map screens pull in Leaflet, so they load on first visit instead of with the app.
const Register = lazy(() => import('../components/Register'))
const EmergencyDispatch = lazy(() => import('../components/EmergencyDispatch'))
const PageFallback = () => <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-96 rounded-xl" /></div>
import { useSocketEvent } from './useSocketEvent'
import { showToast } from './toast'

// Which tabs each role may open (mirrors the sidebar and the server's role checks)
const TAB_ROLES = {
  dashboard: ['admin', 'staff', 'doctor'],
  emergency: ['admin', 'staff'],
  control: ['admin', 'staff'],
  staff: ['admin'],
  incidents: ['admin', 'staff', 'doctor'],
  activity: ['admin'],
  settings: ['admin', 'staff', 'doctor']
};

const Brand = () => (
  <div className="flex items-center gap-2.5">
    <div className="h-7 w-7 rounded-lg bg-brand-600 text-white flex items-center justify-center text-sm font-bold">B</div>
    <span className="text-sm font-semibold text-slate-900">BMA</span>
  </div>
);

// Centred card used by sign-in, registration and the first-password screen.
const AuthLayout = ({ top, children, wide }) => (
  <div className="min-h-full flex flex-col">
    <ToastContainer />
    <nav className="h-14 bg-white border-b border-line px-4 sm:px-6 flex justify-between items-center">
      <Brand />
      {top}
    </nav>
    <main className="flex-1 flex flex-col items-center px-4 py-10 sm:py-16">
      <div className={cn('w-full bg-white rounded-xl border border-line shadow-sm p-6 sm:p-8', wide ? 'max-w-lg' : 'max-w-sm')}>
        {children}
      </div>
    </main>
  </div>
);

const readCollapsed = () => {
  try { return localStorage.getItem('bma.sidebarCollapsed') === '1'; } catch { return false; }
};

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isLogin, setIsLogin] = useState(true);
  const [user, setUser] = useState(() => (getToken() ? getStoredUser() : null));
  const [alerts, setAlerts] = useState([]);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [connected, setConnected] = useState(socket.connected);

  useSocketEvent('connect', () => setConnected(true));
  useSocketEvent('disconnect', () => setConnected(false));

  const toggleCollapsed = () => {
    setCollapsed(c => {
      try { localStorage.setItem('bma.sidebarCollapsed', c ? '0' : '1'); } catch { /* storage unavailable */ }
      return !c;
    });
  };

  const isLoggedIn = Boolean(user);

  const handleLogout = useCallback((message) => {
    disconnectSocket();
    clearSession();
    setUser(null);
    setAlerts([]);
    setActiveTab('dashboard');
    if (typeof message === 'string') showToast(message, 'info');
  }, []);

  // Live updates only flow while signed in with a password that's been set.
  useEffect(() => {
    if (isLoggedIn && !user.must_change_password) connectSocket();
    else disconnectSocket();
  }, [isLoggedIn, user?.must_change_password]);

  // Session problems reported by the API layer (deactivated account, temporary password)
  useEffect(() => {
    const onAuth = (e) => {
      if (e.detail.type === 'signed_out') handleLogout(e.detail.message);
      if (e.detail.type === 'password_change_required') {
        setUser(prev => {
          if (!prev) return prev;
          const next = { ...prev, must_change_password: true };
          saveSession(null, next);
          return next;
        });
      }
    };
    window.addEventListener(AUTH_EVENT, onAuth);
    return () => window.removeEventListener(AUTH_EVENT, onAuth);
  }, [handleLogout]);

  // The server only sends this hospital's alerts to this socket.
  useSocketEvent('critical_resource_alert', (data) => {
    const id = `${Date.now()}-${Math.random()}`;
    setAlerts(prev => [...prev, { ...data, id }]);
    setTimeout(() => setAlerts(prev => prev.filter(a => a.id !== id)), 8000);
  });

  const dismissAlert = (id) => setAlerts(prev => prev.filter(a => a.id !== id));

  const handleAuthSuccess = () => setUser(getStoredUser());

  // --- Auth View ---
  if (!isLoggedIn) {
    return (
      <AuthLayout
        wide={!isLogin}
        top={
          <Button variant="ghost" size="sm" onClick={() => setIsLogin(!isLogin)}>
            {isLogin ? 'Register a hospital' : 'Sign in instead'}
          </Button>
        }
      >
        <header className="mb-6">
          <h1 className="text-lg font-semibold text-slate-900">{isLogin ? 'Sign in' : 'Register your hospital'}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {isLogin ? 'Use the email your hospital admin set up for you.' : 'Create the admin account and pin your hospital on the map.'}
          </p>
        </header>
        {isLogin ? <Login onSuccess={handleAuthSuccess} /> : (
          <Suspense fallback={<Skeleton className="h-72" />}><Register onSuccess={() => setIsLogin(true)} /></Suspense>
        )}
      </AuthLayout>
    );
  }

  // --- First sign-in with a temporary password ---
  if (user.must_change_password) {
    return (
      <AuthLayout
        top={
          <Button variant="ghost" size="sm" onClick={() => handleLogout()}>
            <LogOut size={14} /> Sign out
          </Button>
        }
      >
        <header className="mb-6">
          <div className="h-9 w-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center mb-3"><KeyRound size={18} /></div>
          <h1 className="text-lg font-semibold text-slate-900">Choose your password</h1>
          <p className="text-sm text-slate-500 mt-1">Hi {user.name}. You signed in with a temporary password from your admin. Set your own to continue.</p>
        </header>
        <ChangePassword forced onDone={() => setUser({ ...user, must_change_password: false })} />
      </AuthLayout>
    );
  }

  // Drivers get their own phone-first app instead of the hospital dashboard.
  if (user.role === 'driver') return <DriverApp user={user} onLogout={() => handleLogout()} />;

  const tab = TAB_ROLES[activeTab]?.includes(user.role) ? activeTab : 'dashboard';

  // --- Signed-in shell ---
  return (
    <TooltipProvider>
      <div className="flex min-h-full">
        <ToastContainer />
        <AlertBanner alerts={alerts} onDismiss={dismissAlert} />
        {['admin', 'staff'].includes(user.role) && <IncomingRequestAlert />}
        <Sidebar
          activeTab={tab}
          setActiveTab={setActiveTab}
          user={user}
          onLogout={() => handleLogout()}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          mobileOpen={mobileNavOpen}
          onMobileOpenChange={setMobileNavOpen}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 bg-white/90 backdrop-blur border-b border-line px-4 sm:px-6 sticky top-0 z-40 flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden -ml-1" onClick={() => setMobileNavOpen(true)} aria-label="Open menu">
              <MenuIcon size={18} />
            </Button>
            <div className="flex items-center gap-2 min-w-0">
              <Building2 size={15} className="text-slate-400 shrink-0" />
              <span className="text-sm font-medium text-slate-700 truncate">{user.hospital}</span>
            </div>
            <div className="ml-auto">
              <Tip content={connected ? 'Receiving live updates' : 'Reconnecting… changes from others may be delayed'}>
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <span className={cn('h-2 w-2 rounded-full', connected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse')} />
                  {connected ? 'Live' : 'Offline'}
                </span>
              </Tip>
            </div>
          </header>

          <main className="flex-1 px-4 sm:px-6 py-6">
            <div className="max-w-6xl mx-auto">
              {tab === 'dashboard' && <Dashboard />}
              {tab === 'emergency' && <Suspense fallback={<PageFallback />}><EmergencyDispatch /></Suspense>}
              {tab === 'staff' && <StaffManagement />}
              {tab === 'control' && <ControlRoom />}
              {tab === 'incidents' && <IncidentLogs />}
              {tab === 'activity' && <ActivityLog />}
              {tab === 'settings' && <Settings user={user} onUserChange={setUser} />}
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}

export default App
