"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  Edit3,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { BeInput } from "./motion/input";
import { BeSelect } from "./motion/select";
import { BeSwitch } from "./motion/switch";

export interface OptionItemRecord {
  id?: string;
  option_group_id?: string;
  name: string;
  price_delta: string;
  is_default: boolean;
  sort_order: number;
  status: string;
}

export interface OptionGroupRecord {
  id: string;
  organization_id: string;
  code?: string | null;
  name: string;
  description?: string | null;
  selection_mode: "single" | "multiple";
  is_required: boolean;
  min_selections: number;
  max_selections?: number | null;
  sort_order: number;
  status: string;
  version: number;
  items: OptionItemRecord[];
}

interface DraftOptionItem {
  key: string;
  name: string;
  price_delta: string;
  is_default: boolean;
  status: string;
}

interface CatalogOptionsViewProps {
  optionGroups: OptionGroupRecord[];
  accessToken: string | null;
  apiFetch: (path: string, options?: RequestInit, token?: string) => Promise<any>;
  onRefresh: () => Promise<void>;
  notify: (type: "success" | "error" | "info", text: string) => void;
}

const formatPrice = (val: number | string) =>
  new Intl.NumberFormat("vi-VN").format(Math.round(Number(val || 0)));

export function CatalogOptionsView({
  optionGroups,
  accessToken,
  apiFetch,
  onRefresh,
  notify,
}: CatalogOptionsViewProps) {
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<OptionGroupRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [name, setName] = useState("");
  const [selectionMode, setSelectionMode] = useState<"single" | "multiple">("single");
  const [isRequired, setIsRequired] = useState(false);
  const [minSelections, setMinSelections] = useState("0");
  const [maxSelections, setMaxSelections] = useState("");
  const [items, setItems] = useState<DraftOptionItem[]>([]);

  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalOpen]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return optionGroups;
    return optionGroups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.items.some((i) => i.name.toLowerCase().includes(q))
    );
  }, [optionGroups, search]);

  const openCreate = () => {
    setEditingGroup(null);
    setSubmitted(false);
    setName("");
    setSelectionMode("single");
    setIsRequired(false);
    setMinSelections("0");
    setMaxSelections("");
    setItems([
      {
        key: `opt-${Date.now()}-0`,
        name: "Lựa chọn 1",
        price_delta: "0",
        is_default: true,
        status: "active",
      },
    ]);
    setModalOpen(true);
  };

  const openEdit = (grp: OptionGroupRecord) => {
    setEditingGroup(grp);
    setSubmitted(false);
    setName(grp.name);
    setSelectionMode(grp.selection_mode);
    setIsRequired(grp.is_required);
    setMinSelections(String(grp.min_selections ?? 0));
    setMaxSelections(
      grp.max_selections !== null && grp.max_selections !== undefined
        ? String(grp.max_selections)
        : ""
    );
    setItems(
      grp.items.length > 0
        ? grp.items.map((it, i) => ({
            key: it.id || `opt-${i}`,
            name: it.name,
            price_delta: String(Math.round(Number(it.price_delta || 0))),
            is_default: it.is_default,
            status: it.status || "active",
          }))
        : [
            {
              key: `opt-${Date.now()}-0`,
              name: "Lựa chọn 1",
              price_delta: "0",
              is_default: false,
              status: "active",
            },
          ]
    );
    setModalOpen(true);
  };

  const addDraftItem = () => {
    setItems((prev) => [
      ...prev,
      {
        key: `opt-${Date.now()}-${prev.length}`,
        name: "",
        price_delta: "0",
        is_default: false,
        status: "active",
      },
    ]);
  };

  const updateDraftItem = (idx: number, patch: Partial<DraftOptionItem>) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) {
          if (patch.is_default && selectionMode === "single") {
            return { ...it, is_default: false };
          }
          return it;
        }
        return { ...it, ...patch };
      })
    );
  };

  const removeDraftItem = (idx: number) => {
    if (items.length <= 1) {
      notify("error", "Mỗi nhóm tùy chọn cần ít nhất 1 lựa chọn.");
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);

    if (!name.trim()) {
      notify("error", "Vui lòng nhập tên nhóm tùy chọn.");
      return;
    }
    const validItems = items.filter((it) => it.name.trim().length > 0);
    if (validItems.length === 0) {
      notify("error", "Cần ít nhất 1 lựa chọn con hợp lệ.");
      return;
    }

    const rawMin = Number(minSelections);
    if (minSelections.trim() === "" || Number.isNaN(rawMin) || rawMin < 0) {
      notify("error", "Số lượng chọn tối thiểu không được nhỏ hơn 0.");
      return;
    }
    if (isRequired && rawMin < 1) {
      notify("error", "Khi bật Bắt buộc chọn, số lượng tối thiểu phải từ 1 trở lên.");
      return;
    }

    const minSel = isRequired ? Math.max(1, Math.floor(rawMin)) : Math.floor(rawMin);
    let maxSel: number | null = null;
    if (selectionMode === "single") {
      maxSel = 1;
    } else if (maxSelections.trim() !== "") {
      const rawMax = Number(maxSelections);
      if (Number.isNaN(rawMax) || rawMax < 1) {
        notify("error", "Số lượng chọn tối đa phải lớn hơn hoặc bằng 1.");
        return;
      }
      maxSel = Math.floor(rawMax);
    }

    if (maxSel !== null && maxSel < minSel) {
      notify("error", "Số lượng chọn tối đa phải lớn hơn hoặc bằng tối thiểu.");
      return;
    }
    if (validItems.some((it) => Number(it.price_delta || 0) < 0)) {
      notify("error", "Giá cộng thêm không được là số âm.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        selection_mode: selectionMode,
        is_required: isRequired,
        min_selections: minSel,
        max_selections: maxSel,
        items: validItems.map((it, idx) => ({
          name: it.name.trim(),
          price_delta: it.price_delta.trim() || "0",
          is_default: it.is_default,
          sort_order: idx,
          status: it.status || "active",
        })),
      };

      if (editingGroup) {
        await apiFetch(
          `/api/v1/option-groups/${editingGroup.id}`,
          { method: "PATCH", body: JSON.stringify(payload) },
          accessToken || undefined
        );
        notify("success", `Đã cập nhật nhóm tùy chọn "${name.trim()}"!`);
      } else {
        await apiFetch(
          "/api/v1/option-groups",
          { method: "POST", body: JSON.stringify(payload) },
          accessToken || undefined
        );
        notify("success", `Đã tạo nhóm tùy chọn "${name.trim()}"!`);
      }

      setModalOpen(false);
      await onRefresh();
    } catch (err: any) {
      notify("error", err?.message || "Không thể lưu nhóm tùy chọn.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (grp: OptionGroupRecord) => {
    try {
      await apiFetch(
        `/api/v1/option-groups/${grp.id}`,
        { method: "DELETE" },
        accessToken || undefined
      );
      notify("success", `Đã xóa nhóm tùy chọn "${grp.name}".`);
      await onRefresh();
    } catch (err: any) {
      notify("error", err?.message || "Không thể xóa nhóm tùy chọn.");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="flex h-full flex-1 min-h-0 flex-col gap-3"
    >
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">
            Quản Lý Tùy Chọn & Topping
          </h1>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            Cấu hình nhóm tùy chọn (Topping, Mức đá/đường, Đồ ăn kèm...) để gắn vào các biến thể và đồng bộ xuống máy POS.
          </p>
        </div>

        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          <Plus className="h-3.5 w-3.5" />
          Thêm Nhóm Tùy Chọn
        </motion.button>
      </div>

      {/* Search Bar */}
      <div className="flex shrink-0 items-center gap-2.5 rounded-2xl border border-neutral-200/80 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-800">
          <Search className="h-3.5 w-3.5 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm tên nhóm tùy chọn, tên topping..."
            className="w-full bg-transparent text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:text-white"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-neutral-200/80 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full table-fixed text-left text-xs">
          <thead>
            <tr className="border-b border-neutral-200/80 bg-neutral-50/70 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-400">
              <th className="w-[24%] px-4 py-2.5">Nhóm tùy chọn</th>
              <th className="w-[15%] px-3 py-2.5">Chế độ</th>
              <th className="w-[15%] px-3 py-2.5">Quy tắc</th>
              <th className="w-[34%] px-3 py-2.5">Các lựa chọn con</th>
              <th className="w-[12%] px-3 py-2.5 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-14 text-center text-xs text-neutral-400">
                  <SlidersHorizontal className="mx-auto mb-2 h-6 w-6 opacity-40" />
                  Chưa có nhóm tùy chọn nào. Hãy bấm &ldquo;Thêm Nhóm Tùy Chọn&rdquo; để bắt đầu.
                </td>
              </tr>
            ) : (
              filtered.map((grp, idx) => (
                <motion.tr
                  key={grp.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.2,
                    delay: Math.min(idx * 0.025, 0.2),
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="transition-colors hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40"
                >
                  <td className="px-4 py-3">
                    <div
                      onClick={() => openEdit(grp)}
                      className="cursor-pointer truncate font-bold text-neutral-900 hover:underline dark:text-white"
                    >
                      {grp.name}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        grp.selection_mode === "single"
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                          : "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
                      }`}
                    >
                      {grp.selection_mode === "single" ? "Chỉ chọn 1" : "Chọn nhiều"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span
                        className={`text-[11px] font-semibold ${
                          grp.is_required
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-neutral-500"
                        }`}
                      >
                        {grp.is_required ? "Bắt buộc" : "Không bắt buộc"}
                      </span>
                      <span className="text-[10px] text-neutral-400">
                        {grp.selection_mode === "single"
                          ? "Tối đa 1"
                          : `Tối thiểu ${grp.min_selections} · Tối đa ${
                              grp.max_selections ?? "Không GH"
                            }`}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {grp.items.slice(0, 3).map((it, i) => (
                        <span
                          key={it.id || i}
                          className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                        >
                          <span className="max-w-[95px] truncate">{it.name}</span>
                          {Number(it.price_delta) > 0 && (
                            <span className="tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                              +{formatPrice(it.price_delta)}
                            </span>
                          )}
                        </span>
                      ))}
                      {grp.items.length > 3 && (
                        <span className="rounded-full bg-neutral-900 px-1.5 py-0.5 text-[10px] font-bold text-white dark:bg-white dark:text-neutral-900">
                          +{grp.items.length - 3}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(grp)}
                        className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-white"
                        title="Chỉnh sửa"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(grp)}
                        className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        title="Xóa"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Horizontal Split Modal (beUI Spring + Blur Backdrop) */}
      <AnimatePresence>
        {modalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => setModalOpen(false)}
              className="fixed inset-0 z-[80] bg-black/25 [backdrop-filter:blur(10px)_saturate(140%)] [-webkit-backdrop-filter:blur(10px)_saturate(140%)]"
            />
            <div className="pointer-events-none fixed inset-4 z-[81] flex items-center justify-center">
              <motion.form
                onSubmit={handleSave}
                noValidate
                initial={{ opacity: 0, y: 20, scale: 0.96, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                exit={{
                  opacity: 0,
                  y: 16,
                  scale: 0.97,
                  filter: "blur(4px)",
                  transition: { duration: 0.16, ease: [0.16, 1, 0.3, 1] },
                }}
                transition={{
                  type: "spring",
                  stiffness: 420,
                  damping: 38,
                  mass: 0.55,
                }}
                className="pointer-events-auto flex h-[82vh] max-h-[760px] w-[92vw] max-w-6xl flex-col overflow-hidden rounded-3xl border border-neutral-200/80 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950"
              >
                {/* Clean Single-Card Modal Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-neutral-200/80 px-6 py-4 dark:border-neutral-800">
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                      {editingGroup
                        ? `Chỉnh sửa nhóm: ${editingGroup.name}`
                        : "Tạo Nhóm Tùy Chọn Mới"}
                    </h3>
                    <p className="text-[11px] text-neutral-400">
                      Thiết lập quy tắc chọn và danh sách lựa chọn con cho sản phẩm.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Horizontal 2-Column Body */}
                <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
                  <div className="grid flex-1 min-h-0 grid-cols-1 gap-8 overflow-y-auto p-7 lg:grid-cols-12">
                    {/* Left 5 cols: Group Info & Rules */}
                    <div className="space-y-5 lg:col-span-5 lg:border-r lg:border-neutral-200/70 lg:pr-8 dark:lg:border-neutral-800">
                      <div>
                        <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                          Thông tin & Quy tắc
                        </h4>
                        <p className="text-[11px] text-neutral-400">
                          Thiết lập cách khách hàng hoặc thu ngân chọn tùy chọn trên POS.
                        </p>
                      </div>

                      <BeInput
                        label="Tên nhóm tùy chọn *"
                        value={name}
                        onChange={setName}
                        placeholder="VD: Chọn Topping, Mức đường..."
                        success={Boolean(name.trim())}
                        error={
                          submitted && !name.trim()
                            ? "Vui lòng nhập tên nhóm."
                            : undefined
                        }
                      />

                      <BeSelect
                        label="Chế độ chọn"
                        value={selectionMode}
                        onValueChange={(val) =>
                          setSelectionMode(val as "single" | "multiple")
                        }
                        options={[
                          { value: "single", label: "Chỉ chọn 1" },
                          { value: "multiple", label: "Chọn nhiều" },
                        ]}
                      />

                      <div className="flex items-center justify-between rounded-xl bg-neutral-50/90 px-3.5 py-2.5 dark:bg-neutral-900">
                        <div>
                          <div className="text-xs font-semibold text-neutral-900 dark:text-white">
                            Bắt buộc chọn
                          </div>
                          <div className="text-[11px] text-neutral-400">
                            Phải chọn trước khi thêm món vào đơn
                          </div>
                        </div>
                        <BeSwitch
                          checked={isRequired}
                          onCheckedChange={(checked) => {
                            setIsRequired(checked);
                            if (checked) {
                              if (Number(minSelections || 0) < 1) {
                                setMinSelections("1");
                              }
                            } else {
                              setMinSelections("0");
                            }
                          }}
                          ariaLabel="Bắt buộc chọn"
                        />
                      </div>

                      <AnimatePresence initial={false}>
                        {selectionMode === "multiple" && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.18 }}
                            className="grid grid-cols-2 gap-3 overflow-hidden pt-1"
                          >
                            <BeInput
                              type="number"
                              min={isRequired ? 1 : 0}
                              label="Chọn tối thiểu"
                              value={minSelections}
                              onChange={(val) => {
                                if (val === "") {
                                  setMinSelections(isRequired ? "1" : "0");
                                  return;
                                }
                                const num = Math.floor(Number(val));
                                if (Number.isNaN(num)) return;
                                const floorLimit = isRequired ? 1 : 0;
                                setMinSelections(String(Math.max(floorLimit, num)));
                              }}
                              error={
                                Number(minSelections || 0) < (isRequired ? 1 : 0)
                                  ? isRequired
                                    ? "Tối thiểu phải ≥ 1"
                                    : "Không được < 0"
                                  : undefined
                              }
                              placeholder={isRequired ? "1" : "0"}
                            />
                            <BeInput
                              type="number"
                              min={isRequired ? 1 : 1}
                              label="Chọn tối đa"
                              value={maxSelections}
                              onChange={(val) => {
                                if (val === "") {
                                  setMaxSelections("");
                                  return;
                                }
                                const num = Math.floor(Number(val));
                                if (Number.isNaN(num)) return;
                                setMaxSelections(String(Math.max(0, num)));
                              }}
                              error={
                                maxSelections.trim() !== "" &&
                                (Number(maxSelections) < 1 ||
                                  Number(maxSelections) < Number(minSelections || 0))
                                  ? "Tối đa phải ≥ tối thiểu"
                                  : undefined
                              }
                              placeholder="Không giới hạn"
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Right 7 cols: Scrollable Option Items List */}
                    <div className="flex min-h-0 flex-col lg:col-span-7">
                      <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                            Danh sách lựa chọn ({items.length})
                          </h4>
                          <p className="text-[11px] text-neutral-400">
                            Thêm tên lựa chọn và giá cộng thêm (nhập 0 nếu miễn phí).
                          </p>
                        </div>
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.96 }}
                          onClick={addDraftItem}
                          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-neutral-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900"
                        >
                          <Plus className="h-3 w-3" />
                          Thêm lựa chọn
                        </motion.button>
                      </div>

                      {/* Clean Column Headers */}
                      <div className="mb-1.5 grid grid-cols-12 items-center gap-2.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                        <span className="col-span-5">Tên lựa chọn *</span>
                        <span className="col-span-4">Giá cộng thêm</span>
                        <span className="col-span-2 text-center whitespace-nowrap">Mặc định</span>
                        <span className="col-span-1 text-right">Xóa</span>
                      </div>

                      <div className="flex-1 min-h-0 space-y-2.5 overflow-y-auto pr-1.5">
                        <AnimatePresence initial={false}>
                          {items.map((it, idx) => (
                            <motion.div
                              key={it.key}
                              layout
                              initial={{ opacity: 0, y: -8, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -6, scale: 0.98 }}
                              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                              className="grid grid-cols-12 items-center gap-2.5 py-0.5"
                            >
                              <div className="col-span-5">
                                <BeInput
                                  value={it.name}
                                  onChange={(val) =>
                                    updateDraftItem(idx, { name: val })
                                  }
                                  placeholder={`Tên lựa chọn #${idx + 1}`}
                                  error={
                                    submitted && !it.name.trim()
                                      ? true
                                      : undefined
                                  }
                                  fieldClassName="h-9 rounded-xl"
                                />
                              </div>
                              <div className="col-span-4">
                                <BeInput
                                  type="number"
                                  min={0}
                                  value={it.price_delta}
                                  onChange={(val) => {
                                    if (val === "") {
                                      updateDraftItem(idx, { price_delta: "0" });
                                      return;
                                    }
                                    const num = Math.max(0, Number(val));
                                    if (!Number.isNaN(num)) {
                                      updateDraftItem(idx, { price_delta: String(num) });
                                    }
                                  }}
                                  placeholder="0"
                                  fieldClassName="h-9 rounded-xl tabular-nums"
                                />
                              </div>
                              <div className="col-span-2 flex items-center justify-center">
                                <motion.button
                                  type="button"
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() =>
                                    updateDraftItem(idx, { is_default: !it.is_default })
                                  }
                                  title={
                                    it.is_default
                                      ? "Đang đặt làm mặc định"
                                      : "Đặt làm lựa chọn mặc định"
                                  }
                                  className={`grid h-7 w-7 place-items-center rounded-full border transition-all ${
                                    it.is_default
                                      ? "border-blue-600 bg-blue-600 text-white shadow-sm ring-4 ring-blue-600/15"
                                      : "border-neutral-300 bg-white text-transparent hover:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800"
                                  }`}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </motion.button>
                              </div>
                              <div className="col-span-1 text-right">
                                {items.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeDraftItem(idx)}
                                    className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div className="flex shrink-0 items-center justify-end gap-2 border-t border-neutral-200/80 px-6 py-3.5 dark:border-neutral-800">
                    <button
                      type="button"
                      onClick={() => setModalOpen(false)}
                      className="rounded-full border border-neutral-200 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300"
                    >
                      Hủy
                    </button>
                    <motion.button
                      type="submit"
                      whileTap={{ scale: 0.97 }}
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
                    >
                      <Check className="h-3.5 w-3.5" />
                      {saving ? "Đang lưu..." : "Lưu Nhóm Tùy Chọn"}
                    </motion.button>
                  </div>
                </div>
              </motion.form>
            </div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
