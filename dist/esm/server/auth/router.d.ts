import { RequestHandler } from "express";
import { ClientRegistrationHandlerOptions } from "./handlers/register.js";
import { TokenHandlerOptions } from "./handlers/token.js";
import { AuthorizationHandlerOptions } from "./handlers/authorize.js";
import { RevocationHandlerOptions } from "./handlers/revoke.js";
import { OAuthServerProvider } from "./provider.js";
export type AuthRouterOptions = {
    /**
     * A provider implementing the actual authorization logic for this router.
     */
    provider: OAuthServerProvider;
    /**
     * The authorization server's issuer identifier, which is a URL that uses the "https" scheme and has no query or fragment components.
     */
    issuerUrl: URL;
    /**
     * The base URL of the authorization server to use for the metadata endpoints.
     *
     * If not provided, the issuer URL will be used as the base URL.
     */
    baseUrl?: URL;
    /**
     * An optional URL of a page containing human-readable information that developers might want or need to know when using the authorization server.
     */
    serviceDocumentationUrl?: URL;
    /**
     * An optional list of scopes supported by this authorization server
     */
    scopesSupported?: string[];
    authorizationOptions?: Omit<AuthorizationHandlerOptions, "provider">;
    clientRegistrationOptions?: Omit<ClientRegistrationHandlerOptions, "clientsStore">;
    revocationOptions?: Omit<RevocationHandlerOptions, "provider">;
    tokenOptions?: Omit<TokenHandlerOptions, "provider">;
    protectedResourceOptions?: Omit<ProtectedResourceRouterOptions, "issuerUrl" | "serviceDocumentationUrl" | "scopesSupported">;
};
/**
 * Installs standard MCP authorization endpoints, including dynamic client registration and token revocation (if supported). Also advertises standard authorization server metadata, for easier discovery of supported configurations by clients.
 *
 * By default, rate limiting is applied to all endpoints to prevent abuse.
 *
 * This router MUST be installed at the application root, like so:
 *
 *  const app = express();
 *  app.use(mcpAuthRouter(...));
 */
export declare function mcpAuthRouter(options: AuthRouterOptions): RequestHandler;
export type ProtectedResourceRouterOptions = {
    /**
     * The authorization server's issuer identifier, which is a URL that uses the "https" scheme and has no query or fragment components.
     */
    issuerUrl: URL;
    /**
     * The MCP server URL that is proteted.
     *
     */
    serverUrl: URL;
    /**
     * An optional URL of a page containing human-readable information that developers might want or need to know when using the authorization server.
     */
    serviceDocumentationUrl?: URL;
    /**
     * A list of valid scopes for the resource.
     */
    scopesSupported?: Array<string>;
    /**
     * A human readable resource name for the MCP server
     */
    resourceName?: string;
};
export declare function mcpProtectedResourceRouter(options: ProtectedResourceRouterOptions): import("express-serve-static-core").Router;
/**
 * Helper function to construct the OAuth 2.0 Protected Resource Metadata URL
 * from a given server URL. This replaces the path with the standard metadata endpoint.
 *
 * @param serverUrl - The base URL of the protected resource server
 * @returns The URL for the OAuth protected resource metadata endpoint
 *
 * @example
 * getOAuthProtectedResourceMetadataUrl(new URL('https://api.example.com/mcp'))
 * // Returns: 'https://api.example.com/.well-known/oauth-protected-resource'
 */
export declare function getOAuthProtectedResourceMetadataUrl(serverUrl: URL): string;
//# sourceMappingURL=router.d.ts.map