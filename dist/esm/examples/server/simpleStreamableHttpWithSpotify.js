// import express, { Request, Response } from 'express';
// import { randomUUID } from 'node:crypto';
// import { z } from 'zod';
// import { McpServer } from '../../server/mcp.js';
// import { StreamableHTTPServerTransport } from '../../server/streamableHttp.js';
// import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '../../server/auth/router.js';
// import { requireBearerAuth } from '../../server/auth/middleware/bearerAuth.js';
// import { CallToolResult, GetPromptResult, isInitializeRequest, ReadResourceResult } from '../../types.js';
// import { InMemoryEventStore } from '../shared/inMemoryEventStore.js';
// import { createSpotifyProvider, GenericOAuthProvider } from './genericOAuthProvider.js';
// import { allowedMethods } from '../../server/auth/middleware/allowedMethods.js';
export {};
// // Check for required environment variables
// if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
//   console.error('Error: SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables must be set.');
//   console.error('Create a Spotify App at https://developer.spotify.com/dashboard/applications');
//   console.error('Then run with: SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=yyy node dist/examples/server/simpleStreamableHttpWithSpotify.js');
//   process.exit(1);
// }
// // Create an MCP server with implementation details
// const getServer = () => {
//   const server = new McpServer({
//     name: 'spotify-oauth-mcp-server',
//     version: '1.0.0',
//   }, { capabilities: { logging: {} } });
//   // Register a simple tool that returns a greeting
//   server.tool(
//     'greet',
//     'A simple greeting tool',
//     {
//       name: z.string().describe('Name to greet'),
//     },
//     async ({ name }): Promise<CallToolResult> => {
//       return {
//         content: [
//           {
//             type: 'text',
//             text: `Hello, ${name}!`,
//           },
//         ],
//       };
//     }
//   );
//   return server;
// };
// const MCP_PORT = 3000;
// const AUTH_PORT = 3001;
// const app = express();
// app.use(express.json());
// // Set up OAuth with Spotify provider using our generic implementation
// const provider = createSpotifyProvider();
// // Create auth middleware for MCP endpoints
// const mcpServerUrl = new URL(`http://localhost:${MCP_PORT}`);
// const authServerUrl = new URL(`http://localhost:${AUTH_PORT}`);
// // Create separate auth server app
// const authApp = express();
// authApp.use(express.json());
// // Add OAuth routes to the auth server
// authApp.use(mcpAuthRouter({
//   provider,
//   issuerUrl: authServerUrl,
//   scopesSupported: ['user-read-private', 'user-read-email', 'user-top-read', 'user-read-recently-played'],
//   protectedResourceOptions: {
//     serverUrl: mcpServerUrl,
//     resourceName: 'MCP Spotify Demo Server',
//   },
//   // Configure rate limits for dynamic client registration
//   clientRegistrationOptions: {
//     rateLimit: {
//       max: 100, // Allow more client registrations
//       windowMs: 60 * 60 * 1000 // 1 hour window
//     }
//   }
// }));
// // Log all incoming requests to the auth server for debugging
// authApp.use((req, res, next) => {
//   console.log(`AUTH SERVER ${req.method} ${req.path}`, req.query);
//   next();
// });
// // Add Spotify callback handler
// authApp.get('/oauth/callback', async (req, res) => {
//   try {
//     const code = req.query.code as string;
//     const state = req.query.state as string;
//     if (!code || !state) {
//       res.status(400).send('Missing required parameters');
//       return;
//     }
//     // Let the provider handle the Spotify callback
//     const redirectUrl = await provider.handleCallback(code, state);
//     // Show a success page before redirecting
//     res.send(`
//       <!DOCTYPE html>
//       <html>
//       <head>
//         <title>Authentication Successful</title>
//         <style>
//           body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
//           .success { color: #1DB954; font-size: 24px; margin-bottom: 20px; }
//           .redirecting { color: #666; margin-bottom: 30px; }
//         </style>
//         <meta http-equiv="refresh" content="2;url=${redirectUrl}">
//       </head>
//       <body>
//         <div class="success">✅ Spotify Authentication Successful</div>
//         <div class="redirecting">Redirecting back to your application...</div>
//         <p>If you are not redirected automatically, <a href="${redirectUrl}">click here</a>.</p>
//       </body>
//       </html>
//     `);
//   } catch (error: unknown) {
//     console.error('Error handling Spotify callback:', error);
//     const errorMessage = error instanceof Error ? error.message : String(error);
//     res.status(500).send(`
//       <!DOCTYPE html>
//       <html>
//       <head>
//         <title>Authentication Error</title>
//         <style>
//           body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
//           .error { color: #E22134; font-size: 24px; margin-bottom: 20px; }
//           .message { color: #666; margin-bottom: 30px; }
//         </style>
//       </head>
//       <body>
//         <div class="error">❌ Authentication Error</div>
//         <div class="message">${errorMessage}</div>
//         <p>Please try again or contact support if the problem persists.</p>
//       </body>
//       </html>
//     `);
//   }
// });
// // Start the auth server
// authApp.listen(AUTH_PORT, () => {
//   console.log(`OAuth Authorization Server listening on port ${AUTH_PORT}`);
// });
// // Add both resource metadata and oauth server metadata (for backwards compatiblity) to the main MCP server
// app.use(mcpAuthRouter({
//   provider,
//   issuerUrl: authServerUrl,
//   scopesSupported: ['user-read-private', 'user-read-email', 'user-top-read', 'user-read-recently-played'],
//   protectedResourceOptions: {
//     serverUrl: mcpServerUrl,
//     resourceName: 'MCP Spotify Demo Server',
//   },
// }));
// // Set up the auth middleware to verify tokens
// const authMiddleware = requireBearerAuth({
//   provider,
//   requiredScopes: ['user-read-private', 'user-read-email', 'user-top-read', 'user-read-recently-played'],
//   resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpServerUrl),
// });
// // Debug middleware to log all requests to the main server
// app.use((req, res, next) => {
//   console.log(`MCP SERVER ${req.method} ${req.path}`, req.headers['mcp-session-id']);
//   next();
// });
// // Map to store transports by session ID
// const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};
// // MCP POST endpoint with auth
// const mcpPostHandler = async (req: Request, res: Response) => {
//   console.log('Received MCP request:', req.body);
//   if (req.auth) {
//     // Log Spotify user info if available
//     // @ts-ignore
//     const spotifyUser = req.auth?.extra?.user_identifier || req.auth?.extra?.user?.display_name || req.auth?.extra?.user?.id || 'unknown';
//     console.log('Authenticated Spotify user:', spotifyUser);
//   }
//   try {
//     // Check for existing session ID
//     const sessionId = req.headers['mcp-session-id'] as string | undefined;
//     let transport: StreamableHTTPServerTransport;
//     if (sessionId && transports[sessionId]) {
//       // Reuse existing transport
//       transport = transports[sessionId];
//     } else if (!sessionId && isInitializeRequest(req.body)) {
//       // New initialization request
//       const eventStore = new InMemoryEventStore();
//       transport = new StreamableHTTPServerTransport({
//         sessionIdGenerator: () => randomUUID(),
//         eventStore, // Enable resumability
//         onsessioninitialized: (sessionId) => {
//           // Store the transport by session ID when session is initialized
//           console.log(`Session initialized with ID: ${sessionId}`);
//           transports[sessionId] = transport;
//         }
//       });
//       // Set up onclose handler to clean up transport when closed
//       transport.onclose = () => {
//         const sid = transport.sessionId;
//         if (sid && transports[sid]) {
//           console.log(`Transport closed for session ${sid}, removing from transports map`);
//           delete transports[sid];
//         }
//       };
//       // Connect the transport to the MCP server BEFORE handling the request
//       const server = getServer();
//       await server.connect(transport);
//       // Auth info will be automatically passed to tool handlers via the request context
//       await transport.handleRequest(req, res, req.body);
//       return; // Already handled
//     } else {
//       // Invalid request - no session ID or not initialization request
//       res.status(400).json({
//         jsonrpc: '2.0',
//         error: {
//           code: -32000,
//           message: 'Bad Request: No valid session ID provided',
//         },
//         id: null,
//       });
//       return;
//     }
//     // Handle the request with existing transport
//     // Auth info will be passed automatically via the request object
//     await transport.handleRequest(req, res, req.body);
//   } catch (error) {
//     console.error('Error handling MCP request:', error);
//     if (!res.headersSent) {
//       res.status(500).json({
//         jsonrpc: '2.0',
//         error: {
//           code: -32603,
//           message: 'Internal server error',
//         },
//         id: null,
//       });
//     }
//   }
// };
// // Set up routes with auth middleware
// app.options('/mcp', allowedMethods(['GET', 'POST', 'DELETE']));
// app.post('/mcp', authMiddleware, mcpPostHandler);
// // Handle GET requests for SSE streams (using built-in support from StreamableHTTP)
// const mcpGetHandler = async (req: Request, res: Response) => {
//   const sessionId = req.headers['mcp-session-id'] as string | undefined;
//   if (!sessionId || !transports[sessionId]) {
//     res.status(400).send('Invalid or missing session ID');
//     return;
//   }
//   if (req.auth) {
//     // Log Spotify user info if available
//     // @ts-ignore
//     const spotifyUser = req.auth?.extra?.user_identifier || req.auth?.extra?.user?.display_name || req.auth?.extra?.user?.id || 'unknown';
//     console.log('Authenticated SSE connection from Spotify user:', spotifyUser);
//   }
//   // Check for Last-Event-ID header for resumability
//   const lastEventId = req.headers['last-event-id'] as string | undefined;
//   if (lastEventId) {
//     console.log(`Client reconnecting with Last-Event-ID: ${lastEventId}`);
//   } else {
//     console.log(`Establishing new SSE stream for session ${sessionId}`);
//   }
//   const transport = transports[sessionId];
//   await transport.handleRequest(req, res);
// };
// // Set up GET route with auth middleware
// app.get('/mcp', authMiddleware, mcpGetHandler);
// // Handle DELETE requests for session termination (according to MCP spec)
// const mcpDeleteHandler = async (req: Request, res: Response) => {
//   const sessionId = req.headers['mcp-session-id'] as string | undefined;
//   if (!sessionId || !transports[sessionId]) {
//     res.status(400).send('Invalid or missing session ID');
//     return;
//   }
//   console.log(`Received session termination request for session ${sessionId}`);
//   try {
//     const transport = transports[sessionId];
//     await transport.handleRequest(req, res);
//   } catch (error) {
//     console.error('Error handling session termination:', error);
//     if (!res.headersSent) {
//       res.status(500).send('Error processing session termination');
//     }
//   }
// };
// // Set up DELETE route with auth middleware
// app.delete('/mcp', authMiddleware, mcpDeleteHandler);
// app.listen(MCP_PORT, () => {
//   console.log(`MCP Streamable HTTP Server with Spotify OAuth listening on port ${MCP_PORT}`);
//   console.log(`Visit http://localhost:${AUTH_PORT}/.well-known/oauth-authorization-server to confirm auth server is working`);
//   console.log(`Spotify OAuth callback URL should be configured as: http://localhost:${AUTH_PORT}/oauth/callback`);
//   console.log(`Make sure this matches the callback URL in your Spotify Application settings`);
// });
// // Handle server shutdown
// process.on('SIGINT', async () => {
//   console.log('Shutting down server...');
//   // Close all active transports to properly clean up resources
//   for (const sessionId in transports) {
//     try {
//       console.log(`Closing transport for session ${sessionId}`);
//       await transports[sessionId].close();
//       delete transports[sessionId];
//     } catch (error) {
//       console.error(`Error closing transport for session ${sessionId}:`, error);
//     }
//   }
//   console.log('Server shutdown complete');
//   process.exit(0);
// });
//# sourceMappingURL=simpleStreamableHttpWithSpotify.js.map