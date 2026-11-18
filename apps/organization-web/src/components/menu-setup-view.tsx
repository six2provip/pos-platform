"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Search,
  Smartphone,
  Store as StoreIcon,
  UtensilsCrossed,
} from "lucide-react";
import { BeSwitch } from "./motion/switch";
import { Skeleton } from "./ui/skeleton";
import type {
  DeviceRecord,
  StoreMenuItem,
  StoreRecord,
} from "./stores-master-detail-view";

interface MenuSetupViewProps {
  stores: StoreRecord[];
  categories: { id: string; name: string }[];
  selectedStoreId: string;
  accessToken: string | null;
  apiFetch: (path: string, options?: RequestInit) => Promise<any>;
  notify: (type: "success" | "error" | "info", text: string) => void;
}

type SelectionTarget =
  | { kind: "store"; storeId: string }
  | { kind: "device"; deviceId: string; storeId: string };

export function MenuSetupView({
  stores,
  categories,
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
  const [menuItems, setMenuItems] = useState<StoreMenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuSaving, setMenuSaving] = useState(false);
  const [menuSearch, setMenuSearch] = useState("");
  const [menuFilter, setMenuFilter] = useState<"all" | "available" | "hidden">("all");

  // Device Filter State
  const [deviceMenuMode, setDeviceMenuMode] = useState<"inherit_store" | "custom">(
    "inherit_store"
  );
  const [deviceAllowedCats, setDeviceAllowedCats] = useState<string[]>([]);
  const [deviceMenuItems, setDeviceMenuItems] = useState<
    (StoreMenuItem & { store_is_available?: boolean; store_price_override?: string | null })[]
  >([]);
  const [deviceMenuLoading, setDeviceMenuLoading] = useState(false);
  const [deviceMenuSearch, setDeviceMenuSearch] = useState("");
  const [deviceMenuFilter, setDeviceMenuFilter] = useState<"all" | "available" | "hidden">("all");
  const [deviceSaving, setDeviceSaving] = useState(false);

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
      if (menuFilter === "available" && !item.is_available) return false;
      if (menuFilter === "hidden" && item.is_available) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q)
      );
    });
  }, [menuItems, menuSearch, menuFilter]);

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

  const filteredDeviceMenuItems = useMemo(() => {
    const q = deviceMenuSearch.trim().toLowerCase();
    return deviceMenuItems.filter((item) => {
      if (
        deviceAllowedCats.length > 0 &&
        !item.category_ids.some((cid) => deviceAllowedCats.includes(cid))
      ) {
        return false;
      }
      if (deviceMenuFilter === "available" && !item.is_available) return false;
      if (deviceMenuFilter === "hidden" && item.is_available) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q)
      );
    });
  }, [deviceMenuItems, deviceAllowedCats, deviceMenuSearch, deviceMenuFilter]);

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

  return (
    <div className="flex h-full flex-1 min-h-0 flex-col gap-3 overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">
            Thiết lập Menu Chi nhánh &amp; Thiết bị
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Mặc định thiết bị POS kế thừa toàn bộ thực đơn của Chi nhánh. Bạn có thể bật/tắt món theo Chi nhánh hoặc lọc danh mục riêng cho từng máy Kiosk.
          </p>
        </div>
      </div>

      {/* Master-Detail Fit-to-Viewport */}
      <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left 4 cols: Store & Device Tree */}
        <div className="flex min-h-0 flex-col rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 lg:col-span-4">
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
                                  ? `${(dev.allowed_category_ids || []).length} DM`
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

        {/* Right 8 cols: Store Menu OR Device Menu Filter */}
        <div className="flex min-h-0 flex-col rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 lg:col-span-8">
          {selection.kind === "device" && activeDevice ? (
            <>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-neutral-200/70 pb-4 dark:border-neutral-800">
                <div>
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-neutral-700 dark:text-neutral-300" />
                    <h2 className="text-sm font-bold text-neutral-900 dark:text-white">
                      Thiết lập Menu cho máy: {activeDevice.name}
                    </h2>
                  </div>
                  <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                    Thuộc {activeStore?.name || "--"}
                    {activeDevice.serial_number
                      ? ` • S/N: ${activeDevice.serial_number}`
                      : ""}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={deviceSaving}
                  onClick={handleSaveDeviceFilter}
                  className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
                >
                  <Check className="h-3.5 w-3.5" />
                  {deviceSaving ? "Đang lưu..." : "Lưu Cấu Hình Máy"}
                </button>
              </div>

              <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setDeviceMenuMode("inherit_store")}
                    className={`rounded-2xl border p-4 text-left transition-all ${
                      deviceMenuMode === "inherit_store"
                        ? "border-neutral-900 bg-neutral-50 ring-1 ring-neutral-900/10 dark:border-white dark:bg-neutral-800/70"
                        : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-800"
                    }`}
                  >
                    <div className="text-xs font-bold text-neutral-900 dark:text-white">
                      Kế thừa thực đơn Chi nhánh (Mặc định)
                    </div>
                    <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                      Hiển thị toàn bộ món đang mở bán và áp dụng giá của chi nhánh.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeviceMenuMode("custom")}
                    className={`rounded-2xl border p-4 text-left transition-all ${
                      deviceMenuMode === "custom"
                        ? "border-neutral-900 bg-neutral-50 ring-1 ring-neutral-900/10 dark:border-white dark:bg-neutral-800/70"
                        : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-800"
                    }`}
                  >
                    <div className="text-xs font-bold text-neutral-900 dark:text-white">
                      Lọc theo Danh mục riêng
                    </div>
                    <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                      Phù hợp cho máy Kiosk tự phục vụ hoặc quầy chuyên biệt chỉ bán một số nhóm món.
                    </p>
                  </button>
                </div>

                {deviceMenuMode === "custom" && (
                  <>
                    <div className="rounded-2xl border border-neutral-200/80 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-950/50">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-neutral-900 dark:text-white">
                          Lọc nhanh theo Danh mục ({deviceAllowedCats.length === 0 ? "Tất cả" : `${deviceAllowedCats.length} danh mục`})
                        </span>
                        <div className="flex items-center gap-2">
                          {allDevices.filter((d) => d.id !== activeDevice.id).length > 0 && (
                            <select
                              defaultValue=""
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val) void handleCopyFromDevice(val);
                                e.target.value = "";
                              }}
                              className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
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
                          {categories.length > 0 && deviceAllowedCats.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setDeviceAllowedCats([])}
                              className="text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400"
                            >
                              Bỏ lọc danh mục
                            </button>
                          )}
                        </div>
                      </div>
                      {categories.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {categories.map((cat) => {
                            const selected = deviceAllowedCats.includes(cat.id);
                            return (
                              <button
                                key={cat.id}
                                type="button"
                                onClick={() =>
                                  setDeviceAllowedCats((prev) =>
                                    selected
                                      ? prev.filter((id) => id !== cat.id)
                                      : [...prev, cat.id]
                                  )
                                }
                                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                                  selected
                                    ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                                    : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
                                }`}
                              >
                                {selected && <Check className="h-3 w-3" />}
                                {cat.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Per-product toggles & optional device price override */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {(
                          [
                            { id: "all", label: `Tất cả (${deviceMenuItems.length})` },
                            {
                              id: "available",
                              label: `Bán trên máy (${deviceMenuItems.filter((i) => i.is_available).length})`,
                            },
                            {
                              id: "hidden",
                              label: `Ẩn trên máy (${deviceMenuItems.filter((i) => !i.is_available).length})`,
                            },
                          ] as const
                        ).map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setDeviceMenuFilter(f.id)}
                            className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                              deviceMenuFilter === f.id
                                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-800">
                        <Search className="h-3.5 w-3.5 text-neutral-400" />
                        <input
                          type="text"
                          value={deviceMenuSearch}
                          onChange={(e) => setDeviceMenuSearch(e.target.value)}
                          placeholder="Tìm món trên máy..."
                          className="w-40 bg-transparent text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:text-white"
                        />
                      </div>
                    </div>

                    {deviceMenuLoading ? (
                      <div className="space-y-2">
                        {[1, 2, 3].map((idx) => (
                          <Skeleton
                            key={idx}
                            className="h-14 w-full rounded-2xl dark:bg-neutral-800"
                          />
                        ))}
                      </div>
                    ) : filteredDeviceMenuItems.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-neutral-200 p-6 text-center text-xs text-neutral-400 dark:border-neutral-800">
                        Không có món nào khớp bộ lọc.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {filteredDeviceMenuItems.map((item) => (
                          <div
                            key={item.product_id}
                            className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 transition-colors ${
                              item.is_available
                                ? "border-neutral-200/80 bg-white dark:border-neutral-800 dark:bg-neutral-950/60"
                                : "border-neutral-200/60 bg-neutral-100/70 opacity-70 dark:border-neutral-800 dark:bg-neutral-900/40"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-xs font-bold text-neutral-900 dark:text-white">
                                  {item.name}
                                </span>
                                {item.store_is_available === false && (
                                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                                    Đang ẩn ở Chi nhánh
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                                {item.code} • Giá:{" "}
                                {Number(
                                  item.store_price_override ?? item.base_price ?? 0
                                ).toLocaleString("vi-VN")}
                                ₫
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="w-36">
                                <input
                                  type="number"
                                  min={0}
                                  value={item.price_override ?? ""}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setDeviceMenuItems((prev) =>
                                      prev.map((x) =>
                                        x.product_id === item.product_id
                                          ? {
                                              ...x,
                                              price_override:
                                                val === "" ? null : val,
                                            }
                                          : x
                                      )
                                    );
                                  }}
                                  placeholder="Giá riêng máy"
                                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                                />
                              </div>
                              <BeSwitch
                                checked={item.is_available}
                                onCheckedChange={(checked) => {
                                  setDeviceMenuItems((prev) =>
                                    prev.map((x) =>
                                      x.product_id === item.product_id
                                        ? { ...x, is_available: checked }
                                        : x
                                    )
                                  );
                                }}
                                ariaLabel={`Bật tắt ${item.name} trên máy`}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          ) : activeStore ? (
            <>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-neutral-200/70 pb-4 dark:border-neutral-800">
                <div>
                  <div className="flex items-center gap-2">
                    <UtensilsCrossed className="h-4 w-4 text-neutral-700 dark:text-neutral-300" />
                    <h2 className="text-sm font-bold text-neutral-900 dark:text-white">
                      Thực đơn Chi nhánh: {activeStore.name}
                    </h2>
                  </div>
                  <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                    Bật/tắt món đang bán tại chi nhánh và đặt giá riêng (để trống nếu dùng giá gốc).
                  </p>
                </div>

                <button
                  type="button"
                  disabled={menuSaving || menuLoading}
                  onClick={handleSaveStoreMenu}
                  className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
                >
                  <Check className="h-3.5 w-3.5" />
                  {menuSaving ? "Đang lưu..." : "Lưu Thực Đơn"}
                </button>
              </div>

              <div className="mt-3 flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-1.5">
                  {(
                    [
                      { id: "all", label: `Tất cả (${menuItems.length})` },
                      {
                        id: "available",
                        label: `Đang bán (${menuItems.filter((i) => i.is_available).length})`,
                      },
                      {
                        id: "hidden",
                        label: `Đang ẩn (${menuItems.filter((i) => !i.is_available).length})`,
                      },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setMenuFilter(f.id)}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                        menuFilter === f.id
                          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                          : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-800">
                  <Search className="h-3.5 w-3.5 text-neutral-400" />
                  <input
                    type="text"
                    value={menuSearch}
                    onChange={(e) => setMenuSearch(e.target.value)}
                    placeholder="Tìm món hoặc mã SP..."
                    className="w-44 bg-transparent text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:text-white"
                  />
                </div>
              </div>

              <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {menuLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map((idx) => (
                      <Skeleton
                        key={idx}
                        className="h-16 w-full rounded-2xl dark:bg-neutral-800"
                      />
                    ))}
                  </div>
                ) : filteredMenuItems.length === 0 ? (
                  <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/50 p-8 text-center text-xs text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950/40">
                    Không có sản phẩm nào phù hợp.
                  </div>
                ) : (
                  filteredMenuItems.map((item) => (
                    <div
                      key={item.product_id}
                      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-colors ${
                        item.is_available
                          ? "border-neutral-200/80 bg-white dark:border-neutral-800 dark:bg-neutral-950/60"
                          : "border-neutral-200/60 bg-neutral-100/70 opacity-70 dark:border-neutral-800 dark:bg-neutral-900/40"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-bold text-neutral-900 dark:text-white">
                          {item.name}
                        </div>
                        <div className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                          {item.code} • Giá gốc:{" "}
                          {Number(item.base_price || 0).toLocaleString("vi-VN")}₫
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-36">
                          <input
                            type="number"
                            min={0}
                            value={item.price_override ?? ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              setMenuItems((prev) =>
                                prev.map((x) =>
                                  x.product_id === item.product_id
                                    ? {
                                        ...x,
                                        price_override: val === "" ? null : val,
                                      }
                                    : x
                                )
                              );
                            }}
                            placeholder="Giá riêng (mặc định)"
                            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                          />
                        </div>
                        <BeSwitch
                          checked={item.is_available}
                          onCheckedChange={(checked) => {
                            setMenuItems((prev) =>
                              prev.map((x) =>
                                x.product_id === item.product_id
                                  ? { ...x, is_available: checked }
                                  : x
                              )
                            );
                          }}
                          ariaLabel={`Bật tắt ${item.name}`}
                        />
                      </div>
                    </div>
                  ))
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
    </div>
  );
}

