/**
 * @file tokens.ts
 * @description Light Sky Design Tokens for Firefly-Agent Harness Chat.
 * Aesthetic: 浅绿晴空 + 白色 + 淡青 + 春日生命感 + 明亮通透 + 柔和阳光.
 */

export const THEME_TOKENS = {
  colors: {
    // Backgrounds
    bgMain: "#f2f8f5",
    bgGradient: "linear-gradient(145deg, #f7faf8 0%, #eef7f2 50%, #e4f3eb 100%)",
    bgSecondary: "#e8f4ed",
    bgSubtle: "#f0f7f3",

    // Surfaces & Glass
    surface: "#ffffff",
    surfaceElevated: "rgba(255, 255, 255, 0.92)",
    surfaceGlass: "rgba(255, 255, 255, 0.82)",
    surfaceCard: "#ffffff",

    // Borders
    border: "rgba(45, 122, 95, 0.12)",
    borderSubtle: "rgba(45, 122, 95, 0.07)",
    borderFocus: "#38a169",
    borderGlass: "rgba(255, 255, 255, 0.6)",

    // Typography
    textPrimary: "#183628",
    textSecondary: "#456858",
    textMuted: "#7a9b8d",
    textInverse: "#ffffff",

    // Firefly Spring Accents
    accent: "#2d7a5f",
    accentHover: "#23654e",
    accentLight: "#48bb78",
    accentSoft: "#e9f6ef",
    accentPill: "#dcfce7",
    accentGlow: "rgba(56, 161, 105, 0.25)",

    // Message Bubbles
    assistantBubble: "#ffffff",
    assistantBubbleBorder: "rgba(45, 122, 95, 0.12)",
    userBubble: "linear-gradient(135deg, #2d7a5f 0%, #1e5a45 100%)",
    userBubbleText: "#ffffff",

    // Status Colors
    statusOnline: "#38a169",
    statusThinking: "#d97706",
    statusError: "#e53e3e",
  },
  shadows: {
    sm: "0 2px 6px rgba(35, 90, 68, 0.05)",
    md: "0 4px 16px rgba(35, 90, 68, 0.08)",
    lg: "0 10px 30px rgba(35, 90, 68, 0.12)",
    glow: "0 0 15px rgba(72, 187, 120, 0.3)",
  },
  radii: {
    sm: "6px",
    md: "10px",
    lg: "16px",
    xl: "22px",
    full: "9999px",
  },
  typography: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  },
} as const;
