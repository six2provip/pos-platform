"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Users,
  Clock,
  CheckCircle2,
  Coffee,
  Plus,
  ArrowRight,
  ShieldCheck,
  CreditCard,
  DollarSign,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { TableItem } from "./pos-data";

interface PosViewHomeProps {
  tables: TableItem[];
  selectedTableId: string;
  onSelectTable: (table: TableItem) => void;
  onStartOrderForTable: (table: TableItem) => void;
  activeCashSession: { id: string; opening_amount: string; status: string } | null;
  onOpenCashSession: () => void;
  isPortrait: boolean;
  storeCode: string;
  storeName: string;
}

export function PosViewHome({
  tables,
  selectedTableId,
  onSelectTable,
  onStartOrderForTable,
  activeCashSession,
  onOpenCashSession,
  isPortrait,
  storeCode,
  storeName,
}: PosViewHomeProps) {
  const [selectedZone, setSelectedZone] = useState<string>("all");

  const zones = [
    { id: "all", name: "Tất cả khu vực", count: tables.length },
    { id: "ground", name: "Tầng Trệt", count: tables.filter((t) => t.zone === "ground").length },
    { id: "garden", name: "Sân Vườn", count: tables.filter((t) => t.zone === "garden").length },
    { id: "vip", name: "Phòng VIP", count: tables.filter((t) => t.zone === "vip").length },
    { id: "takeaway", name: "Mang Đi", count: tables.filter((t) => t.zone === "takeaway").length },
  ];

  const filteredTables = tables.filter((t) => selectedZone === "all" || t.zone === selectedZone);
  const occupiedCount = tables.filter((t) => t.status === "occupied").length;
  const availableCount = tables.filter((t) => t.status === "available").length;
  const selectedTable = tables.find((t) => t.id === selectedTableId) || tables[0];

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-neutral-900">
            Sơ Đồ Bàn & Ca Bán Hàng{" "}
            <span className="ml-1.5 rounded-lg bg-[#E6F6F0] px-2 py-0.5 text-xs font-bold text-[#059669]">
              {storeCode}
            </span>
          </h1>
          <p className="text-[11px] text-neutral-400">
            {occupiedCount} bàn đang có khách • {availableCount} bàn trống khả dụng
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-xl border border-neutral-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{activeCashSession ? "Ca Thu Ngân: Đang Mở" : "Chưa Mở Ca"}</span>
          </div>
        </div>
      </div>

      {/* Zone Filter Strip */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
        {zones.map((zone) => {
          const isActive = selectedZone === zone.id;
          return (
            <motion.button
              whileTap={{ scale: 0.95 }}
              key={zone.id}
              onClick={() => setSelectedZone(zone.id)}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                isActive
                  ? "bg-[#059669] text-white shadow-sm"
                  : "border border-neutral-200/80 bg-white text-neutral-600 hover:border-neutral-300"
              }`}
            >
              <span>{zone.name}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                  isActive ? "bg-white/20 text-white" : "bg-neutral-100 text-neutral-500"
                }`}
              >
                {zone.count}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Tables Grid */}
      <div className="mt-2 flex-1 overflow-y-auto pr-1">
        <div className={`grid gap-3 ${isPortrait ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-4"}`}>
          {filteredTables.map((table) => {
            const isOccupied = table.status === "occupied";
            const isSelected = table.id === selectedTableId;

            return (
              <motion.div
                key={table.id}
                whileHover={{ y: -3, scale: 1.01 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onSelectTable(table)}
                className={`group relative flex cursor-pointer flex-col justify-between rounded-2xl border p-3.5 shadow-sm transition-all ${
                  isSelected
                    ? "border-[#059669] ring-2 ring-[#059669]/20 bg-white"
                    : isOccupied
                    ? "border-amber-200 bg-amber-50/30 hover:border-amber-300"
                    : "border-neutral-100 bg-white hover:border-[#059669]/40"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-neutral-900">{table.name}</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        isOccupied ? "bg-amber-100 text-amber-800" : "bg-[#E6F6F0] text-[#059669]"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${isOccupied ? "bg-amber-500" : "bg-[#059669]"}`} />
                      {isOccupied ? "Đang phục vụ" : "Bàn trống"}
                    </span>
                  </div>

                  <div className="mt-2 text-[11px] text-neutral-400">{table.zoneName}</div>

                  {isOccupied ? (
                    <div className="mt-3 rounded-xl bg-white p-2.5 border border-amber-100">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="flex items-center gap-1 text-neutral-500">
                          <Users className="h-3 w-3" />
                          {table.guests} khách
                        </span>
                        <span className="flex items-center gap-1 text-neutral-400">
                          <Clock className="h-3 w-3" />
                          {table.seatedMinutes}m
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="font-mono text-[10px] text-neutral-400">{table.currentOrderCode}</span>
                        <span className="text-xs font-extrabold text-amber-900">
                          {new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(table.currentAmount || 0)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex h-14 items-center justify-center rounded-xl border border-dashed border-neutral-200 text-center text-[11px] text-neutral-400 group-hover:border-[#059669]/40 group-hover:text-[#059669]">
                      + Chạm để mở đơn mới
                    </div>
                  )}
                </div>

                <div className="mt-3 pt-1">
                  <motion.button
                    whileTap={{ scale: 0.94 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartOrderForTable(table);
                    }}
                    className={`flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-all ${
                      isOccupied
                        ? "bg-[#059669] text-white hover:bg-[#047857]"
                        : "bg-[#E6F6F0] text-[#059669] hover:bg-[#059669] hover:text-white"
                    }`}
                  >
                    <span>{isOccupied ? "Xem & Thanh toán" : "Gọi Món Cho Bàn Này"}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
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
