# Architecture - Student Management MCP Server

## System Overview

The Student Management MCP Server acts as a secure bridge between Devin AI and the existing Student Management System backend. It exposes MCP (Model Context Protocol) tools while leveraging the existing REST API for all data operations.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Devin AI User                                │
│  (Natural language commands: "Add student", "Search for student")    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               │ Streamable HTTP + Bearer Authentication
                               │ Authorization: Bearer MCP_API_KEY
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Devin CLI (mcp_config.local.json)                       │
│  {                                                                   │
│    "mcpServers": {                                                   │
│      "student-management": {                                         │
│        "url": "https://student-mcp-server.onrender.com/mcp",        │
│        "transport": "http",                                          │
│        "headers": {                                                  │
│          "Authorization": "Bearer YOUR_MCP_API_KEY"                   │
│        }                                                             │
│      }                                                               │
│    }                                                                 │
│  }                                                                   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               │ HTTPS POST (JSON-RPC 2.0)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  MCP Server (Render Web Service)                     │
│  https://student-mcp-server.onrender.com                            │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Express.js Server (src/index.js)                             │  │
│  │  - POST /mcp (authenticated)                                 │  │
│  │  - GET /health (public)                                      │  │
│  └──────────────────────┬───────────────────────────────────────┘  │
│                           │                                           │
│  ┌───────────────────────▼───────────────────────────────────────┐  │
│  │  Auth Middleware (src/auth.js)                                 │  │
│  │  - Bearer token validation                                    │  │
│  │  - Timing-safe comparison                                     │  │
│  │  - Returns 401/403 on failure                                 │  │
│  └───────────────────────┬───────────────────────────────────────┘  │
│                           │                                           │
│  ┌───────────────────────▼───────────────────────────────────────┐  │
│  │  MCP Server Factory (src/mcpServer.js)                        │  │
│  │  - McpServer instance (SDK v1.12.1)                           │  │
│  │  - StreamableHTTPServerTransport                              │  │
│  │  - 5 MCP Tools:                                               │  │
│  │    1. get_students                                            │  │
│  │    2. search_student                                          │  │
│  │    3. add_student                                             │  │
│  │    4. update_student                                          │  │
│  │    5. delete_student (requires confirm=true)                  │  │
│  └───────────────────────┬───────────────────────────────────────┘  │
│                           │                                           │
│  ┌───────────────────────▼───────────────────────────────────────┐  │
│  │  API Client (src/apiClient.js)                                │  │
│  │  - Axios instance with 15s timeout                            │  │
│  │  - baseURL: BACKEND_API_URL                                    │  │
│  │  - Request/response interceptors                              │  │
│  │  - Error normalization                                        │  │
│  └───────────────────────┬───────────────────────────────────────┘  │
└───────────────────────────┼───────────────────────────────────────┘
                            │
                            │ REST API Calls (axios)
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│           Backend API (Render Web Service)                          │
│  https://student-management-system-iqki.onrender.com                 │
│                                                                      │
│  Express.js + Mongoose                                               │
│                                                                      │
│  Endpoints:                                                          │
│  - GET /api/health                                                   │
│  - GET /api/students                                                 │
│  - GET /api/students/:searchTerm                                     │
│  - POST /api/students                                                │
│  - PUT /api/students/:id                                             │
│  - DELETE /api/students/:id                                          │
│                                                                      │
│  Models:                                                             │
│  - Student (studentId, fullName, email, department,                 │
│    semester, contactNumber, timestamps)                              │
└───────────────────────────┼───────────────────────────────────────┘
                            │
                            │ Mongoose ODM
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    MongoDB Atlas                                    │
│  - Cluster: student-cluster (M0 Free Tier)                          │
│  - Database: studentDB                                             │
│  - Collection: students                                            │
│  - Authentication: SCRAM (username/password)                       │
│  - Network Access: 0.0.0.0/0 (development)                          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    React Frontend (Netlify)                          │
│  https://student-management-system-seven-lovat.vercel.app/          │
│  - Directly uses Backend API (bypasses MCP server)                  │
│  - Remains unchanged by MCP integration                              │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow Examples

### Example 1: Get All Students

```
User: "Show me all students"
  ↓
Devin CLI: Calls mcp__student-management__get_students
  ↓
MCP Server: Receives JSON-RPC request
  ↓
Auth Middleware: Validates Bearer token
  ↓
MCP Server: Executes get_students tool
  ↓
API Client: GET https://backend.onrender.com/api/students
  ↓
Backend: Query MongoDB (Student.find())
  ↓
MongoDB: Returns student documents
  ↓
Backend: JSON response { success: true, data: [...] }
  ↓
API Client: Normalizes response
  ↓
MCP Server: Formats as text, returns to Devin
  ↓
Devin CLI: Displays student list to user
```

### Example 2: Add Student

```
User: "Add student named Rahul with ID STU001..."
  ↓
Devin CLI: Calls mcp__student-management__add_student with Zod-validated args
  ↓
MCP Server: Receives request, validates with Zod schema
  ↓
Auth Middleware: Validates Bearer token
  ↓
MCP Server: Executes add_student tool
  ↓
API Client: POST https://backend.onrender.com/api/students
  ↓
Backend: Validates duplicates (studentId, email)
  ↓
Backend: Creates document in MongoDB
  ↓
MongoDB: Returns new document with _id
  ↓
Backend: JSON response { success: true, data: {...} }
  ↓
API Client: Normalizes response
  ↓
MCP Server: Formats success message with student details
  ↓
Devin CLI: Displays confirmation to user
```

### Example 3: Delete Student (with Confirmation)

```
User: "Delete student with ID 67f1a2b3..."
  ↓
Devin CLI: Calls mcp__student-management__delete_student with confirm=false
  ↓
MCP Server: Receives request
  ↓
MCP Server: Sees confirm=false, returns warning prompt
  ↓
Devin CLI: Displays warning to user: "Are you sure you want to delete?"
  ↓
User: "Yes, delete it"
  ↓
Devin CLI: Calls mcp__student-management__delete_student with confirm=true
  ↓
MCP Server: Receives request with confirm=true
  ↓
API Client: DELETE https://backend.onrender.com/api/students/:id
  ↓
Backend: Deletes document from MongoDB
  ↓
MongoDB: Removes document
  ↓
Backend: JSON response { success: true, message: "Student deleted" }
  ↓
MCP Server: Returns success message
  ↓
Devin CLI: Displays confirmation to user
```

## Security Layers

### Layer 1: Devin CLI Authentication
- Bearer token in mcp_config.local.json
- Token stored locally, gitignored
- User controls token rotation

### Layer 2: MCP Server Authentication
- Bearer token validation on every request
- Timing-safe comparison (prevents timing attacks)
- Returns 401 for missing auth, 403 for invalid token
- MCP_API_KEY stored in Render environment variables

### Layer 3: Input Validation
- Zod schemas for all tool inputs
- Type checking (string, email, boolean)
- Required field validation
- Email format validation
- Minimum length validation

### Layer 4: Backend Validation
- Mongoose schema validation
- Unique constraints (studentId, email)
- Required field enforcement
- Data type enforcement

### Layer 5: Error Handling
- No stack traces exposed to clients
- No MongoDB URIs in responses
- Generic error messages
- HTTP status codes (400, 404, 500)

## Environment Variables

### MCP Server (Render)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `BACKEND_API_URL` | ✅ Yes | URL of existing backend | `https://student-management-system-iqki.onrender.com` |
| `MCP_API_KEY` | ✅ Yes | Bearer token for MCP clients | `44dcbb95755edbfa40c2c3d2f1c348514015d750a566594c0c5928987ca6eecf` |
| `PORT` | Auto | Port to listen on (injected by Render) | `10000` |

### Backend (Render)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `MONGODB_URI` | ✅ Yes | MongoDB Atlas connection string | `mongodb+srv://user:pass@cluster/db` |
| `PORT` | Auto | Port to listen on | `5000` |
| `NODE_ENV` | No | Environment mode | `production` |

### Frontend (Netlify)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `VITE_API_URL` | ✅ Yes | Backend API URL | `https://student-management-system-iqki.onrender.com` |

## Technology Stack

### MCP Server
- **Runtime:** Node.js
- **Framework:** Express.js 4.18.2
- **MCP SDK:** @modelcontextprotocol/sdk 1.12.1
- **HTTP Client:** Axios 1.6.2
- **Validation:** Zod 3.24.4
- **Environment:** dotenv 16.3.1
- **Transport:** Streamable HTTP
- **Hosting:** Render (Free tier)

### Backend
- **Runtime:** Node.js
- **Framework:** Express.js 4.18.2
- **Database ODM:** Mongoose 8.0.3
- **Database:** MongoDB Atlas
- **Hosting:** Render

### Frontend
- **Framework:** React 18.2.0
- **Build Tool:** Vite 5.0.8
- **HTTP Client:** Axios 1.6.2
- **Hosting:** Netlify

## Deployment Topology

```
Production Environment:
├── Frontend (Netlify)
│   └── Direct access to Backend API
│
├── Backend (Render)
│   └── Direct access to MongoDB Atlas
│
└── MCP Server (Render) - NEW
    └── Access to Backend API (via REST)
    └── Accessed by Devin CLI (via MCP)
```

## Communication Protocols

### Devin CLI ↔ MCP Server
- **Protocol:** HTTP/1.1
- **Transport:** Streamable HTTP (SSE fallback supported)
- **Authentication:** Bearer token
- **Format:** JSON-RPC 2.0
- **Content-Type:** application/json

### MCP Server ↔ Backend
- **Protocol:** HTTPS
- **Authentication:** None (public API)
- **Format:** REST JSON
- **Content-Type:** application/json

### Backend ↔ MongoDB
- **Protocol:** MongoDB Wire Protocol
- **Authentication:** SCRAM (username/password)
- **Encryption:** TLS/SSL
- **Connection:** MongoDB Node.js Driver

## Failure Modes

### MCP Server Unavailable
- Devin CLI receives connection error
- User sees "MCP server unavailable" message
- Frontend continues to work (uses backend directly)

### Backend Unavailable
- MCP server returns "Backend service unavailable" error
- API client timeout (15 seconds)
- Frontend affected (uses same backend)

### MongoDB Unavailable
- Backend returns database error
- MCP server normalizes to "Backend error"
- Frontend affected (uses same backend)

### Authentication Failure
- MCP server returns 401/403
- Devin CLI displays auth error
- User must verify MCP_API_KEY

## Scalability Considerations

### Current Design (Free Tier)
- Single instance per service
- Stateless per-request pattern
- No session persistence
- Suitable for low-to-medium traffic

### Future Enhancements (Paid Tier)
- Horizontal scaling (multiple instances)
- Load balancing
- Redis caching layer
- Connection pooling
- Rate limiting
- Request queuing

## Monitoring Points

### MCP Server
- Health endpoint (/health)
- Request/response logging
- Error rate tracking
- Authentication failures
- Backend response times

### Backend
- Health endpoint (/api/health)
- MongoDB connection status
- API response times
- Error rate tracking

### MongoDB Atlas
- Connection metrics
- Query performance
- Storage usage
- Index efficiency

## Security Checklist

- ✅ Bearer token authentication
- ✅ Timing-safe token comparison
- ✅ No credentials in code
- ✅ Environment variables for secrets
- ✅ .env files in .gitignore
- ✅ No stack traces in responses
- ✅ No MongoDB URIs exposed
- ✅ Input validation (Zod + Mongoose)
- ✅ Delete confirmation mechanism
- ✅ HTTPS for all external connections
- ⏳ Rate limiting (recommended for production)
- ⏳ Request ID tracing (recommended for production)
- ⏳ Structured logging (recommended for production)

---

**Document Version:** 1.0
**Last Updated:** 2026-11-02
**Author:** Devin AI Assistant
