"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Smartphone,
  Store as StoreIcon,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { OverflowActions, type OverflowActionItem } from "./motion/overflow-actions";
import { BeSwitch } from "./motion/switch";
import { Skeleton } from "./ui/skeleton";
import type {
  DeviceRecord,
  StoreMenuItem,
  StoreRecord,
} from "./stores-master-detail-view";
import type { ProductRecord } from "./catalog-products-view";
import type { OptionGroupRecord } from "./catalog-options-view";

interface MenuSetupViewProps {
  stores: StoreRecord[];
  categories: { id: string; name: string }[];
  products?: ProductRecord[];
  optionGroups?: OptionGroupRecord[];
  selectedStoreId: string;
  accessToken: string | null;
  apiFetch: (path: string, options?: RequestInit) => Promise<any>;
  notify: (type: "success" | "error" | "info", text: string) => void;
}

type SelectionTarget =
  | { kind: "store"; storeId: string }
  | { kind: "device"; deviceId: string; storeId: string };

type MenuCardItem = StoreMenuItem & {
  store_is_available?: boolean;
  store_price_override?: string | null;
};

const PASTEL_PILL_STYLES = [
  "bg-orange-50 text-orange-700 border-orange-200/70 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900/60",
  "bg-emerald-50 text-emerald-700 border-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60",
  "bg-sky-50 text-sky-700 border-sky-200/70 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900/60",
  "bg-rose-50 text-rose-700 border-rose-200/70 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60",
  "bg-violet-50 text-violet-700 border-violet-200/70 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900/60",
  "bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60",
];

export function MenuSetupView({
  stores,
  categories,
  products = [],
  optionGroups = [],
  selectedStoreId,
  accessToken,
  apiFetch,
  notify,
}: MenuSetupViewProps) {
  const [treeSearch, setTreeSearch] = useState("");
  const [allDevices, setAllDevices] = useState<DeviceRecord[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);

  const [selection, setSelection] = useState<SelectionTarget>(() => ({
    kind: "store",
    storeId: selectedStoreId || stores[0]?.id || "",
  }));

  // Store Menu State
  const [menuItems, setMenuItems] = useState<MenuCardItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuSaving, setMenuSaving] = useState(false);
  const [menuSearch, setMenuSearch] = useState("");
  const [menuFilter, setMenuFilter] = useState<"all" | "available" | "hidden">("all");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");

  // Device Filter State
  const [deviceMenuMode, setDeviceMenuMode] = useState<"inherit_store" | "custom">(
    "inherit_store"
  );
  const [deviceAllowedCats, setDeviceAllowedCats] = useState<string[]>([]);
  const [deviceMenuItems, setDeviceMenuItems] = useState<MenuCardItem[]>([]);
  const [deviceMenuLoading, setDeviceMenuLoading] = useState(false);
  const [deviceMenuSearch, setDeviceMenuSearch] = useState("");
  const [deviceMenuFilter, setDeviceMenuFilter] = useState<"all" | "available" | "hidden">("all");
  const [deviceCategoryFilter, setDeviceCategoryFilter] = useState<string>("all");
  const [deviceSaving, setDeviceSaving] = useState(false);

  // Product Detail & Options Modal
  const [detailProductId, setDetailProductId] = useState<string | null>(null);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [priceFilter, setPriceFilter] = useState<"all" | "custom_price">("all");
  const categoryStripRef = useRef<HTMLDivElement | null>(null);
  const [canScrollCatLeft, setCanScrollCatLeft] = useState(false);
  const [canScrollCatRight, setCanScrollCatRight] = useState(false);

  const updateCategoryScrollState = useCallback(() => {
    const el = categoryStripRef.current;
    if (!el) return;
    setCanScrollCatLeft(el.scrollLeft > 4);
    setCanScrollCatRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateCategoryScrollState();
    window.addEventListener("resize", updateCategoryScrollState);
    return () => window.removeEventListener("resize", updateCategoryScrollState);
  }, [updateCategoryScrollState, categories.length, selection.kind, deviceMenuMode]);

  const slideCategories = (direction: "left" | "right") => {
    const el = categoryStripRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction === "right" ? 280 : -280,
      behavior: "smooth",
    });
  };

  const productLookup = useMemo(() => {
    const map = new Map<string, ProductRecord>();
    for (const p of products) map.set(p.id, p);
    return map;
  }, [products]);

  const optionGroupLookup = useMemo(() => {
    const map = new Map<string, OptionGroupRecord>();
    for (const g of optionGroups) map.set(g.id, g);
    return map;
  }, [optionGroups]);

  const categoryLookup = useMemo(() => {
    const map = new Map<string, { id: string; name: string; idx: number }>();
    categories.forEach((c, idx) => map.set(c.id, { ...c, idx }));
    return map;
  }, [categories]);

  const loadAllDevices = useCallback(async () => {
    if (!accessToken) return;
    setLoadingDevices(true);
    try {
      const res = await apiFetch("/api/v1/devices");
      const list = Array.isArray(res)
        ? (res as DeviceRecord[])
        : Array.isArray(res?.data)
          ? (res.data as DeviceRecord[])
          : Array.isArray(res?.items)
            ? (res.items as DeviceRecord[])
            : [];
      setAllDevices(list);
    } catch {
      setAllDevices([]);
    } finally {
      setLoadingDevices(false);
    }
  }, [accessToken, apiFetch]);

  useEffect(() => {
    void loadAllDevices();
  }, [loadAllDevices]);

  useEffect(() => {
    if (!selection.storeId && stores.length > 0) {
      setSelection({
        kind: "store",
        storeId: selectedStoreId || stores[0].id,
      });
    }
  }, [stores, selectedStoreId, selection.storeId]);

  const activeStore = useMemo(
    () => stores.find((s) => s.id === selection.storeId) || stores[0] || null,
    [stores, selection.storeId]
  );

  const activeDevice = useMemo(() => {
    if (selection.kind !== "device") return null;
    return allDevices.find((d) => d.id === selection.deviceId) || null;
  }, [selection, allDevices]);

  useEffect(() => {
    if (selection.kind !== "store" || !activeStore || !accessToken) return;
    let cancelled = false;
    setMenuLoading(true);
    setSelectedCategoryFilter("all");
    apiFetch(`/api/v1/stores/${activeStore.id}/menu`)
      .then((res) => {
        if (!cancelled) {
          const items = Array.isArray(res?.items)
            ? res.items
            : Array.isArray(res?.data?.items)
              ? res.data.items
              : [];
          setMenuItems(items);
        }
      })
      .catch(() => {
        if (!cancelled) setMenuItems([]);
      })
      .finally(() => {
        if (!cancelled) setMenuLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selection.kind, activeStore?.id, accessToken, apiFetch]);

  useEffect(() => {
    if (selection.kind !== "device" || !activeDevice || !accessToken) return;
    let cancelled = false;
    setDeviceMenuLoading(true);
    setDeviceCategoryFilter("all");
    apiFetch(`/api/v1/devices/${activeDevice.id}/menu`)
      .then((res) => {
        if (cancelled) return;
        const data = res?.items ? res : res?.data || res || {};
        setDeviceMenuMode(
          data.menu_mode === "custom" ? "custom" : "inherit_store"
        );
        setDeviceAllowedCats(
          Array.isArray(data.allowed_category_ids)
            ? data.allowed_category_ids
            : []
        );
        setDeviceMenuItems(Array.isArray(data.items) ? data.items : []);
      })
      .catch(() => {
        if (!cancelled) {
          setDeviceMenuMode(
            activeDevice.menu_mode === "custom" ? "custom" : "inherit_store"
          );
          setDeviceAllowedCats(activeDevice.allowed_category_ids || []);
          setDeviceMenuItems([]);
        }
      })
      .finally(() => {
        if (!cancelled) setDeviceMenuLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selection.kind, activeDevice?.id, accessToken, apiFetch]);

  const filteredTreeStores = useMemo(() => {
    const q = treeSearch.trim().toLowerCase();
    const sorted = [...stores].sort((a, b) => a.name.localeCompare(b.name, "vi"));
    if (!q) return sorted;
    return sorted.filter((s) => {
      const storeMatches =
        s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q);
      const devMatches = allDevices.some(
        (d) =>
          d.store_id === s.id &&
          (d.name.toLowerCase().includes(q) ||
            (d.serial_number || "").toLowerCase().includes(q))
      );
      return storeMatches || devMatches;
    });
  }, [stores, allDevices, treeSearch]);

  const filteredMenuItems = useMemo(() => {
    const q = menuSearch.trim().toLowerCase();
    return menuItems.filter((item) => {
      if (
        selectedCategoryFilter !== "all" &&
        !item.category_ids.includes(selectedCategoryFilter)
      ) {
        return false;
      }
      if (menuFilter === "available" && !item.is_available) return false;
      if (menuFilter === "hidden" && item.is_available) return false;
      if (
        priceFilter === "custom_price" &&
        (item.price_override === null ||
          String(item.price_override).trim() === "")
      ) {
        return false;
      }
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q)
      );
    });
  }, [menuItems, selectedCategoryFilter, menuSearch, menuFilter, priceFilter]);

  const filteredDeviceMenuItems = useMemo(() => {
    const q = deviceMenuSearch.trim().toLowerCase();
    return deviceMenuItems.filter((item) => {
      if (
        deviceAllowedCats.length > 0 &&
        !item.category_ids.some((cid) => deviceAllowedCats.includes(cid))
      ) {
        return false;
      }
      if (
        deviceCategoryFilter !== "all" &&
        !item.category_ids.includes(deviceCategoryFilter)
      ) {
        return false;
      }
      if (deviceMenuFilter === "available" && !item.is_available) return false;
      if (deviceMenuFilter === "hidden" && item.is_available) return false;
      if (
        priceFilter === "custom_price" &&
        (item.price_override === null ||
          String(item.price_override).trim() === "")
      ) {
        return false;
      }
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q)
      );
    });
  }, [
    deviceMenuItems,
    deviceAllowedCats,
    deviceCategoryFilter,
    deviceMenuSearch,
    deviceMenuFilter,
    priceFilter,
  ]);

  const handleSaveStoreMenu = async () => {
    if (!activeStore) return;
    setMenuSaving(true);
    try {
      await apiFetch(`/api/v1/stores/${activeStore.id}/menu`, {
        method: "PUT",
        body: JSON.stringify({
          items: menuItems.map((it) => ({
            product_id: it.product_id,
            is_available: it.is_available,
            price_override:
              it.price_override !== null &&
              String(it.price_override).trim() !== ""
                ? String(it.price_override).trim()
                : null,
          })),
        }),
      });
      notify("success", `Đã lưu thực đơn cho "${activeStore.name}"!`);
    } catch (err: any) {
      notify("error", err?.message || "Không thể lưu thực đơn chi nhánh");
    } finally {
      setMenuSaving(false);
    }
  };

  const handleSaveDeviceFilter = async () => {
    if (!activeDevice) return;
    setDeviceSaving(true);
    try {
      await apiFetch(`/api/v1/devices/${activeDevice.id}/menu`, {
        method: "PUT",
        body: JSON.stringify({
          menu_mode: deviceMenuMode,
          allowed_category_ids:
            deviceMenuMode === "custom" ? deviceAllowedCats : [],
          items:
            deviceMenuMode === "custom"
              ? deviceMenuItems.map((it) => ({
                  product_id: it.product_id,
                  is_available: it.is_available,
                  price_override:
                    it.price_override !== null &&
                    String(it.price_override).trim() !== ""
                      ? String(it.price_override).trim()
                      : null,
                }))
              : [],
        }),
      });
      notify("success", `Đã cập nhật thực đơn cho "${activeDevice.name}"!`);
      await loadAllDevices();
    } catch (err: any) {
      notify("error", err?.message || "Không thể lưu cấu hình thiết bị");
    } finally {
      setDeviceSaving(false);
    }
  };

  const handleCopyFromDevice = async (sourceDeviceId: string) => {
    if (!sourceDeviceId || !accessToken) return;
    try {
      const res = await apiFetch(`/api/v1/devices/${sourceDeviceId}/menu`);
      const data = res?.items ? res : res?.data || res || {};
      setDeviceMenuMode("custom");
      setDeviceAllowedCats(
        Array.isArray(data.allowed_category_ids) ? data.allowed_category_ids : []
      );
      if (Array.isArray(data.items)) {
        setDeviceMenuItems(data.items);
      }
      notify("info", "Đã sao chép cấu hình menu từ máy đã chọn. Nhấn Lưu để áp dụng.");
    } catch {
      notify("error", "Không thể tải menu từ máy nguồn");
    }
  };

  const toggleItemAvailability = (productId: string, next: boolean) => {
    if (selection.kind === "device") {
      setDeviceMenuItems((prev) =>
        prev.map((x) =>
          x.product_id === productId ? { ...x, is_available: next } : x
        )
      );
    } else {
      setMenuItems((prev) =>
        prev.map((x) =>
          x.product_id === productId ? { ...x, is_available: next } : x
        )
      );
    }
  };

  const updateItemPriceOverride = (productId: string, val: string) => {
    const nextVal = val === "" ? null : val;
    if (selection.kind === "device") {
      setDeviceMenuItems((prev) =>
        prev.map((x) =>
          x.product_id === productId ? { ...x, price_override: nextVal } : x
        )
      );
    } else {
      setMenuItems((prev) =>
        prev.map((x) =>
          x.product_id === productId ? { ...x, price_override: nextVal } : x
        )
      );
    }
  };

  const renderCategoryStrip = (
    items: MenuCardItem[],
    activeCatId: string,
    onSelectCat: (catId: string) => void
  ) => {
    const hasOverflow = canScrollCatLeft || canScrollCatRight;
    const handleCategoryClick = (
      catId: string,
      e: React.MouseEvent<HTMLButtonElement>
    ) => {
      onSelectCat(catId);
      e.currentTarget.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    };

    return (
      <div className="relative flex shrink-0 items-center gap-1.5">
        {hasOverflow && (
          <button
            type="button"
            disabled={!canScrollCatLeft}
            onClick={() => slideCategories("left")}
            title="Trượt sang trái"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-neutral-200 bg-white text-neutral-600 shadow-sm transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-35 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        <div
          ref={categoryStripRef}
          onScroll={updateCategoryScrollState}
          className="flex min-w-0 flex-1 gap-2 overflow-x-auto scroll-smooth py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* All Menu Card (No Icon, Full Name) */}
          <button
            type="button"
            onClick={(e) => handleCategoryClick("all", e)}
            className={`shrink-0 rounded-2xl border px-4 py-2.5 text-left transition-all ${
              activeCatId === "all"
                ? "border-blue-600 bg-blue-50/70 shadow-sm dark:border-blue-400 dark:bg-blue-950/35"
                : "border-neutral-200/80 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-950/60"
            }`}
          >
            <div className="whitespace-nowrap">
              <div
                className={`text-xs font-bold ${
                  activeCatId === "all"
                    ? "text-blue-700 dark:text-blue-300"
                    : "text-neutral-900 dark:text-white"
                }`}
              >
                Tất cả Menu
              </div>
              <div className="text-[10px] text-neutral-400">
                {items.length} Món
              </div>
            </div>
          </button>

          {/* Per-Category Cards (No Icon, Full Name, Auto Scroll Into View) */}
          {categories.map((cat) => {
            const count = items.filter((it) =>
              it.category_ids.includes(cat.id)
            ).length;
            const isActive = activeCatId === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={(e) => handleCategoryClick(cat.id, e)}
                className={`shrink-0 rounded-2xl border px-4 py-2.5 text-left transition-all ${
                  isActive
                    ? "border-blue-600 bg-blue-50/70 shadow-sm dark:border-blue-400 dark:bg-blue-950/35"
                    : "border-neutral-200/80 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-950/60"
                }`}
              >
                <div className="whitespace-nowrap">
                  <div
                    className={`text-xs font-bold ${
                      isActive
                        ? "text-blue-700 dark:text-blue-300"
                        : "text-neutral-900 dark:text-white"
                    }`}
                  >
                    {cat.name}
                  </div>
                  <div className="text-[10px] text-neutral-400">{count} Món</div>
                </div>
              </button>
            );
          })}
        </div>

        {hasOverflow && (
          <button
            type="button"
            disabled={!canScrollCatRight}
            onClick={() => slideCategories("right")}
            title="Trượt sang phải"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-neutral-200 bg-white text-neutral-600 shadow-sm transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-35 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  };

  const renderProductCard = (item: MenuCardItem, isDeviceMode: boolean) => {
    const prod = productLookup.get(item.product_id);
    const imgUrl = item.image_url || prod?.image_url || null;
    const firstCatId = item.category_ids[0];
    const catMeta = firstCatId ? categoryLookup.get(firstCatId) : undefined;
    const catPillCls = catMeta
      ? PASTEL_PILL_STYLES[catMeta.idx % PASTEL_PILL_STYLES.length]
      : PASTEL_PILL_STYLES[0];

    const baseDisplay = Number(
      isDeviceMode
        ? item.store_price_override ?? item.base_price ?? 0
        : item.base_price ?? 0
    );
    const hasOverride =
      item.price_override !== null && String(item.price_override).trim() !== "";

    return (
      <div
        key={item.product_id}
        onClick={() => setDetailProductId(item.product_id)}
        className={`group flex aspect-square cursor-pointer flex-col overflow-hidden rounded-2xl border p-2.5 transition-all hover:shadow-md ${
          item.is_available
            ? "border-neutral-200/80 bg-white hover:border-blue-300 dark:border-neutral-800 dark:bg-neutral-950/80 dark:hover:border-neutral-700"
            : "border-neutral-200/60 bg-neutral-100/80 opacity-70 dark:border-neutral-800 dark:bg-neutral-900/40"
        }`}
      >
        {/* Soft Rounded Image Frame (Reference Style) */}
        <div className="relative min-h-0 flex-1 w-full overflow-hidden rounded-xl bg-[#F7F8FA] dark:bg-neutral-800/80">
          {imgUrl ? (
            <img
              src={imgUrl}
              alt={item.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-neutral-300 dark:text-neutral-600">
              <UtensilsCrossed className="h-8 w-8" />
            </div>
          )}

          {/* Quick Toggle Switch in Top-Right */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute right-2 top-2 rounded-full bg-white/90 p-0.5 shadow-sm backdrop-blur dark:bg-neutral-900/90"
          >
            <BeSwitch
              checked={item.is_available}
              onCheckedChange={(checked) =>
                toggleItemAvailability(item.product_id, checked)
              }
              ariaLabel={`Bật tắt ${item.name}`}
            />
          </div>

          {!item.is_available && (
            <span className="absolute left-2 top-2 rounded-full bg-neutral-900/80 px-2 py-0.5 text-[9px] font-bold text-white">
              Đang ẩn
            </span>
          )}

          {isDeviceMode && item.store_is_available === false && (
            <span className="absolute bottom-2 left-2 rounded bg-amber-500/95 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm">
              Ẩn ở Chi nhánh
            </span>
          )}
        </div>

        {/* Clean Minimal Footer: Name + Pastel Category Pill + Price */}
        <div className="mt-2.5 flex shrink-0 flex-col gap-1.5 px-0.5">
          <h3 className="truncate text-xs font-bold text-neutral-900 dark:text-white">
            {item.name}
          </h3>

          <div className="flex items-center justify-between gap-2">
            <span
              className={`max-w-[55%] truncate rounded-md border px-2 py-0.5 text-[10px] font-semibold ${catPillCls}`}
            >
              {catMeta?.name || "Sản phẩm"}
            </span>

            {hasOverride ? (
              <div className="flex items-baseline gap-1">
                <span className="text-xs font-extrabold tabular-nums text-blue-600 dark:text-blue-400">
                  {Number(item.price_override).toLocaleString("vi-VN")}
                </span>
              </div>
            ) : (
              <span className="text-xs font-extrabold tabular-nums text-neutral-900 dark:text-white">
                {baseDisplay.toLocaleString("vi-VN")}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const detailMenuItem = useMemo(() => {
    if (!detailProductId) return null;
    const source = selection.kind === "device" ? deviceMenuItems : menuItems;
    return source.find((x) => x.product_id === detailProductId) || null;
  }, [detailProductId, selection.kind, deviceMenuItems, menuItems]);

  const detailProduct = detailProductId
    ? productLookup.get(detailProductId) || null
    : null;

  return (
    <div className="flex h-full flex-1 min-h-0 flex-col gap-3 overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">
            Thiết lập Menu Chi nhánh &amp; Thiết bị
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Lọc theo danh mục và bấm vào từng thẻ món để xem biến thể, nhóm tùy chọn đi kèm và cấu hình giá riêng.
          </p>
        </div>
      </div>

      {/* Master-Detail Fit-to-Viewport */}
      <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left 3 cols: Store & Device Tree */}
        <div className="flex min-h-0 flex-col rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 lg:col-span-3">
          <div className="mb-3 flex shrink-0 items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Chi nhánh &amp; Thiết bị ({stores.length})
            </span>
          </div>

          <div className="mb-3 flex shrink-0 items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800">
            <Search className="h-3.5 w-3.5 text-neutral-400" />
            <input
              type="text"
              value={treeSearch}
              onChange={(e) => setTreeSearch(e.target.value)}
              placeholder="Tìm chi nhánh hoặc máy POS..."
              className="w-full bg-transparent text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:text-white"
            />
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {filteredTreeStores.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-200 p-6 text-center text-xs text-neutral-400 dark:border-neutral-800">
                Chưa có chi nhánh nào.
              </div>
            ) : (
              filteredTreeStores.map((st) => {
                const storeDevices = allDevices.filter((d) => d.store_id === st.id);
                const isStoreSelected =
                  selection.kind === "store" && selection.storeId === st.id;
                return (
                  <div key={st.id} className="space-y-1">
                    <button
                      type="button"
                      onClick={() =>
                        setSelection({ kind: "store", storeId: st.id })
                      }
                      className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition-colors ${
                        isStoreSelected
                          ? "bg-neutral-900 text-white shadow-sm dark:bg-white dark:text-neutral-900"
                          : "bg-neutral-50 text-neutral-800 hover:bg-neutral-100 dark:bg-neutral-800/60 dark:text-neutral-200 dark:hover:bg-neutral-800"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <StoreIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate text-xs font-bold">
                          {st.name}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          isStoreSelected
                            ? "bg-white/20 text-white dark:bg-neutral-900/15 dark:text-neutral-900"
                            : "bg-neutral-200/80 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"
                        }`}
                      >
                        {storeDevices.length} máy
                      </span>
                    </button>

                    {!loadingDevices && storeDevices.length > 0 && (
                      <div className="ml-4 space-y-1 border-l border-neutral-200 pl-2.5 dark:border-neutral-800">
                        {storeDevices.map((dev) => {
                          const isDevSelected =
                            selection.kind === "device" &&
                            selection.deviceId === dev.id;
                          return (
                            <button
                              key={dev.id}
                              type="button"
                              onClick={() =>
                                setSelection({
                                  kind: "device",
                                  deviceId: dev.id,
                                  storeId: st.id,
                                })
                              }
                              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                                isDevSelected
                                  ? "bg-neutral-900 text-white shadow-sm dark:bg-white dark:text-neutral-900"
                                  : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                              }`}
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <Smartphone className="h-3 w-3 shrink-0" />
                                <span className="truncate text-[11px] font-semibold">
                                  {dev.name}
                                </span>
                              </span>
                              <span
                                className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${
                                  dev.menu_mode === "custom"
                                    ? "bg-blue-500/15 text-blue-600 dark:text-blue-300"
                                    : isDevSelected
                                      ? "bg-white/20 text-white dark:bg-neutral-900/15 dark:text-neutral-900"
                                      : "bg-neutral-200/70 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                                }`}
                              >
                                {dev.menu_mode === "custom"
                                  ? "Menu riêng"
                                  : "Kế thừa"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right 9 cols: Category Cards + Full Search + 4-Col Square Grid */}
        <div className="flex min-h-0 flex-col rounded-2xl border border-neutral-200/80 bg-[#F9FAFB] p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 lg:col-span-9">
          {selection.kind === "device" && activeDevice ? (
            <>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-neutral-700 dark:text-neutral-300" />
                    <h2 className="text-sm font-bold text-neutral-900 dark:text-white">
                      Menu máy POS: {activeDevice.name}
                    </h2>
                  </div>
                  <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                    Thuộc {activeStore?.name || "--"}
                    {activeDevice.serial_number
                      ? ` • S/N: ${activeDevice.serial_number}`
                      : ""}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {deviceMenuMode === "custom" &&
                    allDevices.filter((d) => d.id !== activeDevice.id).length > 0 && (
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val) void handleCopyFromDevice(val);
                          e.target.value = "";
                        }}
                        className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                      >
                        <option value="">Sao chép từ máy khác...</option>
                        {allDevices
                          .filter((d) => d.id !== activeDevice.id)
                          .map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                      </select>
                    )}
                </div>
              </div>

              <div className="mb-3 grid shrink-0 grid-cols-1 gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setDeviceMenuMode("inherit_store")}
                  className={`rounded-2xl border p-3 text-left transition-all ${
                    deviceMenuMode === "inherit_store"
                      ? "border-blue-600 bg-blue-50/70 dark:border-blue-400 dark:bg-blue-950/30"
                      : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-950/60"
                  }`}
                >
                  <div className="text-xs font-bold text-neutral-900 dark:text-white">
                    Kế thừa thực đơn Chi nhánh (Mặc định)
                  </div>
                  <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                    Hiển thị toàn bộ món đang mở bán của chi nhánh.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setDeviceMenuMode("custom")}
                  className={`rounded-2xl border p-3 text-left transition-all ${
                    deviceMenuMode === "custom"
                      ? "border-blue-600 bg-blue-50/70 dark:border-blue-400 dark:bg-blue-950/30"
                      : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-950/60"
                  }`}
                >
                  <div className="text-xs font-bold text-neutral-900 dark:text-white">
                    Menu riêng cho máy này
                  </div>
                  <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                    Chọn lọc danh mục &amp; bật/tắt từng món riêng cho Kiosk/quầy.
                  </p>
                </button>
              </div>

              {deviceMenuMode === "custom" && (
                <>
                  {/* Category Cards Strip */}
                  {renderCategoryStrip(
                    deviceMenuItems,
                    deviceCategoryFilter,
                    setDeviceCategoryFilter
                  )}

                  {/* Full-width Search Bar + Filter Button (matching Products page) */}
                  <div className="mt-2.5 flex shrink-0 flex-wrap items-center gap-2.5">
                    <div className="flex min-w-[220px] flex-1 items-center justify-between gap-2 rounded-2xl border border-neutral-200/80 bg-white px-4 py-2.5 shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
                      <input
                        type="text"
                        value={deviceMenuSearch}
                        onChange={(e) => setDeviceMenuSearch(e.target.value)}
                        placeholder="Tìm kiếm món ăn, đồ uống hoặc mã SP..."
                        className="w-full bg-transparent text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:text-white"
                      />
                      <Search className="h-4 w-4 shrink-0 text-neutral-400" />
                    </div>

                    {(() => {
                      const activeCount =
                        (deviceMenuFilter !== "all" ? 1 : 0) +
                        (priceFilter !== "all" ? 1 : 0);
                      return (
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.97 }}
                          onClick={() => setFilterModalOpen(true)}
                          className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-xs font-semibold shadow-sm transition-all ${
                            activeCount > 0
                              ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                              : "border-neutral-200/80 bg-white text-neutral-700 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                          }`}
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                          <span>Bộ lọc</span>
                          {activeCount > 0 && (
                            <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-neutral-900 dark:bg-neutral-900 dark:text-white">
                              {activeCount}
                            </span>
                          )}
                        </motion.button>
                      );
                    })()}
                  </div>

                  {/* 4-Column Square Product Cards */}
                  <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-20 pr-1">
                    {deviceMenuLoading ? (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((idx) => (
                          <Skeleton
                            key={idx}
                            className="aspect-square w-full rounded-2xl dark:bg-neutral-800"
                          />
                        ))}
                      </div>
                    ) : filteredDeviceMenuItems.length === 0 ? (
                      <div className="flex h-full min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-white/60 p-6 text-xs text-neutral-400 dark:border-neutral-800 dark:bg-neutral-950/30">
                        Không có món nào khớp bộ lọc.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                        {filteredDeviceMenuItems.map((item) =>
                          renderProductCard(item, true)
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          ) : activeStore ? (
            <>
              {/* Category Cards Strip (Reference Style) */}
              {renderCategoryStrip(
                menuItems,
                selectedCategoryFilter,
                setSelectedCategoryFilter
              )}

              {/* Full-width Search Bar + Filter Button (matching Products page) */}
              <div className="mt-2.5 flex shrink-0 flex-wrap items-center gap-2.5">
                <div className="flex min-w-[220px] flex-1 items-center justify-between gap-2 rounded-2xl border border-neutral-200/80 bg-white px-4 py-2.5 shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
                  <input
                    type="text"
                    value={menuSearch}
                    onChange={(e) => setMenuSearch(e.target.value)}
                    placeholder="Tìm kiếm món ăn, đồ uống hoặc mã SP..."
                    className="w-full bg-transparent text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:text-white"
                  />
                  <Search className="h-4 w-4 shrink-0 text-neutral-400" />
                </div>

                {(() => {
                  const activeCount =
                    (menuFilter !== "all" ? 1 : 0) +
                    (priceFilter !== "all" ? 1 : 0);
                  return (
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setFilterModalOpen(true)}
                      className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-xs font-semibold shadow-sm transition-all ${
                        activeCount > 0
                          ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                          : "border-neutral-200/80 bg-white text-neutral-700 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                      }`}
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      <span>Bộ lọc</span>
                      {activeCount > 0 && (
                        <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-neutral-900 dark:bg-neutral-900 dark:text-white">
                          {activeCount}
                        </span>
                      )}
                    </motion.button>
                  );
                })()}
              </div>

              {/* 4-Column Square Product Cards */}
              <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-20 pr-1">
                {menuLoading ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((idx) => (
                      <Skeleton
                        key={idx}
                        className="aspect-square w-full rounded-2xl dark:bg-neutral-800"
                      />
                    ))}
                  </div>
                ) : filteredMenuItems.length === 0 ? (
                  <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-white/60 p-8 text-center text-xs text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950/30">
                    Không có sản phẩm nào phù hợp.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {filteredMenuItems.map((item) =>
                      renderProductCard(item, false)
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-neutral-400">
              Chọn một chi nhánh hoặc thiết bị ở cột bên trái để thiết lập menu.
            </div>
          )}
        </div>
      </div>

      {/* MODAL: PRODUCT DETAIL, VARIANTS & ATTACHED OPTIONS */}
      <AnimatePresence>
        {detailMenuItem && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDetailProductId(null)}
              className="fixed inset-0 z-[80] bg-black/30 [backdrop-filter:blur(8px)]"
            />
            <div className="pointer-events-none fixed inset-4 z-[81] flex items-center justify-center">
              <motion.div
                initial={{ opacity: 0, y: 18, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
                className="pointer-events-auto flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-neutral-200/80 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950"
              >
                {/* Modal Header with Image */}
                <div className="flex items-start justify-between gap-4 border-b border-neutral-200/80 p-5 dark:border-neutral-800">
                  <div className="flex min-w-0 items-center gap-3.5">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-neutral-200 bg-[#F7F8FA] dark:border-neutral-800 dark:bg-neutral-900">
                      {detailMenuItem.image_url || detailProduct?.image_url ? (
                        <img
                          src={
                            detailMenuItem.image_url ||
                            detailProduct?.image_url ||
                            ""
                          }
                          alt={detailMenuItem.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-neutral-400">
                          <UtensilsCrossed className="h-6 w-6" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-bold text-neutral-900 dark:text-white">
                        {detailMenuItem.name}
                      </h3>
                      <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                        {detailMenuItem.code} • Giá gốc:{" "}
                        {Number(detailMenuItem.base_price || 0).toLocaleString(
                          "vi-VN"
                        )}
                        ₫
                      </p>
                      {detailProduct?.description && (
                        <p className="mt-1 line-clamp-2 text-[11px] text-neutral-400">
                          {detailProduct.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetailProductId(null)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Modal Body */}
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex items-center justify-between rounded-2xl border border-neutral-200/80 bg-neutral-50/70 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
                      <div>
                        <div className="text-xs font-bold text-neutral-900 dark:text-white">
                          {selection.kind === "device"
                            ? "Hiển thị trên máy này"
                            : "Mở bán tại chi nhánh"}
                        </div>
                        <div className="text-[11px] text-neutral-400">
                          Bật/tắt trạng thái bán của món
                        </div>
                      </div>
                      <BeSwitch
                        checked={detailMenuItem.is_available}
                        onCheckedChange={(checked) =>
                          toggleItemAvailability(
                            detailMenuItem.product_id,
                            checked
                          )
                        }
                        ariaLabel="Bật tắt món"
                      />
                    </div>

                    <div className="rounded-2xl border border-neutral-200/80 bg-neutral-50/70 px-4 py-2.5 dark:border-neutral-800 dark:bg-neutral-900">
                      <label className="block text-[11px] font-bold text-neutral-700 dark:text-neutral-300">
                        {selection.kind === "device"
                          ? "Giá riêng trên máy (để trống = giá chi nhánh)"
                          : "Giá riêng chi nhánh (để trống = giá gốc)"}
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={detailMenuItem.price_override ?? ""}
                        onChange={(e) =>
                          updateItemPriceOverride(
                            detailMenuItem.product_id,
                            e.target.value
                          )
                        }
                        placeholder="Nhập giá bán riêng..."
                        className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                      />
                    </div>
                  </div>

                  {/* Variants & Attached Option Groups */}
                  {detailProduct?.variants && detailProduct.variants.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-neutral-900 dark:text-white">
                        <Layers className="h-3.5 w-3.5" />
                        Biến thể &amp; Nhóm tùy chọn đi kèm (
                        {detailProduct.variants.length})
                      </div>

                      <div className="space-y-2.5">
                        {detailProduct.variants.map((v, idx) => {
                          const attachedGroups = (v.option_group_ids || [])
                            .map((gid) => optionGroupLookup.get(gid))
                            .filter(Boolean) as OptionGroupRecord[];
                          return (
                            <div
                              key={v.id || idx}
                              className="rounded-2xl border border-neutral-200/80 bg-neutral-50/50 p-3.5 dark:border-neutral-800 dark:bg-neutral-900/50"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <span className="text-xs font-bold text-neutral-900 dark:text-white">
                                    {v.variant_name}
                                  </span>
                                  <span className="ml-2 font-mono text-[11px] text-neutral-400">
                                    {v.sku}
                                  </span>
                                </div>
                                <span className="text-xs font-extrabold text-neutral-900 dark:text-white">
                                  {Number(v.default_price || 0).toLocaleString(
                                    "vi-VN"
                                  )}
                                  ₫
                                </span>
                              </div>

                              {attachedGroups.length > 0 ? (
                                <div className="mt-2.5 space-y-2 border-t border-neutral-200/70 pt-2.5 dark:border-neutral-800">
                                  {attachedGroups.map((grp) => (
                                    <div key={grp.id} className="space-y-1">
                                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                                        <SlidersHorizontal className="h-3 w-3 text-neutral-400" />
                                        <span>{grp.name}</span>
                                        <span className="text-[10px] font-normal text-neutral-400">
                                          (
                                          {grp.is_required
                                            ? "Bắt buộc"
                                            : "Tùy chọn"}
                                          {" • "}
                                          {grp.selection_mode === "single"
                                            ? "Chọn 1"
                                            : "Chọn nhiều"}
                                          )
                                        </span>
                                      </div>
                                      <div className="flex flex-wrap gap-1.5 pl-4">
                                        {grp.items.map((opt, i) => (
                                          <span
                                            key={opt.id || i}
                                            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] ${
                                              opt.is_default
                                                ? "border-blue-200 bg-blue-50 font-semibold text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300"
                                                : "border-neutral-200 bg-white text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                                            }`}
                                          >
                                            <span>{opt.name}</span>
                                            {Number(opt.price_delta) > 0 && (
                                              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                                +
                                                {Number(
                                                  opt.price_delta
                                                ).toLocaleString("vi-VN")}
                                                ₫
                                              </span>
                                            )}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="mt-1.5 text-[11px] text-neutral-400">
                                  Không có nhóm tùy chọn đi kèm.
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-between border-t border-neutral-200/80 px-5 py-3.5 dark:border-neutral-800">
                  <span className="text-[11px] text-neutral-400">
                    Thay đổi được lưu khi bấm nút Lưu ở thanh nổi phía dưới.
                  </span>
                  <button
                    type="button"
                    onClick={() => setDetailProductId(null)}
                    className="rounded-full bg-neutral-900 px-5 py-2 text-xs font-bold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900"
                  >
                    Xong
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* MODAL: FILTER (matching CatalogProductsView) */}
      <AnimatePresence>
        {filterModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setFilterModalOpen(false)}
              className="fixed inset-0 z-[80] bg-black/25 [backdrop-filter:blur(8px)]"
            />
            <div className="pointer-events-none fixed inset-4 z-[81] flex items-center justify-center">
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
                className="pointer-events-auto flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-neutral-200/80 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950"
              >
                <div className="flex items-center justify-between border-b border-neutral-200/80 px-5 py-4 dark:border-neutral-800">
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                      Bộ lọc Thực đơn
                    </h3>
                    <p className="text-[11px] text-neutral-400">
                      Lọc món theo trạng thái bán hoặc giá riêng.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFilterModalOpen(false)}
                    className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-4 p-5">
                  <div>
                    <label className="mb-2 block text-xs font-bold text-neutral-700 dark:text-neutral-300">
                      Trạng thái bán
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { id: "all", label: "Tất cả" },
                          { id: "available", label: "Đang bán" },
                          { id: "hidden", label: "Đang ẩn" },
                        ] as const
                      ).map((opt) => {
                        const active =
                          (selection.kind === "device"
                            ? deviceMenuFilter
                            : menuFilter) === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              if (selection.kind === "device") {
                                setDeviceMenuFilter(opt.id);
                              } else {
                                setMenuFilter(opt.id);
                              }
                            }}
                            className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
                              active
                                ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                                : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-bold text-neutral-700 dark:text-neutral-300">
                      Cấu hình giá
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          { id: "all", label: "Tất cả mức giá" },
                          { id: "custom_price", label: "Có giá riêng" },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setPriceFilter(opt.id)}
                          className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
                            priceFilter === opt.id
                              ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                              : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-neutral-200/80 px-5 py-3.5 dark:border-neutral-800">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuFilter("all");
                      setDeviceMenuFilter("all");
                      setPriceFilter("all");
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Đặt lại
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterModalOpen(false)}
                    className="rounded-full bg-neutral-900 px-5 py-2 text-xs font-bold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900"
                  >
                    Áp dụng
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Floating beUI OverflowActions Bar (matching CatalogProductsView) */}
      {(activeStore || activeDevice) && (() => {
        const isDeviceTarget = selection.kind === "device" && Boolean(activeDevice);
        const isBusy = isDeviceTarget ? deviceSaving : menuSaving || menuLoading;
        const primaryActions: OverflowActionItem[] = [
          {
            id: "save-menu",
            label: isDeviceTarget
              ? deviceSaving
                ? "Đang lưu..."
                : "Lưu Cấu Hình Máy"
              : menuSaving
                ? "Đang lưu..."
                : "Lưu Thực Đơn",
            icon: <Check className="h-4 w-4" />,
            variant: "primary",
            disabled: isBusy,
            onClick: () => {
              if (isDeviceTarget) {
                void handleSaveDeviceFilter();
              } else {
                void handleSaveStoreMenu();
              }
            },
          },
        ];

        const overflowActions: OverflowActionItem[] = [
          {
            id: "reset-filters",
            label: "Đặt lại bộ lọc",
            icon: <RotateCcw className="h-4 w-4" />,
            onClick: () => {
              setSelectedCategoryFilter("all");
              setDeviceCategoryFilter("all");
              setMenuSearch("");
              setDeviceMenuSearch("");
              setMenuFilter("all");
              setDeviceMenuFilter("all");
              setPriceFilter("all");
            },
          },
        ];

        return (
          <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center md:pl-[244px]">
            <OverflowActions
              className="pointer-events-auto"
              primaryActions={primaryActions}
              overflowActions={overflowActions}
            />
          </div>
        );
      })()}
    </div>
  );
}
