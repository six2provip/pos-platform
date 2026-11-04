/**
 * Shared API Envelope & Domain Contracts for POS Platform
 * Reference: docs/03-api-specification.md & docs/04-cloud-control-plane.md
 */

export interface PaginationMeta {
  page_size: number;
  next_cursor: string | null;
  has_more: boolean;
}

export interface ApiErrorDetail {
  field?: string | null;
  reason: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  message: string | null;
  error: {
    code: string;
    details: ApiErrorDetail[];
  } | null;
  request_id: string;
  meta?: PaginationMeta;
}

export type DeploymentMode = "cloud" | "private";

export interface SystemCapabilities {
  deployment_mode: DeploymentMode;
  deployment_id: string | null;
  organization_id: string;
  edition: string;
  features: string[];
  max_stores: number;
  max_devices: number;
  license_state: string;
  allow_pos_sales: boolean;
  allow_new_device_activation: boolean;
  allow_new_store_provisioning: boolean;
  warnings: string[];
}

