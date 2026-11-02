import 'dotenv/config';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import {
  listProjects, getProject,
  listDeployments, getDeployment, cancelDeployment
} from './vercel.js';
import {
  listServices, getService,
  deployService, listDeploys, getDeploy,
  suspendService, resumeService
} from './render.js';

// ─── Validate environment ──────────────────────────────────────────────────
const HAS_VERCEL = !!process.env.VERCEL_API_TOKEN;
const HAS_RENDER = !!process.env.RENDER_API_KEY;

if (!HAS_VERCEL && !HAS_RENDER) {
  console.error('[STARTUP] FATAL: Set at least one of VERCEL_API_TOKEN or RENDER_API_KEY in .env');
  process.exit(1);
}

const PORT = parseInt(process.env.MCP_PORT || '3001', 10);

// ─── Create MCP Server ─────────────────────────────────────────────────────
const server = new McpServer({
  name: 'student-management-deployment-server',
  version: '1.0.0',
});

// ═══════════════════════════════════════════════════════════════════
//  VERCEL TOOLS
// ═══════════════════════════════════════════════════════════════════
if (HAS_VERCEL) {
  server.tool(
    'vercel_list_projects',
    'List all Vercel projects in the account',
    {},
    async () => {
      const data = await listProjects();
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'vercel_get_project',
    'Get details of a specific Vercel project',
    { projectId: z.string().describe('Vercel project ID or name') },
    async ({ projectId }) => {
      const data = await getProject(projectId);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'vercel_list_deployments',
    'List recent deployments for a Vercel project',
    {
      projectId: z.string().describe('Vercel project ID or name'),
      limit: z.number().optional().describe('Max deployments to return (default: 10)')
    },
    async ({ projectId, limit }) => {
      const data = await listDeployments(projectId, limit);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'vercel_get_deployment',
    'Get details of a specific Vercel deployment',
    { deploymentId: z.string().describe('Vercel deployment ID or URL') },
    async ({ deploymentId }) => {
      const data = await getDeployment(deploymentId);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'vercel_cancel_deployment',
    'Cancel a running Vercel deployment',
    { deploymentId: z.string().describe('Vercel deployment ID to cancel') },
    async ({ deploymentId }) => {
      const data = await cancelDeployment(deploymentId);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}

// ═══════════════════════════════════════════════════════════════════
//  RENDER TOOLS
// ═══════════════════════════════════════════════════════════════════
if (HAS_RENDER) {
  server.tool(
    'render_list_services',
    'List all Render services',
    {
      type: z.enum(['web_service', 'static_site', 'private_service', 'background_worker', 'cron_job'])
        .optional()
        .describe('Filter by service type')
    },
    async ({ type }) => {
      const data = await listServices(type);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'render_get_service',
    'Get details of a specific Render service',
    { serviceId: z.string().describe('Render service ID (starts with srv-)') },
    async ({ serviceId }) => {
      const data = await getService(serviceId);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'render_deploy_service',
    'Trigger a new deploy for a Render service',
    {
      serviceId: z.string().describe('Render service ID (starts with srv-)'),
      clearCache: z.boolean().optional().describe('Clear build cache before deploying (default: false)')
    },
    async ({ serviceId, clearCache }) => {
      const data = await deployService(serviceId, clearCache);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'render_list_deploys',
    'List recent deploys for a Render service',
    {
      serviceId: z.string().describe('Render service ID (starts with srv-)'),
      limit: z.number().optional().describe('Max deploys to return (default: 10)')
    },
    async ({ serviceId, limit }) => {
      const data = await listDeploys(serviceId, limit);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'render_get_deploy',
    'Get details of a specific Render deploy',
    {
      serviceId: z.string().describe('Render service ID'),
      deployId: z.string().describe('Deploy ID')
    },
    async ({ serviceId, deployId }) => {
      const data = await getDeploy(serviceId, deployId);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'render_suspend_service',
    'Suspend a Render service (stops billing for compute)',
    { serviceId: z.string().describe('Render service ID to suspend') },
    async ({ serviceId }) => {
      const data = await suspendService(serviceId);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'render_resume_service',
    'Resume a suspended Render service',
    { serviceId: z.string().describe('Render service ID to resume') },
    async ({ serviceId }) => {
      const data = await resumeService(serviceId);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}

// ─── Express HTTP server with SSE transport ────────────────────────────────
const app = express();
app.use(express.json());

const transports = {};

// SSE endpoint — clients connect here to establish MCP session
app.get('/mcp', async (req, res) => {
  const transport = new SSEServerTransport('/mcp/message', res);
  transports[transport.sessionId] = transport;
  res.on('close', () => delete transports[transport.sessionId]);
  await server.connect(transport);
});

// Message endpoint — clients POST messages here
app.post('/mcp/message', async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports[sessionId];
  if (!transport) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  await transport.handlePostMessage(req, res);
});

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'student-management-mcp-server',
    version: '1.0.0',
    tools: {
      vercel: HAS_VERCEL,
      render: HAS_RENDER
    },
    timestamp: new Date().toISOString()
  });
});

// ─── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       Student Management MCP Server — v1.0.0                ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  MCP Endpoint  : http://localhost:${PORT}/mcp                    ║`);
  console.log(`║  Health Check  : http://localhost:${PORT}/health                 ║`);
  console.log(`║  Vercel Tools  : ${HAS_VERCEL ? '✅ Enabled (5 tools) ' : '❌ Disabled            '}             ║`);
  console.log(`║  Render Tools  : ${HAS_RENDER ? '✅ Enabled (7 tools) ' : '❌ Disabled            '}             ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
});

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

