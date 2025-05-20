import { ProxyOAuthServerProvider } from '../../server/auth/providers/proxyProvider.js';
/**
 * A generic OAuth provider that can be configured to work with different providers
 * This provider acts as both an OAuth client to the external provider and an OAuth server to MCP clients
 */
export class GenericOAuthProvider extends ProxyOAuthServerProvider {
    constructor(config) {
        // Get provider credentials either from config or environment variables
        const clientIdKey = `${config.name.toUpperCase()}_CLIENT_ID`;
        const clientSecretKey = `${config.name.toUpperCase()}_CLIENT_SECRET`;
        const clientId = config.auth.clientId || process.env[clientIdKey];
        const clientSecret = config.auth.clientSecret || process.env[clientSecretKey];
        if (!clientId || !clientSecret) {
            throw new Error(`${config.name} client ID and client secret are required. Set them in the configuration or as environment variables ${clientIdKey} and ${clientSecretKey}`);
        }
        // Initialize maps before calling super
        const pendingAuths = new Map();
        const clientsMap = new Map();
        const tokenMap = new Map();
        // Call super() with the provider options
        super({
            endpoints: config.endpoints,
            verifyAccessToken: async (token) => {
                console.log(`${config.name}: verifyAccessToken`, { token: token.substring(0, 10) + '...' });
                // Check if we have this token in our map (MCP tokens should start with mcp_)
                const mapping = Array.from(tokenMap.entries()).find(([key, _]) => key === token);
                if (mapping) {
                    console.log(`Found token in our map, returning cached auth info`);
                    return mapping[1].authInfo;
                }
                // If we can't find the token but it starts with mcp_, check again
                if (token.startsWith('mcp_')) {
                    for (const [key, value] of tokenMap.entries()) {
                        if (key.startsWith('mcp_')) {
                            console.log('Found a similar mcp_ token, using it instead');
                            return value.authInfo;
                        }
                    }
                }
                // For provider tokens (that don't start with mcp_), try to validate with provider
                if (!token.startsWith('mcp_')) {
                    try {
                        console.log(`Not an MCP token, trying to validate with ${config.name}`);
                        const userData = await this.fetchUserInfo(token);
                        // Return appropriate AuthInfo with the user data
                        const authInfo = {
                            token,
                            clientId, // Use provider client ID as the authorizing client
                            scopes: config.auth.scopes,
                            expiresAt: Math.floor(Date.now() / 1000) + 3600, // Default to 1 hour expiration
                            extra: {
                                user: userData // Store the full user data from provider API
                            },
                        };
                        // Store in map for future lookups
                        const mcpToken = `mcp_${Math.random().toString(36).substring(2)}`;
                        tokenMap.set(mcpToken, { provider: token, authInfo });
                        return authInfo;
                    }
                    catch (error) {
                        console.error(`Failed to validate ${config.name} token:`, error);
                    }
                }
                console.log('Token not found or validation failed');
                throw new Error(`Invalid token: ${token.substring(0, 10)}...`);
            },
            // Use the clientsMap for client retrieval
            getClient: async (id) => {
                console.log(`${config.name}: getClient`, { id });
                // For dynamically registered MCP clients, we need to always return a valid client
                // to allow the auth flow to continue, so we'll create one if it doesn't exist
                if (!clientsMap.has(id) && id !== clientId) {
                    console.log('Creating client on demand:', id);
                    const newClient = {
                        client_id: id,
                        redirect_uris: ["http://127.0.0.1:10000/auth-callback"], // Add the callback URI that the client is using
                        client_name: `MCP Client ${id}`,
                        client_uri: '',
                        token_endpoint_auth_method: 'none'
                    };
                    clientsMap.set(id, newClient);
                    return newClient;
                }
                return clientsMap.get(id);
            },
        });
        // Now we can safely use 'this' after the super() call
        this.pendingAuths = pendingAuths;
        this.clientsMap = clientsMap;
        this.tokenMap = tokenMap;
        this.providerClientId = clientId;
        this.providerClientSecret = clientSecret;
        this.config = config;
        // Register the provider app as a known client
        this.clientsMap.set(this.providerClientId, {
            client_id: this.providerClientId,
            client_secret: this.providerClientSecret,
            redirect_uris: [],
            client_name: `${config.name} OAuth App for MCP`,
            client_uri: '',
            token_endpoint_auth_method: 'client_secret_post'
        });
    }
    /**
     * Override the authorize method to implement proper third-party OAuth flow
     */
    async authorize(client, params, res) {
        console.log(`${this.config.name}: authorize`, { clientId: client.client_id });
        // Generate a state parameter to track this authorization request
        const stateId = Math.random().toString(36).substring(2);
        // Store the MCP client information to use when handling the callback
        this.pendingAuths.set(stateId, {
            mcpClientId: client.client_id,
            redirectUri: params.redirectUri,
            state: params.state // Preserve original state for client callback
        });
        // Build redirect to provider using provider client credentials
        const targetUrl = new URL(this._endpoints.authorizationUrl);
        console.log(`${this.config.name} credentials used for auth:`, {
            clientId: this.providerClientId,
            redirectUri: this.config.auth.redirectUri,
        });
        const searchParams = new URLSearchParams({
            client_id: this.providerClientId,
            response_type: "code",
            redirect_uri: this.config.auth.redirectUri,
            state: stateId // Use our generated state
        });
        // Add scopes for provider API
        searchParams.set("scope", this.config.auth.scopes.join(" "));
        targetUrl.search = searchParams.toString();
        res.redirect(targetUrl.toString());
    }
    /**
     * Fetch user info with an access token
     */
    async fetchUserInfo(token) {
        console.log(`${this.config.name}: fetchUserInfo`, { token: token.substring(0, 10) + '...' });
        // Determine the correct authorization header format
        let authHeader;
        switch (this.config.api.authHeaderFormat) {
            case 'Bearer':
                authHeader = `Bearer ${token}`;
                break;
            case 'token':
                authHeader = `token ${token}`;
                break;
            case 'Basic':
                authHeader = `Basic ${Buffer.from(`${this.providerClientId}:${this.providerClientSecret}`).toString('base64')}`;
                break;
            default:
                authHeader = `Bearer ${token}`;
        }
        const response = await fetch(`${this.config.api.baseUrl}${this.config.api.userInfoEndpoint}`, {
            headers: {
                Authorization: authHeader,
                Accept: 'application/json',
            },
        });
        if (!response.ok) {
            console.error(`${this.config.name} API error: ${response.status}`, await response.text());
            throw new Error(`Invalid token or ${this.config.name} API error: ${response.status}`);
        }
        const userData = await response.json();
        // Log using a common user identifier (display_name, login, or id)
        const userIdentifier = userData.display_name || userData.login || userData.id || 'Unknown user';
        console.log(`Got ${this.config.name} user data: ${userIdentifier}`);
        return userData;
    }
    /**
     * Override token exchange to properly map between MCP and provider tokens
     */
    async exchangeAuthorizationCode(client, authorizationCode, codeVerifier) {
        var _a;
        console.log(`${this.config.name}: exchangeAuthorizationCode`, { clientId: client.client_id });
        // Generate our own MCP token
        const mcpToken = `mcp_${Math.random().toString(36).substring(2)}`;
        const mcpRefreshToken = `refresh_${Math.random().toString(36).substring(2)}`;
        // Try to get the corresponding provider token and user if it exists
        let extra = {
            client: client.client_name || client.client_id
        };
        // Default if no provider token is found
        let providerToken = 'direct_auth';
        // Check if we have a provider token for this client
        for (const [existingMcpToken, value] of this.tokenMap.entries()) {
            if (value.authInfo.clientId === client.client_id && ((_a = value.authInfo.extra) === null || _a === void 0 ? void 0 : _a.user)) {
                // We found provider user data for this client, use it
                extra.user = value.authInfo.extra.user;
                // Get user identifier for logging
                const userIdentifier = extra.user.display_name || extra.user.login || extra.user.id || 'Unknown user';
                console.log(`Found ${this.config.name} user for client: ${userIdentifier}`);
                // If this entry has a real provider token (not 'direct_auth'), use it
                if (value.provider !== 'direct_auth') {
                    providerToken = value.provider;
                    console.log(`Using existing ${this.config.name} token for this client`);
                }
                break;
            }
        }
        // Create an auth info object for this token
        const authInfo = {
            token: mcpToken,
            clientId: client.client_id,
            scopes: this.config.auth.scopes,
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
            extra
        };
        // Store in our token map for validation
        this.tokenMap.set(mcpToken, {
            provider: providerToken,
            authInfo
        });
        // Return MCP tokens to the client
        console.log('Created new access token for MCP client:', mcpToken.substring(0, 10) + '...');
        return {
            access_token: mcpToken,
            token_type: "bearer",
            expires_in: 3600,
            refresh_token: mcpRefreshToken
        };
    }
    /**
     * Handle OAuth callback and redirect to the appropriate MCP client
     */
    async handleCallback(code, state) {
        console.log(`${this.config.name}: handleCallback`, { code: code.substring(0, 10) + '...', state });
        // Lookup the pending authorization
        const pendingAuth = this.pendingAuths.get(state);
        if (!pendingAuth) {
            throw new Error('Invalid or expired state parameter');
        }
        console.log('Found pending auth for client:', pendingAuth.mcpClientId);
        // Exchange the code for a provider token
        try {
            // Prepare headers and body for token exchange based on provider configuration
            const headers = {
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json"
            };
            const params = new URLSearchParams({
                grant_type: "authorization_code",
                code: code,
                redirect_uri: this.config.auth.redirectUri
            });
            // Add client credentials based on exchange method
            if (this.config.auth.tokenExchangeMethod === 'basic') {
                // Use Basic auth (Spotify style)
                const credentials = Buffer.from(`${this.providerClientId}:${this.providerClientSecret}`).toString('base64');
                headers["Authorization"] = `Basic ${credentials}`;
            }
            else {
                // Add credentials to body (GitHub style)
                params.append("client_id", this.providerClientId);
                params.append("client_secret", this.providerClientSecret);
            }
            console.log(`Exchanging code for ${this.config.name} token...`);
            const response = await fetch(this._endpoints.tokenUrl, {
                method: "POST",
                headers,
                body: params.toString(),
            });
            if (!response.ok) {
                console.error('Failed to exchange code for token:', await response.text());
                throw new Error(`${this.config.name} token exchange failed: ${response.status}`);
            }
            const providerTokens = await response.json();
            console.log(`Got ${this.config.name} tokens with expires_in:`, providerTokens.expires_in || 'not specified');
            // Generate our own MCP token that maps to the provider token
            const mcpToken = `mcp_${Math.random().toString(36).substring(2)}`;
            const mcpRefreshToken = `refresh_${Math.random().toString(36).substring(2)}`;
            // Verify the token to get user info
            const userData = await this.fetchUserInfo(providerTokens.access_token);
            // Create an MCP auth info object that wraps the provider token
            const authInfo = {
                token: mcpToken,
                clientId: pendingAuth.mcpClientId,
                scopes: this.config.auth.scopes,
                expiresAt: Math.floor(Date.now() / 1000) + (providerTokens.expires_in || 3600),
                extra: {
                    user: userData,
                    // Add a simpler field for logging with a common user identifier
                    user_identifier: userData.display_name || userData.login || userData.id
                },
            };
            const userIdentifier = userData.display_name || userData.login || userData.id || 'Unknown user';
            console.log(`Created auth info for ${this.config.name} user: ${userIdentifier}`);
            // Store in our token map for future validation
            this.tokenMap.set(mcpToken, {
                provider: providerTokens.access_token,
                authInfo
            });
            console.log(`Successfully created MCP token mapping for ${this.config.name} token`);
        }
        catch (error) {
            console.error(`Error exchanging ${this.config.name} code for token:`, error);
            // We'll still redirect the user, but the client won't be able to get a valid token
        }
        // Remove from pending to prevent replay
        this.pendingAuths.delete(state);
        // Build the redirect URL for the MCP client
        const redirectUrl = new URL(pendingAuth.redirectUri);
        redirectUrl.searchParams.set('code', code);
        // Include original state if it was provided
        if (pendingAuth.state) {
            redirectUrl.searchParams.set('state', pendingAuth.state);
        }
        console.log('Redirecting to MCP client:', redirectUrl.toString());
        return redirectUrl.toString();
    }
    /**
     * Register a client with our provider
     */
    registerClient(client) {
        console.log(`${this.config.name}: registerClient`, { clientId: client.client_id });
        this.clientsMap.set(client.client_id, client);
    }
    async getThirdPartyAuthHeader(mcpToken) {
        const tokenEntry = this.tokenMap.get(mcpToken);
        if (!tokenEntry || !tokenEntry.provider) {
            throw new Error('Invalid or expired MCP token');
        }
        // Validate that the provider token is not an MCP token
        if (tokenEntry.provider.startsWith('mcp_')) {
            throw new Error('Invalid provider token format');
        }
        // Determine the correct authorization header format
        let authHeader;
        switch (this.config.api.authHeaderFormat) {
            case 'Bearer':
                authHeader = `Bearer ${tokenEntry.provider}`;
                break;
            case 'token':
                authHeader = `token ${tokenEntry.provider}`;
                break;
            case 'Basic':
                authHeader = `Basic ${Buffer.from(`${this.providerClientId}:${this.providerClientSecret}`).toString('base64')}`;
                break;
            default:
                authHeader = `Bearer ${tokenEntry.provider}`;
        }
        return authHeader;
    }
    /**
     * Make a request to the provider API using an MCP token
     */
    async makeProviderRequest(mcpToken, endpoint, options = {}) {
        console.log(`${this.config.name}: makeProviderRequest`, {
            mcpToken: mcpToken.substring(0, 10) + '...',
            endpoint
        });
        const tokenEntry = this.tokenMap.get(mcpToken);
        if (!tokenEntry || !tokenEntry.provider) {
            throw new Error('Invalid or expired MCP token');
        }
        const providerToken = tokenEntry.provider;
        // Check if we have a real provider token or just a placeholder
        if (providerToken === 'direct_auth') {
            console.log(`No ${this.config.name} token available for this MCP token`);
            // Try to find a valid provider token for the same client
            for (const [_, value] of this.tokenMap.entries()) {
                if (value.authInfo.clientId === tokenEntry.authInfo.clientId &&
                    value.provider !== 'direct_auth') {
                    console.log(`Found alternative ${this.config.name} token for the same client`);
                    // Make the request with the alternative token
                    return this.makeAuthenticatedRequest(value.provider, endpoint, options);
                }
            }
            throw new Error(`No valid ${this.config.name} token found for this client`);
        }
        return this.makeAuthenticatedRequest(providerToken, endpoint, options);
    }
    /**
     * Helper method to make an authenticated request to the provider API
     */
    async makeAuthenticatedRequest(token, endpoint, options = {}) {
        // Determine the correct authorization header format
        let authHeader;
        switch (this.config.api.authHeaderFormat) {
            case 'Bearer':
                authHeader = `Bearer ${token}`;
                break;
            case 'token':
                authHeader = `token ${token}`;
                break;
            case 'Basic':
                authHeader = `Basic ${Buffer.from(`${this.providerClientId}:${this.providerClientSecret}`).toString('base64')}`;
                break;
            default:
                authHeader = `Bearer ${token}`;
        }
        // Make sure endpoint has the right format (with or without leading slash)
        const formattedEndpoint = endpoint.startsWith('/')
            ? endpoint
            : `/${endpoint}`;
        const response = await fetch(`${this.config.api.baseUrl}${formattedEndpoint}`, {
            ...options,
            headers: {
                'Authorization': authHeader,
                'Accept': 'application/json',
                ...options.headers,
            },
        });
        if (!response.ok) {
            throw new Error(`${this.config.name} API request failed: ${response.status}`);
        }
        return response.json();
    }
}
// /**
//  * Helper function to create a Spotify OAuth provider using the generic implementation
//  */
// export function createSpotifyProvider(): GenericOAuthProvider {
//   return new GenericOAuthProvider({
//     name: 'Spotify',
//     endpoints: {
//       authorizationUrl: 'https://accounts.spotify.com/authorize',
//       tokenUrl: 'https://accounts.spotify.com/api/token',
//       // Spotify doesn't have standard token revocation
//       revocationUrl: undefined,
//     },
//     api: {
//       baseUrl: 'https://api.spotify.com/v1',
//       userInfoEndpoint: '/me',
//       authHeaderFormat: 'Bearer'
//     },
//     auth: {
//       // Will use SPOTIFY_CLIENT_ID from environment
//       // Will use SPOTIFY_CLIENT_SECRET from environment
//       redirectUri: "http://127.0.0.1:3001/oauth/callback",
//       scopes: ['user-read-private', 'user-read-email', 'user-top-read', 'user-read-recently-played'],
//       tokenExchangeMethod: 'basic'
//     }
//   });
// }
// /**
//  * Helper function to create a GitHub OAuth provider using the generic implementation
//  */
// export function createGitHubProvider(): GenericOAuthProvider {
//   return new GenericOAuthProvider({
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
//   });
// }
//# sourceMappingURL=genericOAuthProvider.js.map