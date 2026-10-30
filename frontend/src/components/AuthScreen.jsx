import { useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  Bus,
  Check,
  CreditCard,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Phone,
  Radio,
  ShieldCheck,
  User,
  Users,
  X,
} from 'lucide-react';
import logoImg from '../assets/lookoutLogo.png';
import bannerImg from '../assets/lookoutBanner.png';
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
  const scrollRef = useRef(null);

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
    <div className="relative h-dvh w-full overflow-hidden bg-slate-50 text-slate-900">
      <main ref={scrollRef} className="auth-page-scroll h-full w-full snap-y snap-mandatory overflow-y-auto overflow-x-hidden">
      <section id="auth-top" className="flex min-h-[100svh] snap-start flex-col items-center justify-center px-4 py-6">
        <div className="auth-card-enter flex w-full max-w-md flex-col items-center gap-4">
          <img src={logoImg} alt="Look Out!" className="h-16 w-16 rounded-2xl object-cover shadow-sm" />
          <div className="w-full rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.10)] sm:p-6">
            <h1 className="mb-4 text-center text-xl font-extrabold tracking-tight text-slate-900">{isSignup ? 'Create account' : 'Log in'}</h1>

            <div className="relative mb-5 flex rounded-2xl bg-slate-50 p-1.5" role="tablist" aria-label="Choose account type">
              <span className={`auth-segment-pill ${role === 'driver' ? 'auth-segment-pill--driver' : ''}`} aria-hidden="true" />
              {AUTH_TABS.map((entry) => {
                const Icon = entry.id === 'driver' ? Bus : Users;
                const selected = role === entry.id;
                return (
                  <button key={entry.id} type="button" role="tab" aria-selected={selected} onClick={() => switchTab(entry.id)}
                    className={`auth-segment-option relative z-10 flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-bold transition-colors ${selected ? 'text-white' : 'text-slate-500 hover:text-slate-900'}`}>
                    <Icon size={17} />{entry.label}
                  </button>
                );
              })}
            </div>

            <div key={`${role}-${mode}`} role="tabpanel" className="auth-form-enter">
              {firebaseMissing && (
                <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-900">
                  <p className="flex items-center gap-1.5 font-bold"><AlertTriangle size={13} /> Demo mode</p>
                  <button type="button" onClick={() => enterDemo(role)} className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-blue-600 px-3 font-bold text-white transition hover:bg-blue-700">
                    <Radio size={14} /> Continue as {meta.label}
                  </button>
                </div>
              )}

              {banner && (
                <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-red-500 bg-red-500 px-3 py-2.5 text-xs text-slate-900">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" /><p>{banner}</p>
                </div>
              )}

              <form onSubmit={onSubmit} noValidate className="space-y-3">
                {isSignup && <Field icon={User} label="Full name" error={errors.fullName} value={form.fullName} onChange={set('fullName')} placeholder="Juan Dela Cruz" autoComplete="name" />}
                <Field icon={Mail} label="Email" error={errors.email} value={form.email} onChange={set('email')} placeholder="you@example.com" type="email" autoComplete="email" />
                {isSignup && <Field icon={Phone} label="Mobile number" error={errors.phone} value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: normalizePhone(e.target.value) }))} placeholder="09171234567" inputMode="tel" autoComplete="tel" />}
                {isSignup && role === 'driver' && <Field icon={CreditCard} label="Primary plate number" error={errors.plate} value={form.plate} onChange={(e) => setForm((p) => ({ ...p, plate: normalizePlate(e.target.value) }))} placeholder="BMS 1930" />}
                <Field icon={Lock} label="Password" error={errors.password} value={form.password} onChange={set('password')} placeholder="At least 6 characters" type={showPassword ? 'text' : 'password'} autoComplete={isSignup ? 'new-password' : 'current-password'}
                  trailing={<button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl transition hover:bg-slate-50" style={{ color: 'var(--lo-text-secondary)' }}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>} />
                {isSignup && <Field icon={ShieldCheck} label="Confirm password" error={errors.confirm} value={form.confirm} onChange={set('confirm')} placeholder="Retype your password" type={showPassword ? 'text' : 'password'} autoComplete="new-password"
                  trailing={form.confirm.length > 0 && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-900">
                      {passwordMatches ? <Check size={12} className="text-emerald-500" /> : <X size={12} className="text-red-500" />} {passwordMatches ? 'match' : 'differ'}
                    </span>
                  )} />}

                <button type="submit" disabled={busy} className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-bold text-white shadow-lg transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                  {busy ? <><Loader2 size={16} className="animate-spin" /> Please wait</> : <>{isSignup ? 'Create account' : 'Log in'} <ArrowRight size={16} /></>}
                </button>
              </form>

              <p className="mt-4 text-center text-xs text-slate-500">
                {isSignup ? (
                  <>Have an account? <button type="button" onClick={() => switchMode('login')} className="min-h-11 px-1 font-bold text-blue-600 underline decoration-dotted underline-offset-4 hover:text-blue-700">Log in</button></>
                ) : (
                  <>New here? <button type="button" onClick={() => switchMode('signup')} className="min-h-11 px-1 font-bold text-blue-600 underline decoration-dotted underline-offset-4 hover:text-blue-700">Sign up</button></>
                )}
              </p>
            </div>
          </div>
          <button type="button" onClick={() => document.getElementById('auth-about')?.scrollIntoView({ behavior: 'smooth' })}
            aria-label="About Look Out" className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-blue-600">
            <ArrowDown size={18} />
          </button>
        </div>
      </section>

      <section id="auth-about" aria-labelledby="about-heading" className="flex min-h-[100svh] snap-start items-center justify-center px-4 py-8">
        <article className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.10)]">
          <img src={bannerImg} alt="Look Out! real-time PUV tracking" className="block aspect-[4/3] w-full object-cover" />
          <div className="p-5">
            <h2 id="about-heading" className="text-xl font-black tracking-tight text-slate-900">About Look Out!</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">Real-time PUV tracking for Iloilo City.</p>
          </div>
        </article>
      </section>
      </main>
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
        <input {...inputProps} className={`min-h-12 w-full rounded-xl border py-3 pl-10 pr-12 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-600/25 ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/25' : 'border-slate-200 focus:border-blue-600'}`}
          style={{ borderColor: error ? undefined : 'var(--lo-panel-border)', backgroundColor: 'var(--lo-panel)', color: 'var(--lo-text)' }} />
        {trailing && <span className="absolute right-1 top-1/2 -translate-y-1/2">{trailing}</span>}
      </span>
      {error ? <span className="mt-1 block text-[10px] font-semibold text-slate-900">{error}</span> : null}
    </label>
  );
}
