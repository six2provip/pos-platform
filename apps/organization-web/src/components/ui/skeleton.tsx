import React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-neutral-200/80", className)}
      {...props}
    />
  );
}

/**
 * Phác thảo khung layout trang Tổng Quan (Bento Grid Dashboard Skeleton)
 */
export function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      {/* Top Banner Skeleton */}
      <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl space-y-3">
            <Skeleton className="h-7 w-72" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <div className="flex items-center gap-3 pt-2">
              <Skeleton className="h-9 w-36 rounded-md" />
              <Skeleton className="h-9 w-36 rounded-md" />
            </div>
          </div>
          {/* KPI Widget Skeleton */}
          <div className="w-full lg:w-[360px] rounded-xl border border-neutral-200/80 bg-neutral-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-white p-3 space-y-2 border border-neutral-200/60">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-24" />
              </div>
              <div className="rounded-lg bg-white p-3 space-y-2 border border-neutral-200/60">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-16" />
              </div>
              <div className="rounded-lg bg-white p-3 space-y-2 border border-neutral-200/60">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-20" />
              </div>
              <div className="rounded-lg bg-white p-3 space-y-2 border border-neutral-200/60">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-14" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bento Grid Skeleton */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-6 min-h-[190px]"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-4 w-16 rounded-full" />
              </div>
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-3/4" />
            </div>
            <div className="pt-4 border-t border-neutral-100 flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Phác thảo khung layout trang Quầy Bán Hàng POS (POS Simulator Wireframe Skeleton)
 */
export function PosSkeleton() {
  return (
    <div className="space-y-4">
      {/* Top Device Bar Skeleton */}
      <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-36 rounded-md" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </div>

      {/* Main POS Interface Skeleton (Products Grid + Cart) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left: Product Catalog Skeleton */}
        <div className="lg:col-span-8 rounded-2xl border border-neutral-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <Skeleton className="h-6 w-52" />
              <Skeleton className="h-3.5 w-72" />
            </div>
            <Skeleton className="h-9 w-44 rounded-md" />
          </div>

          {/* Filter Pills Skeleton */}
          <div className="flex items-center gap-2 overflow-hidden py-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-20 rounded-full shrink-0" />
            ))}
          </div>

          {/* Products Grid Skeleton */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col justify-between rounded-xl border border-neutral-200 p-3.5 space-y-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3.5 w-16 rounded" />
                    <Skeleton className="h-3.5 w-12 rounded" />
                  </div>
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-8 w-16 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Cart Panel Skeleton */}
        <div className="lg:col-span-4 rounded-2xl border border-neutral-200 bg-[#F9FAFB] p-5 space-y-4 flex flex-col justify-between min-h-[460px]">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
              <div className="space-y-1">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-3 w-36" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>

            {/* Cart item rows */}
            <div className="space-y-2.5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-neutral-200/70 bg-white p-3 flex items-center justify-between"
                >
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-6 w-16" />
                    <Skeleton className="h-6 w-6 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cart summary & Checkout Skeleton */}
          <div className="space-y-3 pt-4 border-t border-neutral-200">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-3.5 w-20" />
            </div>
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-6 w-28" />
            </div>
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Phác thảo khung layout trang Hóa Đơn & Đồng Bộ (Orders & Outbox Skeleton)
 */
export function OrdersSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-60" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
      </div>

      {/* Filter Tabs Skeleton */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-20 rounded-md" />
        <Skeleton className="h-8 w-28 rounded-md" />
        <Skeleton className="h-8 w-32 rounded-md" />
      </div>

      {/* Orders List Skeleton */}
      <div className="rounded-xl border border-neutral-200 bg-white divide-y divide-neutral-100 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between p-4"
          >
            <div className="flex items-center gap-5">
              <div className="space-y-1">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-14" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-6 w-20 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Phác thảo khung layout trang Danh Mục Sản Phẩm (Products Skeleton)
 */
export function ProductsSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>

      {/* Product Items Skeleton */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-20 rounded" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-3 w-36" />
            <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-7 w-20 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Phác thảo khung layout trang Tồn Kho & Sổ Cái (Inventory Skeleton)
 */
export function InventorySkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-44 rounded-md" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-28 rounded" />
              <Skeleton className="h-5 w-16 rounded" />
            </div>
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-32" />
            <div className="pt-2 border-t border-neutral-100">
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Phác thảo khung layout trang Thiết Bị POS (Devices Skeleton)
 */
export function DevicesSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-48 rounded-md" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-neutral-200 bg-white p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
            <Skeleton className="h-6 w-16 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Phác thảo khung layout trang Cài Đặt Hệ Thống (Settings Skeleton)
 */
export function SettingsSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-20 rounded-md" />
        <Skeleton className="h-8 w-32 rounded-md" />
        <Skeleton className="h-8 w-28 rounded-md" />
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-6 space-y-5">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-3.5 w-72" />
        </div>
        <div className="space-y-4 pt-2">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/**
 * Phác thảo khung layout trang Quản Lý Chi Nhánh (Stores & Branches Skeleton)
 */
export function StoresSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-9 w-40 rounded-md" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-neutral-200 bg-white p-4 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-28" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-neutral-200 bg-white p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-5 w-20 rounded" />
            </div>
            <Skeleton className="h-6 w-52" />
            <div className="flex items-center gap-4 pt-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-neutral-100">
              <Skeleton className="h-8 w-28 rounded-md" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-24 rounded-md" />
                <Skeleton className="h-8 w-28 rounded-md" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

