#!/usr/bin/env node
// Phase 7A — Agent Zero interoperability probe result (see donors.json).
console.log("SKIP/UNAVAILABLE: agent-zero direct MCP client verification");
console.log("Finding at pinned SHA b22a144: Agent Zero exposes itself as an MCP/A2A");
console.log("server (helpers/mcp_server.py via fastmcp) but has NO generic external");
console.log("MCP client capability (no ClientSession / stdio_client / fastmcp.Client");
console.log("outside server-side code). Classification: NO DIRECT MCP CLIENT.");
console.log("A bridge would be donor-side tooling, out of 7A scope (Phase 7 assessment §13).");
process.exit(0);
