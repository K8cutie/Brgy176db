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
export default function LoginPage() {
  const config = useMemo(() => getParishConfig(), []);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>('parish_priest');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* ── Validation ── */
  const validate = useCallback(() => {
    const newErrors: Record<string, string> = {};
    if (!username.trim()) newErrors.username = 'Username is required';
    if (!password.trim()) newErrors.password = 'Password is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [username, password]);

  /* ── Handle Sign In ── */
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);

    // Simulate network delay
    await new Promise((r) => setTimeout(r, 800));

    const role = roles.find((r) => r.id === selectedRole)!;
    const mockUser = {
      username: username.trim() || role.demoUsername,
      role: role.id,
      roleLabel: role.label,
      loginAt: new Date().toISOString(),
    };
    localStorage.setItem('churchos_user', JSON.stringify(mockUser));
    window.location.hash = '/';
    window.location.reload();
  };

  /* ── Role selection with demo username ── */
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
          <span>ChurchOS v1.0</span>
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
            Welcome Back
          </motion.h2>
          <motion.p
            className="text-sm mb-8 text-center lg:text-left"
            style={{ color: '#8C8374', lineHeight: 1.55 }}
            variants={itemVariants}
          >
            Sign in to your parish management system
          </motion.p>

          {/* Form */}
          <form onSubmit={handleSignIn} noValidate>
            {/* Username */}
            <motion.div className="mb-5" variants={itemVariants}>
              <label
                className="label block mb-2"
                style={{ color: '#8C8374', fontSize: '0.75rem', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}
              >
                Username
              </label>
              <div className="relative">
                <User
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px]"
                  style={{ color: '#8C8374' }}
                />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
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

            {/* Role Selector */}
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
                    <span>Signing in...</span>
                  </>
                ) : (
                  <span>Sign In</span>
                )}
              </button>
            </motion.div>

            {/* Forgot password */}
            <motion.div
              className="mt-4 text-center"
              variants={itemVariants}
            >
              <button
                type="button"
                className="text-sm transition-all duration-200 hover:underline"
                style={{ color: '#C9963B' }}
              >
                Forgot password?
              </button>
            </motion.div>
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
              <span>ChurchOS v1.0</span>
              <span>&middot;</span>
              <span>{config.parishName}</span>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
