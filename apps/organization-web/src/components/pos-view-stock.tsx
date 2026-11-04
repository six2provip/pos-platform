"use client";

import React, { useState } from "react";
import { motion } from "motion/react";
import {
  Box,
  Search,
  Plus,
  ArrowUpRight,
  AlertTriangle,
  CheckCircle2,
  Package,
  Layers,
  Sparkles,
  Barcode,
} from "lucide-react";
import { SimulatorVariantItem } from "./pos-types";

interface PosViewStockProps {
  variants: SimulatorVariantItem[];
  selectedVariantId: string;
  onSelectVariant: (v: SimulatorVariantItem) => void;
  onQuickRestock: (variantId: string, delta: number) => void;
  onOpenCreateProductModal?: () => void;
  isPortrait: boolean;
}

export function PosViewStock({
  variants,
  selectedVariantId,
  onSelectVariant,
  onQuickRestock,
  onOpenCreateProductModal,
  isPortrait,
}: PosViewStockProps) {
  const [filterLevel, setFilterLevel] = useState<"all" | "low" | "good">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const formatVND = (amt: number) =>
    new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amt);

  const filteredVariants = variants.filter((v) => {
    const q = searchQuery.toLowerCase();
    const matchSearch =
      !q ||
      v.productName.toLowerCase().includes(q) ||
      v.sku.toLowerCase().includes(q) ||
      v.barcode.toLowerCase().includes(q);
    if (!matchSearch) return false;
    if (filterLevel === "low") return v.onHand <= 30;
    if (filterLevel === "good") return v.onHand > 30;
    return true;
  });

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-neutral-900">
            Tồn Kho Tại Quầy & Sổ Cái Minh Bạch
          </h1>
          <p className="text-[11px] text-neutral-400">
            Theo dõi số lượng tồn thực tế theo từng biến thể SKU và nhập bổ sung nhanh
          </p>
        </div>

        {onOpenCreateProductModal && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onOpenCreateProductModal}
            className="flex items-center gap-1.5 rounded-xl bg-[#059669] px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/25 hover:bg-[#047857]"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Thêm Món Mới</span>
          </motion.button>
        )}
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2">
        <div className="flex items-center gap-1.5 rounded-xl border border-neutral-200/80 bg-white p-1">
          {[
            { id: "all", label: "Tất cả SKU", count: variants.length },
            { id: "low", label: "Sắp hết kho (≤ 30)", count: variants.filter((v) => v.onHand <= 30).length },
            { id: "good", label: "Đủ tồn kho (> 30)", count: variants.filter((v) => v.onHand > 30).length },
          ].map((tab) => {
            const isActive = filterLevel === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setFilterLevel(tab.id as any)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  isActive ? "bg-[#059669] text-white shadow-sm" : "text-neutral-600 hover:text-neutral-900"
                }`}
              >
                <span>{tab.label}</span>
                <span className={`rounded-full px-1.5 text-[10px] ${isActive ? "bg-white/20 text-white" : "bg-neutral-100 text-neutral-500"}`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên món, mã SKU, barcode..."
            className="w-full rounded-xl border border-neutral-200/90 bg-white pl-8 pr-3 py-1.5 text-xs text-neutral-800 placeholder:text-neutral-400 shadow-sm focus:border-[#059669] focus:outline-none"
          />
        </div>
      </div>

      {/* Stock Cards Grid */}
      <div className="mt-2 flex-1 overflow-y-auto pr-1">
        <div className={`grid gap-3 ${isPortrait ? "grid-cols-1" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-4"}`}>
          {filteredVariants.map((item) => {
            const isSelected = item.variantId === selectedVariantId;
            const isLow = item.onHand <= 30;

            return (
              <motion.div
                key={item.variantId}
                whileHover={{ y: -2 }}
                onClick={() => onSelectVariant(item)}
                className={`flex cursor-pointer flex-col justify-between rounded-2xl border p-3.5 shadow-sm transition-all ${
                  isSelected
                    ? "border-[#059669] ring-2 ring-[#059669]/20 bg-white"
                    : isLow
                    ? "border-amber-200 bg-amber-50/20 hover:border-amber-300"
                    : "border-neutral-100 bg-white hover:border-neutral-200"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-extrabold text-neutral-900 line-clamp-1">{item.productName}</div>
                      <div className="mt-0.5 text-[10px] font-mono text-neutral-400">{item.sku}</div>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                        isLow ? "bg-amber-100 text-amber-800" : "bg-[#E6F6F0] text-[#059669]"
                      }`}
                    >
                      {isLow ? "Sắp hết" : "Sẵn sàng"}
                    </span>
                  </div>

                  {/* Stock Gauge Progress Bar */}
                  <div className="mt-3 rounded-xl bg-neutral-50 p-2.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-neutral-400">Tồn khả dụng</span>
                      <span className="text-sm font-extrabold text-neutral-900">{item.onHand} phần</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isLow ? "bg-amber-500" : "bg-[#059669]"
                        }`}
                        style={{ width: `${Math.min(100, (item.onHand / 120) * 100)}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-neutral-400">
                      <span>Đơn giá: {formatVND(item.price)}</span>
                      <span>Barcode: {item.barcode}</span>
                    </div>
                  </div>
                </div>

                {/* Quick Restock Buttons */}
                <div className="mt-3 flex items-center gap-1.5 pt-1">
                  <motion.button
                    whileTap={{ scale: 0.94 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuickRestock(item.variantId, 20);
                    }}
                    className="flex-1 rounded-xl bg-[#E6F6F0] py-1.5 text-center text-[11px] font-bold text-[#059669] hover:bg-[#059669] hover:text-white"
                  >
                    +20 đv
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.94 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuickRestock(item.variantId, 50);
                    }}
                    className="flex-1 rounded-xl bg-[#E6F6F0] py-1.5 text-center text-[11px] font-bold text-[#059669] hover:bg-[#059669] hover:text-white"
                  >
                    +50 đv
                  </motion.button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
