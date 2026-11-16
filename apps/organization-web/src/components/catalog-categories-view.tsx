"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Edit3, FolderTree, Plus, Search, X } from "lucide-react";
import { BeInput } from "./motion/input";
import { BeSelect } from "./motion/select";
import { BeSwitch } from "./motion/switch";

export interface CategoryRecord {
  id: string;
  organization_id: string;
  parent_category_id?: string | null;
  code?: string | null;
  name: string;
  sort_order: number;
  status: string;
  product_count?: number;
}

interface CatalogCategoriesViewProps {
  categories: CategoryRecord[];
  accessToken: string | null;
  apiFetch: (path: string, options?: RequestInit, token?: string) => Promise<any>;
  onRefresh: () => Promise<void>;
  notify: (type: "success" | "error" | "info", text: string) => void;
}

export function CatalogCategoriesView({
  categories,
  accessToken,
  apiFetch,
  onRefresh,
  notify,
}: CatalogCategoriesViewProps) {
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  const catNameMap = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [categories]);

  const parentOptions = useMemo(() => {
    return [
      { value: "", label: "-- Danh mục gốc --" },
      ...categories
        .filter((c) => !editing || c.id !== editing.id)
        .map((c) => ({ value: c.id, label: c.name })),
    ];
  }, [categories, editing]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categories.filter((c) => {
      if (!q) return true;
      return c.name.toLowerCase().includes(q);
    });
  }, [categories, search]);

  const openCreate = () => {
    setEditing(null);
    setSubmitted(false);
    setName("");
    setParentId("");
    setIsActive(true);
    setModalOpen(true);
  };

  const openEdit = (cat: CategoryRecord) => {
    setEditing(cat);
    setSubmitted(false);
    setName(cat.name);
    setParentId(cat.parent_category_id || "");
    setIsActive((cat.status || "active") === "active");
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await apiFetch(
          `/api/v1/categories/${editing.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              name: name.trim(),
              parent_category_id: parentId || null,
              status: isActive ? "active" : "inactive",
            }),
          },
          accessToken || undefined
        );
        notify("success", `Đã cập nhật danh mục "${name.trim()}"!`);
      } else {
        await apiFetch(
          "/api/v1/categories",
          {
            method: "POST",
            body: JSON.stringify({
              name: name.trim(),
              parent_category_id: parentId || null,
            }),
          },
          accessToken || undefined
        );
        notify("success", `Đã tạo danh mục "${name.trim()}"!`);
      }
      setModalOpen(false);
      await onRefresh();
    } catch (err: any) {
      notify("error", err?.message || "Không thể lưu danh mục");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (cat: CategoryRecord) => {
    const nextStatus = cat.status === "active" ? "inactive" : "active";
    try {
      await apiFetch(
        `/api/v1/categories/${cat.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: nextStatus }),
        },
        accessToken || undefined
      );
      await onRefresh();
      notify(
        "success",
        nextStatus === "active"
          ? `Đã kích hoạt lại danh mục "${cat.name}"`
          : `Đã tạm ẩn danh mục "${cat.name}"`
      );
    } catch (err: any) {
      notify("error", err?.message || "Lỗi cập nhật trạng thái danh mục");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-5"
    >
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Quản Lý Danh Mục Sản Phẩm
          </h1>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            Phân nhóm thực đơn & hàng hóa (1 sản phẩm có thể gắn nhiều danh mục cùng lúc).
          </p>
        </div>

        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          <Plus className="h-3.5 w-3.5" />
          Thêm Danh Mục
        </motion.button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200/80 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-800">
          <Search className="h-3.5 w-3.5 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên danh mục..."
            className="w-full bg-transparent text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:text-white"
          />
        </div>
        <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          Tổng:{" "}
          <strong className="text-neutral-900 dark:text-white">
            {filtered.length}
          </strong>{" "}
          danh mục
        </div>
      </div>

      {/* Clean Data Table */}
      <div className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-200/80 bg-neutral-50/70 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-400">
                <th className="px-4 py-3">Tên danh mục</th>
                <th className="px-4 py-3">Danh mục cha</th>
                <th className="px-4 py-3 text-center">Số sản phẩm</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-xs text-neutral-500"
                  >
                    Chưa có danh mục nào. Bấm &ldquo;+ Thêm Danh Mục&rdquo; để bắt đầu.
                  </td>
                </tr>
              ) : (
                filtered.map((cat) => (
                  <tr
                    key={cat.id}
                    className="transition-colors hover:bg-neutral-50/70 dark:hover:bg-neutral-800/40"
                  >
                    <td className="px-4 py-3 font-semibold text-neutral-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                          <FolderTree className="h-3.5 w-3.5" />
                        </span>
                        <span>{cat.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">
                      {cat.parent_category_id
                        ? catNameMap.get(cat.parent_category_id) || "--"
                        : "Danh mục gốc"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-bold text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
                        {cat.product_count ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          cat.status === "active"
                            ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                            : "border border-neutral-200 bg-neutral-100 text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400"
                        }`}
                      >
                        {cat.status === "active" ? "Đang hoạt động" : "Tạm ẩn"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(cat)}
                          className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                        >
                          <Edit3 className="h-3 w-3" />
                          Sửa
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(cat)}
                          className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                        >
                          {cat.status === "active" ? "Ẩn" : "Bật"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Category Modal (beUI Spring + Blur Backdrop) */}
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
                onSubmit={handleSubmit}
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
                className="pointer-events-auto flex w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-neutral-200/80 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950"
              >
                {/* Modal Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-neutral-200/80 px-6 py-4 dark:border-neutral-800">
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                      {editing
                        ? `Chỉnh sửa danh mục: ${editing.name}`
                        : "Thêm Danh Mục Mới"}
                    </h3>
                    <p className="text-[11px] text-neutral-400">
                      Phân loại thực đơn & nhóm hàng hóa hiển thị trên POS.
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

                {/* Modal Body */}
                <div className="space-y-4 p-6">
                  <BeInput
                    label="Tên danh mục *"
                    value={name}
                    onChange={setName}
                    placeholder="VD: Trà Trái Cây, Bánh Ngọt, Best Seller..."
                    success={Boolean(name.trim())}
                    error={
                      submitted && !name.trim()
                        ? "Vui lòng nhập tên danh mục."
                        : undefined
                    }
                  />

                  <BeSelect
                    label="Danh mục cha (tùy chọn)"
                    value={parentId}
                    onValueChange={setParentId}
                    options={parentOptions}
                  />

                  {editing && (
                    <div className="flex items-center justify-between rounded-xl bg-neutral-50/90 px-3.5 py-2.5 dark:bg-neutral-900">
                      <div>
                        <div className="text-xs font-semibold text-neutral-900 dark:text-white">
                          Trạng thái hoạt động
                        </div>
                        <div className="text-[11px] text-neutral-400">
                          Cho phép hiển thị danh mục này trên màn hình bán hàng POS
                        </div>
                      </div>
                      <BeSwitch
                        checked={isActive}
                        onCheckedChange={setIsActive}
                        ariaLabel="Trạng thái hoạt động"
                      />
                    </div>
                  )}
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
                    {saving
                      ? "Đang lưu..."
                      : editing
                        ? "Cập Nhật Danh Mục"
                        : "Lưu Danh Mục"}
                  </motion.button>
                </div>
              </motion.form>
            </div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
