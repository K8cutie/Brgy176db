/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ChurchOS Primary Colors
        'deep-navy': '#1B2A4A',
        'deep-navy-light': '#243B5D',
        'deep-navy-dark': '#111D33',

        // ChurchOS Accent Colors
        'gold': '#C9963B',
        'gold-light': '#DDB86B',
        'gold-glow': 'rgba(201,150,59,0.15)',
        'forest-green': '#2D6A4F',
        'maroon': '#6B2737',
        'purple': '#5B3A73',

        // ChurchOS Neutral Colors
        'cream': '#FAF8F3',
        'cream-dark': '#F2EFE8',
        'parchment': '#EAE5D9',
        'warm-gray': '#8C8374',
        'charcoal': '#3D3A36',
        'off-white': '#F5F3EE',

        // Functional Colors
        'success': '#2D6A4F',
        'warning': '#C9963B',
        'error': '#B8322F',
        'info': '#3B6BC9',

        // Dark Mode Tokens
        'dm-bg': '#111827',
        'dm-surface': '#1F2937',
        'dm-surface-raised': '#2D3748',
        'dm-border': '#374151',
        'dm-text': '#E5E7EB',
        'dm-text-muted': '#9CA3AF',

        // Shadcn compatibility
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      fontFamily: {
        'playfair': ['"Playfair Display"', 'serif'],
        'inter': ['Inter', 'sans-serif'],
        'mono': ['"JetBrains Mono"', 'monospace'],
      },
      spacing: {
        'space-1': '4px',
        'space-2': '8px',
        'space-3': '12px',
        'space-4': '16px',
        'space-5': '20px',
        'space-6': '24px',
        'space-8': '32px',
        'space-10': '40px',
        'space-12': '48px',
        'space-16': '64px',
        'space-20': '80px',
        'sidebar': '260px',
        'sidebar-collapsed': '68px',
        'topbar': '64px',
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        'card': '0 1px 3px rgba(27,42,74,0.08), 0 1px 2px rgba(27,42,74,0.04)',
        'card-hover': '0 4px 12px rgba(27,42,74,0.12), 0 2px 4px rgba(27,42,74,0.06)',
        'modal': '0 20px 60px rgba(27,42,74,0.2)',
      },
      maxWidth: {
        'content': '1440px',
      },
      zIndex: {
        'sticky': '10',
        'sidebar': '20',
        'dropdown': '30',
        'modal': '40',
        'overlay': '45',
        'toast': '50',
        'tooltip': '60',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.9)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(10px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "pulse-subtle": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.05)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
        "shimmer": "shimmer 1.5s ease-in-out infinite",
        "fade-up": "fade-up 0.4s cubic-bezier(0, 0, 0.2, 1) forwards",
        "fade-in": "fade-in 0.25s ease-out forwards",
        "scale-in": "scale-in 0.25s ease-out forwards",
        "slide-in-right": "slide-in-right 0.3s ease-out forwards",
        "pulse-subtle": "pulse-subtle 2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
