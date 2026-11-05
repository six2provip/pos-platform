"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Boxes,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cloud,
  CreditCard,
  Database,
  DollarSign,
  ExternalLink,
  Layers,
  Link2,
  LogOut,
  MonitorSmartphone,
  MoreHorizontal,
  Package,
  Play,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sliders,
  Smartphone,
  Sparkles,
  Store as StoreIcon,
  Trash2,
  Users,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react";

import { AnimatedList } from "@/components/ui/animated-list";
import { BentoCard, BentoGrid } from "@/components/ui/bento-grid";
import { BlurFade } from "@/components/ui/blur-fade";
import { BorderBeam } from "@/components/ui/border-beam";
import { fireSuccessConfetti } from "@/components/ui/confetti";
import { DotPattern } from "@/components/ui/dot-pattern";
import { MagicCard } from "@/components/ui/magic-card";
import { NumberTicker } from "@/components/ui/number-ticker";
import { RippleButton } from "@/components/ui/ripple-button";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { Terminal } from "@/components/ui/terminal";
import { PosLcdSimulator } from "@/components/pos-lcd-simulator";
import { SixDigitPinInput } from "@/components/ui/six-digit-pin-input";
import {
  Skeleton,
  OverviewSkeleton,
  PosSkeleton,
  OrdersSkeleton,
  ProductsSkeleton,
  InventorySkeleton,
  DevicesSkeleton,
  SettingsSkeleton,
  StoresSkeleton,
} from "@/components/ui/skeleton";

interface StoreItem {
  id: string;
  code: string;
  name: string;
  timezone: string;
  currency_code: string;
  status: string;
}

interface ProductVariantItem {
  id: string;
  variant_code: string;
  variant_name: string;
  sku: string | null;
  unit_name: string;
  default_price: string;
  default_cost?: string | null;
  barcodes?: { barcode: string; is_primary: boolean }[];
}

interface ProductItem {
  id: string;
  product_code: string;
  name: string;
  product_type: string;
  track_inventory: boolean;
  variants: ProductVariantItem[];
}

interface InventoryBalanceItem {
  product_variant_id: string;
  store_id: string;
  on_hand_quantity: string;
  reserved_quantity: string;
  available_quantity: string;
}

interface PosDeviceItem {
  id: string;
  store_id: string;
  device_code: string;
  name: string;
  device_type: string;
  status: string;
  platform: string;
  last_seen_at?: string | null;
}

interface OrderRecord {
  id: string;
  order_number: string;
  store_id: string;
  status: string;
  payment_status: string;
  total_amount: string;
  paid_amount: string;
  change_amount: string;
  occurred_at: string;
}

interface CartItem {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  unitPrice: number;
  quantity: number;
}

interface OfflineOutboxOrder {
  event_id: string;
  idempotency_key: string;
  client_order_id: string;
  store_id: string;
  occurred_at: string;
  total_amount: number;
  items: {
    product_variant_id: string;
    productName: string;
    quantity: string;
    unit_price: string;
  }[];
}

type NavTab =
  | "overview"
  | "pos"
  | "orders"
  | "products"
  | "inventory"
  | "stores"
  | "devices"
  | "settings";

const TAB_PATHS: Record<NavTab, string> = {
  overview: "/overview",
  pos: "/pos",
  orders: "/orders",
  products: "/products",
  inventory: "/inventory",
  stores: "/stores",
  devices: "/stores",
  settings: "/settings",
};

function getTabFromPathname(pathname: string): NavTab | null {
  const clean = pathname.replace(/^\/+|\/+$/g, "").toLowerCase();
  if (!clean || clean === "overview") return "overview";
  if (clean === "pos") return "pos";
  if (clean === "orders") return "orders";
  if (clean === "products" || clean === "catalog") return "products";
  if (clean === "inventory" || clean === "stock") return "inventory";
  if (
    clean === "stores" ||
    clean === "branches" ||
    clean === "chinhanh" ||
    clean === "devices"
  )
    return "stores";
  if (clean === "settings") return "settings";
  return null;
}

type ModalType =
  | null
  | "create_product"
  | "adjust_stock"
  | "create_store"
  | "pair_pos_device";

function formatMoneyVND(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) || 0 : amount;
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(num);
}

export interface OrganizationWorkspaceProps {
  defaultTab?: NavTab;
  initialAuthMode?: "login" | "provision";
}

export default function OrganizationWorkspace({
  defaultTab,
  initialAuthMode,
}: OrganizationWorkspaceProps = {}) {
  const router = useRouter();
  const pathname = usePathname();

  // Session initialization state (prevents login flicker on refresh)
  const [isInitializing, setIsInitializing] = useState(true);
  const [hasMounted, setHasMounted] = useState(false);

  // Authentication & Tenant State
  const [authMode, setAuthMode] = useState<"login" | "provision">(
    initialAuthMode || "login"
  );
  const [orgCode, setOrgCode] = useState("DEMO");
  const [identifier, setIdentifier] = useState("admin@demo.vn");
  const [password, setPassword] = useState("Admin@123456");

  // Provisioning form state
  const [newOrgCode, setNewOrgCode] = useState("COFFEEHOUSE");
  const [newOrgName, setNewOrgName] = useState("The Coffee House Chain");
  const [newAdminEmail, setNewAdminEmail] = useState("owner@coffeehouse.vn");
  const [newAdminPass, setNewAdminPass] = useState("Admin@123456");
  const [newStoreCode, setNewStoreCode] = useState("TCH-S1");
  const [newStoreName, setNewStoreName] = useState("Flagship Nguyen Hue");
  const [provisionAsPending, setProvisionAsPending] = useState(true);

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    email: string;
    full_name: string;
  } | null>(null);
  const [currentOrg, setCurrentOrg] = useState<{
    id: string;
    code: string;
    name: string;
  } | null>(null);

  // Navigation, Sub-sections & Clean Modal Dialog (Cal.com style)
  const effectiveTab: NavTab = useMemo(() => {
    if (defaultTab) return defaultTab;
    const tabFromUrl = getTabFromPathname(pathname);
    return tabFromUrl || "overview";
  }, [defaultTab, pathname]);

  const [activeTab, setActiveTab] = useState<NavTab>(effectiveTab);

  useEffect(() => {
    if (effectiveTab && effectiveTab !== activeTab) {
      setActiveTab(effectiveTab);
    }
  }, [effectiveTab]);

  useEffect(() => {
    if (pathname === "/register") {
      if (accessToken) {
        const savedTab =
          (typeof window !== "undefined"
            ? (localStorage.getItem("pos_active_tab") as NavTab)
            : null) || "overview";
        router.replace(TAB_PATHS[savedTab] || "/overview");
      } else {
        setAuthMode("provision");
      }
    } else if (pathname === "/login") {
      if (accessToken) {
        const savedTab =
          (typeof window !== "undefined"
            ? (localStorage.getItem("pos_active_tab") as NavTab)
            : null) || "overview";
        router.replace(TAB_PATHS[savedTab] || "/overview");
      } else {
        setAuthMode("login");
      }
    }
  }, [pathname, accessToken, router]);
  const [orderFilterTab, setOrderFilterTab] = useState<
    "all" | "paid" | "outbox"
  >("all");
  const [settingsSubTab, setSettingsSubTab] = useState<
    "general" | "stores" | "appearance" | "capabilities"
  >("general");
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // Core Business Data
  const [capabilities, setCapabilities] = useState<Record<string, any> | null>(
    null
  );
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [inventoryMap, setInventoryMap] = useState<
    Record<string, InventoryBalanceItem>
  >({});
  const [devices, setDevices] = useState<PosDeviceItem[]>([]);
  const [viewingStoreDevicesId, setViewingStoreDevicesId] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRecord[]>([]);

  // POS Terminal & Cash Session State
  const [posSearch, setPosSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [offlineMode, setOfflineMode] = useState(false);
  const [outboxQueue, setOutboxQueue] = useState<OfflineOutboxOrder[]>([]);
  const [activeCashSession, setActiveCashSession] = useState<{
    id: string;
    opening_amount: string;
    status: string;
  } | null>(null);
  const [activeDeviceToken, setActiveDeviceToken] = useState<string | null>(
    null
  );
  const [activeActivatedDeviceId, setActiveActivatedDeviceId] = useState<
    string | null
  >(null);

  // Modal Form States
  const [newProdCode, setNewProdCode] = useState("MATCHA-LATTE");
  const [newProdName, setNewProdName] = useState("Matcha Latte Uji Nhật Bản");
  const [newProdSku, setNewProdSku] = useState("SKU-MATCHA-L");
  const [newProdBarcode, setNewProdBarcode] = useState("8938505991021");
  const [newProdPrice, setNewProdPrice] = useState("49000");
  const [newProdCost, setNewProdCost] = useState("18000");
  const [newProdInitialStock, setNewProdInitialStock] = useState("80");

  const [adjVariantId, setAdjVariantId] = useState("");
  const [adjDelta, setAdjDelta] = useState("50");
  const [adjReason, setAdjReason] = useState("Nhập hàng bổ sung trong ngày");

  const [createStoreCode, setCreateStoreCode] = useState("DEMO-S2");
  const [createStoreName, setCreateStoreName] = useState(
    "Chi nhánh Quận 1 - Lê Lợi"
  );
  const [pairingCodeInput, setPairingCodeInput] = useState("");
  const [pairingStoreId, setPairingStoreId] = useState("");
  const [pairingDeviceName, setPairingDeviceName] = useState("Máy POS Thu Ngân Quầy 2");
  const [pairingDeviceCode, setPairingDeviceCode] = useState("POS-TERMINAL-02");
  const [posSimPairingSession, setPosSimPairingSession] = useState<{
    session_id: string;
    pairing_code: string;
    formatted_code: string;
    expires_at: string;
  } | null>(null);
  const [posSimMode, setPosSimMode] = useState<"terminal" | "unpaired">("terminal");

  const notify = useCallback(
    (type: "success" | "error" | "info", text: string) => {
      setBanner({ type, text });
    },
    []
  );

  const accessTokenRef = useRef<string | null>(accessToken);
  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  const apiFetch = useCallback(
    async (
      path: string,
      options: RequestInit = {},
      tokenOverride?: string | null
    ) => {
      const tokenToUse =
        tokenOverride !== undefined ? tokenOverride : accessTokenRef.current;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string>),
      };
      if (tokenToUse) {
        headers["Authorization"] = `Bearer ${tokenToUse}`;
      }
      const res = await fetch(path, {
        ...options,
        headers,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || (json && json.success === false)) {
        const msg =
          json?.message ||
          json?.detail ||
          json?.error?.code ||
          `HTTP ${res.status} error calling ${path}`;
        if (res.status === 401) {
          throw new Error(`401 Unauthorized: ${msg}`);
        }
        throw new Error(msg);
      }
      return json?.data;
    },
    []
  );

  const refreshWorkspaceData = useCallback(
    async (token?: string, preferStoreId?: string) => {
      const tk = token || accessTokenRef.current;
      if (!tk) return;
      try {
        const [capData, storeList, prodList, orderList] = await Promise.all([
          apiFetch("/api/v1/system/capabilities", {}, tk).catch(() => null),
          apiFetch("/api/v1/stores", {}, tk).catch(() => []),
          apiFetch("/api/v1/products", {}, tk).catch(() => []),
          apiFetch("/api/v1/orders", {}, tk).catch(() => []),
        ]);

        if (capData) setCapabilities(capData);
        const normalizedStores: StoreItem[] = Array.isArray(storeList)
          ? storeList
          : storeList?.items || [];
        setStores(normalizedStores);

        const activeStore =
          preferStoreId ||
          (normalizedStores.length > 0 ? normalizedStores[0].id : "");
        if (preferStoreId) {
          setSelectedStoreId(preferStoreId);
        }

        const normalizedProducts: ProductItem[] = Array.isArray(prodList)
          ? prodList
          : prodList?.items || [];
        setProducts(normalizedProducts);

        const normalizedOrders: OrderRecord[] = Array.isArray(orderList)
          ? orderList
          : orderList?.items || [];
        setOrders(normalizedOrders);

        if (activeStore) {
          const [invList, devList] = await Promise.all([
            apiFetch(
              `/api/v1/inventory?store_id=${encodeURIComponent(activeStore)}`,
              {},
              tk
            ).catch(() => []),
            apiFetch(
              `/api/v1/devices?store_id=${encodeURIComponent(activeStore)}`,
              {},
              tk
            ).catch(() => []),
          ]);

          const balances: InventoryBalanceItem[] = Array.isArray(invList)
            ? invList
            : invList?.items || [];
          const map: Record<string, InventoryBalanceItem> = {};
          balances.forEach((b) => {
            map[b.product_variant_id] = b;
          });
          setInventoryMap(map);

          const devItems: PosDeviceItem[] = Array.isArray(devList)
            ? devList
            : devList?.items || [];
          setDevices(devItems);
        }
      } catch (err: any) {
        notify("error", err.message || "Không thể tải dữ liệu cửa hàng");
      }
    },
    [apiFetch, notify]
  );

  const seedDemoProductsIfEmpty = useCallback(
    async (tk: string, storeId: string, existingProds: ProductItem[]) => {
      if (existingProds.length >= 8 || !storeId) return;
      try {
        const existingCodes = new Set(
          existingProds.map((p) => p.product_code.toUpperCase())
        );
        const sampleItems = [
          {
            code: "CF-SUA-DA",
            name: "Cà Phê Sữa Đá Sài Gòn",
            sku: "SKU-CF-SUADA",
            barcode: "8938505000011",
            price: "39000.0000",
            cost: "14000.0000",
            qty: "120.0000",
          },
          {
            code: "TRA-DAO-CAM-SA",
            name: "Trà Đào Cam Sả Đặc Biệt",
            sku: "SKU-TRADAO-L",
            barcode: "8938505000028",
            price: "45000.0000",
            cost: "16000.0000",
            qty: "95.0000",
          },
          {
            code: "CROISSANT-BO",
            name: "Bánh Sừng Bò Bơ Pháp",
            sku: "SKU-CROISSANT",
            barcode: "8938505000035",
            price: "35000.0000",
            cost: "15000.0000",
            qty: "60.0000",
          },
          {
            code: "BAC-XIU-KEM",
            name: "Bạc Xỉu Kem Muối Biển",
            sku: "SKU-BACXIU-M",
            barcode: "8938505000042",
            price: "42000.0000",
            cost: "15000.0000",
            qty: "85.0000",
          },
          {
            code: "MATCHA-UJI-KEM",
            name: "Matcha Uji Kem Phô Mai",
            sku: "SKU-MATCHA-UJI",
            barcode: "8938505000059",
            price: "49000.0000",
            cost: "18000.0000",
            qty: "75.0000",
          },
          {
            code: "TRA-VAI-HOA-HONG",
            name: "Trà Vải Hoa Hồng Lạnh",
            sku: "SKU-TRAVAI-M",
            barcode: "8938505000066",
            price: "45000.0000",
            cost: "16000.0000",
            qty: "90.0000",
          },
          {
            code: "BANH-TIRAMISU-CA-PHE",
            name: "Bánh Tiramisu Cà Phê Ý",
            sku: "SKU-TIRAMISU",
            barcode: "8938505000073",
            price: "48000.0000",
            cost: "19000.0000",
            qty: "45.0000",
          },
          {
            code: "COMBO-SANG-TINH-TE",
            name: "Combo Sáng: Cà Phê + Bánh",
            sku: "SKU-COMBO-01",
            barcode: "8938505000080",
            price: "65000.0000",
            cost: "26000.0000",
            qty: "50.0000",
          },
        ].filter((it) => !existingCodes.has(it.code));

        const adjLines: {
          product_variant_id: string;
          quantity_delta: string;
          note: string;
        }[] = [];

        for (const item of sampleItems) {
          const created = await apiFetch(
            "/api/v1/products",
            {
              method: "POST",
              body: JSON.stringify({
                product_code: item.code,
                name: item.name,
                product_type: "stocked",
                track_inventory: true,
                variants: [
                  {
                    variant_code: `${item.code}-STD`,
                    variant_name: "Tiêu chuẩn",
                    sku: item.sku,
                    unit_name: "phần",
                    default_cost: item.cost,
                    default_price: item.price,
                    barcodes: [{ barcode: item.barcode, is_primary: true }],
                  },
                ],
              }),
            },
            tk
          );
          if (created?.variants?.[0]?.id) {
            adjLines.push({
              product_variant_id: created.variants[0].id,
              quantity_delta: item.qty,
              note: "Tồn kho khởi tạo tự động",
            });
          }
        }

        if (adjLines.length > 0) {
          const adj = await apiFetch(
            "/api/v1/inventory/adjustments",
            {
              method: "POST",
              body: JSON.stringify({
                store_id: storeId,
                reason: "Khởi tạo tồn kho mẫu cho quầy POS",
                items: adjLines,
              }),
            },
            tk
          );
          if (adj?.id) {
            await apiFetch(
              `/api/v1/inventory/adjustments/${adj.id}/post`,
              {
                method: "POST",
                headers: { "Idempotency-Key": `seed-adj-${Date.now()}` },
              },
              tk
            );
          }
        }
      } catch {
        // ignore if already seeded
      }
    },
    [apiFetch]
  );

  const navigateToTab = useCallback(
    (tab: NavTab) => {
      setActiveTab(tab);
      if (tab === "stores") {
        setViewingStoreDevicesId(null);
      }
      const path = TAB_PATHS[tab] || "/overview";
      if (typeof window !== "undefined") {
        if (window.location.pathname !== path) {
          window.history.pushState({ tab }, "", path);
        }
        localStorage.setItem("pos_active_tab", tab);
      }
      if (pathname === "/login" || pathname === "/register") {
        router.push(path);
      }
    },
    [pathname, router]
  );

  const handleLogout = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("pos_access_token");
      localStorage.removeItem("pos_current_user");
      localStorage.removeItem("pos_current_org");
      localStorage.removeItem("pos_selected_store_id");
      localStorage.removeItem("pos_cart");
    }
    router.push("/login");
    setAccessToken(null);
    setCurrentUser(null);
    setCurrentOrg(null);
    setCart([]);
    setAuthMode("login");
    notify("info", "Đã đăng xuất an toàn khỏi hệ thống.");
  }, [notify, router]);

  // Session restore & URL routing listener on mount
  useEffect(() => {
    setHasMounted(true);
    if (typeof window === "undefined") return;

    const path = window.location.pathname;
    const tabFromUrl = getTabFromPathname(path);

    if (path === "/register") {
      setAuthMode("provision");
    } else if (path === "/login") {
      setAuthMode("login");
    }

    if (tabFromUrl) {
      setActiveTab(tabFromUrl);
    }

    const savedToken = localStorage.getItem("pos_access_token");
    const savedUserStr = localStorage.getItem("pos_current_user");
    const savedOrgStr = localStorage.getItem("pos_current_org");
    const savedStoreId = localStorage.getItem("pos_selected_store_id") || "";
    const savedCartStr = localStorage.getItem("pos_cart");

    if (savedToken) {
      try {
        const savedUser = savedUserStr ? JSON.parse(savedUserStr) : null;
        const savedOrg = savedOrgStr ? JSON.parse(savedOrgStr) : null;
        const savedCart = savedCartStr ? JSON.parse(savedCartStr) : [];

        setAccessToken(savedToken);
        if (savedUser) setCurrentUser(savedUser);
        if (savedOrg) {
          setCurrentOrg(savedOrg);
          setOrgCode(savedOrg.code || "DEMO");
        }
        if (savedStoreId) setSelectedStoreId(savedStoreId);
        if (Array.isArray(savedCart) && savedCart.length > 0) setCart(savedCart);

        // If user already has an active session and accesses /login or /register, redirect immediately to workspace
        if (path === "/login" || path === "/register") {
          const savedTab =
            (localStorage.getItem("pos_active_tab") as NavTab) || "overview";
          const targetPath = TAB_PATHS[savedTab] || "/overview";
          setActiveTab(savedTab);
          router.replace(targetPath);
        }

        // Verify token with backend
        apiFetch("/api/v1/system/capabilities", {}, savedToken)
          .then((capData) => {
            if (capData) setCapabilities(capData);
            return refreshWorkspaceData(savedToken, savedStoreId);
          })
          .catch((err) => {
            if (
              err.message?.includes("401") ||
              err.message?.includes("UNAUTHORIZED") ||
              err.message?.includes("credentials") ||
              err.message?.toLowerCase()?.includes("expired")
            ) {
              localStorage.removeItem("pos_access_token");
              localStorage.removeItem("pos_current_user");
              localStorage.removeItem("pos_current_org");
              localStorage.removeItem("pos_selected_store_id");
              setAccessToken(null);
              setCurrentUser(null);
              setCurrentOrg(null);
              notify("info", "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
            }
          })
          .finally(() => {
            setIsInitializing(false);
          });
      } catch {
        setIsInitializing(false);
      }
    } else {
      setIsInitializing(false);
    }

    const handlePopState = () => {
      const currentPath = window.location.pathname;
      if (currentPath === "/login" || currentPath === "/register") {
        const token = localStorage.getItem("pos_access_token");
        if (token) {
          const savedTab =
            (localStorage.getItem("pos_active_tab") as NavTab) || "overview";
          const targetPath = TAB_PATHS[savedTab] || "/overview";
          window.history.replaceState({ tab: savedTab }, "", targetPath);
          setActiveTab(savedTab);
          return;
        }
        setAuthMode(currentPath === "/register" ? "provision" : "login");
      } else {
        const tab = getTabFromPathname(currentPath);
        if (tab) {
          setActiveTab(tab);
        }
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [router]);

  // Persist cart whenever it changes
  useEffect(() => {
    if (typeof window !== "undefined" && !isInitializing) {
      localStorage.setItem("pos_cart", JSON.stringify(cart));
    }
  }, [cart, isInitializing]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setBanner(null);
    try {
      const data = await apiFetch(
        "/api/v1/auth/login",
        {
          method: "POST",
          body: JSON.stringify({
            organization_code: orgCode.trim().toUpperCase(),
            identifier: identifier.trim(),
            password,
          }),
        },
        null
      );

      const tk = data.access_token;
      setAccessToken(tk);
      setCurrentUser(data.user);
      setCurrentOrg(data.organization);

      if (typeof window !== "undefined") {
        localStorage.setItem("pos_access_token", tk);
        localStorage.setItem("pos_current_user", JSON.stringify(data.user));
        localStorage.setItem("pos_current_org", JSON.stringify(data.organization));
      }

      const storeList = await apiFetch("/api/v1/stores", {}, tk);
      const storesArr: StoreItem[] = Array.isArray(storeList)
        ? storeList
        : storeList?.items || [];
      const firstStoreId = storesArr[0]?.id || "";
      setSelectedStoreId(firstStoreId);

      if (typeof window !== "undefined" && firstStoreId) {
        localStorage.setItem("pos_selected_store_id", firstStoreId);
      }

      const prodList = await apiFetch("/api/v1/products", {}, tk);
      const prodsArr: ProductItem[] = Array.isArray(prodList)
        ? prodList
        : prodList?.items || [];
      if (prodsArr.length < 8 && firstStoreId) {
        await seedDemoProductsIfEmpty(tk, firstStoreId, prodsArr);
      }

      await refreshWorkspaceData(tk, firstStoreId);

      const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
      const urlTab = (currentPath !== "/login" && currentPath !== "/register") ? getTabFromPathname(currentPath) : null;
      const savedTab = typeof window !== "undefined" ? (localStorage.getItem("pos_active_tab") as NavTab) : null;
      const targetTab = urlTab || (savedTab && TAB_PATHS[savedTab] ? savedTab : "overview");
      navigateToTab(targetTab);

      fireSuccessConfetti();
      notify("success", `Đăng nhập thành công vào chuỗi ${data.organization.name}!`);
    } catch (err: any) {
      if (
        err.message?.includes("Organization is not active") ||
        err.message?.includes("ORGANIZATION_SUSPENDED")
      ) {
        notify(
          "error",
          "Tổ chức đang ở trạng thái Chờ Phê Duyệt hoặc Đình Chỉ. Vui lòng liên hệ Super-Admin tại cổng :13001 để được phê duyệt."
        );
      } else {
        notify("error", err.message || "Đăng nhập thất bại");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleProvisionOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setBanner(null);
    try {
      const reqStatus = provisionAsPending ? "pending_approval" : "active";
      await apiFetch(
        "/api/v1/organization/provision",
        {
          method: "POST",
          body: JSON.stringify({
            code: newOrgCode.trim().toUpperCase(),
            name: newOrgName.trim(),
            admin_email: newAdminEmail.trim(),
            admin_password: newAdminPass,
            initial_store_code: newStoreCode.trim().toUpperCase(),
            initial_store_name: newStoreName.trim(),
            status: reqStatus,
          }),
        },
        null
      );

      if (provisionAsPending) {
        setOrgCode(newOrgCode.trim().toUpperCase());
        setIdentifier(newAdminEmail.trim());
        setPassword(newAdminPass);
        setAuthMode("login");
        router.push("/login");
        notify(
          "info",
          `Hồ sơ đăng ký của chuỗi ${newOrgCode.toUpperCase()} đã gửi tới Super Admin! Trạng thái: Chờ duyệt. Vui lòng nhờ Super-Admin phê duyệt tại cổng :13001 trước khi đăng nhập.`
        );
      } else {
        const loginData = await apiFetch(
          "/api/v1/auth/login",
          {
            method: "POST",
            body: JSON.stringify({
              organization_code: newOrgCode.trim().toUpperCase(),
              identifier: newAdminEmail.trim(),
              password: newAdminPass,
            }),
          },
          null
        );

        const tk = loginData.access_token;
        setAccessToken(tk);
        setCurrentUser(loginData.user);
        setCurrentOrg(loginData.organization);

        if (typeof window !== "undefined") {
          localStorage.setItem("pos_access_token", tk);
          localStorage.setItem("pos_current_user", JSON.stringify(loginData.user));
          localStorage.setItem("pos_current_org", JSON.stringify(loginData.organization));
        }

        const storeList = await apiFetch("/api/v1/stores", {}, tk);
        const storesArr: StoreItem[] = Array.isArray(storeList)
          ? storeList
          : storeList?.items || [];
        const firstStoreId = storesArr[0]?.id || "";
        setSelectedStoreId(firstStoreId);

        if (typeof window !== "undefined" && firstStoreId) {
          localStorage.setItem("pos_selected_store_id", firstStoreId);
        }

        await seedDemoProductsIfEmpty(tk, firstStoreId, []);
        await refreshWorkspaceData(tk, firstStoreId);

        navigateToTab("overview");
        fireSuccessConfetti();
        notify(
          "success",
          `Chúc mừng! Chuỗi ${newOrgName.trim()} đã được kích hoạt thành công. Bạn đã đăng nhập vào hệ thống!`
        );
      }
    } catch (err: any) {
      notify("error", err.message || "Không thể khởi tạo tổ chức mới");
    } finally {
      setLoading(false);
    }
  };

  const isMountedStoreRef = React.useRef(false);
  useEffect(() => {
    if (isMountedStoreRef.current) {
      if (accessToken && selectedStoreId) {
        void refreshWorkspaceData(accessToken, selectedStoreId);
      }
    } else {
      isMountedStoreRef.current = true;
    }
  }, [selectedStoreId, accessToken, refreshWorkspaceData]);

  const allVariants = useMemo(() => {
    const list: {
      productId: string;
      productCode: string;
      productName: string;
      variantId: string;
      variantName: string;
      sku: string;
      barcode: string;
      price: number;
      onHand: number;
    }[] = [];
    for (const p of products) {
      for (const v of p.variants || []) {
        const bal = inventoryMap[v.id];
        list.push({
          productId: p.id,
          productCode: p.product_code,
          productName: p.name,
          variantId: v.id,
          variantName: v.variant_name,
          sku: v.sku || v.variant_code,
          barcode: v.barcodes?.[0]?.barcode || "—",
          price: parseFloat(v.default_price) || 0,
          onHand: bal ? parseFloat(bal.on_hand_quantity) || 0 : 0,
        });
      }
    }
    return list;
  }, [products, inventoryMap]);

  useEffect(() => {
    if (!adjVariantId && allVariants.length > 0) {
      setAdjVariantId(allVariants[0].variantId);
    }
  }, [allVariants, adjVariantId]);

  const filteredPosVariants = useMemo(() => {
    const q = posSearch.trim().toLowerCase();
    if (!q) return allVariants;
    return allVariants.filter(
      (v) =>
        v.productName.toLowerCase().includes(q) ||
        v.sku.toLowerCase().includes(q) ||
        v.barcode.toLowerCase().includes(q) ||
        v.productCode.toLowerCase().includes(q)
    );
  }, [allVariants, posSearch]);

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [cart]
  );

  const addToCart = (v: (typeof allVariants)[number]) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.variantId === v.variantId);
      if (existing) {
        return prev.map((i) =>
          i.variantId === v.variantId ? { ...i, quantity: i.quantity + 1 } : i
        );
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

  const updateCartQty = (variantId: string, delta: number) => {
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

  const handleOpenCashSession = async () => {
    if (!selectedStoreId) return;
    setLoading(true);
    try {
      const drawers = await apiFetch(
        `/api/v1/cash-drawers?store_id=${encodeURIComponent(selectedStoreId)}`
      ).catch(() => []);
      const drawerList = Array.isArray(drawers) ? drawers : drawers?.items || [];
      let drawerId = drawerList[0]?.id;
      if (!drawerId) {
        const createdDrawer = await apiFetch("/api/v1/cash-drawers", {
          method: "POST",
          body: JSON.stringify({
            store_id: selectedStoreId,
            code: `DRW-${Date.now().toString().slice(-4)}`,
            name: "Ngăn kéo thu ngân chính",
          }),
        });
        drawerId = createdDrawer.id;
      }

      const session = await apiFetch("/api/v1/cash-sessions/open", {
        method: "POST",
        body: JSON.stringify({
          store_id: selectedStoreId,
          cash_drawer_id: drawerId,
          opening_amount: "1000000.0000",
        }),
      });
      setActiveCashSession(session);
      notify(
        "success",
        "Đã mở ca thu ngân với 1.000.000 ₫ tiền mặt đầu ca!"
      );
    } catch (err: any) {
      notify("error", err.message || "Không thể mở ca thu ngân");
    } finally {
      setLoading(false);
    }
  };

  const handleCheckoutOrder = async (
    tenderedCash?: number,
    paymentMethod: string = "CASH"
  ) => {
    if (cart.length === 0 || !selectedStoreId) return;
    setLoading(true);
    try {
      const nowIso = new Date().toISOString();
      const clientOrderId = `POS-${Date.now()}`;
      const idemKey = `${currentOrg?.id || "org"}:pos:${clientOrderId}`;
      const paidAmount =
        tenderedCash && tenderedCash >= cartTotal ? tenderedCash : cartTotal;

      if (offlineMode) {
        const offlineEvent: OfflineOutboxOrder = {
          event_id: `ev_${Date.now()}`,
          idempotency_key: idemKey,
          client_order_id: clientOrderId,
          store_id: selectedStoreId,
          occurred_at: nowIso,
          total_amount: cartTotal,
          items: cart.map((c) => ({
            product_variant_id: c.variantId,
            productName: c.productName,
            quantity: `${c.quantity}.0000`,
            unit_price: `${c.unitPrice}.0000`,
          })),
        };
        setOutboxQueue((prev) => [offlineEvent, ...prev]);
        setCart([]);
        notify(
          "info",
          `[OFFLINE OUTBOX] Đơn ${clientOrderId} (${formatMoneyVND(cartTotal)}) đã lưu vào hàng đợi cục bộ trên máy POS!`
        );
        return;
      }

      const orderData = await apiFetch("/api/v1/orders", {
        method: "POST",
        headers: {
          "Idempotency-Key": idemKey,
        },
        body: JSON.stringify({
          store_id: selectedStoreId,
          client_order_id: clientOrderId,
          items: cart.map((c) => ({
            product_variant_id: c.variantId,
            quantity: `${c.quantity}.0000`,
          })),
          payments: [
            {
              payment_method_code: paymentMethod,
              amount: `${paidAmount}.0000`,
            },
          ],
        }),
      });

      fireSuccessConfetti();
      setCart([]);
      await refreshWorkspaceData();
      notify(
        "success",
        `Đã thanh toán hóa đơn ${orderData.order_number} (${formatMoneyVND(orderData.total_amount)}) — Tồn kho đã tự động trừ!`
      );
    } catch (err: any) {
      notify("error", err.message || "Lỗi thanh toán đơn hàng");
    } finally {
      setLoading(false);
    }
  };

  const handleFlushOfflineOutbox = async () => {
    if (outboxQueue.length === 0 || !selectedStoreId) return;
    setLoading(true);
    try {
      const batchId = `batch_${Date.now()}`;
      const pushData = await apiFetch(
        "/api/v1/sync/push",
        {
          method: "POST",
          body: JSON.stringify({
            device_id: activeActivatedDeviceId || undefined,
            store_id: selectedStoreId,
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
        },
        activeDeviceToken || accessToken
      );

      const acceptedCount = (pushData?.results || []).filter(
        (r: any) => r.status === "accepted"
      ).length;
      setOutboxQueue([]);
      setOfflineMode(false);
      fireSuccessConfetti();
      await refreshWorkspaceData();
      notify(
        "success",
        `Đã đồng bộ ${acceptedCount} đơn Offline qua /api/v1/sync/push (Idempotent Outbox)!`
      );
    } catch (err: any) {
      notify("error", err.message || "Lỗi đồng bộ Outbox");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStoreId) return;
    setLoading(true);
    try {
      const prod = await apiFetch("/api/v1/products", {
        method: "POST",
        body: JSON.stringify({
          product_code: newProdCode.trim().toUpperCase(),
          name: newProdName.trim(),
          product_type: "stocked",
          track_inventory: true,
          variants: [
            {
              variant_code: `${newProdCode.trim().toUpperCase()}-STD`,
              variant_name: "Tiêu chuẩn",
              sku: newProdSku.trim().toUpperCase(),
              unit_name: "ly",
              default_cost: `${parseFloat(newProdCost) || 0}.0000`,
              default_price: `${parseFloat(newProdPrice) || 0}.0000`,
              barcodes: [
                { barcode: newProdBarcode.trim(), is_primary: true },
              ],
            },
          ],
        }),
      });

      const createdVariantId = prod?.variants?.[0]?.id;
      const initQty = parseFloat(newProdInitialStock) || 0;
      if (createdVariantId && initQty > 0) {
        const adj = await apiFetch("/api/v1/inventory/adjustments", {
          method: "POST",
          body: JSON.stringify({
            store_id: selectedStoreId,
            reason: "Tồn kho ban đầu khi tạo sản phẩm",
            items: [
              {
                product_variant_id: createdVariantId,
                quantity_delta: `${initQty}.0000`,
                note: "Initial stock",
              },
            ],
          }),
        });
        if (adj?.id) {
          await apiFetch(`/api/v1/inventory/adjustments/${adj.id}/post`, {
            method: "POST",
            headers: { "Idempotency-Key": `idem-init-${Date.now()}` },
          });
        }
      }

      setActiveModal(null);
      await refreshWorkspaceData();
      notify(
        "success",
        `Đã thêm sản phẩm "${newProdName}" kèm tồn kho ${initQty} đv!`
      );
      setNewProdCode(`SP-${Date.now().toString().slice(-4)}`);
      setNewProdSku(`SKU-${Date.now().toString().slice(-4)}`);
      setNewProdBarcode(`8938505${Date.now().toString().slice(-6)}`);
    } catch (err: any) {
      notify("error", err.message || "Không thể tạo sản phẩm");
    } finally {
      setLoading(false);
    }
  };

  const handleStockAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStoreId || !adjVariantId) return;
    setLoading(true);
    try {
      const adj = await apiFetch("/api/v1/inventory/adjustments", {
        method: "POST",
        body: JSON.stringify({
          store_id: selectedStoreId,
          reason: adjReason.trim() || "Điều chỉnh tồn kho",
          items: [
            {
              product_variant_id: adjVariantId,
              quantity_delta: `${parseFloat(adjDelta) || 0}.0000`,
              note: adjReason,
            },
          ],
        }),
      });
      await apiFetch(`/api/v1/inventory/adjustments/${adj.id}/post`, {
        method: "POST",
        headers: { "Idempotency-Key": `idem-adj-${Date.now()}` },
      });
      setActiveModal(null);
      await refreshWorkspaceData();
      notify(
        "success",
        `Đã ghi sổ cái tồn kho (${parseFloat(adjDelta) >= 0 ? "+" : ""}${adjDelta} đv)!`
      );
    } catch (err: any) {
      notify("error", err.message || "Lỗi điều chỉnh tồn kho");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickStockAdjustment = async (
    variantId: string,
    delta: number,
    reason: string = "Nhập bổ sung nhanh tại quầy POS"
  ) => {
    if (!selectedStoreId || !variantId) return;
    setLoading(true);
    try {
      const adj = await apiFetch("/api/v1/inventory/adjustments", {
        method: "POST",
        body: JSON.stringify({
          store_id: selectedStoreId,
          reason,
          items: [
            {
              product_variant_id: variantId,
              quantity_delta: `${delta}.0000`,
              note: reason,
            },
          ],
        }),
      });
      await apiFetch(`/api/v1/inventory/adjustments/${adj.id}/post`, {
        method: "POST",
        headers: { "Idempotency-Key": `idem-quick-adj-${Date.now()}` },
      });
      fireSuccessConfetti();
      await refreshWorkspaceData();
      notify(
        "success",
        `Đã cập nhật tồn kho (${delta >= 0 ? "+" : ""}${delta} đv) vào sổ cái!`
      );
    } catch (err: any) {
      notify("error", err.message || "Lỗi cập nhật tồn kho nhanh");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const st = await apiFetch("/api/v1/stores", {
        method: "POST",
        body: JSON.stringify({
          code: createStoreCode.trim().toUpperCase(),
          name: createStoreName.trim(),
          timezone: "Asia/Ho_Chi_Minh",
          currency_code: "VND",
        }),
      });
      setActiveModal(null);
      await refreshWorkspaceData(accessToken || undefined, st.id);
      notify("success", `Đã thêm chi nhánh "${st.name}"!`);
      setCreateStoreCode(`DEMO-S${stores.length + 2}`);
    } catch (err: any) {
      notify("error", err.message || "Không thể tạo thêm cửa hàng");
    } finally {
      setLoading(false);
    }
  };

  const handlePairDeviceByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPin = pairingCodeInput.replace(/\D/g, "");
    if (cleanPin.length !== 6) {
      notify(
        "error",
        "Vui lòng nhập đúng 6 chữ số ghép nối hiển thị trên màn hình máy POS"
      );
      return;
    }
    const targetStore = currentStoreObj?.id || selectedStoreId || stores[0]?.id;
    if (!targetStore) {
      notify("error", "Vui lòng chọn chi nhánh gán máy POS");
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(
        "/api/v1/devices/pair-by-code",
        {
          method: "POST",
          body: JSON.stringify({
            pairing_code: cleanPin,
            store_id: targetStore,
            name:
              pairingDeviceName.trim() ||
              `Máy POS Thu Ngân Quầy ${devices.length + 1}`,
            device_code:
              pairingDeviceCode.trim().toUpperCase() ||
              `POS-TERMINAL-0${devices.length + 1}`,
          }),
        },
        accessToken || undefined
      );

      setActiveModal(null);
      setPairingCodeInput("");
      await refreshWorkspaceData(accessToken || undefined, targetStore);
      fireSuccessConfetti();
      notify("success", res.message || "Ghép nối thiết bị POS thành công!");
    } catch (err: any) {
      notify(
        "error",
        err.message ||
          "Không thể ghép nối thiết bị. Vui lòng kiểm tra mã trên máy POS."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeDevice = async (deviceId: string, devName: string) => {
    if (
      !confirm(
        `Bạn có chắc chắn muốn ngắt kết nối thiết bị "${devName}" khỏi chi nhánh?`
      )
    )
      return;
    setLoading(true);
    try {
      await apiFetch(`/api/v1/devices/${deviceId}/revoke`, { method: "POST" });
      await refreshWorkspaceData();
      notify(
        "info",
        `Đã ngắt kết nối thiết bị "${devName}". Thiết bị sẽ trở về màn hình chờ ghép nối.`
      );
    } catch (err: any) {
      notify("error", err.message || "Không thể ngắt kết nối thiết bị");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDevice = async (deviceId: string, devName: string) => {
    if (
      !confirm(
        `Bạn có chắc chắn muốn xóa thiết bị "${devName}" khỏi danh sách?`
      )
    )
      return;
    setLoading(true);
    try {
      await apiFetch(`/api/v1/devices/${deviceId}`, { method: "DELETE" });
      await refreshWorkspaceData();
      notify("success", `Đã xóa thiết bị "${devName}" thành công.`);
    } catch (err: any) {
      notify("error", err.message || "Không thể xóa thiết bị");
    } finally {
      setLoading(false);
    }
  };

  const startPosPairingSession = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/v1/devices/pairing-session", {
        method: "POST",
        body: JSON.stringify({
          device_info: {
            app_version: "1.0.0",
            manufacturer: "Sunmi",
            model: "T2s Android POS",
          },
        }),
      });
      setPosSimPairingSession(res);
      setPosSimMode("unpaired");
      notify("info", `Mã ghép nối máy POS mới: ${res.formatted_code}`);
    } catch (err: any) {
      notify("error", err.message || "Không thể khởi tạo phiên ghép nối POS");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, notify]);

  useEffect(() => {
    if (posSimMode !== "unpaired" || !posSimPairingSession?.session_id) return;
    const interval = setInterval(async () => {
      try {
        const data = await apiFetch(
          `/api/v1/devices/pairing-session/${posSimPairingSession.session_id}`,
          {}
        );
        if (data && data.status === "paired") {
          clearInterval(interval);
          setActiveDeviceToken(data.access_token);
          setPosSimMode("terminal");
          setPosSimPairingSession(null);
          await refreshWorkspaceData();
          fireSuccessConfetti();
          notify(
            "success",
            `Tuyệt vời! Máy POS đã nhận cấu hình và kích hoạt thành công vào ${data.store?.name || "chi nhánh"}!`
          );
        }
      } catch {
        // Polling ignore
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [posSimMode, posSimPairingSession, apiFetch, refreshWorkspaceData, notify]);

  const totalRevenue = useMemo(
    () =>
      orders.reduce(
        (acc, o) =>
          o.status !== "voided" ? acc + (parseFloat(o.total_amount) || 0) : acc,
        0
      ),
    [orders]
  );

  const totalStockUnits = useMemo(
    () =>
      Object.values(inventoryMap).reduce(
        (acc, b) => acc + (parseFloat(b.on_hand_quantity) || 0),
        0
      ),
    [inventoryMap]
  );

  const currentStoreObj = useMemo(
    () =>
      stores.find(
        (s) => s.id === (viewingStoreDevicesId || selectedStoreId)
      ) || stores[0],
    [stores, viewingStoreDevicesId, selectedStoreId]
  );

  // ==========================================================================
  // VIEW 1: CLEAN MINIMAL AUTHENTICATION SCREEN (CAL.COM STYLE)
  // Only display auth screen when user is NOT authenticated.
  // If user is already authenticated (has valid accessToken), redirect to workspace.
  // ==========================================================================
  const currentPath =
    typeof window !== "undefined" ? window.location.pathname : pathname;
  const isAuthRoute = currentPath === "/login" || currentPath === "/register";
  if (!accessToken && (isAuthRoute || (hasMounted && !isInitializing))) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#F8F9FA] px-4 py-12 text-neutral-900">
        <DotPattern className="opacity-55 [mask-image:radial-gradient(520px_circle_at_center,white,transparent)]" />

        <BlurFade delay={0.04} className="relative z-10 w-full max-w-[420px]">
          <div className="mb-7 text-center">
            <div className="mx-auto mb-2 inline-flex items-center gap-1.5 text-xl font-bold tracking-tight text-neutral-900">
              <span>POS.com</span>
              <span className="rounded bg-neutral-200/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-700">
                Enterprise
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
              {authMode === "login"
                ? "Đăng nhập vào chuỗi cửa hàng"
                : "Khởi tạo Tổ chức mới"}
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              Business Data Plane API •{" "}
              <code className="font-mono text-xs text-neutral-700">
                127.0.0.1:18000
              </code>
            </p>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <BorderBeam
              size={110}
              duration={8}
              colorFrom="#111827"
              colorTo="#9ca3af"
            />

            {/* Clean Pill Switcher */}
            <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setAuthMode("login");
                  router.push("/login");
                }}
                className={`rounded-md py-1.5 text-xs font-medium transition-all ${
                  authMode === "login"
                    ? "bg-white text-neutral-900 shadow-sm"
                    : "text-neutral-500 hover:text-neutral-900"
                }`}
              >
                Đăng nhập
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode("provision");
                  router.push("/register");
                }}
                className={`rounded-md py-1.5 text-xs font-medium transition-all ${
                  authMode === "provision"
                    ? "bg-white text-neutral-900 shadow-sm"
                    : "text-neutral-500 hover:text-neutral-900"
                }`}
              >
                + Tạo Tổ chức
              </button>
            </div>

            {banner && (
              <div
                className={`mb-4 flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs ${
                  banner.type === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{banner.text}</span>
              </div>
            )}

            {authMode === "login" ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                    Mã Tổ chức (Organization Code)
                  </label>
                  <input
                    type="text"
                    required
                    value={orgCode}
                    onChange={(e) => setOrgCode(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                    placeholder="DEMO"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                    Email hoặc tên đăng nhập
                  </label>
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                    placeholder="admin@demo.vn"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                    Mật khẩu
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                  />
                </div>

                <div className="pt-1">
                  <ShimmerButton
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 text-sm"
                  >
                    {loading ? "Đang đăng nhập..." : "Đăng nhập vào POS.com"}
                  </ShimmerButton>
                </div>

                <div className="mt-4 flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
                  <span>Tài khoản mẫu:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setOrgCode("DEMO");
                      setIdentifier("admin@demo.vn");
                      setPassword("Admin@123456");
                    }}
                    className="font-semibold text-neutral-900 hover:underline"
                  >
                    DEMO • admin@demo.vn
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleProvisionOrg} className="space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Mã Tổ chức
                    </label>
                    <input
                      type="text"
                      required
                      value={newOrgCode}
                      onChange={(e) => setNewOrgCode(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Tên Thương hiệu
                    </label>
                    <input
                      type="text"
                      required
                      value={newOrgName}
                      onChange={(e) => setNewOrgName(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Email Chủ sở hữu
                    </label>
                    <input
                      type="email"
                      required
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Mật khẩu
                    </label>
                    <input
                      type="password"
                      required
                      value={newAdminPass}
                      onChange={(e) => setNewAdminPass(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Mã Cửa hàng đầu
                    </label>
                    <input
                      type="text"
                      required
                      value={newStoreCode}
                      onChange={(e) => setNewStoreCode(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Tên Cửa hàng đầu
                    </label>
                    <input
                      type="text"
                      required
                      value={newStoreName}
                      onChange={(e) => setNewStoreName(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Registration mode selection: Luồng 1 (Chờ duyệt) vs Luồng 2 (Active ngay) */}
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-neutral-900">
                        Quy trình phê duyệt (Self-Serve Approval)
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        {provisionAsPending
                          ? "Gửi hồ sơ chờ Super Admin xét duyệt tại :13001"
                          : "Kích hoạt trực tiếp không cần duyệt (Demo mode)"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProvisionAsPending(!provisionAsPending)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                        provisionAsPending ? "bg-[#059669]" : "bg-neutral-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ${
                          provisionAsPending ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div className="pt-1">
                  <ShimmerButton
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 text-sm"
                  >
                    {loading
                      ? "Đang gửi hồ sơ..."
                      : provisionAsPending
                      ? "Gửi Hồ Sơ Đăng Ký Chờ Phê Duyệt"
                      : "Khởi tạo Tổ chức & Cửa hàng Trực tiếp"}
                  </ShimmerButton>
                </div>
              </form>
            )}
          </div>

          <div className="mt-5 flex items-center justify-between text-xs text-neutral-500">
            <span>Port: 13000 → API 18000</span>
            <a
              href="http://127.0.0.1:13001"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-neutral-800 hover:underline"
            >
              Mở Cloud Control Plane (:13001)
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </BlurFade>
      </div>
    );
  }

  // ==========================================================================
  // VIEW 2: CAL.COM-STYLE SIDEBAR + CLEAN WHITE WORKSPACE
  // ==========================================================================
  return (
    <div className="flex min-h-screen bg-white text-neutral-900">
      {/* ================================================================== */}
      {/* LEFT SIDEBAR (CAL.COM EXACT LAYOUT)                                */}
      {/* ================================================================== */}
      <aside className="flex w-[240px] shrink-0 flex-col justify-between border-r border-neutral-200 bg-[#F5F6F8] px-3.5 py-4 select-none">
        <div>
          {/* Top Brand + Quick Search Icon */}
          <div className="flex items-center justify-between px-2 pb-4">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-neutral-900">
                POS.com
              </span>
              <span
                suppressHydrationWarning
                className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-700"
              >
                {currentOrg?.code || "DEMO"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => navigateToTab("pos")}
              title="Tìm nhanh sản phẩm POS"
              className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-200/70 hover:text-neutral-900"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>

          {/* Primary Navigation Items with real URLs */}
          <nav className="space-y-0.5">
            {[
              { id: "overview", label: "Tổng quan", icon: Layers, path: "/overview" },
              {
                id: "pos",
                label: "Quầy Bán Hàng POS",
                icon: ShoppingCart,
                path: "/pos",
                badge: cart.length > 0 ? `${cart.length}` : undefined,
              },
              {
                id: "orders",
                label: "Hóa đơn & Đồng bộ",
                icon: Calendar,
                path: "/orders",
                badge:
                  outboxQueue.length > 0
                    ? `${outboxQueue.length} chờ`
                    : undefined,
              },
              { id: "products", label: "Danh mục Món", icon: Link2, path: "/products" },
              { id: "inventory", label: "Tồn kho & Sổ cái", icon: Boxes, path: "/inventory" },
              {
                id: "stores",
                label: "Chi nhánh",
                icon: StoreIcon,
                path: "/stores",
                badge: stores.length > 0 ? `${stores.length}` : undefined,
              },
              { id: "settings", label: "Cài đặt hệ thống", icon: Settings, path: "/settings" },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <Link
                  key={item.id}
                  href={item.path}
                  onClick={(e) => {
                    e.preventDefault();
                    navigateToTab(item.id as NavTab);
                  }}
                  className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-[13px] transition-colors ${
                    isActive
                      ? "bg-neutral-200/85 font-semibold text-neutral-900"
                      : "font-medium text-neutral-600 hover:bg-neutral-200/50 hover:text-neutral-900"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon
                      className={`h-4 w-4 ${
                        isActive ? "text-neutral-900" : "text-neutral-500"
                      }`}
                    />
                    {item.label}
                  </span>
                  {item.badge && (
                    <span className="rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom Sidebar Card (Cal.com "Dynamic booking links" style) + User Profile */}
        <div className="space-y-3 pt-4">
          {/* Stacked Effect Promo/Status Card */}
          <div className="relative">
            <div className="mx-2 h-1.5 rounded-t-lg border border-b-0 border-neutral-200 bg-white/70" />
            <div className="rounded-xl border border-neutral-200 bg-white p-3.5 shadow-sm">
              <div className="text-xs font-semibold text-neutral-900">
                Đồng bộ Offline-First POS
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
                Bán hàng ngay cả khi đứt cáp Internet với hàng đợi Idempotent
                Outbox.
              </p>

              {/* Mini visual preview block */}
              <div className="mt-2.5 flex items-center justify-between rounded-lg bg-neutral-100 px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      offlineMode ? "bg-amber-500" : "bg-emerald-500"
                    }`}
                  />
                  <span className="text-[11px] font-medium text-neutral-700">
                    {offlineMode
                      ? `Offline (${outboxQueue.length} đơn chờ)`
                      : "Trực tuyến (Cloud Sync)"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setOfflineMode((prev) => !prev)}
                  className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-neutral-800 shadow-sm border border-neutral-200"
                >
                  Đổi
                </button>
              </div>

              <div className="mt-2.5 flex items-center justify-between text-[11px]">
                <button
                  type="button"
                  onClick={() => navigateToTab("pos")}
                  className="font-semibold text-neutral-900 hover:underline"
                >
                  Mở POS ngay
                </button>
                <button
                  type="button"
                  onClick={() => void refreshWorkspaceData()}
                  className="text-neutral-400 hover:text-neutral-700"
                >
                  Làm mới
                </button>
              </div>
            </div>
          </div>

          {/* Quick Link to Standalone POS Terminal */}
          <div className="pt-2">
            <a
              href="/terminal"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-neutral-800 hover:bg-neutral-100 hover:border-neutral-300 transition-colors shadow-sm"
            >
              <MonitorSmartphone className="h-3.5 w-3.5 text-emerald-600" />
              <span className="truncate">Máy POS Terminal</span>
              <ArrowUpRight className="h-3 w-3 ml-auto text-neutral-400" />
            </a>
          </div>

          {/* User Profile Footer */}
          <div className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-neutral-200/60">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                suppressHydrationWarning
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white"
              >
                {(currentUser?.email?.[0] || "A").toUpperCase()}
              </div>
              <div className="min-w-0">
                <div
                  suppressHydrationWarning
                  className="truncate text-xs font-semibold text-neutral-900"
                >
                  {currentUser?.full_name || "Organization Admin"}
                </div>
                <div
                  suppressHydrationWarning
                  className="truncate text-[11px] text-neutral-500"
                >
                  pos.com/{currentOrg?.code?.toLowerCase() || "demo"}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Đăng xuất"
              className="rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-900"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ================================================================== */}
      {/* MAIN CONTENT AREA (CLEAN WHITE CANVAS)                             */}
      {/* ================================================================== */}
      <main className="flex-1 overflow-y-auto bg-white px-8 py-7">
        {/* Global Notification Bar */}
        {banner && (
          <div className="mb-6 flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-800 shadow-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2
                className={`h-4 w-4 shrink-0 ${
                  banner.type === "error"
                    ? "text-rose-600"
                    : banner.type === "info"
                      ? "text-amber-600"
                      : "text-emerald-600"
                }`}
              />
              <span className="font-medium">{banner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="text-neutral-400 hover:text-neutral-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB SKELETON WIREFRAME (LOAD TRƯỚC KHUNG PHÁC THẢO LAYOUT)        */}
        {/* ================================================================ */}
        {isInitializing ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Đang chuẩn bị khung dữ liệu chi nhánh...
              </span>
            </div>
            {activeTab === "overview" && <OverviewSkeleton />}
            {activeTab === "pos" && <PosSkeleton />}
            {activeTab === "orders" && <OrdersSkeleton />}
            {activeTab === "products" && <ProductsSkeleton />}
            {activeTab === "inventory" && <InventorySkeleton />}
            {activeTab === "stores" && <StoresSkeleton />}
            {activeTab === "settings" && <SettingsSkeleton />}
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
            >
              {/* ================================================================ */}
              {/* TAB 1: OVERVIEW (CAL.COM TEAMS HERO + 6-CARD FEATURE GRID)       */}
              {/* ================================================================ */}
              {activeTab === "overview" && (
                <div className="space-y-6">
            {/* Page Header */}
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-neutral-900">
                  Chuỗi Cửa Hàng & Quầy Thu Ngân
                </h1>
                <p className="mt-0.5 text-sm text-neutral-500">
                  Vận hành tập trung đa chi nhánh, kiểm soát sổ cái tồn kho và
                  đồng bộ thiết bị POS theo thời gian thực.
                </p>
              </div>
              <ShimmerButton onClick={() => setActiveModal("create_store")}>
                <Plus className="h-3.5 w-3.5" />
                Thêm Chi Nhánh
              </ShimmerButton>
            </div>

            {/* Hero Banner (Exact Cal.com "Cal.com is better with teams" layout) */}
            <div className="relative overflow-hidden rounded-xl border border-neutral-200 bg-gradient-to-r from-[#D5DCE6]/80 via-[#E2E7EE]/70 to-[#EFECE6]/80 p-8">
              <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
                <div className="lg:col-span-6 space-y-4">
                  <h2 className="text-2xl font-bold tracking-tight text-neutral-900">
                    POS.com tối ưu cho vận hành chuỗi
                  </h2>
                  <p className="text-sm leading-relaxed text-neutral-600">
                    Kết nối tức thì các máy POS Android tại quầy bằng mã QR 1
                    lần, tự động trừ kho chuẩn ACID và đảm bảo bán hàng xuyên
                    suốt ngay cả khi mất kết nối Internet.
                  </p>
                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <ShimmerButton onClick={() => navigateToTab("pos")}>
                      Mở Quầy Bán Hàng POS
                    </ShimmerButton>
                    <RippleButton
                      onClick={() => setActiveModal("create_product")}
                    >
                      + Thêm Sản Phẩm Mới
                    </RippleButton>
                  </div>
                </div>

                {/* Right Floating Preview Card (Cal.com Calendar Card Style) */}
                <div className="lg:col-span-6">
                  <div className="rounded-xl border border-neutral-200/90 bg-white p-5 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.08)]">
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-12">
                      <div className="sm:col-span-5 border-b sm:border-b-0 sm:border-r border-neutral-100 pb-4 sm:pb-0 sm:pr-4">
                        <div className="flex -space-x-1.5 mb-2">
                          <div className="h-6 w-6 rounded-full bg-neutral-900 text-[10px] font-bold text-white flex items-center justify-center ring-2 ring-white">
                            P
                          </div>
                          <div className="h-6 w-6 rounded-full bg-rose-500 text-[10px] font-bold text-white flex items-center justify-center ring-2 ring-white">
                            S
                          </div>
                          <div className="h-6 w-6 rounded-full bg-emerald-600 text-[10px] font-bold text-white flex items-center justify-center ring-2 ring-white">
                            C
                          </div>
                        </div>
                        <div
                          suppressHydrationWarning
                          className="text-[11px] font-medium text-neutral-400"
                        >
                          {currentOrg?.name || "Demo Retail Chain Vietnam"}
                        </div>
                        <div className="text-sm font-bold text-neutral-900 mt-0.5">
                          {currentStoreObj?.name || "Cửa hàng chính"}
                        </div>
                        <div className="mt-3 space-y-1.5 text-[11px] text-neutral-500">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-neutral-400" />
                            <span>Ca bán hàng trực tuyến</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                            <span>
                              Chế độ:{" "}
                              {capabilities?.deployment_mode === "private"
                                ? "Private Server"
                                : "Cloud Multi-Tenant"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="sm:col-span-7 flex flex-col justify-between">
                        <div className="flex items-center justify-between text-xs font-semibold text-neutral-800">
                          <span>Chỉ số thời gian thực</span>
                          <span className="text-[11px] font-normal text-neutral-400">
                            Hôm nay
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2.5">
                          <div className="rounded-lg bg-neutral-50 border border-neutral-100 p-2.5">
                            <div className="text-[10px] text-neutral-400 uppercase">
                              Doanh thu
                            </div>
                            <div className="mt-0.5 text-sm font-bold text-neutral-900">
                              <NumberTicker value={totalRevenue} suffix=" ₫" />
                            </div>
                          </div>
                          <div className="rounded-lg bg-neutral-50 border border-neutral-100 p-2.5">
                            <div className="text-[10px] text-neutral-400 uppercase">
                              Hóa đơn
                            </div>
                            <div className="mt-0.5 text-sm font-bold text-neutral-900">
                              <NumberTicker value={orders.length} suffix=" đơn" />
                            </div>
                          </div>
                          <div className="rounded-lg bg-neutral-50 border border-neutral-100 p-2.5">
                            <div className="text-[10px] text-neutral-400 uppercase">
                              Tồn kho
                            </div>
                            <div className="mt-0.5 text-sm font-bold text-neutral-900">
                              <NumberTicker
                                value={totalStockUnits}
                                suffix=" đv"
                              />
                            </div>
                          </div>
                          <div className="rounded-lg bg-neutral-900 p-2.5 text-white">
                            <div className="text-[10px] text-neutral-300 uppercase">
                              SKU Đang Bán
                            </div>
                            <div className="mt-0.5 text-sm font-bold text-white">
                              {allVariants.length} món
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 6-Card 3-Column Feature & Metric Grid (Cal.com exact card style) */}
            <BentoGrid>
              <BentoCard
                name="Bán hàng tại quầy tốc độ cao"
                description="Chọn món nhanh theo mã SKU/Barcode, tự động tính tiền thừa và hạch toán vào ca thu ngân đang mở."
                Icon={ShoppingCart}
                iconColorClass="text-rose-500"
                badge={`${orders.length} đơn hoàn tất`}
                cta="Mở Quầy Bán Hàng POS"
                onAction={() => navigateToTab("pos")}
              />

              <BentoCard
                name="Đồng bộ Offline Outbox (Idempotent)"
                description="Lưu đơn hàng vào bộ nhớ cục bộ khi rớt mạng và đẩy lô sự kiện lên server không bao giờ trùng lặp."
                Icon={RefreshCw}
                iconColorClass="text-sky-500"
                badge={`${outboxQueue.length} đơn trong Outbox`}
                cta="Kiểm tra Hàng đợi Đồng bộ"
                onAction={() => navigateToTab("orders")}
              />

              <BentoCard
                name="Ghép nối máy POS bằng mã 6 số"
                description="Kết nối tức thì máy POS Android tại quầy bằng mã PIN 6 chữ số hiển thị trên màn hình thiết bị."
                Icon={Radio}
                iconColorClass="text-emerald-500"
                badge={`${devices.length} thiết bị POS`}
                cta="Ghép nối máy POS mới"
                onAction={() => {
                  navigateToTab("stores");
                  const nextNum = devices.length + 1;
                  setPairingCodeInput("");
                  setPairingStoreId(selectedStoreId);
                  setPairingDeviceCode(`POS-TERMINAL-0${nextNum}`);
                  setPairingDeviceName(`Máy POS Thu Ngân Quầy ${nextNum}`);
                  setActiveModal("pair_pos_device");
                }}
              />

              <BentoCard
                name="Sổ cái Tồn kho Bất biến (Stock Ledger)"
                description="Mọi thay đổi số lượng tồn kho đều lưu vết kiểm toán vào bảng stock_movements chống sửa xóa."
                Icon={Boxes}
                iconColorClass="text-amber-500"
                badge={`${totalStockUnits} đv tồn kho`}
                cta="Tạo phiếu Nhập / Điều chỉnh kho"
                onAction={() => {
                  navigateToTab("inventory");
                  setActiveModal("adjust_stock");
                }}
              />

              <BentoCard
                name="Danh mục Sản phẩm & Bảng giá"
                description="Quản lý tập trung sản phẩm, biến thể, đơn vị tính, giá vốn và mã vạch chuẩn hóa trên toàn chuỗi."
                Icon={Package}
                iconColorClass="text-purple-500"
                badge={`${allVariants.length} biến thể SKU`}
                cta="Quản lý Danh mục Sản phẩm"
                onAction={() => navigateToTab("products")}
              />

              <BentoCard
                name="Kiến trúc Dual-Deployment & RLS"
                description="Chạy đồng nhất một codebase cho cả Cloud SaaS Multi-Tenant và Private Server Single-Tenant."
                Icon={ShieldCheck}
                iconColorClass="text-indigo-500"
                badge={
                  capabilities?.deployment_mode === "private"
                    ? "Private Server"
                    : "Cloud Multi-Tenant"
                }
                cta="Xem cấu hình & License"
                onAction={() => navigateToTab("settings")}
              />
            </BentoGrid>
          </div>
        )}

              {/* ================================================================ */}
              {/* TAB 2: LCD POS TERMINAL (PORTRAIT 9:16 & LANDSCAPE 16:9 APK SIM) */}
              {/* ================================================================ */}
              {activeTab === "pos" && (
                <div className="space-y-4">
                  {/* Mode Bar */}
                  <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span
                          className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                            posSimMode === "unpaired"
                              ? "bg-amber-400"
                              : "bg-emerald-400"
                          }`}
                        />
                        <span
                          className={`relative inline-flex rounded-full h-2 w-2 ${
                            posSimMode === "unpaired"
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                          }`}
                        />
                      </span>
                      <span className="font-semibold text-neutral-800">
                        {posSimMode === "unpaired"
                          ? "Mô phỏng: Máy POS Android mới tinh tại quầy (Chưa ghép nối)"
                          : "Mô phỏng: Máy POS đã kích hoạt sẵn sàng bán hàng"}
                      </span>
                    </div>
                    {posSimMode === "terminal" ? (
                      <button
                        type="button"
                        onClick={startPosPairingSession}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1 font-semibold text-neutral-700 hover:bg-neutral-100 transition-colors shadow-sm"
                      >
                        <Radio className="h-3.5 w-3.5 text-amber-600" />
                        Mô phỏng máy mới chưa ghép nối (Lấy mã 6 số)
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPosSimMode("terminal")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1 font-semibold text-neutral-700 hover:bg-neutral-100 transition-colors shadow-sm"
                      >
                        Bỏ qua → Vào thẳng màn hình Bán hàng
                      </button>
                    )}
                  </div>

                  {posSimMode === "unpaired" ? (
                    <div className="mx-auto max-w-2xl rounded-3xl border-4 border-neutral-900 bg-neutral-950 p-8 text-white shadow-2xl text-center space-y-6">
                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                        <Radio className="h-8 w-8 animate-pulse" />
                      </div>

                      <div>
                        <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                          POS Android Terminal • Chờ Ghép Nối
                        </span>
                        <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">
                          Chào Mừng Đến Với POS.com
                        </h2>
                        <p className="mt-1 text-xs text-neutral-400 max-w-md mx-auto">
                          Thiết bị chưa được liên kết với chi nhánh nào. Vui lòng mở Web Quản Trị Tổ Chức (:13000) vào mục <strong>Thiết Bị</strong> và nhập mã số bên dưới:
                        </p>
                      </div>

                      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-6 max-w-sm mx-auto shadow-inner">
                        <div className="text-[11px] font-medium uppercase tracking-widest text-neutral-400 mb-1">
                          MÃ GHÉP NỐI THIẾT BỊ NÀY
                        </div>
                        <div className="font-mono text-4xl sm:text-5xl font-black tracking-[0.25em] text-emerald-400 py-2 select-all">
                          {posSimPairingSession ? posSimPairingSession.formatted_code : "ĐANG TẠO..."}
                        </div>
                        <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-neutral-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                          Đang chờ xác nhận từ Web Quản Trị...
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                        <button
                          type="button"
                          onClick={startPosPairingSession}
                          disabled={loading}
                          className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-xs font-semibold text-neutral-200 hover:bg-neutral-700 transition-colors"
                        >
                          Làm mới mã ghép nối
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (posSimPairingSession) {
                              setPairingCodeInput(posSimPairingSession.pairing_code);
                              setPairingStoreId(selectedStoreId);
                              setActiveModal("pair_pos_device");
                            }
                          }}
                          className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-neutral-950 hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20"
                        >
                          Mở hộp thoại nhập mã này ngay →
                        </button>
                      </div>
                    </div>
                  ) : (
                    <PosLcdSimulator
                      storeCode={currentStoreObj?.code || "DEMO-S1"}
                      storeName={currentStoreObj?.name || "Cửa hàng chính"}
                      orgName={currentOrg?.name || "POS Organization"}
                      variants={allVariants}
                      cart={cart}
                      orders={orders}
                      outboxQueue={outboxQueue}
                      offlineMode={offlineMode}
                      loading={loading}
                      activeCashSession={activeCashSession}
                      onToggleOffline={() => setOfflineMode((prev) => !prev)}
                      onOpenCashSession={handleOpenCashSession}
                      onAddToCart={addToCart}
                      onUpdateCartQty={updateCartQty}
                      onClearCart={() => setCart([])}
                      onCheckoutOrder={handleCheckoutOrder}
                      onFlushOutbox={handleFlushOfflineOutbox}
                      onQuickStockAdj={handleQuickStockAdjustment}
                      onOpenCreateProductModal={() => setActiveModal("create_product")}
                    />
                  )}
                </div>
              )}

        {/* ================================================================ */}
        {/* TAB 3: ORDERS & OUTBOX SYNC (CAL.COM BOOKINGS TABS STYLE)        */}
        {/* ================================================================ */}
        {activeTab === "orders" && (
          <div className="space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-neutral-900">
                  Hóa Đơn & Đồng Bộ Offline
                </h1>
                <p className="mt-0.5 text-sm text-neutral-500">
                  Xem lịch sử hóa đơn đã hạch toán và trạng thái đồng bộ Outbox
                  từ các thiết bị POS.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {outboxQueue.length > 0 && (
                  <ShimmerButton
                    onClick={() => void handleFlushOfflineOutbox()}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Đồng bộ {outboxQueue.length} đơn Offline
                  </ShimmerButton>
                )}
                <RippleButton onClick={() => navigateToTab("pos")}>
                  + Tạo Hóa Đơn Mới
                </RippleButton>
              </div>
            </div>

            {/* Horizontal Filter Tabs (Exact Cal.com Bookings Sub-tabs from Screenshot 5) */}
            <div className="flex items-center gap-2 border-b border-neutral-200 pb-3">
              {[
                {
                  id: "all",
                  label: `Tất cả hóa đơn (${orders.length})`,
                },
                {
                  id: "paid",
                  label: `Đã thanh toán (${orders.filter((o) => o.payment_status === "paid").length})`,
                },
                {
                  id: "outbox",
                  label: `Chờ đồng bộ Offline (${outboxQueue.length})`,
                },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setOrderFilterTab(t.id as any)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    orderFilterTab === t.id
                      ? "bg-neutral-100 text-neutral-900 font-semibold"
                      : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {orderFilterTab === "outbox" ? (
              <div className="space-y-3">
                {outboxQueue.length === 0 ? (
                  <div className="rounded-xl border border-neutral-200 p-10 text-center text-sm text-neutral-500">
                    Không có đơn hàng nào đang chờ trong hàng đợi Offline
                    Outbox.
                  </div>
                ) : (
                  <AnimatedList>
                    {outboxQueue.map((ev) => (
                      <div
                        key={ev.event_id}
                        className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4"
                      >
                        <div>
                          <div className="text-xs font-bold text-neutral-900">
                            {ev.client_order_id}
                          </div>
                          <div className="mt-0.5 text-xs text-neutral-500">
                            Idempotency Key:{" "}
                            <code className="font-mono text-[11px]">
                              {ev.idempotency_key}
                            </code>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                            PENDING SYNC
                          </span>
                          <span className="text-sm font-bold text-neutral-900">
                            {formatMoneyVND(ev.total_amount)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </AnimatedList>
                )}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white divide-y divide-neutral-200">
                {orders.length === 0 ? (
                  <div className="p-10 text-center text-sm text-neutral-500">
                    Chưa có hóa đơn nào. Hãy mở Quầy Bán Hàng POS để tạo đơn đầu
                    tiên.
                  </div>
                ) : (
                  orders.map((ord) => (
                    <div
                      key={ord.id}
                      className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 hover:bg-neutral-50/70 transition-colors"
                    >
                      <div className="flex items-center gap-6">
                        <div className="w-28">
                          <div className="text-xs font-semibold text-neutral-900">
                            {ord.occurred_at
                              ? new Date(ord.occurred_at).toLocaleDateString(
                                  "vi-VN"
                                )
                              : "Hôm nay"}
                          </div>
                          <div className="text-xs text-neutral-500">
                            {ord.occurred_at
                              ? new Date(ord.occurred_at).toLocaleTimeString(
                                  "vi-VN"
                                )
                              : "--:--"}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-neutral-900">
                            Hóa đơn #{ord.order_number}
                          </div>
                          <div className="text-xs text-neutral-500">
                            Trạng thái: {(ord.status || "completed").toUpperCase()} • Thanh toán:{" "}
                            {(ord.payment_status || "paid").toUpperCase()}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-neutral-900">
                          {formatMoneyVND(ord.total_amount)}
                        </span>
                        <span className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700">
                          Đã ghi sổ
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 4: PRODUCTS & CATALOG                                        */}
        {/* ================================================================ */}
        {activeTab === "products" && (
          <div className="space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-neutral-900">
                  Danh Mục Sản Phẩm & Bảng Giá
                </h1>
                <p className="mt-0.5 text-sm text-neutral-500">
                  Quản lý danh mục món, mã SKU, Barcode chuẩn hóa và giá bán
                  niêm yết.
                </p>
              </div>
              <ShimmerButton onClick={() => setActiveModal("create_product")}>
                <Plus className="h-3.5 w-3.5" />
                Thêm Sản Phẩm Mới
              </ShimmerButton>
            </div>

            <div className="space-y-2.5">
              {allVariants.map((v) => (
                <div
                  key={v.variantId}
                  className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4 hover:border-neutral-300 transition-all"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 font-mono text-xs font-bold text-neutral-700">
                      SKU
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-neutral-900">
                          {v.productName}
                        </span>
                        <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-[11px] text-neutral-600">
                          {v.sku}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        Barcode: <span className="font-mono">{v.barcode}</span>{" "}
                        • Tồn hiện tại:{" "}
                        <strong className="text-neutral-800">
                          {v.onHand} đv
                        </strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-neutral-900">
                      {formatMoneyVND(v.price)}
                    </span>
                    <RippleButton
                      onClick={() => {
                        setAdjVariantId(v.variantId);
                        setActiveModal("adjust_stock");
                      }}
                    >
                      + Nhập kho
                    </RippleButton>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 5: INVENTORY & IMMUTABLE STOCK LEDGER                        */}
        {/* ================================================================ */}
        {activeTab === "inventory" && (
          <div className="space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-neutral-900">
                  Tồn Kho & Sổ Cái Xuất Nhập (Stock Ledger)
                </h1>
                <p className="mt-0.5 text-sm text-neutral-500">
                  Số dư tồn kho thời gian thực tại chi nhánh{" "}
                  <strong>{currentStoreObj?.name}</strong>.
                </p>
              </div>
              <ShimmerButton onClick={() => setActiveModal("adjust_stock")}>
                <Plus className="h-3.5 w-3.5" />
                Tạo Phiếu Điều Chỉnh Kho
              </ShimmerButton>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {allVariants.map((v) => (
                <MagicCard key={v.variantId} className="p-5">
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-xs font-medium text-neutral-700">
                      {v.sku}
                    </span>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                      Tồn: {v.onHand} đv
                    </span>
                  </div>
                  <h3 className="mt-3 text-sm font-bold text-neutral-900">
                    {v.productName}
                  </h3>
                  <p className="mt-1 text-xs text-neutral-500">
                    Giá trị tồn ước tính:{" "}
                    <strong className="text-neutral-900">
                      {formatMoneyVND(v.onHand * v.price)}
                    </strong>
                  </p>
                  <div className="mt-4 pt-3 border-t border-neutral-100 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setAdjVariantId(v.variantId);
                        setActiveModal("adjust_stock");
                      }}
                      className="text-xs font-semibold text-neutral-900 hover:underline"
                    >
                      Điều chỉnh số lượng →
                    </button>
                  </div>
                </MagicCard>
              ))}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 6: STORES & BRANCHES MANAGEMENT                              */}
        {/* ================================================================ */}
        {activeTab === "stores" && (
          <div>
            {viewingStoreDevicesId ? (
              // ==============================================================
              // VIEW A: BRANCH POS DEVICES PAGE (TRANG THIẾT BỊ CHI NHÁNH)
              // ==============================================================
              <div className="space-y-6">
                <button
                  type="button"
                  onClick={() => setViewingStoreDevicesId(null)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Quay lại danh sách chi nhánh
                </button>

                {/* Page Header */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="rounded bg-neutral-900 px-2 py-0.5 font-mono text-xs font-bold text-white">
                        {currentStoreObj?.code || "DEMO-S1"}
                      </span>
                      <span className="text-xs font-semibold text-neutral-500">
                        Chi nhánh: {currentStoreObj?.name}
                      </span>
                    </div>
                    <h1 className="text-xl font-bold tracking-tight text-neutral-900">
                      Thiết Bị & Quầy POS — {currentStoreObj?.name}
                    </h1>
                    <p className="mt-0.5 text-sm text-neutral-500">
                      Quản lý danh sách máy POS Android, quầy thu ngân và ghép nối bảo mật bằng mã PIN 6 chữ số tại chi nhánh này.
                    </p>
                  </div>

                  <ShimmerButton
                    onClick={() => {
                      if (!currentStoreObj) return;
                      setSelectedStoreId(currentStoreObj.id);
                      setPairingStoreId(currentStoreObj.id);
                      const nextNum = devices.length + 1;
                      setPairingCodeInput("");
                      setPairingDeviceCode(`POS-TERMINAL-0${nextNum}`);
                      setPairingDeviceName(`Máy POS Thu Ngân Quầy ${nextNum}`);
                      setActiveModal("pair_pos_device");
                    }}
                  >
                    <Radio className="h-3.5 w-3.5" />
                    + Ghép Nối Máy POS Mới
                  </ShimmerButton>
                </div>

                {/* Quick Guide Card */}
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                  <div className="flex items-start gap-3.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-white">
                      <Radio className="h-4 w-4" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-neutral-900">
                        Quy Trình Ghép Nối Máy POS 6 Chữ Số Vào Chi Nhánh
                      </h3>
                      <p className="text-xs text-neutral-600 leading-relaxed">
                        1. Mở máy POS Android tại quầy (hoặc mở trang <strong>Máy POS Terminal :13000/terminal</strong> để giả lập thiết bị thật).<br />
                        2. Màn hình máy POS sẽ hiển thị mã kết nối 6 chữ số ngẫu nhiên.<br />
                        3. Bấm nút <strong>&ldquo;+ Ghép Nối Máy POS Mới&rdquo;</strong> ở trên, nhập 6 số và xác nhận. Máy POS sẽ tự động liên kết thành công vào {currentStoreObj?.name}!
                      </p>
                    </div>
                  </div>
                </div>

                {/* Devices List of This Store */}
                <div className="space-y-3">
                  {devices
                    .filter((d) => d.store_id === currentStoreObj?.id)
                    .map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-5 shadow-sm"
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-800">
                            <Smartphone className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-neutral-900">
                                {d.name}
                              </span>
                              <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-xs text-neutral-700">
                                {d.device_code}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-neutral-500">
                              Nền tảng: {d.device_type} ({d.platform}) • Trạng thái:{" "}
                              <strong className="text-neutral-900">
                                {(d.status || "active").toUpperCase()}
                              </strong>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5">
                          <span
                            className={`rounded-md border px-3 py-1 text-xs font-semibold ${
                              d.status === "active"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                            }`}
                          >
                            {(d.status || "active").toUpperCase()}
                          </span>
                          {d.status === "active" && (
                            <button
                              type="button"
                              onClick={() => void handleRevokeDevice(d.id, d.name)}
                              title="Ngắt kết nối máy POS này"
                              className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-500 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 transition-colors"
                            >
                              Ngắt kết nối
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleDeleteDevice(d.id, d.name)}
                            title="Xóa thiết bị này khỏi chi nhánh"
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50/70 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-100 hover:border-rose-300 transition-colors"
                          >
                            <Trash2 className="h-3 w-3" />
                            Xóa
                          </button>
                        </div>
                      </div>
                    ))}

                  {devices.filter((d) => d.store_id === currentStoreObj?.id).length === 0 && (
                    <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-12 text-center space-y-3">
                      <Smartphone className="mx-auto h-8 w-8 text-neutral-400" />
                      <div className="text-sm font-semibold text-neutral-800">
                        Chưa có máy POS nào được ghép nối tại chi nhánh này
                      </div>
                      <p className="text-xs text-neutral-500 max-w-md mx-auto">
                        Mở máy POS tại quầy (hoặc mở tab :13000/terminal) lấy mã 6 chữ số và bấm nút bên dưới để ghép nối thiết bị vào {currentStoreObj?.name}!
                      </p>
                      <div className="pt-2">
                        <ShimmerButton
                          onClick={() => {
                            if (!currentStoreObj) return;
                            setSelectedStoreId(currentStoreObj.id);
                            setPairingStoreId(currentStoreObj.id);
                            const nextNum = devices.length + 1;
                            setPairingCodeInput("");
                            setPairingDeviceCode(`POS-TERMINAL-0${nextNum}`);
                            setPairingDeviceName(`Máy POS Thu Ngân Quầy ${nextNum}`);
                            setActiveModal("pair_pos_device");
                          }}
                        >
                          <Radio className="h-3.5 w-3.5" />
                          + Ghép Nối Máy POS Ngay
                        </ShimmerButton>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // ==============================================================
              // VIEW B: STORES GRID (DANH SÁCH CHI NHÁNH TỔNG QUAN)
              // ==============================================================
              <div className="space-y-6">
                {/* Page Header */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h1 className="text-xl font-bold tracking-tight text-neutral-900">
                      Hệ Thống Chi Nhánh Cửa Hàng
                    </h1>
                    <p className="mt-0.5 text-sm text-neutral-500">
                      Quản lý mạng lưới chi nhánh, cấu hình điểm bán và theo dõi các máy POS trực thuộc chuỗi.
                    </p>
                  </div>
                  <ShimmerButton onClick={() => setActiveModal("create_store")}>
                    <Plus className="h-3.5 w-3.5" />
                    + Thêm Chi Nhánh Mới
                  </ShimmerButton>
                </div>

                {/* Summary Metric Strip */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                    <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
                      Tổng số chi nhánh
                    </div>
                    <div className="mt-1 text-2xl font-bold text-neutral-900">
                      {stores.length}
                    </div>
                    <div className="mt-0.5 text-[11px] text-emerald-600 font-medium">
                      Đang hoạt động trên toàn chuỗi
                    </div>
                  </div>

                  <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                    <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
                      Đang chọn làm việc
                    </div>
                    <div className="mt-1 text-base font-bold text-neutral-900 truncate">
                      {currentStoreObj?.name || "Chưa chọn"}
                    </div>
                    <div className="mt-0.5 text-[11px] text-neutral-500 font-mono">
                      Mã: {currentStoreObj?.code || "--"}
                    </div>
                  </div>

                  <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                    <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
                      Múi giờ vận hành
                    </div>
                    <div className="mt-1 text-sm font-bold text-neutral-900 truncate">
                      Asia/Ho_Chi_Minh
                    </div>
                    <div className="mt-0.5 text-[11px] text-neutral-500">
                      Giờ chuẩn Việt Nam (UTC+7)
                    </div>
                  </div>

                  <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                    <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
                      Đơn vị tiền tệ
                    </div>
                    <div className="mt-1 text-xl font-bold text-neutral-900">
                      VND (₫)
                    </div>
                    <div className="mt-0.5 text-[11px] text-neutral-500">
                      Định dạng giá chuẩn
                    </div>
                  </div>
                </div>

                {/* Branch Cards List */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {stores.map((st) => {
                    const isWorkingStore = st.id === selectedStoreId;
                    const storeDevices = devices.filter((d) => d.store_id === st.id);
                    return (
                      <div
                        key={st.id}
                        className={`rounded-2xl border p-5 transition-all ${
                          isWorkingStore
                            ? "border-neutral-900 bg-white shadow-md ring-1 ring-neutral-900"
                            : "border-neutral-200 bg-white hover:border-neutral-300 shadow-sm"
                        }`}
                      >
                        <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-neutral-900 px-2 py-0.5 font-mono text-xs font-bold text-white">
                              {st.code}
                            </span>
                            {isWorkingStore && (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Đang làm việc
                              </span>
                            )}
                          </div>
                          <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            {(st.status || "active").toUpperCase()}
                          </span>
                        </div>

                        <div className="py-4 space-y-1">
                          <h3 className="text-base font-bold text-neutral-900">
                            {st.name}
                          </h3>
                          <div className="flex items-center gap-4 text-xs text-neutral-500">
                            <span>Múi giờ: {st.timezone || "Asia/Ho_Chi_Minh"}</span>
                            <span>•</span>
                            <span>Tiền tệ: {st.currency_code || "VND"}</span>
                          </div>
                          <div className="mt-2 text-xs text-neutral-600">
                            Thiết bị liên kết:{" "}
                            <strong className="text-neutral-900">
                              {storeDevices.length} máy POS
                            </strong>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-neutral-100">
                          <div>
                            {isWorkingStore ? (
                              <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                                <Check className="h-3.5 w-3.5" />
                                Chi nhánh mặc định
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedStoreId(st.id);
                                  if (typeof window !== "undefined") {
                                    localStorage.setItem("pos_selected_store_id", st.id);
                                  }
                                  notify("success", `Đã chuyển sang làm việc tại chi nhánh ${st.name}!`);
                                }}
                                className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-100 transition-colors"
                              >
                                Chọn làm việc
                              </button>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedStoreId(st.id);
                              setViewingStoreDevicesId(st.id);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 hover:border-neutral-400 transition-colors shadow-sm"
                          >
                            <Smartphone className="h-3.5 w-3.5 text-neutral-600" />
                            <span>Xem thiết bị ({storeDevices.length} thiết bị)</span>
                            <ChevronRight className="h-3.5 w-3.5 text-neutral-400" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {stores.length === 0 && (
                    <div className="col-span-2 rounded-2xl border border-dashed border-neutral-200 p-12 text-center space-y-3">
                      <StoreIcon className="mx-auto h-8 w-8 text-neutral-400" />
                      <div className="text-sm font-semibold text-neutral-800">
                        Chưa có chi nhánh nào được tạo
                      </div>
                      <p className="text-xs text-neutral-500">
                        Bấm nút &ldquo;+ Thêm Chi Nhánh Mới&rdquo; ở góc trên để tạo chi nhánh đầu tiên của chuỗi.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 7: SETTINGS & APPEARANCE (EXACT CAL.COM SCREENSHOTS 2 & 3)   */}
        {/* ================================================================ */}
        {activeTab === "settings" && (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            {/* Secondary Settings Sub-Sidebar (Screenshot 2 & 3) */}
            <div className="lg:col-span-3 space-y-5 border-r border-neutral-100 pr-4">
              <button
                type="button"
                onClick={() => navigateToTab("overview")}
                className="inline-flex items-center gap-2 text-xs font-semibold text-neutral-700 hover:text-neutral-900"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Quay lại
              </button>

              <div className="space-y-1">
                <div className="px-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                  Cấu hình Tổ chức
                </div>
                {[
                  { id: "general", label: "Thông tin chung" },
                  { id: "appearance", label: "Giao diện (Appearance)" },
                  {
                    id: "capabilities",
                    label: "Bản quyền & Chế độ Triển khai",
                  },
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setSettingsSubTab(st.id as any)}
                    className={`block w-full rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                      settingsSubTab === st.id
                        ? "bg-neutral-200/80 font-semibold text-neutral-900"
                        : "font-medium text-neutral-600 hover:bg-neutral-100"
                    }`}
                  >
                    {st.label}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => navigateToTab("stores")}
                  className="flex items-center justify-between w-full rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-neutral-600 hover:bg-neutral-100 transition-colors"
                >
                  <span>Xem Tất cả Chi nhánh</span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-neutral-400" />
                </button>
              </div>
            </div>

            {/* Settings Main Panel */}
            <div className="lg:col-span-9 space-y-6 max-w-2xl">
              <div>
                <h2 className="text-lg font-bold text-neutral-900">
                  {settingsSubTab === "appearance"
                    ? "Appearance"
                    : settingsSubTab === "stores"
                      ? "Chi nhánh Cửa hàng"
                      : settingsSubTab === "capabilities"
                        ? "Bản quyền & Chế độ Triển khai"
                        : "Thông tin Tổ chức"}
                </h2>
                <p
                  suppressHydrationWarning
                  className="text-xs text-neutral-500 mt-0.5"
                >
                  Quản lý thiết lập vận hành trên toàn bộ hệ thống{" "}
                  {currentOrg?.name || "Demo Retail Chain Vietnam"}.
                </p>
              </div>

              {/* Theme Preview Cards (Exact match to Cal.com Screenshot 2) */}
              <div className="rounded-xl border border-neutral-200 bg-white p-6 space-y-4">
                <div>
                  <div className="text-sm font-semibold text-neutral-900">
                    Chế độ Giao diện (Theme)
                  </div>
                  <p className="text-xs text-neutral-500">
                    Thiết kế tối giản chuẩn Cal.com giúp thu ngân và quản lý
                    thao tác rõ ràng, không mỏi mắt.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-1">
                  {[
                    { label: "System default", active: false },
                    { label: "Light (Cal.com Clean)", active: true },
                    { label: "Dark", active: false },
                  ].map((th) => (
                    <div key={th.label} className="text-center">
                      <div
                        className={`h-24 rounded-lg border p-3 flex flex-col justify-between ${
                          th.active
                            ? "border-2 border-neutral-900 bg-neutral-50"
                            : "border-neutral-200 bg-neutral-100/70 opacity-70"
                        }`}
                      >
                        <div className="h-2 w-12 rounded bg-neutral-300" />
                        <div className="space-y-1.5 rounded bg-white p-2 border border-neutral-200/70">
                          <div className="h-1.5 w-full rounded bg-neutral-200" />
                          <div className="h-1.5 w-2/3 rounded bg-neutral-200" />
                        </div>
                      </div>
                      <span className="mt-2 block text-xs font-medium text-neutral-700">
                        {th.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Capabilities & Toggle Card (Exact match to Cal.com Screenshot 3) */}
              <div className="rounded-xl border border-neutral-200 bg-white p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 font-bold text-xs text-neutral-800">
                      POS
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-neutral-900">
                        {capabilities?.deployment_mode === "private"
                          ? "Single-Tenant Private Server"
                          : "Multi-Tenant Cloud SaaS"}
                      </div>
                      <div className="text-xs text-neutral-500">
                        Trạng thái License:{" "}
                        <strong className="text-emerald-700">
                          {capabilities?.license_status || "ACTIVE"}
                        </strong>{" "}
                        • Hạn mức: {stores.length} chi nhánh
                      </div>
                    </div>
                  </div>
                  <RippleButton
                    onClick={() => setActiveModal("create_store")}
                  >
                    + Thêm Chi Nhánh
                  </RippleButton>
                </div>

                <div className="space-y-3 pt-1">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="inline-flex h-5 w-9 items-center rounded-full bg-neutral-900 p-0.5">
                      <span className="h-4 w-4 translate-x-4 rounded-full bg-white" />
                    </span>
                    <span className="font-medium text-neutral-800">
                      Cô lập dữ liệu đa tổ chức (PostgreSQL Row-Level Security)
                    </span>
                    <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">
                      Đang bật
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <span className="inline-flex h-5 w-9 items-center rounded-full bg-neutral-900 p-0.5">
                      <span className="h-4 w-4 translate-x-4 rounded-full bg-white" />
                    </span>
                    <span className="font-medium text-neutral-800">
                      Sổ cái tồn kho bất biến (Immutable Stock Movements)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )}
      </main>

      {/* ================================================================== */}
      {/* CLEAN CENTERED MODAL DIALOG (EXACT CAL.COM SCREENSHOT 5 STYLE)     */}
      {/* ================================================================== */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 backdrop-blur-[1px] p-4">
          <BlurFade
            delay={0.01}
            className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
                  {activeModal === "create_product" && (
                    <Package className="h-5 w-5" />
                  )}
                  {activeModal === "adjust_stock" && (
                    <Boxes className="h-5 w-5" />
                  )}
                  {activeModal === "create_store" && (
                    <StoreIcon className="h-5 w-5" />
                  )}
                  {activeModal === "pair_pos_device" && (
                    <Radio className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-900">
                    {activeModal === "create_product" &&
                      "Thêm Sản Phẩm & Biến Thể Mới"}
                    {activeModal === "adjust_stock" &&
                      "Phiếu Nhập / Điều Chỉnh Tồn Kho"}
                    {activeModal === "create_store" &&
                      "Thêm Chi Nhánh Cửa Hàng"}
                    {activeModal === "pair_pos_device" &&
                      "Ghép Nối Máy POS Mới (Mã 6 Chữ Số)"}
                  </h3>
                  {activeModal !== "pair_pos_device" && (
                    <p className="text-xs text-neutral-500">
                      Chi nhánh áp dụng: {currentStoreObj?.name}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body by Type */}
            {activeModal === "create_product" && (
              <form onSubmit={handleCreateProduct} className="mt-5 space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Tên Sản Phẩm
                  </label>
                  <input
                    type="text"
                    required
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Mã Sản Phẩm
                    </label>
                    <input
                      type="text"
                      required
                      value={newProdCode}
                      onChange={(e) => setNewProdCode(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Mã SKU
                    </label>
                    <input
                      type="text"
                      required
                      value={newProdSku}
                      onChange={(e) => setNewProdSku(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Giá bán (₫)
                    </label>
                    <input
                      type="number"
                      required
                      value={newProdPrice}
                      onChange={(e) => setNewProdPrice(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Giá vốn (₫)
                    </label>
                    <input
                      type="number"
                      required
                      value={newProdCost}
                      onChange={(e) => setNewProdCost(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Tồn đầu
                    </label>
                    <input
                      type="number"
                      required
                      value={newProdInitialStock}
                      onChange={(e) => setNewProdInitialStock(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
                  <RippleButton
                    type="button"
                    onClick={() => setActiveModal(null)}
                  >
                    Hủy
                  </RippleButton>
                  <ShimmerButton type="submit" disabled={loading}>
                    Lưu Sản Phẩm
                  </ShimmerButton>
                </div>
              </form>
            )}

            {activeModal === "adjust_stock" && (
              <form
                onSubmit={handleStockAdjustment}
                className="mt-5 space-y-3.5"
              >
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Chọn Biến Thể SKU
                  </label>
                  <select
                    value={adjVariantId}
                    onChange={(e) => setAdjVariantId(e.target.value)}
                    className="w-full rounded-lg border border-neutral-900 bg-white px-3 py-2 text-xs text-neutral-900 focus:outline-none"
                  >
                    {allVariants.map((v) => (
                      <option key={v.variantId} value={v.variantId}>
                        {v.sku} — {v.productName} (Hiện tồn: {v.onHand})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Số lượng cộng/trừ (+/-)
                  </label>
                  <input
                    type="number"
                    required
                    value={adjDelta}
                    onChange={(e) => setAdjDelta(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Ghi chú Sổ cái
                  </label>
                  <input
                    type="text"
                    required
                    value={adjReason}
                    onChange={(e) => setAdjReason(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
                  <RippleButton
                    type="button"
                    onClick={() => setActiveModal(null)}
                  >
                    Hủy
                  </RippleButton>
                  <ShimmerButton type="submit" disabled={loading}>
                    Ghi Sổ Cái Tồn Kho
                  </ShimmerButton>
                </div>
              </form>
            )}

            {activeModal === "create_store" && (
              <form onSubmit={handleCreateStore} className="mt-5 space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Mã Chi Nhánh
                  </label>
                  <input
                    type="text"
                    required
                    value={createStoreCode}
                    onChange={(e) => setCreateStoreCode(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Tên Chi Nhánh
                  </label>
                  <input
                    type="text"
                    required
                    value={createStoreName}
                    onChange={(e) => setCreateStoreName(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
                  <RippleButton
                    type="button"
                    onClick={() => setActiveModal(null)}
                  >
                    Hủy
                  </RippleButton>
                  <ShimmerButton type="submit" disabled={loading}>
                    Tạo Chi Nhánh
                  </ShimmerButton>
                </div>
              </form>
            )}

            {activeModal === "pair_pos_device" && (
              <form
                onSubmit={handlePairDeviceByCode}
                className="mt-5 space-y-4"
              >
                {/* 6-Digit PIN Video UI & Animation */}
                <div>
                  <p className="mb-2 text-center text-xs text-neutral-500">
                    Nhập mã 6 chữ số đang hiển thị trên màn hình máy POS của chi nhánh
                  </p>

                  <SixDigitPinInput
                    value={pairingCodeInput}
                    onChange={(val) => setPairingCodeInput(val)}
                  />
                </div>

                {/* Chi nhánh áp dụng: Cố định theo chi nhánh hiện tại, không cho phép đổi */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Chi Nhánh Áp Dụng (Cố định theo trang hiện tại)
                  </label>
                  <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-200 text-neutral-800">
                        <StoreIcon className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-neutral-900">
                          {currentStoreObj?.name || "Chi nhánh chính"}
                        </div>
                        <div className="text-[10px] font-mono text-neutral-500">
                          Mã: {currentStoreObj?.code || "DEMO-S1"}
                        </div>
                      </div>
                    </div>
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      Chi nhánh hiện tại
                    </span>
                  </div>
                </div>

                {/* Giữ đủ các trường còn lại */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Mã Thiết Bị
                    </label>
                    <input
                      type="text"
                      required
                      value={pairingDeviceCode}
                      onChange={(e) => setPairingDeviceCode(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Tên Máy POS
                    </label>
                    <input
                      type="text"
                      required
                      value={pairingDeviceName}
                      onChange={(e) => setPairingDeviceName(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
                  <RippleButton
                    type="button"
                    onClick={() => setActiveModal(null)}
                  >
                    Hủy
                  </RippleButton>
                  <button
                    type="submit"
                    disabled={
                      loading ||
                      pairingCodeInput.replace(/\D/g, "").length !== 6
                    }
                    className={`rounded-xl px-5 py-2.5 text-xs font-bold transition-all duration-200 ${
                      pairingCodeInput.replace(/\D/g, "").length === 6 &&
                      !loading
                        ? "bg-neutral-900 text-white hover:bg-neutral-800 shadow-md cursor-pointer"
                        : "bg-neutral-200 text-neutral-400 cursor-not-allowed"
                    }`}
                  >
                    {loading
                      ? "Đang ghép nối..."
                      : "Xác Nhận Ghép Nối Thiết Bị"}
                  </button>
                </div>
              </form>
            )}
          </BlurFade>
        </div>
      )}
    </div>
  );
}
