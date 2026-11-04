"use client";

import React, { useState } from "react";
import { motion } from "motion/react";
import {
  Settings,
  Printer,
  Barcode,
  CreditCard,
  Volume2,
  VolumeX,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Monitor,
} from "lucide-react";

interface PosViewSettingsProps {
  storeCode: string;
  storeName: string;
  orgName: string;
  onTestPrintReceipt: () => void;
  onTestCashDrawer: () => void;
  isPortrait: boolean;
}

export function PosViewSettings({
  storeCode,
  storeName,
  orgName,
  onTestPrintReceipt,
  onTestCashDrawer,
  isPortrait,
}: PosViewSettingsProps) {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoCutPaper, setAutoCutPaper] = useState(true);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-neutral-900">
            Cài Đặt Phần Cứng & Thiết Bị POS
          </h1>
          <p className="text-[11px] text-neutral-400">
            Cấu hình máy in K80, két tiền RJ11, súng quét mã vạch và thông tin trạm thu ngân
          </p>
        </div>

        <div className="flex items-center gap-1.5 rounded-xl bg-[#E6F6F0] px-3 py-1.5 text-xs font-bold text-[#059669]">
          <ShieldCheck className="h-4 w-4" />
          <span>Trạm POS: Sẵn Sàng</span>
        </div>
      </div>

      {/* Settings Grid */}
      <div className="mt-2 flex-1 overflow-y-auto pr-1">
        <div className={`grid gap-3.5 ${isPortrait ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"}`}>
          {/* Card 1: Thermal Printer K80 */}
          <div className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E6F6F0] text-[#059669]">
                <Printer className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-extrabold text-neutral-900">Máy In Nhiệt K80 (80mm Thermal)</div>
                <div className="text-[11px] text-neutral-400">Giao thức: ESC/POS qua cổng USB / LAN</div>
              </div>
            </div>

            <div className="mt-4 space-y-2 border-t border-neutral-100 pt-3">
              <div className="flex items-center justify-between text-xs text-neutral-600">
                <span>Tự động cắt giấy sau khi in</span>
                <button
                  type="button"
                  onClick={() => setAutoCutPaper(!autoCutPaper)}
                  className={`h-5 w-9 rounded-full transition-colors relative ${autoCutPaper ? "bg-[#059669]" : "bg-neutral-300"}`}
                >
                  <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${autoCutPaper ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
              </div>
            </div>

            <div className="mt-4">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={onTestPrintReceipt}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#E6F6F0] py-2 text-xs font-bold text-[#059669] hover:bg-[#059669] hover:text-white"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>In Thử Trang Test K80</span>
              </motion.button>
            </div>
          </div>

          {/* Card 2: Cash Drawer RJ11 */}
          <div className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E6F6F0] text-[#059669]">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-extrabold text-neutral-900">Ngăn Kéo Đựng Tiền (Cash Drawer)</div>
                <div className="text-[11px] text-neutral-400">Cổng kích: RJ11 nối tiếp qua máy in nhiệt</div>
              </div>
            </div>

            <div className="mt-4 space-y-2 border-t border-neutral-100 pt-3">
              <div className="flex items-center justify-between text-xs text-neutral-600">
                <span>Tự động bung két khi in hóa đơn</span>
                <span className="font-bold text-[#059669]">Bật (Mặc định)</span>
              </div>
            </div>

            <div className="mt-4">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={onTestCashDrawer}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#E6F6F0] py-2 text-xs font-bold text-[#059669] hover:bg-[#059669] hover:text-white"
              >
                <CreditCard className="h-3.5 w-3.5" />
                <span>Bấm Bung Két Tiền Ngay</span>
              </motion.button>
            </div>
          </div>

          {/* Card 3: Barcode Scanner */}
          <div className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E6F6F0] text-[#059669]">
                <Barcode className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-extrabold text-neutral-900">Súng Quét Barcode (USB HID)</div>
                <div className="text-[11px] text-neutral-400">Tự động nhận diện mã EAN-13, SKU, Code-128</div>
              </div>
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              Súng quét hoạt động theo cơ chế bàn phím ảo (Virtual Key Stroke), khi quét sẽ lập tức tự động thêm món vào đơn.
            </p>
          </div>

          {/* Card 4: Station Info & Sound */}
          <div className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E6F6F0] text-[#059669]">
                <Monitor className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-extrabold text-neutral-900">Thông Tin Trạm POS</div>
                <div className="text-[11px] text-neutral-400">{storeName} ({storeCode})</div>
              </div>
            </div>

            <div className="mt-4 space-y-2 border-t border-neutral-100 pt-3">
              <div className="flex items-center justify-between text-xs text-neutral-600">
                <span>Âm thanh phản hồi khi chạm</span>
                <button
                  type="button"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`h-5 w-9 rounded-full transition-colors relative ${soundEnabled ? "bg-[#059669]" : "bg-neutral-300"}`}
                >
                  <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${soundEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
