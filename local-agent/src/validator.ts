import * as path from 'path';
import * as fs from 'fs';

// Directories the agent is allowed to operate in
const ALLOWED_DIRS_RAW = process.env.ALLOWED_PROJECT_DIRS || '';
const ALLOWED_DIRS: string[] = ALLOWED_DIRS_RAW
  ? ALLOWED_DIRS_RAW.split(';').map(d => path.resolve(d.trim())).filter(Boolean)
  : [];

// Secret keys that should be redacted from logs and responses
const SECRET_PATTERNS = [
  /mongodb(\+srv)?:\/\/[^@\s]+@/gi,
  /password[=:]["']?[^\s"',}]+/gi,
  /secret[=:]["']?[^\s"',}]+/gi,
  /api[_-]?key[=:]["']?[^\s"',}]+/gi,
  /token[=:]["']?[^\s"',}]+/gi,
  /MONGODB_URI=[^\s]+/gi,
  /MCP_API_KEY=[^\s]+/gi,
  /LOCAL_AGENT_SECRET=[^\s]+/gi,
];

/**
 * Validate that a project directory:
 * 1. Is an absolute path
 * 2. Exists on the filesystem
 * 3. Is within the ALLOWED_PROJECT_DIRS whitelist
 */
export function validateProjectDir(dir: string): { valid: boolean; error?: string; resolved: string } {
  if (!path.isAbsolute(dir)) {
    return { valid: false, error: `Path must be absolute. Got: "${dir}"`, resolved: dir };
  }

  const resolved = path.resolve(dir);

  if (!fs.existsSync(resolved)) {
    return { valid: false, error: `Directory does not exist: "${resolved}"`, resolved };
  }

  if (!fs.statSync(resolved).isDirectory()) {
    return { valid: false, error: `Path is not a directory: "${resolved}"`, resolved };
  }

  // If ALLOWED_DIRS is configured, enforce the whitelist
  if (ALLOWED_DIRS.length > 0) {
    const isAllowed = ALLOWED_DIRS.some(allowed =>
      resolved === allowed || resolved.startsWith(allowed + path.sep)
    );

    if (!isAllowed) {
      return {
        valid: false,
        error: `Directory "${resolved}" is not in the allowed directories list. Allowed: ${ALLOWED_DIRS.join(', ')}`,
        resolved
      };
    }
  }

  return { valid: true, resolved };
}

/**
 * Validate a Dockerfile path relative to the project directory.
 */
export function validateDockerfilePath(projectDir: string, dockerfilePath: string): { valid: boolean; error?: string; absolutePath: string } {
  // Prevent directory traversal
  if (dockerfilePath.includes('..') || path.isAbsolute(dockerfilePath)) {
    return {
      valid: false,
      error: `Dockerfile path must be a relative path within the project directory. Got: "${dockerfilePath}"`,
      absolutePath: ''
    };
  }

  const absolutePath = path.join(projectDir, dockerfilePath);

  if (!fs.existsSync(absolutePath)) {
    return {
      valid: false,
      error: `Dockerfile not found at: "${absolutePath}"`,
      absolutePath
    };
  }

  return { valid: true, absolutePath };
}

/**
 * Validate port mapping string (format: "hostPort:containerPort").
 */
export function validatePortMapping(mapping: string): { valid: boolean; error?: string; hostPort: number; containerPort: number } {
  const parts = mapping.split(':');
  if (parts.length !== 2) {
    return { valid: false, error: `Invalid port mapping "${mapping}". Use "hostPort:containerPort" format.`, hostPort: 0, containerPort: 0 };
  }

  const [hostPort, containerPort] = parts.map(Number);

  if (isNaN(hostPort) || isNaN(containerPort) || hostPort < 1 || containerPort < 1 || hostPort > 65535 || containerPort > 65535) {
    return { valid: false, error: `Port numbers must be integers between 1 and 65535. Got: "${mapping}"`, hostPort: 0, containerPort: 0 };
  }

  return { valid: true, hostPort, containerPort };
}

/**
 * Redact known secret patterns from a string.
 * Used before including any output in responses or logs.
 */
export function redactSecrets(text: string): string {
  let redacted = text;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, (match) => {
      // Keep the key name, replace value with [REDACTED]
      const eqIdx = match.indexOf('=');
      const colonIdx = match.indexOf(':');
      const splitIdx = eqIdx > -1 ? eqIdx : colonIdx;
      if (splitIdx > -1) {
        return match.substring(0, splitIdx + 1) + '[REDACTED]';
      }
      return '[REDACTED]';
    });
  }
  return redacted;
}

/**
 * Redact env var values from an environment variable map.
 * Returns a safe version for display.
 */
export function redactEnvVars(envVars: Record<string, string>): Record<string, string> {
  const sensitiveKeys = ['password', 'secret', 'key', 'token', 'uri', 'url', 'mongo', 'credential', 'auth'];
  const redacted: Record<string, string> = {};

  for (const [k, v] of Object.entries(envVars)) {
    const lowerKey = k.toLowerCase();
    const isSensitive = sensitiveKeys.some(s => lowerKey.includes(s));
    redacted[k] = isSensitive ? '[REDACTED]' : v;
  }

  return redacted;
}

/**
 * Validate an image name is reasonably safe (no shell injection).
 */
export function validateImageName(name: string): { valid: boolean; error?: string } {
  // Allow: alphanumeric, hyphens, underscores, colons (tag), slashes (registry/repo)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._\-/:]+$/.test(name) || name.length > 256) {
    return { valid: false, error: `Invalid image name: "${name}". Use only alphanumeric characters, hyphens, underscores, colons, and slashes.` };
  }
  return { valid: true };
}

/**
 * Validate a container name.
 */
export function validateContainerName(name: string): { valid: boolean; error?: string } {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(name) || name.length > 64) {
    return { valid: false, error: `Invalid container name: "${name}". Use alphanumeric characters, underscores, hyphens, and dots.` };
  }
  return { valid: true };
}
