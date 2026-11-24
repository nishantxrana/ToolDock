import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

/** `hsl(var(--name) / <alpha-value>)` so every token supports Tailwind's `/opacity` modifier. */
const token = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

/** A status colour: solid (text, dots, fills), on-solid foreground, subtle surface, border. */
const status = (name: string) => ({
  DEFAULT: token(name),
  foreground: token(`${name}-foreground`),
  subtle: token(`${name}-subtle`),
  border: token(`${name}-border`),
});

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        sans: ['"Red Hat Text"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Red Hat Display"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Red Hat Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        // 11/12/13 steps for dense data UI; 13px is the table/body-small size
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        '13': ['0.8125rem', { lineHeight: '1.25rem' }],
      },
      // Opacity steps used for subtle tints that Tailwind's default scale lacks
      opacity: {
        4: '0.04',
        6: '0.06',
        8: '0.08',
        12: '0.12',
      },
      colors: {
        border: {
          DEFAULT: token('border'),
          subtle: token('border-subtle'),
          strong: token('border-strong'),
        },
        input: token('input'),
        ring: token('ring'),
        background: token('background'),
        foreground: token('foreground'),
        'row-hover': token('row-hover'),
        primary: {
          DEFAULT: token('primary'),
          hover: token('primary-hover'),
          foreground: token('primary-foreground'),
        },
        secondary: {
          DEFAULT: token('secondary'),
          foreground: token('secondary-foreground'),
        },
        muted: {
          DEFAULT: token('muted'),
          foreground: token('muted-foreground'),
        },
        accent: {
          DEFAULT: token('accent'),
          foreground: token('accent-foreground'),
        },
        destructive: status('destructive'),
        success: status('success'),
        warning: status('warning'),
        info: status('info'),
        popover: {
          DEFAULT: token('popover'),
          foreground: token('popover-foreground'),
        },
        card: {
          DEFAULT: token('card'),
          foreground: token('card-foreground'),
        },
        sidebar: {
          DEFAULT: token('sidebar'),
          foreground: token('sidebar-foreground'),
          border: token('sidebar-border'),
        },
        'code-bg': token('code-bg'),
      },
      borderRadius: {
        // Hierarchy: panels (lg+2) > controls (md) > chips/kbd (sm)
        xl: 'calc(var(--radius) + 4px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        raised: 'var(--shadow-raised)',
        overlay: 'var(--shadow-overlay)',
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        // Soft halo for a token lock in its last five minutes.
        'lock-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 hsl(var(--destructive) / 0.35)' },
          '50%': { boxShadow: '0 0 0 4px hsl(var(--destructive) / 0)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'lock-pulse': 'lock-pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
