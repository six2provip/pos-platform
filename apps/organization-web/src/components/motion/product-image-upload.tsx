"use client";
// Adapted from beui.dev/components/blocks/file-upload (AttachmentUpload)

import {
  Check,
  Image as ImageIcon,
  LoaderCircle,
  Star,
  Upload,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface ProductUploadImage {
  image_url: string;
  sort_order: number;
  is_primary: boolean;
  name?: string;
}

interface ProductImageUploadProps {
  images: ProductUploadImage[];
  uploading?: boolean;
  maxFiles?: number;
  onUploadFiles: (files: FileList | null) => Promise<void> | void;
  onSetPrimary: (idx: number) => void;
  onRemove: (idx: number) => void;
}

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const SPRING_LAYOUT = {
  type: "spring",
  stiffness: 360,
  damping: 32,
  mass: 0.6,
} as const;

export function ProductImageUpload({
  images,
  uploading = false,
  maxFiles = 12,
  onUploadFiles,
  onSetPrimary,
  onRemove,
}: ProductImageUploadProps) {
  const reduce = useReducedMotion() ?? false;
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);

  const maxReached = images.length >= maxFiles;

  const resetDrag = useCallback(() => {
    dragDepthRef.current = 0;
    setDragging(false);
  }, []);

  useEffect(() => {
    if (previewIdx === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewIdx(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewIdx]);

  const previewItem =
    previewIdx !== null && images[previewIdx] ? images[previewIdx] : null;

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/*"
        multiple
        disabled={uploading || maxReached}
        tabIndex={-1}
        className="sr-only"
        onChange={(e) => {
          void onUploadFiles(e.currentTarget.files);
          e.currentTarget.value = "";
        }}
      />

      {/* beUI AttachmentUpload Dropzone */}
      <button
        type="button"
        disabled={uploading || maxReached}
        data-dragging={dragging}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => {
          if (uploading || maxReached) return;
          e.preventDefault();
          dragDepthRef.current += 1;
          setDragging(true);
        }}
        onDragOver={(e) => {
          if (uploading || maxReached) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (uploading || maxReached) return;
          e.preventDefault();
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
          if (dragDepthRef.current === 0) setDragging(false);
        }}
        onDrop={(e) => {
          if (uploading || maxReached) return;
          e.preventDefault();
          resetDrag();
          void onUploadFiles(e.dataTransfer.files);
        }}
        className={`group relative flex min-h-[168px] w-full flex-col items-center justify-center gap-3 rounded-3xl border border-dashed p-6 text-center outline-none transition-all active:scale-[0.995] disabled:pointer-events-none disabled:opacity-55 ${
          dragging
            ? "border-blue-500 bg-blue-50/60 dark:border-blue-400 dark:bg-blue-950/30"
            : "border-neutral-300 bg-neutral-50/50 hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900/40 dark:hover:border-neutral-600"
        }`}
      >
        <motion.span
          aria-hidden="true"
          animate={
            reduce
              ? undefined
              : { y: dragging ? -3 : 0, scale: dragging ? 1.05 : 1 }
          }
          transition={{ duration: 0.16, ease: EASE_OUT }}
          className="grid h-12 w-12 place-items-center rounded-2xl border border-neutral-200 bg-white text-neutral-700 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
        >
          {uploading ? (
            <LoaderCircle className="h-5 w-5 animate-spin text-blue-600" />
          ) : (
            <Upload className="h-5 w-5" />
          )}
        </motion.span>

        <div>
          <span className="block text-sm font-semibold text-neutral-900 dark:text-white">
            {uploading
              ? "Đang tải ảnh lên..."
              : maxReached
                ? `Đã đạt giới hạn ${maxFiles} ảnh`
                : "Kéo thả ảnh vào đây hoặc bấm để chọn file"}
          </span>
          <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
            Hỗ trợ PNG, JPG, WEBP • Tối đa {maxFiles} hình ảnh ({images.length}/{maxFiles} đã tải)
          </span>
        </div>
      </button>

      {/* beUI Attachments List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">
            Danh sách hình ảnh ({images.length})
          </span>
          {images.length > 0 && (
            <span className="text-[11px] text-neutral-400">
              Bấm vào ảnh để xem phóng to • Bấm ngôi sao để chọn ảnh đại diện POS
            </span>
          )}
        </div>

        {images.length === 0 ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-neutral-200/80 bg-neutral-50/40 py-6 text-xs text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900/20">
            <ImageIcon className="h-4 w-4" />
            <span>Chưa có hình ảnh nào được tải lên.</span>
          </div>
        ) : (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {images.map((im, idx) => {
                const fileName =
                  im.name ||
                  im.image_url.split("/").pop()?.split("?")[0] ||
                  `product-image-${idx + 1}.jpg`;
                return (
                  <motion.li
                    key={`${im.image_url}-${idx}`}
                    layout={!reduce}
                    initial={
                      reduce ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.985 }
                    }
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={reduce ? undefined : { opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ ...SPRING_LAYOUT }}
                    className="flex min-h-14 items-center gap-1.5 rounded-2xl bg-neutral-100/80 p-1.5 dark:bg-neutral-800/70"
                  >
                    <div className="relative flex min-w-0 flex-1 items-center gap-3 self-stretch overflow-hidden rounded-xl bg-white px-2.5 py-1.5 shadow-xs dark:bg-neutral-900">
                      {/* Clickable Shared-Layout Thumbnail */}
                      <motion.button
                        type="button"
                        onClick={() => setPreviewIdx(idx)}
                        whileTap={reduce ? undefined : { scale: 0.94 }}
                        title="Bấm để xem phóng to"
                        className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[10px] border border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800"
                      >
                        <motion.img
                          layoutId={reduce ? undefined : `prod-img-preview-${idx}`}
                          src={im.image_url}
                          alt={fileName}
                          className="h-full w-full object-cover"
                        />
                      </motion.button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs font-semibold text-neutral-900 dark:text-white">
                            {fileName}
                          </span>
                          {im.is_primary && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                              <Check className="h-2.5 w-2.5" />
                              Ảnh đại diện
                            </span>
                          )}
                        </div>
                        <span className="block text-[11px] text-neutral-400">
                          Thứ tự #{idx + 1} • Đã sẵn sàng đồng bộ POS
                        </span>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onSetPrimary(idx)}
                          title={
                            im.is_primary
                              ? "Đang là ảnh đại diện"
                              : "Đặt làm ảnh đại diện"
                          }
                          className={`grid h-8 w-8 place-items-center rounded-xl transition-colors ${
                            im.is_primary
                              ? "bg-amber-50 text-amber-500 dark:bg-amber-950/40"
                              : "text-neutral-400 hover:bg-neutral-100 hover:text-amber-500 dark:hover:bg-neutral-800"
                          }`}
                        >
                          <Star
                            className={`h-4 w-4 ${im.is_primary ? "fill-current" : ""}`}
                          />
                        </button>

                        <button
                          type="button"
                          onClick={() => onRemove(idx)}
                          title="Xóa ảnh"
                          className="grid h-8 w-8 place-items-center rounded-xl text-neutral-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>

      {/* Lightbox Image Preview Portal */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {previewItem && previewIdx !== null && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                <motion.button
                  type="button"
                  aria-label="Đóng xem trước"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setPreviewIdx(null)}
                  className="fixed inset-0 bg-black/50 backdrop-blur-md"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="relative z-10"
                >
                  <motion.img
                    layoutId={
                      reduce ? undefined : `prod-img-preview-${previewIdx}`
                    }
                    src={previewItem.image_url}
                    alt="Xem trước ảnh sản phẩm"
                    className="max-h-[82vh] max-w-[88vw] rounded-2xl object-contain shadow-2xl"
                  />
                  <button
                    type="button"
                    onClick={() => setPreviewIdx(null)}
                    className="absolute -right-3 -top-3 grid h-9 w-9 place-items-center rounded-full bg-white text-neutral-900 shadow-xl hover:bg-neutral-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
