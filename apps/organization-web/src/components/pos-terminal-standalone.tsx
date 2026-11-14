"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  Ban,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Laptop,
  Lock,
  Maximize2,
  Minimize2,
  Radio,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  Wifi,
  WifiOff,
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
  const [variants, setVariants] = useState<SimulatorVariantItem[]>([]);
  const [activeCashSession, setActiveCashSession] = useState<{
    id: string;
    opening_amount: string;
    status: string;
  } | null>(null);
  const [posLoading, setPosLoading] = useState(false);
  const [terminalNotice, setTerminalNotice] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [cart, setCart] = useState<SimulatorCartItem[]>([]);
  const [orders, setOrders] = useState<SimulatorOrderRecord[]>([]);
  const [outboxQueue, setOutboxQueue] = useState<SimulatorOutboxOrder[]>([]);
  const [offlineMode, setOfflineMode] = useState(false);
  const [tenderedCash, setTenderedCash] = useState<number | null>(null);
  const [recentOrderSuccess, setRecentOrderSuccess] = useState<SimulatorOrderRecord | null>(null);

  // Security Revocation & Offline Grace Period States
  const [isRevoked, setIsRevoked] = useState(false);
  const [revocationInfo, setRevocationInfo] = useState<{
    reason: string;
    revoked_at?: string;
    message?: string;
  } | null>(null);
  const [offlineGraceSeconds, setOfflineGraceSeconds] = useState(7200); // 2 hours
  const [isOfflineGraceExpired, setIsOfflineGraceExpired] = useState(false);

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

  // Restore existing pairing & offline-first cache from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const savedDevStr = localStorage.getItem("pos_terminal_paired_device");
      const savedStoreStr = localStorage.getItem("pos_terminal_store");
      const savedOrgStr = localStorage.getItem("pos_terminal_org");
      const savedToken = localStorage.getItem("pos_terminal_token");
      const savedCatalog = localStorage.getItem("pos_terminal_catalog_cache");
      const savedOutbox = localStorage.getItem("pos_terminal_outbox_queue");
      const savedOrders = localStorage.getItem("pos_terminal_orders_cache");

      if (savedCatalog) setVariants(JSON.parse(savedCatalog));
      if (savedOutbox) setOutboxQueue(JSON.parse(savedOutbox));
      if (savedOrders) setOrders(JSON.parse(savedOrders));

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

  // Persist outbox & orders to localStorage so offline data survives reload
  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    try {
      localStorage.setItem("pos_terminal_outbox_queue", JSON.stringify(outboxQueue));
    } catch {
      // ignore storage quota errors
    }
  }, [outboxQueue, mounted]);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    try {
      localStorage.setItem("pos_terminal_orders_cache", JSON.stringify(orders.slice(0, 50)));
    } catch {
      // ignore storage quota errors
    }
  }, [orders, mounted]);

  const showNotice = useCallback((type: "success" | "error" | "info", text: string) => {
    setTerminalNotice({ type, text });
    setTimeout(() => {
      setTerminalNotice((prev) => (prev?.text === text ? null : prev));
    }, 5000);
  }, []);

  // Authenticated API helper using Device Bearer Token
  const terminalApiFetch = useCallback(
    async (path: string, options: RequestInit = {}) => {
      if (!deviceToken) throw new Error("Thiết bị chưa có token xác thực.");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${deviceToken}`,
        ...(options.headers as Record<string, string> | undefined),
      };
      if (pairedOrg?.id) headers["X-Organization-Id"] = pairedOrg.id;
      if (pairedStore?.id) headers["X-Store-ID"] = pairedStore.id;

      const res = await fetch(path, { ...options, headers });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) {
        const msg = json.message || json.detail || `Lỗi API (${res.status})`;
        throw new Error(msg);
      }
      return json.data !== undefined ? json.data : json;
    },
    [deviceToken, pairedOrg?.id, pairedStore?.id]
  );

  // Fetch real catalog, inventory, active cash session, and recent orders
  const refreshTerminalData = useCallback(async () => {
    if (!isPaired || !deviceToken || !pairedStore?.id || offlineMode || isRevoked) return;
    try {
      const [bootstrapData, inventoryData, ordersData] = await Promise.all([
        terminalApiFetch(`/api/v1/pos/bootstrap?store_id=${encodeURIComponent(pairedStore.id)}`),
        terminalApiFetch(`/api/v1/inventory?store_id=${encodeURIComponent(pairedStore.id)}`).catch(() => []),
        terminalApiFetch(`/api/v1/orders?store_id=${encodeURIComponent(pairedStore.id)}`).catch(() => []),
      ]);

      const invList: any[] = Array.isArray(inventoryData) ? inventoryData : inventoryData?.items || [];
      const invMap = new Map<string, number>();
      invList.forEach((row: any) => {
        invMap.set(row.product_variant_id, Math.floor(Number(row.on_hand_quantity ?? row.quantity ?? 0)));
      });

      const prodMap = new Map<string, any>();
      (bootstrapData?.products || []).forEach((p: any) => prodMap.set(p.id, p));

      const barcodeMap = new Map<string, string>();
      (bootstrapData?.barcodes || []).forEach((b: any) => {
        if (!barcodeMap.has(b.product_variant_id) || b.is_primary) {
          barcodeMap.set(b.product_variant_id, b.barcode);
        }
      });

      const mappedVariants: SimulatorVariantItem[] = (bootstrapData?.variants || [])
        .filter((v: any) => {
          const prod = prodMap.get(v.product_id);
          return v.status === "active" && (!prod || prod.status === "active");
        })
        .map((v: any) => {
          const prod = prodMap.get(v.product_id);
          return {
            productId: v.product_id,
            productCode: prod?.product_code || v.variant_code || "SKU",
            productName: prod?.name || v.variant_name || "Sản phẩm",
            variantId: v.id,
            variantName: v.variant_name || "Tiêu chuẩn",
            sku: v.sku || v.variant_code || "",
            barcode: barcodeMap.get(v.id) || v.sku || "",
            price: Number(v.default_price || 0),
            onHand: invMap.has(v.id) ? (invMap.get(v.id) as number) : 0,
          };
        });

      setVariants(mappedVariants);
      if (typeof window !== "undefined") {
        localStorage.setItem("pos_terminal_catalog_cache", JSON.stringify(mappedVariants));
      }

      if (bootstrapData?.current_cash_session) {
        setActiveCashSession({
          id: bootstrapData.current_cash_session.id,
          opening_amount: String(bootstrapData.current_cash_session.opening_amount || "0"),
          status: bootstrapData.current_cash_session.status,
        });
      } else {
        setActiveCashSession(null);
      }

      const ordList: any[] = Array.isArray(ordersData) ? ordersData : ordersData?.items || [];
      if (ordList.length > 0) {
        const mappedOrders: SimulatorOrderRecord[] = ordList.slice(0, 50).map((o: any) => ({
          id: o.id,
          order_number: o.order_number,
          store_id: o.store_id,
          status: o.status,
          payment_status: o.payment_status,
          total_amount: String(o.total_amount || "0"),
          paid_amount: String(o.paid_amount || o.total_amount || "0"),
          change_amount: String(o.change_amount || "0"),
          occurred_at: o.occurred_at || o.created_at,
        }));
        setOrders(mappedOrders);
      }
    } catch (err) {
      console.warn("Không thể tải dữ liệu POS bootstrap:", err);
    }
  }, [isPaired, deviceToken, pairedStore?.id, offlineMode, isRevoked, terminalApiFetch]);

  useEffect(() => {
    if (isPaired && deviceToken && pairedStore?.id && !offlineMode && !isRevoked) {
      refreshTerminalData();
    }
  }, [isPaired, deviceToken, pairedStore?.id, offlineMode, isRevoked, refreshTerminalData]);

  // Open real cash session on backend
  const handleOpenCashSession = useCallback(async () => {
    if (!pairedStore?.id) return;
    if (offlineMode) {
      showNotice("error", "Cần kết nối mạng để mở ca thu ngân mới trên hệ thống.");
      return;
    }
    setPosLoading(true);
    try {
      const drawers = await terminalApiFetch(
        `/api/v1/cash-drawers?store_id=${encodeURIComponent(pairedStore.id)}`
      ).catch(() => []);
      const drawerList = Array.isArray(drawers) ? drawers : drawers?.items || [];
      let drawerId = drawerList[0]?.id;
      if (!drawerId) {
        const createdDrawer = await terminalApiFetch("/api/v1/cash-drawers", {
          method: "POST",
          body: JSON.stringify({
            store_id: pairedStore.id,
            code: `DRW-${Date.now().toString().slice(-4)}`,
            name: "Ngăn kéo thu ngân chính",
          }),
        });
        drawerId = createdDrawer.id;
      }

      const opened = await terminalApiFetch("/api/v1/cash-sessions/open", {
        method: "POST",
        body: JSON.stringify({
          store_id: pairedStore.id,
          cash_drawer_id: drawerId,
          opening_amount: "1000000.0000",
        }),
      });
      setActiveCashSession({
        id: opened.id,
        opening_amount: String(opened.opening_amount || "1000000"),
        status: opened.status || "open",
      });
      showNotice("success", "Đã mở ca thu ngân thành công (1.000.000₫ đầu ca)!");
    } catch (err: any) {
      showNotice("error", err?.message || "Không thể mở ca thu ngân.");
    } finally {
      setPosLoading(false);
    }
  }, [pairedStore?.id, offlineMode, terminalApiFetch, showNotice]);

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

  // Real-time device status check (revocation / deletion by admin)
  const verifyDeviceStatus = useCallback(async (deviceId: string) => {
    try {
      const res = await fetch(`/api/v1/devices/check-status/${deviceId}`);
      if (!res.ok) return;
      const json = await res.json();
      const data = json.data || json;
      if (data && data.is_active === false) {
        setIsRevoked(true);
        setRevocationInfo({
          reason: data.reason || "admin_revoked",
          revoked_at: data.revoked_at || new Date().toISOString(),
          message: data.message || "Thiết bị này đã bị ngắt kết nối hoặc xóa khỏi hệ thống.",
        });
        // Clear saved pairing credentials so reload stays locked
        if (typeof window !== "undefined") {
          localStorage.removeItem("pos_terminal_paired_device");
          localStorage.removeItem("pos_terminal_token");
        }
      }
    } catch {
      // Polling network drop (will be guarded by offline grace period)
    }
  }, []);

  // Heartbeat Polling: Every 2s when online & paired
  useEffect(() => {
    if (!isPaired || !pairedDevice?.id || offlineMode || isRevoked) return;

    verifyDeviceStatus(pairedDevice.id);

    const interval = setInterval(() => {
      verifyDeviceStatus(pairedDevice.id);
    }, 2000);

    return () => clearInterval(interval);
  }, [isPaired, pairedDevice?.id, offlineMode, isRevoked, verifyDeviceStatus]);

  // Offline Grace Period countdown timer: 2 hours (7200s)
  useEffect(() => {
    if (!isPaired || !offlineMode || isRevoked || isOfflineGraceExpired) return;

    const timer = setInterval(() => {
      setOfflineGraceSeconds((prev) => {
        if (prev <= 1) {
          setIsOfflineGraceExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPaired, offlineMode, isRevoked, isOfflineGraceExpired]);

  const clearTerminalStorage = () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem("pos_terminal_paired_device");
    localStorage.removeItem("pos_terminal_store");
    localStorage.removeItem("pos_terminal_org");
    localStorage.removeItem("pos_terminal_token");
    localStorage.removeItem("pos_terminal_catalog_cache");
    localStorage.removeItem("pos_terminal_outbox_queue");
    localStorage.removeItem("pos_terminal_orders_cache");
  };

  // Reconnection catch-up: Check status immediately when reconnecting
  const handleToggleOffline = async () => {
    const nextMode = !offlineMode;
    setOfflineMode(nextMode);

    if (!nextMode && pairedDevice?.id) {
      // Reconnected to network: check if admin revoked device while it was offline
      await verifyDeviceStatus(pairedDevice.id);
      // Reset grace period
      setOfflineGraceSeconds(7200);
      setIsOfflineGraceExpired(false);
    }
  };

  // Full Reset when device is Revoked or Expired -> Return to Pairing Screen
  const handleAcknowledgeAndReset = () => {
    clearTerminalStorage();
    setIsRevoked(false);
    setRevocationInfo(null);
    setIsOfflineGraceExpired(false);
    setOfflineGraceSeconds(7200);
    setIsPaired(false);
    setPairedDevice(null);
    setPairedStore(null);
    setPairedOrg(null);
    setDeviceToken(null);
    setVariants([]);
    setActiveCashSession(null);
    setCart([]);
    setOrders([]);
    setOutboxQueue([]);
    requestPairingSession();
  };

  // Handle Unpair / Reset to test again
  const handleResetTerminal = () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Bạn có chắc muốn hủy ghép nối máy POS này để test lại từ đầu?")
    ) {
      return;
    }
    clearTerminalStorage();
    setIsPaired(false);
    setPairedDevice(null);
    setPairedStore(null);
    setPairedOrg(null);
    setDeviceToken(null);
    setVariants([]);
    setActiveCashSession(null);
    setCart([]);
    setOrders([]);
    setOutboxQueue([]);
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
  // VIEW 0: SECURITY LOCKOUT SCREEN (REVOKED / DELETED / EXPIRED GRACE PERIOD)
  // =========================================================================
  if (isRevoked || isOfflineGraceExpired) {
    const isOfflineExpired = isOfflineGraceExpired && !isRevoked;

    return (
      <div className="flex min-h-screen flex-col bg-[#0B0F17] text-white select-none">
        {/* Top Hardware Kiosk Security Status Bar */}
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-rose-900/50 bg-[#160B0F] px-4 text-xs font-mono text-neutral-400">
          <div className="flex items-center gap-3">
            <span className="flex h-2.5 w-2.5 rounded-full bg-rose-500 animate-ping" />
            <span className="font-bold text-rose-400 tracking-wide flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4" />
              BẢO MẬT HỆ THỐNG • PHONG TỎA THIẾT BỊ
            </span>
            <span className="rounded bg-rose-950/80 border border-rose-800/60 px-2 py-0.5 text-[10px] text-rose-300">
              {isOfflineExpired ? "OFFLINE_GRACE_TIMEOUT" : "HARDWARE_TOKEN_REVOKED"}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 text-neutral-400">
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

        {/* Lockout Center Screen */}
        <main className="flex flex-1 items-center justify-center p-4 sm:p-8">
          <div className="relative w-full max-w-2xl rounded-3xl border-2 border-rose-600/50 bg-gradient-to-b from-[#1C0E12] via-[#120B0E] to-[#0A0708] p-6 sm:p-10 shadow-2xl backdrop-blur-xl shadow-rose-950/40">
            {/* Header Badge & Warning Icon */}
            <div className="text-center space-y-4">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-rose-500/10 border-2 border-rose-500/30 text-rose-500 shadow-xl shadow-rose-500/20">
                <AlertOctagon className="h-10 w-10 text-rose-500 animate-pulse" />
              </div>

              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/20 border border-rose-500/40 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-rose-400">
                  <span className="h-2 w-2 rounded-full bg-rose-400 animate-ping" />
                  {isOfflineExpired ? "CẢNH BÁO HẾT HẠN OFFLINE" : "THIẾT BỊ ĐÃ BỊ THU HỒI / VÔ HIỆU HÓA"}
                </span>

                <h1 className="mt-3 text-2xl sm:text-3xl font-black tracking-tight text-white">
                  {isOfflineExpired ? "Tạm Dừng Hoạt Động Ngoại Tuyến" : "Máy POS Đã Bị Vô Hiệu Hóa"}
                </h1>

                <p className="mt-2 text-xs sm:text-sm text-neutral-300 max-w-lg mx-auto leading-relaxed">
                  {isOfflineExpired
                    ? "Thiết bị này đã hoạt động không có kết nối Internet quá thời gian tối đa cho phép (2 giờ). Nhằm ngăn ngừa rủi ro sai lệch dữ liệu và thất thoát doanh thu, máy POS tạm thời bị phong tỏa cho đến khi có mạng trở lại."
                    : (revocationInfo?.message || "Thiết bị này đã bị Quản trị viên ngắt kết nối hoặc xóa khỏi chi nhánh trên Web Quản Trị Tổ Chức (:13000). Mọi chức năng bán hàng và in hóa đơn tại máy POS này đã bị ngừng hoạt động hoàn toàn.")}
                </p>
              </div>
            </div>

            {/* Hardware Information Audit Card */}
            <div className="mt-8 rounded-2xl border border-rose-900/50 bg-[#14080B] p-5 shadow-inner space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-rose-950/80">
                <span className="text-neutral-400">Mã máy POS (Hardware ID):</span>
                <span className="font-bold text-white bg-neutral-900 px-2 py-0.5 rounded border border-neutral-700">
                  {pairedDevice?.device_code || "POS-TERMINAL"}
                </span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-rose-950/80">
                <span className="text-neutral-400">Tên thiết bị quầy:</span>
                <span className="font-semibold text-neutral-200">
                  {pairedDevice?.name || "Máy POS Quầy"}
                </span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-rose-950/80">
                <span className="text-neutral-400">Chi nhánh trực thuộc:</span>
                <span className="font-semibold text-neutral-200">
                  {pairedStore?.name || "Chi nhánh"} ({pairedStore?.code || "--"})
                </span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-rose-950/80">
                <span className="text-neutral-400">Thời điểm phong tỏa:</span>
                <span className="text-rose-400 font-semibold">
                  {revocationInfo?.revoked_at
                    ? new Date(revocationInfo.revoked_at).toLocaleString("vi-VN")
                    : clockStr}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">Trạng thái an toàn:</span>
                <span className="inline-flex items-center gap-1 font-bold text-rose-400">
                  <Lock className="h-3 w-3" />
                  ĐÃ KHÓA TOÀN BỘ CHỨC NĂNG BÁN HÀNG
                </span>
              </div>
            </div>

            {/* Actions for Cashier / Admin */}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              {isOfflineExpired && (
                <button
                  type="button"
                  onClick={async () => {
                    setOfflineMode(false);
                    if (pairedDevice?.id) {
                      await verifyDeviceStatus(pairedDevice.id);
                    }
                    setOfflineGraceSeconds(7200);
                    setIsOfflineGraceExpired(false);
                  }}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold px-5 py-3 text-xs transition-colors shadow-lg shadow-amber-500/20"
                >
                  <Wifi className="h-4 w-4" />
                  Kết Nối Lại Wi-Fi / Đám Mây Ngay
                </button>
              )}

              <button
                type="button"
                onClick={handleAcknowledgeAndReset}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold px-6 py-3 text-xs transition-colors shadow-lg shadow-rose-600/25"
              >
                <RotateCcw className="h-4 w-4" />
                Khởi Động Lại & Ghép Nối Máy Mới (Nhận Mã 6 Số)
              </button>
            </div>

            <div className="mt-6 text-center text-[11px] text-neutral-500">
              Liên hệ Quản trị viên cửa hàng nếu bạn cho rằng thiết bị này bị khóa do nhầm lẫn.
            </div>
          </div>
        </main>
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
          {offlineMode && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-300">
              <Clock className="h-3.5 w-3.5 text-amber-400" />
              <span>
                Offline Grace:{" "}
                <strong className="font-mono text-white">
                  {Math.floor(offlineGraceSeconds / 60)}p {offlineGraceSeconds % 60}s
                </strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  setOfflineGraceSeconds(0);
                  setIsOfflineGraceExpired(true);
                }}
                className="ml-1 rounded bg-amber-500/30 hover:bg-amber-500/50 px-1.5 py-0.5 text-[10px] text-amber-200 transition-colors"
                title="Giả lập hết hạn 2 giờ offline ngay lập tức để kiểm tra màn hình khóa"
              >
                Test Hết Hạn
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setIsRevoked(true);
              setRevocationInfo({
                reason: "admin_revoked",
                revoked_at: new Date().toISOString(),
                message: "Thiết bị này đã bị Quản trị viên ngắt kết nối hoặc xóa khỏi chi nhánh.",
              });
              if (typeof window !== "undefined") {
                localStorage.removeItem("pos_terminal_paired_device");
                localStorage.removeItem("pos_terminal_token");
              }
            }}
            className="hidden sm:inline-flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1 text-[11px] font-semibold text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors"
            title="Giả lập tình huống Quản trị viên bấm ngắt kết nối hoặc xóa máy POS"
          >
            <Ban className="h-3 w-3 text-rose-400" />
            Test Thu Hồi Máy
          </button>

          <button
            type="button"
            onClick={handleResetTerminal}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/20 transition-colors"
            title="Hủy ghép nối thiết bị này để kiểm tra lại luồng ban đầu"
          >
            <RotateCcw className="h-3 w-3" />
            Reset máy POS
          </button>
        </div>
      </header>

      {/* Status Toast Banner */}
      {terminalNotice && (
        <div
          className={`mx-4 mt-3 flex items-center justify-between rounded-xl border px-4 py-2.5 text-xs font-semibold ${
            terminalNotice.type === "error"
              ? "border-rose-500/40 bg-rose-500/15 text-rose-200"
              : terminalNotice.type === "info"
                ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
                : "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
          }`}
        >
          <span>{terminalNotice.text}</span>
          <button
            type="button"
            onClick={() => setTerminalNotice(null)}
            className="ml-4 text-xs opacity-70 hover:opacity-100"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Embedded LCD Cashier POS Simulator */}
      <div className="flex-1 overflow-auto bg-neutral-950 p-2 sm:p-4">
        <PosLcdSimulator
          storeCode={pairedStore?.code || "DEMO-S1"}
          storeName={pairedStore?.name || "Chi nhánh chính"}
          orgName={pairedOrg?.name || "POS Organization"}
          variants={variants}
          cart={cart}
          orders={orders}
          outboxQueue={outboxQueue}
          offlineMode={offlineMode}
          loading={posLoading}
          activeCashSession={activeCashSession}
          onAddToCart={handleAddToCart}
          onUpdateCartQty={handleUpdateCartQty}
          onClearCart={handleClearCart}
          onCheckoutOrder={async (tenderedCash?: number, paymentMethod: string = "CASH") => {
            if (cart.length === 0 || !pairedStore?.id) return;

            const queueOfflineOrder = (reasonNotice?: string) => {
              const currentOutboxSum = outboxQueue.reduce(
                (sum, o) => sum + (o.total_amount || 0),
                0
              );
              if (outboxQueue.length >= 30) {
                alert(
                  "CẢNH BÁO AN TOÀN OFFLINE: Đã đạt giới hạn tối đa 30 đơn hàng offline chưa đồng bộ. Vui lòng kết nối Internet để đồng bộ dữ liệu trước khi tiếp tục bán hàng!"
                );
                return false;
              }
              if (currentOutboxSum + cartTotal > 5_000_000) {
                alert(
                  "CẢNH BÁO HẠN MỨC OFFLINE: Tổng doanh thu offline chưa đồng bộ vượt mức an toàn 5.000.000₫. Vui lòng kết nối Internet để đồng bộ dữ liệu trước khi tiếp tục bán hàng!"
                );
                return false;
              }

              const nowIso = new Date().toISOString();
              const clientOrderId = `POS-OFF-${Date.now().toString().slice(-6)}`;
              const idemKey = `${pairedOrg?.id || "org"}:pos:${clientOrderId}`;
              const paid = tenderedCash && tenderedCash >= cartTotal ? tenderedCash : cartTotal;
              const change = paid - cartTotal;

              const outboxItem: SimulatorOutboxOrder = {
                event_id: `ev_${Date.now()}`,
                idempotency_key: idemKey,
                client_order_id: clientOrderId,
                store_id: pairedStore.id,
                occurred_at: nowIso,
                total_amount: cartTotal,
                items: cart.map((c) => ({
                  product_variant_id: c.variantId,
                  productName: c.productName,
                  quantity: `${c.quantity}.0000`,
                  unit_price: `${c.unitPrice}.0000`,
                })),
              };

              const localRecord: SimulatorOrderRecord = {
                id: outboxItem.event_id,
                order_number: clientOrderId,
                store_id: pairedStore.id,
                status: "offline_pending",
                payment_status: "paid",
                total_amount: cartTotal.toString(),
                paid_amount: paid.toString(),
                change_amount: change.toString(),
                occurred_at: nowIso,
              };

              // Optimistic local inventory deduction
              setVariants((prev) =>
                prev.map((v) => {
                  const inCart = cart.find((c) => c.variantId === v.variantId);
                  return inCart ? { ...v, onHand: Math.max(0, v.onHand - inCart.quantity) } : v;
                })
              );
              setOutboxQueue((prev) => [outboxItem, ...prev]);
              setOrders((prev) => [localRecord, ...prev]);
              setRecentOrderSuccess(localRecord);
              setCart([]);
              setTenderedCash(null);
              fireSuccessConfetti();
              showNotice(
                "info",
                reasonNotice || `Đã lưu đơn ${clientOrderId} vào hàng đợi Offline Outbox!`
              );
              return true;
            };

            if (offlineMode) {
              queueOfflineOrder();
              return;
            }

            setPosLoading(true);
            try {
              const clientOrderId = `POS-${Date.now()}`;
              const idemKey = `${pairedOrg?.id || "org"}:pos:${clientOrderId}`;
              const paid = tenderedCash && tenderedCash >= cartTotal ? tenderedCash : cartTotal;

              const orderData = await terminalApiFetch("/api/v1/orders", {
                method: "POST",
                headers: {
                  "Idempotency-Key": idemKey,
                },
                body: JSON.stringify({
                  store_id: pairedStore.id,
                  client_order_id: clientOrderId,
                  items: cart.map((c) => ({
                    product_variant_id: c.variantId,
                    quantity: `${c.quantity}.0000`,
                  })),
                  payments: [
                    {
                      payment_method_code: paymentMethod,
                      amount: `${paid}.0000`,
                    },
                  ],
                }),
              });

              const createdRecord: SimulatorOrderRecord = {
                id: orderData.id,
                order_number: orderData.order_number,
                store_id: orderData.store_id,
                status: orderData.status,
                payment_status: orderData.payment_status,
                total_amount: String(orderData.total_amount || cartTotal),
                paid_amount: String(orderData.paid_amount || paid),
                change_amount: String(orderData.change_amount || Math.max(0, paid - cartTotal)),
                occurred_at: orderData.occurred_at || new Date().toISOString(),
              };

              setRecentOrderSuccess(createdRecord);
              setCart([]);
              setTenderedCash(null);
              fireSuccessConfetti();
              await refreshTerminalData();
              showNotice(
                "success",
                `Đã thanh toán hóa đơn ${orderData.order_number} — Dữ liệu & tồn kho đã đồng bộ!`
              );
            } catch (err: any) {
              // Network drop mid-checkout -> seamlessly save to offline outbox
              if (err instanceof TypeError || /Failed to fetch|NetworkError/i.test(err?.message || "")) {
                setOfflineMode(true);
                queueOfflineOrder("Mất kết nối mạng đột ngột! Đơn hàng đã được tự động chuyển sang Offline Outbox.");
              } else {
                showNotice("error", err?.message || "Lỗi thanh toán đơn hàng");
              }
            } finally {
              setPosLoading(false);
            }
          }}
          onFlushOutbox={async () => {
            if (offlineMode) {
              showNotice("error", "Máy POS đang ở chế độ Offline. Vui lòng bật lại mạng Internet trước khi đồng bộ!");
              return;
            }
            if (outboxQueue.length === 0 || !pairedStore?.id) return;

            if (pairedDevice?.id) {
              await verifyDeviceStatus(pairedDevice.id);
              if (isRevoked) return;
            }

            setPosLoading(true);
            try {
              const batchId = `batch_${Date.now()}`;
              const pushData = await terminalApiFetch("/api/v1/sync/push", {
                method: "POST",
                body: JSON.stringify({
                  device_id: pairedDevice?.id || undefined,
                  store_id: pairedStore.id,
                  batch_id: batchId,
                  events: outboxQueue.map((ev) => ({
                    event_id: ev.event_id,
                    event_type: "order.created",
                    idempotency_key: ev.idempotency_key,
                    occurred_at: ev.occurred_at,
                    payload: {
                      client_order_id: ev.client_order_id,
                      currency_code: "VND",
                      items: ev.items.map((it) => ({
                        product_variant_id: it.product_variant_id,
                        quantity: it.quantity,
                        unit_price: it.unit_price,
                      })),
                      payments: [
                        {
                          payment_method_code: "CASH",
                          amount: `${ev.total_amount}.0000`,
                        },
                      ],
                    },
                  })),
                }),
              });

              const results: any[] = pushData?.results || [];
              const acceptedIds = new Set(
                results
                  .filter((r) => r.status === "accepted" || r.status === "duplicate")
                  .map((r) => r.event_id)
              );
              const remaining = outboxQueue.filter((ev) => !acceptedIds.has(ev.event_id));
              setOutboxQueue(remaining);
              fireSuccessConfetti();
              await refreshTerminalData();
              showNotice(
                remaining.length === 0 ? "success" : "info",
                `Đã đồng bộ ${acceptedIds.size} đơn Offline lên hệ thống!${
                  remaining.length > 0 ? ` (${remaining.length} đơn lỗi cần kiểm tra)` : ""
                }`
              );
            } catch (err: any) {
              showNotice("error", err?.message || "Lỗi đồng bộ Outbox lên máy chủ.");
            } finally {
              setPosLoading(false);
            }
          }}
          onToggleOffline={handleToggleOffline}
          onOpenCashSession={handleOpenCashSession}
        />
      </div>
    </div>
  );
}
