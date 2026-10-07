/** @type {import('tailwindcss').Config} */
export default {
  // `content` is what makes the production build small: Tailwind scans these
  // files and emits only the classes actually used (this replaced the old
  // `purge` option in Tailwind v3).
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class', // dark mode is a stretch goal; the hook is here for it
  theme: {
    extend: {
      colors: {
        // ---------------------------------------------------------------
        // DESIGN SYSTEM
        // brand   = deep teal. Trust-signalling, calm, "bank" not "casino".
        // accent  = warm amber. RESERVED for streak / progress / celebration.
        // success = green, danger = red, locked = slate (muted, inactive).
        // Do not introduce new hex values in components - use these tokens.
        // ---------------------------------------------------------------
        brand: {
          50: '#EEF9F8',
          100: '#D3F0EE',
          200: '#A8E1DE',
          300: '#71CBC8',
          400: '#3FAFAE',
          500: '#229392',
          600: '#17767A',
          700: '#145F65',
          800: '#144C52',
          900: '#143F45',
          950: '#06262B',
        },
        accent: {
          50: '#FFF9EC',
          100: '#FFF0CC',
          200: '#FFDF94',
          300: '#FFC85C',
          400: '#FCB02F',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
        },
        success: {
          50: '#ECFDF5',
          100: '#D1FAE5',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
        },
        danger: {
          50: '#FEF2F2',
          100: '#FEE2E2',
          500: '#EF4444',
          600: '#DC2626',
          700: '#B91C1C',
        },
        // Neutral structure greys, very slightly cool so they sit with teal.
        ink: {
          50: '#F7F9FA',
          100: '#EDF1F3',
          200: '#DDE4E8',
          300: '#C2CDD4',
          400: '#94A4AE',
          500: '#6B7C87',
          600: '#4F5F6A',
          700: '#3C4A53',
          800: '#2A353C',
          900: '#1A2227',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      fontSize: {
        // A deliberate type scale so four teammates pick the same sizes.
        'display': ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
        'title': ['1.75rem', { lineHeight: '1.2', letterSpacing: '-0.015em', fontWeight: '700' }],
        'heading': ['1.25rem', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }],
        'money': ['1.75rem', { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '700' }],
        'label': ['0.8125rem', { lineHeight: '1.2', letterSpacing: '0.01em', fontWeight: '500' }],
      },
      borderRadius: {
        card: '1rem',
        field: '0.625rem',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(20 79 85 / 0.04), 0 4px 16px -2px rgb(20 79 85 / 0.08)',
        'card-hover': '0 2px 4px 0 rgb(20 79 85 / 0.06), 0 12px 28px -4px rgb(20 79 85 / 0.14)',
        field: '0 1px 2px 0 rgb(20 79 85 / 0.05)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(12px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out both',
        'slide-up': 'slide-up 240ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'toast-in': 'toast-in 220ms cubic-bezier(0.16, 1, 0.3, 1) both',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};
