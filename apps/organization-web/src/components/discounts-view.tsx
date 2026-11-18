"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  BadgePercent,
  Calendar,
  Check,
  Copy,
  Pencil,
  Plus,
  Repeat,
  Search,
  Store,
  Tag,
  TicketPercent,
  Trash2,
  X,
} from "lucide-react";
import { BeButton } from "./motion/button";
import { Card, CardContent, CardFooter } from "./motion/card";
import {
  DateRangePicker,
  DateRangePickerCalendar,
  DateRangePickerClear,
  DateRangePickerContent,
  DateRangePickerFooter,
  DateRangePickerGrid,
  DateRangePickerHeader,
  DateRangePickerPresets,
  DateRangePickerSelection,
  DateRangePickerTrigger,
  type DateRange,
} from "./motion/date-range-picker";
import { BeInput } from "./motion/input";
import { BeMultiSelect } from "./motion/multi-select";
import { BeSelect } from "./motion/select";
import { BeSwitch } from "./motion/switch";
import { BeTabs, BeTabsList, BeTabsTrigger } from "./motion/tabs";
import { Skeleton } from "./ui/skeleton";
import type { StoreRecord } from "./stores-master-detail-view";

export interface DiscountCodeRecord {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  discount_type: "percentage" | "fixed";
  value: string;
  max_discount_amount?: string | null;
  min_order_amount: string;
  usage_limit?: number | null;
  used_count: number;
  starts_at?: string | null;
  ends_at?: string | null;
  store_ids: string[];
  status: "active" | "inactive";
  created_at: string;
}

interface DiscountsViewProps {
  stores: StoreRecord[];
  accessToken: string | null;
  apiFetch: (path: string, options?: RequestInit) => Promise<any>;
  notify: (type: "success" | "error" | "info", text: string) => void;
}

function toYmdLocalValue(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDaysYmd(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatShortDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function BarcodeGraphic({ code }: { code: string }) {
  // Deterministic crisp barcode bars from code string
  const bars = useMemo(() => {
    const seed = code || "VOUCHER";
    const items: { x: number; w: number }[] = [];
    let x = 0;
    for (let i = 0; i < 42; i++) {
      const ch = seed.charCodeAt(i % seed.length);
      const w = ((ch + i * 7) % 3) + 1;
      const gap = ((ch + i * 3) % 2) + 1.5;
      items.push({ x, w });
      x += w + gap;
    }
    return { items, totalWidth: x };
  }, [code]);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        viewBox={`0 0 ${bars.totalWidth} 38`}
        className="h-11 w-full max-w-[230px] text-neutral-900 dark:text-neutral-100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {bars.items.map((b, i) => (
          <rect
            key={i}
            x={b.x}
            y={0}
            width={b.w}
            height={38}
            fill="currentColor"
            rx={0.4}
          />
        ))}
      </svg>
      <span className="font-mono text-[10px] font-semibold tracking-[0.25em] text-neutral-400">
        {code}
      </span>
    </div>
  );
}

const VOUCHER_VISUAL_THEMES = [
  {
    bg: "from-violet-500 via-purple-500 to-indigo-600",
    cardBg: "bg-white/15 border-white/25",
    badgeBg: "bg-rose-600 text-white",
    accent: "text-amber-300",
  },
  {
    bg: "from-sky-500 via-blue-600 to-indigo-700",
    cardBg: "bg-white/15 border-white/25",
    badgeBg: "bg-rose-600 text-white",
    accent: "text-cyan-200",
  },
  {
    bg: "from-teal-400 via-emerald-500 to-cyan-600",
    cardBg: "bg-white/15 border-white/25",
    badgeBg: "bg-rose-600 text-white",
    accent: "text-emerald-100",
  },
  {
    bg: "from-rose-400 via-pink-500 to-fuchsia-600",
    cardBg: "bg-white/15 border-white/25",
    badgeBg: "bg-neutral-900 text-white",
    accent: "text-pink-100",
  },
  {
    bg: "from-amber-400 via-orange-500 to-rose-500",
    cardBg: "bg-white/15 border-white/25",
    badgeBg: "bg-neutral-900 text-white",
    accent: "text-amber-100",
  },
  {
    bg: "from-slate-800 via-neutral-900 to-zinc-950",
    cardBg: "bg-white/10 border-white/20",
    badgeBg: "bg-rose-600 text-white",
    accent: "text-emerald-400",
  },
] as const;

interface CouponPassCardProps {
  code: string;
  name: string;
  discountType: "percentage" | "fixed";
  valueNum: number;
  maxNum?: number | null;
  minNum: number;
  dateLabel: string;
  usageText: string;
  storeNames: string;
  badge: { label: string; cls: string };
  themeIndex?: number;
  compact?: boolean;
  onCopy?: () => void;
  actions?: React.ReactNode;
}

function CouponPassCard({
  code,
  name,
  discountType,
  valueNum,
  maxNum,
  minNum,
  dateLabel,
  usageText,
  storeNames,
  badge,
  themeIndex = 0,
  compact = false,
  onCopy,
  actions,
}: CouponPassCardProps) {
  const isPercent = discountType === "percentage";
  const theme = VOUCHER_VISUAL_THEMES[themeIndex % VOUCHER_VISUAL_THEMES.length];

  const shortHeroValue = !valueNum
    ? isPercent
      ? "-0%"
      : "-0đ"
    : isPercent
      ? `-${valueNum}%`
      : valueNum >= 1000
        ? `-${Math.round(valueNum / 1000)}K`
        : `-${valueNum}đ`;

  const headline = isPercent
    ? `Giảm ${valueNum}%${
        maxNum ? ` (tối đa ${maxNum.toLocaleString("vi-VN")}đ)` : ""
      }`
    : `Giảm ${valueNum.toLocaleString("vi-VN")}đ`;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-neutral-200/90 bg-white shadow-[0_12px_36px_rgba(0,0,0,0.06)] dark:border-neutral-800 dark:bg-neutral-900">
      {/* Top Pass Visual Banner */}
      <div className={compact ? "p-3 pb-2.5" : "p-4 pb-3"}>
        <div
          className={`relative flex flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-white ${
            compact ? "h-28" : "h-36"
          } ${theme.bg}`}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/15 blur-xl"
          />
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute -bottom-4 -right-4 h-24 w-36 rotate-[-10deg] rounded-2xl border backdrop-blur-sm ${theme.cardBg}`}
          />

          <div className="relative z-10 flex items-center justify-between">
            <span
              className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-black shadow-sm ${theme.badgeBg}`}
            >
              {isPercent ? "%" : "đ"}
            </span>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold backdrop-blur-sm ${badge.cls}`}
            >
              {badge.label}
            </span>
          </div>

          <div className="relative z-10 flex items-end justify-between gap-2">
            <div className="min-w-0">
              <div
                className={`text-[10px] font-bold uppercase tracking-wider ${theme.accent}`}
              >
                Phiếu ưu đãi POS
              </div>
              <div className="truncate text-sm font-bold text-white">
                {name}
              </div>
            </div>
            <div className="shrink-0 text-3xl font-black leading-none tracking-tight text-white drop-shadow-sm">
              {shortHeroValue}
            </div>
          </div>
        </div>
      </div>

      {/* Horizontal Ticket Perforation with Side Notches */}
      <div className="relative my-1 border-t border-dashed border-neutral-200 dark:border-neutral-800">
        <span
          aria-hidden="true"
          className="absolute -left-3 -top-3 h-6 w-6 rounded-full border border-neutral-200/80 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-950"
        />
        <span
          aria-hidden="true"
          className="absolute -right-3 -top-3 h-6 w-6 rounded-full border border-neutral-200/80 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-950"
        />
      </div>

      {/* Middle: Code + Conditions */}
      <div className={compact ? "space-y-3 px-4 py-3" : "space-y-4 px-5 py-4"}>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200/80 bg-neutral-50/70 px-3.5 py-2 dark:border-neutral-800 dark:bg-neutral-950/60">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
              Mã áp dụng
            </div>
            <div className="truncate font-mono text-sm font-extrabold tracking-wider text-neutral-900 dark:text-white">
              {code}
            </div>
          </div>
          {onCopy && (
            <BeButton variant="secondary" size="sm" onClick={onCopy}>
              <Copy className="h-3.5 w-3.5" />
              Sao chép
            </BeButton>
          )}
        </div>

        <div>
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
            Điều kiện áp dụng
          </div>
          <ul className="space-y-1 text-xs text-neutral-600 dark:text-neutral-300">
            <li className="flex items-center justify-between gap-2">
              <span className="text-neutral-400">Ưu đãi:</span>
              <span className="font-semibold text-neutral-900 dark:text-white">
                {headline}
              </span>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="text-neutral-400">Đơn tối thiểu:</span>
              <span className="font-semibold text-neutral-900 dark:text-white">
                {minNum > 0
                  ? `${minNum.toLocaleString("vi-VN")}đ`
                  : "Không yêu cầu"}
              </span>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="text-neutral-400">Thời hạn:</span>
              <span className="font-semibold text-neutral-900 dark:text-white">
                {dateLabel}
              </span>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="text-neutral-400">Lượt dùng:</span>
              <span className="font-semibold text-neutral-900 dark:text-white">
                {usageText}
              </span>
            </li>
            <li className="flex items-start justify-between gap-3">
              <span className="shrink-0 text-neutral-400">Chi nhánh:</span>
              <span className="text-right font-semibold text-neutral-900 dark:text-white">
                {storeNames}
              </span>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom Barcode & Optional Actions */}
      <div
        className={`border-t border-dashed border-neutral-200 bg-neutral-50/50 dark:border-neutral-800 dark:bg-neutral-950/40 ${
          compact ? "px-4 py-3" : "px-5 py-4"
        }`}
      >
        <BarcodeGraphic code={code} />
        {actions && (
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-neutral-200/70 pt-3 dark:border-neutral-800">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

export function DiscountsView({
  stores,
  accessToken,
  apiFetch,
  notify,
}: DiscountsViewProps) {
  const [discounts, setDiscounts] = useState<DiscountCodeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DiscountCodeRecord | null>(null);
  const [saving, setSaving] = useState(false);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [valueDigits, setValueDigits] = useState("10");
  const [maxDiscountDigits, setMaxDiscountDigits] = useState("");
  const [minOrderDigits, setMinOrderDigits] = useState("0");
  const [usageLimitDigits, setUsageLimitDigits] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);

  const loadDiscounts = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!accessToken) return;
      if (!options?.silent) setLoading(true);
      try {
        const res = await apiFetch("/api/v1/discounts");
        const list = Array.isArray(res)
          ? (res as DiscountCodeRecord[])
          : Array.isArray(res?.data)
            ? (res.data as DiscountCodeRecord[])
            : [];
        setDiscounts(list);
      } catch {
        if (!options?.silent) setDiscounts([]);
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [accessToken, apiFetch]
  );

  useEffect(() => {
    void loadDiscounts();
  }, [loadDiscounts]);

  const openCreateModal = () => {
    setEditing(null);
    setCode("");
    setName("");
    setDescription("");
    setDiscountType("percentage");
    setValueDigits("10");
    setMaxDiscountDigits("");
    setMinOrderDigits("0");
    setUsageLimitDigits("");
    setStartsAt("");
    setEndsAt("");
    setSelectedStoreIds([]);
    setIsActive(true);
    setModalOpen(true);
  };

  const openEditModal = (dc: DiscountCodeRecord) => {
    setEditing(dc);
    setCode(dc.code);
    setName(dc.name);
    setDescription(dc.description || "");
    setDiscountType(dc.discount_type === "fixed" ? "fixed" : "percentage");
    setValueDigits(String(Math.max(0, Math.round(Number(dc.value || 0)))));
    setMaxDiscountDigits(
      dc.max_discount_amount
        ? String(Math.max(0, Math.round(Number(dc.max_discount_amount))))
        : ""
    );
    setMinOrderDigits(
      String(Math.max(0, Math.round(Number(dc.min_order_amount || 0))))
    );
    setUsageLimitDigits(dc.usage_limit ? String(dc.usage_limit) : "");
    setStartsAt(toYmdLocalValue(dc.starts_at));
    setEndsAt(toYmdLocalValue(dc.ends_at));
    setSelectedStoreIds(dc.store_ids || []);
    setIsActive(dc.status === "active");
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      notify("error", "Vui lòng nhập đầy đủ Mã giảm giá và Tên chương trình.");
      return;
    }
    const numVal = Number(valueDigits || 0);
    if (numVal <= 0) {
      notify("error", "Mức giảm phải lớn hơn 0.");
      return;
    }
    if (discountType === "percentage" && numVal > 100) {
      notify("error", "Mức giảm theo phần trăm không được vượt quá 100%.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...(editing ? {} : { code: code.trim().toUpperCase() }),
        name: name.trim(),
        description: description.trim() || null,
        discount_type: discountType,
        value: String(numVal),
        max_discount_amount:
          discountType === "percentage" && maxDiscountDigits.trim()
            ? maxDiscountDigits.trim()
            : null,
        min_order_amount: minOrderDigits.trim() || "0",
        usage_limit: usageLimitDigits.trim() ? Number(usageLimitDigits) : null,
        starts_at: startsAt
          ? new Date(`${startsAt}T00:00:00`).toISOString()
          : null,
        ends_at:
          endsAt || startsAt
            ? new Date(`${endsAt || startsAt}T23:59:59`).toISOString()
            : null,
        store_ids: selectedStoreIds,
        status: isActive ? "active" : "inactive",
      };

      if (editing) {
        await apiFetch(`/api/v1/discounts/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        notify("success", `Đã cập nhật mã "${editing.code}"!`);
      } else {
        await apiFetch("/api/v1/discounts", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        notify("success", `Đã tạo mã giảm giá "${code.trim().toUpperCase()}"!`);
      }
      setModalOpen(false);
      await loadDiscounts({ silent: true });
    } catch (err: any) {
      notify("error", err?.message || "Không thể lưu mã giảm giá");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (dc: DiscountCodeRecord) => {
    const nextStatus = dc.status === "active" ? "inactive" : "active";
    setDiscounts((prev) =>
      prev.map((item) =>
        item.id === dc.id ? { ...item, status: nextStatus } : item
      )
    );
    try {
      await apiFetch(`/api/v1/discounts/${dc.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      notify(
        "success",
        nextStatus === "active"
          ? `Đã bật mã "${dc.code}"`
          : `Đã tạm dừng mã "${dc.code}"`
      );
    } catch (err: any) {
      setDiscounts((prev) =>
        prev.map((item) =>
          item.id === dc.id ? { ...item, status: dc.status } : item
        )
      );
      notify("error", err?.message || "Không thể cập nhật trạng thái");
    }
  };

  const handleDelete = async (dc: DiscountCodeRecord) => {
    const snapshot = discounts;
    setDiscounts((prev) => prev.filter((item) => item.id !== dc.id));
    try {
      await apiFetch(`/api/v1/discounts/${dc.id}`, { method: "DELETE" });
      notify("success", `Đã xóa mã "${dc.code}"`);
    } catch (err: any) {
      setDiscounts(snapshot);
      notify("error", err?.message || "Không thể xóa mã giảm giá");
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return discounts.filter((d) => {
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (!q) return true;
      return (
        d.code.toLowerCase().includes(q) || d.name.toLowerCase().includes(q)
      );
    });
  }, [discounts, search, statusFilter]);

  const storeOptions = useMemo(
    () =>
      stores.map((st) => ({
        value: st.id,
        label: st.name,
        description: st.code,
      })),
    [stores]
  );

  const getRuntimeBadge = (dc: DiscountCodeRecord) => {
    const now = Date.now();
    if (dc.status !== "active") {
      return {
        label: "Tạm dừng",
        cls: "bg-neutral-100 text-neutral-600 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700",
      };
    }
    if (dc.ends_at && new Date(dc.ends_at).getTime() < now) {
      return {
        label: "Hết hạn",
        cls: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900",
      };
    }
    if (
      dc.usage_limit !== null &&
      dc.usage_limit !== undefined &&
      dc.used_count >= dc.usage_limit
    ) {
      return {
        label: "Hết lượt",
        cls: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900",
      };
    }
    return {
      label: "Đang chạy",
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900",
    };
  };

  const selectedDiscount = useMemo(() => {
    if (filtered.length === 0) return null;
    return filtered.find((d) => d.id === selectedId) ?? filtered[0];
  }, [filtered, selectedId]);

  const selectedThemeIndex = useMemo(() => {
    if (!selectedDiscount) return 0;
    const idx = filtered.findIndex((d) => d.id === selectedDiscount.id);
    return idx >= 0 ? idx % VOUCHER_VISUAL_THEMES.length : 0;
  }, [filtered, selectedDiscount]);

  // Live preview display values
  const previewValueText = useMemo(() => {
    const n = Number(valueDigits || 0);
    if (!n) return discountType === "percentage" ? "0%" : "0đ";
    return discountType === "percentage"
      ? `-${n}%`
      : `-${n.toLocaleString("vi-VN")}đ`;
  }, [discountType, valueDigits]);

  const previewMinOrder = Number(minOrderDigits || 0);
  const previewMaxDiscount = maxDiscountDigits ? Number(maxDiscountDigits) : 0;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">
            Quản lý Mã giảm giá
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Tạo mã khuyến mãi theo phần trăm hoặc số tiền cố định, giới hạn lượt dùng, chi nhánh và thời gian áp dụng trên POS.
          </p>
        </div>

        <BeButton variant="primary" size="md" onClick={openCreateModal}>
          <Plus className="h-3.5 w-3.5" />
          Tạo Mã Giảm Giá
        </BeButton>
      </div>

      {/* Main Card */}
      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        {/* Toolbar */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 pb-4">
          <BeTabs
            value={statusFilter}
            onValueChange={(v) =>
              setStatusFilter(v as "all" | "active" | "inactive")
            }
            variant="pill"
          >
            <BeTabsList>
              <BeTabsTrigger value="all">
                Tất cả ({discounts.length})
              </BeTabsTrigger>
              <BeTabsTrigger value="active">
                Đang bật ({discounts.filter((d) => d.status === "active").length})
              </BeTabsTrigger>
              <BeTabsTrigger value="inactive">
                Tạm dừng ({discounts.filter((d) => d.status === "inactive").length})
              </BeTabsTrigger>
            </BeTabsList>
          </BeTabs>

          <div className="w-full sm:w-64">
            <BeInput
              value={search}
              onChange={setSearch}
              placeholder="Tìm mã hoặc tên chương trình..."
              leftIcon={<Search className="h-3.5 w-3.5" />}
            />
          </div>
        </div>

        {/* Master-Detail Coupon Workspace */}
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl bg-neutral-100/70 p-3 dark:bg-neutral-950/40">
          {loading ? (
            <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="space-y-3 lg:col-span-7">
                {[1, 2, 3, 4].map((idx) => (
                  <Skeleton
                    key={idx}
                    className="h-28 w-full rounded-2xl dark:bg-neutral-800"
                  />
                ))}
              </div>
              <div className="hidden lg:col-span-5 lg:block">
                <Skeleton className="h-full min-h-[380px] w-full rounded-3xl dark:bg-neutral-800" />
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-white/70 p-10 text-center dark:border-neutral-800 dark:bg-neutral-950/30">
              <TicketPercent className="mb-2.5 h-8 w-8 text-neutral-400" />
              <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                Chưa có mã giảm giá nào
              </div>
              <p className="mt-1 max-w-sm text-xs text-neutral-500">
                Bấm &ldquo;+ Tạo Mã Giảm Giá&rdquo; ở góc trên để tạo mã khuyến mãi cho thu ngân và Kiosk áp dụng.
              </p>
            </div>
          ) : (
            <div className="grid h-full min-h-0 grid-cols-1 gap-4 lg:grid-cols-12">
              {/* LEFT: Coupon Ticket List */}
              <div className="min-h-0 space-y-3 overflow-y-auto pr-1 lg:col-span-7">
                {filtered.map((dc, idx) => {
                  const badge = getRuntimeBadge(dc);
                  const valNum = Number(dc.value || 0);
                  const minNum = Number(dc.min_order_amount || 0);
                  const maxNum = dc.max_discount_amount
                    ? Number(dc.max_discount_amount)
                    : null;
                  const isPercent = dc.discount_type === "percentage";
                  const isSelected = selectedDiscount?.id === dc.id;
                  const theme =
                    VOUCHER_VISUAL_THEMES[idx % VOUCHER_VISUAL_THEMES.length];

                  const shortHeroValue = isPercent
                    ? `-${valNum}%`
                    : valNum >= 1000
                      ? `-${Math.round(valNum / 1000)}K`
                      : `-${valNum}đ`;

                  const headline = isPercent
                    ? `Giảm ${valNum}%${
                        maxNum
                          ? ` (tối đa ${maxNum.toLocaleString("vi-VN")}đ)`
                          : ""
                      }`
                    : `Giảm ${valNum.toLocaleString("vi-VN")}đ`;

                  const dateLabel =
                    dc.starts_at || dc.ends_at
                      ? `${dc.starts_at ? formatShortDate(dc.starts_at) : "Ngay"} → ${
                          dc.ends_at
                            ? formatShortDate(dc.ends_at)
                            : "Không giới hạn"
                        }`
                      : "Không giới hạn ngày";

                  return (
                    <Card
                      key={dc.id}
                      interactive
                      variant="outlined"
                      size="compact"
                      onClick={() => setSelectedId(dc.id)}
                      className={`group relative cursor-pointer overflow-hidden rounded-2xl bg-white py-0 transition-all dark:bg-neutral-900 ${
                        isSelected
                          ? "border-neutral-900 shadow-[0_8px_24px_rgba(0,0,0,0.08)] ring-1 ring-neutral-900/10 dark:border-white dark:ring-white/15"
                          : "border-neutral-200/80 shadow-[0_1px_4px_rgba(0,0,0,0.03)] hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700"
                      } ${dc.status !== "active" ? "opacity-75" : ""}`}
                    >
                      <CardContent className="flex flex-row items-stretch gap-0 px-0">
                        {/* Left Mini Visual Stub */}
                        <div
                          className={`relative flex w-28 shrink-0 flex-col justify-between overflow-hidden bg-gradient-to-br p-3 text-white sm:w-36 ${theme.bg}`}
                        >
                          <div
                            aria-hidden="true"
                            className={`pointer-events-none absolute -bottom-3 -right-3 h-16 w-20 rotate-[-12deg] rounded-lg border ${theme.cardBg}`}
                          />
                          <span
                            className={`relative z-10 inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black shadow-sm ${theme.badgeBg}`}
                          >
                            {isPercent ? "%" : "đ"}
                          </span>
                          <div className="relative z-10 mt-auto">
                            <div className="text-lg font-black leading-none tracking-tight">
                              {shortHeroValue}
                            </div>
                            <div className="mt-0.5 truncate font-mono text-[9px] font-semibold text-white/80">
                              {dc.code}
                            </div>
                          </div>
                        </div>

                        {/* Vertical Perforated Divider with Notches */}
                        <div className="relative w-px border-l border-dashed border-neutral-200 dark:border-neutral-800">
                          <span
                            aria-hidden="true"
                            className="absolute -left-2 -top-2 h-4 w-4 rounded-full border border-neutral-200/80 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-950"
                          />
                          <span
                            aria-hidden="true"
                            className="absolute -bottom-2 -left-2 h-4 w-4 rounded-full border border-neutral-200/80 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-950"
                          />
                        </div>

                        {/* Right Ticket Info */}
                        <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 p-3.5 sm:p-4">
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="truncate text-sm font-bold text-neutral-900 dark:text-white">
                                {headline}
                              </h3>
                              <span
                                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}
                              >
                                {badge.label}
                              </span>
                            </div>
                            <p className="mt-0.5 truncate text-xs font-medium text-neutral-600 dark:text-neutral-300">
                              {dc.name}
                              {minNum > 0
                                ? ` • Đơn từ ${minNum.toLocaleString("vi-VN")}đ`
                                : ""}
                            </p>
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-1">
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                              <Calendar className="h-3 w-3 text-neutral-400" />
                              {dateLabel}
                            </span>

                            <div
                              onClick={(e) => e.stopPropagation()}
                              onPointerDown={(e) => e.stopPropagation()}
                            >
                              <BeSwitch
                                checked={dc.status === "active"}
                                onCheckedChange={() =>
                                  void handleToggleStatus(dc)
                                }
                                ariaLabel={`Bật tắt mã ${dc.code}`}
                              />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* RIGHT: Vertical Coupon Pass Detail (Mobile Pass Inspired) */}
              {selectedDiscount && (
                <div className="min-h-0 overflow-y-auto lg:col-span-5">
                  {(() => {
                    const dc = selectedDiscount;
                    const badge = getRuntimeBadge(dc);
                    const valNum = Number(dc.value || 0);
                    const minNum = Number(dc.min_order_amount || 0);
                    const maxNum = dc.max_discount_amount
                      ? Number(dc.max_discount_amount)
                      : null;

                    const dateLabel =
                      dc.starts_at || dc.ends_at
                        ? `${dc.starts_at ? formatShortDate(dc.starts_at) : "Ngay"} → ${
                            dc.ends_at
                              ? formatShortDate(dc.ends_at)
                              : "Không giới hạn"
                          }`
                        : "Không giới hạn thời gian";

                    const storeNames =
                      dc.store_ids.length === 0
                        ? "Tất cả chi nhánh"
                        : dc.store_ids
                            .map(
                              (sid) =>
                                stores.find((s) => s.id === sid)?.name || sid
                            )
                            .join(", ");

                    return (
                      <CouponPassCard
                        code={dc.code}
                        name={dc.name}
                        discountType={dc.discount_type}
                        valueNum={valNum}
                        maxNum={maxNum}
                        minNum={minNum}
                        dateLabel={dateLabel}
                        usageText={`${dc.used_count}${
                          dc.usage_limit
                            ? ` / ${dc.usage_limit} lượt`
                            : " (Không giới hạn)"
                        }`}
                        storeNames={storeNames}
                        badge={badge}
                        themeIndex={selectedThemeIndex}
                        onCopy={() => {
                          void navigator.clipboard?.writeText(dc.code);
                          notify("info", `Đã sao chép mã ${dc.code}`);
                        }}
                        actions={
                          <>
                            <BeSwitch
                              checked={dc.status === "active"}
                              onCheckedChange={() =>
                                void handleToggleStatus(dc)
                              }
                              ariaLabel={`Bật tắt mã ${dc.code}`}
                            />
                            <div className="flex items-center gap-2">
                              <BeButton
                                variant="secondary"
                                size="sm"
                                onClick={() => openEditModal(dc)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Chỉnh sửa
                              </BeButton>
                              <BeButton
                                variant="danger"
                                size="sm"
                                onClick={() => void handleDelete(dc)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Xóa
                              </BeButton>
                            </div>
                          </>
                        }
                      />
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MODAL: CREATE / EDIT DISCOUNT CODE (2-COLUMN LAYOUT) */}
      <AnimatePresence>
        {modalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setModalOpen(false)}
              className="fixed inset-0 z-[80] bg-black/30 [backdrop-filter:blur(8px)]"
            />
            <div className="pointer-events-none fixed inset-4 z-[81] flex items-center justify-center">
              <motion.form
                onSubmit={handleSave}
                initial={{ opacity: 0, y: 18, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
                className="pointer-events-auto flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-neutral-200/80 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950"
              >
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b border-neutral-200/80 px-6 py-4 dark:border-neutral-800">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white">
                      <TicketPercent className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                        {editing
                          ? `Chỉnh sửa mã: ${editing.code}`
                          : "Tạo Mã Giảm Giá Mới"}
                      </h3>
                      <p className="text-[11px] text-neutral-400">
                        Thiết lập mức giảm, điều kiện đơn hàng, thời gian và chi nhánh áp dụng.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Modal Body: 2-Column Layout */}
                <div className="min-h-0 flex-1 overflow-y-auto p-6">
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                    {/* LEFT COLUMN (7 cols): Identity, Pricing Rules, Limits & Schedule */}
                    <div className="space-y-4 lg:col-span-7">
                      {/* Section 1: Identity */}
                      <div className="rounded-2xl border border-neutral-200/80 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
                        <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                          1. Thông tin chương trình
                        </div>
                        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                          <BeInput
                            label="Mã giảm giá *"
                            disabled={Boolean(editing)}
                            value={code}
                            onChange={(v) =>
                              setCode(v.toUpperCase().replace(/\s+/g, ""))
                            }
                            placeholder="VD: KHAITRUONG20"
                            success={code.trim().length >= 2}
                          />
                          <BeInput
                            label="Tên chương trình *"
                            value={name}
                            onChange={setName}
                            placeholder="VD: Giảm 20% khai trương"
                            success={Boolean(name.trim())}
                          />
                        </div>
                      </div>

                      {/* Section 2: Discount Rules */}
                      <div className="rounded-2xl border border-neutral-200/80 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
                        <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                          2. Chính sách giảm giá
                        </div>
                        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                          <BeSelect
                            label="Loại giảm giá"
                            value={discountType}
                            onValueChange={(v) =>
                              setDiscountType(
                                v === "fixed" ? "fixed" : "percentage"
                              )
                            }
                            options={[
                              {
                                value: "percentage",
                                label: "Theo phần trăm (%)",
                              },
                              {
                                value: "fixed",
                                label: "Số tiền cố định (đ)",
                              },
                            ]}
                          />

                          <BeInput
                            label={
                              discountType === "percentage"
                                ? "Mức giảm (%) *"
                                : "Số tiền giảm *"
                            }
                            inputMode="numeric"
                            value={
                              valueDigits
                                ? discountType === "fixed"
                                  ? Number(valueDigits).toLocaleString("vi-VN")
                                  : valueDigits
                                : ""
                            }
                            onChange={(val) => {
                              let digits = val.replace(/\D/g, "");
                              if (
                                discountType === "percentage" &&
                                Number(digits) > 100
                              ) {
                                digits = "100";
                              }
                              setValueDigits(digits);
                            }}
                            placeholder={
                              discountType === "percentage"
                                ? "VD: 20"
                                : "VD: 50.000"
                            }
                            rightIcon={
                              <span className="text-[11px] font-bold">
                                {discountType === "percentage" ? "%" : "đ"}
                              </span>
                            }
                          />

                          {discountType === "percentage" && (
                            <BeInput
                              label="Giảm tối đa (tùy chọn)"
                              inputMode="numeric"
                              value={
                                maxDiscountDigits
                                  ? Number(maxDiscountDigits).toLocaleString(
                                      "vi-VN"
                                    )
                                  : ""
                              }
                              onChange={(val) =>
                                setMaxDiscountDigits(val.replace(/\D/g, ""))
                              }
                              placeholder="Không giới hạn"
                              rightIcon={
                                <span className="text-[11px] font-bold">đ</span>
                              }
                            />
                          )}

                          <BeInput
                            label="Đơn hàng tối thiểu"
                            inputMode="numeric"
                            value={
                              minOrderDigits
                                ? Number(minOrderDigits).toLocaleString("vi-VN")
                                : ""
                            }
                            onChange={(val) =>
                              setMinOrderDigits(val.replace(/\D/g, ""))
                            }
                            placeholder="0"
                            rightIcon={
                              <span className="text-[11px] font-bold">đ</span>
                            }
                          />
                        </div>
                      </div>

                      {/* Section 3: Schedule & Usage Limit */}
                      <div className="rounded-2xl border border-neutral-200/80 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
                        <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                          3. Thời gian &amp; giới hạn lượt dùng
                        </div>
                        <div className="space-y-3.5">
                          <BeInput
                            label="Giới hạn tổng lượt dùng"
                            inputMode="numeric"
                            value={usageLimitDigits}
                            onChange={(val) =>
                              setUsageLimitDigits(val.replace(/\D/g, ""))
                            }
                            placeholder="Để trống = Không giới hạn"
                            rightIcon={
                              <span className="text-[11px] font-medium">
                                lượt
                              </span>
                            }
                          />

                          <DateRangePicker
                            label="Khoảng thời gian áp dụng (Bắt đầu từ → Kết thúc lúc)"
                            locale="vi-VN"
                            value={
                              startsAt
                                ? {
                                    from: startsAt,
                                    to: endsAt || undefined,
                                  }
                                : null
                            }
                            onValueChange={(range: DateRange | null) => {
                              setStartsAt(range?.from ?? "");
                              setEndsAt(range?.to ?? "");
                            }}
                            presets={[
                              {
                                label: "7 ngày",
                                value: { from: addDaysYmd(0), to: addDaysYmd(6) },
                              },
                              {
                                label: "30 ngày",
                                value: { from: addDaysYmd(0), to: addDaysYmd(29) },
                              },
                              {
                                label: "90 ngày",
                                value: { from: addDaysYmd(0), to: addDaysYmd(89) },
                              },
                            ]}
                            closeOnSelect
                            labels={{
                              label: "Thời gian áp dụng",
                              placeholder: "Không giới hạn (chọn ngày bắt đầu → kết thúc)",
                              startDate: "Bắt đầu từ",
                              endDate: "Kết thúc lúc",
                              selectEnd: "Chọn ngày kết thúc",
                              clear: "Xóa",
                              clearLabel: "Xóa khoảng thời gian",
                              chooseMonth: "Chọn tháng",
                              chooseYear: "Chọn năm",
                            }}
                          >
                            <DateRangePickerTrigger className="w-full justify-between" />
                            <DateRangePickerContent className="w-[320px]">
                              <DateRangePickerCalendar className="w-full rounded-none border-0">
                                <DateRangePickerPresets className="mb-2" />
                                <DateRangePickerHeader />
                                <DateRangePickerGrid />
                                <DateRangePickerFooter>
                                  <div className="flex items-center justify-between gap-2">
                                    <DateRangePickerSelection />
                                    <DateRangePickerClear />
                                  </div>
                                </DateRangePickerFooter>
                              </DateRangePickerCalendar>
                            </DateRangePickerContent>
                          </DateRangePicker>
                        </div>
                      </div>

                      {/* Section 4: Store Scope via BeMultiSelect */}
                      <div className="rounded-2xl border border-neutral-200/80 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                            4. Phạm vi chi nhánh
                          </span>
                          {selectedStoreIds.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setSelectedStoreIds([])}
                              className="text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400"
                            >
                              Áp dụng tất cả
                            </button>
                          )}
                        </div>
                        <BeMultiSelect
                          options={storeOptions}
                          values={selectedStoreIds}
                          onChange={setSelectedStoreIds}
                          placeholder="Tất cả chi nhánh (hoặc chọn riêng...)"
                          emptyText="Không tìm thấy chi nhánh phù hợp."
                          helperText={
                            selectedStoreIds.length === 0
                              ? "Để trống để áp dụng cho toàn bộ hệ thống."
                              : `Đang giới hạn tại ${selectedStoreIds.length} chi nhánh đã chọn.`
                          }
                        />
                      </div>
                    </div>

                    {/* RIGHT COLUMN (5 cols): Live Coupon Pass Preview + Active Switch */}
                    <div className="flex flex-col gap-4 lg:col-span-5">
                      <CouponPassCard
                        compact
                        code={code.trim() || "MÃ_GIẢM_GIÁ"}
                        name={name.trim() || "Tên chương trình khuyến mãi"}
                        discountType={discountType}
                        valueNum={Number(valueDigits || 0)}
                        maxNum={
                          discountType === "percentage" && previewMaxDiscount > 0
                            ? previewMaxDiscount
                            : null
                        }
                        minNum={previewMinOrder}
                        dateLabel={
                          startsAt || endsAt
                            ? `${startsAt ? formatShortDate(startsAt) : "Ngay"} → ${
                                endsAt
                                  ? formatShortDate(endsAt)
                                  : "Không giới hạn"
                              }`
                            : "Không giới hạn thời gian"
                        }
                        usageText={
                          usageLimitDigits.trim()
                            ? `${editing?.used_count ?? 0} / ${usageLimitDigits.trim()} lượt`
                            : `${editing?.used_count ?? 0} (Không giới hạn)`
                        }
                        storeNames={
                          selectedStoreIds.length === 0
                            ? "Tất cả chi nhánh"
                            : selectedStoreIds
                                .map(
                                  (sid) =>
                                    stores.find((s) => s.id === sid)?.name ||
                                    sid
                                )
                                .join(", ")
                        }
                        badge={
                          isActive
                            ? {
                                label: "Đang chạy",
                                cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900",
                              }
                            : {
                                label: "Tạm dừng",
                                cls: "bg-neutral-100 text-neutral-600 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700",
                              }
                        }
                        themeIndex={editing ? selectedThemeIndex : 0}
                      />

                      {/* Active Switch at bottom-right */}
                      <div className="flex items-center justify-between rounded-2xl border border-neutral-200/80 bg-neutral-50/50 px-4 py-3.5 dark:border-neutral-800 dark:bg-neutral-900/50">
                        <div>
                          <div className="text-xs font-bold text-neutral-900 dark:text-white">
                            Kích hoạt mã giảm giá
                          </div>
                          <div className="text-[11px] text-neutral-400">
                            Cho phép thu ngân &amp; Kiosk áp dụng ngay
                          </div>
                        </div>
                        <BeSwitch
                          checked={isActive}
                          onCheckedChange={setIsActive}
                          ariaLabel="Kích hoạt mã giảm giá"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end gap-2.5 border-t border-neutral-200/80 px-6 py-3.5 dark:border-neutral-800">
                  <BeButton
                    variant="secondary"
                    size="md"
                    onClick={() => setModalOpen(false)}
                  >
                    Hủy
                  </BeButton>
                  <BeButton
                    type="submit"
                    variant="primary"
                    size="md"
                    disabled={saving || !code.trim() || !name.trim()}
                  >
                    <Check className="h-3.5 w-3.5" />
                    {saving
                      ? "Đang lưu..."
                      : editing
                        ? "Lưu thay đổi"
                        : "Tạo Mã"}
                  </BeButton>
                </div>
              </motion.form>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
