const Auth = (() => {
  const SIGNIN_URL = 'https://01.tomorrow-school.ai/api/auth/signin';
  const TOKEN_KEY  = 'ts_jwt';

  async function login(credential, password) {
    if (!credential || !password) throw new Error('Please enter your username/email and password.');

    const encoded = btoa(unescape(encodeURIComponent(`${credential}:${password}`)));

    let response;
    try {
      response = await fetch(SIGNIN_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${encoded}`,
          'Content-Type': 'application/json',
        },
      });
    } catch {
      throw new Error('Network error — check your internet connection.');
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error('Invalid credentials. Please check your username/email and password.');
    }
    if (!response.ok) {
      throw new Error(`Login failed (HTTP ${response.status}). Please try again.`);
    }

    const raw = await response.text();
    let token;
    try {
      const parsed = JSON.parse(raw);
      token = typeof parsed === 'string'
        ? parsed
        : parsed.token || parsed.jwt || parsed.access_token || parsed.data?.token;
    } catch {
      token = raw.trim().replace(/^"|"$/g, '');
    }

    if (!token || token.split('.').length !== 3) {
      throw new Error('Authentication failed: received an invalid token.');
    }

    localStorage.setItem(TOKEN_KEY, token);
    return token;
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function isAuthenticated() {
    const token = getToken();
    if (!token) return false;
    try {
      const { exp } = parsePayload(token);
      return exp ? exp * 1000 > Date.now() : true;
    } catch {
      return false;
    }
  }

  function parsePayload(token) {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Malformed JWT');
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(b64).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
    );
    return JSON.parse(json);
  }

  function getUserId() {
    const token = getToken();
    if (!token) return null;
    try {
      const payload = parsePayload(token);
      const hasura  = payload['https://hasura.io/jwt/claims'] || {};
      const raw = hasura['x-hasura-user-id'] || payload.sub || payload.id;
      return raw ? Number(raw) : null;
    } catch {
      return null;
    }
  }

  return { login, logout, getToken, isAuthenticated, getUserId, parsePayload };
})();
