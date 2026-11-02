# Render Deployment Guide - Student Management MCP Server

## Overview

This guide provides step-by-step instructions for deploying the Student Management MCP Server to Render.com as a separate Web Service.

## Prerequisites

- Render.com account (free tier is sufficient)
- GitHub repository with the mcp-server folder committed
- Existing backend deployed at: `https://student-management-system-iqki.onrender.com`

## Step 1: Verify GitHub Repository

Ensure the `mcp-server/` folder is committed to your GitHub repository:

```bash
cd student-management-system-main
git add mcp-server/
git commit -m "Add MCP server for student management"
git push origin main
```

## Step 2: Create New Web Service on Render

1. Go to [https://dashboard.render.com](https://dashboard.render.com)
2. Click **New** → **Web Service**
3. Connect your GitHub repository (should be: `Purva-001/student-management-system`)

## Step 3: Configure the Service

Fill in the following settings:

| Setting | Value |
|---------|-------|
| **Name** | `student-mcp-server` (or your preferred name) |
| **Region** | Oregon (us-west) or closest to your backend |
| **Branch** | `main` |
| **Root Directory** | `mcp-server` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | `Free` (or higher for production) |

## Step 4: Set Environment Variables

In the **Environment** tab of your Render service, add the following environment variables:

| Key | Value | Notes |
|-----|-------|-------|
| `BACKEND_API_URL` | `https://student-management-system-iqki.onrender.com` | Your existing backend URL |
| `MCP_API_KEY` | `<generate-secure-key>` | See instructions below |
| `PORT` | `10000` | Optional - Render injects this automatically |

### Generating MCP_API_KEY

Generate a secure random key using one of these methods:

**Option 1: Using OpenSSL (recommended)**
```bash
openssl rand -hex 32
```

**Option 2: Using Node.js**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Option 3: Using Python**
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Copy the generated value and paste it as the `MCP_API_KEY` environment variable in Render.

**⚠️ IMPORTANT:** Save this key securely! You will need it to configure Devin CLI.

## Step 5: Deploy

Click **Create Web Service** and wait for deployment to complete (typically 2-3 minutes).

## Step 6: Verify Deployment

Once deployment is complete:

1. Copy your service URL from Render (e.g., `https://student-mcp-server.onrender.com`)
2. Test the health endpoint:

```bash
curl https://YOUR-MCP-SERVICE.onrender.com/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "student-management-mcp",
  "version": "1.0.0",
  "timestamp": "2026-11-02T05:00:00.000Z",
  "backend": "https://student-management-system-iqki.onrender.com"
}
```

3. Test the MCP endpoint (requires authentication):

```bash
curl -X POST https://YOUR-MCP-SERVICE.onrender.com/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

## Step 7: Record Deployment Details

Save the following information for the next steps:

- **MCP Service URL**: `https://YOUR-MCP-SERVICE.onrender.com`
- **MCP Endpoint**: `https://YOUR-MCP-SERVICE.onrender.com/mcp`
- **MCP_API_KEY**: `<the value you set in Render>`

## Troubleshooting

### Build Fails

- Check that `package.json` exists in the `mcp-server/` folder
- Verify the Root Directory is set to `mcp-server`
- Review Render build logs for specific errors

### Server Crashes on Startup

- Verify `BACKEND_API_URL` is set correctly
- Verify `MCP_API_KEY` is set
- Check Render logs for error messages

### 401 Unauthorized on MCP Endpoint

- Ensure `Authorization: Bearer <MCP_API_KEY>` header is present
- Verify the token matches what you set in Render

### Backend Connection Errors

- Verify the backend URL is accessible
- Check that the backend is running
- Review MCP server logs in Render

## Architecture After Deployment

```
Devin AI
  │
  │ Streamable HTTP + Bearer Auth
  ▼
MCP Server (Render)
  │
  │ REST API calls
  ▼
Backend API (Render)
  │
  │ Mongoose
  ▼
MongoDB Atlas
```

## Next Steps

After successful deployment, proceed to:
1. Configure Devin CLI to connect to the MCP server
2. Run end-to-end testing
3. Verify all 5 tools work correctly

See `DEVIN_CONNECTION_GUIDE.md` for detailed instructions.
