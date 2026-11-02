import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { agentAuth } from './auth.js';
import {
  checkDockerStatus,
  buildImage,
  createContainer,
  startContainer,
  stopContainer,
  listContainers,
  containerLogs,
  removeContainer,
  inspectContainer,
  composeUp,
  composeDown
} from './docker-handler.js';
import {
  inspectProject,
  generateDockerfile,
  generateCompose,
  deployLocal
} from './project-handler.js';

// ─── Validate environment ──────────────────────────────────────────────────
if (!process.env.LOCAL_AGENT_SECRET) {
  console.error('[STARTUP] FATAL: LOCAL_AGENT_SECRET is not set.');
  console.error('[STARTUP] Copy local-agent/.env.example to local-agent/.env and set LOCAL_AGENT_SECRET.');
  process.exit(1);
}

const PORT = parseInt(process.env.LOCAL_AGENT_PORT || '4000', 10);
const ALLOWED_DIRS = process.env.ALLOWED_PROJECT_DIRS || '(all directories allowed)';

// ─── Express app ───────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '5mb' }));

// ─── Health check (no auth) ────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'local-docker-agent',
    version: '1.0.0',
    platform: process.platform,
    allowedDirs: ALLOWED_DIRS,
    timestamp: new Date().toISOString()
  });
});

// Apply auth to all /docker/* routes
app.use('/docker', agentAuth);

// ─── Helper: wrap handler in try/catch ────────────────────────────────────
function handle(
  fn: (body: Record<string, unknown>) => Promise<Record<string, unknown>>
) {
  return async (req: Request, res: Response) => {
    try {
      const result = await fn(req.body || {});
      res.json(result);
    } catch (err) {
      const error = err as { message?: string };
      console.error(`[ERROR] ${req.path}:`, error.message);
      res.status(500).json({ success: false, error: `Internal error: ${error.message}` });
    }
  };
}

// ─── Docker routes ─────────────────────────────────────────────────────────
app.post('/docker/check-status', handle(() => checkDockerStatus()));

app.post('/docker/build-image', handle((body) => buildImage({
  projectDir: String(body.projectDir || ''),
  dockerfilePath: String(body.dockerfilePath || 'Dockerfile'),
  imageName: String(body.imageName || ''),
  buildArgs: (body.buildArgs as Record<string, string>) || {}
})));

app.post('/docker/create-container', handle((body) => createContainer({
  imageName: String(body.imageName || ''),
  containerName: String(body.containerName || ''),
  portMappings: (body.portMappings as string[]) || [],
  environmentVariables: (body.environmentVariables as Record<string, string>) || {},
  volumeMappings: (body.volumeMappings as string[]) || []
})));

app.post('/docker/start-container', handle((body) => startContainer({
  containerNameOrId: String(body.containerNameOrId || '')
})));

app.post('/docker/stop-container', handle((body) => stopContainer({
  containerNameOrId: String(body.containerNameOrId || ''),
  timeoutSeconds: Number(body.timeoutSeconds ?? 10)
})));

app.post('/docker/list-containers', handle((body) => listContainers({
  showAll: Boolean(body.showAll)
})));

app.post('/docker/container-logs', handle((body) => containerLogs({
  containerNameOrId: String(body.containerNameOrId || ''),
  tail: Number(body.tail ?? 100),
  timestamps: Boolean(body.timestamps)
})));

app.post('/docker/remove-container', handle((body) => removeContainer({
  containerNameOrId: String(body.containerNameOrId || ''),
  force: Boolean(body.force)
})));

app.post('/docker/inspect-container', handle((body) => inspectContainer({
  containerNameOrId: String(body.containerNameOrId || '')
})));

app.post('/docker/compose-up', handle((body) => composeUp({
  projectDir: String(body.projectDir || ''),
  composeFile: String(body.composeFile || 'docker-compose.yml'),
  detached: Boolean(body.detached ?? true),
  buildFirst: Boolean(body.buildFirst ?? true)
})));

app.post('/docker/compose-down', handle((body) => composeDown({
  projectDir: String(body.projectDir || ''),
  composeFile: String(body.composeFile || 'docker-compose.yml'),
  removeVolumes: Boolean(body.removeVolumes)
})));

// ─── Project routes ────────────────────────────────────────────────────────
app.post('/docker/project-inspect', handle((body) => inspectProject({
  projectDir: String(body.projectDir || '')
})));

app.post('/docker/generate-dockerfile', handle((body) => generateDockerfile({
  projectDir: String(body.projectDir || ''),
  component: String(body.component || 'backend') as 'frontend' | 'backend',
  nodeVersion: String(body.nodeVersion || '20-alpine'),
  overwrite: Boolean(body.overwrite)
})));

app.post('/docker/generate-compose', handle((body) => generateCompose({
  projectDir: String(body.projectDir || ''),
  backendPort: Number(body.backendPort ?? 5000),
  frontendPort: Number(body.frontendPort ?? 3000),
  includeMongoLocal: Boolean(body.includeMongoLocal),
  overwrite: Boolean(body.overwrite)
})));

app.post('/docker/deploy-local', handle((body) => deployLocal({
  projectDir: String(body.projectDir || ''),
  rebuildImages: Boolean(body.rebuildImages ?? true),
  hasMongoUri: Boolean(body.hasMongoUri),
  mongoUri: body.mongoUri ? String(body.mongoUri) : undefined
})));

// ─── 404 ──────────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found' });
});

// ─── Error handler ─────────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[UNHANDLED]', err.message);
  res.status(500).json({ success: false, error: 'Internal Server Error' });
});

// ─── Start ─────────────────────────────────────────────────────────────────
const server = app.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║          Local Docker Execution Agent — v1.0.0              ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Listening on  : http://127.0.0.1:${PORT}                      ║`);
  console.log(`║  Platform      : ${process.platform.padEnd(44)}║`);
  console.log(`║  Allowed dirs  : ${ALLOWED_DIRS.substring(0, 44).padEnd(44)}║`);
  console.log('║  ⚠️  Bound to 127.0.0.1 ONLY — not exposed to network      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Ready. Waiting for requests from Remote MCP Server...');
});

// Graceful shutdown
process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('SIGINT', () => { server.close(() => process.exit(0)); });
