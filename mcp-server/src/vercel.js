const BASE_URL = 'https://api.vercel.com';

function getHeaders() {
  return {
    'Authorization': `Bearer ${process.env.VERCEL_API_TOKEN}`,
    'Content-Type': 'application/json'
  };
}

async function vercelFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...getHeaders(), ...(options.headers || {}) }
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vercel API error ${res.status}: ${err}`);
  }

  return res.json();
}

// List all Vercel projects
export async function listProjects() {
  return vercelFetch('/v9/projects');
}

// Get a specific project by ID or name
export async function getProject(projectId) {
  return vercelFetch(`/v9/projects/${projectId}`);
}

// List deployments for a project
export async function listDeployments(projectId, limit = 10) {
  return vercelFetch(`/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=${limit}`);
}

// Get details of a specific deployment
export async function getDeployment(deploymentId) {
  return vercelFetch(`/v13/deployments/${deploymentId}`);
}

// Cancel a running deployment
export async function cancelDeployment(deploymentId) {
  return vercelFetch(`/v12/deployments/${deploymentId}/cancel`, { method: 'PATCH' });
}

