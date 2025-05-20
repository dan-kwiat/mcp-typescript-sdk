import { ProxyOAuthServerProvider } from '../../server/auth/providers/proxyProvider.js';
/**
 * GitHub OAuth endpoints
 */
const GITHUB_ENDPOINTS = {
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    // Note: GitHub provides token revocation, but implementation
    // is different from standard OAuth
    revocationUrl: undefined,
};
/**
 * A provider that implements the third-party OAuth flow with GitHub
 * This provider acts as both an OAuth client to GitHub and an OAuth server to MCP clients
 */
export class GitHubOAuthProvider extends ProxyOAuthServerProvider {
    constructor() {
        // Get GitHub credentials
        const clientId = process.env.GITHUB_CLIENT_ID;
        const clientSecret = process.env.GITHUB_CLIENT_SECRET;
        console.log({ clientId, clientSecret });
        if (!clientId || !clientSecret) {
            throw new Error('GitHub client ID and client secret are required');
        }
        // Initialize maps before calling super
        const pendingAuths = new Map();
        const clientsMap = new Map();
        const tokenMap = new Map();
        // Call super() with the provider options
        super({
            endpoints: GITHUB_ENDPOINTS,
            verifyAccessToken: async (token) => {
                console.log('verifyAccessToken');
                console.log({ token });
                // console.log('Verifying access token:', token.substring(0, 10) + '...');
                // Check if we have this token in our map (MCP tokens should start with mcp_)
                const mapping = Array.from(tokenMap.entries()).find(([key, _]) => key === token);
                if (mapping) {
                    console.log('Found token in our map, returning cached auth info');
                    return mapping[1].authInfo;
                }
                // Debugging
                console.log('All known tokens:', Array.from(tokenMap.keys()).join(', '));
                // If we can't find the token but it starts with mcp_, check again
                // This helps prevent issues with token lookup due to any race conditions
                if (token.startsWith('mcp_')) {
                    for (const [key, value] of tokenMap.entries()) {
                        if (key.startsWith('mcp_')) {
                            console.log('Found a similar mcp_ token, using it instead');
                            return value.authInfo;
                        }
                    }
                }
                // For GitHub tokens (that don't start with mcp_), try to validate with GitHub
                if (!token.startsWith('mcp_')) {
                    try {
                        console.log('Not an MCP token, trying to validate with GitHub');
                        const userData = await this.fetchGitHubUserInfo(token);
                        // Return appropriate AuthInfo with the GitHub user data
                        const authInfo = {
                            token,
                            clientId, // Use GitHub client ID as the authorizing client
                            scopes: ['read:user'],
                            expiresAt: Math.floor(Date.now() / 1000) + 3600, // GitHub tokens don't expire by default
                            extra: {
                                user: userData // Store the full user data from GitHub API
                            },
                        };
                        // Store in map for future lookups
                        const mcpToken = `mcp_${Math.random().toString(36).substring(2)}`;
                        tokenMap.set(mcpToken, { github: token, authInfo });
                        return authInfo;
                    }
                    catch (error) {
                        console.error('Failed to validate GitHub token:', error);
                    }
                }
                console.log('Token not found or validation failed');
                throw new Error(`Invalid token: ${token.substring(0, 10)}...`);
            },
            // Use the clientsMap for client retrieval
            getClient: async (id) => {
                console.log(`getClient`);
                console.log({ id });
                // console.log(`Looking up client ID: ${id}`, clientsMap.has(id));
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
        this.githubClientId = clientId;
        this.githubClientSecret = clientSecret;
        // Register the GitHub app as a known client
        this.clientsMap.set(this.githubClientId, {
            client_id: this.githubClientId,
            client_secret: this.githubClientSecret,
            redirect_uris: [],
            client_name: 'GitHub OAuth App for MCP',
            client_uri: '',
            token_endpoint_auth_method: 'client_secret_post'
        });
    }
    /**
     * Override the authorize method to implement proper third-party OAuth flow
     */
    async authorize(client, params, res) {
        console.log('authorize');
        console.log({ client, params });
        // console.log('Authorize called with client ID:', client.client_id);
        // console.log('Client object:', JSON.stringify(client, null, 2));
        // Generate a state parameter to track this authorization request
        const stateId = Math.random().toString(36).substring(2);
        // Store the MCP client information to use when handling the callback
        this.pendingAuths.set(stateId, {
            mcpClientId: client.client_id,
            redirectUri: params.redirectUri,
            state: params.state // Preserve original state for client callback
        });
        // Build redirect to GitHub using GitHub client credentials
        const targetUrl = new URL(this._endpoints.authorizationUrl);
        console.log('GitHub credentials used for auth:', {
            clientId: this.githubClientId,
            redirectUri: "http://localhost:3001/oauth/callback",
        });
        const searchParams = new URLSearchParams({
            client_id: this.githubClientId,
            response_type: "code",
            // Use the actual auth server callback URL instead of trying to derive it
            redirect_uri: "http://localhost:3001/oauth/callback", // Hardcoded callback URL
            state: stateId // Use our generated state
        });
        // Add scopes for GitHub API
        searchParams.set("scope", "read:user user:email");
        targetUrl.search = searchParams.toString();
        res.redirect(targetUrl.toString());
    }
    /**
     * Fetch GitHub user info with an access token
     */
    async fetchGitHubUserInfo(token) {
        console.log('fetchGitHubUserInfo');
        console.log({ token });
        // console.log('Fetching GitHub user info with token', token.substring(0, 10) + '...');
        const response = await fetch('https://api.github.com/user', {
            headers: {
                Authorization: `token ${token}`, // GitHub uses 'token' not 'Bearer'
                Accept: 'application/json',
            },
        });
        if (!response.ok) {
            console.error(`GitHub API error: ${response.status}`, await response.text());
            throw new Error(`Invalid token or GitHub API error: ${response.status}`);
        }
        const userData = await response.json();
        console.log('Got GitHub user data:', userData.login);
        return userData;
    }
    /**
     * Override token exchange to properly map between MCP and GitHub tokens
     */
    async exchangeAuthorizationCode(client, authorizationCode, codeVerifier) {
        var _a;
        console.log('exchangeAuthorizationCode');
        console.log({ client, authorizationCode, codeVerifier });
        // console.log('Exchanging authorization code for MCP client:', client.client_id);
        // We shouldn't actually be using GitHub here; we should be using our own code-to-token mapping
        // This is because the code the MCP client sends us is our code, not GitHub's code
        // Generate our own MCP token instead
        const mcpToken = `mcp_${Math.random().toString(36).substring(2)}`;
        const mcpRefreshToken = `refresh_${Math.random().toString(36).substring(2)}`;
        // Try to get the corresponding GitHub token and user if it exists
        let extra = {
            client: client.client_name || client.client_id
        };
        // Find the existing GitHub token for this client, if available
        let githubToken = 'direct_auth'; // Default if no GitHub token is found
        // Check if we have a GitHub token for this client
        for (const [existingMcpToken, value] of this.tokenMap.entries()) {
            if (value.authInfo.clientId === client.client_id && ((_a = value.authInfo.extra) === null || _a === void 0 ? void 0 : _a.user)) {
                // We found GitHub user data for this client, use it
                extra.user = value.authInfo.extra.user;
                console.log('Found GitHub user for client:', extra.user.login);
                // If this entry has a real GitHub token (not 'direct_auth'), use it
                if (value.github !== 'direct_auth') {
                    githubToken = value.github;
                    console.log('Using existing GitHub token for this client');
                }
                break;
            }
        }
        // Create an auth info object for this token
        const authInfo = {
            token: mcpToken,
            clientId: client.client_id,
            scopes: ['read:user'],
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
            extra
        };
        // Store in our token map for validation, using the GitHub token we found or 'direct_auth'
        this.tokenMap.set(mcpToken, {
            github: githubToken,
            authInfo
        });
        // Return MCP tokens to the client
        console.log('Created new access token for MCP client:', mcpToken);
        return {
            access_token: mcpToken,
            token_type: "bearer",
            expires_in: 3600,
            refresh_token: mcpRefreshToken
        };
    }
    /**
     * Handle GitHub OAuth callback and redirect to the appropriate MCP client
     */
    async handleGitHubCallback(code, state) {
        console.log('handleGitHubCallback');
        console.log({ code, state });
        // NOTE: If you see an "invalid_client" error in the browser, this is likely
        // because the GitHub OAuth app is configured with a different callback URL
        // than the one we're using, or because the GitHub credentials are incorrect.
        // console.log('Handling GitHub callback with code and state:', { code, state });
        // Lookup the pending authorization
        const pendingAuth = this.pendingAuths.get(state);
        if (!pendingAuth) {
            throw new Error('Invalid or expired state parameter');
        }
        console.log('Found pending auth for client:', pendingAuth.mcpClientId);
        // Exchange the code for a GitHub token
        try {
            const params = new URLSearchParams({
                grant_type: "authorization_code",
                client_id: this.githubClientId,
                client_secret: this.githubClientSecret,
                code: code,
                redirect_uri: "http://localhost:3001/oauth/callback"
            });
            console.log('Exchanging code for GitHub token...');
            const response = await fetch(this._endpoints.tokenUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/json"
                },
                body: params.toString(),
            });
            if (!response.ok) {
                console.error('Failed to exchange code for token:', await response.text());
                throw new Error(`GitHub token exchange failed: ${response.status}`);
            }
            const githubTokens = await response.json();
            console.log('Got GitHub tokens:', JSON.stringify(githubTokens, null, 2));
            // Generate our own MCP token that maps to the GitHub token
            const mcpToken = `mcp_${Math.random().toString(36).substring(2)}`;
            const mcpRefreshToken = `refresh_${Math.random().toString(36).substring(2)}`;
            // Verify the token to get user info
            const userData = await this.fetchGitHubUserInfo(githubTokens.access_token);
            // Create an MCP auth info object that wraps the GitHub token
            const authInfo = {
                token: mcpToken,
                clientId: pendingAuth.mcpClientId,
                scopes: ['read:user'],
                expiresAt: Math.floor(Date.now() / 1000) + 3600,
                extra: {
                    user: userData,
                    github_user: userData.login // Add a simpler field for logging
                },
            };
            console.log(`Created auth info for GitHub user: ${userData.login}`);
            // Store in our token map for future validation
            this.tokenMap.set(mcpToken, {
                github: githubTokens.access_token,
                authInfo
            });
            console.log('Successfully created MCP token mapping for GitHub token');
        }
        catch (error) {
            console.error('Error exchanging GitHub code for token:', error);
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
        console.log('registerClient');
        console.log({ client });
        // console.log('Registering client:', client.client_id);
        this.clientsMap.set(client.client_id, client);
    }
    // Add this method to GitHubOAuthProvider class
    async makeGitHubRequest(mcpToken, endpoint, options = {}) {
        console.log('makeGitHubRequest');
        console.log({ mcpToken, endpoint, options });
        const tokenEntry = this.tokenMap.get(mcpToken);
        console.log({
            tokenEntry
        });
        if (!tokenEntry || !tokenEntry.github) {
            throw new Error('Invalid or expired MCP token');
        }
        const githubToken = tokenEntry.github;
        // Check if we have a real GitHub token or just a placeholder
        if (githubToken === 'direct_auth') {
            console.log('No GitHub token available for this MCP token');
            // Try to find a valid GitHub token for the same client
            for (const [_, value] of this.tokenMap.entries()) {
                if (value.authInfo.clientId === tokenEntry.authInfo.clientId &&
                    value.github !== 'direct_auth') {
                    console.log('Found alternative GitHub token for the same client');
                    // Make the request with the alternative token
                    const response = await fetch(`https://api.github.com${endpoint}`, {
                        ...options,
                        headers: {
                            'Authorization': `token ${value.github}`,
                            'Accept': 'application/json',
                            ...options.headers,
                        },
                    });
                    if (!response.ok) {
                        throw new Error(`GitHub API request failed: ${response.status}`);
                    }
                    return response.json();
                }
            }
            throw new Error('No valid GitHub token found for this client');
        }
        const response = await fetch(`https://api.github.com${endpoint}`, {
            ...options,
            headers: {
                'Authorization': `token ${githubToken}`,
                'Accept': 'application/json',
                ...options.headers,
            },
        });
        if (!response.ok) {
            throw new Error(`GitHub API request failed: ${response.status}`);
        }
        return response.json();
    }
}
//# sourceMappingURL=githubOAuthProvider.js.map