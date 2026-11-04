"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Barcode,
  Bell,
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Filter,
  Home,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Minus,
  Monitor,
  MoreHorizontal,
  PieChart,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Tag,
  Trash2,
  Users,
  Utensils,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";

import { fireSuccessConfetti } from "@/components/ui/confetti";
import {
  CategoryId,
  PosMenuTab,
  SimulatorCartItem,
  SimulatorOrderRecord,
  SimulatorOutboxOrder,
  SimulatorVariantItem,
} from "./pos-types";
import {
  CustomerItem,
  INITIAL_CUSTOMERS,
  INITIAL_NOTIFICATIONS,
  INITIAL_TABLES,
  NotificationItem,
  TableItem,
} from "./pos-data";
import { PosViewHome } from "./pos-view-home";
import { PosViewOrders } from "./pos-view-orders";
import { PosViewCustomers } from "./pos-view-customers";
import { PosViewStock } from "./pos-view-stock";
import { PosViewStats } from "./pos-view-stats";
import { PosViewNotifications } from "./pos-view-notifications";
import { PosViewSettings } from "./pos-view-settings";

export type {
  CategoryId,
  PosMenuTab,
  SimulatorCartItem,
  SimulatorOrderRecord,
  SimulatorOutboxOrder,
  SimulatorVariantItem,
};

export interface PosLcdSimulatorProps {
  storeCode: string;
  storeName: string;
  orgName: string;
  variants: SimulatorVariantItem[];
  cart: SimulatorCartItem[];
  orders?: SimulatorOrderRecord[];
  outboxQueue: SimulatorOutboxOrder[];
  offlineMode: boolean;
  loading: boolean;
  activeCashSession: {
    id: string;
    opening_amount: string;
    status: string;
  } | null;
  onToggleOffline: () => void;
  onOpenCashSession: () => void;
  onAddToCart: (v: SimulatorVariantItem) => void;
  onUpdateCartQty: (variantId: string, delta: number) => void;
  onClearCart: () => void;
  onCheckoutOrder: (
    tenderedCash?: number,
    paymentMethod?: string
  ) => Promise<void>;
  onFlushOutbox: () => Promise<void>;
  onQuickStockAdj?: (variantId: string, delta: number, reason?: string) => Promise<void>;
  onOpenCreateProductModal?: () => void;
}

interface FlyingOrb {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  label: string;
  color: string;
}

interface CompletedReceipt {
  orderCode: string;
  time: string;
  orderType: string;
  tableName: string;
  customerName?: string;
  paymentMethod: string;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  tenderedCash: number;
  changeAmount: number;
  isOffline: boolean;
  items: SimulatorCartItem[];
}

function formatVND(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) || 0 : amount;
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(num);
}

const CATEGORIES: { id: CategoryId; name: string; shortName: string; bgTint: string; type: CategoryId }[] = [
  { id: "all", name: "Tất cả món", shortName: "Tất cả", bgTint: "#E6F6F0", type: "all" },
  { id: "coffee", name: "Cà Phê Phin", shortName: "Cà Phê", bgTint: "#FEF3C7", type: "coffee" },
  { id: "tea", name: "Trà Trái Cây", shortName: "Trà Đào", bgTint: "#FFEDD5", type: "tea" },
  { id: "pastry", name: "Bánh Âu Bơ", shortName: "Bánh Ngọt", bgTint: "#FCE7F3", type: "pastry" },
  { id: "matcha", name: "Matcha & Kem", shortName: "Matcha", bgTint: "#DCFCE7", type: "matcha" },
  { id: "signature", name: "Món Đặc Biệt", shortName: "Signature", bgTint: "#E0E7FF", type: "signature" },
  { id: "combo", name: "Combo Tiết Kiệm", shortName: "Combo", bgTint: "#F3E8FF", type: "combo" },
];

function inferCategory(v: SimulatorVariantItem): CategoryId {
  const text = `${v.productCode} ${v.productName} ${v.sku}`.toLowerCase();
  if (text.includes("cf") || text.includes("cà phê") || text.includes("bạc xỉu") || text.includes("espresso")) {
    return "coffee";
  }
  if (text.includes("trà") || text.includes("tea") || text.includes("đào") || text.includes("vải")) {
    return "tea";
  }
  if (text.includes("bánh") || text.includes("croissant") || text.includes("pastry") || text.includes("tiramisu")) {
    return "pastry";
  }
  if (text.includes("matcha") || text.includes("kem")) {
    return "matcha";
  }
  if (text.includes("combo")) {
    return "combo";
  }
  return "signature";
}

function ProductArtwork({
  category,
  size = "md",
}: {
  category: CategoryId;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "sm" ? "w-10 h-10" : size === "lg" ? "w-24 h-24" : "w-12 h-12";

  if (category === "coffee") {
    return (
      <svg viewBox="0 0 120 100" className={dim} fill="none">
        <ellipse cx="60" cy="86" rx="38" ry="8" fill="#E5E7EB" />
        <path d="M36 26H84L78 82C77.5 85 75 87 72 87H48C45 87 42.5 85 42 82L36 26Z" fill="url(#coffeeGrad)" stroke="#78350F" strokeWidth="2" />
        <path d="M41 70H79L78 82C77.5 85 75 87 72 87H48C45 87 42.5 85 42 82L41 70Z" fill="#FEF3C7" />
        <rect x="44" y="34" width="13" height="11" rx="3" transform="rotate(-8 44 34)" fill="#FFFFFF" fillOpacity="0.75" />
        <rect x="61" y="36" width="13" height="11" rx="3" transform="rotate(10 61 36)" fill="#FFFFFF" fillOpacity="0.75" />
        <path d="M34 26C34 15 45 10 60 10C75 10 86 15 86 26H34Z" fill="#F9FAFB" stroke="#D1D5DB" strokeWidth="2" />
        <path d="M63 24L72 4" stroke="#059669" strokeWidth="4.5" strokeLinecap="round" />
        <defs>
          <linearGradient id="coffeeGrad" x1="60" y1="26" x2="60" y2="87" gradientUnits="userSpaceOnUse">
            <stop stopColor="#92400E" />
            <stop offset="0.7" stopColor="#451A03" />
            <stop offset="1" stopColor="#FEF3C7" />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  if (category === "tea") {
    return (
      <svg viewBox="0 0 120 100" className={dim} fill="none">
        <ellipse cx="60" cy="86" rx="38" ry="8" fill="#E5E7EB" />
        <path d="M37 24H83L77 82C76.5 85 74 87 71 87H49C46 87 43.5 85 43 82L37 24Z" fill="url(#teaGrad)" stroke="#EA580C" strokeWidth="2" />
        <path d="M46 46C46 39 54 36 62 41C70 46 66 56 56 56C49 56 46 51 46 46Z" fill="#FDBA74" stroke="#C2410C" strokeWidth="1.5" />
        <path d="M66 32C66 25 76 23 78 30C80 37 70 40 66 32Z" fill="#10B981" />
        <path d="M54 24L47 5" stroke="#F97316" strokeWidth="4" strokeLinecap="round" />
        <rect x="33" y="21" width="54" height="5" rx="2.5" fill="#FFF7ED" stroke="#FB923C" strokeWidth="1.5" />
        <defs>
          <linearGradient id="teaGrad" x1="60" y1="24" x2="60" y2="87" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FB923C" />
            <stop offset="0.6" stopColor="#EA580C" />
            <stop offset="1" stopColor="#FDE047" />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  if (category === "pastry") {
    return (
      <svg viewBox="0 0 120 100" className={dim} fill="none">
        <ellipse cx="60" cy="78" rx="44" ry="10" fill="#E5E7EB" />
        <path d="M22 58C18 44 28 28 46 26C55 25 65 25 74 26C92 28 102 44 98 58C95 68 84 72 76 66C70 61 68 52 60 52C52 52 50 61 44 66C36 72 25 68 22 58Z" fill="url(#croissantGrad)" stroke="#B45309" strokeWidth="2.2" />
        <path d="M42 28C40 38 44 48 48 53" stroke="#92400E" strokeWidth="2" strokeLinecap="round" />
        <path d="M78 28C80 38 76 48 72 53" stroke="#92400E" strokeWidth="2" strokeLinecap="round" />
        <path d="M48 34C56 31 64 31 72 34" stroke="#FEF3C7" strokeWidth="2.5" strokeLinecap="round" />
        <defs>
          <linearGradient id="croissantGrad" x1="22" y1="26" x2="98" y2="70" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FBBF24" />
            <stop offset="0.5" stopColor="#D97706" />
            <stop offset="1" stopColor="#92400E" />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  if (category === "matcha") {
    return (
      <svg viewBox="0 0 120 100" className={dim} fill="none">
        <ellipse cx="60" cy="86" rx="38" ry="8" fill="#E5E7EB" />
        <path d="M36 28H84L78 82C77.5 85 75 87 72 87H48C45 87 42.5 85 42 82L36 28Z" fill="url(#matchaGrad)" stroke="#047857" strokeWidth="2" />
        <path d="M38 28C38 18 48 14 60 14C72 14 82 18 82 28H38Z" fill="#ECFDF5" stroke="#6EE7B7" strokeWidth="2" />
        <circle cx="60" cy="14" r="4" fill="#10B981" />
        <defs>
          <linearGradient id="matchaGrad" x1="60" y1="28" x2="60" y2="87" gradientUnits="userSpaceOnUse">
            <stop stopColor="#10B981" />
            <stop offset="0.65" stopColor="#059669" />
            <stop offset="1" stopColor="#ECFDF5" />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 120 100" className={dim} fill="none">
      <ellipse cx="60" cy="84" rx="40" ry="8" fill="#E5E7EB" />
      <rect x="30" y="30" width="60" height="48" rx="14" fill="url(#sigGrad)" stroke="#059669" strokeWidth="2" />
      <path d="M36 42C48 35 72 35 84 42" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
      <circle cx="60" cy="24" r="7" fill="#F43F5E" />
      <path d="M60 17C63 12 69 12 71 16" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" />
      <defs>
        <linearGradient id="sigGrad" x1="30" y1="30" x2="90" y2="78" gradientUnits="userSpaceOnUse">
          <stop stopColor="#34D399" />
          <stop offset="1" stopColor="#059669" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function PosLcdSimulator({
  storeCode,
  storeName,
  orgName,
  variants,
  cart,
  orders = [],
  outboxQueue,
  offlineMode,
  loading,
  activeCashSession,
  onToggleOffline,
  onOpenCashSession,
  onAddToCart,
  onUpdateCartQty,
  onClearCart,
  onCheckoutOrder,
  onFlushOutbox,
  onQuickStockAdj,
  onOpenCreateProductModal,
}: PosLcdSimulatorProps) {
  // Navigation & Orientation State
  const [activeMenuTab, setActiveMenuTab] = useState<PosMenuTab>("pos");
  const [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape");
  const [fullscreenKiosk, setFullscreenKiosk] = useState(false);

  // Tab 1: Tables State
  const [tables, setTables] = useState<TableItem[]>(INITIAL_TABLES);
  const [selectedTableId, setSelectedTableId] = useState<string>("t12");

  // Tab 2: Catalog POS State
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortPriceAsc, setSortPriceAsc] = useState<boolean | null>(null);

  // Order Details states
  const [orderType, setOrderType] = useState("Dine In (Tại bàn)");
  const [tableName, setTableName] = useState("Table 21");
  const [promoCode, setPromoCode] = useState("");
  const [appliedDiscountRate, setAppliedDiscountRate] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [selectedCashGiven, setSelectedCashGiven] = useState<number>(0);
  const [attachedCustomer, setAttachedCustomer] = useState<CustomerItem | null>(null);

  // Tab 3: Orders Inspection State
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");

  // Tab 4: Customers State
  const [customers, setCustomers] = useState<CustomerItem[]>(INITIAL_CUSTOMERS);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("c1");

  // Tab 5: Stock State
  const [selectedStockVariantId, setSelectedStockVariantId] = useState<string>("");

  // Tab 7: Notifications State
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);

  // Portrait Drawer State
  const [portraitDrawerOpen, setPortraitDrawerOpen] = useState(false);

  // Animation states
  const [flyingOrbs, setFlyingOrbs] = useState<FlyingOrb[]>([]);
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);
  const [cartPulseKey, setCartPulseKey] = useState(0);
  const [lastScannedBanner, setLastScannedBanner] = useState<string | null>(null);
  const [completedReceipt, setCompletedReceipt] = useState<CompletedReceipt | null>(null);

  const landscapeCartTargetRef = useRef<HTMLDivElement | null>(null);
  const portraitCartTargetRef = useRef<HTMLButtonElement | null>(null);

  // Filtered variants for POS Catalog
  const filteredVariants = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = variants.filter((v) => {
      const cat = inferCategory(v);
      const matchCat =
        selectedCategory === "all" ||
        cat === selectedCategory ||
        (selectedCategory === "signature" && v.price >= 40000);
      const matchQuery =
        !q ||
        v.productName.toLowerCase().includes(q) ||
        v.sku.toLowerCase().includes(q) ||
        v.barcode.toLowerCase().includes(q) ||
        v.productCode.toLowerCase().includes(q);
      return matchCat && matchQuery;
    });

    if (sortPriceAsc !== null) {
      list = [...list].sort((a, b) =>
        sortPriceAsc ? a.price - b.price : b.price - a.price
      );
    }
    return list;
  }, [variants, selectedCategory, searchQuery, sortPriceAsc]);

  const cartQtyMap = useMemo(() => {
    const map: Record<string, number> = {};
    cart.forEach((c) => {
      map[c.variantId] = c.quantity;
    });
    return map;
  }, [cart]);

  const totalItemsCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [cart]
  );

  const taxAmount = useMemo(() => Math.round(subtotal * 0.08), [subtotal]);
  const discountAmount = useMemo(() => {
    const promoRate = appliedDiscountRate;
    const custRate = attachedCustomer ? attachedCustomer.discountPercent / 100 : 0;
    const finalRate = Math.min(0.5, promoRate + custRate);
    return Math.round(subtotal * finalRate);
  }, [subtotal, appliedDiscountRate, attachedCustomer]);

  const finalTotal = useMemo(
    () => Math.max(0, subtotal + taxAmount - discountAmount),
    [subtotal, taxAmount, discountAmount]
  );

  const effectiveCashGiven = selectedCashGiven >= finalTotal ? selectedCashGiven : finalTotal;
  const changeAmount = Math.max(0, effectiveCashGiven - finalTotal);

  // Trigger Add To Cart with parabolic flying orb
  const triggerAddToCartWithAnimation = useCallback(
    (item: SimulatorVariantItem, e?: React.MouseEvent<HTMLButtonElement | HTMLDivElement>) => {
      onAddToCart(item);
      setRecentlyAddedId(item.variantId);
      setTimeout(() => {
        setRecentlyAddedId((prev) => (prev === item.variantId ? null : prev));
      }, 650);

      const targetEl =
        orientation === "landscape"
          ? landscapeCartTargetRef.current
          : portraitCartTargetRef.current;

      if (e && targetEl) {
        const startRect = e.currentTarget.getBoundingClientRect();
        const endRect = targetEl.getBoundingClientRect();
        const orbId = `orb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

        const newOrb: FlyingOrb = {
          id: orbId,
          startX: startRect.left + startRect.width / 2 - 20,
          startY: startRect.top + startRect.height / 2 - 20,
          endX: endRect.left + endRect.width / 2 - 20,
          endY: endRect.top + endRect.height / 2 - 20,
          label: `+1 ${item.productName.slice(0, 12)}`,
          color: "#059669",
        };

        setFlyingOrbs((prev) => [...prev, newOrb]);
        setTimeout(() => {
          setFlyingOrbs((prev) => prev.filter((o) => o.id !== orbId));
          setCartPulseKey((k) => k + 1);
        }, 560);
      } else {
        setCartPulseKey((k) => k + 1);
      }
    },
    [onAddToCart, orientation]
  );

  const handleSimulateBarcodeScan = () => {
    if (variants.length === 0) return;
    const randomItem = variants[Math.floor(Math.random() * variants.length)];
    onAddToCart(randomItem);
    setCartPulseKey((k) => k + 1);
    setRecentlyAddedId(randomItem.variantId);
    setLastScannedBanner(`[BARCODE SCAN] ${randomItem.barcode} → +1 ${randomItem.productName}`);
    setTimeout(() => {
      setRecentlyAddedId(null);
      setLastScannedBanner(null);
    }, 2400);
  };

  const handleApplyPromo = () => {
    const code = promoCode.trim().toUpperCase();
    if (code === "POS10" || code === "VIP10" || code === "SUSHI10") {
      setAppliedDiscountRate(0.1);
    } else if (code === "POS20") {
      setAppliedDiscountRate(0.2);
    } else if (!code) {
      setAppliedDiscountRate(0);
    } else {
      setAppliedDiscountRate(0.05);
    }
  };

  const handlePlaceOrder = async () => {
    if (cart.length === 0 || loading) return;
    const snapshotItems = [...cart];
    const snapshotSubtotal = subtotal;
    const snapshotTax = taxAmount;
    const snapshotDiscount = discountAmount;
    const snapshotTotal = finalTotal;
    const snapshotCash = effectiveCashGiven;
    const snapshotChange = changeAmount;
    const snapshotOffline = offlineMode;
    const snapshotCustName = attachedCustomer?.name;

    await onCheckoutOrder(snapshotCash, paymentMethod);
    fireSuccessConfetti();
    setSelectedCashGiven(0);
    setPortraitDrawerOpen(false);

    setCompletedReceipt({
      orderCode: `ORD-${Date.now().toString().slice(-6)}`,
      time: new Date().toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      orderType,
      tableName,
      customerName: snapshotCustName,
      paymentMethod,
      subtotal: snapshotSubtotal,
      taxAmount: snapshotTax,
      discountAmount: snapshotDiscount,
      totalAmount: snapshotTotal,
      tenderedCash: snapshotCash,
      changeAmount: snapshotChange,
      isOffline: snapshotOffline,
      items: snapshotItems,
    });
  };

  // Nav Handlers
  const handleStartOrderForTable = (table: TableItem) => {
    setTableName(table.name);
    setOrderType("Dine In (Tại bàn)");
    setActiveMenuTab("pos");
  };

  const handleAttachCustomer = (cust: CustomerItem) => {
    setAttachedCustomer(cust);
    fireSuccessConfetti();
    setActiveMenuTab("pos");
  };

  const handleQuickRestock = async (variantId: string, delta: number) => {
    if (onQuickStockAdj) {
      await onQuickStockAdj(variantId, delta);
    }
  };

  const handleReprintOrder = (ord: SimulatorOrderRecord | SimulatorOutboxOrder) => {
    const isOutbox = "client_order_id" in ord;
    const code = isOutbox ? ord.client_order_id : ord.order_number;
    const amt = isOutbox ? ord.total_amount : parseFloat(ord.total_amount) || 0;
    setCompletedReceipt({
      orderCode: code,
      time: new Date().toLocaleTimeString("vi-VN"),
      orderType: "Dine In",
      tableName: "Table 21",
      paymentMethod: "CASH",
      subtotal: amt,
      taxAmount: Math.round(amt * 0.08),
      discountAmount: 0,
      totalAmount: amt,
      tenderedCash: amt,
      changeAmount: 0,
      isOffline: isOutbox,
      items: isOutbox
        ? ord.items.map((it) => ({
            variantId: it.product_variant_id,
            productName: it.productName,
            variantName: "Tiêu chuẩn",
            sku: "SKU",
            unitPrice: parseFloat(it.unit_price) || 0,
            quantity: parseFloat(it.quantity) || 1,
          }))
        : cart.length > 0
        ? cart
        : [
            {
              variantId: "v-sample",
              productName: "Cà Phê Sữa Đá Sài Gòn",
              variantName: "Tiêu chuẩn",
              sku: "SKU-CF",
              unitPrice: amt,
              quantity: 1,
            },
          ],
    });
  };

  // Shared Order Details Panel
  const renderOrderDetailsPanel = (isPortraitSheet: boolean) => (
    <div className="flex h-full flex-col justify-between bg-white">
      {/* Top Header */}
      <div className="border-b border-neutral-100 px-5 pt-4 pb-3.5">
        <div className="flex items-center justify-between">
          <div ref={!isPortraitSheet ? landscapeCartTargetRef : undefined} className="flex items-center gap-2">
            <h2 className="text-base font-bold tracking-tight text-neutral-900">Order Details</h2>
            <motion.span
              key={cartPulseKey}
              initial={{ scale: 1.35 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 420, damping: 15 }}
              className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#E6F6F0] px-1.5 text-[11px] font-bold text-[#059669]"
            >
              {totalItemsCount}
            </motion.span>
          </div>

          <div className="flex items-center gap-1.5">
            {isPortraitSheet && (
              <button
                type="button"
                onClick={() => setPortraitDrawerOpen(false)}
                className="rounded-lg border border-neutral-200 p-1.5 text-neutral-500 hover:bg-neutral-100"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onOpenCashSession}
              title="Trạng thái ca thu ngân"
              className="rounded-lg border border-neutral-200 px-2 py-1 text-[10px] font-semibold text-neutral-600 hover:bg-neutral-50"
            >
              {activeCashSession ? "Ca: Đang mở" : "Mở ca"}
            </button>
          </div>
        </div>

        {/* Attached VIP Customer Pill */}
        {attachedCustomer && (
          <div className="mt-2.5 flex items-center justify-between rounded-xl bg-purple-50 px-2.5 py-1.5 border border-purple-100 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-purple-600" />
              <span className="font-extrabold text-purple-900">{attachedCustomer.name}</span>
              <span className="rounded bg-purple-200/70 px-1.5 py-0.2 text-[10px] font-bold text-purple-800">
                {attachedCustomer.tier} (-{attachedCustomer.discountPercent}%)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAttachedCustomer(null)}
              className="text-purple-400 hover:text-purple-700 text-xs font-bold"
            >
              ×
            </button>
          </div>
        )}

        {/* Dine In & Table Selectors */}
        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <div className="relative">
            <select
              value={orderType}
              onChange={(e) => setOrderType(e.target.value)}
              className="w-full appearance-none rounded-xl border border-neutral-200 bg-neutral-50/70 px-3 py-2 pr-7 text-xs font-medium text-neutral-700 focus:border-[#059669] focus:bg-white focus:outline-none"
            >
              <option value="Dine In (Tại bàn)">Dine In (Tại bàn)</option>
              <option value="Take Away (Mang đi)">Take Away (Mang đi)</option>
              <option value="Delivery (Giao hàng)">Delivery (Giao hàng)</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400" />
          </div>

          <div className="relative">
            <select
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              className="w-full appearance-none rounded-xl border border-neutral-200 bg-neutral-50/70 px-3 py-2 pr-7 text-xs font-medium text-neutral-700 focus:border-[#059669] focus:bg-white focus:outline-none"
            >
              {tables.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400" />
          </div>
        </div>

        {/* Items Header */}
        <div className="mt-3.5 flex items-center justify-between">
          <span className="text-xs font-bold text-neutral-900">Items</span>
          {cart.length > 0 && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.94 }}
              type="button"
              onClick={onClearCart}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-500 hover:text-rose-600"
            >
              <Trash2 className="h-3 w-3" />
              Clear All
            </motion.button>
          )}
        </div>
      </div>

      {/* Cart Items List */}
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2.5">
        <AnimatePresence initial={false} mode="popLayout">
          {cart.length === 0 ? (
            <motion.div
              key="empty-cart"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/50 py-10 px-4 text-center"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E6F6F0] text-[#059669]">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <p className="mt-2.5 text-xs font-semibold text-neutral-700">Chưa có món nào trong đơn</p>
              <p className="mt-0.5 text-[11px] text-neutral-400">
                Chạm vào nút <span className="font-semibold text-[#059669]">+ Add to cart</span> trên từng món để thêm vào hóa đơn.
              </p>
            </motion.div>
          ) : (
            cart.map((item) => {
              const cat = inferCategory({
                productId: "",
                productCode: item.sku,
                productName: item.productName,
                variantId: item.variantId,
                variantName: item.variantName,
                sku: item.sku,
                barcode: "",
                price: item.unitPrice,
                onHand: 100,
              });
              return (
                <motion.div
                  layout
                  key={item.variantId}
                  initial={{ opacity: 0, x: 28, scale: 0.92 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -28, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 380, damping: 26 }}
                  className="rounded-2xl border border-neutral-100 bg-white p-3 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.05)]"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-neutral-50 border border-neutral-100">
                      <ProductArtwork category={cat} size="sm" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-bold text-neutral-900">{item.productName}</div>
                      <div className="mt-0.5 text-[10px] text-neutral-400">
                        {item.variantName} • {item.sku}
                      </div>
                      <div className="text-[10px] text-neutral-400">{formatVND(item.unitPrice)} / phần</div>
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between pt-1">
                    <motion.span
                      key={item.unitPrice * item.quantity}
                      initial={{ scale: 1.12 }}
                      animate={{ scale: 1 }}
                      className="text-xs font-extrabold text-[#059669]"
                    >
                      {formatVND(item.unitPrice * item.quantity)}
                    </motion.span>

                    <div className="flex items-center gap-2">
                      <motion.button
                        whileHover={{ scale: 1.08 }}
                        whileTap={{ scale: 0.88 }}
                        type="button"
                        onClick={() => onUpdateCartQty(item.variantId, -1)}
                        className="flex h-6 w-6 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50"
                      >
                        <Minus className="h-3 w-3" />
                      </motion.button>

                      <motion.span
                        key={item.quantity}
                        initial={{ y: -6, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="w-5 text-center text-xs font-bold text-neutral-900"
                      >
                        {item.quantity}
                      </motion.span>

                      <motion.button
                        whileHover={{ scale: 1.08 }}
                        whileTap={{ scale: 0.88 }}
                        type="button"
                        onClick={() => onUpdateCartQty(item.variantId, 1)}
                        className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#059669] text-white shadow-sm shadow-emerald-600/25 hover:bg-[#047857]"
                      >
                        <Plus className="h-3 w-3" />
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Summary, Promo, & Checkout */}
      <div className="border-t border-neutral-100 bg-white px-5 pt-3 pb-4 space-y-3">
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between text-neutral-500">
            <span>Subtotal</span>
            <span className="font-semibold text-neutral-800">{formatVND(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-neutral-500">
            <span>Tax (8% VAT)</span>
            <span className="font-semibold text-neutral-800">{formatVND(taxAmount)}</span>
          </div>
          <div className="flex items-center justify-between text-neutral-500">
            <span>
              Discount {discountAmount > 0 && `(-${formatVND(discountAmount)})`}
            </span>
            <span className="font-semibold text-[#059669]">-{formatVND(discountAmount)}</span>
          </div>
          <div className="border-t border-dashed border-neutral-200 pt-2 flex items-center justify-between">
            <span className="text-sm font-bold text-neutral-900">Total</span>
            <motion.span
              key={finalTotal}
              initial={{ scale: 1.15, color: "#059669" }}
              animate={{ scale: 1, color: "#111827" }}
              className="text-base font-extrabold text-neutral-900"
            >
              {formatVND(finalTotal)}
            </motion.span>
          </div>
        </div>

        {/* Promo code input */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value)}
            placeholder="Enter promo code (VD: POS10)..."
            className="flex-1 rounded-xl border border-neutral-200 bg-neutral-50/80 px-3 py-2 text-xs text-neutral-800 placeholder:text-neutral-400 focus:border-[#059669] focus:bg-white focus:outline-none"
          />
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.95 }}
            type="button"
            onClick={handleApplyPromo}
            className="rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 hover:border-[#059669] hover:text-[#059669]"
          >
            Apply
          </motion.button>
        </div>

        {/* Payment Method Selector & Quick Cash */}
        <div className="space-y-2">
          <div className="relative">
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full appearance-none rounded-xl border border-neutral-200 bg-neutral-50/80 px-3 py-2 pr-8 text-xs font-medium text-neutral-700 focus:border-[#059669] focus:bg-white focus:outline-none"
            >
              <option value="CASH">Tiền mặt tại quầy (Cash Drawer)</option>
              <option value="VIETQR">Quét mã chuyển khoản (VietQR Dynamic)</option>
              <option value="CARD">Thẻ ngân hàng / Apple Pay (POS Tap)</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400" />
          </div>

          {paymentMethod === "CASH" && finalTotal > 0 && (
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: "Vừa đủ", val: finalTotal },
                { label: "100k", val: 100000 },
                { label: "200k", val: 200000 },
                { label: "500k", val: 500000 },
              ].map((chip) => {
                const isSelected = effectiveCashGiven === chip.val;
                return (
                  <motion.button
                    whileTap={{ scale: 0.93 }}
                    key={chip.label}
                    type="button"
                    onClick={() => setSelectedCashGiven(chip.val)}
                    className={`rounded-lg py-1 text-[10px] font-semibold transition-colors ${
                      isSelected
                        ? "bg-[#E6F6F0] text-[#059669] border border-[#059669]/40"
                        : "bg-neutral-50 text-neutral-600 border border-neutral-200/80 hover:bg-neutral-100"
                    }`}
                  >
                    {chip.label}
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>

        {/* Place Order Button */}
        <motion.button
          whileHover={{ scale: cart.length > 0 ? 1.015 : 1 }}
          whileTap={{ scale: cart.length > 0 ? 0.96 : 1 }}
          type="button"
          disabled={cart.length === 0 || loading}
          onClick={() => void handlePlaceOrder()}
          className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold text-white shadow-md transition-all ${
            cart.length === 0
              ? "cursor-not-allowed bg-neutral-300 shadow-none"
              : offlineMode
              ? "bg-amber-600 hover:bg-amber-700 shadow-amber-600/20"
              : "bg-[#059669] hover:bg-[#047857] shadow-emerald-600/25"
          }`}
        >
          <Printer className="h-3.5 w-3.5" />
          {offlineMode
            ? `Save Offline Order (${formatVND(finalTotal)})`
            : `Place Order (${formatVND(finalTotal)})`}
        </motion.button>
      </div>
    </div>
  );

  // Render Content based on Active Menu Tab
  const renderTabContent = (isPortraitView: boolean) => {
    switch (activeMenuTab) {
      case "home":
        return (
          <PosViewHome
            tables={tables}
            selectedTableId={selectedTableId}
            onSelectTable={(t) => setSelectedTableId(t.id)}
            onStartOrderForTable={handleStartOrderForTable}
            activeCashSession={activeCashSession}
            onOpenCashSession={onOpenCashSession}
            isPortrait={isPortraitView}
            storeCode={storeCode}
            storeName={storeName}
          />
        );

      case "orders":
        return (
          <PosViewOrders
            orders={orders}
            outboxQueue={outboxQueue}
            selectedOrderId={selectedOrderId}
            onSelectOrder={setSelectedOrderId}
            onReprintOrder={handleReprintOrder}
            onFlushOutbox={onFlushOutbox}
            loading={loading}
            isPortrait={isPortraitView}
          />
        );

      case "customers":
        return (
          <PosViewCustomers
            customers={customers}
            selectedCustomerId={selectedCustomerId}
            onSelectCustomer={(c) => setSelectedCustomerId(c.id)}
            onAttachCustomerToCart={handleAttachCustomer}
            isPortrait={isPortraitView}
          />
        );

      case "stock":
        return (
          <PosViewStock
            variants={variants}
            selectedVariantId={selectedStockVariantId}
            onSelectVariant={(v) => setSelectedStockVariantId(v.variantId)}
            onQuickRestock={handleQuickRestock}
            onOpenCreateProductModal={onOpenCreateProductModal}
            isPortrait={isPortraitView}
          />
        );

      case "stats":
        return (
          <PosViewStats
            orders={orders}
            activeCashSession={activeCashSession}
            onPrintZReport={() => handleReprintOrder({
              id: "shift-z-report",
              order_number: `Z-REPORT-${Date.now().toString().slice(-4)}`,
              store_id: storeCode,
              status: "closed",
              payment_status: "paid",
              total_amount: `${orders.reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0)}`,
              paid_amount: "0",
              change_amount: "0",
              occurred_at: new Date().toISOString(),
            })}
            isPortrait={isPortraitView}
          />
        );

      case "notifications":
        return (
          <PosViewNotifications
            notifications={notifications}
            onMarkAllAsRead={() => setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))}
            onClearNotifications={() => setNotifications([])}
            isPortrait={isPortraitView}
          />
        );

      case "settings":
        return (
          <PosViewSettings
            storeCode={storeCode}
            storeName={storeName}
            orgName={orgName}
            onTestPrintReceipt={() => handleReprintOrder({
              id: "test-print",
              order_number: "TEST-K80-OK",
              store_id: storeCode,
              status: "completed",
              payment_status: "paid",
              total_amount: "0",
              paid_amount: "0",
              change_amount: "0",
              occurred_at: new Date().toISOString(),
            })}
            onTestCashDrawer={() => {
              fireSuccessConfetti();
              setLastScannedBanner("[CASH DRAWER] Két tiền RJ11 đã kích hoạt bung chốt thành công!");
              setTimeout(() => setLastScannedBanner(null), 2500);
            }}
            isPortrait={isPortraitView}
          />
        );

      case "pos":
      default:
        return (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Top Header */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-lg font-extrabold tracking-tight text-neutral-900">
                  Time to Order!{" "}
                  <span className="ml-1.5 rounded-lg bg-[#E6F6F0] px-2 py-0.5 text-xs font-bold text-[#059669]">
                    {storeCode}
                  </span>
                </h1>
                <p className="text-[11px] text-neutral-400">
                  {storeName} • {tableName} • {orderType}
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="relative w-64">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-neutral-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search món, SKU, barcode..."
                    className="w-full rounded-xl border border-neutral-200/90 bg-white pl-9 pr-3 py-2 text-xs text-neutral-800 placeholder:text-neutral-400 shadow-sm focus:border-[#059669] focus:outline-none"
                  />
                </div>

                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.94 }}
                  type="button"
                  onClick={() =>
                    setSortPriceAsc((prev) => (prev === null ? true : prev ? false : null))
                  }
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold shadow-sm transition-colors ${
                    sortPriceAsc !== null
                      ? "border-[#059669] bg-[#E6F6F0] text-[#059669]"
                      : "border-neutral-200/90 bg-white text-neutral-700 hover:bg-neutral-50"
                  }`}
                >
                  <Filter className="h-3.5 w-3.5" />
                  {sortPriceAsc === null ? "Filter" : sortPriceAsc ? "Giá ↑" : "Giá ↓"}
                </motion.button>
              </div>
            </div>

            {/* Category Strip */}
            <div className="mt-4 flex items-center gap-2.5 overflow-x-auto pb-1 no-scrollbar">
              {CATEGORIES.map((cat) => {
                const isActive = selectedCategory === cat.id;
                return (
                  <motion.button
                    whileHover={{ y: -2, scale: 1.02 }}
                    whileTap={{ scale: 0.95 }}
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`flex h-[92px] w-[96px] shrink-0 flex-col items-center justify-center rounded-2xl border p-2 transition-all ${
                      isActive
                        ? "border-[#059669]/40 bg-[#E6F6F0] shadow-sm"
                        : "border-neutral-100 bg-white hover:border-neutral-200"
                    }`}
                  >
                    <div className="flex h-11 w-11 items-center justify-center">
                      <ProductArtwork category={cat.type === "all" ? "signature" : cat.type} size="sm" />
                    </div>
                    <span
                      className={`mt-1.5 truncate text-[11px] ${
                        isActive ? "font-extrabold text-neutral-900" : "font-medium text-neutral-500"
                      }`}
                    >
                      {cat.shortName}
                    </span>
                  </motion.button>
                );
              })}
            </div>

            {/* 4-Column Product Grid */}
            <div className="mt-4 flex-1 overflow-y-auto pr-1">
              <motion.div layout className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-4">
                <AnimatePresence mode="popLayout">
                  {filteredVariants.map((item, idx) => {
                    const cat = inferCategory(item);
                    const qtyInCart = cartQtyMap[item.variantId] || 0;
                    const isJustAdded = recentlyAddedId === item.variantId;

                    return (
                      <motion.div
                        layout
                        key={item.variantId}
                        initial={{ opacity: 0, y: 18, scale: 0.94 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{
                          type: "spring",
                          stiffness: 340,
                          damping: 26,
                          delay: idx * 0.025,
                        }}
                        whileHover={{ y: -3 }}
                        className="group relative flex flex-col justify-between rounded-2xl border border-neutral-100 bg-white p-3 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_10px_28px_-6px_rgba(5,150,105,0.14)]"
                      >
                        <div>
                          <div className="relative flex h-28 w-full items-center justify-center rounded-xl bg-[#FAFAFA] transition-colors group-hover:bg-[#F2FBF7]">
                            <motion.div
                              whileHover={{ scale: 1.08, rotate: -2 }}
                              transition={{ type: "spring", stiffness: 300 }}
                            >
                              <ProductArtwork category={cat} size="lg" />
                            </motion.div>

                            <AnimatePresence>
                              {qtyInCart > 0 && (
                                <motion.div
                                  key={qtyInCart}
                                  initial={{ scale: 0, rotate: -15 }}
                                  animate={{ scale: 1, rotate: 0 }}
                                  exit={{ scale: 0 }}
                                  transition={{ type: "spring", stiffness: 450, damping: 16 }}
                                  className="absolute right-2 top-2 flex h-6 min-w-[24px] items-center justify-center rounded-full bg-[#059669] px-1.5 text-[11px] font-extrabold text-white shadow-md shadow-emerald-600/30"
                                >
                                  ×{qtyInCart}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>

                          <h3 className="mt-2.5 truncate text-xs font-bold text-neutral-900">
                            {item.productName}
                          </h3>

                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-[11px] text-neutral-400">
                              <strong className="text-neutral-700">{item.onHand}</strong> phần/kho
                            </span>
                            <span className="text-xs font-extrabold text-[#059669]">
                              {formatVND(item.price)}
                            </span>
                          </div>
                        </div>

                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.92 }}
                          type="button"
                          onClick={(e) => triggerAddToCartWithAnimation(item, e)}
                          className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-all ${
                            isJustAdded
                              ? "bg-[#059669] text-white shadow-md shadow-emerald-600/25"
                              : "bg-[#E6F6F0] text-[#059669] hover:bg-[#059669] hover:text-white"
                          }`}
                        >
                          {isJustAdded ? (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              Added!
                            </>
                          ) : (
                            <>
                              <Plus className="h-3.5 w-3.5" />
                              Add to cart
                            </>
                          )}
                        </motion.button>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className={fullscreenKiosk ? "fixed inset-0 z-50 flex flex-col bg-neutral-900 p-3 overflow-y-auto" : "space-y-4"}>
      {/* FLOATING FLY-TO-CART ORBS OVERLAY */}
      <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden">
        <AnimatePresence>
          {flyingOrbs.map((orb) => (
            <motion.div
              key={orb.id}
              initial={{ x: orb.startX, y: orb.startY, scale: 1, opacity: 1 }}
              animate={{
                x: [orb.startX, (orb.startX + orb.endX) / 2, orb.endX],
                y: [orb.startY, Math.min(orb.startY, orb.endY) - 90, orb.endY],
                scale: [1, 1.18, 0.35],
                opacity: [1, 1, 0.2],
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.54, ease: [0.22, 1, 0.36, 1] }}
              className="fixed flex items-center gap-1.5 rounded-full bg-[#059669] px-3 py-1.5 text-[11px] font-bold text-white shadow-xl shadow-emerald-600/40 ring-4 ring-emerald-200"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              <span>{orb.label}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* HARDWARE SIMULATOR TOP SWITCHER BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-neutral-200 bg-neutral-100 p-1">
            <motion.button
              whileTap={{ scale: 0.96 }}
              type="button"
              onClick={() => setOrientation("landscape")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                orientation === "landscape" ? "bg-[#059669] text-white shadow-sm" : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              <Monitor className="h-3.5 w-3.5" />
              Form Màn Hình Ngang (16:9)
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.96 }}
              type="button"
              onClick={() => setOrientation("portrait")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                orientation === "portrait" ? "bg-[#059669] text-white shadow-sm" : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" />
              Form Màn Hình Dọc (9:16)
            </motion.button>
          </div>

          <span className="hidden xl:inline-flex items-center gap-1.5 rounded-lg bg-[#E6F6F0] px-2.5 py-1 text-[11px] font-semibold text-[#059669]">
            <Sparkles className="h-3.5 w-3.5" />
            Bấm vào các icon ở thanh Menu để chuyển đổi giữa 8 trang chức năng
          </span>
        </div>

        {/* Peripheral Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.94 }}
            type="button"
            onClick={handleSimulateBarcodeScan}
            className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-800 hover:border-[#059669] hover:bg-[#E6F6F0]/50 hover:text-[#059669]"
          >
            <Barcode className="h-3.5 w-3.5 text-[#059669]" />
            Giả lập Súng Bắn Mã Vạch
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.94 }}
            type="button"
            onClick={onToggleOffline}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
              offlineMode ? "border-amber-300 bg-amber-50 text-amber-800" : "border-emerald-200 bg-[#E6F6F0] text-[#059669]"
            }`}
          >
            {offlineMode ? (
              <>
                <WifiOff className="h-3.5 w-3.5" />
                Đang Rút Mạng (Offline: {outboxQueue.length})
              </>
            ) : (
              <>
                <Wifi className="h-3.5 w-3.5" />
                Online (Cloud Sync)
              </>
            )}
          </motion.button>

          {outboxQueue.length > 0 && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.95 }}
              type="button"
              onClick={() => void onFlushOutbox()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-900 px-3 py-1.5 text-xs font-bold text-white"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Đồng bộ {outboxQueue.length} đơn
            </motion.button>
          )}

          <button
            type="button"
            onClick={() => setFullscreenKiosk((prev) => !prev)}
            className="inline-flex items-center gap-1 rounded-xl border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
          >
            {fullscreenKiosk ? (
              <>
                <Minimize2 className="h-3.5 w-3.5" />
                Thu nhỏ
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5" />
                Full Kiosk
              </>
            )}
          </button>
        </div>
      </div>

      {/* Barcode Banner */}
      <AnimatePresence>
        {lastScannedBanner && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            className="mx-auto flex max-w-md items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-xs font-semibold text-white shadow-lg"
          >
            <Barcode className="h-4 w-4 text-emerald-400" />
            <span>{lastScannedBanner}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HARDWARE LCD BEZEL CONTAINER */}
      <div className="flex justify-center">
        <motion.div
          layout
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
          className={`relative overflow-hidden rounded-[28px] border-[10px] shadow-[0_25px_70px_-15px_rgba(0,0,0,0.22)] ${
            offlineMode ? "border-amber-900" : "border-[#18181B]"
          } ${
            orientation === "landscape"
              ? "w-full max-w-[1220px] h-[740px]"
              : "w-[445px] h-[840px]"
          }`}
        >
          {/* LANDSCAPE 16:9 VIEW */}
          {orientation === "landscape" ? (
            <div className="flex h-full w-full bg-[#F6F8FA]">
              {/* Left Mini Icon Rail */}
              <aside className="flex w-[68px] shrink-0 flex-col items-center justify-between border-r border-neutral-200/80 bg-white py-4">
                <div className="flex flex-col items-center gap-5">
                  <motion.div
                    whileHover={{ rotate: 8, scale: 1.06 }}
                    className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#059669] text-white shadow-md shadow-emerald-600/25"
                  >
                    <Utensils className="h-5 w-5" />
                  </motion.div>

                  <nav className="flex flex-col items-center gap-2.5">
                    {[
                      { id: "home", icon: Home, tooltip: "Sơ đồ bàn" },
                      { id: "pos", icon: LayoutGrid, tooltip: "Bán hàng POS" },
                      { id: "orders", icon: Printer, tooltip: "Lịch sử hóa đơn" },
                      { id: "customers", icon: Users, tooltip: "Khách hàng thân thiết" },
                      { id: "stock", icon: Box, tooltip: "Tồn kho quầy" },
                      { id: "stats", icon: PieChart, tooltip: "Báo cáo ca" },
                    ].map((nav) => {
                      const Icon = nav.icon;
                      const isActive = activeMenuTab === nav.id;
                      return (
                        <motion.button
                          whileHover={{ scale: 1.08 }}
                          whileTap={{ scale: 0.92 }}
                          key={nav.id}
                          type="button"
                          onClick={() => setActiveMenuTab(nav.id as PosMenuTab)}
                          title={nav.tooltip}
                          className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                            isActive
                              ? "bg-[#E6F6F0] text-[#059669]"
                              : "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </motion.button>
                      );
                    })}
                  </nav>
                </div>

                <div className="flex flex-col items-center gap-3">
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    type="button"
                    onClick={() => setActiveMenuTab("notifications")}
                    className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
                      activeMenuTab === "notifications"
                        ? "bg-[#E6F6F0] text-[#059669]"
                        : "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                    }`}
                  >
                    <Bell className="h-4 w-4" />
                  </motion.button>

                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    type="button"
                    onClick={() => setActiveMenuTab("settings")}
                    className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
                      activeMenuTab === "settings"
                        ? "bg-[#E6F6F0] text-[#059669]"
                        : "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                    }`}
                  >
                    <Settings className="h-4 w-4" />
                  </motion.button>

                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-xs font-extrabold text-amber-900 ring-2 ring-[#E6F6F0]">
                    TN
                  </div>
                </div>
              </aside>

              {/* Center Dynamic Workspace */}
              <div className="flex flex-1 flex-col overflow-hidden px-6 py-5">
                {renderTabContent(false)}
              </div>

              {/* Right Order Details Panel */}
              <div className="w-[340px] shrink-0 border-l border-neutral-200/80 bg-white">
                {renderOrderDetailsPanel(false)}
              </div>
            </div>
          ) : (
            /* PORTRAIT 9:16 VIEW */
            <div className="relative flex h-full w-full flex-col bg-[#F6F8FA]">
              {/* Top Bar with Brand & Current View Indicator */}
              <div className="bg-white px-4 pt-3.5 pb-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#059669] text-white shadow-sm">
                      <Utensils className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-extrabold text-neutral-900">
                          {activeMenuTab === "pos"
                            ? "Time to Order!"
                            : activeMenuTab === "home"
                            ? "Sơ Đồ Bàn"
                            : activeMenuTab === "orders"
                            ? "Lịch Sử Đơn"
                            : activeMenuTab === "customers"
                            ? "Khách Hàng"
                            : activeMenuTab === "stock"
                            ? "Tồn Kho"
                            : activeMenuTab === "stats"
                            ? "Báo Cáo Ca"
                            : activeMenuTab === "notifications"
                            ? "Thông Báo"
                            : "Cài Đặt"}
                        </span>
                        <span className="rounded-md bg-[#E6F6F0] px-1.5 py-0.5 text-[10px] font-bold text-[#059669]">
                          {storeCode}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      type="button"
                      onClick={handleSimulateBarcodeScan}
                      title="Quét Barcode"
                      className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#E6F6F0] text-[#059669]"
                    >
                      <Barcode className="h-4 w-4" />
                    </motion.button>
                    <button
                      type="button"
                      onClick={onToggleOffline}
                      className={`rounded-xl px-2 py-1 text-[10px] font-bold ${
                        offlineMode ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {offlineMode ? "OFFLINE" : "ONLINE"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Portrait Center Workspace */}
              <div className="flex-1 overflow-y-auto px-4 pt-3 pb-28">
                {renderTabContent(true)}
              </div>

              {/* Portrait Sticky Floating Bottom Dock & Nav */}
              <div className="absolute inset-x-0 bottom-0 z-20 border-t border-neutral-200/80 bg-white/95 px-3 pt-2 pb-3 backdrop-blur-md shadow-lg space-y-2">
                {/* Order Details Bar */}
                <div className="flex items-center justify-between gap-2">
                  <motion.button
                    ref={portraitCartTargetRef}
                    key={cartPulseKey}
                    initial={{ scale: 1.08 }}
                    animate={{ scale: 1 }}
                    whileTap={{ scale: 0.96 }}
                    type="button"
                    onClick={() => setPortraitDrawerOpen(true)}
                    className="flex flex-1 items-center gap-2 rounded-xl bg-[#E6F6F0] px-3 py-1.5 text-left"
                  >
                    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#059669] text-white shadow-sm">
                      <ShoppingBag className="h-4 w-4" />
                      {totalItemsCount > 0 && (
                        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-neutral-900 px-1 text-[10px] font-bold text-white">
                          {totalItemsCount}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 text-[10px] font-semibold text-[#059669]">
                        <span>Order Details</span>
                        <ChevronUp className="h-3 w-3" />
                      </div>
                      <div className="truncate text-xs font-extrabold text-neutral-900">{formatVND(finalTotal)}</div>
                    </div>
                  </motion.button>

                  <motion.button
                    whileTap={{ scale: 0.94 }}
                    type="button"
                    disabled={cart.length === 0 || loading}
                    onClick={() => setPortraitDrawerOpen(true)}
                    className={`rounded-xl px-3.5 py-2 text-xs font-bold text-white shadow-md transition-all ${
                      cart.length === 0 ? "bg-neutral-300 shadow-none" : "bg-[#059669] hover:bg-[#047857]"
                    }`}
                  >
                    Place Order
                  </motion.button>
                </div>

                {/* Bottom 6 Icon Menu Navigation */}
                <div className="flex items-center justify-around border-t border-neutral-100 pt-1.5">
                  {[
                    { id: "home", icon: Home, label: "Bàn" },
                    { id: "pos", icon: LayoutGrid, label: "Bán hàng" },
                    { id: "orders", icon: Printer, label: "Đơn hàng" },
                    { id: "customers", icon: Users, label: "Khách" },
                    { id: "stock", icon: Box, label: "Tồn kho" },
                    { id: "stats", icon: PieChart, label: "Báo cáo" },
                  ].map((nav) => {
                    const Icon = nav.icon;
                    const isActive = activeMenuTab === nav.id;
                    return (
                      <button
                        key={nav.id}
                        type="button"
                        onClick={() => setActiveMenuTab(nav.id as PosMenuTab)}
                        className={`flex flex-col items-center gap-0.5 px-2 py-1 transition-colors ${
                          isActive ? "text-[#059669]" : "text-neutral-400 hover:text-neutral-700"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="text-[9px] font-bold">{nav.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Portrait Slide-Up Drawer */}
              <AnimatePresence>
                {portraitDrawerOpen && (
                  <>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setPortraitDrawerOpen(false)}
                      className="absolute inset-0 z-30 bg-black/40 backdrop-blur-[2px]"
                    />
                    <motion.div
                      initial={{ y: "100%" }}
                      animate={{ y: 0 }}
                      exit={{ y: "100%" }}
                      transition={{ type: "spring", stiffness: 340, damping: 32 }}
                      className="absolute inset-x-0 bottom-0 z-40 flex h-[84%] flex-col overflow-hidden rounded-t-[26px] bg-white shadow-2xl"
                    >
                      <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-neutral-200" />
                      <div className="flex-1 overflow-hidden">{renderOrderDetailsPanel(true)}</div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* 80MM THERMAL RECEIPT MODAL */}
          <AnimatePresence>
            {completedReceipt && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
              >
                <motion.div
                  initial={{ y: -60, opacity: 0, scale: 0.92 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  exit={{ y: 40, opacity: 0, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 320, damping: 24 }}
                  className="w-full max-w-[340px] rounded-2xl bg-white p-5 font-mono text-xs text-neutral-900 shadow-2xl"
                >
                  <div className="flex items-center justify-between border-b border-dashed border-neutral-300 pb-3">
                    <div className="flex items-center gap-1.5 font-sans text-xs font-bold text-[#059669]">
                      <CheckCircle2 className="h-4 w-4" />
                      {completedReceipt.isOffline ? "Đã lưu Offline Outbox" : "Đã in phiếu nhiệt K80"}
                    </div>
                    <button
                      type="button"
                      onClick={() => setCompletedReceipt(null)}
                      className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 text-center">
                    <div className="text-sm font-bold uppercase">{orgName}</div>
                    <div className="text-[11px] text-neutral-500">
                      {storeName} ({storeCode})
                    </div>
                    <div className="mt-1 text-[11px] font-bold">
                      PHIẾU THANH TOÁN ({completedReceipt.orderCode})
                    </div>
                    <div className="text-[10px] text-neutral-400">
                      {completedReceipt.time} • {completedReceipt.orderType} • {completedReceipt.tableName}
                    </div>
                    {completedReceipt.customerName && (
                      <div className="mt-1 text-[11px] font-bold text-purple-700">
                        Khách hàng: {completedReceipt.customerName}
                      </div>
                    )}
                  </div>

                  <div className="my-3 border-y border-dashed border-neutral-300 py-2.5 space-y-1.5">
                    {completedReceipt.items.map((it) => (
                      <div key={it.variantId} className="flex items-start justify-between gap-2 text-[11px]">
                        <div>
                          <div className="font-bold">{it.productName}</div>
                          <div className="text-[10px] text-neutral-500">
                            {it.quantity} × {formatVND(it.unitPrice)}
                          </div>
                        </div>
                        <span className="font-bold">{formatVND(it.quantity * it.unitPrice)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span>{formatVND(completedReceipt.subtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tax (8%):</span>
                      <span>{formatVND(completedReceipt.taxAmount)}</span>
                    </div>
                    {completedReceipt.discountAmount > 0 && (
                      <div className="flex justify-between text-[#059669]">
                        <span>Discount:</span>
                        <span>-{formatVND(completedReceipt.discountAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-dashed border-neutral-300 pt-1.5 text-sm font-extrabold">
                      <span>TỔNG CỘNG:</span>
                      <span>{formatVND(completedReceipt.totalAmount)}</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-neutral-500">
                      <span>Khách đưa ({completedReceipt.paymentMethod}):</span>
                      <span>{formatVND(completedReceipt.tenderedCash)}</span>
                    </div>
                    <div className="flex justify-between text-[10px] font-bold text-[#059669]">
                      <span>Tiền thừa trả khách:</span>
                      <span>{formatVND(completedReceipt.changeAmount)}</span>
                    </div>
                  </div>

                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    type="button"
                    onClick={() => setCompletedReceipt(null)}
                    className="mt-4 w-full rounded-xl bg-[#059669] py-2.5 font-sans text-xs font-bold text-white shadow-md shadow-emerald-600/25 hover:bg-[#047857]"
                  >
                    Đóng & Bán Đơn Tiếp Theo
                  </motion.button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
