# Student Management MCP Server

A production-ready **Remote MCP (Model Context Protocol) Server** that exposes the existing Student Management System to AI agents like [Devin](https://www.devin.ai/) via a secure HTTP endpoint.

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [README.md](./README.md) | This file - Overview and quick start |
| [AUDIT_REPORT.md](./AUDIT_REPORT.md) | Complete audit findings and compliance checklist |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture and data flow diagrams |
| [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) | Step-by-step Render deployment instructions |
| [DEVIN_CONNECTION_GUIDE.md](./DEVIN_CONNECTION_GUIDE.md) | Devin CLI configuration and usage |
| [TESTING_REPORT.md](./TESTING_REPORT.md) | Testing procedures and results |
| [FINAL_SUMMARY.md](./FINAL_SUMMARY.md) | Project completion summary and checklist |

## Architecture

```
Devin AI / MCP Client
        │
        │  POST /mcp (Bearer token)
        ▼
┌──────────────────────┐
│   MCP Server         │  ← This service (mcp-server/)
│   (Render)           │
│   POST /mcp          │
│   GET  /health       │
└──────────┬───────────┘
           │  REST API calls (axios)
           ▼
┌──────────────────────┐
│   Backend API        │  ← Existing backend (unchanged)
│   (Render)           │
│   GET  /api/students │
│   POST /api/students │
│   PUT  /api/students │
│   DELETE /api/...    │
└──────────┬───────────┘
           │  mongoose
           ▼
┌──────────────────────┐
│   MongoDB Atlas      │  ← Database (no direct access from MCP server)
└──────────────────────┘
```

**Key principle**: The MCP server never connects to MongoDB directly. All data access flows through the existing backend REST API.

---

## MCP Tools

| Tool | Description | Backend Call |
|------|-------------|-------------|
| `get_students` | Retrieve all student records | `GET /api/students` |
| `search_student` | Search by studentId or full name | `GET /api/students/:searchTerm` |
| `add_student` | Create a new student record | `POST /api/students` |
| `update_student` | Update an existing student record | `PUT /api/students/:id` |
| `delete_student` | Delete a student (requires `confirm: true`) | `DELETE /api/students/:id` |

### Student Fields

All fields are required when creating a student:

| Field | Type | Example |
|-------|------|---------|
| `studentId` | string (unique) | `"STU001"` |
| `fullName` | string | `"Jane Doe"` |
| `email` | string, email format | `"jane@example.com"` |
| `department` | string | `"Computer Science"` |
| `semester` | string | `"3rd"` |
| `contactNumber` | string | `"+1-555-123-4567"` |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BACKEND_API_URL` | ✅ Yes | Base URL of the deployed backend (e.g. `https://your-backend.onrender.com`) |
| `MCP_API_KEY` | ✅ Yes | Bearer token for authenticating MCP clients. Generate with: `openssl rand -hex 32` |
| `PORT` | Auto | Injected by Render automatically |

---

## Local Development

```bash
# 1. Install dependencies
cd mcp-server
npm install

# 2. Create your .env file
cp .env.example .env
# Edit .env and fill in BACKEND_API_URL and MCP_API_KEY

# 3. Start the server
npm run dev

# 4. Verify health endpoint
curl http://localhost:3001/health

# 5. Run integration tests (make sure the backend is reachable)
MCP_SERVER_URL=http://localhost:3001 node test.js
```

---

## Deployment on Render

> 📖 **Detailed deployment instructions:** See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for step-by-step Render deployment instructions.

### Quick Summary

1. **Push to GitHub:** Ensure the `mcp-server/` folder is committed
2. **Create Web Service:** Go to Render → New → Web Service
3. **Configure:**
   - Root Directory: `mcp-server`
   - Build Command: `npm install`
   - Start Command: `npm start`
4. **Environment Variables:**
   - `BACKEND_API_URL`: `https://student-management-system-iqki.onrender.com`
   - `MCP_API_KEY`: Generate with `openssl rand -hex 32`
5. **Deploy:** Click Create Web Service

### Verify Deployment

```bash
curl https://YOUR-MCP-SERVICE.onrender.com/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "student-management-mcp",
  "version": "1.0.0",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "backend": "https://student-management-system-iqki.onrender.com"
}
```

---

## Connecting Devin AI

> 📖 **Detailed connection instructions:** See [DEVIN_CONNECTION_GUIDE.md](./DEVIN_CONNECTION_GUIDE.md) for complete Devin CLI configuration instructions.

### Method 1: Command-Line (Recommended)

```bash
devin mcp add student-management https://YOUR-MCP-SERVICE.onrender.com/mcp --headers "Authorization: Bearer YOUR_MCP_API_KEY"
```

Replace:
- `YOUR-MCP-SERVICE.onrender.com` → your actual Render service URL
- `YOUR_MCP_API_KEY` → the value you set for `MCP_API_KEY` on Render

### Method 2: Configuration File

Create `.devin/mcp_config.local.json` in your project root:

```json
{
  "mcpServers": {
    "student-management": {
      "url": "https://YOUR-MCP-SERVICE.onrender.com/mcp",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_API_KEY"
      }
    }
  }
}
```

Replace:
- `YOUR-MCP-SERVICE.onrender.com` → your actual Render service URL
- `YOUR_MCP_API_KEY` → the value you set for `MCP_API_KEY` on Render

**Important:** Use `.devin/mcp_config.local.json` (gitignored) for API keys to avoid committing secrets to Git.

### Devin can now use natural language like:

- *"Show me all students in the system"*
- *"Add a new student: John Smith, Computer Science, 3rd semester"*
- *"Find the student with ID STU042"*
- *"Update Jane Doe's email to jane.new@example.com"*
- *"Delete the test student with ID TEST-001"* (Devin must confirm before deletion executes)

---

## Security

- **Bearer token auth**: Every `POST /mcp` request must include `Authorization: Bearer <MCP_API_KEY>`. Missing or invalid tokens return `401`/`403`.
- **Delete confirmation**: The `delete_student` tool requires `confirm: true` in its arguments. Without it, the tool returns a warning prompt and takes no action.
- **No MongoDB exposure**: The MCP server never connects to MongoDB. The MongoDB URI exists only in the backend's environment.
- **No stack traces**: All error responses return safe, human-readable messages without internal details.
- **Constant-time auth comparison**: The token comparison is resistant to timing attacks.

---

## API Reference

### `GET /health`

No authentication required.

**Response:**
```json
{
  "status": "ok",
  "service": "student-management-mcp",
  "version": "1.0.0",
  "timestamp": "ISO-8601-string",
  "backend": "https://your-backend.onrender.com"
}
```

### `POST /mcp`

Implements the [MCP Streamable HTTP transport](https://modelcontextprotocol.io/docs/concepts/transports).

**Headers:**
```
Content-Type: application/json
Authorization: Bearer <MCP_API_KEY>
```

**Body:** JSON-RPC 2.0 message (MCP protocol).

---

## Running Tests

```bash
# Set environment variables
$env:MCP_API_KEY="your-key"
$env:MCP_SERVER_URL="https://YOUR-MCP-SERVICE.onrender.com"

# Run all tests
node test.js
```

The test script:
- Creates a dedicated test student (`TEST-MCP-001`)
- Tests all 5 tools
- Tests auth failure (no token, wrong token)
- Tests delete confirmation
- Tests error handling
- Cleans up the test student at the end

> 📖 **Testing documentation:** See [TESTING_REPORT.md](./TESTING_REPORT.md) for detailed test results and verification steps.
