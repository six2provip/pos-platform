/**
 * Organization Admin Web API Client (Strictly scoped to Business Data Plane /api/v1/*)
 * Reference: docs/01-system-architecture.md & docs/03-api-specification.md
 */

import type { ApiResponse, SystemCapabilities } from "../../../packages/api-contracts/src";

export class OrganizationApiClient {
  constructor(
    private readonly baseUrl: string,
    private accessToken: string | null = null,
  ) {}

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  async request<T>(
    path: string,
    init: RequestInit = {},
    storeId?: string,
    idempotencyKey?: string,
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...((init.headers as Record<string, string>) ?? {}),
    };
    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }
    if (storeId) {
      headers["X-Store-ID"] = storeId;
    }
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }
    const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
      ...init,
      headers,
    });
    return (await res.json()) as ApiResponse<T>;
  }

  async getCapabilities(): Promise<ApiResponse<SystemCapabilities>> {
    return this.request<SystemCapabilities>("/system/capabilities");
  }
}

