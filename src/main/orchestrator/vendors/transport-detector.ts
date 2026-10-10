// Transport selection —— 只接受用户显式选择，不根据 Base URL 猜协议。

import type { Transport } from "./types";
import { getCapabilityOrOpenAI } from "./capabilities";

export function resolveTransport(cfg: {
  baseUrl: string;
  explicitTransport?: Transport;
  provider: string;
}): Transport {
  if (cfg.explicitTransport === "openai" || cfg.explicitTransport === "anthropic" || cfg.explicitTransport === "responses") {
    return cfg.explicitTransport;
  }
  return getCapabilityOrOpenAI(cfg.provider).transport;
}
