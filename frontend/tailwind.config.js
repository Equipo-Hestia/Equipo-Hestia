/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Nunito', 'sans-serif'],
      },

      /*
       * Hestia Design Tokens — clases utilitarias con prefijo h-
       *
       * Estas clases consumen las CSS custom properties definidas
       * en index.css, que cambian automáticamente entre :root (claro)
       * y .dark (oscuro). No hay que escribir dark: en los componentes
       * que usen estas clases.
       *
       * Fondos:  bg-h-base  bg-h-surface  bg-h-elevated  bg-h-highlight
       * Texto:   text-h-primary  text-h-secondary  text-h-tertiary  text-h-accent
       * Bordes:  border-h-subtle  border-h-visible  border-h-strong
       * Acento:  bg-h-teal-rest  bg-h-teal-hover  bg-h-teal-active  bg-h-teal-subtle
       *          text-h-teal-rest  text-h-teal-hover  text-h-teal-active
       *          border-h-teal
       * Semánticos: bg-h-warning  border-h-warning  text-h-warning
       *             bg-h-danger   border-h-danger   text-h-danger
       *             bg-h-success  border-h-success  text-h-success
       *             bg-h-info     border-h-info     text-h-info
       */

      colors: {
        h: {
          /* Fondos */
          base:      'var(--h-bg-base)',
          surface:   'var(--h-bg-surface)',
          elevated:  'var(--h-bg-elevated)',
          highlight: 'var(--h-bg-highlight)',

          /* Acento teal */
          teal: {
            rest:   'var(--h-teal-rest)',
            hover:  'var(--h-teal-hover)',
            active: 'var(--h-teal-active)',
            subtle: 'var(--h-teal-subtle)',
            border: 'var(--h-teal-border)',
          },

          /* Semánticos */
          warning: 'var(--h-sem-warning-bg)',
          danger:  'var(--h-sem-danger-bg)',
          success: 'var(--h-sem-success-bg)',
          info:    'var(--h-sem-info-bg)',
        },
      },

      textColor: {
        h: {
          primary:   'var(--h-text-primary)',
          secondary: 'var(--h-text-secondary)',
          tertiary:  'var(--h-text-tertiary)',
          accent:    'var(--h-text-accent)',

          /* Acento teal en texto */
          'teal-rest':   'var(--h-teal-rest)',
          'teal-hover':  'var(--h-teal-hover)',
          'teal-active': 'var(--h-teal-active)',

          /* Semánticos */
          warning: 'var(--h-sem-warning-text)',
          danger:  'var(--h-sem-danger-text)',
          success: 'var(--h-sem-success-text)',
          info:    'var(--h-sem-info-text)',
        },
      },

      borderColor: {
        h: {
          subtle:  'var(--h-border-subtle)',
          visible: 'var(--h-border-visible)',
          strong:  'var(--h-border-strong)',
          teal:    'var(--h-teal-border)',

          /* Semánticos */
          warning: 'var(--h-sem-warning-border)',
          danger:  'var(--h-sem-danger-border)',
          success: 'var(--h-sem-success-border)',
          info:    'var(--h-sem-info-border)',
        },
      },
    },
  },
  plugins: [],
}
