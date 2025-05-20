import { AuthorizationParams, OAuthServerProvider } from '../../server/auth/provider.js';
import { OAuthRegisteredClientsStore } from '../../server/auth/clients.js';
import { OAuthClientInformationFull, OAuthTokens } from 'src/shared/auth.js';
import { Response } from "express";
import { AuthInfo } from 'src/server/auth/types.js';
/**
 * Simple in-memory implementation of OAuth clients store for demo purposes.
 * In production, this should be backed by a persistent database.
 */
export declare class DemoInMemoryClientsStore implements OAuthRegisteredClientsStore {
    private clients;
    getClient(clientId: string): Promise<{
        redirect_uris: string[];
        client_id: string;
        scope?: string | undefined;
        token_endpoint_auth_method?: string | undefined;
        grant_types?: string[] | undefined;
        response_types?: string[] | undefined;
        client_name?: string | undefined;
        client_uri?: string | undefined;
        logo_uri?: string | undefined;
        contacts?: string[] | undefined;
        tos_uri?: string | undefined;
        policy_uri?: string | undefined;
        jwks_uri?: string | undefined;
        jwks?: any;
        software_id?: string | undefined;
        software_version?: string | undefined;
        client_secret?: string | undefined;
        client_id_issued_at?: number | undefined;
        client_secret_expires_at?: number | undefined;
    } | undefined>;
    registerClient(clientMetadata: OAuthClientInformationFull): Promise<{
        redirect_uris: string[];
        client_id: string;
        scope?: string | undefined;
        token_endpoint_auth_method?: string | undefined;
        grant_types?: string[] | undefined;
        response_types?: string[] | undefined;
        client_name?: string | undefined;
        client_uri?: string | undefined;
        logo_uri?: string | undefined;
        contacts?: string[] | undefined;
        tos_uri?: string | undefined;
        policy_uri?: string | undefined;
        jwks_uri?: string | undefined;
        jwks?: any;
        software_id?: string | undefined;
        software_version?: string | undefined;
        client_secret?: string | undefined;
        client_id_issued_at?: number | undefined;
        client_secret_expires_at?: number | undefined;
    }>;
}
/**
 * Simple in-memory implementation of OAuth server provider for demo purposes.
 * Do not use this in production.
 */
export declare class DemoInMemoryAuthProvider implements OAuthServerProvider {
    clientsStore: DemoInMemoryClientsStore;
    private codes;
    private tokens;
    authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void>;
    challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<string>;
    exchangeAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string, _codeVerifier?: string): Promise<OAuthTokens>;
    exchangeRefreshToken(_client: OAuthClientInformationFull, _refreshToken: string, _scopes?: string[]): Promise<OAuthTokens>;
    verifyAccessToken(token: string): Promise<AuthInfo>;
}
//# sourceMappingURL=demoInMemoryOAuthProvider.d.ts.map