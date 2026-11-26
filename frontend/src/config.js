// Development requires an explicitly configured API.
export const DEFAULT_API_URL =
  import.meta.env.VITE_API_URL?.trim() ||
  (import.meta.env.DEV ? '' : 'https://svqhlotlzgmwjneuphpe.supabase.co/functions/v1/karvio-api');
