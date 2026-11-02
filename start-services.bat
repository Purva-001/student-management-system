@echo off
title Student Management MCP Services Launcher
echo ========================================================
echo  Starting Student Management MCP Services
echo ========================================================
echo.

echo 1. Launching Local Docker Execution Agent on port 4000...
start "Local Docker Agent (Port 4000)" cmd /k "cd /d %~dp0local-agent && node dist/index.js"

timeout /t 2 /nobreak >nul

echo 2. Launching Remote MCP Server on port 3001...
start "Remote MCP Server (Port 3001)" cmd /k "cd /d %~dp0mcp-server && node src/index.js"

echo.
echo ========================================================
echo  Both services have been opened in separate windows!
echo  - Local Agent: http://127.0.0.1:4000
echo  - MCP Server : http://localhost:3001/mcp
echo ========================================================
echo.
pause
