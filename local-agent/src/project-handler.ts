import * as fs from 'fs';
import * as path from 'path';
import { validateProjectDir, redactSecrets } from './validator.js';

/**
 * Inspect a project directory and detect its structure.
 */
export async function inspectProject(params: { projectDir: string }): Promise<Record<string, unknown>> {
  const dirCheck = validateProjectDir(params.projectDir);
  if (!dirCheck.valid) return { success: false, error: dirCheck.error };

  const root = dirCheck.resolved;
  const scan = (dir: string, depth: number = 0): string[] => {
    if (depth > 3) return [];
    try {
      return fs.readdirSync(dir).map(f => {
        const full = path.join(dir, f);
        const rel = path.relative(root, full);
        const isDir = fs.statSync(full).isDirectory();
        return isDir && depth < 2 ? `${rel}/` : rel;
      });
    } catch { return []; }
  };

  const files = scan(root);
  const hasBackend = fs.existsSync(path.join(root, 'backend'));
  const hasFrontend = fs.existsSync(path.join(root, 'frontend'));
  const hasMcpServer = fs.existsSync(path.join(root, 'mcp-server'));
  const hasDockerCompose = fs.existsSync(path.join(root, 'docker-compose.yml'));
  const hasBackendDockerfile = fs.existsSync(path.join(root, 'backend', 'Dockerfile'));
  const hasFrontendDockerfile = fs.existsSync(path.join(root, 'frontend', 'Dockerfile'));
  const hasBackendEnv = fs.existsSync(path.join(root, 'backend', '.env'));
  const hasFrontendEnv = fs.existsSync(path.join(root, 'frontend', '.env'));

  // Read package.json for backend and frontend
  let backendPkg: Record<string, unknown> = {};
  let frontendPkg: Record<string, unknown> = {};
  try { backendPkg = JSON.parse(fs.readFileSync(path.join(root, 'backend', 'package.json'), 'utf8')); } catch { /* ignore */ }
  try { frontendPkg = JSON.parse(fs.readFileSync(path.join(root, 'frontend', 'package.json'), 'utf8')); } catch { /* ignore */ }

  return {
    success: true,
    projectDir: root,
    structure: {
      hasBackend,
      hasFrontend,
      hasMcpServer,
      hasDockerCompose,
      hasBackendDockerfile,
      hasFrontendDockerfile,
      hasBackendEnv,
      hasFrontendEnv
    },
    backend: hasBackend ? {
      name: backendPkg.name,
      version: backendPkg.version,
      main: backendPkg.main,
      startScript: (backendPkg.scripts as Record<string, string>)?.start,
      dependencies: Object.keys((backendPkg.dependencies as Record<string, unknown>) || {})
    } : null,
    frontend: hasFrontend ? {
      name: frontendPkg.name,
      version: frontendPkg.version,
      buildScript: (frontendPkg.scripts as Record<string, string>)?.build,
      framework: (frontendPkg.dependencies as Record<string, unknown>)?.react ? 'React' : 'Unknown',
      dependencies: Object.keys((frontendPkg.dependencies as Record<string, unknown>) || {})
    } : null,
    missingConfigs: [
      !hasBackendDockerfile && 'backend/Dockerfile',
      !hasFrontendDockerfile && 'frontend/Dockerfile',
      !hasDockerCompose && 'docker-compose.yml',
      !hasBackendEnv && 'backend/.env',
      !hasFrontendEnv && 'frontend/.env'
    ].filter(Boolean),
    topLevelFiles: files.slice(0, 30)
  };
}

/**
 * Generate a Dockerfile for the backend or frontend component.
 */
export async function generateDockerfile(params: {
  projectDir: string;
  component: 'frontend' | 'backend';
  nodeVersion: string;
  overwrite: boolean;
}): Promise<Record<string, unknown>> {
  const { component, nodeVersion, overwrite } = params;

  const dirCheck = validateProjectDir(params.projectDir);
  if (!dirCheck.valid) return { success: false, error: dirCheck.error };

  const targetPath = path.join(dirCheck.resolved, 'Dockerfile');

  if (fs.existsSync(targetPath) && !overwrite) {
    return {
      success: false,
      error: `Dockerfile already exists at "${targetPath}". Set overwrite: true to replace it.`
    };
  }

  let content = '';

  if (component === 'backend') {
    content = `# ── Backend Dockerfile (Node.js + Express) ─────────────────────────────────
# Multi-stage build for production-ready backend image
FROM node:${nodeVersion} AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# ── Production Stage ──────────────────────────────────────────────────────────
FROM node:${nodeVersion}

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy only production node_modules from builder
COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Remove dev files
RUN rm -f .env .env.example .gitignore

USER appuser

EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \\
  CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
`;
  } else {
    content = `# ── Frontend Dockerfile (React + Vite) ───────────────────────────────────────
# Multi-stage build: build with Node, serve with Nginx
FROM node:${nodeVersion} AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .

# Build the Vite production bundle (VITE_API_URL injected at build time via ARG)
ARG VITE_API_URL=http://localhost:5000
ENV VITE_API_URL=\${VITE_API_URL}
RUN npm run build

# ── Production Stage (Nginx) ──────────────────────────────────────────────────
FROM nginx:alpine

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Custom Nginx config for React Router (SPA routing)
RUN printf 'server {\\n  listen 80;\\n  server_name _;\\n  root /usr/share/nginx/html;\\n  index index.html;\\n  location / {\\n    try_files \\$uri \\$uri/ /index.html;\\n  }\\n  location /api/ {\\n    return 404;\\n  }\\n}\\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \\
  CMD wget -qO- http://localhost:80/ | grep -q '<div' || exit 1

CMD ["nginx", "-g", "daemon off;"]
`;
  }

  fs.writeFileSync(targetPath, content, 'utf8');

  return {
    success: true,
    component,
    dockerfilePath: targetPath,
    message: `Dockerfile generated at "${targetPath}"`,
    preview: content.split('\n').slice(0, 10).join('\n') + '\n...'
  };
}

/**
 * Generate a docker-compose.yml for the full application.
 */
export async function generateCompose(params: {
  projectDir: string;
  backendPort: number;
  frontendPort: number;
  includeMongoLocal: boolean;
  overwrite: boolean;
}): Promise<Record<string, unknown>> {
  const { backendPort, frontendPort, includeMongoLocal, overwrite } = params;

  const dirCheck = validateProjectDir(params.projectDir);
  if (!dirCheck.valid) return { success: false, error: dirCheck.error };

  const targetPath = path.join(dirCheck.resolved, 'docker-compose.yml');

  if (fs.existsSync(targetPath) && !overwrite) {
    return {
      success: false,
      error: `docker-compose.yml already exists at "${targetPath}". Set overwrite: true to replace it.`
    };
  }

  const mongoService = includeMongoLocal ? `
  # Local MongoDB (optional — for development only; use Atlas in production)
  mongodb:
    image: mongo:7
    container_name: student-mongodb
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db
    networks:
      - student-network
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 30s
      timeout: 10s
      retries: 3
` : '';

  const mongoVolumeSection = includeMongoLocal ? `
  mongo-data:
    driver: local
` : '';

  const mongoEnvNote = includeMongoLocal
    ? 'mongodb://mongodb:27017/studentDB  # local MongoDB'
    : '${MONGODB_URI}  # Set in backend/.env or environment';

  const compose = `# ── Student Management System — Docker Compose ───────────────────────────────
# Generated by Antigravity MCP Integration
# Usage: docker compose up -d --build
#
# Required environment variables in backend/.env:
#   MONGODB_URI=<your-mongodb-atlas-connection-string>
#   NODE_ENV=production
#   PORT=5000
#
# Required environment variables in frontend/.env (set at BUILD TIME):
#   VITE_API_URL=http://localhost:${backendPort}

version: '3.9'

services:

  # ── Backend (Node.js + Express) ─────────────────────────────────────────────
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: student-backend
    restart: unless-stopped
    ports:
      - "${backendPort}:5000"
    environment:
      - NODE_ENV=production
      - PORT=5000
      - MONGODB_URI=${mongoEnvNote}
    env_file:
      - ./backend/.env
    networks:
      - student-network
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:5000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"]
      interval: 30s
      timeout: 10s
      start_period: 30s
      retries: 3
${includeMongoLocal ? '    depends_on:\n      mongodb:\n        condition: service_healthy\n' : ''}
  # ── Frontend (React + Vite → Nginx) ────────────────────────────────────────
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        - VITE_API_URL=http://localhost:${backendPort}
    container_name: student-frontend
    restart: unless-stopped
    ports:
      - "${frontendPort}:80"
    networks:
      - student-network
    depends_on:
      backend:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:80/"]
      interval: 30s
      timeout: 5s
      start_period: 15s
      retries: 3
${mongoService}
networks:
  student-network:
    driver: bridge

volumes:
  ${includeMongoLocal ? 'mongo-data:\n    driver: local' : '# No local volumes needed — using MongoDB Atlas'}
`;

  fs.writeFileSync(targetPath, compose, 'utf8');

  return {
    success: true,
    composePath: targetPath,
    backendPort,
    frontendPort,
    includesLocalMongo: includeMongoLocal,
    message: `docker-compose.yml generated at "${targetPath}"`,
    nextSteps: [
      `1. Ensure backend/.env has MONGODB_URI set`,
      `2. Run: docker compose up -d --build`,
      `3. Frontend: http://localhost:${frontendPort}`,
      `4. Backend API: http://localhost:${backendPort}/api/health`
    ]
  };
}

/**
 * Full local deployment workflow.
 */
export async function deployLocal(params: {
  projectDir: string;
  rebuildImages: boolean;
  hasMongoUri: boolean;
  mongoUri?: string;
}): Promise<Record<string, unknown>> {
  const { projectDir, rebuildImages, hasMongoUri, mongoUri } = params;

  const steps: Array<{ step: string; status: 'success' | 'error' | 'skipped'; detail?: string }> = [];

  // Step 1: Inspect project
  const { inspectProject, generateDockerfile, generateCompose } = await import('./project-handler.js');
  const inspection = await inspectProject({ projectDir }) as {
    success: boolean; error?: string;
    structure?: {
      hasBackendDockerfile: boolean;
      hasFrontendDockerfile: boolean;
      hasDockerCompose: boolean;
      hasBackendEnv: boolean;
    }
  };

  if (!inspection.success) {
    return { success: false, error: inspection.error, steps };
  }

  steps.push({ step: 'Project inspection', status: 'success', detail: 'Project structure verified' });

  const struct = inspection.structure!;
  const dirCheck = validateProjectDir(projectDir);
  if (!dirCheck.valid) return { success: false, error: dirCheck.error };

  // Check backend .env
  if (!struct.hasBackendEnv && !hasMongoUri) {
    return {
      success: false,
      error: 'No backend/.env file found and no MONGODB_URI provided. Please create backend/.env with MONGODB_URI.',
      steps
    };
  }

  // If mongoUri provided, write it to backend/.env
  if (mongoUri) {
    const envPath = path.join(dirCheck.resolved, 'backend', '.env');
    const existingEnv = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    if (!existingEnv.includes('MONGODB_URI=')) {
      fs.writeFileSync(envPath, existingEnv + `\nMONGODB_URI=${mongoUri}\nPORT=5000\nNODE_ENV=production\n`);
    }
    steps.push({ step: 'Environment setup', status: 'success', detail: 'backend/.env configured (URI value not logged)' });
  }

  // Step 2: Generate Dockerfiles if missing
  if (!struct.hasBackendDockerfile) {
    const r = await generateDockerfile({ projectDir: path.join(dirCheck.resolved, 'backend'), component: 'backend', nodeVersion: '20-alpine', overwrite: false });
    steps.push({ step: 'Generate backend Dockerfile', status: r.success ? 'success' : 'error', detail: r.success ? String(r.dockerfilePath) : String(r.error) });
    if (!r.success) return { success: false, error: r.error, steps };
  } else {
    steps.push({ step: 'Generate backend Dockerfile', status: 'skipped', detail: 'Already exists' });
  }

  if (!struct.hasFrontendDockerfile) {
    const r = await generateDockerfile({ projectDir: path.join(dirCheck.resolved, 'frontend'), component: 'frontend', nodeVersion: '20-alpine', overwrite: false });
    steps.push({ step: 'Generate frontend Dockerfile', status: r.success ? 'success' : 'error', detail: r.success ? String(r.dockerfilePath) : String(r.error) });
    if (!r.success) return { success: false, error: r.error, steps };
  } else {
    steps.push({ step: 'Generate frontend Dockerfile', status: 'skipped', detail: 'Already exists' });
  }

  if (!struct.hasDockerCompose) {
    const r = await generateCompose({ projectDir: dirCheck.resolved, backendPort: 5000, frontendPort: 3000, includeMongoLocal: false, overwrite: false });
    steps.push({ step: 'Generate docker-compose.yml', status: r.success ? 'success' : 'error', detail: r.success ? String(r.composePath) : String(r.error) });
    if (!r.success) return { success: false, error: r.error, steps };
  } else {
    steps.push({ step: 'Generate docker-compose.yml', status: 'skipped', detail: 'Already exists' });
  }

  // Step 3: docker compose up
  const { composeUp } = await import('./docker-handler.js');
  const upResult = await composeUp({
    projectDir: dirCheck.resolved,
    composeFile: 'docker-compose.yml',
    detached: true,
    buildFirst: rebuildImages
  });

  steps.push({
    step: 'docker compose up',
    status: upResult.success ? 'success' : 'error',
    detail: upResult.success ? 'All services started' : String(upResult.error)
  });

  return {
    success: upResult.success,
    steps,
    services: upResult.success ? {
      frontend: 'http://localhost:3000',
      backend: 'http://localhost:5000',
      healthCheck: 'http://localhost:5000/api/health'
    } : undefined,
    error: upResult.success ? undefined : upResult.error
  };
}
