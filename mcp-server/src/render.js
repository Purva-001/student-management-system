const BASE_URL = 'https://api.render.com/v1';

function getHeaders() {
  return {
    'Authorization': `Bearer ${process.env.RENDER_API_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
}

async function renderFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...getHeaders(), ...(options.headers || {}) }
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Render API error ${res.status}: ${err}`);
  }

  return res.json();
}

// List all Render services
export async function listServices(type) {
  const query = type ? `?type=${type}` : '';
  return renderFetch(`/services${query}`);
}

// Get a specific service by ID
export async function getService(serviceId) {
  return renderFetch(`/services/${serviceId}`);
}

// Trigger a new deploy for a service
export async function deployService(serviceId, clearCache = false) {
  return renderFetch(`/services/${serviceId}/deploys`, {
    method: 'POST',
    body: JSON.stringify({ clearCache: clearCache ? 'clear' : 'do_not_clear' })
  });
}

// List deploys for a service
export async function listDeploys(serviceId, limit = 10) {
  return renderFetch(`/services/${serviceId}/deploys?limit=${limit}`);
}

// Get details of a specific deploy
export async function getDeploy(serviceId, deployId) {
  return renderFetch(`/services/${serviceId}/deploys/${deployId}`);
}

// Suspend a service
export async function suspendService(serviceId) {
  return renderFetch(`/services/${serviceId}/suspend`, { method: 'POST' });
}

// Resume a suspended service
export async function resumeService(serviceId) {
  return renderFetch(`/services/${serviceId}/resume`, { method: 'POST' });
}

