import { spawn } from 'child_process';
import http from 'http';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MCP_PORT = 3001;
const LOCAL_AGENT_PORT = 4000;
const MCP_KEY = 'b477d85cd0a2863020ab675ab125fa8cc7ef9c9d46702b94748b1b1c5de1d92d';
const LOCAL_SECRET = '51624ce93005b3401332f0cd0a06b080ba8507e36284d86ab98c2bc28428f5e2';

function request(options, body = null) {
  if (!options.headers) options.headers = {};
  if (!options.headers['Accept']) {
    options.headers['Accept'] = 'application/json, text/event-stream';
  }
  return new Promise((resolve, reject) => {
    const isHttps = options.protocol === 'https:';
    const client = isHttps ? https : http;
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json;
        if (typeof data === 'string' && data.includes('data: ')) {
          const line = data.split('\n').find(l => l.startsWith('data: '));
          if (line) {
            try {
              json = JSON.parse(line.substring(6));
            } catch {
              json = data;
            }
          }
        }
        if (!json) {
          try {
            json = JSON.parse(data);
          } catch {
            json = data;
          }
        }
        resolve({ status: res.statusCode, headers: res.headers, data: json });
      });
    });
    req.on('error', reject);
    if (body) {
      if (typeof body === 'object') {
        req.setHeader('Content-Type', 'application/json');
        req.write(JSON.stringify(body));
      } else {
        req.write(body);
      }
    }
    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const results = [];
function record(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`${passed ? '✅' : '❌'} ${name}${detail ? ` (${detail})` : ''}`);
}

async function main() {
  console.log('\n======================================================');
  console.log(' ANTIGRAVITY REMOTE MCP INTEGRATION TEST SUITE');
  console.log('======================================================\n');

  // 1. Spawn Local Docker Agent
  console.log('Starting Local Docker Agent on 127.0.0.1:4000...');
  const localAgentProcess = spawn('node', ['dist/index.js'], {
    cwd: path.join(__dirname, 'local-agent'),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  // 2. Spawn MCP Server
  console.log('Starting Remote MCP Server on 127.0.0.1:3001...');
  const mcpServerProcess = spawn('node', ['dist/index.js'], {
    cwd: path.join(__dirname, 'mcp-server'),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  // Wait for servers to bind
  await sleep(4000);

  try {
    // TEST 1: Local Agent Health
    try {
      const res = await request({
        hostname: '127.0.0.1',
        port: LOCAL_AGENT_PORT,
        path: '/health',
        method: 'GET'
      });
      record('1. Local Agent Health Check', res.status === 200 && res.data.status === 'ok', `status=${res.status}, service=${res.data.service}`);
    } catch (err) {
      record('1. Local Agent Health Check', false, err.message);
    }

    // TEST 2: Local Agent Auth - Unauthorized rejection
    try {
      const res = await request({
        hostname: '127.0.0.1',
        port: LOCAL_AGENT_PORT,
        path: '/docker/check-status',
        method: 'POST',
        headers: { 'Authorization': 'Bearer wrong-secret' }
      }, {});
      record('2. Local Agent Auth Rejection (wrong secret)', res.status === 401 || res.status === 403, `status=${res.status}`);
    } catch (err) {
      record('2. Local Agent Auth Rejection (wrong secret)', false, err.message);
    }

    // TEST 3: Local Agent Auth - Authorized success & Docker status
    try {
      const res = await request({
        hostname: '127.0.0.1',
        port: LOCAL_AGENT_PORT,
        path: '/docker/check-status',
        method: 'POST',
        headers: { 'Authorization': `Bearer ${LOCAL_SECRET}` }
      }, {});
      record('3. Local Agent Docker Check Status', res.status === 200, `installed=${res.data.dockerInstalled}, running=${res.data.engineRunning}`);
    } catch (err) {
      record('3. Local Agent Docker Check Status', false, err.message);
    }

    // TEST 4: Local Agent Security - Path Traversal Rejection
    try {
      const res = await request({
        hostname: '127.0.0.1',
        port: LOCAL_AGENT_PORT,
        path: '/docker/project-inspect',
        method: 'POST',
        headers: { 'Authorization': `Bearer ${LOCAL_SECRET}` }
      }, { projectDir: 'C:\\Windows\\System32' });
      record('4. Local Agent Security (Directory Whitelist)', res.status === 200 && res.data.success === false, res.data.error);
    } catch (err) {
      record('4. Local Agent Security (Directory Whitelist)', false, err.message);
    }

    // TEST 5: MCP Server Health
    try {
      const res = await request({
        hostname: '127.0.0.1',
        port: MCP_PORT,
        path: '/health',
        method: 'GET'
      });
      record('5. MCP Server Health Check', res.status === 200 && res.data.status === 'ok', `status=${res.status}`);
    } catch (err) {
      record('5. MCP Server Health Check', false, err.message);
    }

    // TEST 6: MCP Server Auth Rejection
    try {
      const res = await request({
        hostname: '127.0.0.1',
        port: MCP_PORT,
        path: '/mcp',
        method: 'POST',
        headers: { 'Authorization': 'Bearer bad-key' }
      }, {});
      record('6. MCP Server Auth Rejection (bad key)', res.status === 401 || res.status === 403, `status=${res.status}`);
    } catch (err) {
      record('6. MCP Server Auth Rejection (bad key)', false, err.message);
    }

    // TEST 7: MCP Session Initialization (Streamable HTTP)
    let sessionId = null;
    try {
      const initPayload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { roots: { listChanged: true } },
          clientInfo: { name: 'Antigravity-Client', version: '1.0.0' }
        }
      };
      const res = await request({
        hostname: '127.0.0.1',
        port: MCP_PORT,
        path: '/mcp',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MCP_KEY}`,
          'Content-Type': 'application/json'
        }
      }, initPayload);

      sessionId = res.headers['mcp-session-id'];
      console.log('INIT RESPONSE:', { status: res.status, headers: res.headers, data: res.data });
      const hasCapabilities = res.data && res.data.result && res.data.result.capabilities;
      record('7. MCP Session Initialization', res.status === 200 && Boolean(hasCapabilities), `sessionId=${sessionId}`);
    } catch (err) {
      record('7. MCP Session Initialization', false, err.message);
    }

    // TEST 8: MCP Tool Discovery (tools/list)
    let discoveredTools = [];
    try {
      const listToolsPayload = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      };
      const res = await request({
        hostname: '127.0.0.1',
        port: MCP_PORT,
        path: '/mcp',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MCP_KEY}`,
          'mcp-session-id': sessionId,
          'Content-Type': 'application/json'
        }
      }, listToolsPayload);

      discoveredTools = res.data?.result?.tools || [];
      const count = discoveredTools.length;
      record('8. MCP Tool Discovery (tools/list)', count >= 22, `Found ${count} tools: ${discoveredTools.map(t => t.name).slice(0, 5).join(', ')}...`);
    } catch (err) {
      record('8. MCP Tool Discovery (tools/list)', false, err.message);
    }

    // TEST 9: Safe Test Tool Call (docker_check_status)
    try {
      const toolCallPayload = {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'docker_check_status',
          arguments: {}
        }
      };
      const res = await request({
        hostname: '127.0.0.1',
        port: MCP_PORT,
        path: '/mcp',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MCP_KEY}`,
          'mcp-session-id': sessionId,
          'Content-Type': 'application/json'
        }
      }, toolCallPayload);

      const content = res.data?.result?.content?.[0]?.text;
      record('9. Call docker_check_status via MCP', res.status === 200 && Boolean(content), 'Returned structured Docker status');
    } catch (err) {
      record('9. Call docker_check_status via MCP', false, err.message);
    }

    // TEST 10: Student Management Tool Call (get_students against REST backend)
    try {
      const toolCallPayload = {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'get_students',
          arguments: {}
        }
      };
      const res = await request({
        hostname: '127.0.0.1',
        port: MCP_PORT,
        path: '/mcp',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MCP_KEY}`,
          'mcp-session-id': sessionId,
          'Content-Type': 'application/json'
        }
      }, toolCallPayload);

      const content = res.data?.result?.content?.[0]?.text;
      record('10. Call get_students via MCP (Backend Proxy)', res.status === 200 && Boolean(content), 'Connected to Render REST backend');
    } catch (err) {
      record('10. Call get_students via MCP (Backend Proxy)', false, err.message);
    }

    // TEST 11: Destructive Action Confirmation Guard (docker_stop_container without confirm)
    try {
      const toolCallPayload = {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'docker_stop_container',
          arguments: { containerNameOrId: 'test-container', confirm: false }
        }
      };
      const res = await request({
        hostname: '127.0.0.1',
        port: MCP_PORT,
        path: '/mcp',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MCP_KEY}`,
          'mcp-session-id': sessionId,
          'Content-Type': 'application/json'
        }
      }, toolCallPayload);

      const content = res.data?.result?.content?.[0]?.text || '';
      console.log('TEST 11 RES:', { data: res.data, content });
      record('11. Destructive Guard (docker_stop without confirm)', content.includes('cancelled') || content.includes('Action cancelled'), 'Confirmation check enforced');
    } catch (err) {
      record('11. Destructive Guard (docker_stop without confirm)', false, err.message);
    }

    // TEST 12: Project Inspect Tool Call
    try {
      const projectDir = 'C:\\Users\\user\\Downloads\\student-management-system-main\\student-management-system-main';
      const toolCallPayload = {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'project_inspect',
          arguments: { projectDir }
        }
      };
      const res = await request({
        hostname: '127.0.0.1',
        port: MCP_PORT,
        path: '/mcp',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MCP_KEY}`,
          'mcp-session-id': sessionId,
          'Content-Type': 'application/json'
        }
      }, toolCallPayload);

      const content = res.data?.result?.content?.[0]?.text || '';
      console.log('TEST 12 RES:', { data: res.data, content });
      const parsed = JSON.parse(content);
      record('12. Project Inspect Tool Call', parsed.success === true && Boolean(parsed.frontend), 'Parsed frontend and backend structure');
    } catch (err) {
      record('12. Project Inspect Tool Call', false, err.message);
    }

  } finally {
    console.log('\nStopping servers...');
    localAgentProcess.kill();
    mcpServerProcess.kill();
  }

  console.log('\n------------------------------------------------------');
  const passed = results.filter(r => r.passed).length;
  console.log(`SUMMARY: ${passed}/${results.length} tests passed`);
  console.log('------------------------------------------------------\n');

  if (passed === results.length) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main().catch(console.error);
