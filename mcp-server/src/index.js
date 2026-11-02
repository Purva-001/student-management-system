/**
 * index.js — Entry point for the Student Management MCP Server
 *
 * Exposes:
 *   POST /mcp    — MCP Streamable HTTP transport endpoint (bearer-auth protected)
 *   GET  /health — Health check endpoint
 *
 * Environment variables required:
 *   BACKEND_API_URL  — URL of the existing backend (e.g. https://your-app.onrender.com)
 *   MCP_API_KEY      — Secret token used to authenticate MCP clients (Devin, etc.)
 *   PORT             — Port to listen on (injected by Render automatically)
 */

'use strict';

require('dotenv').config();

const express = require('express');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const authMiddleware = require('./auth.js');
const { createMcpServer } = require('./mcpServer.js');

// ─── Startup validation ──────────────────────────────────────────────────────

const requiredEnvVars = ['BACKEND_API_URL', 'MCP_API_KEY'];
const missingVars = requiredEnvVars.filter((v) => !process.env[v]);
if (missingVars.length > 0) {
  console.error(`[startup] Missing required environment variables: ${missingVars.join(', ')}`);
  console.error('[startup] Set these in your .env file or Render environment settings.');
  process.exit(1);
}

// ─── Express app setup ───────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// ─── Health endpoint (no auth required) ─────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'student-management-mcp',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    backend: process.env.BACKEND_API_URL || 'NOT_SET'
  });
});

// ─── MCP endpoint (bearer-auth required) ─────────────────────────────────────

app.post('/mcp', authMiddleware, async (req, res) => {
  let server;
  let transport;

  try {
    // Create a fresh MCP server instance for each request (stateless pattern).
    // This is safe for Render's single-instance deployment and avoids
    // session management complexity.
    server = createMcpServer();

    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined // Stateless — no session IDs needed
    });

    // Clean up resources when the HTTP connection closes
    res.on('close', async () => {
      try {
        if (transport) await transport.close();
        if (server) await server.close();
      } catch (closeErr) {
        // Ignore close errors — connection is already gone
      }
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('[/mcp] Error handling MCP request:', error.message);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'MCP request processing failed'
      });
    }
  }
});

// ─── 404 handler ─────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} does not exist on this MCP server`,
    availableRoutes: ['POST /mcp', 'GET /health']
  });
});

// ─── Start server ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;

const httpServer = app.listen(PORT, () => {
  console.log(`[startup] Student Management MCP Server running on port ${PORT}`);
  console.log(`[startup] Health check: http://localhost:${PORT}/health`);
  console.log(`[startup] MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`[startup] Backend URL:  ${process.env.BACKEND_API_URL}`);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

const shutdown = (signal) => {
  console.log(`\n[shutdown] Received ${signal}. Shutting down gracefully...`);
  httpServer.close(() => {
    console.log('[shutdown] HTTP server closed. Exiting.');
    process.exit(0);
  });

  // Force exit if graceful shutdown takes too long
  setTimeout(() => {
    console.error('[shutdown] Force exit after timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app; // Exported for testing purposes
