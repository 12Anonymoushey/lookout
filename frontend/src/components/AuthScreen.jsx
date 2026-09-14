import { useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bus,
  Check,
  ChevronDown,
  CreditCard,
  Eye,
  EyeOff,
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
import bannerImg from '../assets/lookoutBanner.png';
import logoImg from '../assets/lookoutLogo.png';
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

const AUTH_TABS = [ROLE_META.commuter, ROLE_META.driver];

export default function AuthScreen() {
  const { signIn, signUp, enterDemo, firebaseMissing } = useAuth();

  const [role, setRole] = useState('commuter');
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState('');
  const [bannerOpen, setBannerOpen] = useState(false);

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

  const validate = () => {
    const next = {};
    if (isSignup && form.fullName.trim().length < 3) {
      next.fullName = 'Enter your full name (at least 3 characters).';
    }
    if (!EMAIL_RE.test(form.email.trim())) {
      next.email = 'Enter a valid email address.';
    }
    const phoneDigits = normalizePhone(form.phone).length;
    if (isSignup && (phoneDigits < 10 || phoneDigits > 13)) {
      next.phone = 'Enter a valid mobile number.';
    }
    if (isSignup && role === 'driver' && !isValidPlate(form.plate)) {
      next.plate = 'Enter your plate number.';
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

  return (
    <div className="min-h-dvh bg-[#0e0a18] lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* ============================ BANNER ============================ */}
      <BrandBanner bannerOpen={bannerOpen} onToggle={() => setBannerOpen((v) => !v)} />

      {/* ========================== AUTH PANEL ========================== */}
      <main className="flex items-start justify-center px-4 pb-10 pt-4 sm:px-8 lg:items-center lg:py-12">
        <div className="w-full max-w-md">
          {/* role tabs */}
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
            className="rounded-b-2xl rounded-tr-2xl border border-[#3a2a50] bg-[var(--lo-panel)] p-5 shadow-2xl sm:p-6"
          >
            <header className="mb-5">
              <h2 className="text-lg font-extrabold tracking-tight text-[#f0e6f6]">
                {isSignup ? `Sign up as ${meta.label}` : `${meta.label} login`}
              </h2>
              {!isSignup && (
                <p className="mt-1 text-xs leading-relaxed text-[#b8a0cc]">
                  {meta.blurb}
                </p>
              )}
            </header>

            {firebaseMissing && (
              <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-amber-200">
                <p className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle size={13} /> Firebase not configured
                </p>
                <button
                  type="button"
                  onClick={() => enterDemo(role)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-400/50 bg-amber-400/10 px-2.5 py-1.5 font-bold transition hover:bg-amber-400/20"
                >
                  <Radio size={12} /> Continue in demo mode
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
                label={isSignup ? 'Email' : 'Email'}
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
                  label="Primary plate number"
                  error={errors.plate}
                  value={form.plate}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, plate: normalizePlate(event.target.value) }))
                  }
                  placeholder="BMS 1930"
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
                    className="rounded-md p-1 text-[#b8a0cc] transition hover:text-[#f0e6f6]"
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
                className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FF69B4] to-[#d4509a] text-sm font-bold text-white shadow-lg shadow-[#FF69B4]/25 transition hover:from-[#ff80c0] hover:to-[#e060a8] disabled:cursor-not-allowed disabled:opacity-60"
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

            <p className="mt-5 text-center text-xs text-[#b8a0cc]">
              {isSignup ? (
                <>
                  Already on Look Out!?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="font-bold text-[var(--lo-pink)] underline decoration-dotted underline-offset-4 transition hover:text-[var(--lo-pink-soft)]"
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
                    className="font-bold text-[var(--lo-pink)] underline decoration-dotted underline-offset-4 transition hover:text-[var(--lo-pink-soft)]"
                  >
                    Sign up to be on Look Out!
                  </button>
                </>
              )}
            </p>
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
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#b8a0cc]">
        {label}
      </span>
      <span className="relative block">
        <Icon
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8a7098]"
        />
        <input
          {...inputProps}
          className={`w-full rounded-xl border bg-[#1e1430] py-2.5 pl-9 pr-10 text-sm text-[#f0e6f6] placeholder:text-[#6a5a7a] focus:outline-none focus:ring-2 ${
            error
              ? 'border-rose-500/60 focus:border-rose-400 focus:ring-rose-500/25'
              : 'border-[#3a2a50] focus:border-[var(--lo-pink)] focus:ring-[#FF69B4]/25'
          }`}
        />
        {trailing && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2">{trailing}</span>
        )}
      </span>
      {error ? (
        <span className="mt-1 block text-[10px] font-semibold text-rose-300">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[10px] text-[#8a7098]">{hint}</span>
      ) : null}
    </label>
  );
}

function BrandBanner({ bannerOpen, onToggle }) {
  return (
    <>
      {/* Mobile: collapsible banner — default collapsed */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-between px-4 py-3"
        >
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="Look Out!" className="h-10 w-10 rounded-xl object-cover shadow-lg" />
            <div className="leading-tight">
              <p className="text-base font-extrabold tracking-tight text-[#f0e6f6]">
                Look Out<span style={{ color: 'var(--lo-pink)' }}>!</span>
              </p>
              <p className="text-[11px] text-[#b8a0cc]">Real-time PUV tracking</p>
            </div>
          </div>
          <span className="rounded-full bg-[var(--lo-panel)] p-2 text-[var(--lo-pink)]">
            {bannerOpen ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
          </span>
        </button>
        {bannerOpen && (
          <div className="overflow-hidden px-4 pb-4">
            <img
              src={bannerImg}
              alt="Look Out! banner"
              className="w-full rounded-2xl object-cover shadow-xl"
              style={{ maxHeight: 220 }}
            />
          </div>
        )}
      </div>

      {/* Desktop: full banner on the left */}
      <aside className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-center lg:p-12">
        <div className="absolute inset-0">
          <img
            src={bannerImg}
            alt="Look Out! banner"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0e0a18]/80 via-[#0e0a18]/50 to-[#0e0a18]/90" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="Look Out!" className="h-12 w-12 rounded-2xl object-cover shadow-xl" />
          </div>

          <h1 className="mt-8 text-5xl font-black leading-[0.95] tracking-tight text-[#f0e6f6] xl:text-6xl">
            Look Out
            <span style={{ color: 'var(--lo-pink)' }}>!</span>
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-[#d8c8e8]">
            Real-time updates for public utility vehicles — know where your jeepney is before you step out the door.
          </p>

          <ul className="mt-8 space-y-3">
            {[
              { icon: MapPin, text: 'PUV tracking' },
              { icon: Hand, text: 'Poke to Let Driver Know' },
              { icon: Bus, text: 'Drivers: manage plates, mark Full or Vacant' },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-[#e0d4ec]">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#3a2a50] bg-[#1e1430]/70">
                  <Icon size={15} style={{ color: 'var(--lo-pink)' }} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </>
  );
}
