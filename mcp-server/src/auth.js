/**
 * auth.js — Bearer token authentication middleware
 *
 * Protects the /mcp endpoint. Reads the MCP_API_KEY environment variable
 * and compares it against the Authorization header on every request.
 *
 * Returns:
 *   401 — if no Authorization header is present
 *   403 — if the token does not match MCP_API_KEY
 *
 * Never exposes the actual key value in responses or logs.
 */

'use strict';

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authorization header is required. Use: Authorization: Bearer <token>'
    });
  }

  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authorization header must use Bearer scheme'
    });
  }

  const token = authHeader.slice(7); // Strip "Bearer "
  const expectedKey = process.env.MCP_API_KEY;

  if (!expectedKey) {
    console.error('[auth] MCP_API_KEY environment variable is not set — rejecting all requests');
    return res.status(500).json({
      error: 'Server Misconfiguration',
      message: 'MCP server is not properly configured'
    });
  }

  // Constant-time comparison to prevent timing attacks
  if (!timingSafeEqual(token, expectedKey)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid authentication token'
    });
  }

  next();
};

/**
 * Simple constant-time string comparison.
 * Avoids early-exit timing attacks on the token comparison.
 */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) {
    // Still iterate to avoid length-based timing leak
    let result = 0;
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      result |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

module.exports = authMiddleware;
