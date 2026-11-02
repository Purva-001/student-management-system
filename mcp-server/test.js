/**
 * test.js — Manual integration test script for the Student MCP Server
 *
 * Tests all 5 MCP tools plus authentication and error handling.
 * Uses a dedicated test student record and cleans up after itself.
 *
 * Usage:
 *   node test.js
 *
 * Environment variables:
 *   MCP_SERVER_URL  — URL of the running MCP server (default: http://localhost:3001)
 *   MCP_API_KEY     — The bearer token for authentication
 */

'use strict';

require('dotenv').config();

const MCP_URL = process.env.MCP_SERVER_URL || 'http://localhost:3001';
const MCP_KEY = process.env.MCP_API_KEY;

if (!MCP_KEY) {
  console.error('ERROR: MCP_API_KEY environment variable is required to run tests.');
  process.exit(1);
}

// ─── Test student fixture (dedicated test record — do NOT use real data) ─────

const TEST_STUDENT = {
  studentId: 'TEST-MCP-001',
  fullName: 'MCP Test Student',
  email: 'mcp-test-001@example-test.com',
  department: 'Computer Science',
  semester: '1st',
  contactNumber: '0000000000'
};

let testStudentDbId = null; // Will hold MongoDB _id after creation
let passed = 0;
let failed = 0;

// ─── Utility: Send an MCP JSON-RPC request ───────────────────────────────────

async function sendMcpRequest(payload, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream'
  };

  if (options.auth !== false) {
    headers['Authorization'] = `Bearer ${MCP_KEY}`;
  } else if (options.wrongToken) {
    headers['Authorization'] = 'Bearer WRONG-TOKEN-12345';
  }

  const response = await fetch(`${MCP_URL}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  return { status: response.status, headers: response.headers, response };
}

function buildInitialize() {
  return {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    }
  };
}

function buildToolCall(id, toolName, args = {}) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name: toolName, arguments: args }
  };
}

function buildToolsList(id) {
  return { jsonrpc: '2.0', id, method: 'tools/list', params: {} };
}

// ─── Utility: Parse SSE/JSON response ────────────────────────────────────────

async function parseResponse(response) {
  const text = await response.text();

  // If it's SSE, extract the data lines
  if (text.includes('data:')) {
    const lines = text.split('\n');
    const dataLines = lines.filter(l => l.startsWith('data:')).map(l => l.slice(5).trim());
    if (dataLines.length > 0) {
      try {
        return JSON.parse(dataLines[dataLines.length - 1]);
      } catch {
        return { raw: text };
      }
    }
  }

  // Otherwise try plain JSON
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

// ─── Test runner ─────────────────────────────────────────────────────────────

async function test(name, fn) {
  process.stdout.write(`  ${name} ... `);
  try {
    await fn();
    console.log('✅ PASS');
    passed++;
  } catch (err) {
    console.log(`❌ FAIL — ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ─── Test suites ─────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Student Management MCP Server — Integration Tests');
  console.log(`  Target: ${MCP_URL}`);
  console.log('══════════════════════════════════════════════════════\n');

  // ── Suite 1: Health check ──────────────────────────────────────────────────
  console.log('📋 Suite 1: Health Check');

  await test('GET /health returns 200 with ok status', async () => {
    const res = await fetch(`${MCP_URL}/health`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(body.status === 'ok', `Expected status "ok", got "${body.status}"`);
    assert(body.service === 'student-management-mcp', 'Service name mismatch');
  });

  // ── Suite 2: Authentication ────────────────────────────────────────────────
  console.log('\n📋 Suite 2: Authentication');

  await test('POST /mcp without Authorization header returns 401', async () => {
    const { status } = await sendMcpRequest(buildInitialize(), { auth: false });
    assert(status === 401, `Expected 401, got ${status}`);
  });

  await test('POST /mcp with wrong token returns 403', async () => {
    const { status } = await sendMcpRequest(buildInitialize(), { auth: false, wrongToken: true });
    assert(status === 403, `Expected 403, got ${status}`);
  });

  // ── Suite 3: MCP Handshake ─────────────────────────────────────────────────
  console.log('\n📋 Suite 3: MCP Handshake & Tool Discovery');

  await test('MCP initialize handshake succeeds', async () => {
    const { status, response } = await sendMcpRequest(buildInitialize());
    assert(status === 200, `Expected 200, got ${status}`);
    const body = await parseResponse(response);
    assert(body.result || body.jsonrpc, 'Expected a valid JSON-RPC response');
  });

  await test('tools/list returns all 5 student tools', async () => {
    // First initialize
    const initRes = await sendMcpRequest(buildInitialize());
    const initBody = await parseResponse(initRes.response);

    const { status, response } = await sendMcpRequest(buildToolsList(2));
    assert(status === 200, `Expected 200, got ${status}`);
    const body = await parseResponse(response);
    const tools = body?.result?.tools || [];
    const toolNames = tools.map(t => t.name);

    const expectedTools = ['get_students', 'search_student', 'add_student', 'update_student', 'delete_student'];
    for (const expectedTool of expectedTools) {
      assert(toolNames.includes(expectedTool), `Missing tool: ${expectedTool}. Found: ${toolNames.join(', ')}`);
    }
  });

  // ── Suite 4: Tool Execution ────────────────────────────────────────────────
  console.log('\n📋 Suite 4: Tool Execution');

  await test('get_students returns student list (or empty)', async () => {
    const { status, response } = await sendMcpRequest(buildToolCall(3, 'get_students'));
    assert(status === 200, `Expected 200, got ${status}`);
    const body = await parseResponse(response);
    const content = body?.result?.content?.[0]?.text;
    assert(content !== undefined, 'Expected text content in response');
    assert(typeof content === 'string', 'Expected string content');
  });

  await test('add_student creates the test student record', async () => {
    const { status, response } = await sendMcpRequest(
      buildToolCall(4, 'add_student', TEST_STUDENT)
    );
    assert(status === 200, `Expected 200, got ${status}`);
    const body = await parseResponse(response);
    const isError = body?.result?.isError === true;
    assert(!isError, `Expected success, got error: ${body?.result?.content?.[0]?.text}`);
    const text = body?.result?.content?.[0]?.text || '';
    assert(text.includes('created successfully'), `Expected "created successfully" in response: "${text}"`);

    // Extract the MongoDB _id for subsequent tests
    const idMatch = text.match(/Document ID\s*:\s*([a-f0-9]{24})/i);
    if (idMatch) {
      testStudentDbId = idMatch[1];
      console.log(`\n     (Test student _id: ${testStudentDbId})`);
    }
  });

  await test('search_student finds the test student by studentId', async () => {
    const { status, response } = await sendMcpRequest(
      buildToolCall(5, 'search_student', { search_term: TEST_STUDENT.studentId })
    );
    assert(status === 200, `Expected 200, got ${status}`);
    const body = await parseResponse(response);
    const text = body?.result?.content?.[0]?.text || '';
    assert(text.includes(TEST_STUDENT.studentId), `Expected studentId in response: "${text}"`);
    assert(text.includes(TEST_STUDENT.fullName), `Expected fullName in response: "${text}"`);
  });

  await test('search_student finds the test student by name', async () => {
    const { status, response } = await sendMcpRequest(
      buildToolCall(6, 'search_student', { search_term: 'MCP Test Student' })
    );
    assert(status === 200, `Expected 200, got ${status}`);
    const body = await parseResponse(response);
    const text = body?.result?.content?.[0]?.text || '';
    assert(text.includes('MCP Test Student'), `Expected name in response: "${text}"`);
  });

  await test('add_student rejects duplicate studentId', async () => {
    const { status, response } = await sendMcpRequest(
      buildToolCall(7, 'add_student', TEST_STUDENT) // Same student again
    );
    assert(status === 200, `Expected 200, got ${status}`);
    const body = await parseResponse(response);
    const isError = body?.result?.isError === true;
    assert(isError, 'Expected an error response for duplicate studentId');
  });

  await test('add_student rejects invalid email', async () => {
    const { status, response } = await sendMcpRequest(
      buildToolCall(8, 'add_student', {
        ...TEST_STUDENT,
        studentId: 'TEST-MCP-002',
        email: 'not-an-email'
      })
    );
    assert(status === 200, `Expected 200, got ${status}`);
    // Zod validation should reject this at the MCP layer before it hits the backend
    const body = await parseResponse(response);
    const isError = body?.result?.isError === true || body?.error !== undefined;
    assert(isError, 'Expected validation error for invalid email');
  });

  if (testStudentDbId) {
    await test('update_student updates the test student\'s semester', async () => {
      const { status, response } = await sendMcpRequest(
        buildToolCall(9, 'update_student', { id: testStudentDbId, semester: '2nd' })
      );
      assert(status === 200, `Expected 200, got ${status}`);
      const body = await parseResponse(response);
      const isError = body?.result?.isError === true;
      assert(!isError, `Expected success, got error: ${body?.result?.content?.[0]?.text}`);
      const text = body?.result?.content?.[0]?.text || '';
      assert(text.includes('updated successfully'), `Expected "updated successfully": "${text}"`);
      assert(text.includes('2nd'), `Expected updated semester "2nd" in response: "${text}"`);
    });

    await test('update_student rejects no-field update', async () => {
      const { status, response } = await sendMcpRequest(
        buildToolCall(10, 'update_student', { id: testStudentDbId }) // No fields to update
      );
      assert(status === 200, `Expected 200, got ${status}`);
      const body = await parseResponse(response);
      const isError = body?.result?.isError === true;
      assert(isError, 'Expected error for update with no fields');
    });

    await test('update_student returns 404 for unknown ID', async () => {
      const { status, response } = await sendMcpRequest(
        buildToolCall(11, 'update_student', { id: '000000000000000000000000', fullName: 'Ghost' })
      );
      assert(status === 200, `Expected 200, got ${status}`);
      const body = await parseResponse(response);
      const isError = body?.result?.isError === true;
      assert(isError, 'Expected error for non-existent ID');
    });

    // ── Delete confirmation test ─────────────────────────────────────────────
    await test('delete_student WITHOUT confirm returns a confirmation prompt', async () => {
      const { status, response } = await sendMcpRequest(
        buildToolCall(12, 'delete_student', { id: testStudentDbId, confirm: false })
      );
      assert(status === 200, `Expected 200, got ${status}`);
      const body = await parseResponse(response);
      const isError = body?.result?.isError === true;
      assert(!isError, 'Expected a non-error response (confirmation prompt, not an error)');
      const text = body?.result?.content?.[0]?.text || '';
      assert(text.includes('confirm'), `Expected confirmation message: "${text}"`);
    });

    await test('delete_student WITH confirm=true deletes the test student', async () => {
      const { status, response } = await sendMcpRequest(
        buildToolCall(13, 'delete_student', { id: testStudentDbId, confirm: true })
      );
      assert(status === 200, `Expected 200, got ${status}`);
      const body = await parseResponse(response);
      const isError = body?.result?.isError === true;
      assert(!isError, `Expected success, got error: ${body?.result?.content?.[0]?.text}`);
      const text = body?.result?.content?.[0]?.text || '';
      assert(text.includes('deleted successfully'), `Expected "deleted successfully": "${text}"`);
    });

    await test('search_student returns not-found after deletion', async () => {
      const { status, response } = await sendMcpRequest(
        buildToolCall(14, 'search_student', { search_term: TEST_STUDENT.studentId })
      );
      assert(status === 200, `Expected 200, got ${status}`);
      const body = await parseResponse(response);
      const text = body?.result?.content?.[0]?.text || '';
      // Should say "not found", not be an error itself
      assert(text.toLowerCase().includes('not found'), `Expected "not found" after deletion: "${text}"`);
    });
  } else {
    console.log('\n  ⚠️  Skipping update/delete tests — test student was not created successfully.');
    failed += 5;
  }

  // ── Suite 5: Backend unavailable ──────────────────────────────────────────
  console.log('\n📋 Suite 5: Error handling');

  await test('search_student handles not-found gracefully (no stack trace)', async () => {
    const { status, response } = await sendMcpRequest(
      buildToolCall(15, 'search_student', { search_term: 'NONEXISTENT-XYZ-99999' })
    );
    assert(status === 200, `Expected 200, got ${status}`);
    const body = await parseResponse(response);
    const text = body?.result?.content?.[0]?.text || '';
    // Should NOT contain stack traces
    assert(!text.includes('at Object.'), `Response must not expose stack traces: "${text}"`);
    assert(!text.includes('mongodb+srv://'), `Response must not expose MongoDB URI: "${text}"`);
  });

  // ── Results ────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('══════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unexpected test runner error:', err);
  process.exit(1);
});
