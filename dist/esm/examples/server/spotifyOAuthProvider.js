import { ProxyOAuthServerProvider } from '../../server/auth/providers/proxyProvider.js';
/**
 * Spotify OAuth endpoints
 */
const SPOTIFY_ENDPOINTS = {
    authorizationUrl: 'https://accounts.spotify.com/authorize',
    tokenUrl: 'https://accounts.spotify.com/api/token',
    revocationUrl: undefined, // Spotify doesn't have standard revocation
};
const REDIRECT_URI = "http://127.0.0.1:3001/oauth/callback"; // or localhost for github?
/**
 * A provider that implements the third-party OAuth flow with Spotify
 * This provider acts as both an OAuth client to Spotify and an OAuth server to MCP clients
 */
export class SpotifyOAuthProvider extends ProxyOAuthServerProvider {
    constructor() {
        // Get Spotify credentials
        const clientId = process.env.SPOTIFY_CLIENT_ID;
        const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
            throw new Error('Spotify client ID and client secret are required');
        }
        // Initialize maps before calling super
        const pendingAuths = new Map();
        const clientsMap = new Map();
        const tokenMap = new Map();
        // Call super() with the provider options
        super({
            endpoints: SPOTIFY_ENDPOINTS,
            verifyAccessToken: async (token) => {
                console.log('verifyAccessToken', { token: token.substring(0, 10) + '...' });
                // Check if we have this token in our map (MCP tokens should start with mcp_)
                const mapping = Array.from(tokenMap.entries()).find(([key, _]) => key === token);
                if (mapping) {
                    console.log('Found token in our map, returning cached auth info');
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
                // For Spotify tokens (that don't start with mcp_), try to validate with Spotify
                if (!token.startsWith('mcp_')) {
                    try {
                        console.log('Not an MCP token, trying to validate with Spotify');
                        const userData = await this.fetchSpotifyUserInfo(token);
                        // Return appropriate AuthInfo with the Spotify user data
                        const authInfo = {
                            token,
                            clientId, // Use Spotify client ID as the authorizing client
                            scopes: ['user-read-private', 'user-read-email', 'user-top-read', 'user-read-recently-played'],
                            expiresAt: Math.floor(Date.now() / 1000) + 3600, // Spotify tokens typically expire in 1 hour
                            extra: {
                                user: userData // Store the full user data from Spotify API
                            },
                        };
                        // Store in map for future lookups
                        const mcpToken = `mcp_${Math.random().toString(36).substring(2)}`;
                        tokenMap.set(mcpToken, { spotify: token, authInfo });
                        return authInfo;
                    }
                    catch (error) {
                        console.error('Failed to validate Spotify token:', error);
                    }
                }
                console.log('Token not found or validation failed');
                throw new Error(`Invalid token: ${token.substring(0, 10)}...`);
            },
            // Use the clientsMap for client retrieval
            getClient: async (id) => {
                console.log('getClient', { id });
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
        this.spotifyClientId = clientId;
        this.spotifyClientSecret = clientSecret;
        // Register the Spotify app as a known client
        this.clientsMap.set(this.spotifyClientId, {
            client_id: this.spotifyClientId,
            client_secret: this.spotifyClientSecret,
            redirect_uris: [],
            client_name: 'Spotify OAuth App for MCP',
            client_uri: '',
            token_endpoint_auth_method: 'client_secret_post'
        });
    }
    /**
     * Override the authorize method to implement proper third-party OAuth flow
     */
    async authorize(client, params, res) {
        console.log('authorize', { clientId: client.client_id });
        // Generate a state parameter to track this authorization request
        const stateId = Math.random().toString(36).substring(2);
        // Store the MCP client information to use when handling the callback
        this.pendingAuths.set(stateId, {
            mcpClientId: client.client_id,
            redirectUri: params.redirectUri,
            state: params.state // Preserve original state for client callback
        });
        // Build redirect to Spotify using Spotify client credentials
        const targetUrl = new URL(this._endpoints.authorizationUrl);
        console.log('Spotify credentials used for auth:', {
            clientId: this.spotifyClientId,
            redirectUri: REDIRECT_URI,
        });
        const searchParams = new URLSearchParams({
            client_id: this.spotifyClientId,
            response_type: "code",
            redirect_uri: REDIRECT_URI,
            state: stateId // Use our generated state
        });
        // Add scopes for Spotify API
        searchParams.set("scope", "user-read-private user-read-email user-top-read user-read-recently-played");
        targetUrl.search = searchParams.toString();
        res.redirect(targetUrl.toString());
    }
    /**
     * Fetch Spotify user info with an access token
     */
    async fetchSpotifyUserInfo(token) {
        console.log('fetchSpotifyUserInfo', { token: token.substring(0, 10) + '...' });
        const response = await fetch('https://api.spotify.com/v1/me', {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
            },
        });
        if (!response.ok) {
            console.error(`Spotify API error: ${response.status}`, await response.text());
            throw new Error(`Invalid token or Spotify API error: ${response.status}`);
        }
        const userData = await response.json();
        console.log('Got Spotify user data:', userData.display_name || userData.id);
        return userData;
    }
    /**
     * Override token exchange to properly map between MCP and Spotify tokens
     */
    async exchangeAuthorizationCode(client, authorizationCode, codeVerifier) {
        var _a;
        console.log('exchangeAuthorizationCode', { clientId: client.client_id });
        // Generate our own MCP token
        const mcpToken = `mcp_${Math.random().toString(36).substring(2)}`;
        const mcpRefreshToken = `refresh_${Math.random().toString(36).substring(2)}`;
        // Try to get the corresponding Spotify token and user if it exists
        let extra = {
            client: client.client_name || client.client_id
        };
        // Default if no Spotify token is found
        let spotifyToken = 'direct_auth';
        // Check if we have a Spotify token for this client
        for (const [existingMcpToken, value] of this.tokenMap.entries()) {
            if (value.authInfo.clientId === client.client_id && ((_a = value.authInfo.extra) === null || _a === void 0 ? void 0 : _a.user)) {
                // We found Spotify user data for this client, use it
                extra.user = value.authInfo.extra.user;
                console.log('Found Spotify user for client:', extra.user.display_name || extra.user.id);
                // If this entry has a real Spotify token (not 'direct_auth'), use it
                if (value.spotify !== 'direct_auth') {
                    spotifyToken = value.spotify;
                    console.log('Using existing Spotify token for this client');
                }
                break;
            }
        }
        // Create an auth info object for this token
        const authInfo = {
            token: mcpToken,
            clientId: client.client_id,
            scopes: ['user-read-private', 'user-read-email', 'user-top-read', 'user-read-recently-played'],
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
            extra
        };
        // Store in our token map for validation
        this.tokenMap.set(mcpToken, {
            spotify: spotifyToken,
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
     * Handle Spotify OAuth callback and redirect to the appropriate MCP client
     */
    async handleSpotifyCallback(code, state) {
        console.log('handleSpotifyCallback', { code: code.substring(0, 10) + '...', state });
        // Lookup the pending authorization
        const pendingAuth = this.pendingAuths.get(state);
        if (!pendingAuth) {
            throw new Error('Invalid or expired state parameter');
        }
        console.log('Found pending auth for client:', pendingAuth.mcpClientId);
        // Exchange the code for a Spotify token
        try {
            // Spotify requires client_id and client_secret as Basic Auth
            const credentials = Buffer.from(`${this.spotifyClientId}:${this.spotifyClientSecret}`).toString('base64');
            const params = new URLSearchParams({
                grant_type: "authorization_code",
                code: code,
                redirect_uri: REDIRECT_URI
            });
            console.log('Exchanging code for Spotify token...');
            const response = await fetch(this._endpoints.tokenUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/json",
                    "Authorization": `Basic ${credentials}`
                },
                body: params.toString(),
            });
            if (!response.ok) {
                console.error('Failed to exchange code for token:', await response.text());
                throw new Error(`Spotify token exchange failed: ${response.status}`);
            }
            const spotifyTokens = await response.json();
            console.log('Got Spotify tokens with expires_in:', spotifyTokens.expires_in);
            // Generate our own MCP token that maps to the Spotify token
            const mcpToken = `mcp_${Math.random().toString(36).substring(2)}`;
            const mcpRefreshToken = `refresh_${Math.random().toString(36).substring(2)}`;
            // Verify the token to get user info
            const userData = await this.fetchSpotifyUserInfo(spotifyTokens.access_token);
            // Create an MCP auth info object that wraps the Spotify token
            const authInfo = {
                token: mcpToken,
                clientId: pendingAuth.mcpClientId,
                scopes: ['user-read-private', 'user-read-email', 'user-top-read', 'user-read-recently-played'],
                expiresAt: Math.floor(Date.now() / 1000) + spotifyTokens.expires_in,
                extra: {
                    user: userData,
                    spotify_user: userData.display_name || userData.id // Add a simpler field for logging
                },
            };
            console.log(`Created auth info for Spotify user: ${userData.display_name || userData.id}`);
            // Store in our token map for future validation
            this.tokenMap.set(mcpToken, {
                spotify: spotifyTokens.access_token,
                authInfo
            });
            console.log('Successfully created MCP token mapping for Spotify token');
        }
        catch (error) {
            console.error('Error exchanging Spotify code for token:', error);
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
        console.log('registerClient', { clientId: client.client_id });
        this.clientsMap.set(client.client_id, client);
    }
    /**
     * Make a request to the Spotify API using an MCP token
     */
    async makeSpotifyRequest(mcpToken, endpoint, options = {}) {
        console.log('makeSpotifyRequest', {
            mcpToken: mcpToken.substring(0, 10) + '...',
            endpoint
        });
        const tokenEntry = this.tokenMap.get(mcpToken);
        if (!tokenEntry || !tokenEntry.spotify) {
            throw new Error('Invalid or expired MCP token');
        }
        const spotifyToken = tokenEntry.spotify;
        // Check if we have a real Spotify token or just a placeholder
        if (spotifyToken === 'direct_auth') {
            console.log('No Spotify token available for this MCP token');
            // Try to find a valid Spotify token for the same client
            for (const [_, value] of this.tokenMap.entries()) {
                if (value.authInfo.clientId === tokenEntry.authInfo.clientId &&
                    value.spotify !== 'direct_auth') {
                    console.log('Found alternative Spotify token for the same client');
                    // Make the request with the alternative token
                    const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
                        ...options,
                        headers: {
                            'Authorization': `Bearer ${value.spotify}`,
                            'Accept': 'application/json',
                            ...options.headers,
                        },
                    });
                    if (!response.ok) {
                        throw new Error(`Spotify API request failed: ${response.status}`);
                    }
                    return response.json();
                }
            }
            throw new Error('No valid Spotify token found for this client');
        }
        const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
            ...options,
            headers: {
                'Authorization': `Bearer ${spotifyToken}`,
                'Accept': 'application/json',
                ...options.headers,
            },
        });
        if (!response.ok) {
            throw new Error(`Spotify API request failed: ${response.status}`);
        }
        return response.json();
    }
}
//# sourceMappingURL=spotifyOAuthProvider.js.map