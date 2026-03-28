import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#000000',
        surface: '#0A0A0A',
        'surface-hover': '#141414',
        cyan: '#00f0ff',
        magenta: '#ff00aa',
        gold: '#ffd700',
        border: 'rgba(255,255,255,0.1)',
        text: '#ffffff',
        'text-muted': 'rgba(255,255,255,0.7)',
      },
      fontFamily: {
        display: ['Outfit', 'sans-serif'],
        body: ['Plus Jakarta Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        sm: '12px',
        md: '20px',
        lg: '24px',
        pill: '100px',
      },
    },
  },
  plugins: [],
};

export default config;
