// Environment configuration with fallback defaults

export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  apiKey: import.meta.env.VITE_API_KEY || 'dev-key',
} as const;
