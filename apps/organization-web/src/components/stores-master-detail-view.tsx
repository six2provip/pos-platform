"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  Check,
  Pencil,
  Plug,
  Plus,
  Search,
  Smartphone,
  Store as StoreIcon,
  Trash2,
  Unplug,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { BeInput } from "./motion/input";
import { BeSwitch } from "./motion/switch";
import { Skeleton } from "./ui/skeleton";

export interface StoreRecord {
  id: string;
  code: string;
  name: string;
  address_line?: string | null;
  phone?: string | null;
  timezone: string;
  currency_code: string;
  status: string;
}

export interface DeviceRecord {
  id: string;
  store_id: string;
  device_code: string;
  serial_number?: string | null;
  name: string;
  device_type: string;
  status: string;
  platform: string;
  menu_mode?: string;
  allowed_category_ids?: string[];
  last_seen_at?: string | null;
}

export interface StoreMenuItem {
  product_id: string;
  code: string;
  name: string;
  status: string;
  image_url?: string | null;
  category_ids: string[];
  base_price: string;
  variant_count: number;
  is_available: boolean;
  price_override: string | null;
}

interface StoresMasterDetailViewProps {
  stores: StoreRecord[];
  devices: DeviceRecord[];
  categories?: { id: string; name: string }[];
  loadingDevices?: boolean;
  selectedStoreId: string;
  onSelectWorkingStore: (storeId: string) => void;
  onFetchStoreMenu?: (storeId: string) => Promise<StoreMenuItem[]>;
  onSaveStoreMenu?: (
    storeId: string,
    items: { product_id: string; is_available: boolean; price_override: string | null }[]
  ) => Promise<void>;
  onCreateStore: (payload: {
    name: string;
    address_line?: string | null;
    phone?: string | null;
    status: "active" | "inactive";
  }) => Promise<void>;
  onUpdateStore: (
    storeId: string,
    payload: {
      name: string;
      address_line?: string | null;
      phone?: string | null;
      status: "active" | "inactive";
    }
  ) => Promise<void>;
  onDeleteStore: (storeId: string) => Promise<void>;
  onOpenCreateSerialDevice: (store: StoreRecord) => void;
  onUpdateDevice: (
    deviceId: string,
    payload: {
      name: string;
      serial_number?: string | null;
      status: "active" | "disabled";
      menu_mode?: "inherit_store" | "custom";
      allowed_category_ids?: string[];
    }
  ) => Promise<void>;
  onToggleDeviceStatus: (
    deviceId: string,
    nextStatus: "active" | "disabled",
    deviceName: string
  ) => void;
  onDeleteDevice: (deviceId: string, deviceName: string) => Promise<void>;
}

export function StoresMasterDetailView({
  stores,
  devices,
  categories = [],
  loadingDevices = false,
  selectedStoreId,
  onSelectWorkingStore,
  onFetchStoreMenu,
  onSaveStoreMenu,
  onCreateStore,
  onUpdateStore,
  onDeleteStore,
  onOpenCreateSerialDevice,
  onUpdateDevice,
  onToggleDeviceStatus,
  onDeleteDevice,
}: StoresMasterDetailViewProps) {
  const [storeSearch, setStoreSearch] = useState("");
  const [deviceSearch, setDeviceSearch] = useState("");
  const [focusedStoreId, setFocusedStoreId] = useState<string>(
    selectedStoreId || stores[0]?.id || ""
  );

  // Create / Edit Store Modal State
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<StoreRecord | null>(null);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete Store Confirmation Modal State
  const [deletingStore, setDeletingStore] = useState<StoreRecord | null>(null);
  const [deletingLoading, setDeletingLoading] = useState(false);

  // Edit Device Modal State
  const [editingDevice, setEditingDevice] = useState<DeviceRecord | null>(null);
  const [editDeviceName, setEditDeviceName] = useState("");
  const [editDeviceSerial, setEditDeviceSerial] = useState("");
  const [editDeviceActive, setEditDeviceActive] = useState(true);
  const [savingDeviceEdit, setSavingDeviceEdit] = useState(false);

  // Delete Device Confirmation Modal State
  const [deletingDevice, setDeletingDevice] = useState<DeviceRecord | null>(null);
  const [deletingDeviceLoading, setDeletingDeviceLoading] = useState(false);

  const [storeDetailTab, setStoreDetailTab] = useState<"devices" | "menu">("devices");
  const [storeMenuItems, setStoreMenuItems] = useState<StoreMenuItem[]>([]);
  const [storeMenuLoading, setStoreMenuLoading] = useState(false);
  const [storeMenuSaving, setStoreMenuSaving] = useState(false);
  const [storeMenuSearch, setStoreMenuSearch] = useState("");
  const [storeMenuFilter, setStoreMenuFilter] = useState<"all" | "available" | "hidden">("all");
  const [editDeviceMenuMode, setEditDeviceMenuMode] = useState<"inherit_store" | "custom">("inherit_store");
  const [editDeviceAllowedCats, setEditDeviceAllowedCats] = useState<string[]>([]);

  useEffect(() => {
    if (selectedStoreId && stores.some((s) => s.id === selectedStoreId)) {
      setFocusedStoreId(selectedStoreId);
    } else if (stores.length > 0) {
      setFocusedStoreId((prev) =>
        prev && stores.some((s) => s.id === prev) ? prev : stores[0].id
      );
    }
  }, [selectedStoreId, stores]);

  const filteredStores = useMemo(() => {
    const q = storeSearch.trim().toLowerCase();
    const sorted = [...stores].sort((a, b) => a.name.localeCompare(b.name, "vi"));
    if (!q) return sorted;
    return sorted.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
    );
  }, [stores, storeSearch]);

  const activeStore = useMemo(
    () =>
      stores.find((s) => s.id === focusedStoreId) ||
      filteredStores[0] ||
      stores[0] ||
      null,
    [stores, filteredStores, focusedStoreId]
  );

  const activeStoreDevices = useMemo(() => {
    if (!activeStore) return [];
    const list = devices.filter((d) => d.store_id === activeStore.id);
    const q = deviceSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.device_code.toLowerCase().includes(q)
    );
  }, [devices, activeStore, deviceSearch]);

  const deletingStoreActiveDevices = useMemo(() => {
    if (!deletingStore) return [];
    return devices.filter(
      (d) => d.store_id === deletingStore.id && d.status === "active"
    );
  }, [devices, deletingStore]);

  useEffect(() => {
    if (storeDetailTab !== "menu" || !activeStore || !onFetchStoreMenu) return;
    let cancelled = false;
    setStoreMenuLoading(true);
    onFetchStoreMenu(activeStore.id)
      .then((items) => {
        if (!cancelled) setStoreMenuItems(items);
      })
      .catch(() => {
        if (!cancelled) setStoreMenuItems([]);
      })
      .finally(() => {
        if (!cancelled) setStoreMenuLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeDetailTab, activeStore?.id, onFetchStoreMenu]);

  const filteredStoreMenu = useMemo(() => {
    const q = storeMenuSearch.trim().toLowerCase();
    return storeMenuItems.filter((item) => {
      if (storeMenuFilter === "available" && !item.is_available) return false;
      if (storeMenuFilter === "hidden" && item.is_available) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q)
      );
    });
  }, [storeMenuItems, storeMenuSearch, storeMenuFilter]);

  const handleSelectStore = (st: StoreRecord) => {
    setFocusedStoreId(st.id);
    setDeviceSearch("");
    if (st.id !== selectedStoreId) {
      onSelectWorkingStore(st.id);
    }
  };

  const openCreateModal = () => {
    setEditingStore(null);
    setEditName("");
    setEditAddress("");
    setEditPhone("");
    setEditActive(true);
    setStoreModalOpen(true);
  };

  const openEditModal = (st: StoreRecord) => {
    setEditingStore(st);
    setEditName(st.name);
    setEditAddress(st.address_line || "");
    setEditPhone(st.phone || "");
    setEditActive((st.status || "active") === "active");
    setStoreModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;
    setSavingEdit(true);
    try {
      const payload = {
        name: editName.trim(),
        address_line: editAddress.trim() || null,
        phone: editPhone.trim() || null,
        status: (editActive ? "active" : "inactive") as "active" | "inactive",
      };
      if (editingStore) {
        await onUpdateStore(editingStore.id, payload);
      } else {
        await onCreateStore(payload);
      }
      setStoreModalOpen(false);
      setEditingStore(null);
    } finally {
      setSavingEdit(false);
    }
  };

  const openDeleteModal = (st: StoreRecord) => {
    if (st.id !== selectedStoreId) {
      onSelectWorkingStore(st.id);
    }
    setFocusedStoreId(st.id);
    setDeletingStore(st);
  };

  const handleConfirmDelete = async () => {
    if (!deletingStore || deletingStoreActiveDevices.length > 0) return;
    setDeletingLoading(true);
    try {
      await onDeleteStore(deletingStore.id);
      setDeletingStore(null);
    } finally {
      setDeletingLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-4 lg:h-[calc(100vh-112px)] lg:overflow-hidden"
    >
      {/* Header */}
      <div className="shrink-0">
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
          Hệ Thống Chi Nhánh & Thiết Bị POS
        </h1>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
          Chọn chi nhánh ở cột trái để xem và quản lý nhanh danh sách máy POS bên phải.
        </p>
      </div>

      {/* Master-Detail Split View */}
      {stores.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-neutral-200 bg-white p-14 text-center space-y-3 dark:border-neutral-800 dark:bg-neutral-900">
          <StoreIcon className="mx-auto h-9 w-9 text-neutral-400" />
          <div className="text-sm font-bold text-neutral-900 dark:text-white">
            Chưa có chi nhánh nào được tạo
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Bấm nút bên dưới để tạo chi nhánh đầu tiên của chuỗi.
          </p>
          <div className="pt-1">
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm Chi Nhánh Mới
            </motion.button>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-12">
          {/* LEFT MASTER: Fixed-Height Animated Branch Name Selector */}
          <div className="flex min-h-0 flex-col rounded-2xl border border-neutral-200/80 bg-white p-3 shadow-sm lg:col-span-4 lg:h-full dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex shrink-0 items-center justify-between px-1 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-neutral-900 dark:text-white">
                  Danh sách chi nhánh
                </span>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  {stores.length}
                </span>
              </div>
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={openCreateModal}
                className="inline-flex items-center gap-1 rounded-full bg-neutral-900 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
              >
                <Plus className="h-3 w-3" />
                Thêm chi nhánh
              </motion.button>
            </div>

            {/* Search Input */}
            <div className="mb-2.5 flex shrink-0 items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-800">
              <Search className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
              <input
                type="text"
                value={storeSearch}
                onChange={(e) => setStoreSearch(e.target.value)}
                placeholder="Tìm tên chi nhánh..."
                className="w-full bg-transparent text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:text-white"
              />
            </div>

            {/* Animated Text Rows (Internal Scroll) */}
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
              {filteredStores.length === 0 ? (
                <div className="py-8 text-center text-xs text-neutral-400">
                  Không tìm thấy chi nhánh phù hợp
                </div>
              ) : (
                filteredStores.map((st) => {
                  const isFocused = activeStore?.id === st.id;

                  return (
                    <div
                      key={st.id}
                      onClick={() => handleSelectStore(st)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSelectStore(st);
                        }
                      }}
                      className="group relative flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors focus:outline-none"
                    >
                      {/* Shared Layout Pill Animation (beUI Subtle Neutral + Left Indicator) */}
                      {isFocused && (
                        <motion.span
                          layoutId="active-store-row-pill"
                          transition={{
                            type: "spring",
                            stiffness: 440,
                            damping: 34,
                            mass: 0.65,
                          }}
                          className="absolute inset-0 rounded-xl border border-neutral-200/80 bg-neutral-100 dark:border-neutral-700/80 dark:bg-neutral-800/90"
                        />
                      )}

                      {!isFocused && (
                        <span className="absolute inset-0 rounded-xl bg-transparent transition-colors group-hover:bg-neutral-50 dark:group-hover:bg-neutral-800/40" />
                      )}

                      {/* Animated Left Accent Bar */}
                      {isFocused && (
                        <motion.span
                          layoutId="active-store-bar"
                          transition={{
                            type: "spring",
                            stiffness: 440,
                            damping: 34,
                            mass: 0.65,
                          }}
                          className="relative z-10 mr-2.5 h-5 w-1 shrink-0 rounded-full bg-neutral-900 dark:bg-white"
                        />
                      )}

                      <div className="relative z-10 min-w-0 flex-1 pr-2">
                        <span
                          className={`block truncate text-xs transition-colors ${
                            isFocused
                              ? "font-bold text-neutral-900 dark:text-white"
                              : "font-medium text-neutral-600 group-hover:text-neutral-900 dark:text-neutral-400 dark:group-hover:text-neutral-200"
                          }`}
                        >
                          {st.name}
                        </span>
                        {st.status === "inactive" && (
                          <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                            Tạm ngưng
                          </span>
                        )}
                      </div>

                      <div className="relative z-10 flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          title="Chỉnh sửa chi nhánh"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditModal(st);
                          }}
                          className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-200/80 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-white"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Xóa chi nhánh"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeleteModal(st);
                          }}
                          className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-rose-100/80 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT DETAIL: Fixed-Height Frame, Inner Data Updates Smoothly */}
          <div className="flex min-h-0 flex-col rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm lg:col-span-8 lg:h-full dark:border-neutral-800 dark:bg-neutral-900">
            {activeStore && (
              <>
                {/* Branch Detail Header */}
                <div className="flex shrink-0 flex-col gap-3 border-b border-neutral-100 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800">
                  <div>
                    <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
                      {activeStore.name}
                    </h2>
                    {(activeStore.address_line || activeStore.phone) && (
                      <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                        {[activeStore.address_line, activeStore.phone]
                          .filter(Boolean)
                          .join(" • ")}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-full border border-neutral-200 bg-neutral-100/80 p-0.5 dark:border-neutral-700 dark:bg-neutral-800">
                      <button
                        type="button"
                        onClick={() => setStoreDetailTab("devices")}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                          storeDetailTab === "devices"
                            ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-white"
                            : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400"
                        }`}
                      >
                        <Smartphone className="h-3.5 w-3.5" />
                        Thiết bị ({activeStoreDevices.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setStoreDetailTab("menu")}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                          storeDetailTab === "menu"
                            ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-white"
                            : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400"
                        }`}
                      >
                        <UtensilsCrossed className="h-3.5 w-3.5" />
                        Thực đơn chi nhánh
                      </button>
                    </div>
                    {storeDetailTab === "devices" ? (
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => onOpenCreateSerialDevice(activeStore)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Thêm Thiết Bị
                      </motion.button>
                    ) : (
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        disabled={storeMenuSaving || storeMenuLoading || !onSaveStoreMenu}
                        onClick={async () => {
                          if (!onSaveStoreMenu) return;
                          setStoreMenuSaving(true);
                          try {
                            await onSaveStoreMenu(
                              activeStore.id,
                              storeMenuItems.map((it) => ({
                                product_id: it.product_id,
                                is_available: it.is_available,
                                price_override:
                                  it.price_override !== null &&
                                  String(it.price_override).trim() !== ""
                                    ? String(it.price_override).trim()
                                    : null,
                              }))
                            );
                          } finally {
                            setStoreMenuSaving(false);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                      >
                        <Check className="h-3.5 w-3.5" />
                        {storeMenuSaving ? "Đang lưu..." : "Lưu Thực Đơn"}
                      </motion.button>
                    )}
                  </div>
                </div>

                {storeDetailTab === "menu" ? (
                  <>
                    <div className="mt-4 flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-1.5">
                        {(
                          [
                            { id: "all", label: `Tất cả (${storeMenuItems.length})` },
                            {
                              id: "available",
                              label: `Đang bán (${storeMenuItems.filter((i) => i.is_available).length})`,
                            },
                            {
                              id: "hidden",
                              label: `Đang ẩn (${storeMenuItems.filter((i) => !i.is_available).length})`,
                            },
                          ] as const
                        ).map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setStoreMenuFilter(f.id)}
                            className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                              storeMenuFilter === f.id
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
                          value={storeMenuSearch}
                          onChange={(e) => setStoreMenuSearch(e.target.value)}
                          placeholder="Tìm món hoặc mã SP..."
                          className="w-44 bg-transparent text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
                      {storeMenuLoading ? (
                        <div className="space-y-2">
                          {[1, 2, 3, 4].map((idx) => (
                            <Skeleton
                              key={idx}
                              className="h-16 w-full rounded-2xl dark:bg-neutral-800"
                            />
                          ))}
                        </div>
                      ) : filteredStoreMenu.length === 0 ? (
                        <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/50 p-8 text-center text-xs text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950/40">
                          Không có sản phẩm nào phù hợp.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {filteredStoreMenu.map((item) => (
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
                                      setStoreMenuItems((prev) =>
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
                                    placeholder="Giá riêng (mặc định)"
                                    className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                                  />
                                </div>
                                <BeSwitch
                                  checked={item.is_available}
                                  onCheckedChange={(checked) => {
                                    setStoreMenuItems((prev) =>
                                      prev.map((x) =>
                                        x.product_id === item.product_id
                                          ? { ...x, is_available: checked }
                                          : x
                                      )
                                    );
                                  }}
                                  ariaLabel={`Bật tắt ${item.name} tại chi nhánh`}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                {/* Devices Toolbar */}
                <div className="mt-4 flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                      Thiết bị POS trực thuộc{" "}
                      {!loadingDevices && `(${activeStoreDevices.length})`}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    {devices.filter((d) => d.store_id === activeStore.id)
                      .length > 3 && (
                      <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1 dark:border-neutral-700 dark:bg-neutral-800">
                        <Search className="h-3 w-3 text-neutral-400" />
                        <input
                          type="text"
                          value={deviceSearch}
                          onChange={(e) => setDeviceSearch(e.target.value)}
                          placeholder="Tìm thiết bị..."
                          className="w-36 bg-transparent text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:text-white"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Devices List (Internal Scroll Only) */}
                <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
                  {loadingDevices ? (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {[1, 2, 3, 4].map((idx) => (
                        <div
                          key={idx}
                          className="flex flex-col justify-between gap-3 rounded-2xl border border-neutral-200/80 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-950/50"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <Skeleton className="h-10 w-10 shrink-0 rounded-xl dark:bg-neutral-800" />
                              <div className="space-y-2">
                                <Skeleton className="h-3.5 w-32 dark:bg-neutral-800" />
                                <Skeleton className="h-3 w-24 dark:bg-neutral-800" />
                              </div>
                            </div>
                            <Skeleton className="h-5 w-14 rounded-full dark:bg-neutral-800" />
                          </div>
                          <div className="flex items-center justify-end gap-1 pt-2 border-t border-neutral-200/60 dark:border-neutral-800">
                            <Skeleton className="h-7 w-7 rounded-lg dark:bg-neutral-800" />
                            <Skeleton className="h-7 w-7 rounded-lg dark:bg-neutral-800" />
                            <Skeleton className="h-7 w-7 rounded-lg dark:bg-neutral-800" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeStore.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.14 }}
                      className="h-full"
                    >
                      {activeStoreDevices.length === 0 ? (
                        <div className="flex h-full min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/50 p-10 text-center space-y-2.5 dark:border-neutral-800 dark:bg-neutral-950/40">
                          <Smartphone className="mx-auto h-8 w-8 text-neutral-400" />
                          <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                            Chưa có thiết bị nào tại {activeStore.name}
                          </div>
                          <p className="mx-auto max-w-sm text-xs text-neutral-500 dark:text-neutral-400">
                            Bấm nút &ldquo;+ Thêm Thiết Bị&rdquo; ở góc trên để đăng ký máy POS / Kiosk theo Serial Number vào chi nhánh này.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          {activeStoreDevices.map((d) => (
                            <div
                              key={d.id}
                              className="flex flex-col justify-between gap-3 rounded-2xl border border-neutral-200/80 bg-neutral-50/50 p-4 transition-colors hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950/50 dark:hover:bg-neutral-800/40"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-3">
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
                                    <Smartphone className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="truncate text-xs font-bold text-neutral-900 dark:text-white">
                                      {d.name}
                                    </div>
                                    {d.menu_mode === "custom" && (
                                    <span className="mt-1 inline-block rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                                      Lọc {(d.allowed_category_ids || []).length} danh mục
                                    </span>
                                  )}
                                  {d.serial_number && (
                                      <p className="mt-0.5 truncate font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
                                        S/N: {d.serial_number}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                <span
                                  className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${
                                    d.status === "active"
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                                      : d.status === "pending"
                                        ? "border-neutral-200 bg-neutral-100 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                                        : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                                  }`}
                                >
                                  {d.status === "active"
                                    ? "Đang kết nối"
                                    : d.status === "pending"
                                      ? "Chưa kết nối"
                                      : "Đã ngắt kết nối"}
                                </span>
                              </div>

                              <div className="flex items-center justify-end gap-1 border-t border-neutral-200/60 pt-2.5 dark:border-neutral-800">
                                <button
                                  type="button"
                                  title="Chỉnh sửa thiết bị"
                                  onClick={() => {
                                    setEditingDevice(d);
                                    setEditDeviceName(d.name);
                                    setEditDeviceSerial(d.serial_number || "");
                                    setEditDeviceActive(d.status === "active");
                                    setEditDeviceMenuMode(
                                      d.menu_mode === "custom" ? "custom" : "inherit_store"
                                    );
                                    setEditDeviceAllowedCats(d.allowed_category_ids || []);
                                  }}
                                  className="grid h-7 w-7 place-items-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-200/70 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  title={
                                    d.status === "active"
                                      ? "Ngắt kết nối thiết bị"
                                      : d.status === "pending"
                                        ? "Kết nối thiết bị"
                                        : "Kết nối lại thiết bị"
                                  }
                                  onClick={() =>
                                    onToggleDeviceStatus(
                                      d.id,
                                      d.status === "active" ? "disabled" : "active",
                                      d.name
                                    )
                                  }
                                  className={`grid h-7 w-7 place-items-center rounded-lg transition-colors ${
                                    d.status === "active"
                                      ? "text-amber-600 hover:bg-amber-100/70 dark:text-amber-400 dark:hover:bg-amber-950/40"
                                      : "text-emerald-600 hover:bg-emerald-100/70 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                                  }`}
                                >
                                  {d.status === "active" ? (
                                    <Unplug className="h-3.5 w-3.5" />
                                  ) : (
                                    <Plug className="h-3.5 w-3.5" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  title="Xóa thiết bị"
                                  onClick={() => setDeletingDevice(d)}
                                  className="grid h-7 w-7 place-items-center rounded-lg text-rose-500 transition-colors hover:bg-rose-100/70 hover:text-rose-600 dark:text-rose-400 dark:hover:bg-rose-950/40"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                  )}
                </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL: DELETE DEVICE CONFIRMATION */}
      <AnimatePresence>
        {deletingDevice && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeletingDevice(null)}
              className="fixed inset-0 z-[80] bg-black/25 [backdrop-filter:blur(10px)_saturate(140%)]"
            />
            <div className="pointer-events-none fixed inset-4 z-[81] flex items-center justify-center">
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 420, damping: 38, mass: 0.55 }}
                className="pointer-events-auto flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-neutral-200/80 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950"
              >
                <div className="flex items-center justify-between border-b border-neutral-200/80 px-6 py-4 dark:border-neutral-800">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                      Xác nhận xóa thiết bị
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeletingDevice(null)}
                    className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-3 p-6 text-xs text-neutral-600 dark:text-neutral-300">
                  <p>
                    Bạn có chắc chắn muốn xóa thiết bị{" "}
                    <strong className="text-neutral-900 dark:text-white">
                      {deletingDevice.name}
                    </strong>{" "}
                    {deletingDevice.serial_number && (
                      <span className="font-mono text-[11px] text-neutral-500">
                        (S/N: {deletingDevice.serial_number})
                      </span>
                    )}{" "}
                    khỏi chi nhánh này không?
                  </p>
                  <p className="text-[11px] text-neutral-400">
                    Sau khi xóa, thiết bị này sẽ bị thu hồi toàn bộ quyền truy cập và không thể đồng bộ đơn hàng cho đến khi được đăng ký lại.
                  </p>
                </div>

                <div className="flex justify-end gap-2 border-t border-neutral-200/80 px-6 py-3.5 dark:border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setDeletingDevice(null)}
                    className="rounded-full border border-neutral-200 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300"
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    disabled={deletingDeviceLoading}
                    onClick={async () => {
                      setDeletingDeviceLoading(true);
                      try {
                        await onDeleteDevice(deletingDevice.id, deletingDevice.name);
                        setDeletingDevice(null);
                      } finally {
                        setDeletingDeviceLoading(false);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {deletingDeviceLoading ? "Đang xóa..." : "Xác nhận xóa"}
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* MODAL: EDIT DEVICE */}
      <AnimatePresence>
        {editingDevice && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingDevice(null)}
              className="fixed inset-0 z-[80] bg-black/25 [backdrop-filter:blur(10px)_saturate(140%)]"
            />
            <div className="pointer-events-none fixed inset-4 z-[81] flex items-center justify-center">
              <motion.form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!editDeviceName.trim()) return;
                  setSavingDeviceEdit(true);
                  try {
                    await onUpdateDevice(editingDevice.id, {
                      name: editDeviceName.trim(),
                      serial_number: editDeviceSerial.trim()
                        ? editDeviceSerial.trim().toUpperCase()
                        : null,
                      status: editDeviceActive ? "active" : "disabled",
                      menu_mode: editDeviceMenuMode,
                      allowed_category_ids:
                        editDeviceMenuMode === "custom" ? editDeviceAllowedCats : [],
                    });
                    setEditingDevice(null);
                  } finally {
                    setSavingDeviceEdit(false);
                  }
                }}
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 420, damping: 38, mass: 0.55 }}
                className="pointer-events-auto flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-neutral-200/80 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950"
              >
                <div className="flex items-center justify-between border-b border-neutral-200/80 px-6 py-4 dark:border-neutral-800">
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                      Chỉnh sửa thiết bị
                    </h3>
                    <p className="text-[11px] text-neutral-400">
                      Cập nhật tên quầy, số sê-ri và trạng thái kết nối của thiết bị.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingDevice(null)}
                    className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-4 p-6">
                  <BeInput
                    label="Tên thiết bị / Quầy *"
                    value={editDeviceName}
                    onChange={setEditDeviceName}
                    placeholder="VD: Kiosk Tự Order Cửa Chính"
                    success={Boolean(editDeviceName.trim())}
                  />
                  <BeInput
                    label="Số sê-ri thiết bị (Serial)"
                    value={editDeviceSerial}
                    onChange={setEditDeviceSerial}
                    placeholder="VD: K2-2026-0001"
                    success={editDeviceSerial.trim().length >= 4}
                  />
                  <div className="flex items-center justify-between rounded-xl bg-neutral-50/90 px-3.5 py-2.5 dark:bg-neutral-900">
                    <div>
                      <div className="text-xs font-semibold text-neutral-900 dark:text-white">
                        Trạng thái kết nối
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        Tắt để ngắt kết nối và thu hồi quyền truy cập ngay lập tức
                      </div>
                    </div>
                    <BeSwitch
                      checked={editDeviceActive}
                      onCheckedChange={setEditDeviceActive}
                      ariaLabel="Trạng thái kết nối thiết bị"
                    />
                  </div>
                  <div className="space-y-2 rounded-xl border border-neutral-200/80 bg-neutral-50/70 p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-neutral-900 dark:text-white">
                          Thực đơn hiển thị trên máy
                        </div>
                        <div className="text-[11px] text-neutral-400">
                          Mặc định kế thừa toàn bộ thực đơn của chi nhánh.
                        </div>
                      </div>
                      <select
                        value={editDeviceMenuMode}
                        onChange={(e) =>
                          setEditDeviceMenuMode(
                            e.target.value === "custom" ? "custom" : "inherit_store"
                          )
                        }
                        className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                      >
                        <option value="inherit_store">Kế thừa Chi nhánh</option>
                        <option value="custom">Lọc theo danh mục</option>
                      </select>
                    </div>
                    {editDeviceMenuMode === "custom" && (
                      <div className="max-h-36 overflow-y-auto pt-1">
                        {categories.length === 0 ? (
                          <div className="text-[11px] text-neutral-400">
                            Chưa có danh mục nào để lọc.
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {categories.map((cat) => {
                              const selected = editDeviceAllowedCats.includes(cat.id);
                              return (
                                <button
                                  key={cat.id}
                                  type="button"
                                  onClick={() =>
                                    setEditDeviceAllowedCats((prev) =>
                                      selected
                                        ? prev.filter((id) => id !== cat.id)
                                        : [...prev, cat.id]
                                    )
                                  }
                                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                    selected
                                      ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                                      : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                                  }`}
                                >
                                  {cat.name}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-neutral-200/80 px-6 py-3.5 dark:border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setEditingDevice(null)}
                    className="rounded-full border border-neutral-200 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={savingDeviceEdit || !editDeviceName.trim()}
                    className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {savingDeviceEdit ? "Đang lưu..." : "Cập Nhật"}
                  </button>
                </div>
              </motion.form>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* MODAL: CREATE / EDIT STORE */}
      <AnimatePresence>
        {storeModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setStoreModalOpen(false)}
              className="fixed inset-0 z-[80] bg-black/25 [backdrop-filter:blur(10px)_saturate(140%)]"
            />
            <div className="pointer-events-none fixed inset-4 z-[81] flex items-center justify-center">
              <motion.form
                onSubmit={handleSaveEdit}
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 420, damping: 38, mass: 0.55 }}
                className="pointer-events-auto flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-neutral-200/80 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950"
              >
                <div className="flex items-center justify-between border-b border-neutral-200/80 px-6 py-4 dark:border-neutral-800">
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                      {editingStore ? "Chỉnh sửa chi nhánh" : "Thêm chi nhánh mới"}
                    </h3>
                    <p className="text-[11px] text-neutral-400">
                      {editingStore
                        ? "Cập nhật thông tin và trạng thái vận hành của chi nhánh."
                        : "Nhập tên, địa chỉ và thông tin liên hệ của chi nhánh mới."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStoreModalOpen(false)}
                    className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-4 p-6">
                  <BeInput
                    label="Tên chi nhánh *"
                    value={editName}
                    onChange={setEditName}
                    placeholder="VD: Chi nhánh Quận 1 - Nguyễn Huệ"
                    success={Boolean(editName.trim())}
                  />
                  <BeInput
                    label="Địa chỉ"
                    value={editAddress}
                    onChange={setEditAddress}
                    placeholder="VD: 123 Nguyễn Huệ, Quận 1, TP.HCM"
                  />
                  <BeInput
                    label="Số điện thoại"
                    value={editPhone}
                    onChange={setEditPhone}
                    placeholder="VD: 0901234567"
                  />
                  <div className="flex items-center justify-between rounded-xl bg-neutral-50/90 px-3.5 py-2.5 dark:bg-neutral-900">
                    <div>
                      <div className="text-xs font-semibold text-neutral-900 dark:text-white">
                        Trạng thái hoạt động
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        Tắt nếu chi nhánh đang tạm ngưng bán hàng
                      </div>
                    </div>
                    <BeSwitch
                      checked={editActive}
                      onCheckedChange={setEditActive}
                      ariaLabel="Trạng thái hoạt động chi nhánh"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-neutral-200/80 px-6 py-3.5 dark:border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setStoreModalOpen(false)}
                    className="rounded-full border border-neutral-200 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit || !editName.trim()}
                    className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {savingEdit
                      ? "Đang lưu..."
                      : editingStore
                        ? "Cập Nhật"
                        : "Tạo Chi Nhánh"}
                  </button>
                </div>
              </motion.form>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* MODAL: DELETE STORE CONFIRMATION */}
      <AnimatePresence>
        {deletingStore && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeletingStore(null)}
              className="fixed inset-0 z-[80] bg-black/25 [backdrop-filter:blur(10px)_saturate(140%)]"
            />
            <div className="pointer-events-none fixed inset-4 z-[81] flex items-center justify-center">
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 420, damping: 38, mass: 0.55 }}
                className="pointer-events-auto flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-neutral-200/80 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950"
              >
                <div className="flex items-center justify-between border-b border-neutral-200/80 px-6 py-4 dark:border-neutral-800">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                      Xác nhận xóa chi nhánh
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeletingStore(null)}
                    className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-3 p-6 text-xs text-neutral-600 dark:text-neutral-300">
                  <p>
                    Bạn có chắc chắn muốn xóa chi nhánh{" "}
                    <strong className="text-neutral-900 dark:text-white">
                      {deletingStore.name}
                    </strong>{" "}
                    không?
                  </p>

                  {deletingStoreActiveDevices.length > 0 ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                      <div className="font-bold">
                        Không thể xóa chi nhánh này!
                      </div>
                      <p className="mt-1 leading-relaxed">
                        Hiện tại đang có{" "}
                        <strong>
                          {deletingStoreActiveDevices.length} thiết bị đang hoạt động
                        </strong>
                        . Vui lòng tắt trạng thái (<strong>Khóa máy</strong>) hoặc{" "}
                        <strong>Xóa tất cả thiết bị</strong> của chi nhánh trước khi xóa.
                      </p>
                    </div>
                  ) : (
                    <p className="text-[11px] text-neutral-400">
                      Chi nhánh không có thiết bị nào đang hoạt động. Sau khi xóa, toàn bộ thiết bị đã tắt còn lại (nếu có) sẽ được gỡ liên kết.
                    </p>
                  )}
                </div>

                <div className="flex justify-end gap-2 border-t border-neutral-200/80 px-6 py-3.5 dark:border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setDeletingStore(null)}
                    className="rounded-full border border-neutral-200 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300"
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDelete}
                    disabled={
                      deletingLoading || deletingStoreActiveDevices.length > 0
                    }
                    className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {deletingLoading ? "Đang xóa..." : "Xác nhận xóa"}
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
