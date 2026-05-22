import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Church,
  Upload,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Check,
  Sparkles,
  ArrowRight,
  User,
  Lock,
  Globe,
  CalendarDays,
  BookOpen,
  LayoutDashboard,
} from 'lucide-react';

/* ═══════════════════════════════════════════
   TYPES & INTERFACES
   ═══════════════════════════════════════════ */

interface ParishInfo {
  parishName: string;
  diocese: string;
  parishPriestName: string;
  street: string;
  barangay: string;
  city: string;
  province: string;
  contactNumber: string;
  email: string;
}

interface FileUpload {
  file: File | null;
  preview: string | null;
  name: string;
}

interface AdminAccount {
  fullName: string;
  username: string;
  password: string;
  confirmPassword: string;
}

interface MassSchedule {
  id: string;
  day: string;
  time: string;
  language: string;
  notes: string;
}

interface FinancialSettings {
  currency: string;
  fiscalYearStart: string;
  timezone: string;
  dateFormat: string;
}

interface ChartAccount {
  code: string;
  name: string;
  type: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';
  children?: ChartAccount[];
}

interface WizardData {
  parishInfo: ParishInfo;
  logo: FileUpload;
  seal: FileUpload;
  admin: AdminAccount;
  massSchedules: MassSchedule[];
  financial: FinancialSettings;
  useDefaultChart: boolean;
  confirmed: boolean;
}

/* ═══════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════ */

const STEPS = [
  { title: 'Parish Information', description: 'Tell us about your parish' },
  { title: 'Parish Identity', description: 'Upload your parish logo and seal' },
  { title: 'Admin Account', description: 'Create the administrator account' },
  { title: 'Mass Schedule', description: 'Set your Mass schedule' },
  { title: 'Financial Settings', description: 'Configure currency and fiscal year' },
  { title: 'Chart of Accounts', description: 'Review your chart of accounts' },
  { title: 'Launch', description: 'Ready to launch ChurchOS' },
];

const PHILIPPINE_DIOCESES = [
  'Manila', 'Antipolo', 'Cubao', 'Kalookan', 'Malolos', 'Novaliches',
  'Parañaque', 'Pasig', 'San Pablo', 'Lingayen-Dagupan', 'Baguio',
  'Cabanatuan', 'San Fernando', 'Batangas', 'Lucena', 'Boac',
  'Calapan', 'Puerto Princesa', 'Borongan', 'Calbayog', 'Catarman',
  'Cebu', 'Bacolod', 'Dumaguete', 'Tagbilaran', 'Talibon',
  'Maasin', 'Cagayan de Oro', 'Cotabato', 'Davao', 'Digos',
  'Dipolog', 'Iligan', 'Kabankalan', 'Kidapawan', 'Marbel',
];

const PHILIPPINE_PROVINCES = [
  'Metro Manila', 'Abra', 'Agusan del Norte', 'Agusan del Sur', 'Aklan',
  'Albay', 'Antique', 'Apayao', 'Aurora', 'Basilan', 'Bataan',
  'Batanes', 'Batangas', 'Benguet', 'Biliran', 'Bohol', 'Bukidnon',
  'Bulacan', 'Cagayan', 'Camarines Norte', 'Camarines Sur', 'Camiguin',
  'Capiz', 'Catanduanes', 'Cavite', 'Cebu', 'Cotabato', 'Davao del Norte',
  'Davao del Sur', 'Davao Occidental', 'Davao Oriental', 'Dinagat Islands',
  'Eastern Samar', 'Guimaras', 'Ifugao', 'Ilocos Norte', 'Ilocos Sur',
  'Iloilo', 'Isabela', 'Kalinga', 'La Union', 'Laguna', 'Lanao del Norte',
  'Lanao del Sur', 'Leyte', 'Maguindanao', 'Marinduque', 'Masbate',
  'Misamis Occidental', 'Misamis Oriental', 'Mountain Province',
  'Negros Occidental', 'Negros Oriental', 'Northern Samar', 'Nueva Ecija',
  'Nueva Vizcaya', 'Occidental Mindoro', 'Oriental Mindoro', 'Palawan',
  'Pampanga', 'Pangasinan', 'Quezon', 'Quirino', 'Rizal', 'Romblon',
  'Samar', 'Sarangani', 'Siquijor', 'Sorsogon', 'South Cotabato',
  'Southern Leyte', 'Sultan Kudarat', 'Sulu', 'Surigao del Norte',
  'Surigao del Sur', 'Tarlac', 'Tawi-Tawi', 'Zambales', 'Zamboanga del Norte',
  'Zamboanga del Sur', 'Zamboanga Sibugay',
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const LANGUAGES = ['Tagalog', 'English', 'Bilingual', 'Cebuano', 'Ilocano'];
const CURRENCIES = [
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DEFAULT_MASS_SCHEDULES: MassSchedule[] = [
  { id: '1', day: 'Sunday', time: '06:00', language: 'Tagalog', notes: 'Early morning Mass' },
  { id: '2', day: 'Sunday', time: '08:00', language: 'English', notes: 'Family Mass' },
  { id: '3', day: 'Sunday', time: '10:00', language: 'Tagalog', notes: 'Solemn Mass' },
  { id: '4', day: 'Sunday', time: '18:00', language: 'English', notes: 'Evening Mass' },
];

const CHART_OF_ACCOUNTS: ChartAccount[] = [
  {
    code: '1000', name: 'Assets', type: 'Asset',
    children: [
      { code: '1100', name: 'Cash on Hand', type: 'Asset' },
      { code: '1110', name: 'Cash in Bank', type: 'Asset' },
      { code: '1120', name: 'Petty Cash', type: 'Asset' },
      { code: '1200', name: 'Accounts Receivable', type: 'Asset' },
      { code: '1300', name: 'Building', type: 'Asset' },
      { code: '1310', name: 'Equipment', type: 'Asset' },
    ],
  },
  {
    code: '2000', name: 'Liabilities', type: 'Liability',
    children: [
      { code: '2100', name: 'Accounts Payable', type: 'Liability' },
      { code: '2110', name: 'Notes Payable', type: 'Liability' },
    ],
  },
  {
    code: '3000', name: 'Equity', type: 'Equity',
    children: [
      { code: '3100', name: 'Net Assets', type: 'Equity' },
    ],
  },
  {
    code: '4000', name: 'Income', type: 'Income',
    children: [
      { code: '4100', name: 'Sunday Collections', type: 'Income' },
      { code: '4200', name: 'Donations & Gifts', type: 'Income' },
      { code: '4300', name: 'Sacramental Fees', type: 'Income' },
    ],
  },
  {
    code: '5000', name: 'Expenses', type: 'Expense',
    children: [
      { code: '5100', name: 'Personnel', type: 'Expense' },
      { code: '5200', name: 'Utilities', type: 'Expense' },
      { code: '5300', name: 'Maintenance', type: 'Expense' },
      { code: '5400', name: 'Liturgical', type: 'Expense' },
      { code: '5500', name: 'Outreach & SSDM', type: 'Expense' },
    ],
  },
];

const BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  Asset: { bg: 'rgba(59,107,201,0.12)', text: '#3B6BC9' },
  Liability: { bg: 'rgba(184,50,47,0.12)', text: '#B8322F' },
  Equity: { bg: 'rgba(91,58,115,0.12)', text: '#5B3A73' },
  Income: { bg: 'rgba(45,106,79,0.12)', text: '#2D6A4F' },
  Expense: { bg: 'rgba(201,150,59,0.15)', text: '#9A7B3D' },
};

/* ═══════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════ */

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

function getPasswordStrength(password: string): { label: string; score: number; color: string } {
  if (!password) return { label: 'Weak', score: 0, color: '#B8322F' };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { label: 'Weak', score: 1, color: '#B8322F' };
  if (score <= 2) return { label: 'Fair', score: 2, color: '#C9963B' };
  if (score <= 3) return { label: 'Good', score: 3, color: '#C9963B' };
  return { label: 'Strong', score: 4, color: '#2D6A4F' };
}

const easeEnter = [0, 0, 0.2, 1] as [number, number, number, number];

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 60 : -60,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.35, ease: easeEnter },
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -60 : 60,
    opacity: 0,
    transition: { duration: 0.25, ease: easeEnter },
  }),
};

/* ═══════════════════════════════════════════
   CONFETTI COMPONENT
   ═══════════════════════════════════════════ */

interface Particle {
  id: number;
  x: number;
  delay: number;
  duration: number;
  size: number;
  rotation: number;
  color: string;
}

function ConfettiAnimation({ onComplete }: { onComplete: () => void }) {
  const particles = useMemo<Particle[]>(() => {
    const colors = ['#C9963B', '#DDB86B', '#EAE5D9', '#FAF8F3', '#FFFFFF', '#2D6A4F'];
    return Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 0.5,
      duration: 1.5 + Math.random() * 1.5,
      size: 4 + Math.random() * 8,
      rotation: Math.random() * 360,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
  }, []);

  useEffect(() => {
    const timer = setTimeout(onComplete, 3500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 100 }}>
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute"
          style={{
            left: `${p.x}%`,
            top: -20,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
          }}
          initial={{ y: -20, opacity: 1, rotate: 0 }}
          animate={{
            y: window.innerHeight + 40,
            opacity: [1, 1, 0.8, 0],
            rotate: p.rotation,
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
          }}
        />
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════
   STEP 1 — PARISH INFORMATION
   ═══════════════════════════════════════════ */

function Step1ParishInfo({
  data,
  onChange,
  errors,
}: {
  data: ParishInfo;
  onChange: (field: keyof ParishInfo, value: string) => void;
  errors: Record<string, string>;
}) {
  const fields: { key: keyof ParishInfo; label: string; placeholder: string; required: boolean; type?: string }[] = [
    { key: 'parishName', label: 'Parish Name', placeholder: 'e.g., Immaculate Conception Parish', required: true },
    { key: 'parishPriestName', label: 'Parish Priest Name', placeholder: 'Rev. Fr. Full Name', required: true },
    { key: 'street', label: 'Street Address', placeholder: 'Street address', required: false },
    { key: 'barangay', label: 'Barangay', placeholder: 'Barangay', required: false },
    { key: 'city', label: 'City / Municipality', placeholder: 'e.g., Makati City', required: true },
    { key: 'contactNumber', label: 'Contact Number', placeholder: '09XX XXX XXXX', required: false, type: 'tel' },
    { key: 'email', label: 'Email Address', placeholder: 'parish@example.com', required: false, type: 'email' },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {fields.map((f) => (
          <div key={f.key} className={f.key === 'parishName' ? 'md:col-span-2' : ''}>
            <label className="label block mb-1.5" style={{ color: '#8C8374' }}>
              {f.label}
              {f.required && <span style={{ color: '#B8322F' }}>*</span>}
            </label>
            <input
              type={f.type || 'text'}
              value={data[f.key]}
              onChange={(e) => onChange(f.key, e.target.value)}
              placeholder={f.placeholder}
              className="w-full h-10 rounded-md px-3 text-sm font-inter transition-all duration-150"
              style={{
                backgroundColor: '#FFFFFF',
                border: errors[f.key] ? '1px solid #B8322F' : '1px solid #EAE5D9',
                color: '#3D3A36',
                outline: 'none',
              }}
              onFocus={(e) => {
                if (!errors[f.key]) e.currentTarget.style.border = '2px solid #C9963B';
              }}
              onBlur={(e) => {
                e.currentTarget.style.border = errors[f.key] ? '1px solid #B8322F' : '1px solid #EAE5D9';
              }}
            />
            {errors[f.key] && (
              <p className="mt-1 text-xs" style={{ color: '#B8322F' }}>{errors[f.key]}</p>
            )}
          </div>
        ))}

        {/* Diocese Select */}
        <div>
          <label className="label block mb-1.5" style={{ color: '#8C8374' }}>
            Diocese<span style={{ color: '#B8322F' }}>*</span>
          </label>
          <select
            value={data.diocese}
            onChange={(e) => onChange('diocese', e.target.value)}
            className="w-full h-10 rounded-md px-3 text-sm font-inter transition-all duration-150 appearance-none"
            style={{
              backgroundColor: '#FFFFFF',
              border: errors.diocese ? '1px solid #B8322F' : '1px solid #EAE5D9',
              color: data.diocese ? '#3D3A36' : '#8C8374',
              outline: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238C8374' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              paddingRight: '36px',
            }}
            onFocus={(e) => {
              if (!errors.diocese) e.currentTarget.style.border = '2px solid #C9963B';
            }}
            onBlur={(e) => {
              e.currentTarget.style.border = errors.diocese ? '1px solid #B8322F' : '1px solid #EAE5D9';
            }}
          >
            <option value="">Select Diocese</option>
            {PHILIPPINE_DIOCESES.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          {errors.diocese && <p className="mt-1 text-xs" style={{ color: '#B8322F' }}>{errors.diocese}</p>}
        </div>

        {/* Province Select */}
        <div>
          <label className="label block mb-1.5" style={{ color: '#8C8374' }}>
            Province<span style={{ color: '#B8322F' }}>*</span>
          </label>
          <select
            value={data.province}
            onChange={(e) => onChange('province', e.target.value)}
            className="w-full h-10 rounded-md px-3 text-sm font-inter transition-all duration-150 appearance-none"
            style={{
              backgroundColor: '#FFFFFF',
              border: errors.province ? '1px solid #B8322F' : '1px solid #EAE5D9',
              color: data.province ? '#3D3A36' : '#8C8374',
              outline: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238C8374' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              paddingRight: '36px',
            }}
            onFocus={(e) => {
              if (!errors.province) e.currentTarget.style.border = '2px solid #C9963B';
            }}
            onBlur={(e) => {
              e.currentTarget.style.border = errors.province ? '1px solid #B8322F' : '1px solid #EAE5D9';
            }}
          >
            <option value="">Select Province</option>
            {PHILIPPINE_PROVINCES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          {errors.province && <p className="mt-1 text-xs" style={{ color: '#B8322F' }}>{errors.province}</p>}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   STEP 2 — PARISH IDENTITY (UPLOADS)
   ═══════════════════════════════════════════ */

function FileDropZone({
  label,
  upload,
  onChange,
  icon: Icon,
  storageKey,
}: {
  label: string;
  upload: FileUpload;
  onChange: (u: FileUpload) => void;
  icon: React.ElementType;
  storageKey?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      onChange({
        file,
        preview: base64,
        name: file.name,
      });
      if (storageKey) localStorage.setItem(storageKey, base64);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  return (
    <div>
      <p className="text-sm font-medium mb-2" style={{ color: '#3D3A36' }}>{label}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      {!upload.preview ? (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className="flex flex-col items-center justify-center rounded-xl cursor-pointer transition-all duration-200"
          style={{
            height: 200,
            border: isDragOver ? '2px dashed #C9963B' : '2px dashed #EAE5D9',
            backgroundColor: isDragOver ? 'rgba(201,150,59,0.04)' : '#FFFFFF',
          }}
        >
          <Icon className="w-12 h-12 mb-3" style={{ color: '#8C8374' }} />
          <p className="text-sm font-medium mb-1" style={{ color: '#3D3A36' }}>
            Click to upload or drag and drop
          </p>
          <p className="text-xs" style={{ color: '#8C8374' }}>
            PNG, JPG up to 5MB
          </p>
        </div>
      ) : (
        <motion.div
          className="flex flex-col items-center justify-center rounded-xl p-6"
          style={{ backgroundColor: '#FAF8F3', border: '1px solid #EAE5D9' }}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.25, ease: easeEnter }}
        >
          <img
            src={upload.preview}
            alt={upload.name}
            className="w-28 h-28 object-contain rounded-lg mb-3"
            style={{ border: '1px solid #EAE5D9' }}
          />
          <p className="text-sm font-medium mb-0.5" style={{ color: '#3D3A36' }}>{upload.name}</p>
          {upload.file && (
            <p className="text-xs mb-3" style={{ color: '#8C8374' }}>
              {(upload.file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          )}
          <button
            type="button"
            onClick={() => onChange({ file: null, preview: null, name: '' })}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors duration-150"
            style={{ color: '#B8322F', backgroundColor: 'rgba(184,50,47,0.08)' }}
          >
            <X className="w-3 h-3" /> Remove
          </button>
        </motion.div>
      )}
    </div>
  );
}

function Step2Identity({
  logo,
  seal,
  onLogoChange,
  onSealChange,
}: {
  logo: FileUpload;
  seal: FileUpload;
  onLogoChange: (u: FileUpload) => void;
  onSealChange: (u: FileUpload) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <FileDropZone label="Parish Logo" upload={logo} onChange={onLogoChange} icon={Upload} storageKey="churchos_wizard_logo" />
      <FileDropZone label="Official Seal" upload={seal} onChange={onSealChange} icon={Upload} storageKey="churchos_wizard_seal" />
    </div>
  );
}

/* ═══════════════════════════════════════════
   STEP 3 — ADMIN ACCOUNT
   ═══════════════════════════════════════════ */

function Step3AdminAccount({
  data,
  onChange,
  errors,
}: {
  data: AdminAccount;
  onChange: (field: keyof AdminAccount, value: string) => void;
  errors: Record<string, string>;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const strength = getPasswordStrength(data.password);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="md:col-span-2">
          <label className="label block mb-1.5" style={{ color: '#8C8374' }}>
            Full Name<span style={{ color: '#B8322F' }}>*</span>
          </label>
          <input
            type="text"
            value={data.fullName}
            onChange={(e) => onChange('fullName', e.target.value)}
            placeholder="Administrator's complete name"
            className="w-full h-10 rounded-md px-3 text-sm font-inter transition-all duration-150"
            style={{
              backgroundColor: '#FFFFFF',
              border: errors.fullName ? '1px solid #B8322F' : '1px solid #EAE5D9',
              color: '#3D3A36',
              outline: 'none',
            }}
            onFocus={(e) => { if (!errors.fullName) e.currentTarget.style.border = '2px solid #C9963B'; }}
            onBlur={(e) => { e.currentTarget.style.border = errors.fullName ? '1px solid #B8322F' : '1px solid #EAE5D9'; }}
          />
          {errors.fullName && <p className="mt-1 text-xs" style={{ color: '#B8322F' }}>{errors.fullName}</p>}
        </div>

        <div className="md:col-span-2">
          <label className="label block mb-1.5" style={{ color: '#8C8374' }}>
            Username<span style={{ color: '#B8322F' }}>*</span>
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#8C8374' }} />
            <input
              type="text"
              value={data.username}
              onChange={(e) => onChange('username', e.target.value)}
              placeholder="System login name"
              className="w-full h-10 rounded-md pl-10 pr-3 text-sm font-inter transition-all duration-150"
              style={{
                backgroundColor: '#FFFFFF',
                border: errors.username ? '1px solid #B8322F' : '1px solid #EAE5D9',
                color: '#3D3A36',
                outline: 'none',
              }}
              onFocus={(e) => { if (!errors.username) e.currentTarget.style.border = '2px solid #C9963B'; }}
              onBlur={(e) => { e.currentTarget.style.border = errors.username ? '1px solid #B8322F' : '1px solid #EAE5D9'; }}
            />
          </div>
          {errors.username && <p className="mt-1 text-xs" style={{ color: '#B8322F' }}>{errors.username}</p>}
        </div>

        <div>
          <label className="label block mb-1.5" style={{ color: '#8C8374' }}>
            Password<span style={{ color: '#B8322F' }}>*</span>
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#8C8374' }} />
            <input
              type={showPassword ? 'text' : 'password'}
              value={data.password}
              onChange={(e) => onChange('password', e.target.value)}
              placeholder="Min. 8 characters"
              className="w-full h-10 rounded-md pl-10 pr-10 text-sm font-inter transition-all duration-150"
              style={{
                backgroundColor: '#FFFFFF',
                border: errors.password ? '1px solid #B8322F' : '1px solid #EAE5D9',
                color: '#3D3A36',
                outline: 'none',
              }}
              onFocus={(e) => { if (!errors.password) e.currentTarget.style.border = '2px solid #C9963B'; }}
              onBlur={(e) => { e.currentTarget.style.border = errors.password ? '1px solid #B8322F' : '1px solid #EAE5D9'; }}
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#8C8374' }}>
              {showPassword ? <Lock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && <p className="mt-1 text-xs" style={{ color: '#B8322F' }}>{errors.password}</p>}

          {/* Password Strength */}
          {data.password && (
            <div className="mt-2">
              <div className="flex gap-1 mb-1">
                {[1, 2, 3, 4].map((level) => (
                  <div
                    key={level}
                    className="h-1.5 flex-1 rounded-full transition-all duration-200"
                    style={{
                      backgroundColor: level <= strength.score ? strength.color : '#EAE5D9',
                    }}
                  />
                ))}
              </div>
              <p className="text-xs" style={{ color: strength.color }}>
                {strength.label}
              </p>
            </div>
          )}
        </div>

        <div>
          <label className="label block mb-1.5" style={{ color: '#8C8374' }}>
            Confirm Password<span style={{ color: '#B8322F' }}>*</span>
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#8C8374' }} />
            <input
              type={showConfirm ? 'text' : 'password'}
              value={data.confirmPassword}
              onChange={(e) => onChange('confirmPassword', e.target.value)}
              placeholder="Re-enter password"
              className="w-full h-10 rounded-md pl-10 pr-10 text-sm font-inter transition-all duration-150"
              style={{
                backgroundColor: '#FFFFFF',
                border: errors.confirmPassword ? '1px solid #B8322F' : '1px solid #EAE5D9',
                color: '#3D3A36',
                outline: 'none',
              }}
              onFocus={(e) => { if (!errors.confirmPassword) e.currentTarget.style.border = '2px solid #C9963B'; }}
              onBlur={(e) => { e.currentTarget.style.border = errors.confirmPassword ? '1px solid #B8322F' : '1px solid #EAE5D9'; }}
            />
            <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#8C8374' }}>
              {showConfirm ? <Lock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            </button>
          </div>
          {errors.confirmPassword && <p className="mt-1 text-xs" style={{ color: '#B8322F' }}>{errors.confirmPassword}</p>}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   STEP 4 — MASS SCHEDULE
   ═══════════════════════════════════════════ */

function Step4MassSchedule({
  schedules,
  onChange,
}: {
  schedules: MassSchedule[];
  onChange: (s: MassSchedule[]) => void;
}) {
  const addRow = () => {
    onChange([
      ...schedules,
      { id: generateId(), day: 'Sunday', time: '08:00', language: 'Tagalog', notes: '' },
    ]);
  };

  const updateRow = (id: string, field: keyof MassSchedule, value: string) => {
    onChange(schedules.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const removeRow = (id: string) => {
    onChange(schedules.filter((s) => s.id !== id));
  };

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: '#EAE5D9' }}>
        <table className="w-full">
          <thead>
            <tr style={{ backgroundColor: '#F2EFE8' }}>
              <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: '#8C8374', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Day</th>
              <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: '#8C8374', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Time</th>
              <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: '#8C8374', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Language</th>
              <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: '#8C8374', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Notes</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout">
              {schedules.map((s, i) => (
                <motion.tr
                  key={s.id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: easeEnter, delay: i * 0.04 }}
                  style={{ backgroundColor: i % 2 === 0 ? '#FFFFFF' : '#F5F3EE' }}
                >
                  <td className="px-4 py-2">
                    <select
                      value={s.day}
                      onChange={(e) => updateRow(s.id, 'day', e.target.value)}
                      className="h-9 rounded-md px-2 text-sm appearance-none"
                      style={{ backgroundColor: '#FFFFFF', border: '1px solid #EAE5D9', color: '#3D3A36', outline: 'none' }}
                    >
                      {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="time"
                      value={s.time}
                      onChange={(e) => updateRow(s.id, 'time', e.target.value)}
                      className="h-9 rounded-md px-2 text-sm"
                      style={{ backgroundColor: '#FFFFFF', border: '1px solid #EAE5D9', color: '#3D3A36', outline: 'none' }}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={s.language}
                      onChange={(e) => updateRow(s.id, 'language', e.target.value)}
                      className="h-9 rounded-md px-2 text-sm appearance-none"
                      style={{ backgroundColor: '#FFFFFF', border: '1px solid #EAE5D9', color: '#3D3A36', outline: 'none' }}
                    >
                      {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={s.notes}
                      onChange={(e) => updateRow(s.id, 'notes', e.target.value)}
                      placeholder="Optional notes"
                      className="h-9 rounded-md px-2 text-sm w-full"
                      style={{ backgroundColor: '#FFFFFF', border: '1px solid #EAE5D9', color: '#3D3A36', outline: 'none' }}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => removeRow(s.id)}
                      className="p-1.5 rounded-md transition-colors duration-150"
                      style={{ color: '#B8322F' }}
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={addRow}
        className="mt-4 flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200"
        style={{
          backgroundColor: 'transparent',
          color: '#1B2A4A',
          border: '1px solid #EAE5D9',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#F2EFE8';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <Plus className="w-4 h-4" /> Add Mass Schedule
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════
   STEP 5 — CURRENCY & FISCAL YEAR
   ═══════════════════════════════════════════ */

function Step5Financial({
  data,
  onChange,
}: {
  data: FinancialSettings;
  onChange: (field: keyof FinancialSettings, value: string) => void;
}) {
  const currency = CURRENCIES.find((c) => c.code === data.currency) || CURRENCIES[0];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Currency */}
        <div>
          <label className="label block mb-1.5" style={{ color: '#8C8374' }}>Currency</label>
          <select
            value={data.currency}
            onChange={(e) => onChange('currency', e.target.value)}
            className="w-full h-10 rounded-md px-3 text-sm font-inter appearance-none transition-all duration-150"
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #EAE5D9',
              color: '#3D3A36',
              outline: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238C8374' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              paddingRight: '36px',
            }}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.symbol} {c.name} ({c.code})</option>
            ))}
          </select>
        </div>

        {/* Fiscal Year Start */}
        <div>
          <label className="label block mb-1.5" style={{ color: '#8C8374' }}>Fiscal Year Start</label>
          <select
            value={data.fiscalYearStart}
            onChange={(e) => onChange('fiscalYearStart', e.target.value)}
            className="w-full h-10 rounded-md px-3 text-sm font-inter appearance-none transition-all duration-150"
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #EAE5D9',
              color: '#3D3A36',
              outline: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238C8374' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              paddingRight: '36px',
            }}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={String(i + 1)}>{m} 1</option>
            ))}
          </select>
        </div>

        {/* Timezone — locked to Manila */}
        <div>
          <label className="label block mb-1.5" style={{ color: '#8C8374' }}>Timezone</label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#8C8374' }} />
            <input
              type="text"
              value="Asia/Manila"
              disabled
              className="w-full h-10 rounded-md pl-10 pr-3 text-sm font-inter"
              style={{
                backgroundColor: '#F5F3EE',
                border: '1px solid #EAE5D9',
                color: '#8C8374',
                cursor: 'not-allowed',
              }}
            />
          </div>
          <p className="mt-1 text-xs" style={{ color: '#8C8374' }}>Locked for Philippines</p>
        </div>

        {/* Date Format */}
        <div>
          <label className="label block mb-1.5" style={{ color: '#8C8374' }}>Date Format</label>
          <select
            value={data.dateFormat}
            onChange={(e) => onChange('dateFormat', e.target.value)}
            className="w-full h-10 rounded-md px-3 text-sm font-inter appearance-none transition-all duration-150"
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #EAE5D9',
              color: '#3D3A36',
              outline: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238C8374' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              paddingRight: '36px',
            }}
          >
            <option value="MMMM d, yyyy">May 20, 2026</option>
            <option value="MM/dd/yyyy">05/20/2026</option>
            <option value="dd/MM/yyyy">20/05/2026</option>
            <option value="yyyy-MM-dd">2026-05-20</option>
          </select>
        </div>
      </div>

      {/* Preview */}
      <div className="rounded-lg p-4 text-center" style={{ backgroundColor: '#F2EFE8' }}>
        <p className="text-xs mb-1" style={{ color: '#8C8374' }}>Amount preview</p>
        <motion.p
          className="text-2xl font-semibold font-playfair"
          style={{ color: '#1B2A4A' }}
          key={data.currency}
          initial={{ scale: 1 }}
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 0.2 }}
        >
          {currency.symbol}1,234.56
        </motion.p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   STEP 6 — CHART OF ACCOUNTS
   ═══════════════════════════════════════════ */

function AccountRow({
  account,
  depth = 0,
}: {
  account: ChartAccount;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = account.children && account.children.length > 0;
  const badge = BADGE_COLORS[account.type] || BADGE_COLORS.Asset;

  return (
    <div>
      <div
        className="flex items-center gap-3 py-2 px-3 rounded-lg transition-colors duration-150"
        style={{
          paddingLeft: `${12 + depth * 24}px`,
          cursor: hasChildren ? 'pointer' : 'default',
        }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren ? (
          expanded ? <ChevronDown className="w-4 h-4 shrink-0" style={{ color: '#8C8374' }} /> : <ChevronRight className="w-4 h-4 shrink-0" style={{ color: '#8C8374' }} />
        ) : (
          <div className="w-4 shrink-0" />
        )}
        <span className="mono-sm shrink-0 w-16" style={{ color: '#8C8374' }}>{account.code}</span>
        <span className="text-sm flex-1" style={{ color: '#3D3A36' }}>{account.name}</span>
        <span
          className="badge-text px-2 py-0.5 rounded-full"
          style={{ backgroundColor: badge.bg, color: badge.text }}
        >
          {account.type}
        </span>
      </div>
      <AnimatePresence>
        {hasChildren && expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: easeEnter }}
            style={{ overflow: 'hidden' }}
          >
            {account.children!.map((child) => (
              <AccountRow key={child.code} account={child} depth={depth + 1} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Step6ChartOfAccounts({
  useDefault,
  onToggle,
}: {
  useDefault: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <p className="text-sm mb-4" style={{ color: '#8C8374' }}>
        ChurchOS comes with a CBCP-standard chart of accounts. Review the default accounts below.
      </p>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#EAE5D9', backgroundColor: '#FFFFFF' }}>
        {CHART_OF_ACCOUNTS.map((account) => (
          <AccountRow key={account.code} account={account} />
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-2"
        >
          <div
            className="w-5 h-5 rounded flex items-center justify-center transition-all duration-200"
            style={{
              backgroundColor: useDefault ? '#C9963B' : '#FFFFFF',
              border: useDefault ? '2px solid #C9963B' : '2px solid #EAE5D9',
            }}
          >
            {useDefault && <Check className="w-3 h-3 text-white" />}
          </div>
          <span className="text-sm" style={{ color: '#3D3A36' }}>
            Initialize with this template
          </span>
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   STEP 7 — REVIEW & LAUNCH
   ═══════════════════════════════════════════ */

function Step7Review({
  data,
  confirmed,
  onToggleConfirmed,
}: {
  data: WizardData;
  confirmed: boolean;
  onToggleConfirmed: () => void;
}) {
  const massCount = data.massSchedules.length;
  const accountCount = CHART_OF_ACCOUNTS.reduce((acc, a) => acc + 1 + (a.children?.length || 0), 0);
  const currency = CURRENCIES.find((c) => c.code === data.financial.currency) || CURRENCIES[0];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Parish Card */}
        <motion.div
          className="rounded-xl p-5"
          style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(234,229,217,0.6)' }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: easeEnter, delay: 0 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Church className="w-5 h-5" style={{ color: '#C9963B' }} />
            <h3 className="heading-sm" style={{ color: '#3D3A36' }}>Parish</h3>
          </div>
          <p className="heading-md mb-1" style={{ color: '#1B2A4A' }}>
            {data.parishInfo.parishName || 'Your Parish'}
          </p>
          <p className="text-xs mb-0.5" style={{ color: '#8C8374' }}>
            {data.parishInfo.diocese} Diocese
          </p>
          <p className="text-xs mb-0.5" style={{ color: '#8C8374' }}>
            {data.parishInfo.city}, {data.parishInfo.province}
          </p>
          <p className="text-xs" style={{ color: '#8C8374' }}>
            {data.parishInfo.parishPriestName}
          </p>
        </motion.div>

        {/* Schedule Card */}
        <motion.div
          className="rounded-xl p-5"
          style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(234,229,217,0.6)' }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: easeEnter, delay: 0.08 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays className="w-5 h-5" style={{ color: '#C9963B' }} />
            <h3 className="heading-sm" style={{ color: '#3D3A36' }}>Schedule</h3>
          </div>
          <p className="heading-md mb-2" style={{ color: '#1B2A4A' }}>
            {massCount} Mass schedule{massCount !== 1 ? 's' : ''}
          </p>
          {data.massSchedules.slice(0, 4).map((s, i) => (
            <p key={s.id} className="text-xs mb-0.5" style={{ color: '#8C8374' }}>
              {s.day}s at {s.time} ({s.language})
            </p>
          ))}
          {massCount > 4 && (
            <p className="text-xs mt-1" style={{ color: '#C9963B' }}>+ {massCount - 4} more</p>
          )}
        </motion.div>

        {/* Accounts Card */}
        <motion.div
          className="rounded-xl p-5"
          style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(234,229,217,0.6)' }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: easeEnter, delay: 0.16 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-5 h-5" style={{ color: '#C9963B' }} />
            <h3 className="heading-sm" style={{ color: '#3D3A36' }}>Accounts</h3>
          </div>
          <p className="heading-md mb-2" style={{ color: '#1B2A4A' }}>
            {accountCount} accounts
          </p>
          <p className="text-xs mb-0.5" style={{ color: '#8C8374' }}>
            Fiscal: Jan 1 &mdash; Dec 31
          </p>
          <p className="text-xs" style={{ color: '#8C8374' }}>
            Currency: {currency.name} ({currency.symbol})
          </p>
        </motion.div>
      </div>

      {/* Confirmation Checkbox */}
      <motion.div
        className="flex items-start gap-3 p-4 rounded-xl"
        style={{ backgroundColor: 'rgba(201,150,59,0.06)', border: '1px solid rgba(201,150,59,0.2)' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: easeEnter, delay: 0.24 }}
      >
        <button
          type="button"
          onClick={onToggleConfirmed}
          className="mt-0.5 shrink-0"
        >
          <div
            className="w-5 h-5 rounded flex items-center justify-center transition-all duration-200"
            style={{
              backgroundColor: confirmed ? '#C9963B' : '#FFFFFF',
              border: confirmed ? '2px solid #C9963B' : '2px solid #EAE5D9',
            }}
          >
            {confirmed && <Check className="w-3 h-3 text-white" />}
          </div>
        </button>
        <p className="text-sm" style={{ color: '#3D3A36' }}>
          I confirm that the information provided is accurate and I am authorized to set up this parish system.
        </p>
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN WIZARD PAGE
   ═══════════════════════════════════════════ */

export default function WizardPage() {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLaunching, setIsLaunching] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const [data, setData] = useState<WizardData>(() => {
    const saved = localStorage.getItem('churchos_wizard');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          parishInfo: parsed.parishInfo || {
            parishName: '', diocese: '', parishPriestName: '',
            street: '', barangay: '', city: '', province: '',
            contactNumber: '', email: '',
          },
          logo: parsed.logo || { file: null, preview: null, name: '' },
          seal: parsed.seal || { file: null, preview: null, name: '' },
          admin: parsed.admin || { fullName: '', username: '', password: '', confirmPassword: '' },
          massSchedules: parsed.massSchedules || DEFAULT_MASS_SCHEDULES.map((s) => ({ ...s })),
          financial: parsed.financial || {
            currency: 'PHP', fiscalYearStart: '1', timezone: 'Asia/Manila', dateFormat: 'MMMM d, yyyy',
          },
          useDefaultChart: parsed.useDefaultChart !== false,
          confirmed: false,
        };
      } catch {
        // ignore
      }
    }
    return {
      parishInfo: {
        parishName: '', diocese: '', parishPriestName: '',
        street: '', barangay: '', city: '', province: '',
        contactNumber: '', email: '',
      },
      logo: { file: null, preview: null, name: '' },
      seal: { file: null, preview: null, name: '' },
      admin: { fullName: '', username: '', password: '', confirmPassword: '' },
      massSchedules: DEFAULT_MASS_SCHEDULES.map((s) => ({ ...s })),
      financial: {
        currency: 'PHP', fiscalYearStart: '1', timezone: 'Asia/Manila', dateFormat: 'MMMM d, yyyy',
      },
      useDefaultChart: true,
      confirmed: false,
    };
  });

  /* Restore logo/seal previews from localStorage on mount */
  useEffect(() => {
    const savedLogo = localStorage.getItem('churchos_wizard_logo');
    if (savedLogo && !data.logo.preview) {
      setData((d) => ({ ...d, logo: { ...d.logo, preview: savedLogo } }));
    }
    const savedSeal = localStorage.getItem('churchos_wizard_seal');
    if (savedSeal && !data.seal.preview) {
      setData((d) => ({ ...d, seal: { ...d.seal, preview: savedSeal } }));
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Persist draft to localStorage */
  useEffect(() => {
    const toSave = {
      parishInfo: data.parishInfo,
      logo: { file: null, preview: data.logo.preview, name: data.logo.name },
      seal: { file: null, preview: data.seal.preview, name: data.seal.name },
      admin: { ...data.admin, password: '', confirmPassword: '' },
      massSchedules: data.massSchedules,
      financial: data.financial,
      useDefaultChart: data.useDefaultChart,
    };
    localStorage.setItem('churchos_wizard', JSON.stringify(toSave));
  }, [data]);

  /* ── Validation per step ── */
  const validateStep = useCallback((s: number): boolean => {
    const newErrors: Record<string, string> = {};
    if (s === 0) {
      if (!data.parishInfo.parishName.trim()) newErrors.parishName = 'Parish name is required';
      if (!data.parishInfo.diocese) newErrors.diocese = 'Diocese is required';
      if (!data.parishInfo.parishPriestName.trim()) newErrors.parishPriestName = 'Parish priest name is required';
      if (!data.parishInfo.city.trim()) newErrors.city = 'City is required';
      if (!data.parishInfo.province) newErrors.province = 'Province is required';
    }
    if (s === 2) {
      if (!data.admin.fullName.trim()) newErrors.fullName = 'Full name is required';
      if (!data.admin.username.trim()) newErrors.username = 'Username is required';
      if (!data.admin.password || data.admin.password.length < 8) newErrors.password = 'Password must be at least 8 characters';
      if (data.admin.password !== data.admin.confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [data]);

  /* ── Navigation ── */
  const goNext = () => {
    if (!validateStep(step)) return;
    if (step < 6) {
      setDirection(1);
      setStep(step + 1);
    }
  };

  const goBack = () => {
    if (step > 0) {
      setDirection(-1);
      setStep(step - 1);
      setErrors({});
    }
  };

  const handleLaunch = async () => {
    if (!data.confirmed) return;
    setIsLaunching(true);
    await new Promise((r) => setTimeout(r, 2000));
    setIsLaunching(false);
    setShowConfetti(true);
  };

  const handleConfettiComplete = () => {
    setShowSuccess(true);
  };

  const handleGoToDashboard = () => {
    localStorage.removeItem('churchos_wizard_logo');
    localStorage.removeItem('churchos_wizard_seal');
    localStorage.setItem('churchos_setup_complete', 'true');
    localStorage.setItem('churchos_user', JSON.stringify({
      username: data.admin.username || 'admin',
      role: 'parish_priest',
      roleLabel: 'Parish Priest',
      loginAt: new Date().toISOString(),
    }));
    window.location.hash = '/';
    window.location.reload();
  };

  /* ── Update helpers ── */
  const updateParishInfo = (field: keyof ParishInfo, value: string) => {
    setData((d) => ({ ...d, parishInfo: { ...d.parishInfo, [field]: value } }));
    if (errors[field]) setErrors((e) => { const n = { ...e }; delete n[field]; return n; });
  };

  const updateAdmin = (field: keyof AdminAccount, value: string) => {
    setData((d) => ({ ...d, admin: { ...d.admin, [field]: value } }));
    if (errors[field]) setErrors((e) => { const n = { ...e }; delete n[field]; return n; });
  };

  const updateFinancial = (field: keyof FinancialSettings, value: string) => {
    setData((d) => ({ ...d, financial: { ...d.financial, [field]: value } }));
  };

  /* ── Progress segments ── */
  const progressPercent = ((step) / 6) * 100;

  /* ── Render ── */
  return (
    <div
      className="fixed inset-0 z-modal flex flex-col overflow-hidden"
      style={{ marginLeft: 0, backgroundColor: '#FAF8F3' }}
    >
      {showConfetti && <ConfettiAnimation onComplete={handleConfettiComplete} />}

      {/* Top Bar */}
      <div
        className="shrink-0 flex items-center justify-center gap-3 px-6"
        style={{ backgroundColor: '#1B2A4A', height: 56 }}
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ backgroundColor: '#C9963B' }}>
          <Church className="w-4 h-4 text-white" />
        </div>
        <span className="font-playfair text-base font-semibold text-white">ChurchOS</span>
        <span className="text-white/30 mx-1">|</span>
        <span className="text-sm text-white/70">Setup Wizard</span>
      </div>

      {/* Progress Bar */}
      <div className="shrink-0 w-full h-1" style={{ backgroundColor: '#EAE5D9' }}>
        <motion.div
          className="h-full"
          style={{ backgroundColor: '#C9963B' }}
          initial={{ width: 0 }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.4, ease: easeEnter }}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-4 py-6 md:py-10">
        <div className="max-w-[720px] mx-auto">
          {/* Step Indicator */}
          {!showSuccess && (
            <div className="mb-8">
              <div className="flex items-center justify-center gap-1 mb-3">
                {STEPS.map((s, i) => (
                  <div key={i} className="flex items-center">
                    <div
                      className="flex items-center justify-center rounded-full text-xs font-semibold transition-all duration-300"
                      style={{
                        width: i === step ? 36 : 32,
                        height: i === step ? 36 : 32,
                        backgroundColor: i < step ? '#C9963B' : i === step ? '#C9963B' : '#FFFFFF',
                        border: i <= step ? '2px solid #C9963B' : '2px solid #EAE5D9',
                        color: i <= step ? '#FFFFFF' : '#8C8374',
                        transform: i === step ? 'scale(1.1)' : 'scale(1)',
                      }}
                    >
                      {i < step ? <Check className="w-4 h-4" /> : i + 1}
                    </div>
                    {i < 6 && (
                      <div
                        className="w-6 md:w-10 h-0.5 mx-0.5 transition-all duration-300"
                        style={{ backgroundColor: i < step ? '#C9963B' : '#EAE5D9' }}
                      />
                    )}
                  </div>
                ))}
              </div>
              <p className="text-center text-xs font-medium" style={{ color: '#C9963B', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Step {step + 1} of 7 &mdash; {STEPS[step].title}
              </p>
            </div>
          )}

          {/* Card */}
          {!showSuccess ? (
            <div
              className="rounded-xl p-6 md:p-8"
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid rgba(234,229,217,0.6)',
                boxShadow: '0 1px 3px rgba(27,42,74,0.08), 0 1px 2px rgba(27,42,74,0.04)',
              }}
            >
              {/* Step Title */}
              <div className="mb-6">
                <h2 className="font-playfair text-2xl md:text-3xl font-bold mb-2" style={{ color: '#1B2A4A', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                  {STEPS[step].description}
                </h2>
                <p className="text-sm" style={{ color: '#8C8374' }}>
                  {step === 0 && "This information will appear on certificates, reports, and official documents."}
                  {step === 1 && "This will appear on certificates and official documents."}
                  {step === 2 && "This account will have full access to all ChurchOS modules. Additional users can be added later."}
                  {step === 3 && "Add the regular Mass schedules for your parish. You can add more or edit these later in Settings."}
                  {step === 4 && "Configure your accounting preferences. These affect how amounts are displayed and how reports are generated."}
                  {step === 5 && "ChurchOS comes with a default chart of accounts aligned with CBCP guidelines."}
                  {step === 6 && "Review your configuration and launch your parish management system."}
                </p>
              </div>

              {/* Step Content */}
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={step}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                >
                  {step === 0 && (
                    <Step1ParishInfo
                      data={data.parishInfo}
                      onChange={updateParishInfo}
                      errors={errors}
                    />
                  )}
                  {step === 1 && (
                    <Step2Identity
                      logo={data.logo}
                      seal={data.seal}
                      onLogoChange={(logo) => setData((d) => ({ ...d, logo }))}
                      onSealChange={(seal) => setData((d) => ({ ...d, seal }))}
                    />
                  )}
                  {step === 2 && (
                    <Step3AdminAccount
                      data={data.admin}
                      onChange={updateAdmin}
                      errors={errors}
                    />
                  )}
                  {step === 3 && (
                    <Step4MassSchedule
                      schedules={data.massSchedules}
                      onChange={(schedules) => setData((d) => ({ ...d, massSchedules: schedules }))}
                    />
                  )}
                  {step === 4 && (
                    <Step5Financial
                      data={data.financial}
                      onChange={updateFinancial}
                    />
                  )}
                  {step === 5 && (
                    <Step6ChartOfAccounts
                      useDefault={data.useDefaultChart}
                      onToggle={() => setData((d) => ({ ...d, useDefaultChart: !d.useDefaultChart }))}
                    />
                  )}
                  {step === 6 && (
                    <Step7Review
                      data={data}
                      confirmed={data.confirmed}
                      onToggleConfirmed={() => setData((d) => ({ ...d, confirmed: !d.confirmed }))}
                    />
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Navigation Buttons */}
              <div className="mt-8 flex items-center gap-4">
                {step > 0 && step < 6 && (
                  <button
                    type="button"
                    onClick={goBack}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200"
                    style={{
                      backgroundColor: 'transparent',
                      color: '#8C8374',
                      border: '1px solid #EAE5D9',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F2EFE8'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                )}
                <div className="flex-1" />
                {step < 6 ? (
                  <button
                    type="button"
                    onClick={goNext}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium text-white transition-all duration-200"
                    style={{ backgroundColor: '#C9963B' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#DDB86B'; e.currentTarget.style.transform = 'scale(1.02)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#C9963B'; e.currentTarget.style.transform = 'scale(1)'; }}
                    onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
                    onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; }}
                  >
                    Next <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleLaunch}
                    disabled={!data.confirmed || isLaunching}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium text-white transition-all duration-200"
                    style={{
                      backgroundColor: !data.confirmed || isLaunching ? '#DDB86B' : '#C9963B',
                      cursor: !data.confirmed || isLaunching ? 'not-allowed' : 'pointer',
                      opacity: !data.confirmed ? 0.6 : 1,
                    }}
                  >
                    {isLaunching ? (
                      <>
                        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <span>Launching...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        <span>Launch ChurchOS</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Success Screen */
            <motion.div
              className="flex flex-col items-center justify-center py-16"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: easeEnter }}
            >
              <motion.div
                className="flex items-center justify-center w-24 h-24 rounded-full mb-8"
                style={{ backgroundColor: 'rgba(201,150,59,0.15)', border: '3px solid #C9963B' }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number], delay: 0.2 }}
              >
                <Church className="w-12 h-12" style={{ color: '#C9963B' }} />
              </motion.div>

              <motion.h2
                className="font-playfair text-3xl md:text-4xl font-bold mb-3 text-center"
                style={{ color: '#1B2A4A' }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5, ease: easeEnter }}
              >
                Welcome to ChurchOS!
              </motion.h2>

              <motion.p
                className="text-base text-center max-w-md mb-10"
                style={{ color: '#8C8374' }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.5, ease: easeEnter }}
              >
                Your parish management system is ready. God bless your ministry!
              </motion.p>

              <motion.button
                type="button"
                onClick={handleGoToDashboard}
                className="flex items-center gap-2 px-8 py-3.5 rounded-lg text-sm font-medium text-white transition-all duration-200"
                style={{ backgroundColor: '#C9963B' }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.5, ease: easeEnter }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#DDB86B'; e.currentTarget.style.transform = 'scale(1.02)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#C9963B'; e.currentTarget.style.transform = 'scale(1)'; }}
              >
                <LayoutDashboard className="w-5 h-5" /> Go to Dashboard
              </motion.button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}


