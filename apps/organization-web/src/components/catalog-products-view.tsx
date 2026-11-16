"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  Check,
  Edit3,
  Image as ImageIcon,
  Layers,
  Plus,
  Search,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { CategoryRecord } from "./catalog-categories-view";

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

  // Editor modal state
  const [editorOpen, setEditorOpen] = useState(false);
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

  const openCreate = () => {
    const ts = Date.now().toString().slice(-4);
    setEditingProd(null);
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
    setEditingProd(p);
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
    if (!prodName.trim() || !prodCode.trim() || variants.length === 0) return;

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

        // Update existing variants or create newly added ones
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

  const handleArchiveProduct = async (p: ProductRecord) => {
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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Quản Lý Sản Phẩm & Biến Thể
          </h1>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            Hỗ trợ gắn nhiều danh mục, nhiều hình ảnh và nhiều biến thể (Size, đơn vị, giá bán) cho từng sản phẩm.
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

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-neutral-200/80 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-1 min-w-[220px] items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-800">
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

      {/* Shopify-style Products Data Table */}
      <div className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-200/80 bg-neutral-50/70 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-400">
                <th className="px-4 py-3">Sản phẩm</th>
                <th className="px-4 py-3">Danh mục</th>
                <th className="px-4 py-3">Biến thể</th>
                <th className="px-4 py-3">Khoảng giá</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-xs text-neutral-500">
                    Không có sản phẩm nào phù hợp.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const prices = (p.variants || []).map((v) => Number(v.default_price || 0));
                  const minPrice = prices.length ? Math.min(...prices) : 0;
                  const maxPrice = prices.length ? Math.max(...prices) : 0;
                  const catTags = p.categories || [];
                  const imgCount = p.images?.length || (p.image_url ? 1 : 0);

                  return (
                    <tr
                      key={p.id}
                      className="transition-colors hover:bg-neutral-50/70 dark:hover:bg-neutral-800/40"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800">
                            {p.image_url ? (
                              <img
                                src={p.image_url}
                                alt={p.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <ImageIcon className="h-4 w-4 text-neutral-400" />
                            )}
                            {imgCount > 1 && (
                              <span className="absolute bottom-0.5 right-0.5 rounded bg-black/75 px-1 text-[9px] font-bold text-white">
                                +{imgCount - 1}
                              </span>
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-neutral-900 dark:text-white">
                              {p.name}
                            </div>
                            <div className="font-mono text-[10px] text-neutral-400">
                              {p.product_code}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-[220px]">
                          {catTags.length === 0 ? (
                            <span className="text-[11px] text-neutral-400">Chưa phân loại</span>
                          ) : (
                            catTags.map((ct) => (
                              <span
                                key={ct.id}
                                className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                              >
                                {ct.name}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Layers className="h-3.5 w-3.5 text-neutral-400" />
                          <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                            {p.variants?.length || 0} biến thể
                          </span>
                        </div>
                        <div className="text-[10px] text-neutral-400 truncate max-w-[180px]">
                          {(p.variants || []).map((v) => v.variant_name).join(", ")}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-bold text-neutral-900 dark:text-white">
                        {minPrice === maxPrice
                          ? formatMoney(minPrice)
                          : `${formatMoney(minPrice)} – ${formatMoney(maxPrice)}`}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
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
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                          >
                            <Edit3 className="h-3 w-3" />
                            Chi tiết & Biến thể
                          </button>
                          <button
                            type="button"
                            onClick={() => handleArchiveProduct(p)}
                            className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-rose-400"
                          >
                            Lưu trữ
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2-Column Product Editor Modal (Multi-Image + Multi-Variant + Multi-Category) */}
      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/55 p-4 backdrop-blur-[2px]">
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4 dark:border-neutral-800">
              <div>
                <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                  {editingProd ? `Chỉnh Sửa: ${editingProd.name}` : "Thêm Sản Phẩm Mới"}
                </h3>
                <p className="text-[11px] text-neutral-500">
                  Cấu hình thông tin chung, thư viện nhiều hình ảnh, nhiều danh mục và danh sách biến thể.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveProduct} className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* LEFT 2 COLS: General Info + Multi-Image Gallery + Variants Table */}
                <div className="space-y-5 lg:col-span-2">
                  {/* Basic Info */}
                  <div className="rounded-2xl border border-neutral-200/80 p-4 space-y-3 dark:border-neutral-800">
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
                          placeholder="VD: Trà Đào Cam Sả"
                          className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
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
                          className="w-full rounded-xl border border-neutral-300 px-3 py-2 font-mono text-xs text-neutral-900 disabled:bg-neutral-100 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        Mô tả sản phẩm
                      </label>
                      <textarea
                        rows={2}
                        value={prodDesc}
                        onChange={(e) => setProdDesc(e.target.value)}
                        placeholder="Thành phần, ghi chú pha chế hoặc thông tin thêm..."
                        className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                      />
                    </div>
                  </div>

                  {/* Multi-Image Gallery */}
                  <div className="rounded-2xl border border-neutral-200/80 p-4 space-y-3 dark:border-neutral-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                          Hình Ảnh Sản Phẩm ({images.length} ảnh)
                        </h4>
                        <p className="text-[11px] text-neutral-500">
                          Tải lên nhiều ảnh hoặc dán đường dẫn URL. Bấm ngôi sao để chọn ảnh đại diện chính.
                        </p>
                      </div>
                      <div>
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
                          className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
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
                        className="flex-1 rounded-xl border border-neutral-300 px-3 py-1.5 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={handleAddImageUrl}
                        className="rounded-xl bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-neutral-700"
                      >
                        Thêm URL
                      </button>
                    </div>

                    {images.length > 0 && (
                      <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-5">
                        {images.map((im, idx) => (
                          <div
                            key={`${im.image_url}-${idx}`}
                            className={`group relative aspect-square overflow-hidden rounded-xl border-2 ${
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
                              className={`absolute left-1 top-1 rounded-md p-1 ${
                                im.is_primary
                                  ? "bg-emerald-500 text-white"
                                  : "bg-black/50 text-white/80 hover:bg-black/75"
                              }`}
                            >
                              <Star className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeImage(idx)}
                              title="Xóa ảnh"
                              className="absolute right-1 top-1 rounded-md bg-black/50 p-1 text-white hover:bg-rose-600"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Multi-Variant Table */}
                  <div className="rounded-2xl border border-neutral-200/80 p-4 space-y-3 dark:border-neutral-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                          Biến Thể Sản Phẩm ({variants.length})
                        </h4>
                        <p className="text-[11px] text-neutral-500">
                          Mỗi size, hương vị hoặc quy cách đóng gói có mã SKU, giá bán và giá vốn riêng.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={addDraftVariant}
                        className="inline-flex items-center gap-1 rounded-xl border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Thêm biến thể
                      </button>
                    </div>

                    <div className="space-y-2.5">
                      {variants.map((v, idx) => (
                        <div
                          key={v.id || `draft-${idx}`}
                          className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-3 dark:border-neutral-700 dark:bg-neutral-800/40"
                        >
                          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-6">
                            <div className="col-span-2">
                              <label className="block text-[10px] font-semibold text-neutral-500 mb-0.5">
                                Tên biến thể *
                              </label>
                              <input
                                type="text"
                                required
                                value={v.variant_name}
                                onChange={(e) =>
                                  updateDraftVariant(idx, { variant_name: e.target.value })
                                }
                                placeholder="VD: Size L"
                                className="w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-neutral-500 mb-0.5">
                                Mã SKU
                              </label>
                              <input
                                type="text"
                                value={v.sku}
                                onChange={(e) =>
                                  updateDraftVariant(idx, { sku: e.target.value })
                                }
                                className="w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-neutral-500 mb-0.5">
                                Đơn vị
                              </label>
                              <input
                                type="text"
                                value={v.unit_name}
                                onChange={(e) =>
                                  updateDraftVariant(idx, { unit_name: e.target.value })
                                }
                                className="w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-neutral-500 mb-0.5">
                                Giá vốn (₫)
                              </label>
                              <input
                                type="number"
                                value={v.default_cost}
                                onChange={(e) =>
                                  updateDraftVariant(idx, { default_cost: e.target.value })
                                }
                                className="w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-neutral-500 mb-0.5">
                                Giá bán (₫) *
                              </label>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  required
                                  value={v.default_price}
                                  onChange={(e) =>
                                    updateDraftVariant(idx, { default_price: e.target.value })
                                  }
                                  className="w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-bold dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                                />
                                {v.isNew && variants.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeDraftVariant(idx)}
                                    className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* RIGHT COL: Multi-Category Selection + Settings */}
                <div className="space-y-4">
                  {/* Multi-Category Checkboxes */}
                  <div className="rounded-2xl border border-neutral-200/80 p-4 space-y-3 dark:border-neutral-800">
                    <div>
                      <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                        Danh Mục ({selectedCatIds.length} đã chọn)
                      </h4>
                      <p className="text-[11px] text-neutral-500">
                        Chọn 1 hoặc nhiều danh mục cho sản phẩm này.
                      </p>
                    </div>

                    {categories.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-neutral-300 p-3 text-center text-[11px] text-neutral-500">
                        Chưa có danh mục nào. Hãy tạo trong mục &ldquo;Danh mục&rdquo;.
                      </div>
                    ) : (
                      <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                        {categories.map((cat) => {
                          const checked = selectedCatIds.includes(cat.id);
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => toggleCategory(cat.id)}
                              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs transition-all ${
                                checked
                                  ? "border-neutral-900 bg-neutral-900/5 font-bold text-neutral-900 dark:border-white dark:bg-white/10 dark:text-white"
                                  : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300"
                              }`}
                            >
                              <span className="truncate">{cat.name}</span>
                              <span
                                className={`flex h-4 w-4 items-center justify-center rounded border ${
                                  checked
                                    ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
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

                  {/* Product Classification & Status */}
                  <div className="rounded-2xl border border-neutral-200/80 p-4 space-y-3 dark:border-neutral-800">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        Loại hàng hóa
                      </label>
                      <select
                        value={prodType}
                        onChange={(e) => setProdType(e.target.value)}
                        className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                      >
                        <option value="stocked">Hàng có tồn kho (Stocked)</option>
                        <option value="non_stocked">Pha chế / Không trừ kho</option>
                        <option value="service">Dịch vụ / Phụ thu</option>
                      </select>
                    </div>

                    {editingProd && (
                      <div>
                        <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                          Trạng thái bán
                        </label>
                        <select
                          value={prodStatus}
                          onChange={(e) => setProdStatus(e.target.value)}
                          className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                        >
                          <option value="active">Đang bán</option>
                          <option value="inactive">Ngừng bán</option>
                          <option value="archived">Lưu trữ</option>
                        </select>
                      </div>
                    )}

                    <label className="flex items-center justify-between rounded-xl border border-neutral-200 px-3 py-2 text-xs dark:border-neutral-700">
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

              {/* Footer Actions */}
              <div className="mt-6 flex items-center justify-end gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setEditorOpen(false)}
                  className="rounded-xl border border-neutral-200 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-neutral-900 px-5 py-2 text-xs font-bold text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
                >
                  {saving
                    ? "Đang lưu..."
                    : editingProd
                      ? "Lưu Thay Đổi"
                      : "Tạo Sản Phẩm"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

