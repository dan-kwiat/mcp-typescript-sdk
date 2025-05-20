import { ProxyOAuthServerProvider } from '../../server/auth/providers/proxyProvider.js';
import { OAuthClientInformationFull, OAuthTokens } from '../../shared/auth.js';
import { AuthorizationParams } from '../../server/auth/provider.js';
import { Response } from 'express';
/**
 * Configuration for a generic OAuth provider
 */
export type ProviderConfig = {
    /**
     * Provider name (used for logging and environment variable naming)
     */
    name: string;
    /**
     * OAuth endpoints
     */
    endpoints: {
        authorizationUrl: string;
        tokenUrl: string;
        revocationUrl?: string;
    };
    /**
     * API configuration
     */
    api: {
        baseUrl: string;
        userInfoEndpoint: string;
        /**
         * How to format the authorization header
         * - 'Bearer': Authorization: Bearer {token}
         * - 'token': Authorization: token {token} (GitHub style)
         * - 'Basic': Uses Basic auth with client credentials
         */
        authHeaderFormat: 'Bearer' | 'token' | 'Basic';
    };
    /**
     * Authentication configuration
     */
    auth: {
        /**
         * OAuth client ID for the provider.
         * If not provided, will try to use environment variable [NAME]_CLIENT_ID
         */
        clientId?: string;
        /**
         * OAuth client secret for the provider
         * If not provided, will try to use environment variable [NAME]_CLIENT_SECRET
         */
        clientSecret?: string;
        /**
         * Redirect URI for the OAuth flow
         */
        redirectUri: string;
        /**
         * List of scopes to request during authorization
         */
        scopes: string[];
        /**
         * How to send client credentials during token exchange
         * - 'basic': Using Basic auth header (Spotify style)
         * - 'body': In the request body (GitHub style)
         */
        tokenExchangeMethod: 'basic' | 'body';
    };
};
/**
 * A generic OAuth provider that can be configured to work with different providers
 * This provider acts as both an OAuth client to the external provider and an OAuth server to MCP clients
 */
export declare class GenericOAuthProvider extends ProxyOAuthServerProvider {
    private pendingAuths;
    private providerClientId;
    private providerClientSecret;
    private clientsMap;
    private tokenMap;
    private config;
    constructor(config: ProviderConfig);
    /**
     * Override the authorize method to implement proper third-party OAuth flow
     */
    authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void>;
    /**
     * Fetch user info with an access token
     */
    private fetchUserInfo;
    /**
     * Override token exchange to properly map between MCP and provider tokens
     */
    exchangeAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string, codeVerifier?: string): Promise<OAuthTokens>;
    /**
     * Handle OAuth callback and redirect to the appropriate MCP client
     */
    handleCallback(code: string, state: string): Promise<string>;
    /**
     * Register a client with our provider
     */
    registerClient(client: OAuthClientInformationFull): void;
    getThirdPartyAuthHeader(mcpToken: string): Promise<string>;
    /**
     * Make a request to the provider API using an MCP token
     */
    makeProviderRequest(mcpToken: string, endpoint: string, options?: RequestInit): Promise<any>;
    /**
     * Helper method to make an authenticated request to the provider API
     */
    private makeAuthenticatedRequest;
}
//# sourceMappingURL=genericOAuthProvider.d.ts.map