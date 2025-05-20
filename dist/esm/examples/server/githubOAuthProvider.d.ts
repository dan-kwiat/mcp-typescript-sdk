import { ProxyOAuthServerProvider } from '../../server/auth/providers/proxyProvider.js';
import { OAuthClientInformationFull, OAuthTokens } from '../../shared/auth.js';
import { AuthorizationParams } from '../../server/auth/provider.js';
import { Response } from 'express';
/**
 * A provider that implements the third-party OAuth flow with GitHub
 * This provider acts as both an OAuth client to GitHub and an OAuth server to MCP clients
 */
export declare class GitHubOAuthProvider extends ProxyOAuthServerProvider {
    private pendingAuths;
    private githubClientId;
    private githubClientSecret;
    private clientsMap;
    private tokenMap;
    constructor();
    /**
     * Override the authorize method to implement proper third-party OAuth flow
     */
    authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void>;
    /**
     * Fetch GitHub user info with an access token
     */
    private fetchGitHubUserInfo;
    /**
     * Override token exchange to properly map between MCP and GitHub tokens
     */
    exchangeAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string, codeVerifier?: string): Promise<OAuthTokens>;
    /**
     * Handle GitHub OAuth callback and redirect to the appropriate MCP client
     */
    handleGitHubCallback(code: string, state: string): Promise<string>;
    /**
     * Register a client with our provider
     */
    registerClient(client: OAuthClientInformationFull): void;
    makeGitHubRequest(mcpToken: string, endpoint: string, options?: RequestInit): Promise<any>;
}
//# sourceMappingURL=githubOAuthProvider.d.ts.map