"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Edit3,
  Image as ImageIcon,
  Layers,
  MoreHorizontal,
  Plus,
  Power,
  ScanBarcode,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { CategoryRecord } from "./catalog-categories-view";
import type { OptionGroupRecord } from "./catalog-options-view";
import { BeInput } from "./motion/input";
import { BeMultiSelect } from "./motion/multi-select";
import { OverflowActions, type OverflowActionItem } from "./motion/overflow-actions";
import { AnimatedPagination } from "./motion/pagination";
import { ProductImageUpload } from "./motion/product-image-upload";
import { BeSelect } from "./motion/select";
import { BeSwitch } from "./motion/switch";

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
  option_group_ids?: string[];
  option_groups?: OptionGroupRecord[];
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
  option_group_ids: string[];
  isNew?: boolean;
}

interface CatalogProductsViewProps {
  products: ProductRecord[];
  categories: CategoryRecord[];
  optionGroups: OptionGroupRecord[];
  accessToken: string | null;
  apiFetch: (path: string, options?: RequestInit, token?: string) => Promise<any>;
  onRefresh: () => Promise<void>;
  notify: (type: "success" | "error" | "info", text: string) => void;
  formatMoney: (val: number | string) => string;
}

const DEFAULT_PAGE_SIZE = 10;
const ROW_HEIGHT = 54;
const THEAD_HEIGHT = 38;
const PAGINATION_FOOTER_HEIGHT = 52;
type EditorTab = "general" | "images" | "variants";

const formatPriceNumber = (val: number | string) =>
  new Intl.NumberFormat("vi-VN").format(Math.round(Number(val || 0)));

function SmoothPriceRangeSlider({
  min,
  max,
  step = 1000,
  value,
  onChange,
}: {
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onChange: (next: [number, number]) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState<"min" | "max" | null>(null);

  const safeSpan = Math.max(1, max - min);
  const rawMinPct = ((value[0] - min) / safeSpan) * 100;
  const rawMaxPct = ((value[1] - min) / safeSpan) * 100;

  const minTarget = useMotionValue(rawMinPct);
  const maxTarget = useMotionValue(rawMaxPct);

  const smoothMin = useSpring(minTarget, { stiffness: 520, damping: 42, mass: 0.45 });
  const smoothMax = useSpring(maxTarget, { stiffness: 520, damping: 42, mass: 0.45 });

  useEffect(() => {
    minTarget.set(rawMinPct);
    maxTarget.set(rawMaxPct);
  }, [rawMinPct, rawMaxPct, minTarget, maxTarget]);

  const leftPct = useTransform(smoothMin, (v) => `${v}%`);
  const rightPct = useTransform(smoothMax, (v) => `${100 - v}%`);
  const maxLeftPct = useTransform(smoothMax, (v) => `${v}%`);

  const calcValueFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return value[0];
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
    const raw = min + ratio * safeSpan;
    return Math.round(raw / step) * step;
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: PointerEvent) => {
      const nextVal = calcValueFromClientX(e.clientX);
      if (dragging === "min") {
        const clamped = Math.min(Math.max(min, nextVal), value[1] - step);
        onChange([clamped, value[1]]);
      } else {
        const clamped = Math.max(Math.min(max, nextVal), value[0] + step);
        onChange([value[0], clamped]);
      }
    };
    const handleUp = () => setDragging(null);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [dragging, value, min, max, step, onChange]);

  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const nextVal = calcValueFromClientX(e.clientX);
    const distMin = Math.abs(nextVal - value[0]);
    const distMax = Math.abs(nextVal - value[1]);
    const targetThumb: "min" | "max" = distMin <= distMax ? "min" : "max";
    if (targetThumb === "min") {
      onChange([Math.min(Math.max(min, nextVal), value[1] - step), value[1]]);
    } else {
      onChange([value[0], Math.max(Math.min(max, nextVal), value[0] + step)]);
    }
    setDragging(targetThumb);
  };

  return (
    <div
      ref={trackRef}
      onPointerDown={handleTrackPointerDown}
      className="relative mt-4 mb-3 flex h-6 cursor-pointer touch-none select-none items-center"
    >
      {/* Background Track */}
      <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-neutral-800" />
      {/* Smooth Spring Active Fill */}
      <motion.div
        style={{ left: leftPct, right: rightPct }}
        className="absolute h-1.5 rounded-full bg-neutral-900 dark:bg-white"
      />
      {/* Min Thumb */}
      <motion.div
        role="slider"
        aria-label="Giá tối thiểu"
        aria-valuemin={min}
        aria-valuemax={value[1]}
        aria-valuenow={value[0]}
        style={{ left: leftPct }}
        animate={{ scale: dragging === "min" ? 1.22 : 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        onPointerDown={(e) => {
          e.stopPropagation();
          setDragging("min");
        }}
        className={`absolute -ml-2.5 h-5 w-5 rounded-full border-2 border-white bg-neutral-900 shadow-md dark:border-neutral-950 dark:bg-white ${
          dragging === "min" ? "ring-4 ring-neutral-900/15 dark:ring-white/20" : ""
        }`}
      />
      {/* Max Thumb */}
      <motion.div
        role="slider"
        aria-label="Giá tối đa"
        aria-valuemin={value[0]}
        aria-valuemax={max}
        aria-valuenow={value[1]}
        style={{ left: maxLeftPct }}
        animate={{ scale: dragging === "max" ? 1.22 : 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        onPointerDown={(e) => {
          e.stopPropagation();
          setDragging("max");
        }}
        className={`absolute -ml-2.5 h-5 w-5 rounded-full border-2 border-white bg-neutral-900 shadow-md dark:border-neutral-950 dark:bg-white ${
          dragging === "max" ? "ring-4 ring-neutral-900/15 dark:ring-white/20" : ""
        }`}
      />
    </div>
  );
}

export function CatalogProductsView({
  products,
  categories,
  optionGroups,
  accessToken,
  apiFetch,
  onRefresh,
  notify,
  formatMoney,
}: CatalogProductsViewProps) {
  const [search, setSearch] = useState("");
  const [filterCatIds, setFilterCatIds] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [priceRange, setPriceRange] = useState<[number, number] | null>(null);

  // beUI Morphing Filter Modal state
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [draftCatIds, setDraftCatIds] = useState<string[]>([]);
  const [draftStatus, setDraftStatus] = useState("all");
  const [draftType, setDraftType] = useState("all");
  const [draftPriceRange, setDraftPriceRange] = useState<[number, number]>([0, 200000]);
  const [catSearch, setCatSearch] = useState("");
  const [showAllCats, setShowAllCats] = useState(false);
  const [listEpoch, setListEpoch] = useState(0);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);

  // Horizontal Stepper Wizard state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTab, setEditorTab] = useState<EditorTab>("general");
  const [touchedSteps, setTouchedSteps] = useState<Record<EditorTab, boolean>>({
    general: false,
    images: false,
    variants: false,
  });
  const [completedSteps, setCompletedSteps] = useState<Record<EditorTab, boolean>>({
    general: false,
    images: false,
    variants: false,
  });
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
  const [editorCatSearch, setEditorCatSearch] = useState("");
  const [images, setImages] = useState<ProductImageRow[]>([]);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [variants, setVariants] = useState<DraftVariant[]>([]);
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);
  const [expandedOptionGroupIds, setExpandedOptionGroupIds] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Close action popover on outside click
  useEffect(() => {
    if (!openActionId) return;
    const close = () => setOpenActionId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [openActionId]);

  const maxCatalogPrice = useMemo(() => {
    let maxVal = 100000;
    for (const p of products) {
      for (const v of p.variants || []) {
        const val = Number(v.default_price || 0);
        if (val > maxVal) maxVal = val;
      }
    }
    return Math.ceil(maxVal / 10000) * 10000;
  }, [products]);

  const matchesFilters = (
    p: ProductRecord,
    qStr: string,
    catIds: string[],
    statusVal: string,
    typeVal: string,
    range: [number, number] | null
  ) => {
    if (statusVal !== "all" && p.status !== statusVal) return false;
    if (typeVal !== "all" && (p.product_type || "stocked") !== typeVal) return false;
    if (catIds.length > 0) {
      const ids = p.category_ids || (p.category_id ? [p.category_id] : []);
      if (!catIds.some((cid) => ids.includes(cid))) return false;
    }
    if (range) {
      const prices = (p.variants || []).map((v) => Number(v.default_price || 0));
      const pMin = prices.length ? Math.min(...prices) : 0;
      const pMax = prices.length ? Math.max(...prices) : 0;
      if (pMax < range[0] || pMin > range[1]) return false;
    }
    if (!qStr) return true;
    const hitProd =
      p.name.toLowerCase().includes(qStr) ||
      p.product_code.toLowerCase().includes(qStr);
    const hitVar = (p.variants || []).some(
      (v) =>
        v.variant_name.toLowerCase().includes(qStr) ||
        (v.sku || "").toLowerCase().includes(qStr)
    );
    return hitProd || hitVar;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) =>
      matchesFilters(p, q, filterCatIds, filterStatus, filterType, priceRange)
    );
  }, [products, search, filterCatIds, filterStatus, filterType, priceRange]);

  const draftMatchCount = useMemo(() => {
    const q = search.trim().toLowerCase();
    const effectiveRange: [number, number] | null =
      draftPriceRange[0] > 0 || draftPriceRange[1] < maxCatalogPrice
        ? draftPriceRange
        : null;
    return products.filter((p) =>
      matchesFilters(p, q, draftCatIds, draftStatus, draftType, effectiveRange)
    ).length;
  }, [products, search, draftCatIds, draftStatus, draftType, draftPriceRange, maxCatalogPrice]);

  const activeFilterCount =
    (filterCatIds.length > 0 ? 1 : 0) +
    (filterStatus !== "all" ? 1 : 0) +
    (filterType !== "all" ? 1 : 0) +
    (priceRange ? 1 : 0);

  const openFilterModal = () => {
    setDraftCatIds(filterCatIds);
    setDraftStatus(filterStatus);
    setDraftType(filterType);
    setDraftPriceRange(priceRange ?? [0, maxCatalogPrice]);
    setCatSearch("");
    setShowAllCats(false);
    setFilterModalOpen(true);
  };

  const applyDraftFilters = () => {
    setFilterCatIds(draftCatIds);
    setFilterStatus(draftStatus);
    setFilterType(draftType);
    setPriceRange(
      draftPriceRange[0] > 0 || draftPriceRange[1] < maxCatalogPrice
        ? draftPriceRange
        : null
    );
    setFilterModalOpen(false);
    setListEpoch((k) => k + 1);
  };

  const clearDraftFilters = () => {
    setDraftCatIds([]);
    setDraftStatus("all");
    setDraftType("all");
    setDraftPriceRange([0, maxCatalogPrice]);
    setCatSearch("");
  };

  useEffect(() => {
    if (!filterModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFilterModalOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filterModalOpen]);

  // Dynamically compute rows per page from actual viewport space so the unified
  // table+pagination card fills 100% of any screen resolution without page scroll
  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el || editorOpen) return;

    const updatePageSize = () => {
      const rect = el.getBoundingClientRect();
      const bottomPadding = 16; // matches <main> py-4 bottom padding
      const availableCardHeight = Math.max(
        el.clientHeight,
        window.innerHeight - rect.top - bottomPadding
      );
      const availableRows =
        availableCardHeight - THEAD_HEIGHT - PAGINATION_FOOTER_HEIGHT;
      if (availableRows <= 0) return;
      const next = Math.max(6, Math.min(20, Math.floor(availableRows / ROW_HEIGHT)));
      setPageSize((prev) => (prev === next ? prev : next));
    };

    updatePageSize();
    const rafId = requestAnimationFrame(updatePageSize);
    const observer = new ResizeObserver(updatePageSize);
    observer.observe(el);
    window.addEventListener("resize", updatePageSize);
    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener("resize", updatePageSize);
    };
  }, [editorOpen, filtered.length]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedProducts = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [search, filterCatIds, filterStatus, filterType, priceRange]);

  const openCreate = () => {
    const ts = Date.now().toString().slice(-4);
    setEditingProd(null);
    setEditorTab("general");
    setTouchedSteps({ general: false, images: false, variants: false });
    setCompletedSteps({ general: false, images: false, variants: false });
    setProdCode(`SP-${ts}`);
    setProdName("");
    setProdDesc("");
    setProdType("stocked");
    setTrackInv(true);
    setProdStatus("active");
    setSelectedCatIds(categories[0] ? [categories[0].id] : []);
    setEditorCatSearch("");
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
        option_group_ids: [],
        isNew: true,
      },
    ]);
    setSelectedVariantIdx(0);
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
    setEditorCatSearch("");
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
        sku: v.sku || v.variant_code || "",
        unit_name: v.unit_name || "Cái",
        default_cost: v.default_cost ? String(Math.round(Number(v.default_cost))) : "",
        default_price: String(Math.round(Number(v.default_price || 0))),
        barcode: v.barcodes?.[0]?.barcode || "",
        is_default: v.is_default,
        option_group_ids: v.option_group_ids || [],
        isNew: false,
      }))
    );
    setTouchedSteps({ general: false, images: false, variants: false });
    setCompletedSteps({
      general: Boolean(p.name?.trim() && p.product_code?.trim()),
      images: Boolean((p.images && p.images.length > 0) || p.image_url),
      variants:
        (p.variants || []).length > 0 &&
        (p.variants || []).every(
          (v) =>
            Boolean(v.variant_name?.trim()) &&
            String(v.default_price ?? "").trim() !== ""
        ),
    });
    setSelectedVariantIdx(0);
    setEditorOpen(true);
  };

  const toggleCategory = (cid: string) => {
    setSelectedCatIds((prev) =>
      prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid]
    );
  };

  const uploadSingleImageFile = async (file: File): Promise<string> => {
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
    return uploaded.image_url as string;
  };

  const handleImageUploaded = (imageUrl: string) => {
    setImages((prev) => [
      ...prev,
      {
        image_url: imageUrl,
        sort_order: prev.length,
        is_primary: prev.length === 0,
      },
    ]);
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
        option_group_ids: [],
        isNew: true,
      },
    ]);
    setSelectedVariantIdx(variants.length);
  };

  const updateDraftVariant = (idx: number, patch: Partial<DraftVariant>) => {
    setVariants((prev) =>
      prev.map((v, i) => (i === idx ? { ...v, ...patch } : v))
    );
  };

  const setDefaultDraftVariant = (idx: number) => {
    setVariants((prev) =>
      prev.map((v, i) => ({ ...v, is_default: i === idx }))
    );
  };

  const removeDraftVariant = (idx: number) => {
    if (variants.length <= 1) {
      notify("error", "Mỗi sản phẩm cần ít nhất 1 biến thể.");
      return;
    }
    setVariants((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length > 0 && !next.some((v) => v.is_default)) {
        next[0] = { ...next[0], is_default: true };
      }
      setSelectedVariantIdx((cur) => Math.max(0, Math.min(cur, next.length - 1)));
      return next;
    });
  };

  const getStepValidation = (step: EditorTab) => {
    if (step === "general") {
      const nameErr = !prodName.trim() ? "Vui lòng nhập tên sản phẩm." : "";
      const codeErr = !prodCode.trim() ? "Vui lòng nhập mã sản phẩm." : "";
      return {
        valid: !nameErr && !codeErr,
        errors: { nameErr, codeErr },
      };
    }
    if (step === "images") {
      return { valid: true, errors: {} };
    }
    const invalidVariants = variants.map((v) => ({
      nameErr: !v.variant_name.trim() ? "Nhập tên biến thể" : "",
      skuErr: !v.sku.trim() ? "Nhập mã SKU" : "",
      priceErr:
        v.default_price.trim() === "" ||
        Number.isNaN(Number(v.default_price)) ||
        Number(v.default_price) < 0
          ? "Nhập giá bán hợp lệ"
          : "",
    }));
    const valid =
      variants.length > 0 &&
      invalidVariants.every((iv) => !iv.nameErr && !iv.skuErr && !iv.priceErr);
    return { valid, errors: { invalidVariants } };
  };

  const getStepVisualStatus = (
    step: EditorTab
  ): "active" | "completed" | "error" | "pending" => {
    const { valid } = getStepValidation(step);
    if (editorTab === step) return "active";
    if (touchedSteps[step] && !valid) return "error";
    if (completedSteps[step] && valid) return "completed";
    return "pending";
  };

  const goToStep = (target: EditorTab) => {
    if (target === editorTab) return;
    const { valid } = getStepValidation(editorTab);
    setTouchedSteps((prev) => ({ ...prev, [editorTab]: true }));
    setCompletedSteps((prev) => ({ ...prev, [editorTab]: valid }));
    setEditorTab(target);
  };

  const handleNextStep = () => {
    const order: EditorTab[] = ["general", "images", "variants"];
    const idx = order.indexOf(editorTab);
    const { valid } = getStepValidation(editorTab);
    setTouchedSteps((prev) => ({ ...prev, [editorTab]: true }));
    if (!valid) {
      setCompletedSteps((prev) => ({ ...prev, [editorTab]: false }));
      notify("error", "Vui lòng điền đầy đủ các trường bắt buộc trước khi sang bước tiếp theo.");
      return;
    }
    setCompletedSteps((prev) => ({ ...prev, [editorTab]: true }));
    if (idx < order.length - 1) {
      setEditorTab(order[idx + 1]);
    }
  };

  const handlePrevStep = () => {
    const order: EditorTab[] = ["general", "images", "variants"];
    const idx = order.indexOf(editorTab);
    if (idx > 0) {
      goToStep(order[idx - 1]);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouchedSteps({ general: true, images: true, variants: true });
    const genVal = getStepValidation("general");
    const varVal = getStepValidation("variants");
    setCompletedSteps({
      general: genVal.valid,
      images: true,
      variants: varVal.valid,
    });

    if (!genVal.valid) {
      setEditorTab("general");
      notify("error", "Vui lòng điền đầy đủ Tên sản phẩm và Mã sản phẩm.");
      return;
    }
    if (!varVal.valid) {
      setEditorTab("variants");
      notify("error", "Vui lòng điền đầy đủ Tên biến thể, Mã SKU và Giá bán ở bước Biến thể.");
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
                is_default: variants.some((x) => x.is_default) ? v.is_default : i === 0,
                barcodes: v.barcode.trim()
                  ? [{ barcode: v.barcode.trim(), is_primary: true }]
                  : [],
                option_group_ids: v.option_group_ids,
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
                  is_default: v.is_default,
                  barcodes: v.barcode.trim()
                    ? [{ barcode: v.barcode.trim(), is_primary: true }]
                    : [],
                  option_group_ids: v.option_group_ids,
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
                  is_default: v.is_default,
                  barcode: v.barcode.trim(),
                  option_group_ids: v.option_group_ids,
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
  // 3-STEP PROCESS WIZARD VIEW (WHEN CREATING OR EDITING A PRODUCT)
  // ===========================================================================
  if (editorOpen) {
    const genValidation = getStepValidation("general");
    const varValidation = getStepValidation("variants");
    const stepsMeta: { id: EditorTab; num: number; title: string; subtitle: string }[] = [
      {
        id: "general",
        num: 1,
        title: "Thông tin & Danh mục",
        subtitle: `${selectedCatIds.length} danh mục`,
      },
      {
        id: "images",
        num: 2,
        title: "Hình ảnh",
        subtitle: `${images.length} ảnh`,
      },
      {
        id: "variants",
        num: 3,
        title: "Biến thể & Giá bán",
        subtitle: `${variants.length} biến thể`,
      },
    ];
    const currentStepIdx = stepsMeta.findIndex((s) => s.id === editorTab);

    return (
      <motion.form
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        onSubmit={handleSaveProduct}
        noValidate
        className="flex h-full flex-1 min-h-0 flex-col gap-3"
      >
        {/* Section 1: Clean Page Title Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 rounded-2xl border border-neutral-200/80 bg-white px-5 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setEditorOpen(false)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-neutral-900 dark:text-white">
                {editingProd ? `Chi tiết sản phẩm: ${editingProd.name}` : "Thêm Sản Phẩm Mới"}
              </h2>
              <p className="text-[11px] text-neutral-500">
                Hoàn thành lần lượt 3 bước tiến trình hoặc bấm trực tiếp vào từng bước để chuyển đổi.
              </p>
            </div>
          </div>

          <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
            Bước {currentStepIdx + 1} / {stepsMeta.length}
          </span>
        </div>

        {/* Section 2: Centered Process Stepper Card (Image #2 style + 4-color validation) */}
        <div className="shrink-0 rounded-2xl border border-neutral-200/80 bg-white px-6 py-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mx-auto w-full max-w-3xl">
            <div className="grid grid-cols-3 gap-4">
              {stepsMeta.map((step) => {
                const status = getStepVisualStatus(step.id);
                const circleCls =
                  status === "active"
                    ? "bg-blue-600 text-white ring-4 ring-blue-600/15 shadow-sm"
                    : status === "completed"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : status === "error"
                        ? "bg-rose-600 text-white ring-4 ring-rose-600/15 shadow-sm"
                        : "border-2 border-neutral-300 bg-white text-neutral-500 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-400";
                const labelCls =
                  status === "active"
                    ? "text-blue-700 font-bold dark:text-blue-300"
                    : status === "completed"
                      ? "text-emerald-700 font-semibold dark:text-emerald-300"
                      : status === "error"
                        ? "text-rose-600 font-bold dark:text-rose-400"
                        : "text-neutral-500 font-medium dark:text-neutral-400";

                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => goToStep(step.id)}
                    className="group flex flex-col items-center text-center focus:outline-none"
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all group-hover:scale-105 ${circleCls}`}
                    >
                      {status === "completed" ? (
                        <Check className="h-4 w-4" />
                      ) : status === "error" ? (
                        <AlertCircle className="h-4 w-4" />
                      ) : (
                        step.num
                      )}
                    </span>
                    <span className={`mt-2 text-xs transition-colors ${labelCls}`}>
                      {step.title}
                    </span>
                    <span className="mt-0.5 text-[10px] text-neutral-400">
                      {step.subtitle}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Sleek Animated Progress Bar underneath */}
            <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200/80 dark:bg-neutral-800">
              <motion.div
                initial={false}
                animate={{
                  width: `${((currentStepIdx + 1) / stepsMeta.length) * 100}%`,
                }}
                transition={{ type: "spring", stiffness: 340, damping: 32 }}
                className={`h-full rounded-full transition-colors ${
                  touchedSteps[editorTab] && !getStepValidation(editorTab).valid
                    ? "bg-rose-600"
                    : currentStepIdx === stepsMeta.length - 1 &&
                        getStepValidation("variants").valid &&
                        getStepValidation("general").valid
                      ? "bg-emerald-600"
                      : "bg-blue-600"
                }`}
              />
            </div>
          </div>
        </div>

        {/* Section 3: Full-Height Step Form Content */}
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden rounded-2xl border border-neutral-200/80 bg-white p-5 pb-20 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
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
                  {/* Left 7 cols: General Fields (beUI Input, Select, Switch) */}
                  <div className="space-y-4 lg:col-span-7">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <BeInput
                        className="sm:col-span-2"
                        label="Tên sản phẩm *"
                        value={prodName}
                        onChange={setProdName}
                        placeholder="VD: Trà Đào Cam Sả Đặc Biệt"
                        success={Boolean(prodName.trim())}
                        error={
                          touchedSteps.general && genValidation.errors.nameErr
                            ? genValidation.errors.nameErr
                            : undefined
                        }
                      />
                      <BeInput
                        label="Mã sản phẩm *"
                        disabled={Boolean(editingProd)}
                        value={prodCode}
                        onChange={setProdCode}
                        success={!editingProd && Boolean(prodCode.trim())}
                        error={
                          touchedSteps.general && genValidation.errors.codeErr
                            ? genValidation.errors.codeErr
                            : undefined
                        }
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block px-1 text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                        Mô tả sản phẩm
                      </label>
                      <textarea
                        rows={3}
                        value={prodDesc}
                        onChange={(e) => setProdDesc(e.target.value)}
                        placeholder="Thành phần, định lượng pha chế hoặc thông tin nổi bật..."
                        className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-xs text-neutral-900 outline-none transition-colors focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <BeSelect
                        label="Loại hàng hóa"
                        value={prodType}
                        onValueChange={setProdType}
                        options={[
                          { value: "stocked", label: "Hàng có tồn kho" },
                          { value: "non_stocked", label: "Pha chế / Không trừ kho" },
                          { value: "service", label: "Dịch vụ / Phụ thu" },
                        ]}
                      />

                      <BeSelect
                        label="Trạng thái bán"
                        value={prodStatus}
                        disabled={!editingProd}
                        onValueChange={setProdStatus}
                        options={[
                          { value: "active", label: "Đang bán" },
                          { value: "inactive", label: "Ngừng bán" },
                          { value: "archived", label: "Lưu trữ" },
                        ]}
                      />

                      <div className="flex items-end">
                        <div className="flex h-10 w-full items-center justify-between rounded-xl border border-neutral-300 bg-white px-3.5 dark:border-neutral-700 dark:bg-neutral-800">
                          <BeSwitch
                            checked={trackInv}
                            onCheckedChange={setTrackInv}
                            label="Theo dõi tồn kho"
                            className="w-full"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right 5 cols: beUI Multi-Select Category Picker (clean divider, no nested border box) */}
                  <div className="flex flex-col justify-start lg:col-span-5 lg:border-l lg:border-neutral-200/70 lg:pl-6 dark:lg:border-neutral-800">
                    <BeMultiSelect
                      label={`Gắn Danh Mục (${selectedCatIds.length} đã chọn)`}
                      helperText="1 sản phẩm có thể thuộc nhiều danh mục cùng lúc. Gõ để tìm nhanh."
                      options={categories.map((c) => ({
                        value: c.id,
                        label: c.name,
                      }))}
                      values={selectedCatIds}
                      onChange={setSelectedCatIds}
                      placeholder="Chọn hoặc tìm nhanh danh mục..."
                    />
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
              >
                <ProductImageUpload
                  images={images}
                  onUploadSingleFile={uploadSingleImageFile}
                  onImageUploaded={handleImageUploaded}
                  onSetPrimary={setPrimaryImage}
                  onRemove={removeImage}
                />
              </motion.div>
            )}

            {editorTab === "variants" && (() => {
              const safeVarIdx = Math.min(
                selectedVariantIdx,
                Math.max(0, variants.length - 1)
              );
              const activeVar = variants[safeVarIdx];
              const activeErr = varValidation.errors.invalidVariants?.[safeVarIdx];
              const showNameErr = Boolean(touchedSteps.variants && activeErr?.nameErr);
              const showSkuErr = Boolean(touchedSteps.variants && activeErr?.skuErr);
              const showPriceErr = Boolean(touchedSteps.variants && activeErr?.priceErr);

              return (
              <motion.div
                key="tab-variants"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.16 }}
                className="grid grid-cols-1 gap-5 lg:grid-cols-12"
              >
                {/* Left 3 cols: Master Variant List (compact width, clean divider) */}
                <div className="flex flex-col lg:col-span-3 lg:border-r lg:border-neutral-200/70 lg:pr-5 dark:lg:border-neutral-800">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                        Biến thể ({variants.length})
                      </h4>
                      <p className="text-[11px] text-neutral-500">
                        Chọn biến thể để chỉnh sửa chi tiết.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addDraftVariant}
                      className="inline-flex items-center gap-1 rounded-full bg-neutral-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900"
                    >
                      <Plus className="h-3 w-3" />
                      Thêm
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                    <AnimatePresence initial={false}>
                      {variants.map((v, idx) => {
                        const isSelected = idx === safeVarIdx;
                        const rowErr = varValidation.errors.invalidVariants?.[idx];
                        const hasErr = Boolean(
                          touchedSteps.variants &&
                            (rowErr?.nameErr || rowErr?.skuErr || rowErr?.priceErr)
                        );
                        return (
                          <motion.button
                            key={v.id || v.variant_code || `draft-${idx}`}
                            type="button"
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.16 }}
                            onClick={() => setSelectedVariantIdx(idx)}
                            className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-left transition-all ${
                              hasErr
                                ? "border-rose-500 bg-rose-50/70 ring-1 ring-rose-500/20 dark:bg-rose-950/30"
                                : isSelected
                                  ? "border-blue-600 bg-blue-50/80 ring-1 ring-blue-600/20 dark:border-blue-400 dark:bg-blue-950/30"
                                  : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-xs font-bold text-neutral-900 dark:text-white">
                                  {v.variant_name.trim() || `Biến thể #${idx + 1}`}
                                </span>
                                {v.is_default && (
                                  <span className="shrink-0 rounded-full bg-blue-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                                    Mặc định
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 truncate text-[11px] tabular-nums text-neutral-500">
                                {formatPriceNumber(v.default_price || 0)} • {v.unit_name || "Cái"}
                                {v.barcode ? ` • ${v.barcode}` : ""}
                              </div>
                            </div>
                            {hasErr && (
                              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                            )}
                          </motion.button>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Right 9 cols: Detail Form for Active Variant (clean flat surface) */}
                <div className="lg:col-span-9 lg:pl-1">
                  {activeVar && (
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={activeVar.id || activeVar.variant_code || safeVarIdx}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.16 }}
                        className="space-y-5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-3 dark:border-neutral-800">
                          <div>
                            <h4 className="text-sm font-bold text-neutral-900 dark:text-white">
                              Chi tiết: {activeVar.variant_name.trim() || `Biến thể #${safeVarIdx + 1}`}
                            </h4>
                            <p className="text-[11px] text-neutral-500">
                              SKU giúp đồng bộ tồn kho nội bộ; Barcode dùng cho súng quét mã vạch tại quầy POS.
                            </p>
                          </div>
                          {activeVar.isNew && variants.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeDraftVariant(safeVarIdx)}
                              className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400"
                            >
                              <Trash2 className="h-3 w-3" />
                              Xóa biến thể
                            </button>
                          )}
                        </div>

                        {/* Row 1: Name, SKU, Unit */}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                          <BeInput
                            label="Tên biến thể *"
                            value={activeVar.variant_name}
                            onChange={(val) =>
                              updateDraftVariant(safeVarIdx, { variant_name: val })
                            }
                            placeholder="VD: Size M (Tiêu chuẩn)"
                            success={Boolean(activeVar.variant_name.trim())}
                            error={showNameErr ? activeErr?.nameErr : undefined}
                          />
                          <BeInput
                            label="Mã SKU *"
                            value={activeVar.sku}
                            onChange={(val) =>
                              updateDraftVariant(safeVarIdx, { sku: val })
                            }
                            placeholder="VD: SKU-TS-M"
                            success={Boolean(activeVar.sku.trim())}
                            error={showSkuErr ? activeErr?.skuErr : undefined}
                          />
                          <BeInput
                            label="Đơn vị tính"
                            value={activeVar.unit_name}
                            onChange={(val) =>
                              updateDraftVariant(safeVarIdx, { unit_name: val })
                            }
                            placeholder="Ly, Cái, Hộp..."
                          />
                        </div>

                        {/* Row 2: Barcode, Cost, Price */}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                          <BeInput
                            label="Mã vạch (Barcode)"
                            value={activeVar.barcode}
                            onChange={(val) =>
                              updateDraftVariant(safeVarIdx, { barcode: val })
                            }
                            leftIcon={<ScanBarcode />}
                            placeholder="VD: 8934563123456"
                          />
                          <BeInput
                            type="number"
                            label="Giá vốn"
                            value={activeVar.default_cost}
                            onChange={(val) =>
                              updateDraftVariant(safeVarIdx, { default_cost: val })
                            }
                            placeholder="0"
                          />
                          <BeInput
                            type="number"
                            label="Giá bán *"
                            value={activeVar.default_price}
                            onChange={(val) =>
                              updateDraftVariant(safeVarIdx, { default_price: val })
                            }
                            placeholder="35000"
                            success={
                              activeVar.default_price.trim() !== "" &&
                              Number(activeVar.default_price) >= 0
                            }
                            error={showPriceErr ? activeErr?.priceErr : undefined}
                          />
                        </div>

                        {/* Row 3: Default Variant Switch */}
                        <div className="flex items-center justify-between rounded-xl bg-neutral-50/90 px-4 py-3 dark:bg-neutral-800/50">
                          <div>
                            <div className="text-xs font-bold text-neutral-900 dark:text-white">
                              Đặt làm biến thể mặc định
                            </div>
                            <div className="text-[11px] text-neutral-500">
                              Thu ngân bấm chọn nhanh sản phẩm trên POS sẽ tự động lấy biến thể này.
                            </div>
                          </div>
                          <BeSwitch
                            checked={activeVar.is_default}
                            onCheckedChange={(checked) => {
                              if (checked) setDefaultDraftVariant(safeVarIdx);
                            }}
                            disabled={activeVar.is_default}
                            ariaLabel="Đặt làm biến thể mặc định"
                          />
                        </div>

                        {/* Row 4: Option Groups / Toppings attached to this variant */}
                        <div className="space-y-2 pt-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                              Nhóm tùy chọn đi kèm ({activeVar.option_group_ids.length} đã gắn)
                            </span>
                            {variants.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const ids = [...activeVar.option_group_ids];
                                  setVariants((prev) =>
                                    prev.map((v) => ({ ...v, option_group_ids: ids }))
                                  );
                                  notify("info", `Đã áp dụng ${ids.length} nhóm tùy chọn cho tất cả ${variants.length} biến thể.`);
                                }}
                                className="text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400"
                              >
                                Áp dụng cho tất cả biến thể
                              </button>
                            )}
                          </div>
                          <BeMultiSelect
                            options={optionGroups.map((og) => {
                              const previewItems = og.items
                                .slice(0, 3)
                                .map((it) =>
                                  Number(it.price_delta) > 0
                                    ? `${it.name} (+${formatPriceNumber(it.price_delta)})`
                                    : it.name
                                )
                                .join(", ");
                              const extra =
                                og.items.length > 3 ? ` +${og.items.length - 3}` : "";
                              return {
                                value: og.id,
                                label: `${og.name} (${
                                  og.selection_mode === "single" ? "Chọn 1" : "Chọn nhiều"
                                }${og.is_required ? " · Bắt buộc" : ""})`,
                                description: previewItems
                                  ? `${previewItems}${extra}`
                                  : "Chưa có lựa chọn con",
                              };
                            })}
                            values={activeVar.option_group_ids}
                            onChange={(next) =>
                              updateDraftVariant(safeVarIdx, { option_group_ids: next })
                            }
                            placeholder="Chọn nhóm Topping, Mức đường, Đồ ăn kèm..."
                            emptyText="Chưa có nhóm tùy chọn nào. Tạo tại mục Quản lý Tùy chọn."
                          />

                          {/* Compact Collapsible Accordion Preview of Attached Option Groups */}
                          <AnimatePresence initial={false}>
                            {activeVar.option_group_ids.length > 0 && (
                              <motion.div
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 4 }}
                                transition={{ duration: 0.18 }}
                                className="space-y-1.5 pt-1"
                              >
                                <div className="flex items-center justify-between text-[11px] text-neutral-400">
                                  <span>
                                    Nhấn vào từng nhóm để xem nhanh các lựa chọn bên trong ({activeVar.option_group_ids.length} nhóm)
                                  </span>
                                  {activeVar.option_group_ids.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const allOpen = activeVar.option_group_ids.every(
                                          (id) => expandedOptionGroupIds.includes(id)
                                        );
                                        setExpandedOptionGroupIds(
                                          allOpen ? [] : [...activeVar.option_group_ids]
                                        );
                                      }}
                                      className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
                                    >
                                      {activeVar.option_group_ids.every((id) =>
                                        expandedOptionGroupIds.includes(id)
                                      )
                                        ? "Thu gọn tất cả"
                                        : "Mở tất cả"}
                                    </button>
                                  )}
                                </div>

                                <div className="max-h-[210px] space-y-1.5 overflow-y-auto pr-1">
                                  {activeVar.option_group_ids.map((gid) => {
                                    const grp = optionGroups.find((g) => g.id === gid);
                                    if (!grp) return null;
                                    const isOpen = expandedOptionGroupIds.includes(gid);

                                    return (
                                      <motion.div
                                        key={gid}
                                        layout
                                        initial={{ opacity: 0, y: -4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -4 }}
                                        className="overflow-hidden rounded-xl bg-neutral-50/90 dark:bg-neutral-800/50"
                                      >
                                        {/* Compact 1-Line Accordion Header */}
                                        <div
                                          onClick={() =>
                                            setExpandedOptionGroupIds((prev) =>
                                              prev.includes(gid)
                                                ? prev.filter((id) => id !== gid)
                                                : [...prev, gid]
                                            )
                                          }
                                          className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 transition-colors hover:bg-neutral-100/80 dark:hover:bg-neutral-800"
                                        >
                                          <div className="flex min-w-0 flex-1 items-center gap-2">
                                            <span className="truncate text-xs font-bold text-neutral-900 dark:text-white">
                                              {grp.name}
                                            </span>
                                            <span
                                              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                                                grp.is_required
                                                  ? "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400"
                                                  : "bg-neutral-200/70 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"
                                              }`}
                                            >
                                              {grp.is_required ? "Bắt buộc" : "Tùy chọn"}
                                            </span>
                                            <span className="hidden sm:inline shrink-0 text-[10px] text-neutral-400">
                                              {grp.selection_mode === "single"
                                                ? "Chọn 1"
                                                : `Chọn nhiều (${grp.min_selections}–${
                                                    grp.max_selections ?? "∞"
                                                  })`}{" "}
                                              • {grp.items.length} lựa chọn
                                            </span>
                                          </div>

                                          <div className="flex shrink-0 items-center gap-1">
                                            <motion.span
                                              animate={{ rotate: isOpen ? 180 : 0 }}
                                              transition={{ duration: 0.16 }}
                                              className="grid h-6 w-6 place-items-center text-neutral-400"
                                            >
                                              <ChevronDown className="h-3.5 w-3.5" />
                                            </motion.span>
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                updateDraftVariant(safeVarIdx, {
                                                  option_group_ids:
                                                    activeVar.option_group_ids.filter(
                                                      (id) => id !== gid
                                                    ),
                                                });
                                              }}
                                              title="Gỡ nhóm tùy chọn này"
                                              className="grid h-6 w-6 place-items-center rounded-full text-neutral-400 hover:bg-neutral-200/70 hover:text-rose-600 dark:hover:bg-neutral-700"
                                            >
                                              <X className="h-3.5 w-3.5" />
                                            </button>
                                          </div>
                                        </div>

                                        {/* Expandable Child Options List */}
                                        <AnimatePresence initial={false}>
                                          {isOpen && (
                                            <motion.div
                                              initial={{ height: 0, opacity: 0 }}
                                              animate={{ height: "auto", opacity: 1 }}
                                              exit={{ height: 0, opacity: 0 }}
                                              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                                              className="overflow-hidden border-t border-neutral-200/60 dark:border-neutral-700/60"
                                            >
                                              <div className="flex flex-wrap gap-1.5 px-3 py-2.5">
                                                {grp.items.map((it, i) => (
                                                  <span
                                                    key={it.id || i}
                                                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium ${
                                                      it.is_default
                                                        ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                                                        : "bg-white text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
                                                    }`}
                                                  >
                                                    <span className="max-w-[140px] truncate">
                                                      {it.name}
                                                    </span>
                                                    {Number(it.price_delta) > 0 && (
                                                      <span className="tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                                                        +{formatPriceNumber(it.price_delta)}
                                                      </span>
                                                    )}
                                                    {it.is_default && (
                                                      <Check className="h-2.5 w-2.5 shrink-0" />
                                                    )}
                                                  </span>
                                                ))}
                                              </div>
                                            </motion.div>
                                          )}
                                        </AnimatePresence>
                                      </motion.div>
                                    );
                                  })}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  )}
                </div>
              </motion.div>
              );
            })()}
          </AnimatePresence>
          </div>
        </div>

        {/* Floating beUI Overflow Actions Bar */}
        {(() => {
          const saveLabel = saving
            ? "Đang lưu..."
            : editingProd
              ? "Lưu Thay Đổi"
              : "Tạo Sản Phẩm";
          const triggerSave = () => {
            void handleSaveProduct({
              preventDefault: () => {},
            } as React.FormEvent);
          };

          const primaryActions: OverflowActionItem[] =
            currentStepIdx < stepsMeta.length - 1
              ? [
                  {
                    id: "next",
                    label: "Tiếp theo",
                    icon: <ArrowRight className="h-4 w-4" />,
                    variant: "primary",
                    onClick: handleNextStep,
                  },
                  {
                    id: "save",
                    label: saveLabel,
                    icon: <Check className="h-4 w-4" />,
                    disabled: saving,
                    onClick: triggerSave,
                  },
                ]
              : [
                  {
                    id: "save",
                    label: editingProd ? (saving ? "Đang lưu..." : "Hoàn tất & Lưu") : saving ? "Đang lưu..." : "Tạo Sản Phẩm",
                    icon: <Check className="h-4 w-4" />,
                    variant: "primary",
                    disabled: saving,
                    onClick: triggerSave,
                  },
                  {
                    id: "prev",
                    label: "Quay lại",
                    icon: <ArrowLeft className="h-4 w-4" />,
                    onClick: handlePrevStep,
                  },
                ];

          const overflowActions: OverflowActionItem[] = [
            ...(currentStepIdx > 0 && currentStepIdx < stepsMeta.length - 1
              ? [
                  {
                    id: "prev-overflow",
                    label: "Quay lại",
                    icon: <ArrowLeft className="h-4 w-4" />,
                    onClick: handlePrevStep,
                  } as OverflowActionItem,
                ]
              : []),
            {
              id: "cancel",
              label: "Hủy bỏ",
              icon: <X className="h-4 w-4" />,
              variant: "danger",
              onClick: () => setEditorOpen(false),
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
      </motion.form>
    );
  }

  // ===========================================================================
  // RESPONSIVE FIT-TO-VIEWPORT TABLE VIEW + BEUI ANIMATED PAGINATION (NO SCROLL)
  // ===========================================================================
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="flex h-full flex-1 min-h-0 flex-col gap-3"
    >
      {/* Compact Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">
            Quản Lý Sản Phẩm & Biến Thể
          </h1>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            Hiển thị {pagedProducts.length} / {filtered.length} sản phẩm (tự động {pageSize} dòng vừa khít màn hình).
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

      {/* Compact Search + Single beUI Filter Trigger Bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2.5 rounded-2xl border border-neutral-200/80 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
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

        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={() => {
              setFilterCatIds([]);
              setFilterStatus("all");
              setFilterType("all");
              setPriceRange(null);
              setListEpoch((k) => k + 1);
            }}
            className="inline-flex items-center gap-1 rounded-xl border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-[11px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
          >
            <X className="h-3 w-3" />
            Xóa lọc
          </button>
        )}

        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={openFilterModal}
          className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition-all ${
            activeFilterCount > 0
              ? "border-neutral-900 bg-neutral-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-neutral-900"
              : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span>Bộ lọc</span>
          {activeFilterCount > 0 && (
            <span
              className={`inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                activeFilterCount > 0
                  ? "bg-white text-neutral-900 dark:bg-neutral-900 dark:text-white"
                  : ""
              }`}
            >
              {activeFilterCount}
            </span>
          )}
        </motion.button>
      </div>

      {/* Unified Table + Pinned Pagination Section: fills viewport height, zero jumping */}
      <div
        ref={tableContainerRef}
        className="flex flex-1 min-h-0 flex-col justify-between overflow-visible rounded-2xl border border-neutral-200/80 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div
          style={{ minHeight: THEAD_HEIGHT + pageSize * ROW_HEIGHT }}
          className="min-h-0 flex-1 overflow-visible"
        >
          <table className="w-full table-fixed text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-200/80 bg-neutral-50/70 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-400">
                <th className="w-[28%] px-4 py-2.5">Sản phẩm</th>
                <th className="w-[24%] px-3 py-2.5">Danh mục</th>
                <th className="w-[17%] px-3 py-2.5">Biến thể</th>
                <th className="w-[14%] px-3 py-2.5">Khoảng giá</th>
                <th className="w-[9%] whitespace-nowrap px-3 py-2.5">Trạng thái</th>
                <th className="w-[8%] whitespace-nowrap px-3 py-2.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody
              key={`${listEpoch}-${safePage}`}
              className="divide-y divide-neutral-100 dark:divide-neutral-800"
            >
              {pagedProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-xs text-neutral-500">
                    Không có sản phẩm nào phù hợp.
                  </td>
                </tr>
              ) : (
                pagedProducts.map((p, rowIdx) => {
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
                    ? formatPriceNumber(minPrice)
                    : `${formatPriceNumber(minPrice)} – ${formatPriceNumber(maxPrice)}`;

                const openUpward =
                  pagedProducts.length > 2 && rowIdx >= pagedProducts.length - 2;

                return (
                  <motion.tr
                    key={p.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.22,
                      delay: Math.min(rowIdx * 0.025, 0.25),
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="h-[54px] transition-colors hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40"
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
                            className="truncate text-[10px] font-medium text-neutral-400"
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
                        className="truncate tabular-nums font-bold text-neutral-900 dark:text-white"
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
                            initial={{ opacity: 0, scale: 0.95, y: openUpward ? 4 : -4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: openUpward ? 4 : -4 }}
                            transition={{ duration: 0.12 }}
                            onClick={(e) => e.stopPropagation()}
                            className={`absolute right-3 z-30 w-44 rounded-xl border border-neutral-200 bg-white p-1.5 text-left shadow-xl dark:border-neutral-700 dark:bg-neutral-900 ${
                              openUpward ? "bottom-11" : "top-10"
                            }`}
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
                  </motion.tr>
                );
              })
            )}
            </tbody>
          </table>
        </div>

        {/* Pinned Footer inside same card with beUI Animated Pagination */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-neutral-200/80 bg-neutral-50/50 px-4 py-2.5 dark:border-neutral-800 dark:bg-neutral-900/60">
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

      {/* ===================================================================== */}
      {/* BEUI MORPHING FILTER MODAL                                            */}
      {/* ===================================================================== */}
      <AnimatePresence>
        {filterModalOpen && (
          <>
            {/* Blurred Backdrop */}
            <motion.div
              key="filter-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => setFilterModalOpen(false)}
              className="fixed inset-0 z-[80] bg-black/20 [backdrop-filter:blur(10px)_saturate(140%)] [-webkit-backdrop-filter:blur(10px)_saturate(140%)] dark:bg-black/50"
            />

            {/* Centered Spring Panel */}
            <div className="pointer-events-none fixed inset-4 z-[81] flex items-center justify-center">
              <motion.div
                key="filter-panel"
                role="dialog"
                aria-modal="true"
                aria-label="Bộ lọc sản phẩm"
                initial={{ opacity: 0, y: 20, scale: 0.96, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                exit={{
                  opacity: 0,
                  y: 16,
                  scale: 0.97,
                  filter: "blur(4px)",
                  transition: { duration: 0.16, ease: [0.16, 1, 0.3, 1] },
                }}
                transition={{ type: "spring", stiffness: 420, damping: 38, mass: 0.55 }}
                className="pointer-events-auto w-full max-w-[540px] overflow-hidden rounded-3xl border border-neutral-200/90 bg-neutral-100/95 p-1.5 shadow-2xl dark:border-neutral-700/80 dark:bg-neutral-900/95"
              >
                {/* Outer Header */}
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                    Bộ lọc sản phẩm
                  </span>
                  <button
                    type="button"
                    onClick={() => setFilterModalOpen(false)}
                    aria-label="Đóng bộ lọc"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-200/70 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Inner Crisp Card */}
                <div className="max-h-[78vh] overflow-y-auto rounded-[20px] border border-neutral-200/70 bg-white p-5 space-y-5 dark:border-neutral-800 dark:bg-neutral-950">
                  {/* 1. Khoảng giá bán */}
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                        Khoảng giá bán
                      </h3>
                      <span className="tabular-nums text-[11px] text-neutral-500">
                        {formatPriceNumber(draftPriceRange[0])} – {formatPriceNumber(draftPriceRange[1])}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-neutral-400">
                      Kéo thanh trượt hoặc nhập giá tối thiểu / tối đa để lọc nhanh.
                    </p>

                    {/* Smooth Spring Dual Range Slider */}
                    <SmoothPriceRangeSlider
                      min={0}
                      max={maxCatalogPrice}
                      step={1000}
                      value={draftPriceRange}
                      onChange={setDraftPriceRange}
                    />

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50/70 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
                        <span className="tabular-nums text-xs font-bold text-neutral-900 dark:text-white">
                          {formatPriceNumber(draftPriceRange[0])}
                        </span>
                        <span className="text-[11px] text-neutral-400">Giá tối thiểu</span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50/70 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
                        <span className="tabular-nums text-xs font-bold text-neutral-900 dark:text-white">
                          {formatPriceNumber(draftPriceRange[1])}
                        </span>
                        <span className="text-[11px] text-neutral-400">Giá tối đa</span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-dashed border-neutral-200 dark:border-neutral-800" />

                  {/* 2. Trạng thái bán (2-column cards) */}
                  <div>
                    <h3 className="mb-2.5 text-sm font-bold text-neutral-900 dark:text-white">
                      Trạng thái bán
                    </h3>
                    <div className="grid grid-cols-2 gap-2.5">
                      {[
                        {
                          id: "all",
                          title: "Tất cả trạng thái",
                          desc: "Hiển thị toàn bộ sản phẩm hiện có",
                        },
                        {
                          id: "active",
                          title: "Đang bán",
                          desc: "Sẵn sàng hiển thị và bán trên POS",
                        },
                        {
                          id: "inactive",
                          title: "Ngừng bán",
                          desc: "Tạm ẩn khỏi màn hình bán hàng",
                        },
                        {
                          id: "archived",
                          title: "Đã lưu trữ",
                          desc: "Sản phẩm cũ đã ngừng kinh doanh",
                        },
                      ].map((st) => {
                        const selected = draftStatus === st.id;
                        return (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => setDraftStatus(st.id)}
                            className={`rounded-xl border px-3.5 py-2.5 text-left transition-all ${
                              selected
                                ? "border-neutral-900 bg-neutral-50 ring-1 ring-neutral-900 dark:border-white dark:bg-neutral-900 dark:ring-white"
                                : "border-neutral-200 bg-neutral-50/50 hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900/40"
                            }`}
                          >
                            <div className="text-xs font-bold text-neutral-900 dark:text-white">
                              {st.title}
                            </div>
                            <div className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                              {st.desc}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border-t border-dashed border-neutral-200 dark:border-neutral-800" />

                  {/* 3. Danh mục (Multi-select chips with search + expand/collapse + bounded scroll) */}
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                        Danh mục sản phẩm
                      </h3>
                      <span className="text-[11px] text-neutral-400">
                        {draftCatIds.length === 0
                          ? `Tất cả (${categories.length})`
                          : `Đã chọn ${draftCatIds.length}`}
                      </span>
                    </div>

                    {categories.length > 6 && (
                      <div className="mb-2 flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50/70 px-2.5 py-1.5 dark:border-neutral-800 dark:bg-neutral-900">
                        <Search className="h-3 w-3 shrink-0 text-neutral-400" />
                        <input
                          type="text"
                          value={catSearch}
                          onChange={(e) => setCatSearch(e.target.value)}
                          placeholder="Tìm nhanh danh mục..."
                          className="w-full bg-transparent text-[11px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:text-white"
                        />
                        {catSearch && (
                          <button
                            type="button"
                            onClick={() => setCatSearch("")}
                            className="text-neutral-400 hover:text-neutral-700"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    )}

                    {(() => {
                      const cq = catSearch.trim().toLowerCase();
                      const matchedCats = cq
                        ? categories.filter((c) => c.name.toLowerCase().includes(cq))
                        : categories;
                      const limit = 8;
                      const isSearching = cq.length > 0;
                      const visibleCats =
                        isSearching || showAllCats
                          ? matchedCats
                          : matchedCats.slice(0, limit);
                      const hiddenCount = Math.max(0, matchedCats.length - visibleCats.length);

                      return (
                        <>
                          <div className="flex max-h-[140px] flex-wrap gap-2 overflow-y-auto pr-1">
                            {!isSearching && (
                              <button
                                type="button"
                                onClick={() => setDraftCatIds([])}
                                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                                  draftCatIds.length === 0
                                    ? "border-neutral-900 bg-white text-neutral-900 ring-1 ring-neutral-900 dark:border-white dark:bg-neutral-900 dark:text-white dark:ring-white"
                                    : "border-neutral-200 bg-neutral-50/70 text-neutral-600 hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
                                }`}
                              >
                                Tất cả
                              </button>
                            )}
                            {visibleCats.map((cat) => {
                              const active = draftCatIds.includes(cat.id);
                              return (
                                <button
                                  key={cat.id}
                                  type="button"
                                  title={cat.name}
                                  onClick={() =>
                                    setDraftCatIds((prev) =>
                                      prev.includes(cat.id)
                                        ? prev.filter((id) => id !== cat.id)
                                        : [...prev, cat.id]
                                    )
                                  }
                                  className={`max-w-[170px] truncate rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                                    active
                                      ? "border-neutral-900 bg-white text-neutral-900 ring-1 ring-neutral-900 dark:border-white dark:bg-neutral-900 dark:text-white dark:ring-white"
                                      : "border-neutral-200 bg-neutral-50/70 text-neutral-600 hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
                                  }`}
                                >
                                  {cat.name}
                                </button>
                              );
                            })}
                            {matchedCats.length === 0 && (
                              <span className="py-1 text-[11px] text-neutral-400">
                                Không tìm thấy danh mục phù hợp.
                              </span>
                            )}
                          </div>
                          {!isSearching && matchedCats.length > limit && (
                            <button
                              type="button"
                              onClick={() => setShowAllCats((prev) => !prev)}
                              className="mt-2 text-[11px] font-semibold text-neutral-600 underline-offset-2 hover:text-neutral-900 hover:underline dark:text-neutral-400 dark:hover:text-white"
                            >
                              {showAllCats
                                ? "Thu gọn danh mục"
                                : `Xem thêm (+${hiddenCount} danh mục)`}
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {/* 4. Loại hàng hóa */}
                  <div>
                    <h3 className="mb-2 text-xs font-semibold text-neutral-600 dark:text-neutral-400">
                      Loại hàng hóa
                    </h3>
                    <div className="flex max-h-[92px] flex-wrap gap-2 overflow-y-auto pr-1">
                      {[
                        { id: "all", label: "Tất cả" },
                        { id: "stocked", label: "Hàng có tồn kho" },
                        { id: "non_stocked", label: "Pha chế / Không trừ kho" },
                        { id: "service", label: "Dịch vụ / Phụ thu" },
                      ].map((tp) => {
                        const active = draftType === tp.id;
                        return (
                          <button
                            key={tp.id}
                            type="button"
                            title={tp.label}
                            onClick={() => setDraftType(tp.id)}
                            className={`max-w-[190px] truncate rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                              active
                                ? "border-neutral-900 bg-white text-neutral-900 ring-1 ring-neutral-900 dark:border-white dark:bg-neutral-900 dark:text-white dark:ring-white"
                                : "border-neutral-200 bg-neutral-50/70 text-neutral-600 hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
                            }`}
                          >
                            {tp.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={clearDraftFilters}
                      className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    >
                      Xóa bộ lọc
                    </button>

                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={applyDraftFilters}
                      className="rounded-xl bg-neutral-900 px-5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                    >
                      Xem {draftMatchCount} sản phẩm
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
