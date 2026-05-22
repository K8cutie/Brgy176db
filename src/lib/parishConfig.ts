// Global Parish Configuration — Single Source of Truth
// All modules read from here. Settings writes to here.

export interface ParishConfig {
  parishName: string;
  parishShortName: string;
  diocese: string;
  parishPriest: string;
  priestTitle: string;
  priestFullName: string;
  address: string;
  addressStreet: string;
  addressBarangay: string;
  addressSitio: string;
  addressCity: string;
  addressProvince: string;
  contactNumber: string;
  email: string;
  website: string;
  facebook: string;
  feastDay: string;
  yearEstablished: string;
  currency: string;
  currencySymbol: string;
  timezone: string;
  language: string;
}

export const DEFAULT_PARISH_CONFIG: ParishConfig = {
  parishName: 'St. Agnes Parish',
  parishShortName: 'St. Agnes',
  diocese: 'Diocese of San Fernando',
  parishPriest: 'Fr. Antonio Reyes',
  priestTitle: 'Parish Priest',
  priestFullName: 'Rev. Fr. Antonio M. Reyes',
  address: '123 Rizal Street, Barangay San Roque, Mabalacat, Pampanga, 2010',
  addressStreet: '123 Rizal Street',
  addressBarangay: 'San Roque',
  addressSitio: 'Maligaya',
  addressCity: 'Mabalacat',
  addressProvince: 'Pampanga',
  contactNumber: '+63 45 961 2345',
  email: 'info@stagnesparish.org',
  website: 'https://stagnesparish.org',
  facebook: 'https://facebook.com/StAgnesParishMabalacat',
  feastDay: 'January 21',
  yearEstablished: '1985',
  currency: 'PHP',
  currencySymbol: '\u20B1',
  timezone: 'Asia/Manila',
  language: 'English',
};

const CONFIG_KEY = 'churchos_parish_config';

export function getParishConfig(): ParishConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return { ...DEFAULT_PARISH_CONFIG, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_PARISH_CONFIG };
}

export function setParishConfig(updates: Partial<ParishConfig>) {
  const current = getParishConfig();
  const merged = { ...current, ...updates };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(merged));
}

// Format helpers used by certificates, reports, etc.
export function getFullAddress(config?: ParishConfig): string {
  const c = config || getParishConfig();
  return `${c.addressStreet}, Barangay ${c.addressBarangay}, ${c.addressCity}, ${c.addressProvince}`;
}

export function getParishName(config?: ParishConfig): string {
  return (config || getParishConfig()).parishName;
}

export function getPriestName(config?: ParishConfig): string {
  return (config || getParishConfig()).parishPriest;
}

export function getCurrencySymbol(config?: ParishConfig): string {
  return (config || getParishConfig()).currencySymbol;
}

// Token replacement helper for certificates
export function getCertificateTokens(config?: ParishConfig): Record<string, string> {
  const c = config || getParishConfig();
  return {
    parish_name: c.parishName,
    parish_short_name: c.parishShortName,
    parish_address: getFullAddress(c),
    parish_street: c.addressStreet,
    parish_barangay: c.addressBarangay,
    parish_city: c.addressCity,
    parish_province: c.addressProvince,
    parish_priest: c.parishPriest,
    priest_full_name: c.priestFullName,
    priest_title: c.priestTitle,
    parish_contact: c.contactNumber,
    parish_email: c.email,
    parish_website: c.website,
    parish_facebook: c.facebook,
    parish_diocese: c.diocese,
    date_today: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  };
}
