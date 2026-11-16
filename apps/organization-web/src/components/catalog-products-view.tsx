"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  Check,
  Edit3,
  Image as ImageIcon,
  Layers,
  MoreHorizontal,
  Plus,
  Power,
  Search,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import type { CategoryRecord } from "./catalog-categories-view";
import { AnimatedPagination } from "./motion/pagination";

export interface ProductVariantRow {
  id: string;
  variant_code: string;
  variant_name: string;
  sku?: string | null;
  unit_name: string;
  default_cost?: string | null;
  default_price: string;
  currency_code: string;
  is_default: boolean;
  status: string;
  barcodes?: { id: string; barcode: string; is_primary: boolean }[];
}

export interface ProductImageRow {
  id?: string;
  image_url: string;
  sort_order: number;
  is_primary: boolean;
}

export interface ProductRecord {
  id: string;
  category_id?: string | null;
  category_ids?: string[];
  categories?: { id: string; code?: string | null; name: string }[];
  image_url?: string | null;
  images?: ProductImageRow[];
  product_code: string;
  name: string;
  description?: string | null;
  product_type: string;
  track_inventory: boolean;
  status: string;
  variants: ProductVariantRow[];
}

interface DraftVariant {
  id?: string;
  variant_code: string;
  variant_name: string;
  sku: string;
  unit_name: string;
  default_cost: string;
  default_price: string;
  barcode: string;
  is_default: boolean;
  isNew?: boolean;
}

interface CatalogProductsViewProps {
  products: ProductRecord[];
  categories: CategoryRecord[];
  accessToken: string | null;
  apiFetch: (path: string, options?: RequestInit, token?: string) => Promise<any>;
  onRefresh: () => Promise<void>;
  notify: (type: "success" | "error" | "info", text: string) => void;
  formatMoney: (val: number | string) => string;
}

const PAGE_SIZE = 8;
type EditorTab = "general" | "images" | "variants";

export function CatalogProductsView({
  products,
  categories,
  accessToken,
  apiFetch,
  onRefresh,
  notify,
  formatMoney,
}: CatalogProductsViewProps) {
  const [search, setSearch] = useState("");
  const [filterCatId, setFilterCatId] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [openActionId, setOpenActionId] = useState<string | null>(null);

  // Horizontal Detail / Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTab, setEditorTab] = useState<EditorTab>("general");
  const [editingProd, setEditingProd] = useState<ProductRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);

  const [prodCode, setProdCode] = useState("");
  const [prodName, setProdName] = useState("");
  const [prodDesc, setProdDesc] = useState("");
  const [prodType, setProdType] = useState("stocked");
  const [trackInv, setTrackInv] = useState(true);
  const [prodStatus, setProdStatus] = useState("active");
  const [selectedCatIds, setSelectedCatIds] = useState<string[]>([]);
  const [images, setImages] = useState<ProductImageRow[]>([]);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [variants, setVariants] = useState<DraftVariant[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Close action popover on outside click
  useEffect(() => {
    if (!openActionId) return;
    const close = () => setOpenActionId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [openActionId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      if (filterCatId !== "all") {
        const ids = p.category_ids || (p.category_id ? [p.category_id] : []);
        if (!ids.includes(filterCatId)) return false;
      }
      if (!q) return true;
      const hitProd =
        p.name.toLowerCase().includes(q) ||
        p.product_code.toLowerCase().includes(q);
      const hitVar = (p.variants || []).some(
        (v) =>
          v.variant_name.toLowerCase().includes(q) ||
          (v.sku || "").toLowerCase().includes(q)
      );
      return hitProd || hitVar;
    });
  }, [products, search, filterCatId, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedProducts = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  useEffect(() => {
    setPage(1);
  }, [search, filterCatId, filterStatus]);

  const openCreate = () => {
    const ts = Date.now().toString().slice(-4);
    setEditingProd(null);
    setEditorTab("general");
    setProdCode(`SP-${ts}`);
    setProdName("");
    setProdDesc("");
    setProdType("stocked");
    setTrackInv(true);
    setProdStatus("active");
    setSelectedCatIds(categories[0] ? [categories[0].id] : []);
    setImages([]);
    setImageUrlInput("");
    setVariants([
      {
        variant_code: `SP-${ts}-M`,
        variant_name: "Size M (Tiêu chuẩn)",
        sku: `SKU-${ts}-M`,
        unit_name: "Ly",
        default_cost: "15000",
        default_price: "35000",
        barcode: "",
        is_default: true,
        isNew: true,
      },
    ]);
    setEditorOpen(true);
  };

  const openEdit = (p: ProductRecord) => {
    setOpenActionId(null);
    setEditingProd(p);
    setEditorTab("general");
    setProdCode(p.product_code);
    setProdName(p.name);
    setProdDesc(p.description || "");
    setProdType(p.product_type || "stocked");
    setTrackInv(p.track_inventory);
    setProdStatus(p.status || "active");
    setSelectedCatIds(
      p.category_ids && p.category_ids.length > 0
        ? p.category_ids
        : p.category_id
          ? [p.category_id]
          : []
    );
    setImages(
      p.images && p.images.length > 0
        ? p.images
        : p.image_url
          ? [{ image_url: p.image_url, sort_order: 0, is_primary: true }]
          : []
    );
    setImageUrlInput("");
    setVariants(
      (p.variants || []).map((v) => ({
        id: v.id,
        variant_code: v.variant_code,
        variant_name: v.variant_name,
        sku: v.sku || "",
        unit_name: v.unit_name || "Cái",
        default_cost: v.default_cost ? String(Math.round(Number(v.default_cost))) : "",
        default_price: String(Math.round(Number(v.default_price || 0))),
        barcode: v.barcodes?.[0]?.barcode || "",
        is_default: v.is_default,
        isNew: false,
      }))
    );
    setEditorOpen(true);
  };

  const toggleCategory = (cid: string) => {
    setSelectedCatIds((prev) =>
      prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid]
    );
  };

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingImg(true);
    try {
      for (const file of Array.from(files)) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("Không thể đọc file ảnh"));
          reader.readAsDataURL(file);
        });
        const uploaded = await apiFetch(
          "/api/v1/products/upload-image",
          {
            method: "POST",
            body: JSON.stringify({
              filename: file.name,
              content_base64: dataUrl,
            }),
          },
          accessToken || undefined
        );
        setImages((prev) => [
          ...prev,
          {
            image_url: uploaded.image_url,
            sort_order: prev.length,
            is_primary: prev.length === 0,
          },
        ]);
      }
      notify("success", "Đã tải ảnh sản phẩm lên thành công!");
    } catch (err: any) {
      notify("error", err?.message || "Lỗi tải ảnh");
    } finally {
      setUploadingImg(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAddImageUrl = () => {
    const clean = imageUrlInput.trim();
    if (!clean) return;
    setImages((prev) => [
      ...prev,
      {
        image_url: clean,
        sort_order: prev.length,
        is_primary: prev.length === 0,
      },
    ]);
    setImageUrlInput("");
  };

  const setPrimaryImage = (idx: number) => {
    setImages((prev) =>
      prev.map((im, i) => ({ ...im, is_primary: i === idx }))
    );
  };

  const removeImage = (idx: number) => {
    setImages((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length > 0 && !next.some((x) => x.is_primary)) {
        next[0] = { ...next[0], is_primary: true };
      }
      return next;
    });
  };

  const addDraftVariant = () => {
    const idx = variants.length + 1;
    const baseCode = (prodCode || "SP").trim().toUpperCase();
    setVariants((prev) => [
      ...prev,
      {
        variant_code: `${baseCode}-V${idx}-${Date.now().toString().slice(-3)}`,
        variant_name: `Biến thể ${idx}`,
        sku: `SKU-${baseCode}-${idx}`,
        unit_name: "Ly",
        default_cost: "15000",
        default_price: "39000",
        barcode: "",
        is_default: prev.length === 0,
        isNew: true,
      },
    ]);
  };

  const updateDraftVariant = (idx: number, patch: Partial<DraftVariant>) => {
    setVariants((prev) =>
      prev.map((v, i) => (i === idx ? { ...v, ...patch } : v))
    );
  };

  const removeDraftVariant = (idx: number) => {
    if (variants.length <= 1) {
      notify("error", "Mỗi sản phẩm cần ít nhất 1 biến thể.");
      return;
    }
    setVariants((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName.trim() || !prodCode.trim() || variants.length === 0) {
      setEditorTab("general");
      notify("error", "Vui lòng nhập đầy đủ tên, mã sản phẩm và ít nhất 1 biến thể.");
      return;
    }

    setSaving(true);
    try {
      const imagePayload = images.map((im, i) => ({
        image_url: im.image_url,
        sort_order: i,
        is_primary: im.is_primary,
      }));

      if (!editingProd) {
        await apiFetch(
          "/api/v1/products",
          {
            method: "POST",
            body: JSON.stringify({
              category_ids: selectedCatIds,
              product_code: prodCode.trim().toUpperCase(),
              name: prodName.trim(),
              description: prodDesc.trim() || undefined,
              product_type: prodType,
              track_inventory: trackInv,
              images: imagePayload,
              variants: variants.map((v, i) => ({
                variant_code: v.variant_code.trim().toUpperCase(),
                variant_name: v.variant_name.trim(),
                sku: v.sku.trim().toUpperCase() || undefined,
                unit_name: v.unit_name.trim() || "Cái",
                default_cost: v.default_cost.trim() || undefined,
                default_price: v.default_price.trim() || "0",
                is_default: i === 0 ? true : v.is_default,
                barcodes: v.barcode.trim()
                  ? [{ barcode: v.barcode.trim(), is_primary: true }]
                  : [],
              })),
            }),
          },
          accessToken || undefined
        );
        notify("success", `Đã tạo sản phẩm "${prodName.trim()}" (${variants.length} biến thể)!`);
      } else {
        await apiFetch(
          `/api/v1/products/${editingProd.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              name: prodName.trim(),
              description: prodDesc.trim() || null,
              product_type: prodType,
              track_inventory: trackInv,
              status: prodStatus,
              category_ids: selectedCatIds,
              images: imagePayload,
            }),
          },
          accessToken || undefined
        );

        for (const v of variants) {
          if (v.isNew || !v.id) {
            await apiFetch(
              `/api/v1/products/${editingProd.id}/variants`,
              {
                method: "POST",
                body: JSON.stringify({
                  variant_code: v.variant_code.trim().toUpperCase(),
                  variant_name: v.variant_name.trim(),
                  sku: v.sku.trim().toUpperCase() || undefined,
                  unit_name: v.unit_name.trim() || "Cái",
                  default_cost: v.default_cost.trim() || undefined,
                  default_price: v.default_price.trim() || "0",
                  is_default: false,
                  barcodes: v.barcode.trim()
                    ? [{ barcode: v.barcode.trim(), is_primary: true }]
                    : [],
                }),
              },
              accessToken || undefined
            );
          } else {
            await apiFetch(
              `/api/v1/products/${editingProd.id}/variants/${v.id}`,
              {
                method: "PATCH",
                body: JSON.stringify({
                  variant_name: v.variant_name.trim(),
                  sku: v.sku.trim().toUpperCase() || undefined,
                  unit_name: v.unit_name.trim() || "Cái",
                  default_cost: v.default_cost.trim() || "",
                  default_price: v.default_price.trim() || "0",
                }),
              },
              accessToken || undefined
            );
          }
        }
        notify("success", `Đã cập nhật sản phẩm "${prodName.trim()}"!`);
      }

      setEditorOpen(false);
      await onRefresh();
    } catch (err: any) {
      notify("error", err?.message || "Không thể lưu sản phẩm");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleProductStatus = async (p: ProductRecord) => {
    setOpenActionId(null);
    const nextStatus = p.status === "active" ? "inactive" : "active";
    try {
      await apiFetch(
        `/api/v1/products/${p.id}`,
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
          ? `Đã mở bán lại "${p.name}".`
          : `Đã tạm ngừng bán "${p.name}".`
      );
    } catch (err: any) {
      notify("error", err?.message || "Lỗi cập nhật trạng thái");
    }
  };

  const handleArchiveProduct = async (p: ProductRecord) => {
    setOpenActionId(null);
    if (!confirm(`Lưu trữ sản phẩm "${p.name}"?`)) return;
    try {
      await apiFetch(
        `/api/v1/products/${p.id}/archive`,
        { method: "POST" },
        accessToken || undefined
      );
      await onRefresh();
      notify("success", `Đã lưu trữ sản phẩm "${p.name}".`);
    } catch (err: any) {
      notify("error", err?.message || "Lỗi lưu trữ sản phẩm");
    }
  };

  // ===========================================================================
  // HORIZONTAL FORM VIEW (WHEN CREATING OR EDITING A PRODUCT)
  // ===========================================================================
  if (editorOpen) {
    return (
      <motion.form
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        onSubmit={handleSaveProduct}
        className="flex h-full flex-col justify-between gap-4"
      >
        {/* Top Horizontal Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-200/80 bg-white px-5 py-3.5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setEditorOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-neutral-900 dark:text-white">
                {editingProd ? `Chi tiết sản phẩm: ${editingProd.name}` : "Thêm Sản Phẩm Mới"}
              </h2>
              <p className="text-[11px] text-neutral-500">
                Chọn từng mục bên dưới để chỉnh sửa theo chiều ngang gọn gàng.
              </p>
            </div>
          </div>

          {/* Horizontal Section Switcher (Animated Pills) */}
          <div className="flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-100 p-1 dark:border-neutral-700 dark:bg-neutral-800">
            {[
              { id: "general", label: `1. Thông tin & Danh mục (${selectedCatIds.length})` },
              { id: "images", label: `2. Hình ảnh (${images.length})` },
              { id: "variants", label: `3. Biến thể (${variants.length})` },
            ].map((t) => {
              const active = editorTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setEditorTab(t.id as EditorTab)}
                  className={`relative rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? "text-white dark:text-neutral-900"
                      : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="product-editor-tab-pill"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      className="absolute inset-0 rounded-full bg-neutral-900 shadow-sm dark:bg-white"
                    />
                  )}
                  <span className="relative">{t.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditorOpen(false)}
              className="rounded-full border border-neutral-200 px-4 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-neutral-900 px-5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
            >
              {saving ? "Đang lưu..." : editingProd ? "Lưu Thay Đổi" : "Tạo Sản Phẩm"}
            </button>
          </div>
        </div>

        {/* Horizontal Tab Content */}
        <div className="flex-1 overflow-y-auto rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <AnimatePresence mode="wait">
            {editorTab === "general" && (
              <motion.div
                key="tab-general"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.16 }}
                className="grid grid-cols-1 gap-6 lg:grid-cols-12"
              >
                {/* Left 7 cols: General Fields */}
                <div className="space-y-4 lg:col-span-7">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        Tên sản phẩm *
                      </label>
                      <input
                        type="text"
                        required
                        value={prodName}
                        onChange={(e) => setProdName(e.target.value)}
                        placeholder="VD: Trà Đào Cam Sả Đặc Biệt"
                        className="w-full rounded-xl border border-neutral-300 px-3.5 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        Mã sản phẩm *
                      </label>
                      <input
                        type="text"
                        required
                        disabled={Boolean(editingProd)}
                        value={prodCode}
                        onChange={(e) => setProdCode(e.target.value)}
                        className="w-full rounded-xl border border-neutral-300 px-3.5 py-2 font-mono text-xs text-neutral-900 disabled:bg-neutral-100 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                      Mô tả sản phẩm
                    </label>
                    <textarea
                      rows={3}
                      value={prodDesc}
                      onChange={(e) => setProdDesc(e.target.value)}
                      placeholder="Thành phần, định lượng pha chế hoặc thông tin nổi bật..."
                      className="w-full rounded-xl border border-neutral-300 px-3.5 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        Loại hàng hóa
                      </label>
                      <select
                        value={prodType}
                        onChange={(e) => setProdType(e.target.value)}
                        className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                      >
                        <option value="stocked">Hàng có tồn kho</option>
                        <option value="non_stocked">Pha chế / Không trừ kho</option>
                        <option value="service">Dịch vụ / Phụ thu</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        Trạng thái bán
                      </label>
                      <select
                        value={prodStatus}
                        disabled={!editingProd}
                        onChange={(e) => setProdStatus(e.target.value)}
                        className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs text-neutral-900 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                      >
                        <option value="active">Đang bán</option>
                        <option value="inactive">Ngừng bán</option>
                        <option value="archived">Lưu trữ</option>
                      </select>
                    </div>

                    <div className="flex items-end">
                      <label className="flex w-full items-center justify-between rounded-xl border border-neutral-300 px-3 py-2 text-xs dark:border-neutral-700">
                        <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                          Theo dõi tồn kho
                        </span>
                        <input
                          type="checkbox"
                          checked={trackInv}
                          onChange={(e) => setTrackInv(e.target.checked)}
                          className="h-4 w-4 accent-neutral-900"
                        />
                      </label>
                    </div>
                  </div>
                </div>

                {/* Right 5 cols: Multi-Category Selection */}
                <div className="rounded-2xl border border-neutral-200/80 bg-neutral-50/70 p-4 lg:col-span-5 dark:border-neutral-800 dark:bg-neutral-800/40">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                        Gắn Danh Mục ({selectedCatIds.length} đã chọn)
                      </h4>
                      <p className="text-[11px] text-neutral-500">
                        1 sản phẩm có thể thuộc nhiều danh mục cùng lúc.
                      </p>
                    </div>
                  </div>

                  {categories.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-center text-xs text-neutral-500">
                      Chưa có danh mục nào.
                    </div>
                  ) : (
                    <div className="grid max-h-60 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                      {categories.map((cat) => {
                        const checked = selectedCatIds.includes(cat.id);
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => toggleCategory(cat.id)}
                            className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left text-xs transition-all ${
                              checked
                                ? "border-neutral-900 bg-neutral-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-neutral-900"
                                : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
                            }`}
                          >
                            <span className="truncate pr-2 font-medium">{cat.name}</span>
                            <span
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                checked
                                  ? "border-white bg-white/20 dark:border-neutral-900"
                                  : "border-neutral-300 dark:border-neutral-600"
                              }`}
                            >
                              {checked && <Check className="h-3 w-3" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {editorTab === "images" && (
              <motion.div
                key="tab-images"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.16 }}
                className="space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-neutral-900 dark:text-white">
                      Thư Viện Hình Ảnh ({images.length} ảnh)
                    </h4>
                    <p className="text-xs text-neutral-500">
                      Tải lên từ máy hoặc dán URL ảnh. Bấm biểu tượng ngôi sao để chọn ảnh đại diện chính trên quầy POS.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => handleUploadFiles(e.target.files)}
                    />
                    <button
                      type="button"
                      disabled={uploadingImg}
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {uploadingImg ? "Đang tải..." : "Tải ảnh lên"}
                    </button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={imageUrlInput}
                    onChange={(e) => setImageUrlInput(e.target.value)}
                    placeholder="Hoặc dán URL hình ảnh (https://...)"
                    className="flex-1 rounded-xl border border-neutral-300 px-3.5 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={handleAddImageUrl}
                    className="rounded-xl border border-neutral-300 bg-neutral-100 px-4 py-2 text-xs font-bold text-neutral-800 hover:bg-neutral-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  >
                    Thêm URL
                  </button>
                </div>

                {images.length === 0 ? (
                  <div className="flex h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 text-xs text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800/40">
                    <ImageIcon className="mb-2 h-7 w-7 text-neutral-400" />
                    Chưa có hình ảnh nào cho sản phẩm này.
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                    {images.map((im, idx) => (
                      <div
                        key={`${im.image_url}-${idx}`}
                        className={`group relative aspect-square overflow-hidden rounded-2xl border-2 ${
                          im.is_primary
                            ? "border-emerald-500 ring-2 ring-emerald-500/20"
                            : "border-neutral-200 dark:border-neutral-700"
                        }`}
                      >
                        <img
                          src={im.image_url}
                          alt={`Ảnh ${idx + 1}`}
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setPrimaryImage(idx)}
                          title="Đặt làm ảnh chính"
                          className={`absolute left-1.5 top-1.5 rounded-lg p-1.5 ${
                            im.is_primary
                              ? "bg-emerald-500 text-white"
                              : "bg-black/55 text-white/80 hover:bg-black/80"
                          }`}
                        >
                          <Star className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeImage(idx)}
                          title="Xóa ảnh"
                          className="absolute right-1.5 top-1.5 rounded-lg bg-black/55 p-1.5 text-white hover:bg-rose-600"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {editorTab === "variants" && (
              <motion.div
                key="tab-variants"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.16 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-neutral-900 dark:text-white">
                      Danh Sách Biến Thể ({variants.length})
                    </h4>
                    <p className="text-xs text-neutral-500">
                      Mỗi biến thể (Size M, L, Đóng gói...) có mã SKU, giá vốn và giá bán riêng.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addDraftVariant}
                    className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Thêm biến thể
                  </button>
                </div>

                <div className="overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold uppercase text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-400">
                        <th className="px-3 py-2.5">Tên biến thể *</th>
                        <th className="px-3 py-2.5">Mã SKU</th>
                        <th className="px-3 py-2.5 w-24">Đơn vị</th>
                        <th className="px-3 py-2.5 w-32">Giá vốn (₫)</th>
                        <th className="px-3 py-2.5 w-32">Giá bán (₫) *</th>
                        <th className="px-3 py-2.5 w-12 text-right">Xóa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                      {variants.map((v, idx) => (
                        <tr key={v.id || `draft-${idx}`}>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              required
                              value={v.variant_name}
                              onChange={(e) =>
                                updateDraftVariant(idx, { variant_name: e.target.value })
                              }
                              className="w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={v.sku}
                              onChange={(e) =>
                                updateDraftVariant(idx, { sku: e.target.value })
                              }
                              className="w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={v.unit_name}
                              onChange={(e) =>
                                updateDraftVariant(idx, { unit_name: e.target.value })
                              }
                              className="w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={v.default_cost}
                              onChange={(e) =>
                                updateDraftVariant(idx, { default_cost: e.target.value })
                              }
                              className="w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              required
                              value={v.default_price}
                              onChange={(e) =>
                                updateDraftVariant(idx, { default_price: e.target.value })
                              }
                              className="w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-bold dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            {v.isNew && variants.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeDraftVariant(idx)}
                                className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.form>
    );
  }

  // ===========================================================================
  // COMPACT 8-ROW TABLE VIEW + BEUI ANIMATED PAGINATION (NO PAGE SCROLL)
  // ===========================================================================
  return (
    <div className="flex flex-col gap-3">
      {/* Compact Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">
            Quản Lý Sản Phẩm & Biến Thể
          </h1>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            Hiển thị {pagedProducts.length} / {filtered.length} sản phẩm (tối đa 8 sản phẩm mỗi trang).
          </p>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          <Plus className="h-3.5 w-3.5" />
          Thêm Sản Phẩm
        </button>
      </div>

      {/* Compact Filter Bar */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-neutral-200/80 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-1 min-w-[200px] items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-800">
          <Search className="h-3.5 w-3.5 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm tên sản phẩm, mã SP, SKU..."
            className="w-full bg-transparent text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:text-white"
          />
        </div>

        <select
          value={filterCatId}
          onChange={(e) => setFilterCatId(e.target.value)}
          className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
        >
          <option value="all">Tất cả danh mục</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
        >
          <option value="all">Mọi trạng thái</option>
          <option value="active">Đang bán</option>
          <option value="inactive">Ngừng bán</option>
          <option value="archived">Đã lưu trữ</option>
        </select>
      </div>

      {/* Fixed-layout Table: fits 8 rows cleanly with strict truncation */}
      <div className="overflow-visible rounded-2xl border border-neutral-200/80 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full table-fixed text-left text-xs">
          <thead>
            <tr className="border-b border-neutral-200/80 bg-neutral-50/70 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-400">
              <th className="w-[30%] px-4 py-2.5">Sản phẩm</th>
              <th className="w-[24%] px-3 py-2.5">Danh mục</th>
              <th className="w-[17%] px-3 py-2.5">Biến thể</th>
              <th className="w-[14%] px-3 py-2.5">Khoảng giá</th>
              <th className="w-[9%] px-3 py-2.5">Trạng thái</th>
              <th className="w-[6%] px-3 py-2.5 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {pagedProducts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-xs text-neutral-500">
                  Không có sản phẩm nào phù hợp.
                </td>
              </tr>
            ) : (
              pagedProducts.map((p) => {
                const prices = (p.variants || []).map((v) => Number(v.default_price || 0));
                const minPrice = prices.length ? Math.min(...prices) : 0;
                const maxPrice = prices.length ? Math.max(...prices) : 0;
                const catTags = p.categories || [];
                const visibleCats = catTags.slice(0, 2);
                const extraCatCount = Math.max(0, catTags.length - 2);
                const imgCount = p.images?.length || (p.image_url ? 1 : 0);
                const variantNames = (p.variants || []).map((v) => v.variant_name).join(", ");
                const priceText =
                  minPrice === maxPrice
                    ? formatMoney(minPrice)
                    : `${formatMoney(minPrice)} – ${formatMoney(maxPrice)}`;

                return (
                  <tr
                    key={p.id}
                    className="h-[52px] transition-colors hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40"
                  >
                    {/* Product Name + Code + Thumbnail */}
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800">
                          {p.image_url ? (
                            <img
                              src={p.image_url}
                              alt={p.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="h-3.5 w-3.5 text-neutral-400" />
                          )}
                          {imgCount > 1 && (
                            <span className="absolute bottom-0 right-0 rounded-tl bg-black/75 px-1 text-[8px] font-bold text-white">
                              +{imgCount - 1}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div
                            title={p.name}
                            onClick={() => openEdit(p)}
                            className="cursor-pointer truncate font-bold text-neutral-900 hover:underline dark:text-white"
                          >
                            {p.name}
                          </div>
                          <div
                            title={p.product_code}
                            className="truncate font-mono text-[10px] text-neutral-400"
                          >
                            {p.product_code}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Categories: Max 2 pills + (+n) */}
                    <td className="px-3 py-2">
                      <div
                        title={catTags.map((c) => c.name).join(", ")}
                        className="flex items-center gap-1 overflow-hidden"
                      >
                        {catTags.length === 0 ? (
                          <span className="truncate text-[11px] text-neutral-400">
                            Chưa phân loại
                          </span>
                        ) : (
                          <>
                            {visibleCats.map((ct) => (
                              <span
                                key={ct.id}
                                className="max-w-[92px] truncate rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                              >
                                {ct.name}
                              </span>
                            ))}
                            {extraCatCount > 0 && (
                              <span className="shrink-0 rounded-full bg-neutral-900 px-1.5 py-0.5 text-[10px] font-bold text-white dark:bg-white dark:text-neutral-900">
                                +{extraCatCount}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </td>

                    {/* Variants */}
                    <td className="px-3 py-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 font-semibold text-neutral-800 dark:text-neutral-200">
                          <Layers className="h-3 w-3 shrink-0 text-neutral-400" />
                          <span className="truncate">{p.variants?.length || 0} biến thể</span>
                        </div>
                        <div
                          title={variantNames}
                          className="truncate text-[10px] text-neutral-400"
                        >
                          {variantNames || "--"}
                        </div>
                      </div>
                    </td>

                    {/* Price */}
                    <td className="px-3 py-2">
                      <div
                        title={priceText}
                        className="truncate font-bold text-neutral-900 dark:text-white"
                      >
                        {priceText}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          p.status === "active"
                            ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                            : "border border-neutral-200 bg-neutral-100 text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400"
                        }`}
                      >
                        {p.status === "active"
                          ? "Đang bán"
                          : p.status === "inactive"
                            ? "Ngừng bán"
                            : "Lưu trữ"}
                      </span>
                    </td>

                    {/* Clean Action Menu Popover */}
                    <td className="relative px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenActionId((prev) => (prev === p.id ? null : p.id));
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                        title="Thao tác"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>

                      <AnimatePresence>
                        {openActionId === p.id && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -4 }}
                            transition={{ duration: 0.12 }}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-3 top-10 z-30 w-44 rounded-xl border border-neutral-200 bg-white p-1.5 text-left shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
                          >
                            <button
                              type="button"
                              onClick={() => openEdit(p)}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              Chi tiết & Biến thể
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleProductStatus(p)}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                            >
                              <Power className="h-3.5 w-3.5" />
                              {p.status === "active" ? "Ngừng bán" : "Mở bán lại"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleArchiveProduct(p)}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Lưu trữ
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer with beUI Animated Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-200/80 bg-white px-4 py-2 dark:border-neutral-800 dark:bg-neutral-900">
        <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
          Trang <strong className="text-neutral-900 dark:text-white">{safePage}</strong> / {totalPages} • Tổng {filtered.length} sản phẩm
        </span>

        <AnimatedPagination
          totalPages={totalPages}
          page={safePage}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
