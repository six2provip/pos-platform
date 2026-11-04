"use client";

import React, { useState } from "react";
import { motion } from "motion/react";
import {
  Users,
  Search,
  UserPlus,
  Phone,
  Sparkles,
  Award,
  CheckCircle2,
  Plus,
} from "lucide-react";
import { CustomerItem } from "./pos-data";

interface PosViewCustomersProps {
  customers: CustomerItem[];
  selectedCustomerId: string;
  onSelectCustomer: (cust: CustomerItem) => void;
  onAttachCustomerToCart: (cust: CustomerItem) => void;
  isPortrait: boolean;
}

export function PosViewCustomers({
  customers,
  selectedCustomerId,
  onSelectCustomer,
  onAttachCustomerToCart,
  isPortrait,
}: PosViewCustomersProps) {
  const [filterTier, setFilterTier] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCustomers = customers.filter((c) => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || c.name.toLowerCase().includes(q) || c.phone.includes(q);
    if (!matchSearch) return false;
    if (filterTier === "all") return true;
    return c.tier.toLowerCase().includes(filterTier.toLowerCase());
  });

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-neutral-900">
            Khách Hàng Thân Thiết & Tích Điểm
          </h1>
          <p className="text-[11px] text-neutral-400">
            Tra cứu nhanh số điện thoại để áp dụng hạng thẻ VIP và tích lũy điểm thưởng
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-[#E6F6F0] px-3 py-1.5 text-xs font-bold text-[#059669]">
            {customers.length} thành viên đã đăng ký
          </div>
        </div>
      </div>

      {/* Filter Chips & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2">
        <div className="flex items-center gap-1.5 rounded-xl border border-neutral-200/80 bg-white p-1">
          {[
            { id: "all", label: "Tất cả" },
            { id: "diamond", label: "VIP Diamond (-15%)" },
            { id: "gold", label: "VIP Gold (-10%)" },
            { id: "thành viên", label: "Thành Viên (-5%)" },
          ].map((tab) => {
            const isActive = filterTier === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setFilterTier(tab.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  isActive ? "bg-[#059669] text-white shadow-sm" : "text-neutral-600 hover:text-neutral-900"
                }`}
              >
                {tab.label}
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
            placeholder="Tìm theo tên hoặc số điện thoại..."
            className="w-full rounded-xl border border-neutral-200/90 bg-white pl-8 pr-3 py-1.5 text-xs text-neutral-800 placeholder:text-neutral-400 shadow-sm focus:border-[#059669] focus:outline-none"
          />
        </div>
      </div>

      {/* Customer Cards Grid */}
      <div className="mt-2 flex-1 overflow-y-auto pr-1">
        <div className={`grid gap-3 ${isPortrait ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"}`}>
          {filteredCustomers.map((cust) => {
            const isSelected = cust.id === selectedCustomerId;
            const isDiamond = cust.tier.includes("Diamond");
            const isGold = cust.tier.includes("Gold");

            return (
              <motion.div
                key={cust.id}
                whileHover={{ y: -2 }}
                onClick={() => onSelectCustomer(cust)}
                className={`flex cursor-pointer flex-col justify-between rounded-2xl border p-4 shadow-sm transition-all ${
                  isSelected
                    ? "border-[#059669] ring-2 ring-[#059669]/20 bg-white"
                    : "border-neutral-100 bg-white hover:border-neutral-200"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E6F6F0] font-bold text-[#059669] shadow-sm">
                        {cust.name.slice(0, 1)}
                      </div>
                      <div>
                        <div className="text-xs font-extrabold text-neutral-900">{cust.name}</div>
                        <div className="flex items-center gap-1 text-[11px] font-mono text-neutral-400">
                          <Phone className="h-3 w-3" />
                          <span>{cust.phone}</span>
                        </div>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ${
                        isDiamond
                          ? "bg-purple-100 text-purple-900"
                          : isGold
                          ? "bg-amber-100 text-amber-900"
                          : "bg-emerald-100 text-emerald-900"
                      }`}
                    >
                      <Award className="h-3 w-3" />
                      {cust.tier}
                    </span>
                  </div>

                  <div className="mt-3.5 grid grid-cols-3 gap-2 rounded-xl bg-neutral-50 p-2.5 text-center">
                    <div>
                      <div className="text-[10px] text-neutral-400">Giảm giá</div>
                      <div className="text-xs font-bold text-[#059669]">-{cust.discountPercent}%</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-neutral-400">Điểm thưởng</div>
                      <div className="text-xs font-bold text-neutral-800">{cust.points} pts</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-neutral-400">Tổng đơn</div>
                      <div className="text-xs font-bold text-neutral-800">{cust.totalOrders} đơn</div>
                    </div>
                  </div>
                </div>

                <div className="mt-3.5 pt-1">
                  <motion.button
                    whileTap={{ scale: 0.94 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAttachCustomerToCart(cust);
                    }}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#E6F6F0] py-2 text-xs font-bold text-[#059669] transition-all hover:bg-[#059669] hover:text-white"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Áp dụng cho Hóa Đơn (-{cust.discountPercent}%)</span>
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
