/** Public read-only presentation DTO; contains no authority or gate configuration. */
export interface BrowserAvailability { readonly available: false; readonly reason: "network_unavailable" }
export interface BrowserAvailabilityApi { getAvailability(): Promise<BrowserAvailability> }
