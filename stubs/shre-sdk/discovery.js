// Stub shre-sdk/discovery

export function serviceUrl(name) {
  const ports = {
    'mib007': 'https://127.0.0.1:5520',
    'shre-router': 'https://127.0.0.1:5497',
    'shre-tasks': 'http://127.0.0.1:5460',
    'shre-fleet': 'http://127.0.0.1:5498',
  };
  return ports[name] || `http://127.0.0.1:8000`;
}

export function infraUrl(name) {
  const ports = {
    'openclaw-gateway': 'http://127.0.0.1:18789',
    'cortexservice-api': 'http://127.0.0.1:7000',
  };
  return ports[name] || `http://127.0.0.1:8000`;
}

export default { serviceUrl, infraUrl };
