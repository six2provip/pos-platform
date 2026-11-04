/**
 * Provider Super-Admin Web API Client (Strictly scoped to Cloud Control Plane /control/admin/v1/*)
 * Reference: docs/04-cloud-control-plane.md
 */

import type { ApiResponse } from "../../../packages/api-contracts/src";

export class ControlPlaneAdminClient {
  constructor(
    private readonly controlPlaneUrl: string,
    private adminToken: string | null = null,
  ) {}

  setAdminToken(token: string | null): void {
    this.adminToken = token;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...((init.headers as Record<string, string>) ?? {}),
    };
    if (this.adminToken) {
      headers["Authorization"] = `Bearer ${this.adminToken}`;
    }
    const res = await fetch(`${this.controlPlaneUrl}/control/admin/v1${path}`, {
      ...init,
      headers,
    });
    return (await res.json()) as ApiResponse<T>;
  }
}

