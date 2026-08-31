/**
 * Re-exports provider interface types from the shared contract layer.
 *
 * All concrete provider classes import from HERE so their relative paths
 * don't change.  The stable definitions live in src/shared/provider-types.ts.
 */
export type { ProviderCapabilities, IFireflyLlmProvider } from "../../../shared/provider-types";
