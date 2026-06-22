import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Church,
  User,
  Lock,
  Eye,
  EyeOff,
  DollarSign,
  FileText,
  Users,
} from 'lucide-react';
import { getParishConfig } from '@/lib/parishConfig';
import { setSession, desktopAuth } from '@/lib/session';
import { isCloud } from '@/lib/cloudStore';
import { cloudSignIn, cloudResetPassword, cloudSignUp } from '@/lib/cloudAuth';
import { onboardNewAdmin } from '@/lib/onboarding';

/* ─── Role definitions ─── */
interface Role {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
  accentColor: string;
  accentBg: string;
  demoUsername: string;
}

const roles: Role[] = [
  {
    id: 'parish_priest',
    label: 'Parish Priest',
    icon: Church,
    description: 'Full admin access',
    accentColor: '#1B2A4A',
    accentBg: 'rgba(27,42,74,0.08)',
    demoUsername: 'fr.admin',
  },
  {
    id: 'bookkeeper',
    label: 'Bookkeeper',
    icon: DollarSign,
    description: 'Finance & records',
    accentColor: '#2D6A4F',
    accentBg: 'rgba(45,106,79,0.08)',
    demoUsername: 'bookkeeper',
  },
  {
    id: 'secretary',
    label: 'Secretary',
    icon: FileText,
    description: 'Records & scheduling',
    accentColor: '#5B3A73',
    accentBg: 'rgba(91,58,115,0.08)',
    demoUsername: 'secretary',
  },
  {
    id: 'finance_council',
    label: 'Finance Council',
    icon: Users,
    description: 'Oversight & reports',
    accentColor: '#6B2737',
    accentBg: 'rgba(107,39,55,0.08)',
    demoUsername: 'council',
  },
];

/* ─── Animation config ─── */
const easeEnter = [0, 0, 0.2, 1] as [number, number, number, number];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: easeEnter },
  },
};

const leftPanelVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.6, ease: easeEnter },
  },
};

const leftTextVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: easeEnter, delay: 0.2 },
  },
};

const leftSubVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: easeEnter, delay: 0.3 },
  },
};

/* ─── Decorative cross watermark (CSS-drawn SVG) ─── */
function CrossWatermark() {
  return (
    <svg
      className="absolute pointer-events-none"
      style={{
        width: 400,
        height: 400,
        opacity: 0.05,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      }}
      viewBox="0 0 100 100"
      fill="none"
    >
      <path
        d="M45 10h10v30h35v10H55v40H45V50H10V40h35V10z"
        fill="white"
      />
    </svg>
  );
}

/* ─── Main Component ─── */
const ERROR_TEXT: Record<string, string> = {
  invalid_credentials: 'Incorrect username or password.',
  locked: 'Too many attempts. Please wait a few minutes and try again.',
  weak_password: 'Password must be at least 8 characters.',
  username_taken: 'That username is already in use.',
  username_too_short: 'Username must be at least 3 characters.',
  first_user_must_be_admin: 'The first account must be the Parish Priest (admin).',
  not_authorized: 'You are not allowed to do that.',
};

export default function LoginPage() {
  const config = useMemo(() => getParishConfig(), []);
  const auth = useMemo(() => desktopAuth(), []);
  const hasBridge = !!auth;
  const cloud = useMemo(() => isCloud(), []);

  const [mode, setMode] = useState<'loading' | 'login' | 'bootstrap'>(hasBridge ? 'loading' : 'login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [cloudSignup, setCloudSignup] = useState(false);
  const [dioceseName, setDioceseName] = useState('');
  const [parishName, setParishName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>('parish_priest');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [authError, setAuthError] = useState('');
  const [notice, setNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleForgot = async () => {
    setAuthError(''); setNotice('');
    if (!username.trim()) { setAuthError('Enter your email above, then click “Forgot password”.'); return; }
    const res = await cloudResetPassword(username.trim());
    if (res.ok) setNotice('If that email has an account, a reset link is on its way.');
    else setAuthError(res.error || 'Could not send a reset link.');
  };

  const roleLabel = useCallback((id: string) => roles.find((r) => r.id === id)?.label || id, []);
  const isBootstrap = mode === 'bootstrap';

  // First run? If the desktop bridge reports no accounts yet, switch to
  // "create the first admin" mode instead of asking to sign in.
  useEffect(() => {
    if (!auth) return;
    auth.hasUsers().then((has) => setMode(has ? 'login' : 'bootstrap')).catch(() => setMode('login'));
  }, [auth]);

  /* ── Validation ── */
  const validate = useCallback(() => {
    const e: Record<string, string> = {};
    if (!username.trim()) e.username = 'Username is required';
    if (!password.trim()) e.password = 'Password is required';
    if (mode === 'bootstrap') {
      if (!fullName.trim()) e.fullName = 'Your name is required';
      if (password.length < 8) e.password = 'At least 8 characters';
      if (password !== confirmPassword) e.confirmPassword = 'Passwords do not match';
    }
    if (cloud && cloudSignup) {
      if (!fullName.trim()) e.fullName = 'Your name is required';
      if (!dioceseName.trim()) e.dioceseName = 'Diocese name is required';
      if (!parishName.trim()) e.parishName = 'Parish name is required';
      if (password.length < 8) e.password = 'At least 8 characters';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [username, password, confirmPassword, fullName, mode, cloud, cloudSignup, dioceseName, parishName]);

  const finishLogin = (user: { username: string; role: string }) => {
    setSession({ username: user.username, role: user.role, roleLabel: roleLabel(user.role) });
    window.location.hash = '/';
    window.location.reload();
  };

  /* ── Handle Sign In / Create admin ── */
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!validate()) return;
    setIsSubmitting(true);

    if (!auth) {
      // SaaS (cloud) build: real Supabase Auth.
      if (cloud) {
        if (cloudSignup) {
          // Create the account, sign in, then onboard the diocese + first parish.
          const su = await cloudSignUp(username.trim(), password, fullName.trim());
          if (!su.ok) { setAuthError(su.error || 'Could not create the account.'); setIsSubmitting(false); return; }
          const si = await cloudSignIn(username.trim(), password);
          if (!si.ok) {
            // Email confirmation is on → no session yet. Finish after they confirm.
            setNotice('Account created! Please confirm your email, then sign in to finish setting up your diocese.');
            setCloudSignup(false); setIsSubmitting(false); return;
          }
          const ob = await onboardNewAdmin(dioceseName.trim(), parishName.trim());
          if (!ob.ok) { setAuthError(ob.error || 'Could not set up your diocese.'); setIsSubmitting(false); return; }
          window.location.hash = '/';
          window.location.reload();
          return;
        }
        const res = await cloudSignIn(username.trim(), password);
        if (!res.ok) { setAuthError(res.error || 'Sign in failed.'); setIsSubmitting(false); return; }
        // Supabase persists the session; reload → reconcileSession picks it up.
        window.location.hash = '/';
        window.location.reload();
        return;
      }
      // Plain browser/demo build (no backend): keep the lightweight role entry.
      await new Promise((r) => setTimeout(r, 400));
      const role = roles.find((r) => r.id === selectedRole)!;
      setSession({ username: username.trim() || role.demoUsername, role: role.id, roleLabel: role.label });
      window.location.hash = '/';
      window.location.reload();
      return;
    }

    try {
      if (mode === 'bootstrap') {
        const created = await auth.create({ username: username.trim(), password, role: 'parish_priest', fullName: fullName.trim() });
        if (!created.ok) { setAuthError(ERROR_TEXT[created.error || ''] || 'Could not create the account.'); setIsSubmitting(false); return; }
      }
      const res = await auth.login(username.trim(), password);
      if (!res.ok || !res.user) { setAuthError(ERROR_TEXT[res.error || ''] || 'Sign in failed.'); setIsSubmitting(false); return; }
      finishLogin(res.user);
    } catch {
      setAuthError('Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  };

  /* ── Role selection with demo username (browser/demo only) ── */
  const handleRoleSelect = (roleId: string) => {
    setSelectedRole(roleId);
    const role = roles.find((r) => r.id === roleId);
    if (role) setUsername(role.demoUsername);
  };

  /* ── Clear error on input ── */
  useEffect(() => {
    if (errors.username && username.trim()) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.username;
        return next;
      });
    }
    if (errors.password && password.trim()) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.password;
        return next;
      });
    }
  }, [username, password, errors.username, errors.password]);

  return (
    <div
      className="fixed inset-0 z-modal flex"
      style={{ marginLeft: 0 }}
    >
      {/* ─── Left Panel (55%) ─── */}
      <motion.div
        className="hidden lg:flex lg:w-[55%] relative flex-col justify-center items-center overflow-hidden"
        style={{ backgroundColor: '#1B2A4A' }}
        variants={leftPanelVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Subtle noise texture overlay (CSS gradient approximation) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: 0.02,
            backgroundImage:
              'url("data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22 opacity=%221%22/%3E%3C/svg%3E")',
          }}
        />

        <CrossWatermark />

        {/* Logo + Title */}
        <motion.div
          className="relative z-10 flex flex-col items-center mb-12"
          variants={leftTextVariants}
          initial="hidden"
          animate="visible"
        >
          <div className="flex items-center justify-center w-16 h-16 rounded-xl mb-6" style={{ backgroundColor: '#C9963B' }}>
            <Church className="w-8 h-8 text-white" />
          </div>
          <h1
            className="font-playfair text-3xl font-semibold text-white mb-2"
            style={{ letterSpacing: '-0.01em' }}
          >
            ChurchOS
          </h1>
          <p className="text-white/50 text-sm">
            Modern Parish Management for the Philippines
          </p>
        </motion.div>

        {/* Tagline */}
        <motion.h2
          className="relative z-10 font-playfair text-[28px] font-semibold text-white text-center max-w-[400px] leading-snug mb-6"
          variants={leftTextVariants}
          initial="hidden"
          animate="visible"
        >
          Serving the Catholic Church in the Philippines
        </motion.h2>

        <motion.p
          className="relative z-10 text-sm text-white/70 text-center max-w-[380px] leading-relaxed"
          variants={leftSubVariants}
          initial="hidden"
          animate="visible"
        >
          CBCP-aligned parish management. Modern, secure, and built for Filipino parishes.
        </motion.p>

        {/* Bottom version */}
        <motion.div
          className="absolute bottom-8 left-0 right-0 flex justify-center gap-3 text-white/40 text-[13px]"
          variants={leftSubVariants}
          initial="hidden"
          animate="visible"
        >
          <span>ChurchOS v1.1</span>
          <span>&middot;</span>
          <span>{config.parishName}</span>
        </motion.div>
      </motion.div>

      {/* ─── Right Panel (45%) ─── */}
      <div
        className="flex-1 lg:w-[45%] flex flex-col justify-center items-center px-6 py-12 overflow-y-auto"
        style={{ backgroundColor: '#FAF8F3' }}
      >
        <motion.div
          className="w-full max-w-[420px]"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Mobile logo */}
          <motion.div
            className="flex lg:hidden flex-col items-center mb-8"
            variants={itemVariants}
          >
            <div
              className="flex items-center justify-center w-14 h-14 rounded-xl mb-4"
              style={{ backgroundColor: '#C9963B' }}
            >
              <Church className="w-7 h-7 text-white" />
            </div>
            <h1 className="font-inter text-xl font-semibold" style={{ color: '#3D3A36' }}>
              ChurchOS
            </h1>
            <p className="text-[13px] mt-1" style={{ color: '#8C8374' }}>
              Parish Management System
            </p>
          </motion.div>

          {/* Welcome heading */}
          <motion.h2
            className="font-playfair text-[28px] font-semibold mb-1 text-center lg:text-left"
            style={{ color: '#3D3A36', lineHeight: 1.2 }}
            variants={itemVariants}
          >
            {isBootstrap ? 'Create Your Admin Account' : (cloud && cloudSignup) ? 'Create Your Diocese' : 'Welcome Back'}
          </motion.h2>
          <motion.p
            className="text-sm mb-8 text-center lg:text-left"
            style={{ color: '#8C8374', lineHeight: 1.55 }}
            variants={itemVariants}
          >
            {isBootstrap
              ? 'Set up the Parish Priest account that secures this install.'
              : (cloud && cloudSignup)
              ? 'Start your free trial — create your diocese and first parish.'
              : 'Sign in to your parish management system'}
          </motion.p>

          {/* Form */}
          <form onSubmit={handleSignIn} noValidate>
            {authError && (
              <div className="mb-5 rounded-md px-3 py-2.5 text-sm" style={{ backgroundColor: 'rgba(184,50,47,0.08)', border: '1px solid rgba(184,50,47,0.35)', color: '#B8322F' }}>
                {authError}
              </div>
            )}
            {notice && (
              <div className="mb-5 rounded-md px-3 py-2.5 text-sm" style={{ backgroundColor: 'rgba(45,106,79,0.08)', border: '1px solid rgba(45,106,79,0.35)', color: '#2D6A4F' }}>
                {notice}
              </div>
            )}

            {/* Full name (desktop first-run admin OR cloud diocese signup) */}
            {(isBootstrap || (cloud && cloudSignup)) && (
              <motion.div className="mb-5" variants={itemVariants}>
                <label className="block mb-2" style={{ color: '#8C8374', fontSize: '0.75rem', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Your Full Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Fr. Juan dela Cruz"
                  className="w-full h-10 rounded-md px-3 text-sm font-inter"
                  style={{ backgroundColor: '#FFFFFF', border: errors.fullName ? '1px solid #B8322F' : '1px solid #EAE5D9', color: '#3D3A36', outline: 'none' }}
                />
                {errors.fullName && <p className="mt-1.5 text-xs" style={{ color: '#B8322F' }}>{errors.fullName}</p>}
              </motion.div>
            )}
            {/* Username */}
            <motion.div className="mb-5" variants={itemVariants}>
              <label
                className="label block mb-2"
                style={{ color: '#8C8374', fontSize: '0.75rem', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}
              >
                {cloud ? 'Email' : 'Username'}
              </label>
              <div className="relative">
                <User
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px]"
                  style={{ color: '#8C8374' }}
                />
                <input
                  type={cloud ? 'email' : 'text'}
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={cloud ? 'you@parish.org' : 'Enter your username'}
                  autoFocus
                  className="w-full h-10 rounded-md pl-10 pr-3 text-sm font-inter transition-all duration-150"
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: errors.username
                      ? '1px solid #B8322F'
                      : '1px solid #EAE5D9',
                    color: '#3D3A36',
                    outline: 'none',
                  }}
                  onFocus={(e) => {
                    if (!errors.username) {
                      e.currentTarget.style.border = '2px solid #C9963B';
                      e.currentTarget.style.paddingLeft = '39px';
                    }
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.border = errors.username
                      ? '1px solid #B8322F'
                      : '1px solid #EAE5D9';
                    e.currentTarget.style.paddingLeft = '40px';
                  }}
                />
              </div>
              {errors.username && (
                <motion.p
                  className="mt-1.5 text-xs"
                  style={{ color: '#B8322F' }}
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {errors.username}
                </motion.p>
              )}
            </motion.div>

            {/* Password */}
            <motion.div className="mb-5" variants={itemVariants}>
              <label
                className="block mb-2"
                style={{ color: '#8C8374', fontSize: '0.75rem', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}
              >
                Password
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px]"
                  style={{ color: '#8C8374' }}
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full h-10 rounded-md pl-10 pr-10 text-sm font-inter transition-all duration-150"
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: errors.password
                      ? '1px solid #B8322F'
                      : '1px solid #EAE5D9',
                    color: '#3D3A36',
                    outline: 'none',
                  }}
                  onFocus={(e) => {
                    if (!errors.password) {
                      e.currentTarget.style.border = '2px solid #C9963B';
                      e.currentTarget.style.paddingLeft = '39px';
                    }
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.border = errors.password
                      ? '1px solid #B8322F'
                      : '1px solid #EAE5D9';
                    e.currentTarget.style.paddingLeft = '40px';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors duration-150"
                  style={{ color: '#8C8374' }}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-[18px] h-[18px]" />
                  ) : (
                    <Eye className="w-[18px] h-[18px]" />
                  )}
                </button>
              </div>
              {errors.password && (
                <motion.p
                  className="mt-1.5 text-xs"
                  style={{ color: '#B8322F' }}
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {errors.password}
                </motion.p>
              )}
            </motion.div>

            {/* Confirm password (first-run admin only) */}
            {isBootstrap && (
              <motion.div className="mb-5" variants={itemVariants}>
                <label className="block mb-2" style={{ color: '#8C8374', fontSize: '0.75rem', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Confirm Password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  className="w-full h-10 rounded-md px-3 text-sm font-inter"
                  style={{ backgroundColor: '#FFFFFF', border: errors.confirmPassword ? '1px solid #B8322F' : '1px solid #EAE5D9', color: '#3D3A36', outline: 'none' }}
                />
                {errors.confirmPassword && <p className="mt-1.5 text-xs" style={{ color: '#B8322F' }}>{errors.confirmPassword}</p>}
              </motion.div>
            )}

            {/* Diocese + parish (cloud signup only) */}
            {cloud && cloudSignup && (
              <>
                <motion.div className="mb-5" variants={itemVariants}>
                  <label className="block mb-2" style={{ color: '#8C8374', fontSize: '0.75rem', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    Diocese Name
                  </label>
                  <input
                    type="text" value={dioceseName} onChange={(e) => setDioceseName(e.target.value)}
                    placeholder="e.g. Archdiocese of Manila"
                    className="w-full h-10 rounded-md px-3 text-sm font-inter"
                    style={{ backgroundColor: '#FFFFFF', border: errors.dioceseName ? '1px solid #B8322F' : '1px solid #EAE5D9', color: '#3D3A36', outline: 'none' }}
                  />
                  {errors.dioceseName && <p className="mt-1.5 text-xs" style={{ color: '#B8322F' }}>{errors.dioceseName}</p>}
                </motion.div>
                <motion.div className="mb-6" variants={itemVariants}>
                  <label className="block mb-2" style={{ color: '#8C8374', fontSize: '0.75rem', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    Your First Parish
                  </label>
                  <input
                    type="text" value={parishName} onChange={(e) => setParishName(e.target.value)}
                    placeholder="e.g. St. Mary Magdalene Parish"
                    className="w-full h-10 rounded-md px-3 text-sm font-inter"
                    style={{ backgroundColor: '#FFFFFF', border: errors.parishName ? '1px solid #B8322F' : '1px solid #EAE5D9', color: '#3D3A36', outline: 'none' }}
                  />
                  {errors.parishName && <p className="mt-1.5 text-xs" style={{ color: '#B8322F' }}>{errors.parishName}</p>}
                </motion.div>
              </>
            )}

            {/* Role Selector — browser/demo entry only; on desktop/cloud the role comes from the account */}
            {!hasBridge && !cloud && (
            <motion.div className="mb-6" variants={itemVariants}>
              <label
                className="block mb-3"
                style={{ color: '#8C8374', fontSize: '0.75rem', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}
              >
                Sign in as
              </label>
              <div className="flex flex-wrap gap-2">
                {roles.map((role) => {
                  const isSelected = selectedRole === role.id;
                  const Icon = role.icon;
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => handleRoleSelect(role.id)}
                      className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200"
                      style={{
                        backgroundColor: isSelected ? '#C9963B' : '#FFFFFF',
                        color: isSelected ? '#FFFFFF' : '#3D3A36',
                        border: isSelected
                          ? '2px solid #C9963B'
                          : '1px solid #EAE5D9',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.borderColor = '#DDB86B';
                          e.currentTarget.style.backgroundColor = 'rgba(201,150,59,0.05)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.borderColor = '#EAE5D9';
                          e.currentTarget.style.backgroundColor = '#FFFFFF';
                        }
                      }}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{role.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs" style={{ color: '#8C8374' }}>
                {roles.find((r) => r.id === selectedRole)?.description}
              </p>
            </motion.div>
            )}

            {/* Sign In Button */}
            <motion.div variants={itemVariants}>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-12 rounded-lg text-[15px] font-medium text-white transition-all duration-200 flex items-center justify-center gap-2"
                style={{
                  backgroundColor: isSubmitting ? '#DDB86B' : '#C9963B',
                  cursor: isSubmitting ? 'wait' : 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (!isSubmitting) {
                    e.currentTarget.style.backgroundColor = '#DDB86B';
                    e.currentTarget.style.transform = 'scale(1.01)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSubmitting) {
                    e.currentTarget.style.backgroundColor = '#C9963B';
                    e.currentTarget.style.transform = 'scale(1)';
                  }
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.transform = 'scale(0.98)';
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = 'scale(1.01)';
                }}
              >
                {isSubmitting ? (
                  <>
                    <svg
                      className="animate-spin h-5 w-5"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    <span>{isBootstrap ? 'Creating account…' : (cloud && cloudSignup) ? 'Creating your diocese…' : 'Signing in…'}</span>
                  </>
                ) : (
                  <span>{isBootstrap ? 'Create Admin Account' : (cloud && cloudSignup) ? 'Create Diocese & Start Trial' : 'Sign In'}</span>
                )}
              </button>
            </motion.div>

            {/* Forgot password — an admin resets staff passwords in Settings */}
            {!isBootstrap && hasBridge && (
              <motion.div className="mt-4 text-center" variants={itemVariants}>
                <p className="text-xs" style={{ color: '#8C8374' }}>
                  Forgot your password? Ask the Parish Priest to reset it in Settings.
                </p>
              </motion.div>
            )}
            {!hasBridge && !cloudSignup && (
              <motion.div className="mt-4 text-center" variants={itemVariants}>
                <button
                  type="button"
                  onClick={cloud ? handleForgot : undefined}
                  className="text-sm transition-all duration-200 hover:underline"
                  style={{ color: '#C9963B' }}
                >
                  Forgot password?
                </button>
              </motion.div>
            )}

            {/* Cloud: toggle between signing in and creating a new diocese */}
            {cloud && (
              <motion.div className="mt-3 text-center" variants={itemVariants}>
                <button
                  type="button"
                  onClick={() => { setCloudSignup((s) => !s); setAuthError(''); setNotice(''); setErrors({}); }}
                  className="text-sm transition-all duration-200 hover:underline"
                  style={{ color: '#5B3A73' }}
                >
                  {cloudSignup ? 'Already have an account? Sign in' : 'New diocese? Create an account →'}
                </button>
              </motion.div>
            )}
          </form>

          {/* Footer */}
          <motion.div
            className="mt-10 pt-6 text-center"
            style={{ borderTop: '1px solid #EAE5D9' }}
            variants={itemVariants}
          >
            <p className="text-xs" style={{ color: '#8C8374' }}>
              Need help? Contact your parish administrator
            </p>
            <div className="mt-3 flex justify-center gap-2 text-xs" style={{ color: '#8C8374' }}>
              <span>ChurchOS v1.1</span>
              <span>&middot;</span>
              <span>{config.parishName}</span>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
