import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";
import { registerMcp } from "./rest/mcp";
import { registerApi } from "./rest/routes";

const http = httpRouter();
authComponent.registerRoutes(http, createAuth, { cors: true });
// KisanMandi REST API under /api/v1 (see convex/rest/routes.ts).
registerApi(http);
// Personal MCP server for ChatGPT / Claude at /mcp (see convex/rest/mcp.ts).
registerMcp(http);
export default http;
