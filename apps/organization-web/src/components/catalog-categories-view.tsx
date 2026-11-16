"use client";

import React, { useMemo, useState } from "react";
import { Edit3, FolderTree, Plus, Search, X } from "lucide-react";

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

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [parentId, setParentId] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [statusVal, setStatusVal] = useState("active");

  const catNameMap = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [categories]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categories.filter((c) => {
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.code || "").toLowerCase().includes(q)
      );
    });
  }, [categories, search]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setCode("");
    setParentId("");
    setSortOrder(String(categories.length + 1));
    setStatusVal("active");
    setModalOpen(true);
  };

  const openEdit = (cat: CategoryRecord) => {
    setEditing(cat);
    setName(cat.name);
    setCode(cat.code || "");
    setParentId(cat.parent_category_id || "");
    setSortOrder(String(cat.sort_order ?? 0));
    setStatusVal(cat.status || "active");
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
              code: code.trim() ? code.trim().toUpperCase() : null,
              parent_category_id: parentId || null,
              sort_order: Number(sortOrder) || 0,
              status: statusVal,
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
              code: code.trim() ? code.trim().toUpperCase() : undefined,
              parent_category_id: parentId || null,
              sort_order: Number(sortOrder) || 0,
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
    <div className="space-y-5">
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

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          <Plus className="h-3.5 w-3.5" />
          Thêm Danh Mục
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200/80 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-800">
          <Search className="h-3.5 w-3.5 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên hoặc mã danh mục..."
            className="w-full bg-transparent text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:text-white"
          />
        </div>
        <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          Tổng: <strong className="text-neutral-900 dark:text-white">{filtered.length}</strong> danh mục
        </div>
      </div>

      {/* Clean Data Table */}
      <div className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-200/80 bg-neutral-50/70 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-400">
                <th className="px-4 py-3">Tên danh mục</th>
                <th className="px-4 py-3">Mã</th>
                <th className="px-4 py-3">Danh mục cha</th>
                <th className="px-4 py-3 text-center">Số sản phẩm</th>
                <th className="px-4 py-3 text-center">Thứ tự</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-xs text-neutral-500">
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
                    <td className="px-4 py-3 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                      {cat.code || "--"}
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">
                      {cat.parent_category_id ? catNameMap.get(cat.parent_category_id) || "--" : "Danh mục gốc"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-bold text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
                        {cat.product_count ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums text-neutral-600 dark:text-neutral-300">
                      {cat.sort_order}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          cat.status === "active"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800"
                            : "bg-neutral-100 text-neutral-500 border border-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-700"
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
                          className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                        >
                          <Edit3 className="h-3 w-3" />
                          Sửa
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(cat)}
                          className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
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

      {/* Create / Edit Category Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                {editing ? "Chỉnh Sửa Danh Mục" : "Thêm Danh Mục Mới"}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Tên danh mục *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="VD: Trà Trái Cây, Bánh Ngọt, Best Seller..."
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Mã danh mục
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="VD: TRA-TRAI-CAY"
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Thứ tự hiển thị
                  </label>
                  <input
                    type="number"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Danh mục cha (tùy chọn)
                </label>
                <select
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                >
                  <option value="">-- Danh mục gốc --</option>
                  {categories
                    .filter((c) => !editing || c.id !== editing.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>

              {editing && (
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Trạng thái
                  </label>
                  <select
                    value={statusVal}
                    onChange={(e) => setStatusVal(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  >
                    <option value="active">Đang hoạt động</option>
                    <option value="inactive">Tạm ẩn</option>
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-neutral-200 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
                >
                  {saving ? "Đang lưu..." : editing ? "Cập nhật" : "Tạo danh mục"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

