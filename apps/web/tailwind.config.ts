import type { Config } from 'tailwindcss';
import { fontFamily } from 'tailwindcss/defaultTheme';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#2563eb',
          foreground: '#ffffff',
          muted: '#1e40af',
        },
        theme: {
          DEFAULT: '#3C72FC',
          '2': '#E0009B',
        },
        title: '#ffffff',
        body: '#A9A9A9',
        smoke: {
          DEFAULT: '#00172F',
          '2': '#FFF7ED',
          '3': '#DFF8F6',
          '4': '#FFF9EF',
        },
        black: {
          DEFAULT: '#000000',
          '2': '#080E1C',
        },
        gray: {
          DEFAULT: '#EFF5F6',
        },
        light: '#8D96AD',
        yellow: '#FC800A',
        success: '#069845',
        error: '#dc3545',
        border: {
          DEFAULT: 'rgba(227, 227, 227, 0.24)',
          '2': '#E3E3E3',
        },
        'ot-body': '#000916',
      },
      fontFamily: {
        sans: ['"Kumbh Sans"', 'var(--font-sans)', ...fontFamily.sans],
        mono: ['var(--font-mono)', ...fontFamily.mono],
        title: ['"Kumbh Sans"', ...fontFamily.sans],
        body: ['"Kumbh Sans"', ...fontFamily.sans],
      },
      fontSize: {
        base: ['16px', { lineHeight: '28px' }],
      },
      maxWidth: {
        'main-container': '1170px',
      },
      spacing: {
        'section': '120px',
        'section-mobile': '70px',
        'section-title': '50px',
        'container-gutter': '30px',
      },
      backgroundImage: {
        'hero-bg': "url('/assets/img/hero/hero-bg1-1.png')",
        'breadcrumb-bg': "url('/assets/img/bg/breadcrumb-bg.png')",
        'cta-bg': "url('/assets/img/bg/cta_bg_shape1.png')",
        'wave-bg': "url('/assets/img/bg/bg-wave-shape1.png')",
      },
      animation: {
        'sticky': 'stickyAni 0.4s ease-in-out',
      },
      keyframes: {
        stickyAni: {
          '0%': {
            transform: 'translate3d(0, -40px, 0) scaleY(0.8)',
            opacity: '0.7',
          },
          '100%': {
            transform: 'translate3d(0, 0, 0) scaleY(1)',
            opacity: '1',
          },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/typography')],
};

export default config;


