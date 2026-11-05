// Built-in API address. Every browser connects here automatically, so the login page opens directly.
// You can still override it per device from Settings → API connection.
export const DEFAULT_API_URL =
  import.meta.env.VITE_API_URL ||
  'https://script.google.com/macros/s/AKfycbxG_OORWKQAVW8S4Oxf3LoQ3Pukazszssd5gNimviRr9qLwjriURhsaw8CyoW_LDB4wlg/exec';
