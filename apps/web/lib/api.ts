export const DEFAULT_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://localhost:4000/api';

// API endpoint is now configured via environment variable only
// NEXT_PUBLIC_API_BASE_URL is used at build time

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);

const resolveUrl = (input: string | URL): string | URL => {
      if (input instanceof URL) {
        return input;
      }

      if (isAbsoluteUrl(input)) {
        return input;
      }

      // Use the default API base URL from environment
      const base = DEFAULT_API_BASE_URL.replace(/\/+$/, '');
      const path = input.replace(/^\/+/, '');
      return `${base}/${path}`;
    };

export async function apiFetch<T>(input: string | URL, init?: RequestInit): Promise<T> {
  const url = resolveUrl(input);
  const requestInit: RequestInit = {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  };

  const response = await fetch(url, requestInit);

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(errorBody?.message ?? `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}


