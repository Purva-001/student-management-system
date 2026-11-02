import { Request, Response, NextFunction } from 'express';

const LOCAL_AGENT_SECRET = process.env.LOCAL_AGENT_SECRET;

if (!LOCAL_AGENT_SECRET) {
  console.error('[AUTH] FATAL: LOCAL_AGENT_SECRET environment variable is not set.');
}

/**
 * Bearer token authentication for the Local Docker Agent.
 * Validates against LOCAL_AGENT_SECRET. Never logs the secret.
 */
export function agentAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/health') {
    next();
    return;
  }

  const authHeader = req.headers['authorization'];

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized', message: 'Bearer token required' });
    return;
  }

  const token = authHeader.slice(7);

  if (!LOCAL_AGENT_SECRET) {
    res.status(503).json({ error: 'Service Unavailable', message: 'Agent authentication not configured' });
    return;
  }

  if (!timingSafeEqual(token, LOCAL_AGENT_SECRET)) {
    console.warn(`[AUTH] Rejected request from ${req.ip} — invalid token`);
    res.status(403).json({ error: 'Forbidden', message: 'Invalid agent secret' });
    return;
  }

  next();
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
