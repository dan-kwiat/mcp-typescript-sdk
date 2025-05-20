import express from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { McpServer } from '../../server/mcp.js';
import { StreamableHTTPServerTransport } from '../../server/streamableHttp.js';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '../../server/auth/router.js';
import { requireBearerAuth } from '../../server/auth/middleware/bearerAuth.js';
import { isInitializeRequest } from '../../types.js';
import { InMemoryEventStore } from '../shared/inMemoryEventStore.js';
import { GenericOAuthProvider } from './genericOAuthProvider.js';
import { allowedMethods } from '../../server/auth/middleware/allowedMethods.js';
// ------------------------------------------------------------
// Configuration Parameters
// ------------------------------------------------------------
// Provider configuration - GitHub (active)
// const PROVIDER_ENV_PREFIX = 'GITHUB';
// const PROVIDER_DISPLAY_NAME = 'GitHub';
// const PROVIDER_ENV_DOCS = 'Create a GitHub OAuth App at https://github.com/settings/applications/new';
// const PROVIDER_CALLBACK_PATH = '/oauth/callback';
// const PROVIDER_SERVER_NAME = 'github-oauth-mcp-server';
// const PROVIDER_RESOURCE_NAME = 'MCP GitHub Demo Server';
// const PROVIDER_SCOPES = ['read:user', 'user:email'];
// const PROVIDER_SUCCESS_COLOR = '#4CAF50';
// const PROVIDER_ERROR_COLOR = '#F44336';
// const providerConfig: ProviderConfig = {
//     name: 'GitHub',
//     endpoints: {
//       authorizationUrl: 'https://github.com/login/oauth/authorize',
//       tokenUrl: 'https://github.com/login/oauth/access_token',
//       // GitHub doesn't use standard token revocation
//       revocationUrl: undefined,
//     },
//     api: {
//       baseUrl: 'https://api.github.com',
//       userInfoEndpoint: '/user',
//       authHeaderFormat: 'token'
//     },
//     auth: {
//       // Will use GITHUB_CLIENT_ID from environment
//       // Will use GITHUB_CLIENT_SECRET from environment
//       redirectUri: "http://localhost:3001/oauth/callback",
//       scopes: ['read:user', 'user:email'],
//       tokenExchangeMethod: 'body'
//     }
//   }
// Provider configuration - Spotify (commented out)
const PROVIDER_ENV_PREFIX = 'SPOTIFY';
const PROVIDER_DISPLAY_NAME = 'Spotify';
const PROVIDER_ENV_DOCS = 'Create a Spotify App at https://developer.spotify.com/dashboard/applications';
const PROVIDER_CALLBACK_PATH = '/oauth/callback';
const PROVIDER_SERVER_NAME = 'spotify-oauth-mcp-server';
const PROVIDER_RESOURCE_NAME = 'MCP Spotify Demo Server';
const PROVIDER_SCOPES = ['user-read-private', 'user-read-email', 'user-top-read', 'user-read-recently-played'];
const PROVIDER_SUCCESS_COLOR = '#1DB954';
const PROVIDER_ERROR_COLOR = '#E22134';
const providerConfig = {
    name: 'Spotify',
    endpoints: {
        authorizationUrl: 'https://accounts.spotify.com/authorize',
        tokenUrl: 'https://accounts.spotify.com/api/token',
        // Spotify doesn't have standard token revocation
        revocationUrl: undefined,
    },
    api: {
        baseUrl: 'https://api.spotify.com/v1',
        userInfoEndpoint: '/me',
        authHeaderFormat: 'Bearer'
    },
    auth: {
        // Will use SPOTIFY_CLIENT_ID from environment
        // Will use SPOTIFY_CLIENT_SECRET from environment
        redirectUri: "http://127.0.0.1:3001/oauth/callback",
        scopes: ['user-read-private', 'user-read-email', 'user-top-read', 'user-read-recently-played'],
        tokenExchangeMethod: 'basic'
    }
};
const provider = new GenericOAuthProvider(providerConfig);
// ------------------------------------------------------------
// End of Configuration Parameters
// ------------------------------------------------------------
// Check for required environment variables
if (!process.env[`${PROVIDER_ENV_PREFIX}_CLIENT_ID`] || !process.env[`${PROVIDER_ENV_PREFIX}_CLIENT_SECRET`]) {
    console.error(`Error: ${PROVIDER_ENV_PREFIX}_CLIENT_ID and ${PROVIDER_ENV_PREFIX}_CLIENT_SECRET environment variables must be set.`);
    console.error(PROVIDER_ENV_DOCS);
    console.error(`Then run with: ${PROVIDER_ENV_PREFIX}_CLIENT_ID=xxx ${PROVIDER_ENV_PREFIX}_CLIENT_SECRET=yyy node dist/examples/server/simpleStreamableHttpGeneric.js`);
    process.exit(1);
}
// Create an MCP server with implementation details
const getServer = () => {
    const server = new McpServer({
        name: PROVIDER_SERVER_NAME,
        version: '1.0.0',
    }, { capabilities: { logging: {} } });
    // Register a simple tool that returns a greeting
    server.tool('greet', 'A simple greeting tool', {
        name: z.string().describe('Name to greet'),
    }, async ({ name }) => {
        return {
            content: [
                {
                    type: 'text',
                    text: `Hello, ${name}!`,
                },
            ],
        };
    });
    server.tool('get-user-info', 'Get the authenticated user profile', {}, async (_, extra) => {
        const auth = extra.authInfo;
        console.log('get-user-info tool called with auth:', auth ? 'has auth' : 'no auth');
        const mcpServerToken = auth === null || auth === void 0 ? void 0 : auth.token;
        if (mcpServerToken) {
            try {
                const thirdPartyAuthHeader = await provider.getThirdPartyAuthHeader(mcpServerToken);
                const formattedEndpoint = providerConfig.api.userInfoEndpoint.startsWith('/')
                    ? providerConfig.api.userInfoEndpoint
                    : `/${providerConfig.api.userInfoEndpoint}`;
                const response = await fetch(`${providerConfig.api.baseUrl}${formattedEndpoint}`, {
                    headers: {
                        'Authorization': thirdPartyAuthHeader,
                        'Accept': 'application/json',
                    },
                });
                if (!response.ok) {
                    throw new Error(`${providerConfig.name} API request failed: ${response.status}`);
                }
                const userInfo = await response.json();
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Your ${userInfo.login} profile:\n\n${JSON.stringify(userInfo, null, 2)}`,
                        },
                    ],
                };
            }
            catch (error) {
                console.error('Error making Spotify API request:', error);
            }
        }
        return {
            content: [
                {
                    type: 'text',
                    text: 'No authenticated Spotify user found.',
                },
            ],
        };
    });
    return server;
};
const MCP_PORT = 3000;
const AUTH_PORT = 3001;
const app = express();
app.use(express.json());
// Create auth middleware for MCP endpoints
const mcpServerUrl = new URL(`http://localhost:${MCP_PORT}`);
const authServerUrl = new URL(`http://localhost:${AUTH_PORT}`);
// Create separate auth server app
const authApp = express();
authApp.use(express.json());
// Add OAuth routes to the auth server
authApp.use(mcpAuthRouter({
    provider,
    issuerUrl: authServerUrl,
    scopesSupported: PROVIDER_SCOPES,
    protectedResourceOptions: {
        serverUrl: mcpServerUrl,
        resourceName: PROVIDER_RESOURCE_NAME,
    },
    // Configure rate limits for dynamic client registration
    clientRegistrationOptions: {
        rateLimit: {
            max: 100, // Allow more client registrations
            windowMs: 60 * 60 * 1000 // 1 hour window
        }
    }
}));
// Log all incoming requests to the auth server for debugging
authApp.use((req, res, next) => {
    console.log(`AUTH SERVER ${req.method} ${req.path}`, req.query);
    next();
});
// Add OAuth callback handler
authApp.get(PROVIDER_CALLBACK_PATH, async (req, res) => {
    try {
        const code = req.query.code;
        const state = req.query.state;
        if (!code || !state) {
            res.status(400).send('Missing required parameters');
            return;
        }
        // Let the provider handle the OAuth callback
        const redirectUrl = await provider.handleCallback(code, state);
        // Show a success page before redirecting (helps with user experience)
        res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Successful</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          .success { color: ${PROVIDER_SUCCESS_COLOR}; font-size: 24px; margin-bottom: 20px; }
          .redirecting { color: #666; margin-bottom: 30px; }
        </style>
        <meta http-equiv="refresh" content="2;url=${redirectUrl}">
      </head>
      <body>
        <div class="success">✅ ${PROVIDER_DISPLAY_NAME} Authentication Successful</div>
        <div class="redirecting">Redirecting back to your application...</div>
        <p>If you are not redirected automatically, <a href="${redirectUrl}">click here</a>.</p>
      </body>
      </html>
    `);
    }
    catch (error) {
        console.error(`Error handling ${PROVIDER_DISPLAY_NAME} callback:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Error</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          .error { color: ${PROVIDER_ERROR_COLOR}; font-size: 24px; margin-bottom: 20px; }
          .message { color: #666; margin-bottom: 30px; }
        </style>
      </head>
      <body>
        <div class="error">❌ Authentication Error</div>
        <div class="message">${errorMessage}</div>
        <p>Please try again or contact support if the problem persists.</p>
      </body>
      </html>
    `);
    }
});
// Start the auth server
authApp.listen(AUTH_PORT, () => {
    console.log(`OAuth Authorization Server listening on port ${AUTH_PORT}`);
});
// Add both resource metadata and oauth server metadata (for backwards compatiblity) to the main MCP server
app.use(mcpAuthRouter({
    provider,
    issuerUrl: authServerUrl,
    scopesSupported: PROVIDER_SCOPES,
    protectedResourceOptions: {
        serverUrl: mcpServerUrl,
        resourceName: PROVIDER_RESOURCE_NAME,
    },
}));
// Set up the auth middleware to verify tokens
const authMiddleware = requireBearerAuth({
    provider,
    requiredScopes: PROVIDER_SCOPES,
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpServerUrl),
});
// Debug middleware to log all requests to the main server
app.use((req, res, next) => {
    console.log(`MCP SERVER ${req.method} ${req.path}`, req.headers['mcp-session-id']);
    next();
});
// Map to store transports by session ID
const transports = {};
// MCP POST endpoint with auth
const mcpPostHandler = async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    console.log('Received MCP request:', req.body);
    if (req.auth) {
        // Log user info if available
        // @ts-ignore
        const userIdentifier = ((_b = (_a = req.auth) === null || _a === void 0 ? void 0 : _a.extra) === null || _b === void 0 ? void 0 : _b.user_identifier) || ((_e = (_d = (_c = req.auth) === null || _c === void 0 ? void 0 : _c.extra) === null || _d === void 0 ? void 0 : _d.user) === null || _e === void 0 ? void 0 : _e.display_name) || ((_h = (_g = (_f = req.auth) === null || _f === void 0 ? void 0 : _f.extra) === null || _g === void 0 ? void 0 : _g.user) === null || _h === void 0 ? void 0 : _h.login) || ((_l = (_k = (_j = req.auth) === null || _j === void 0 ? void 0 : _j.extra) === null || _k === void 0 ? void 0 : _k.user) === null || _l === void 0 ? void 0 : _l.id) || 'unknown';
        console.log(`Authenticated ${PROVIDER_DISPLAY_NAME} user:`, userIdentifier);
    }
    try {
        // Check for existing session ID
        const sessionId = req.headers['mcp-session-id'];
        let transport;
        if (sessionId && transports[sessionId]) {
            // Reuse existing transport
            transport = transports[sessionId];
        }
        else if (!sessionId && isInitializeRequest(req.body)) {
            // New initialization request
            const eventStore = new InMemoryEventStore();
            transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => randomUUID(),
                eventStore, // Enable resumability
                onsessioninitialized: (sessionId) => {
                    // Store the transport by session ID when session is initialized
                    console.log(`Session initialized with ID: ${sessionId}`);
                    transports[sessionId] = transport;
                }
            });
            // Set up onclose handler to clean up transport when closed
            transport.onclose = () => {
                const sid = transport.sessionId;
                if (sid && transports[sid]) {
                    console.log(`Transport closed for session ${sid}, removing from transports map`);
                    delete transports[sid];
                }
            };
            // Connect the transport to the MCP server BEFORE handling the request
            const server = getServer();
            await server.connect(transport);
            // Auth info will be automatically passed to tool handlers via the request context
            await transport.handleRequest(req, res, req.body);
            return; // Already handled
        }
        else {
            // Invalid request - no session ID or not initialization request
            res.status(400).json({
                jsonrpc: '2.0',
                error: {
                    code: -32000,
                    message: 'Bad Request: No valid session ID provided',
                },
                id: null,
            });
            return;
        }
        // Handle the request with existing transport
        // Auth info will be passed automatically via the request object
        await transport.handleRequest(req, res, req.body);
    }
    catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error',
                },
                id: null,
            });
        }
    }
};
// Set up routes with auth middleware
app.options('/mcp', allowedMethods(['GET', 'POST', 'DELETE']));
app.post('/mcp', authMiddleware, mcpPostHandler);
// Handle GET requests for SSE streams (using built-in support from StreamableHTTP)
const mcpGetHandler = async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const sessionId = req.headers['mcp-session-id'];
    if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
    }
    if (req.auth) {
        // Log user info if available
        // @ts-ignore
        const userIdentifier = ((_b = (_a = req.auth) === null || _a === void 0 ? void 0 : _a.extra) === null || _b === void 0 ? void 0 : _b.user_identifier) || ((_e = (_d = (_c = req.auth) === null || _c === void 0 ? void 0 : _c.extra) === null || _d === void 0 ? void 0 : _d.user) === null || _e === void 0 ? void 0 : _e.display_name) || ((_h = (_g = (_f = req.auth) === null || _f === void 0 ? void 0 : _f.extra) === null || _g === void 0 ? void 0 : _g.user) === null || _h === void 0 ? void 0 : _h.login) || ((_l = (_k = (_j = req.auth) === null || _j === void 0 ? void 0 : _j.extra) === null || _k === void 0 ? void 0 : _k.user) === null || _l === void 0 ? void 0 : _l.id) || 'unknown';
        console.log(`Authenticated SSE connection from ${PROVIDER_DISPLAY_NAME} user:`, userIdentifier);
    }
    // Check for Last-Event-ID header for resumability
    const lastEventId = req.headers['last-event-id'];
    if (lastEventId) {
        console.log(`Client reconnecting with Last-Event-ID: ${lastEventId}`);
    }
    else {
        console.log(`Establishing new SSE stream for session ${sessionId}`);
    }
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
};
// Set up GET route with auth middleware
app.get('/mcp', authMiddleware, mcpGetHandler);
// Handle DELETE requests for session termination (according to MCP spec)
const mcpDeleteHandler = async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
    }
    console.log(`Received session termination request for session ${sessionId}`);
    try {
        const transport = transports[sessionId];
        await transport.handleRequest(req, res);
    }
    catch (error) {
        console.error('Error handling session termination:', error);
        if (!res.headersSent) {
            res.status(500).send('Error processing session termination');
        }
    }
};
// Set up DELETE route with auth middleware
app.delete('/mcp', authMiddleware, mcpDeleteHandler);
app.listen(MCP_PORT, () => {
    console.log(`MCP Streamable HTTP Server with ${PROVIDER_DISPLAY_NAME} OAuth listening on port ${MCP_PORT}`);
    console.log(`Visit http://localhost:${AUTH_PORT}/.well-known/oauth-authorization-server to confirm auth server is working`);
    console.log(`${PROVIDER_DISPLAY_NAME} OAuth callback URL should be configured as: http://localhost:${AUTH_PORT}${PROVIDER_CALLBACK_PATH}`);
    console.log(`Make sure this matches the callback URL in your ${PROVIDER_DISPLAY_NAME} OAuth App settings`);
});
// Handle server shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    // Close all active transports to properly clean up resources
    for (const sessionId in transports) {
        try {
            console.log(`Closing transport for session ${sessionId}`);
            await transports[sessionId].close();
            delete transports[sessionId];
        }
        catch (error) {
            console.error(`Error closing transport for session ${sessionId}:`, error);
        }
    }
    console.log('Server shutdown complete');
    process.exit(0);
});
//# sourceMappingURL=simpleStreamableHttpGeneric.js.map