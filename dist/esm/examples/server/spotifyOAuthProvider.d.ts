import { ProxyOAuthServerProvider } from '../../server/auth/providers/proxyProvider.js';
import { OAuthClientInformationFull, OAuthTokens } from '../../shared/auth.js';
import { AuthorizationParams } from '../../server/auth/provider.js';
import { Response } from 'express';
/**
 * A provider that implements the third-party OAuth flow with Spotify
 * This provider acts as both an OAuth client to Spotify and an OAuth server to MCP clients
 */
export declare class SpotifyOAuthProvider extends ProxyOAuthServerProvider {
    private pendingAuths;
    private spotifyClientId;
    private spotifyClientSecret;
    private clientsMap;
    private tokenMap;
    constructor();
    /**
     * Override the authorize method to implement proper third-party OAuth flow
     */
    authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void>;
    /**
     * Fetch Spotify user info with an access token
     */
    private fetchSpotifyUserInfo;
    /**
     * Override token exchange to properly map between MCP and Spotify tokens
     */
    exchangeAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string, codeVerifier?: string): Promise<OAuthTokens>;
    /**
     * Handle Spotify OAuth callback and redirect to the appropriate MCP client
     */
    handleSpotifyCallback(code: string, state: string): Promise<string>;
    /**
     * Register a client with our provider
     */
    registerClient(client: OAuthClientInformationFull): void;
    /**
     * Make a request to the Spotify API using an MCP token
     */
    makeSpotifyRequest(mcpToken: string, endpoint: string, options?: RequestInit): Promise<any>;
}
//# sourceMappingURL=spotifyOAuthProvider.d.ts.map