import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#1c1917', soft: '#44403c', mute: '#78716c' },
        parchment: { DEFAULT: '#faf7f0', deep: '#f1ebdc', line: '#e3d9c3' },
        crown: { DEFAULT: '#a16207', deep: '#854d0e', soft: '#fef3c7' },
        inf: { DEFAULT: '#2563eb', soft: '#dbeafe' },
        cav: { DEFAULT: '#b91c1c', soft: '#fee2e2' },
        arc: { DEFAULT: '#15803d', soft: '#dcfce7' },
      },
      fontFamily: {
        display: ['"Cinzel"', 'Georgia', 'serif'],
        sans: ['"Noto Sans JP"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
