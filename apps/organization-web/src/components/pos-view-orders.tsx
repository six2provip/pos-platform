"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Printer,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  WifiOff,
  Receipt,
  RotateCcw,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { SimulatorOrderRecord, SimulatorOutboxOrder } from "./pos-types";

interface PosViewOrdersProps {
  orders: SimulatorOrderRecord[];
  outboxQueue: SimulatorOutboxOrder[];
  selectedOrderId: string;
  onSelectOrder: (orderId: string) => void;
  onReprintOrder: (order: SimulatorOrderRecord | SimulatorOutboxOrder) => void;
  onFlushOutbox: () => Promise<void>;
  loading: boolean;
  isPortrait: boolean;
}

export function PosViewOrders({
  orders,
  outboxQueue,
  selectedOrderId,
  onSelectOrder,
  onReprintOrder,
  onFlushOutbox,
  loading,
  isPortrait,
}: PosViewOrdersProps) {
  const [filterType, setFilterType] = useState<"all" | "paid" | "outbox">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const formatVND = (amt: string | number) => {
    const num = typeof amt === "string" ? parseFloat(amt) || 0 : amt;
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(num);
  };

  const filteredOrders = orders.filter((o) => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || o.order_number.toLowerCase().includes(q) || o.id.toLowerCase().includes(q);
    if (!matchSearch) return false;
    if (filterType === "paid") return o.payment_status === "paid";
    return true;
  });

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-neutral-900">
            Lịch Sử Hóa Đơn & Đồng Bộ Outbox
          </h1>
          <p className="text-[11px] text-neutral-400">
            {orders.length} đơn đã hạch toán • {outboxQueue.length} đơn chờ đồng bộ Offline
          </p>
        </div>

        {outboxQueue.length > 0 && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            disabled={loading}
            onClick={onFlushOutbox}
            className="flex items-center gap-1.5 rounded-xl bg-neutral-900 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-neutral-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Đồng bộ {outboxQueue.length} đơn Offline</span>
          </motion.button>
        )}
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2">
        <div className="flex items-center gap-1.5 rounded-xl border border-neutral-200/80 bg-white p-1">
          {[
            { id: "all", label: "Tất cả đơn", count: orders.length },
            { id: "paid", label: "Đã thanh toán", count: orders.filter((o) => o.payment_status === "paid").length },
            { id: "outbox", label: "Chờ Outbox", count: outboxQueue.length },
          ].map((tab) => {
            const isActive = filterType === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setFilterType(tab.id as any)}
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

        <div className="relative w-56">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo mã đơn..."
            className="w-full rounded-xl border border-neutral-200/90 bg-white pl-8 pr-3 py-1.5 text-xs text-neutral-800 placeholder:text-neutral-400 shadow-sm focus:border-[#059669] focus:outline-none"
          />
        </div>
      </div>

      {/* Orders List */}
      <div className="mt-2 flex-1 overflow-y-auto pr-1">
        {filterType === "outbox" ? (
          <div className="space-y-2.5">
            {outboxQueue.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-8 text-center text-xs text-neutral-400">
                Không có đơn hàng nào đang chờ trong Outbox. Toàn bộ đơn đã được đồng bộ lên Cloud!
              </div>
            ) : (
              outboxQueue.map((item) => (
                <div
                  key={item.event_id}
                  className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                      <WifiOff className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-neutral-900">{item.client_order_id}</span>
                        <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                          PENDING OUTBOX
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-neutral-500">
                        {new Date(item.occurred_at).toLocaleTimeString("vi-VN")} • {item.items.length} món
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm font-extrabold text-amber-900">{formatVND(item.total_amount)}</span>
                    <button
                      onClick={() => onReprintOrder(item)}
                      className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-bold text-neutral-700 hover:bg-neutral-50"
                    >
                      In Bill
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredOrders.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-8 text-center text-xs text-neutral-400">
                Chưa có đơn hàng nào trong ca này.
              </div>
            ) : (
              filteredOrders.map((order) => {
                const isSelected = order.id === selectedOrderId;
                return (
                  <motion.div
                    key={order.id}
                    whileHover={{ y: -1 }}
                    onClick={() => onSelectOrder(order.id)}
                    className={`flex cursor-pointer items-center justify-between rounded-2xl border p-4 shadow-sm transition-all ${
                      isSelected
                        ? "border-[#059669] bg-[#E6F6F0]/20 ring-1 ring-[#059669]"
                        : "border-neutral-100 bg-white hover:border-neutral-200"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E6F6F0] text-[#059669]">
                        <Receipt className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-extrabold text-neutral-900">{order.order_number}</span>
                          <span className="rounded-full bg-[#E6F6F0] px-2 py-0.5 text-[10px] font-bold text-[#059669]">
                            {order.payment_status.toUpperCase()}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-neutral-400">
                          <span>{new Date(order.occurred_at).toLocaleTimeString("vi-VN")}</span>
                          <span>•</span>
                          <span>Đã hạch toán vào ca</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-xs font-extrabold text-neutral-900">{formatVND(order.total_amount)}</div>
                        <div className="text-[10px] text-neutral-400">Tiền mặt: {formatVND(order.paid_amount)}</div>
                      </div>
                      <motion.button
                        whileTap={{ scale: 0.94 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onReprintOrder(order);
                        }}
                        className="flex items-center gap-1 rounded-xl bg-[#E6F6F0] px-3 py-1.5 text-xs font-bold text-[#059669] hover:bg-[#059669] hover:text-white"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        <span>In lại Bill K80</span>
                      </motion.button>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
