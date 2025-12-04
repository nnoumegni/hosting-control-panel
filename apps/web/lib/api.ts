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
  
  // Get auth token from localStorage if available (client-side only)
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  
  const requestInit: RequestInit = {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  };

  const response = await fetch(url, requestInit);

  if (!response.ok) {
    let errorBody: any = null;
    let errorText = '';
    
    try {
      errorText = await response.text();
      if (errorText) {
        try {
          errorBody = JSON.parse(errorText);
        } catch {
          // If JSON parsing fails, use the text as error message
          errorBody = { error: errorText };
        }
      }
    } catch {
      errorBody = { error: `HTTP ${response.status}: ${response.statusText}` };
    }
    
    const errorMessage = errorBody?.error || errorBody?.message || errorText || `HTTP ${response.status}: ${response.statusText}`;
    const error = new Error(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    (error as any).response = { 
      data: errorBody, 
      status: response.status, 
      statusText: response.statusText 
    };
    throw error;
  }

  return (await response.json()) as T;
}


