// Built-in API address. Every browser connects here automatically, so the login page opens directly.
// You can still override it per device from Settings → API connection.
export const DEFAULT_API_URL =
  import.meta.env.VITE_API_URL ||
  'https://svqhlotlzgmwjneuphpe.supabase.co/functions/v1/karvio-api';
