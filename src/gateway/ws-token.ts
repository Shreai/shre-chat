/**
 * Gateway token management — fetched from server at runtime (never bundled in JS).
 */

let _gatewayToken = '';
let _tokenFetchFailed = false;

export async function getGatewayToken(): Promise<string> {
  if (_gatewayToken) return _gatewayToken;
  try {
    const res = await fetch('/api/gateway-token');
    if (!res.ok) {
      _tokenFetchFailed = true;
      return '';
    }
    const data = await res.json();
    _gatewayToken = data.token || '';
    _tokenFetchFailed = !_gatewayToken;
  } catch (err) {
    console.debug('getGatewayToken fetch failed', err);
    _tokenFetchFailed = true;
  }
  return _gatewayToken;
}

/** Clear cached token so next connectGateway() re-fetches (call after login) */
export function clearGatewayToken() {
  _gatewayToken = '';
  _tokenFetchFailed = false;
}

export function isTokenFetchFailed(): boolean {
  return _tokenFetchFailed;
}
