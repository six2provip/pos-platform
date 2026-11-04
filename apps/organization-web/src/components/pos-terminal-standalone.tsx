"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Clock,
  Copy,
  ExternalLink,
  Laptop,
  Maximize2,
  Minimize2,
  Radio,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  Wifi,
} from "lucide-react";
import { fireSuccessConfetti } from "@/components/ui/confetti";
import { PosLcdSimulator } from "./pos-lcd-simulator";
import {
  SimulatorCartItem,
  SimulatorOrderRecord,
  SimulatorOutboxOrder,
  SimulatorVariantItem,
} from "./pos-types";

interface PairingSessionData {
  session_id: string;
  pairing_code: string;
  formatted_code: string;
  expires_in_seconds: number;
  expires_at: string;
}

interface PairedStore {
  id: string;
  code: string;
  name: string;
}

interface PairedOrg {
  id: string;
  code: string;
  name: string;
}

interface PairedDevice {
  id: string;
  device_code: string;
  name: string;
  status: string;
  platform: string;
}

export default function PosTerminalStandalone() {
  const [mounted, setMounted] = useState(false);
  const [session, setSession] = useState<PairingSessionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [clockStr, setClockStr] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(900);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Paired state
  const [isPaired, setIsPaired] = useState(false);
  const [pairedDevice, setPairedDevice] = useState<PairedDevice | null>(null);
  const [pairedStore, setPairedStore] = useState<PairedStore | null>(null);
  const [pairedOrg, setPairedOrg] = useState<PairedOrg | null>(null);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);

  // Cashier state when paired
  const [cart, setCart] = useState<SimulatorCartItem[]>([]);
  const [orders, setOrders] = useState<SimulatorOrderRecord[]>([]);
  const [outboxQueue, setOutboxQueue] = useState<SimulatorOutboxOrder[]>([]);
  const [offlineMode, setOfflineMode] = useState(false);
  const [tenderedCash, setTenderedCash] = useState<number | null>(null);
  const [recentOrderSuccess, setRecentOrderSuccess] = useState<SimulatorOrderRecord | null>(null);

  // Digital clock
  useEffect(() => {
    setMounted(true);
    const updateTime = () => {
      const now = new Date();
      setClockStr(
        now.toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Restore existing pairing from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const savedDevStr = localStorage.getItem("pos_terminal_paired_device");
      const savedStoreStr = localStorage.getItem("pos_terminal_store");
      const savedOrgStr = localStorage.getItem("pos_terminal_org");
      const savedToken = localStorage.getItem("pos_terminal_token");

      if (savedDevStr && savedStoreStr && savedToken) {
        setPairedDevice(JSON.parse(savedDevStr));
        setPairedStore(JSON.parse(savedStoreStr));
        if (savedOrgStr) setPairedOrg(JSON.parse(savedOrgStr));
        setDeviceToken(savedToken);
        setIsPaired(true);
      }
    } catch {
      // ignore JSON parse errors
    }
  }, []);

  // Create a new pairing session from backend
  const requestPairingSession = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/devices/pairing-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_info: {
            device_model: "Android POS Smart Terminal (Kiosk)",
            os: "Android 13 (AOSP)",
            app_version: "2.4.0",
            screen_resolution:
              typeof window !== "undefined"
                ? `${window.screen.width}x${window.screen.height}`
                : "1920x1080",
          },
        }),
      });
      const json = await res.json();
      const data = json.data || json;
      if (data && data.pairing_code) {
        setSession(data);
        setSecondsLeft(data.expires_in_seconds || 900);
      }
    } catch (err) {
      console.error("Lỗi khi sinh mã ghép nối thiết bị:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto request pairing session if not paired and no session
  useEffect(() => {
    if (!isPaired && !session && mounted) {
      requestPairingSession();
    }
  }, [isPaired, session, mounted, requestPairingSession]);

  // Countdown timer for pairing code
  useEffect(() => {
    if (isPaired || !session) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          requestPairingSession();
          return 900;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPaired, session, requestPairingSession]);

  // Real-time Polling for Pairing confirmation
  useEffect(() => {
    if (isPaired || !session) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/v1/devices/pairing-session/${session.session_id}`
        );
        if (!res.ok) return;
        const json = await res.json();
        const data = json.data || json;

        if (data && data.status === "paired") {
          // Success! Claimed by Org Admin
          clearInterval(interval);
          fireSuccessConfetti();

          const dev = data.device;
          const st = data.store;
          const org = data.organization;
          const token = data.access_token;

          setPairedDevice(dev);
          setPairedStore(st);
          setPairedOrg(org);
          setDeviceToken(token);
          setIsPaired(true);

          if (typeof window !== "undefined") {
            localStorage.setItem("pos_terminal_paired_device", JSON.stringify(dev));
            localStorage.setItem("pos_terminal_store", JSON.stringify(st));
            localStorage.setItem("pos_terminal_org", JSON.stringify(org));
            localStorage.setItem("pos_terminal_token", token);
          }
        }
      } catch {
        // Polling network drop ignore
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [isPaired, session]);

  // Handle Unpair / Reset to test again
  const handleResetTerminal = () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Bạn có chắc muốn hủy ghép nối máy POS này để test lại từ đầu?")
    ) {
      return;
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem("pos_terminal_paired_device");
      localStorage.removeItem("pos_terminal_store");
      localStorage.removeItem("pos_terminal_org");
      localStorage.removeItem("pos_terminal_token");
    }
    setIsPaired(false);
    setPairedDevice(null);
    setPairedStore(null);
    setPairedOrg(null);
    setDeviceToken(null);
    setCart([]);
    requestPairingSession();
  };

  const handleCopyCode = () => {
    if (!session) return;
    navigator.clipboard.writeText(session.pairing_code);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Mock catalog when paired
  const sampleVariants: SimulatorVariantItem[] = useMemo(
    () => [
      {
        productId: "p1",
        productCode: "CAFE-DEN",
        productName: "Cà Phê Đen Đá Pha Phin",
        variantId: "v1",
        variantName: "Ly Vừa (M)",
        sku: "CF-DEN-M",
        barcode: "8935001001",
        price: 29000,
        onHand: 120,
      },
      {
        productId: "p2",
        productCode: "CAFE-SUA",
        productName: "Cà Phê Sữa Đá Sài Gòn",
        variantId: "v2",
        variantName: "Ly Vừa (M)",
        sku: "CF-SUA-M",
        barcode: "8935001002",
        price: 35000,
        onHand: 85,
      },
      {
        productId: "p3",
        productCode: "BAC-XIU",
        productName: "Bạc Xỉu 3 Tầng Kem Sữa",
        variantId: "v3",
        variantName: "Ly Lớn (L)",
        sku: "BAC-XIU-L",
        barcode: "8935001003",
        price: 39000,
        onHand: 40,
      },
      {
        productId: "p4",
        productCode: "TRA-DAO",
        productName: "Trà Đào Cam Sả Tươi",
        variantId: "v4",
        variantName: "Ly Lớn (L)",
        sku: "TR-DAO-L",
        barcode: "8935001004",
        price: 45000,
        onHand: 60,
      },
      {
        productId: "p5",
        productCode: "BANH-MI",
        productName: "Bánh Mì Thịt Nướng Giòn Rụm",
        variantId: "v5",
        variantName: "Tiêu Chuẩn",
        sku: "BM-THIT-TC",
        barcode: "8935001005",
        price: 32000,
        onHand: 25,
      },
      {
        productId: "p6",
        productCode: "CROISSANT",
        productName: "Bánh Sừng Bò Bơ Pháp (Croissant)",
        variantId: "v6",
        variantName: "Ổ Lớn",
        sku: "BK-CROIS-01",
        barcode: "8935001006",
        price: 38000,
        onHand: 18,
      },
    ],
    []
  );

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [cart]
  );

  const handleAddToCart = (v: SimulatorVariantItem) => {
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.variantId === v.variantId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [
        ...prev,
        {
          variantId: v.variantId,
          productName: v.productName,
          variantName: v.variantName,
          sku: v.sku,
          unitPrice: v.price,
          quantity: 1,
        },
      ];
    });
  };

  const handleUpdateCartQty = (variantId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.variantId === variantId
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const handleClearCart = () => setCart([]);

  const handleCheckoutCash = () => {
    if (cart.length === 0) return;
    const nowIso = new Date().toISOString();
    const orderNum = `POS-${Date.now().toString().slice(-6)}`;
    const paid = tenderedCash && tenderedCash >= cartTotal ? tenderedCash : cartTotal;
    const change = paid - cartTotal;

    const newRecord: SimulatorOrderRecord = {
      id: `ord_${Date.now()}`,
      order_number: orderNum,
      store_id: pairedStore?.id || "store",
      status: "completed",
      payment_status: "paid",
      total_amount: cartTotal.toString(),
      paid_amount: paid.toString(),
      change_amount: change.toString(),
      occurred_at: nowIso,
    };

    setOrders((prev) => [newRecord, ...prev]);
    setRecentOrderSuccess(newRecord);
    setCart([]);
    setTenderedCash(null);
    fireSuccessConfetti();
  };

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-white font-mono text-sm">
        Đang khởi động phần mềm POS Terminal...
      </div>
    );
  }

  // =========================================================================
  // VIEW 1: UNPAIRED HARDWARE TERMINAL KIOSK (REAL 6-DIGIT CODE & POLLING)
  // =========================================================================
  if (!isPaired) {
    const rawCode = session?.pairing_code || "------";
    const digits = rawCode.split("");

    const minStr = Math.floor(secondsLeft / 60)
      .toString()
      .padStart(2, "0");
    const secStr = (secondsLeft % 60).toString().padStart(2, "0");

    return (
      <div className="flex min-h-screen flex-col bg-[#0B0F17] text-white select-none">
        {/* Top Hardware Kiosk Status Bar */}
        <header className="flex h-12 items-center justify-between border-b border-neutral-800 bg-[#0F1420] px-4 text-xs font-mono text-neutral-400">
          <div className="flex items-center gap-3">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-bold text-white tracking-wide">
              POS.com Hardware Terminal
            </span>
            <span className="rounded bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-300">
              Android 13 AOSP • Sunmi/Pax Kiosk Mode
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <Wifi className="h-3.5 w-3.5" />
              <span>Wi-Fi 5GHz</span>
            </div>
            <div className="flex items-center gap-1 text-neutral-300">
              <Clock className="h-3.5 w-3.5" />
              <span>{clockStr || "12:00:00"}</span>
            </div>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
              title="Toàn màn hình Kiosk"
            >
              {isFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </header>

        {/* Main Kiosk Center Screen */}
        <main className="flex flex-1 items-center justify-center p-4 sm:p-8">
          <div className="relative w-full max-w-2xl rounded-3xl border border-neutral-800 bg-gradient-to-b from-neutral-900/90 to-neutral-950 p-6 sm:p-10 shadow-2xl backdrop-blur-xl">
            {/* Header Badge & Title */}
            <div className="text-center space-y-3">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shadow-lg shadow-emerald-500/10">
                <Radio className="h-8 w-8 animate-pulse text-emerald-400" />
              </div>

              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                  MÁY POS CHƯA KÍCH HOẠT • CHỜ GHÉP NỐI
                </span>
                <h1 className="mt-3 text-2xl sm:text-3xl font-black tracking-tight text-white">
                  Kích Hoạt Máy POS Tại Quầy
                </h1>
                <p className="mt-2 text-xs sm:text-sm text-neutral-400 max-w-lg mx-auto leading-relaxed">
                  Thiết bị này chưa thuộc chi nhánh nào. Mở trang{" "}
                  <strong className="text-white font-semibold">
                    Web Quản Trị Tổ Chức (:13000)
                  </strong>{" "}
                  → vào mục <strong className="text-emerald-400">Chi nhánh</strong>{" "}
                  → bấm <strong className="text-white">+ Ghép Nối Máy POS</strong> và
                  nhập mã 6 chữ số dưới đây:
                </p>
              </div>
            </div>

            {/* 6-DIGIT PIN DISPLAY IN ILLUMINATED HARDWARE SLOTS */}
            <div className="mt-8 rounded-2xl border border-neutral-800 bg-[#090D14] p-6 text-center shadow-inner">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mb-4">
                MÃ GHÉP NỐI THIẾT BỊ NÀY
              </div>

              {loading ? (
                <div className="py-6 font-mono text-lg text-neutral-400 flex items-center justify-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-emerald-400" />
                  Đang tạo phiên ghép nối mới...
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 sm:gap-3.5">
                  {/* First 3 digits */}
                  {digits.slice(0, 3).map((d, i) => (
                    <div
                      key={`d1-${i}`}
                      className="flex h-16 w-12 sm:h-20 sm:w-16 items-center justify-center rounded-xl border-2 border-emerald-500/50 bg-emerald-950/20 text-3xl sm:text-4xl font-mono font-black text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)] transition-transform transform hover:scale-105"
                    >
                      {d}
                    </div>
                  ))}

                  <div className="text-2xl font-bold text-neutral-600 px-1 select-none">
                    –
                  </div>

                  {/* Last 3 digits */}
                  {digits.slice(3, 6).map((d, i) => (
                    <div
                      key={`d2-${i}`}
                      className="flex h-16 w-12 sm:h-20 sm:w-16 items-center justify-center rounded-xl border-2 border-emerald-500/50 bg-emerald-950/20 text-3xl sm:text-4xl font-mono font-black text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)] transition-transform transform hover:scale-105"
                    >
                      {d}
                    </div>
                  ))}
                </div>
              )}

              {/* Status and countdown */}
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-xs text-neutral-400">
                <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                  Đang chờ Quản trị viên nhập mã xác nhận...
                </div>
                <span>•</span>
                <div className="text-neutral-500">
                  Hiệu lực còn:{" "}
                  <strong className="font-mono text-neutral-300">
                    {minStr}:{secStr}
                  </strong>
                </div>
              </div>
            </div>

            {/* Quick Action Buttons for Testing */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleCopyCode}
                className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-700 hover:text-white transition-colors"
              >
                {copySuccess ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    Đã chép mã {session?.pairing_code}
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Sao chép mã 6 số
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={requestPairingSession}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-700 hover:text-white transition-colors"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
                />
                Làm mới mã
              </button>

              <a
                href="/stores"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-neutral-950 hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20"
              >
                <Laptop className="h-3.5 w-3.5" />
                Mở Web Quản Trị để ghép nối ngay →
              </a>
            </div>

            {/* How-to Guide Tip */}
            <div className="mt-8 rounded-xl border border-neutral-800/80 bg-neutral-900/50 p-4 text-xs text-neutral-400">
              <div className="font-semibold text-neutral-200 mb-1 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                Cách test thật 2 màn hình cùng lúc:
              </div>
              <ul className="list-disc pl-4 space-y-1 text-neutral-400 text-[11px]">
                <li>
                  <strong>Trên máy tính:</strong> Kéo tab này sang nửa màn hình bên
                  trái. Mở thêm 1 tab Web Admin ở nửa màn hình bên phải.
                </li>
                <li>
                  <strong>Trên điện thoại:</strong> Kết nối chung Wi-Fi và truy cập{" "}
                  <code className="text-emerald-400 font-mono">
                    http://192.168.1.14:13000/terminal
                  </code>
                  .
                </li>
              </ul>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: ACTIVATED & PAIRED POS TERMINAL (FULL CASHIER EXPERIENCE)
  // =========================================================================
  return (
    <div className="flex min-h-screen flex-col bg-neutral-950 text-white">
      {/* Top Bar for Hardware Terminal */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-neutral-800 bg-[#0F1420] px-4 text-xs font-mono">
        <div className="flex items-center gap-3">
          <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <div className="flex items-center gap-2">
            <span className="font-bold text-white tracking-wide">
              {pairedDevice?.name || "Máy POS Thu Ngân Quầy"}
            </span>
            <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-300">
              {pairedDevice?.device_code || "POS-TERMINAL"}
            </span>
          </div>
          <span className="text-neutral-500">•</span>
          <div className="flex items-center gap-1.5 text-emerald-400">
            <Store className="h-3.5 w-3.5" />
            <span className="font-semibold">{pairedStore?.name}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-neutral-400 text-[11px]">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>Kích hoạt qua mã PIN 6 số an toàn</span>
          </div>

          <button
            type="button"
            onClick={handleResetTerminal}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/20 transition-colors"
            title="Hủy ghép nối thiết bị này để kiểm tra lại luồng ban đầu"
          >
            <RotateCcw className="h-3 w-3" />
            Reset máy POS để test lại
          </button>
        </div>
      </header>

      {/* Embedded LCD Cashier POS Simulator */}
      <div className="flex-1 overflow-auto bg-neutral-950 p-2 sm:p-4">
        <PosLcdSimulator
          storeCode={pairedStore?.code || "DEMO-S1"}
          storeName={pairedStore?.name || "Chi nhánh chính"}
          orgName={pairedOrg?.name || "POS Organization"}
          variants={sampleVariants}
          cart={cart}
          orders={orders}
          outboxQueue={outboxQueue}
          offlineMode={offlineMode}
          loading={false}
          activeCashSession={{
            id: "cs_active",
            opening_amount: "1000000",
            status: "opened",
          }}
          onAddToCart={handleAddToCart}
          onUpdateCartQty={handleUpdateCartQty}
          onClearCart={handleClearCart}
          onCheckoutOrder={async (tenderedCash?: number) => {
            if (cart.length === 0) return;
            const nowIso = new Date().toISOString();
            const orderNum = `POS-${Date.now().toString().slice(-6)}`;
            const paid = tenderedCash && tenderedCash >= cartTotal ? tenderedCash : cartTotal;
            const change = paid - cartTotal;

            const newRecord: SimulatorOrderRecord = {
              id: `ord_${Date.now()}`,
              order_number: orderNum,
              store_id: pairedStore?.id || "store",
              status: "completed",
              payment_status: "paid",
              total_amount: cartTotal.toString(),
              paid_amount: paid.toString(),
              change_amount: change.toString(),
              occurred_at: nowIso,
            };

            setOrders((prev) => [newRecord, ...prev]);
            setRecentOrderSuccess(newRecord);
            setCart([]);
            setTenderedCash(null);
            fireSuccessConfetti();
          }}
          onFlushOutbox={async () => {}}
          onToggleOffline={() => setOfflineMode((prev) => !prev)}
          onOpenCashSession={() => {}}
        />
      </div>
    </div>
  );
}
