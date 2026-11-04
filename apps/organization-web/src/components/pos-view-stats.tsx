"use client";

import React from "react";
import { motion } from "motion/react";
import {
  TrendingUp,
  DollarSign,
  Receipt,
  Printer,
  Calendar,
  CreditCard,
  QrCode,
  Sparkles,
  PieChart,
} from "lucide-react";
import { SimulatorOrderRecord } from "./pos-types";

interface PosViewStatsProps {
  orders: SimulatorOrderRecord[];
  activeCashSession: { id: string; opening_amount: string; status: string } | null;
  onPrintZReport: () => void;
  isPortrait: boolean;
}

export function PosViewStats({
  orders,
  activeCashSession,
  onPrintZReport,
  isPortrait,
}: PosViewStatsProps) {
  const formatVND = (amt: number | string) => {
    const num = typeof amt === "string" ? parseFloat(amt) || 0 : amt;
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(num);
  };

  const totalRevenue = orders.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);
  const avgOrderValue = orders.length > 0 ? Math.round(totalRevenue / orders.length) : 0;
  const cashTotal = orders.reduce((sum, o) => sum + (parseFloat(o.paid_amount) || 0), 0);
  const openingAmount = activeCashSession ? parseFloat(activeCashSession.opening_amount) || 0 : 0;

  // Hourly distribution bars
  const hourlyData = [
    { hour: "08:00", val: 120000 },
    { hour: "10:00", val: 340000 },
    { hour: "12:00", val: 680000 },
    { hour: "14:00", val: 410000 },
    { hour: "16:00", val: 520000 },
    { hour: "18:00", val: 790000 },
    { hour: "20:00", val: 450000 },
  ];
  const maxHourly = Math.max(...hourlyData.map((d) => d.val), 1);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-neutral-900">
            Báo Cáo Doanh Thu Ca & Đối Soát (Z-Report)
          </h1>
          <p className="text-[11px] text-neutral-400">
            Tổng hợp chỉ số kinh doanh theo thời gian thực và in phiếu kết ca K80
          </p>
        </div>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onPrintZReport}
          className="flex items-center gap-1.5 rounded-xl bg-[#059669] px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/25 hover:bg-[#047857]"
        >
          <Printer className="h-3.5 w-3.5" />
          <span>In Báo Cáo Kết Ca (Z-Report)</span>
        </motion.button>
      </div>

      {/* KPI 4 Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 pb-3">
        <div className="rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-[11px] font-medium uppercase">Tổng Doanh Thu</span>
            <DollarSign className="h-4 w-4 text-[#059669]" />
          </div>
          <div className="mt-1 text-base font-extrabold text-neutral-900">{formatVND(totalRevenue)}</div>
          <div className="mt-1 text-[10px] text-emerald-600 font-bold">↑ 14.5% so với ca hôm qua</div>
        </div>

        <div className="rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-[11px] font-medium uppercase">Tổng Hóa Đơn</span>
            <Receipt className="h-4 w-4 text-[#059669]" />
          </div>
          <div className="mt-1 text-base font-extrabold text-neutral-900">{orders.length} đơn</div>
          <div className="mt-1 text-[10px] text-neutral-400">100% thanh toán thành công</div>
        </div>

        <div className="rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-[11px] font-medium uppercase">Giá Trị Trung Bình</span>
            <TrendingUp className="h-4 w-4 text-[#059669]" />
          </div>
          <div className="mt-1 text-base font-extrabold text-neutral-900">{formatVND(avgOrderValue)}</div>
          <div className="mt-1 text-[10px] text-neutral-400">trên mỗi lượt khách</div>
        </div>

        <div className="rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-[11px] font-medium uppercase">Tiền Mặt Trong Két</span>
            <CreditCard className="h-4 w-4 text-[#059669]" />
          </div>
          <div className="mt-1 text-base font-extrabold text-neutral-900">{formatVND(openingAmount + cashTotal)}</div>
          <div className="mt-1 text-[10px] text-neutral-400">Đầu ca: {formatVND(openingAmount)}</div>
        </div>
      </div>

      {/* Hourly Chart + Top Sellers */}
      <div className="mt-1 flex-1 overflow-y-auto pr-1">
        <div className={`grid gap-3.5 ${isPortrait ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-12"}`}>
          {/* Hourly chart */}
          <div className={`rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm ${isPortrait ? "" : "lg:col-span-7"}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-neutral-900">Biểu Đồ Doanh Thu Theo Giờ</span>
              <span className="rounded-full bg-[#E6F6F0] px-2 py-0.5 text-[10px] font-bold text-[#059669]">Hôm nay</span>
            </div>
            <div className="mt-6 flex h-44 items-end justify-between gap-2 px-2">
              {hourlyData.map((d) => {
                const heightPercent = Math.round((d.val / maxHourly) * 100);
                return (
                  <div key={d.hour} className="flex flex-1 flex-col items-center gap-1.5">
                    <span className="text-[9px] font-bold text-neutral-400">{d.val > 0 ? `${Math.round(d.val / 1000)}k` : "0"}</span>
                    <div className="h-32 w-full rounded-t-xl bg-neutral-100 p-0.5 flex items-end justify-center">
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${heightPercent}%` }}
                        transition={{ type: "spring", stiffness: 220, damping: 20 }}
                        className="w-full rounded-t-lg bg-[#059669]"
                      />
                    </div>
                    <span className="text-[10px] font-semibold text-neutral-500">{d.hour}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Payment Method Distribution */}
          <div className={`rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm ${isPortrait ? "" : "lg:col-span-5"}`}>
            <span className="text-xs font-extrabold text-neutral-900">Tỷ Trọng Thanh Toán Ca Này</span>
            <div className="mt-4 space-y-3">
              {[
                { label: "Tiền mặt tại quầy (Cash)", pct: 65, color: "bg-[#059669]" },
                { label: "Chuyển khoản (VietQR)", pct: 25, color: "bg-sky-500" },
                { label: "Thẻ ngân hàng (POS Tap)", pct: 10, color: "bg-amber-500" },
              ].map((p) => (
                <div key={p.label}>
                  <div className="flex justify-between text-[11px] font-medium text-neutral-600">
                    <span>{p.label}</span>
                    <span className="font-bold text-neutral-900">{p.pct}%</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                    <div className={`h-full rounded-full ${p.color}`} style={{ width: `${p.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-xl bg-neutral-50 p-3 text-[11px] text-neutral-500">
              <div className="font-bold text-neutral-800">Ghi chú đối soát ca:</div>
              <p className="mt-0.5">Tiền mặt thực tế trong két phải khớp chính xác với số dư đầu ca cộng tổng doanh thu tiền mặt.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
