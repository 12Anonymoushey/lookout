import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bus,
  Check,
  CreditCard,
  Eye,
  EyeOff,
  Gauge,
  Hand,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Phone,
  Radio,
  ShieldCheck,
  User,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  EMAIL_RE,
  ROLE_META,
  friendlyAuthError,
  isValidPlate,
  normalizePhone,
  normalizePlate,
} from '../services/authService.js';

const EMPTY = {
  fullName: '',
  email: '',
  phone: '',
  plate: '',
  password: '',
  confirm: '',
};

/**
 * ONLY these two tabs exist. The admin account is deliberately invisible here:
 * the admin simply logs in through the Commuter or the Driver tab (see
 * ADMIN_EMAILS in services/authService.js) and gets the console afterwards.
 */
const AUTH_TABS = [ROLE_META.commuter, ROLE_META.driver];

const BANNER_POINTS = [
  { icon: MapPin, text: 'Live LPTRP jeepneys on an OpenStreetMap' },
  { icon: Hand, text: 'Poke an approaching jeepney — one tap' },
  { icon: Gauge, text: 'Fare and ETA before you even board' },
  { icon: Bus, text: 'Drivers: manage plates, mark Full or Vacant' },
];

/**
 * AUTH SCREEN
 * Left  — the Look Out! brand banner.
 * Right — Commuter / Driver tabs drawn as browser-style trapezoids, with
 *         Login as the default view and a link down to Signup underneath.
 */
export default function AuthScreen() {
  const { signIn, signUp, enterDemo, firebaseMissing } = useAuth();

  const [role, setRole] = useState('commuter');
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState('');

  const isSignup = mode === 'signup';
  const meta = ROLE_META[role];

  const set = (key) => (event) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev));
    setBanner('');
  };

  const switchTab = (nextRole) => {
    setRole(nextRole);
    setErrors({});
    setBanner('');
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setErrors({});
    setBanner('');
    setForm((prev) => ({ ...prev, password: '', confirm: '' }));
  };

  const passwordMatches = form.confirm.length > 0 && form.password === form.confirm;

  /* ------------------------------- validation ------------------------------ */
  const validate = () => {
    const next = {};

    if (isSignup && form.fullName.trim().length < 3) {
      next.fullName = 'Enter your full name (at least 3 characters).';
    }
    if (!EMAIL_RE.test(form.email.trim())) {
      next.email = 'Enter a valid email address — this is your username.';
    }
    const phoneDigits = normalizePhone(form.phone).length;
    if (isSignup && (phoneDigits < 10 || phoneDigits > 13)) {
      next.phone = 'Enter a valid mobile number, e.g. 09171234567.';
    }
    if (isSignup && role === 'driver' && !isValidPlate(form.plate)) {
      next.plate = 'Enter your plate / body number (e.g. BMS 1930).';
    }
    if (form.password.length < 6) {
      next.password = 'Password must be at least 6 characters.';
    }
    if (isSignup && form.password !== form.confirm) {
      next.confirm = 'Passwords do not match.';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setBanner('');
    if (!validate()) return;

    setBusy(true);
    try {
      if (isSignup) {
        await signUp({
          role,
          fullName: form.fullName,
          email: form.email,
          phone: form.phone,
          password: form.password,
          plate: role === 'driver' ? normalizePlate(form.plate) : '',
        });
      } else {
        await signIn({ role, email: form.email, password: form.password });
      }
    } catch (err) {
      setBanner(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  /* --------------------------------- render -------------------------------- */
  return (
    <div className="min-h-dvh bg-slate-950 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* ============================ BANNER ============================ */}
      <BrandBanner />

      {/* ========================== AUTH PANEL ========================== */}
      <main className="flex items-start justify-center px-4 pb-10 pt-4 sm:px-8 lg:items-center lg:py-12">
        <div className="w-full max-w-md">
          {/* role tabs — browser-style */}
          <div className="chrome-tabs" role="tablist" aria-label="Choose account type">
            {AUTH_TABS.map((entry) => {
              const Icon = entry.id === 'driver' ? Bus : Users;
              const selected = role === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`panel-${entry.id}`}
                  id={`tab-${entry.id}`}
                  onClick={() => switchTab(entry.id)}
                  className="chrome-tab"
                >
                  <Icon size={15} />
                  {entry.label}
                  <span className="chrome-tab__hint">{isSignup ? 'signup' : 'login'}</span>
                </button>
              );
            })}
          </div>

          <div
            role="tabpanel"
            id={`panel-${role}`}
            aria-labelledby={`tab-${role}`}
            className="rounded-b-2xl rounded-tr-2xl border border-slate-800 bg-[var(--lo-panel)] p-5 shadow-2xl sm:p-6"
          >
            <header className="mb-5">
              <h2 className="text-lg font-extrabold tracking-tight text-slate-50">
                {isSignup ? `Sign up as a ${meta.label}` : `${meta.label} login`}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                {isSignup
                  ? `Create your Look Out! ${meta.label.toLowerCase()} account.`
                  : meta.blurb}
              </p>
            </header>

            {firebaseMissing && (
              <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-amber-200">
                <p className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle size={13} /> Firebase is not configured yet
                </p>
                <p className="mt-1">
                  Paste your web config into{' '}
                  <code className="rounded bg-slate-900/70 px-1 py-0.5 font-mono">
                    frontend/src/services/firebase.js
                  </code>{' '}
                  and publish the rules from <code className="font-mono">/firestore.rules</code>.
                </p>
                <button
                  type="button"
                  onClick={() => enterDemo(role)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-400/50 bg-amber-400/10 px-2.5 py-1.5 font-bold transition hover:bg-amber-400/20"
                >
                  <Radio size={12} /> Continue in demo mode as {meta.label}
                </button>
              </div>
            )}

            {banner && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-200">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <p>{banner}</p>
              </div>
            )}

            <form onSubmit={onSubmit} noValidate className="space-y-3.5">
              {isSignup && (
                <Field
                  icon={User}
                  label="Full name"
                  error={errors.fullName}
                  value={form.fullName}
                  onChange={set('fullName')}
                  placeholder="Juan Dela Cruz"
                  autoComplete="name"
                />
              )}

              <Field
                icon={Mail}
                label={isSignup ? 'Email' : 'Email / username'}
                error={errors.email}
                value={form.email}
                onChange={set('email')}
                placeholder="you@example.com"
                type="email"
                autoComplete="email"
              />

              {isSignup && (
                <Field
                  icon={Phone}
                  label="Mobile number"
                  error={errors.phone}
                  value={form.phone}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, phone: normalizePhone(event.target.value) }))
                  }
                  placeholder="09171234567"
                  inputMode="tel"
                  autoComplete="tel"
                />
              )}

              {isSignup && role === 'driver' && (
                <Field
                  icon={CreditCard}
                  label="Primary plate / body number"
                  error={errors.plate}
                  value={form.plate}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, plate: normalizePlate(event.target.value) }))
                  }
                  placeholder="BMS 1930"
                  hint="More plates can be added later in the Driver console."
                />
              )}

              <Field
                icon={Lock}
                label="Password"
                error={errors.password}
                value={form.password}
                onChange={set('password')}
                placeholder="At least 6 characters"
                type={showPassword ? 'text' : 'password'}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="rounded-md p-1 text-slate-400 transition hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                }
              />

              {isSignup && (
                <Field
                  icon={ShieldCheck}
                  label="Confirm password"
                  error={errors.confirm}
                  value={form.confirm}
                  onChange={set('confirm')}
                  placeholder="Retype your password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  trailing={
                    form.confirm.length > 0 && (
                      <span
                        className={`flex items-center gap-1 text-[10px] font-bold ${
                          passwordMatches ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {passwordMatches ? <Check size={12} /> : <X size={12} />}
                        {passwordMatches ? 'match' : 'differ'}
                      </span>
                    )
                  }
                />
              )}

              <button
                type="submit"
                disabled={busy}
                className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/25 transition hover:from-cyan-400 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Working…
                  </>
                ) : (
                  <>
                    {isSignup ? `Create ${meta.label} account` : `Log in as ${meta.label}`}
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            {/* login ⇄ signup link */}
            <p className="mt-5 text-center text-xs text-slate-400">
              {isSignup ? (
                <>
                  Already on Look Out!?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="font-bold text-cyan-300 underline decoration-dotted underline-offset-4 transition hover:text-cyan-200"
                  >
                    Log in instead
                  </button>
                </>
              ) : (
                <>
                  New to Look Out!?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('signup')}
                    className="font-bold text-cyan-300 underline decoration-dotted underline-offset-4 transition hover:text-cyan-200"
                  >
                    Sign up to be on Look Out!
                  </button>
                </>
              )}
            </p>

            {!isSignup && (
              <p className="mt-3 text-center text-[10px] leading-relaxed text-slate-500">
                {role === 'driver'
                  ? 'Drivers sign in with the email used when signing up. Your plate numbers and pokes follow you on any device.'
                  : 'Your email is your username. Accounts are kept on Firebase Authentication + Firestore.'}
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/* ------------------------------ subcomponents ----------------------------- */

function Field({
  icon: Icon,
  label,
  error,
  hint,
  trailing,
  ...inputProps
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <span className="relative block">
        <Icon
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
        />
        <input
          {...inputProps}
          className={`w-full rounded-xl border bg-slate-900/70 py-2.5 pl-9 pr-10 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 ${
            error
              ? 'border-rose-500/60 focus:border-rose-400 focus:ring-rose-500/25'
              : 'border-slate-700 focus:border-cyan-400 focus:ring-cyan-500/25'
          }`}
        />
        {trailing && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2">{trailing}</span>
        )}
      </span>
      {error ? (
        <span className="mt-1 block text-[10px] font-semibold text-rose-300">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[10px] text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

function BrandBanner() {
  return (
    <>
      {/* compact header for phones/tablets */}
      <div className="flex items-center gap-3 px-4 pb-4 pt-5 sm:px-8 lg:hidden">
        <div className="rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 p-2 shadow-lg shadow-cyan-500/25">
          <Bus size={20} className="text-white" />
        </div>
        <div className="leading-tight">
          <p className="text-lg font-extrabold tracking-tight text-slate-50">
            Look Out<span className="text-cyan-400">!</span>
          </p>
          <p className="text-[11px] text-slate-400">Real-time PUV tracking · Iloilo City</p>
        </div>
      </div>

      {/* full banner for desktop */}
      <aside className="relative hidden overflow-hidden bg-[#170608] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              'radial-gradient(ellipse at 15% 12%, rgba(220,38,38,0.55), transparent 55%), radial-gradient(ellipse at 85% 85%, rgba(34,211,238,0.28), transparent 55%), linear-gradient(160deg, #1b0608 0%, #020617 70%)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(248,250,252,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(248,250,252,0.5) 1px, transparent 1px)',
            backgroundSize: '46px 46px',
          }}
        />

        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 p-3 shadow-xl shadow-cyan-500/30">
              <Bus size={26} className="text-white" />
            </div>
            <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">
              Capstone · Iloilo City
            </span>
          </div>

          <h1 className="mt-10 text-5xl font-black leading-[0.95] tracking-tight text-slate-50 xl:text-6xl">
            Look Out
            <span className="text-cyan-400">!</span>
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-300">
            Real-time updates for public utility vehicles plying the{' '}
            <span className="font-semibold text-slate-100">LPTRP routes</span> — know where your
            jeepney is before you step out the door.
          </p>

          <ul className="mt-9 space-y-3">
            {BANNER_POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-slate-200">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700/70 bg-slate-900/70">
                  <Icon size={15} className="text-cyan-300" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mt-10 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          {['Firebase Auth', 'Firestore', 'Socket.IO', 'OpenStreetMap'].map((chip) => (
            <span key={chip} className="rounded-full border border-slate-700/70 px-2.5 py-1">
              {chip}
            </span>
          ))}
        </div>
      </aside>
    </>
  );
}
