const TOKEN_STORAGE_KEY = 'asad_hub_session_token';
let inMemoryToken: string | null = null;

export function getSessionToken(): string | null {
  if (inMemoryToken) return inMemoryToken;
  try {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored) {
      inMemoryToken = stored;
      return stored;
    }
  } catch {
    // Ignore storage access errors in restricted iframes
  }
  return null;
}

export function setSessionToken(token: string | null): void {
  inMemoryToken = token;
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage access errors in restricted iframes
  }
}

export async function apiRequest<T>(
  url: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getSessionToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    credentials: 'include',
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && !url.startsWith('/api/auth/login') && !url.startsWith('/api/auth/register') && !url.startsWith('/api/auth/google-demo')) {
    setSessionToken(null);
  }

  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export async function fetchAuthorizedImageBlobUrl(url: string): Promise<string> {
  const token = getSessionToken();
  const res = await fetch(url, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    throw new Error(`Image load failed (${res.status})`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function formatPKR(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString('en-PK');
  return amount < 0 ? `-PKR ${formatted}` : `PKR ${formatted}`;
}

export function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
