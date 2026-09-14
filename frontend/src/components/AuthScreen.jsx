import { useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bus,
  Check,
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

const EMPTY = { fullName: '', email: '', phone: '', plate: '', password: '', confirm: '' };
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
  const [aboutOpen, setAboutOpen] = useState(false);

  const isSignup = mode === 'signup';
  const meta = ROLE_META[role];

  const set = (key) => (e) => {
    setForm((p) => ({ ...p, [key]: e.target.value }));
    setErrors((p) => (p[key] ? { ...p, [key]: '' } : p));
    setBanner('');
  };

  const switchTab = (r) => { setRole(r); setErrors({}); setBanner(''); };
  const switchMode = (m) => { setMode(m); setErrors({}); setBanner(''); setForm((p) => ({ ...p, password: '', confirm: '' })); };
  const passwordMatches = form.confirm.length > 0 && form.password === form.confirm;

  const validate = () => {
    const next = {};
    if (isSignup && form.fullName.trim().length < 3) next.fullName = 'Enter your full name.';
    if (!EMAIL_RE.test(form.email.trim())) next.email = 'Enter a valid email.';
    const pd = normalizePhone(form.phone).length;
    if (isSignup && (pd < 10 || pd > 13)) next.phone = 'Enter a valid mobile number.';
    if (isSignup && role === 'driver' && !isValidPlate(form.plate)) next.plate = 'Enter your plate number.';
    if (form.password.length < 6) next.password = 'Password must be at least 6 characters.';
    if (isSignup && form.password !== form.confirm) next.confirm = 'Passwords do not match.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setBanner('');
    if (!validate()) return;
    setBusy(true);
    try {
      if (isSignup) {
        await signUp({ role, fullName: form.fullName, email: form.email, phone: form.phone, password: form.password, plate: role === 'driver' ? normalizePlate(form.plate) : '' });
      } else {
        await signIn({ role, email: form.email, password: form.password });
      }
    } catch (err) { setBanner(friendlyAuthError(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-dvh w-full overflow-x-hidden" style={{ background: 'linear-gradient(135deg, #FFE875 0%, #FFFAEB 50%, #FFE875 100%)' }}>
      <div className="flex min-h-dvh items-center justify-center px-4 py-6 sm:px-8 lg:py-12">
        
        {/* Responsive Grid: Stacks on mobile (grid-cols-1), side-by-side on desktop (lg:grid-cols-2) */}
        <div className="grid w-full max-w-md grid-cols-1 gap-6 lg:max-w-5xl lg:grid-cols-2 lg:gap-8 lg:items-center">
          
          {/* ================= LEFT COLUMN: AUTH CARD ================= */}
          <div className="w-full">
            {/* Logo header */}
            <div className="mb-5 flex items-center justify-center gap-3 lg:justify-start">
              <img src={logoImg} alt="Look Out!" className="h-12 w-12 rounded-2xl object-cover shadow-lg sm:h-14 sm:w-14" />
              <div>
                <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--lo-text)' }}>
                  Look Out<span style={{ color: 'var(--lo-pink)' }}>!</span>
                </h1>
                <p className="text-xs" style={{ color: 'var(--lo-text-secondary)' }}>Real-time PUV tracking</p>
              </div>
            </div>

            {/* Chrome tabs */}
            <div className="chrome-tabs" role="tablist" aria-label="Choose account type">
              {AUTH_TABS.map((entry) => {
                const Icon = entry.id === 'driver' ? Bus : Users;
                const selected = role === entry.id;
                return (
                  <button key={entry.id} type="button" role="tab" aria-selected={selected} onClick={() => switchTab(entry.id)} className="chrome-tab">
                    <Icon size={15} />{entry.label}
                    <span className="chrome-tab__hint">{isSignup ? 'signup' : 'login'}</span>
                  </button>
                );
              })}
            </div>

            {/* Form panel */}
            <div role="tabpanel" className="rounded-b-2xl rounded-tr-2xl border border-[var(--lo-panel-border)] bg-[var(--lo-panel)] p-4 shadow-xl sm:p-6">
              <header className="mb-5">
                <h2 className="text-lg font-extrabold tracking-tight" style={{ color: 'var(--lo-text)' }}>
                  {isSignup ? `Sign up as ${meta.label}` : `${meta.label} login`}
                </h2>
                {!isSignup && <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--lo-text-secondary)' }}>{meta.blurb}</p>}
              </header>

              {firebaseMissing && (
                <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-700">
                  <p className="flex items-center gap-1.5 font-bold"><AlertTriangle size={13} /> Firebase not configured</p>
                  <button type="button" onClick={() => enterDemo(role)} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-100 px-2.5 py-1.5 font-bold transition hover:bg-amber-200">
                    <Radio size={12} /> Continue in demo mode
                  </button>
                </div>
              )}

              {banner && (
                <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" /><p>{banner}</p>
                </div>
              )}

              <form onSubmit={onSubmit} noValidate className="space-y-3.5">
                {isSignup && <Field icon={User} label="Full name" error={errors.fullName} value={form.fullName} onChange={set('fullName')} placeholder="Juan Dela Cruz" autoComplete="name" />}
                <Field icon={Mail} label="Email" error={errors.email} value={form.email} onChange={set('email')} placeholder="you@example.com" type="email" autoComplete="email" />
                {isSignup && <Field icon={Phone} label="Mobile number" error={errors.phone} value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: normalizePhone(e.target.value) }))} placeholder="09171234567" inputMode="tel" autoComplete="tel" />}
                {isSignup && role === 'driver' && <Field icon={CreditCard} label="Primary plate number" error={errors.plate} value={form.plate} onChange={(e) => setForm((p) => ({ ...p, plate: normalizePlate(e.target.value) }))} placeholder="BMS 1930" />}
                <Field icon={Lock} label="Password" error={errors.password} value={form.password} onChange={set('password')} placeholder="At least 6 characters" type={showPassword ? 'text' : 'password'} autoComplete={isSignup ? 'new-password' : 'current-password'}
                  trailing={<button type="button" onClick={() => setShowPassword((v) => !v)} className="rounded-md p-1 transition" style={{ color: 'var(--lo-text-secondary)' }}>{showPassword ? <EyeOff size={14} /> : <Eye size={14} />}</button>} />
                {isSignup && <Field icon={ShieldCheck} label="Confirm password" error={errors.confirm} value={form.confirm} onChange={set('confirm')} placeholder="Retype your password" type={showPassword ? 'text' : 'password'} autoComplete="new-password"
                  trailing={form.confirm.length > 0 && (
                    <span className={`flex items-center gap-1 text-[10px] font-bold ${passwordMatches ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {passwordMatches ? <Check size={12} /> : <X size={12} />} {passwordMatches ? 'match' : 'differ'}
                    </span>
                  )} />}

                <button type="submit" disabled={busy} className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, var(--lo-pink), #e05090)', boxShadow: '0 4px 14px rgba(255,102,161,0.35)' }}>
                  {busy ? <><Loader2 size={16} className="animate-spin" /> Working…</> : <>{isSignup ? `Create ${meta.label} account` : `Log in as ${meta.label}`} <ArrowRight size={16} /></>}
                </button>
              </form>

              <p className="mt-5 text-center text-xs" style={{ color: 'var(--lo-text-secondary)' }}>
                {isSignup ? (
                  <>Already on Look Out!? <button type="button" onClick={() => switchMode('login')} className="font-bold underline decoration-dotted underline-offset-4 transition" style={{ color: 'var(--lo-pink)' }}>Log in instead</button></>
                ) : (
                  <>New to Look Out!? <button type="button" onClick={() => switchMode('signup')} className="font-bold underline decoration-dotted underline-offset-4 transition" style={{ color: 'var(--lo-pink)' }}>Sign up to be on Look Out!</button></>
                )}
              </p>
            </div>
          </div>

          {/* ================= RIGHT COLUMN: BANNER / ABOUT ================= */}
          <div className="w-full rounded-2xl border shadow-lg" style={{ borderColor: 'var(--lo-panel-border)', background: 'var(--lo-panel)' }}>
            {/* Collapsible on mobile — slides upward */}
            <button type="button" onClick={() => setAboutOpen((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 lg:hidden">
              <span className="text-sm font-bold" style={{ color: 'var(--lo-text)' }}>About Look Out!</span>
              <ArrowUp size={16} className="transition-transform duration-300" style={{ color: 'var(--lo-text-secondary)', transform: aboutOpen ? 'rotate(0deg)' : 'rotate(180deg)' }} />
            </button>
            <div className={aboutOpen ? 'lo-about-slide block' : 'hidden lg:hidden'} style={{ maxHeight: aboutOpen ? 600 : 0 }}>
              <MobileAbout />
            </div>

            {/* Always visible on desktop */}
            <div className="hidden lg:block">
              <DesktopAbout />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

/* ---- Field ---- */
function Field({ icon: Icon, label, error, trailing, ...inputProps }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--lo-text-secondary)' }}>{label}</span>
      <span className="relative block">
        <Icon size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--lo-text-secondary)' }} />
        <input {...inputProps} className={`w-full rounded-xl border py-2.5 pl-9 pr-10 text-sm focus:outline-none focus:ring-2 ${error ? 'border-rose-400 focus:border-rose-400 focus:ring-rose-200' : 'focus:ring-pink-200'}`}
          style={{ borderColor: error ? undefined : 'var(--lo-panel-border)', backgroundColor: 'var(--lo-panel)', color: 'var(--lo-text)' }} />
        {trailing && <span className="absolute right-2.5 top-1/2 -translate-y-1/2">{trailing}</span>}
      </span>
      {error ? <span className="mt-1 block text-[10px] font-semibold text-rose-500">{error}</span> : null}
    </label>
  );
}

/* ---- Mobile About (collapsible) ---- */
function MobileAbout() {
  return (
    <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: 'var(--lo-panel-border)' }}>
      <img src={bannerImg} alt="Look Out! banner" className="mb-3 w-full rounded-xl object-cover shadow-md" style={{ maxHeight: 180 }} />
      <h3 className="mb-2 text-sm font-extrabold" style={{ color: 'var(--lo-text)' }}>About Look Out!</h3>
      <p className="mb-3 text-xs leading-relaxed" style={{ color: 'var(--lo-text-secondary)' }}>
        A real-time public utility vehicle tracking system designed for commuters and drivers in Iloilo City.
        Commuters can track live jeepneys on the map, poke approaching vehicles, and save their favorite transportations.
        Drivers can manage multiple plate numbers, broadcast their GPS location, and respond to commuter pokes instantly.
      </p>
      <div className="flex flex-wrap gap-2">
        {[{ icon: MapPin, text: 'Live PUV tracking' }, { icon: Hand, text: 'Poke drivers' }, { icon: Bus, text: 'Full/Vacant status' }, { icon: Users, text: 'Commuter & Driver' }].map(({ icon: I, text }) => (
          <span key={text} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: 'var(--lo-card)', color: 'var(--lo-text-secondary)' }}>
            <I size={11} style={{ color: 'var(--lo-pink)' }} /> {text}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---- Desktop About (always visible) ---- */
function DesktopAbout() {
  return (
    <div className="p-5">
      <div className="mb-4 overflow-hidden rounded-xl shadow-md">
        <img src={bannerImg} alt="Look Out! banner" className="w-full object-cover" style={{ maxHeight: 200 }} />
      </div>
      <h3 className="mb-2 text-base font-extrabold" style={{ color: 'var(--lo-text)' }}>About Look Out!</h3>
      <p className="mb-3 text-sm leading-relaxed" style={{ color: 'var(--lo-text-secondary)' }}>
        A real-time public utility vehicle tracking system designed for commuters and drivers in Iloilo City.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl p-3" style={{ background: 'var(--lo-card)' }}>
          <h4 className="mb-1 text-xs font-bold" style={{ color: 'var(--lo-pink)' }}>For Commuters</h4>
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--lo-text-secondary)' }}>
            Track live jeepneys on OpenStreetMap. Tap the Poke bubble to alert your driver. Save favorite transportations and view ride history.
          </p>
        </div>
        <div className="rounded-xl p-3" style={{ background: 'var(--lo-card)' }}>
          <h4 className="mb-1 text-xs font-bold" style={{ color: 'var(--lo-sky)' }}>For Drivers</h4>
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--lo-text-secondary)' }}>
            Manage multiple plate numbers. Share your GPS live. Mark your jeepney as Full or Vacant. View commuter pokes and trip stats.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {[{ icon: MapPin, text: 'Live PUV tracking' }, { icon: Hand, text: 'Poke system' }, { icon: Bus, text: 'Full/Vacant' }, { icon: Users, text: 'Dual interface' }].map(({ icon: I, text }) => (
          <span key={text} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: 'var(--lo-card)', color: 'var(--lo-text-secondary)' }}>
            <I size={11} style={{ color: 'var(--lo-pink)' }} /> {text}
          </span>
        ))}
      </div>
    </div>
  );
}
