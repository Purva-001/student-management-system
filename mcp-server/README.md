# Student Management MCP Server

A production-ready **Remote MCP (Model Context Protocol) Server** that exposes the existing Student Management System to AI agents like [Devin](https://www.devin.ai/) via a secure HTTP endpoint.

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

### Step 1 — Push to GitHub
Make sure the `mcp-server/` folder is committed and pushed to your repository.

### Step 2 — Create a new Web Service on Render

1. Go to [https://dashboard.render.com](https://dashboard.render.com)
2. Click **New** → **Web Service**
3. Connect your GitHub repository

### Step 3 — Configure the service

| Setting | Value |
|---------|-------|
| **Name** | `student-mcp-server` (or any name) |
| **Root Directory** | `mcp-server` |
| **Environment** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | Free (or higher for production) |

### Step 4 — Set Environment Variables

In Render's **Environment** tab, add:

| Key | Value |
|-----|-------|
| `BACKEND_API_URL` | `https://your-existing-backend.onrender.com` |
| `MCP_API_KEY` | `<your-strong-random-secret>` |

> ⚠️ **Never commit your `.env` file or the actual `MCP_API_KEY` value to Git.**

### Step 5 — Verify deployment

After deploy completes:
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
  "backend": "https://your-existing-backend.onrender.com"
}
```

---

## Connecting Devin AI

### In Devin's MCP Settings

Go to **Devin → Settings → MCP Servers → Add Custom Server** and enter:

**Configuration**:
```json
{
  "mcpServers": {
    "student-management": {
      "transport": {
        "type": "streamable-http",
        "url": "https://YOUR-MCP-SERVICE.onrender.com/mcp",
        "headers": {
          "Authorization": "Bearer YOUR_MCP_API_KEY"
        }
      }
    }
  }
}
```

Replace:
- `YOUR-MCP-SERVICE` → your actual Render service subdomain
- `YOUR_MCP_API_KEY` → the value you set for `MCP_API_KEY` on Render

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
