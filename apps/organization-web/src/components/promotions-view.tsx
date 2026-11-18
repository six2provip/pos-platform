"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Calendar,
  Check,
  Layers,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Store,
  Trash2,
  UtensilsCrossed,
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
import type { ProductRecord } from "./catalog-products-view";
import type { StoreRecord } from "./stores-master-detail-view";

export type PromoDiscountType = "percentage" | "fixed" | "override_price";

export interface PromotionItemRecord {
  id?: string;
  product_id: string;
  variant_id: string;
  product_name: string;
  variant_name: string;
  image_url?: string | null;
  base_price: string;
  discount_type: PromoDiscountType;
  discount_value: string;
  promo_price: string;
}

export interface PromotionRecord {
  id: string;
  name: string;
  description?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  store_ids: string[];
  status: "active" | "inactive";
  items: PromotionItemRecord[];
  created_at: string;
}

interface DraftPromotionItem {
  product_id: string;
  variant_id: string;
  product_name: string;
  variant_name: string;
  image_url?: string | null;
  base_price: number;
  discount_type: PromoDiscountType;
  discount_value_digits: string;
}

interface PromotionsViewProps {
  stores: StoreRecord[];
  products: ProductRecord[];
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

function computePromoPrice(
  basePrice: number,
  discountType: PromoDiscountType,
  value: number
): number {
  if (discountType === "percentage") {
    const pct = Math.min(100, Math.max(0, value));
    return Math.max(0, Math.round((basePrice * (100 - pct)) / 100));
  }
  if (discountType === "fixed") {
    return Math.max(0, Math.round(basePrice - value));
  }
  return Math.max(0, Math.round(value));
}

export function PromotionsView({
  stores,
  products,
  accessToken,
  apiFetch,
  notify,
}: PromotionsViewProps) {
  const [promotions, setPromotions] = useState<PromotionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PromotionRecord | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [draftItems, setDraftItems] = useState<DraftPromotionItem[]>([]);

  // Variant Picker & Bulk Apply
  const [variantQuery, setVariantQuery] = useState("");
  const [bulkType, setBulkType] = useState<PromoDiscountType>("percentage");
  const [bulkDigits, setBulkDigits] = useState("20");

  const loadPromotions = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!accessToken) return;
      if (!options?.silent) setLoading(true);
      try {
        const res = await apiFetch("/api/v1/promotions");
        const list = Array.isArray(res)
          ? (res as PromotionRecord[])
          : Array.isArray(res?.data)
            ? (res.data as PromotionRecord[])
            : [];
        setPromotions(list);
      } catch {
        if (!options?.silent) setPromotions([]);
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [accessToken, apiFetch]
  );

  useEffect(() => {
    void loadPromotions();
  }, [loadPromotions]);

  const openCreateModal = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setStartsAt("");
    setEndsAt("");
    setSelectedStoreIds([]);
    setIsActive(true);
    setDraftItems([]);
    setVariantQuery("");
    setBulkType("percentage");
    setBulkDigits("20");
    setModalOpen(true);
  };

  const openEditModal = (pr: PromotionRecord) => {
    setEditing(pr);
    setName(pr.name);
    setDescription(pr.description || "");
    setStartsAt(toYmdLocalValue(pr.starts_at));
    setEndsAt(toYmdLocalValue(pr.ends_at));
    setSelectedStoreIds(pr.store_ids || []);
    setIsActive(pr.status === "active");
    setDraftItems(
      (pr.items || []).map((it) => ({
        product_id: it.product_id,
        variant_id: it.variant_id,
        product_name: it.product_name,
        variant_name: it.variant_name,
        image_url: it.image_url,
        base_price: Math.max(0, Math.round(Number(it.base_price || 0))),
        discount_type: it.discount_type,
        discount_value_digits: String(
          Math.max(0, Math.round(Number(it.discount_value || 0)))
        ),
      }))
    );
    setVariantQuery("");
    setModalOpen(true);
  };

  const selectedVariantIds = useMemo(
    () => new Set(draftItems.map((it) => it.variant_id)),
    [draftItems]
  );

  const toggleVariantSelection = (
    product: ProductRecord,
    variant: ProductRecord["variants"][number]
  ) => {
    if (selectedVariantIds.has(variant.id)) {
      setDraftItems((prev) => prev.filter((it) => it.variant_id !== variant.id));
    } else {
      setDraftItems((prev) => [
        ...prev,
        {
          product_id: product.id,
          variant_id: variant.id,
          product_name: product.name,
          variant_name: variant.variant_name,
          image_url: product.image_url,
          base_price: Math.max(0, Math.round(Number(variant.default_price || 0))),
          discount_type: bulkType,
          discount_value_digits: bulkDigits || "10",
        },
      ]);
    }
  };

  const selectAllProductVariants = (product: ProductRecord) => {
    const missing = (product.variants || []).filter(
      (v) => !selectedVariantIds.has(v.id)
    );
    if (missing.length === 0) {
      const ids = new Set((product.variants || []).map((v) => v.id));
      setDraftItems((prev) => prev.filter((it) => !ids.has(it.variant_id)));
      return;
    }
    setDraftItems((prev) => [
      ...prev,
      ...missing.map((v) => ({
        product_id: product.id,
        variant_id: v.id,
        product_name: product.name,
        variant_name: v.variant_name,
        image_url: product.image_url,
        base_price: Math.max(0, Math.round(Number(v.default_price || 0))),
        discount_type: bulkType,
        discount_value_digits: bulkDigits || "10",
      })),
    ]);
  };

  const applyBulkRuleToSelected = () => {
    if (draftItems.length === 0) {
      notify("info", "Vui lòng chọn ít nhất 1 variant trước khi áp dụng hàng loạt.");
      return;
    }
    const cleanDigits =
      bulkType === "percentage" && Number(bulkDigits) > 100
        ? "100"
        : bulkDigits || "0";
    setDraftItems((prev) =>
      prev.map((it) => ({
        ...it,
        discount_type: bulkType,
        discount_value_digits: cleanDigits,
      }))
    );
    notify("success", `Đã áp dụng cho ${draftItems.length} variant đang chọn.`);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      notify("error", "Vui lòng nhập Tên chương trình khuyến mãi.");
      return;
    }
    if (draftItems.length === 0) {
      notify("error", "Vui lòng chọn ít nhất 1 variant sản phẩm để khuyến mãi.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        starts_at: startsAt
          ? new Date(`${startsAt}T00:00:00`).toISOString()
          : null,
        ends_at:
          endsAt || startsAt
            ? new Date(`${endsAt || startsAt}T23:59:59`).toISOString()
            : null,
        store_ids: selectedStoreIds,
        status: isActive ? "active" : "inactive",
        items: draftItems.map((it) => ({
          product_id: it.product_id,
          variant_id: it.variant_id,
          discount_type: it.discount_type,
          discount_value: String(Number(it.discount_value_digits || 0)),
        })),
      };

      if (editing) {
        await apiFetch(`/api/v1/promotions/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        notify("success", `Đã cập nhật khuyến mãi "${name.trim()}"!`);
      } else {
        await apiFetch("/api/v1/promotions", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        notify("success", `Đã tạo chương trình "${name.trim()}"!`);
      }
      setModalOpen(false);
      await loadPromotions({ silent: true });
    } catch (err: any) {
      notify("error", err?.message || "Không thể lưu chương trình khuyến mãi");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (pr: PromotionRecord) => {
    const nextStatus = pr.status === "active" ? "inactive" : "active";
    setPromotions((prev) =>
      prev.map((item) =>
        item.id === pr.id ? { ...item, status: nextStatus } : item
      )
    );
    try {
      await apiFetch(`/api/v1/promotions/${pr.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      notify(
        "success",
        nextStatus === "active"
          ? `Đã bật chương trình "${pr.name}"`
          : `Đã tạm dừng "${pr.name}"`
      );
    } catch (err: any) {
      setPromotions((prev) =>
        prev.map((item) =>
          item.id === pr.id ? { ...item, status: pr.status } : item
        )
      );
      notify("error", err?.message || "Không thể cập nhật trạng thái");
    }
  };

  const handleDelete = async (pr: PromotionRecord) => {
    const snapshot = promotions;
    setPromotions((prev) => prev.filter((item) => item.id !== pr.id));
    try {
      await apiFetch(`/api/v1/promotions/${pr.id}`, { method: "DELETE" });
      notify("success", `Đã xóa chương trình "${pr.name}"`);
    } catch (err: any) {
      setPromotions(snapshot);
      notify("error", err?.message || "Không thể xóa chương trình khuyến mãi");
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return promotions.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q) ||
        p.items.some(
          (it) =>
            it.product_name.toLowerCase().includes(q) ||
            it.variant_name.toLowerCase().includes(q)
        )
      );
    });
  }, [promotions, search, statusFilter]);

  const filteredCatalogProducts = useMemo(() => {
    const q = variantQuery.trim().toLowerCase();
    const activeProds = products.filter((p) => (p.variants || []).length > 0);
    if (!q) return activeProds;
    return activeProds.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.variants.some((v) => v.variant_name.toLowerCase().includes(q))
    );
  }, [products, variantQuery]);

  const storeOptions = useMemo(
    () =>
      stores.map((st) => ({
        value: st.id,
        label: st.name,
        description: st.code,
      })),
    [stores]
  );

  const getRuntimeBadge = (pr: PromotionRecord) => {
    const now = Date.now();
    if (pr.status !== "active") {
      return {
        label: "Tạm dừng",
        cls: "bg-neutral-100 text-neutral-600 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700",
      };
    }
    if (pr.starts_at && new Date(pr.starts_at).getTime() > now) {
      return {
        label: "Sắp diễn ra",
        cls: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-900",
      };
    }
    if (pr.ends_at && new Date(pr.ends_at).getTime() < now) {
      return {
        label: "Hết hạn",
        cls: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900",
      };
    }
    return {
      label: "Đang chạy",
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900",
    };
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">
            Quản lý Khuyến mãi
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Tạo chương trình khuyến mãi giảm giá trực tiếp cho từng biến thể (variant) sản phẩm theo thời gian và chi nhánh.
          </p>
        </div>

        <BeButton variant="primary" size="md" onClick={openCreateModal}>
          <Plus className="h-3.5 w-3.5" />
          Tạo Khuyến Mãi
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
                Tất cả ({promotions.length})
              </BeTabsTrigger>
              <BeTabsTrigger value="active">
                Đang bật ({promotions.filter((p) => p.status === "active").length})
              </BeTabsTrigger>
              <BeTabsTrigger value="inactive">
                Tạm dừng ({promotions.filter((p) => p.status === "inactive").length})
              </BeTabsTrigger>
            </BeTabsList>
          </BeTabs>

          <div className="w-full sm:w-72">
            <BeInput
              value={search}
              onChange={setSearch}
              placeholder="Tìm chương trình, sản phẩm, variant..."
              leftIcon={<Search className="h-3.5 w-3.5" />}
            />
          </div>
        </div>

        {/* List */}
        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl bg-neutral-50/70 p-3 dark:bg-neutral-950/40">
          {loading ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {[1, 2, 3, 4].map((idx) => (
                <Skeleton
                  key={idx}
                  className="h-52 w-full rounded-2xl dark:bg-neutral-800"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-white/70 p-10 text-center dark:border-neutral-800 dark:bg-neutral-950/30">
              <Sparkles className="mb-2.5 h-8 w-8 text-neutral-400" />
              <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                Chưa có chương trình khuyến mãi nào
              </div>
              <p className="mt-1 max-w-sm text-xs text-neutral-500">
                Bấm &ldquo;+ Tạo Khuyến Mãi&rdquo; để chạy ưu đãi giảm %, giảm tiền hoặc đồng giá theo từng variant sản phẩm.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {filtered.map((pr) => {
                const badge = getRuntimeBadge(pr);
                const dateLabel =
                  pr.starts_at || pr.ends_at
                    ? `${pr.starts_at ? formatShortDate(pr.starts_at) : "Ngay"} → ${
                        pr.ends_at
                          ? formatShortDate(pr.ends_at)
                          : "Không giới hạn"
                      }`
                    : "Không giới hạn ngày";
                const previewItems = pr.items.slice(0, 3);
                const extraCount = Math.max(0, pr.items.length - 3);

                return (
                  <Card
                    key={pr.id}
                    variant={pr.status === "active" ? "outlined" : "muted"}
                    size="compact"
                    className="justify-between gap-0 overflow-hidden rounded-2xl border-neutral-200/80 bg-white py-0 shadow-[0_2px_8px_rgba(0,0,0,0.03)] transition-colors hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
                  >
                    <CardContent className="flex flex-1 flex-col gap-3 p-4">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
                              <Sparkles className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <h3 className="truncate text-sm font-bold text-neutral-900 dark:text-white">
                                {pr.name}
                              </h3>
                              {pr.description && (
                                <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                                  {pr.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        <span
                          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      </div>

                      {/* Variant List Preview */}
                      <div className="space-y-1.5 rounded-xl border border-neutral-200/70 bg-neutral-50/60 p-2.5 dark:border-neutral-800 dark:bg-neutral-950/50">
                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                          <span>Variant áp dụng ({pr.items.length})</span>
                          <span>Giá gốc → Giá KM</span>
                        </div>
                        {previewItems.map((it) => {
                          const baseNum = Number(it.base_price || 0);
                          const promoNum = Number(it.promo_price || 0);
                          const valNum = Number(it.discount_value || 0);
                          const tagLabel =
                            it.discount_type === "percentage"
                              ? `-${valNum}%`
                              : it.discount_type === "fixed"
                                ? `-${valNum.toLocaleString("vi-VN")}đ`
                                : "Đồng giá";
                          return (
                            <div
                              key={it.variant_id}
                              className="flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="flex min-w-0 items-center gap-1.5">
                                <span className="truncate font-semibold text-neutral-800 dark:text-neutral-200">
                                  {it.product_name}
                                </span>
                                <span className="shrink-0 rounded bg-neutral-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                                  {it.variant_name}
                                </span>
                                <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                                  {tagLabel}
                                </span>
                              </div>
                              <div className="shrink-0 tabular-nums">
                                <span className="mr-1.5 text-[11px] text-neutral-400 line-through">
                                  {baseNum.toLocaleString("vi-VN")}đ
                                </span>
                                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                  {promoNum.toLocaleString("vi-VN")}đ
                                </span>
                              </div>
                            </div>
                          );
                        })}
                        {extraCount > 0 && (
                          <div className="pt-0.5 text-[11px] font-semibold text-neutral-500">
                            + {extraCount} variant khác...
                          </div>
                        )}
                      </div>

                      {/* Meta */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                          {dateLabel}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Store className="h-3.5 w-3.5 text-neutral-400" />
                          {pr.store_ids.length === 0
                            ? "Tất cả chi nhánh"
                            : `${pr.store_ids.length} chi nhánh`}
                        </span>
                      </div>
                    </CardContent>

                    <CardFooter className="justify-between gap-2 border-t border-neutral-200/70 bg-neutral-50/40 px-4 py-2.5 dark:border-neutral-800 dark:bg-neutral-950/30">
                      <BeSwitch
                        checked={pr.status === "active"}
                        onCheckedChange={() => void handleToggleStatus(pr)}
                        ariaLabel={`Bật tắt ${pr.name}`}
                      />
                      <div className="flex items-center gap-2">
                        <BeButton
                          variant="secondary"
                          size="sm"
                          onClick={() => openEditModal(pr)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Chỉnh sửa
                        </BeButton>
                        <BeButton
                          variant="danger"
                          size="sm"
                          onClick={() => void handleDelete(pr)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Xóa
                        </BeButton>
                      </div>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* MODAL: CREATE / EDIT PROMOTION (2-COLUMN VARIANT CONFIGURATOR) */}
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
                className="pointer-events-auto flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-neutral-200/80 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950"
              >
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b border-neutral-200/80 px-6 py-4 dark:border-neutral-800">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
                      <Sparkles className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                        {editing
                          ? `Chỉnh sửa khuyến mãi: ${editing.name}`
                          : "Tạo Chương Trình Khuyến Mãi Mới"}
                      </h3>
                      <p className="text-[11px] text-neutral-400">
                        Thiết lập thời gian, chi nhánh và mức giảm riêng cho từng biến thể (variant) sản phẩm.
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

                {/* Modal Body: 2 Columns */}
                <div className="min-h-0 flex-1 overflow-y-auto p-6">
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                    {/* LEFT COLUMN (5 cols): Program Info, Schedule, Store Scope, Active Switch */}
                    <div className="flex flex-col gap-4 lg:col-span-5">
                      <div className="space-y-3.5 rounded-2xl border border-neutral-200/80 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                          1. Thông tin chương trình
                        </div>
                        <BeInput
                          label="Tên chương trình *"
                          value={name}
                          onChange={setName}
                          placeholder="VD: Happy Hour Trà Sữa"
                          success={Boolean(name.trim())}
                        />
                        <BeInput
                          label="Mô tả ngắn (tùy chọn)"
                          value={description}
                          onChange={setDescription}
                          placeholder="VD: Giảm giá khung giờ vàng mỗi ngày"
                        />
                      </div>

                      <div className="space-y-3.5 rounded-2xl border border-neutral-200/80 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                          2. Thời gian &amp; chi nhánh
                        </div>
                        <DateRangePicker
                          label="Thời gian chạy chương trình"
                          locale="vi-VN"
                          value={
                            startsAt
                              ? { from: startsAt, to: endsAt || undefined }
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

                        <BeMultiSelect
                          label="Chi nhánh áp dụng"
                          options={storeOptions}
                          values={selectedStoreIds}
                          onChange={setSelectedStoreIds}
                          placeholder="Tất cả chi nhánh (hoặc chọn riêng...)"
                          emptyText="Không tìm thấy chi nhánh phù hợp."
                          helperText={
                            selectedStoreIds.length === 0
                              ? "Để trống để áp dụng cho toàn bộ hệ thống."
                              : `Đang áp dụng tại ${selectedStoreIds.length} chi nhánh.`
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between rounded-2xl border border-neutral-200/80 bg-neutral-50/50 px-4 py-3.5 dark:border-neutral-800 dark:bg-neutral-900/50">
                        <div>
                          <div className="text-xs font-bold text-neutral-900 dark:text-white">
                            Kích hoạt chương trình
                          </div>
                          <div className="text-[11px] text-neutral-400">
                            Tự động áp dụng giá khuyến mãi trên POS &amp; Kiosk
                          </div>
                        </div>
                        <BeSwitch
                          checked={isActive}
                          onCheckedChange={setIsActive}
                          ariaLabel="Kích hoạt chương trình khuyến mãi"
                        />
                      </div>
                    </div>

                    {/* RIGHT COLUMN (7 cols): Per-Variant Picker & Discount Pricing */}
                    <div className="flex flex-col gap-4 lg:col-span-7">
                      {/* Variant Catalog Picker */}
                      <div className="rounded-2xl border border-neutral-200/80 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
                        <div className="mb-2.5 flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                            3. Chọn sản phẩm theo Variant ({draftItems.length} đã chọn)
                          </span>
                        </div>

                        <BeInput
                          value={variantQuery}
                          onChange={setVariantQuery}
                          placeholder="Tìm tên sản phẩm hoặc tên variant (Size M, Size L...)"
                          leftIcon={<Search className="h-3.5 w-3.5" />}
                        />

                        <div className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1">
                          {filteredCatalogProducts.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-neutral-200 py-6 text-center text-xs text-neutral-400">
                              Không tìm thấy sản phẩm / variant phù hợp.
                            </div>
                          ) : (
                            filteredCatalogProducts.map((prod) => {
                              const allSelected =
                                prod.variants.length > 0 &&
                                prod.variants.every((v) =>
                                  selectedVariantIds.has(v.id)
                                );
                              return (
                                <div
                                  key={prod.id}
                                  className="rounded-xl border border-neutral-200/80 bg-white p-2.5 dark:border-neutral-800 dark:bg-neutral-900"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <div className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800">
                                        {prod.image_url ? (
                                          <img
                                            src={prod.image_url}
                                            alt={prod.name}
                                            className="h-full w-full object-cover"
                                          />
                                        ) : (
                                          <UtensilsCrossed className="h-3.5 w-3.5 text-neutral-400" />
                                        )}
                                      </div>
                                      <span className="truncate text-xs font-bold text-neutral-900 dark:text-white">
                                        {prod.name}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => selectAllProductVariants(prod)}
                                      className="shrink-0 text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400"
                                    >
                                      {allSelected ? "Bỏ chọn hết" : "Chọn tất cả"}
                                    </button>
                                  </div>

                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {prod.variants.map((v) => {
                                      const picked = selectedVariantIds.has(v.id);
                                      return (
                                        <button
                                          key={v.id}
                                          type="button"
                                          onClick={() =>
                                            toggleVariantSelection(prod, v)
                                          }
                                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                            picked
                                              ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                                              : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                                          }`}
                                        >
                                          {picked && <Check className="h-3 w-3" />}
                                          <span>{v.variant_name}</span>
                                          <span className="opacity-75 tabular-nums">
                                            {Number(v.default_price || 0).toLocaleString(
                                              "vi-VN"
                                            )}
                                            đ
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>

                      {/* Selected Variants Pricing Table + Bulk Bar */}
                      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-neutral-200/80 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                            <Layers className="h-3.5 w-3.5" />
                            4. Cấu hình giá theo từng Variant
                          </span>

                          {/* Quick Bulk Apply */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <div className="w-32">
                              <BeSelect
                                value={bulkType}
                                onValueChange={(v) =>
                                  setBulkType(v as PromoDiscountType)
                                }
                                options={[
                                  { value: "percentage", label: "Giảm %" },
                                  { value: "fixed", label: "Giảm tiền" },
                                  { value: "override_price", label: "Đồng giá" },
                                ]}
                              />
                            </div>
                            <div className="w-24">
                              <BeInput
                                inputMode="numeric"
                                value={
                                  bulkDigits
                                    ? bulkType === "percentage"
                                      ? bulkDigits
                                      : Number(bulkDigits).toLocaleString("vi-VN")
                                    : ""
                                }
                                onChange={(val) => {
                                  let digits = val.replace(/\D/g, "");
                                  if (
                                    bulkType === "percentage" &&
                                    Number(digits) > 100
                                  ) {
                                    digits = "100";
                                  }
                                  setBulkDigits(digits);
                                }}
                                placeholder="20"
                                rightIcon={
                                  <span className="text-[10px] font-bold">
                                    {bulkType === "percentage" ? "%" : "đ"}
                                  </span>
                                }
                              />
                            </div>
                            <BeButton
                              variant="secondary"
                              size="sm"
                              onClick={applyBulkRuleToSelected}
                            >
                              Áp dụng tất cả
                            </BeButton>
                          </div>
                        </div>

                        {draftItems.length === 0 ? (
                          <div className="flex flex-1 min-h-[140px] flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-white/60 p-6 text-center text-xs text-neutral-400 dark:border-neutral-800 dark:bg-neutral-950/30">
                            Chọn các variant ở mục 3 để cấu hình mức giảm hoặc giá khuyến mãi riêng cho từng variant.
                          </div>
                        ) : (
                          <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                            {draftItems.map((it) => {
                              const numVal = Number(it.discount_value_digits || 0);
                              const finalPrice = computePromoPrice(
                                it.base_price,
                                it.discount_type,
                                numVal
                              );
                              return (
                                <div
                                  key={it.variant_id}
                                  className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-neutral-200/80 bg-white px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-900"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="truncate text-xs font-bold text-neutral-900 dark:text-white">
                                        {it.product_name}
                                      </span>
                                      <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                                        {it.variant_name}
                                      </span>
                                    </div>
                                    <div className="mt-0.5 text-[11px] tabular-nums text-neutral-500">
                                      Giá gốc:{" "}
                                      <span className="line-through">
                                        {it.base_price.toLocaleString("vi-VN")}đ
                                      </span>{" "}
                                      →{" "}
                                      <strong className="text-emerald-600 dark:text-emerald-400">
                                        {finalPrice.toLocaleString("vi-VN")}đ
                                      </strong>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1.5">
                                    <div className="w-28">
                                      <BeSelect
                                        value={it.discount_type}
                                        onValueChange={(v) => {
                                          const nextType = v as PromoDiscountType;
                                          setDraftItems((prev) =>
                                            prev.map((row) =>
                                              row.variant_id === it.variant_id
                                                ? {
                                                    ...row,
                                                    discount_type: nextType,
                                                    discount_value_digits:
                                                      nextType === "percentage" &&
                                                      Number(
                                                        row.discount_value_digits
                                                      ) > 100
                                                        ? "100"
                                                        : row.discount_value_digits,
                                                  }
                                                : row
                                            )
                                          );
                                        }}
                                        options={[
                                          { value: "percentage", label: "Giảm %" },
                                          { value: "fixed", label: "Giảm đ" },
                                          {
                                            value: "override_price",
                                            label: "Đồng giá",
                                          },
                                        ]}
                                      />
                                    </div>
                                    <div className="w-24">
                                      <BeInput
                                        inputMode="numeric"
                                        value={
                                          it.discount_value_digits
                                            ? it.discount_type === "percentage"
                                              ? it.discount_value_digits
                                              : Number(
                                                  it.discount_value_digits
                                                ).toLocaleString("vi-VN")
                                            : ""
                                        }
                                        onChange={(val) => {
                                          let digits = val.replace(/\D/g, "");
                                          if (
                                            it.discount_type === "percentage" &&
                                            Number(digits) > 100
                                          ) {
                                            digits = "100";
                                          }
                                          setDraftItems((prev) =>
                                            prev.map((row) =>
                                              row.variant_id === it.variant_id
                                                ? {
                                                    ...row,
                                                    discount_value_digits: digits,
                                                  }
                                                : row
                                            )
                                          );
                                        }}
                                        rightIcon={
                                          <span className="text-[10px] font-bold">
                                            {it.discount_type === "percentage"
                                              ? "%"
                                              : "đ"}
                                          </span>
                                        }
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setDraftItems((prev) =>
                                          prev.filter(
                                            (row) => row.variant_id !== it.variant_id
                                          )
                                        )
                                      }
                                      title="Gỡ variant"
                                      className="grid h-8 w-8 place-items-center rounded-lg text-neutral-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
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
                    disabled={saving || !name.trim() || draftItems.length === 0}
                  >
                    <Check className="h-3.5 w-3.5" />
                    {saving
                      ? "Đang lưu..."
                      : editing
                        ? "Lưu thay đổi"
                        : "Tạo Chương Trình"}
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
