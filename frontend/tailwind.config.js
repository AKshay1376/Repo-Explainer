/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: "var(--color-canvas)",
          subtle: "var(--color-canvas-subtle)",
        },
        surface: {
          DEFAULT: "var(--color-surface)",
          raised: "var(--color-surface-raised)",
          inset: "var(--color-surface-inset)",
          tint: "var(--color-surface-tint)",
        },
        ink: {
          DEFAULT: "var(--color-ink)",
          body: "var(--color-ink-body)",
          secondary: "var(--color-ink-secondary)",
          tertiary: "var(--color-ink-tertiary)",
          inverted: "var(--color-ink-inverted)",
        },
        line: {
          DEFAULT: "var(--color-border)",
          subtle: "var(--color-border-subtle)",
        },
        brand: {
          DEFAULT: "var(--brand)",
          hover: "var(--brand-hover)",
          active: "var(--brand-active)",
          soft: "var(--brand-soft)",
          muted: "var(--brand-muted)",
          border: "var(--brand-border)",
          "border-subtle": "var(--brand-border-subtle)",
          surface: "var(--brand-surface)",
          text: "var(--brand-text)",
          subtle: "var(--brand-soft)",
        },
        ctrl: {
          input: "var(--color-input-bg)",
          btnPrimary: "var(--color-button-primary-bg)",
          btnPrimaryText: "var(--color-button-primary-text)",
          btnPrimaryHover: "var(--color-button-primary-hover)",
          pill: "var(--color-pill-bg)",
          pillBorder: "var(--color-pill-border)",
          pillHover: "var(--color-pill-hover)",
          tag: "var(--color-tag-bg)",
          tagBorder: "var(--color-tag-border)",
          nav: "var(--color-nav-bg)",
          navBorder: "var(--color-nav-border)",
          modal: "var(--color-modal-bg)",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Text",
          "SF Pro Display",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "SF Mono",
          "JetBrains Mono",
          "ui-monospace",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      letterSpacing: {
        tightest: "-0.035em",
        tighter: "-0.025em",
        tight: "-0.015em",
      },
      boxShadow: {
        subtle: "0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)",
        card: "0 4px 16px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)",
        float: "0 12px 32px rgba(0, 0, 0, 0.06), 0 2px 6px rgba(0, 0, 0, 0.03)",
        modal: "0 24px 64px rgba(0, 0, 0, 0.12), 0 8px 16px rgba(0, 0, 0, 0.04)",
        brandGlow: "var(--brand-glow)",
      },
    },
  },
  plugins: [],
}

