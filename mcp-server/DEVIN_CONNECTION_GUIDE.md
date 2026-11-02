# Devin CLI Connection Guide - Student Management MCP Server

## Overview

This guide explains how to connect Devin AI to the deployed Student Management MCP Server using the official MCP configuration format.

## Prerequisites

- MCP server deployed on Render (see `DEPLOYMENT_GUIDE.md`)
- Your MCP service URL (e.g., `https://student-mcp-server.onrender.com`)
- Your `MCP_API_KEY` (the value you set in Render environment variables)

## Method 1: Command-Line Configuration (Recommended)

### Step 1: Add the MCP Server

Run the following command in your terminal:

```bash
devin mcp add student-management https://YOUR-MCP-SERVICE.onrender.com/mcp --headers "Authorization: Bearer YOUR_MCP_API_KEY"
```

Replace:
- `YOUR-MCP-SERVICE.onrender.com` with your actual Render service URL
- `YOUR_MCP_API_KEY` with the MCP_API_KEY value from Render

### Step 2: Verify the Connection

List configured MCP servers:

```bash
devin mcp list
```

You should see `student-management` in the list.

### Step 3: Test the Connection

Ask Devin to list available MCP tools:

```
List all available MCP tools
```

Devin should respond with the 5 student management tools:
- `mcp__student-management__get_students`
- `mcp__student-management__search_student`
- `mcp__student-management__add_student`
- `mcp__student-management__update_student`
- `mcp__student-management__delete_student`

## Method 2: Configuration File (Alternative)

### Step 1: Choose Configuration Scope

**Project-level (shared with team):**
- File: `.devin/mcp_config.json`
- Commits to Git (but should not contain secrets)

**Local-only (gitignored, for personal keys):**
- File: `.devin/mcp_config.local.json`
- NOT committed to Git (recommended for API keys)

### Step 2: Create Configuration File

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
- `YOUR-MCP-SERVICE.onrender.com` with your actual Render service URL
- `YOUR_MCP_API_KEY` with the MCP_API_KEY value from Render

### Step 3: Restart Devin CLI

If Devin CLI is already running, restart it to load the new configuration.

## Example Configuration

If your MCP service is deployed at `https://student-mcp-server.onrender.com` and your API key is `44dcbb95755edbfa40c2c3d2f1c348514015d750a566594c0c5928987ca6eecf`, your configuration would be:

```json
{
  "mcpServers": {
    "student-management": {
      "url": "https://student-mcp-server.onrender.com/mcp",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer 44dcbb95755edbfa40c2c3d2f1c348514015d750a566594c0c5928987ca6eecf"
      }
    }
  }
}
```

## Using the MCP Tools

Once connected, you can use natural language to interact with the student management system:

### Example Prompts

**View all students:**
```
Show me all students in the system
```

**Add a new student:**
```
Add a new student named Rahul with student ID STU001, email rahul@example.com, department Computer Engineering, semester 3rd, and contact number +1234567890
```

**Search for a student:**
```
Find the student with ID STU001
```
or
```
Search for student named Rahul
```

**Update a student:**
```
Update the student with MongoDB ID 67f1a2b3c4d5e6f7g8h9i0j1: change department to Computer Science and semester to 4th
```

**Delete a student:**
```
Delete the student with MongoDB ID 67f1a2b3c4d5e6f7g8h9i0j1
```

Devin will ask for confirmation before executing the deletion.

## Permission Configuration (Optional)

You can pre-approve specific tools in your Devin config to avoid repeated approval prompts:

Add to `.devin/config.json` or `.devin/config.local.json`:

```json
{
  "permissions": {
    "allow": [
      "mcp__student-management__get_students",
      "mcp__student-management__search_student",
      "mcp__student-management__add_student",
      "mcp__student-management__update_student"
    ],
    "ask": [
      "mcp__student-management__delete_student"
    ]
  }
}
```

This configuration:
- Auto-approves read/write operations (get, search, add, update)
- Always asks for confirmation before delete operations

## Troubleshooting

### Tools Not Appearing

1. Verify the MCP server is running:
   ```bash
   curl https://YOUR-MCP-SERVICE.onrender.com/health
   ```

2. Check the MCP configuration:
   ```bash
   devin mcp list
   ```

3. Verify the MCP_API_KEY is correct

4. Check Render logs for MCP server errors

### Authentication Errors

**Error:** `401 Unauthorized` or `403 Forbidden`

**Solution:**
- Verify the `Authorization` header is correctly formatted
- Ensure the MCP_API_KEY matches what you set in Render
- Check that the header value is: `Bearer YOUR_MCP_API_KEY` (note the space after "Bearer")

### Connection Timeout

**Error:** `ETIMEDOUT` or connection refused

**Solution:**
- Verify the MCP service URL is correct
- Check that the MCP service is deployed and running on Render
- Ensure Render service is not in a suspended state

### Backend Unavailable

**Error:** MCP tools fail with "Backend service unavailable"

**Solution:**
- Verify the backend is running: `curl https://student-management-system-iqki.onrender.com/api/health`
- Check backend logs on Render
- Ensure the BACKEND_API_URL environment variable is set correctly in the MCP service

## Security Best Practices

1. **Never commit API keys to Git**
   - Use `.devin/mcp_config.local.json` for API keys (gitignored)
   - Use `.devin/mcp_config.json` for non-sensitive configuration only

2. **Rotate keys periodically**
   - Change MCP_API_KEY every 90 days
   - Update both Render and Devin configuration simultaneously

3. **Use strong, randomly generated keys**
   - Use `openssl rand -hex 32` or similar
   - Minimum 32 characters (64 hex characters)

4. **Monitor usage**
   - Check Render logs for unusual activity
   - Review MCP tool usage patterns

## Testing the Connection

After configuration, test with these prompts:

1. **List all students** - Should return student list or "No students found"
2. **Add a test student** - Should create successfully
3. **Search for the test student** - Should find the student
4. **Update the test student** - Should update successfully
5. **Delete the test student** - Should ask for confirmation, then delete

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Devin AI                              │
│  (You give natural language instructions)                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Streamable HTTP + Bearer Auth
                       │ Authorization: Bearer MCP_API_KEY
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              MCP Server (Render)                             │
│  https://student-mcp-server.onrender.com/mcp                 │
│  - POST /mcp (authenticated)                                  │
│  - GET /health (public)                                       │
│  - 5 MCP tools: get_students, search_student, add_student,   │
│    update_student, delete_student                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ REST API calls (axios)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│          Backend API (Render)                                │
│  https://student-management-system-iqki.onrender.com         │
│  - GET /api/students                                         │
│  - GET /api/students/:searchTerm                             │
│  - POST /api/students                                        │
│  - PUT /api/students/:id                                     │
│  - DELETE /api/students/:id                                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Mongoose ODM
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              MongoDB Atlas                                   │
│  (studentDB database, students collection)                  │
└─────────────────────────────────────────────────────────────┘
```

## Next Steps

After connecting Devin CLI:
1. Test all 5 MCP tools
2. Verify data persistence in MongoDB Atlas
3. Integrate into your workflow

For deployment instructions, see `DEPLOYMENT_GUIDE.md`.
For testing instructions, see `TESTING_REPORT.md`.
