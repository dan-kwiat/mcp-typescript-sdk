import { randomUUID } from 'node:crypto';
/**
 * Simple in-memory implementation of OAuth clients store for demo purposes.
 * In production, this should be backed by a persistent database.
 */
export class DemoInMemoryClientsStore {
    constructor() {
        this.clients = new Map();
    }
    async getClient(clientId) {
        return this.clients.get(clientId);
    }
    async registerClient(clientMetadata) {
        this.clients.set(clientMetadata.client_id, clientMetadata);
        return clientMetadata;
    }
}
/**
 * Simple in-memory implementation of OAuth server provider for demo purposes.
 * Do not use this in production.
 */
export class DemoInMemoryAuthProvider {
    constructor() {
        this.clientsStore = new DemoInMemoryClientsStore();
        this.codes = new Map();
        this.tokens = new Map();
    }
    async authorize(client, params, res) {
        const code = randomUUID();
        const searchParams = new URLSearchParams({
            code,
        });
        if (params.state !== undefined) {
            searchParams.set('state', params.state);
        }
        this.codes.set(code, {
            client,
            params
        });
        const targetUrl = new URL(client.redirect_uris[0]);
        targetUrl.search = searchParams.toString();
        res.redirect(targetUrl.toString());
    }
    async challengeForAuthorizationCode(client, authorizationCode) {
        // Store the challenge with the code data
        const codeData = this.codes.get(authorizationCode);
        if (!codeData) {
            throw new Error('Invalid authorization code');
        }
        return codeData.params.codeChallenge;
    }
    async exchangeAuthorizationCode(client, authorizationCode, _codeVerifier) {
        const codeData = this.codes.get(authorizationCode);
        if (!codeData) {
            throw new Error('Invalid authorization code');
        }
        if (codeData.client.client_id !== client.client_id) {
            throw new Error(`Authorization code was not issued to this client, ${codeData.client.client_id} != ${client.client_id}`);
        }
        // Remove the used code
        this.codes.delete(authorizationCode);
        // Generate access token
        const token = randomUUID();
        const tokenData = {
            token,
            clientId: client.client_id,
            scopes: codeData.params.scopes || [],
            expiresAt: Date.now() + 3600000, // 1 hour
            type: 'access'
        };
        // Store the token
        this.tokens.set(token, tokenData);
        return {
            access_token: token,
            token_type: 'bearer',
            expires_in: 3600,
            scope: (codeData.params.scopes || []).join(' '),
        };
    }
    async exchangeRefreshToken(_client, _refreshToken, _scopes) {
        throw new Error('Not implemented for example demo');
    }
    async verifyAccessToken(token) {
        const tokenData = this.tokens.get(token);
        if (!tokenData || !tokenData.expiresAt || tokenData.expiresAt < Date.now()) {
            throw new Error('Invalid or expired token');
        }
        return {
            token,
            clientId: tokenData.clientId,
            scopes: tokenData.scopes,
            expiresAt: Math.floor(tokenData.expiresAt / 1000),
        };
    }
}
//# sourceMappingURL=demoInMemoryOAuthProvider.js.map