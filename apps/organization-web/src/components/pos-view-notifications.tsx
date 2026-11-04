"use client";

import React from "react";
import { motion } from "motion/react";
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  Printer,
  Trash2,
  Clock,
  Sparkles,
} from "lucide-react";
import { NotificationItem } from "./pos-data";

interface PosViewNotificationsProps {
  notifications: NotificationItem[];
  onMarkAllAsRead: () => void;
  onClearNotifications: () => void;
  isPortrait: boolean;
}

export function PosViewNotifications({
  notifications,
  onMarkAllAsRead,
  onClearNotifications,
  isPortrait,
}: PosViewNotificationsProps) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-neutral-900">
            Trung Tâm Thông Báo & Cảnh Báo
          </h1>
          <p className="text-[11px] text-neutral-400">
            Cập nhật thời gian thực về giao dịch, tồn kho và trạng thái kết nối phần cứng
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onMarkAllAsRead}
            className="rounded-xl border border-neutral-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            Đánh dấu đã đọc
          </button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="mt-2 flex-1 overflow-y-auto pr-1">
        <div className="space-y-2.5">
          {notifications.map((item) => {
            const isStock = item.type === "stock";
            const isOrder = item.type === "order";
            const isSync = item.type === "sync";

            return (
              <motion.div
                key={item.id}
                whileHover={{ y: -1 }}
                className={`flex items-start gap-3.5 rounded-2xl border p-4 shadow-sm transition-all ${
                  item.read ? "border-neutral-100 bg-white" : "border-[#059669]/40 bg-[#E6F6F0]/20"
                }`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    isStock
                      ? "bg-amber-100 text-amber-800"
                      : isOrder
                      ? "bg-[#E6F6F0] text-[#059669]"
                      : isSync
                      ? "bg-sky-100 text-sky-800"
                      : "bg-neutral-100 text-neutral-700"
                  }`}
                >
                  {isStock ? (
                    <AlertTriangle className="h-5 w-5" />
                  ) : isOrder ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : isSync ? (
                    <Wifi className="h-5 w-5" />
                  ) : (
                    <Printer className="h-5 w-5" />
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-neutral-900">{item.title}</span>
                    <span className="flex items-center gap-1 text-[10px] text-neutral-400">
                      <Clock className="h-3 w-3" />
                      {item.time}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-600">{item.detail}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
