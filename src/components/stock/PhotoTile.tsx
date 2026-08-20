"use client";

import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { useFormStatus } from "react-dom";
import { ActionForm } from "@/components/ui/ActionForm";
import { removeStockPhoto, saveStockPhoto } from "@/lib/actions/stock";
import { ALLOWED_MIME_TYPES } from "@/lib/file-constants";
import { useRecoveredForm } from "@/lib/form-recovery";
import type { PhotoOwner } from "@/lib/stock-photos";
import { cn } from "@/lib/utils";

/**
 * The picture of a box, and the one gesture that changes it.
 *
 * Press the picture, choose or take a photograph, done — no dialog, no upload
 * button, no second screen. On a phone that is "point the camera at the box the
 * app is asking about", which is the only way this ever gets filled in: whoever
 * is holding the carton is standing in the storage room, not at a desk.
 *
 * The tile is a `label` over a hidden file input, so the whole square is the
 * target rather than a 24px paperclip — and the form submits itself the moment a
 * file is chosen, because a separate "save" is one step too many for something
 * whose result is already visible.
 */
export function PhotoTile({
  kind,
  id,
  name,
  src,
  inherited = false,
  canEdit,
  size = "md",
  allowRemove = true,
  className,
}: {
  kind: PhotoOwner;
  id: string;
  /** What is in the picture, for the alt text and the file dialog's label. */
  name: string;
  /** Where the photograph is, or null when there is none to show. */
  src: string | null;
  /** True when `src` is the product's picture rather than this row's own. */
  inherited?: boolean;
  canEdit: boolean;
  /**
   * `sm` is a thumbnail beside a line of text; `xl` is the picture leading a
   * card on the stock list, where recognising the box *is* the point.
   */
  size?: "sm" | "md" | "lg" | "xl";
  /**
   * Whether the little bin appears on a picture this row owns.
   *
   * Off on the stock list, where the row already ends in its own delete button
   * and two bins a hand's width apart is how the wrong one gets pressed.
   * Correcting a photograph belongs on the catalogue, which is the screen for
   * photographs — adding one from anywhere still works, because that is the half
   * somebody standing at the shelf actually needs.
   */
  allowRemove?: boolean;
  /** For the caller's own layout — the stock row wants it aligned to the top. */
  className?: string;
}) {
  const t = useTranslations("stock");
  const uid = useId();
  const { state, formAction, formRef } = useRecoveredForm(saveStockPhoto);

  const box =
    size === "xl"
      ? "h-28 w-28 sm:h-36 sm:w-36"
      : size === "lg"
        ? "h-24 w-24 sm:h-28 sm:w-28"
        : size === "sm"
          ? "h-14 w-14"
          : "h-20 w-20";

  // The captions below the tile are the one thing that would widen a shrink-to-fit
  // column, so they are held to the tile's own width rather than the sentence's.
  const caption = size === "xl" ? "max-w-36" : "max-w-28";

  const picture = src ? (
    // A plain `img`: the bytes come from a session-checked route that
    // `next/image` cannot fetch, exactly as in `DocumentGallery`.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={t("photoOf", { name })}
      className={cn("h-full w-full object-cover", inherited && "opacity-90")}
    />
  ) : (
    <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-faint">
      <ImagePlus
        size={size === "xl" ? 34 : size === "lg" ? 30 : size === "sm" ? 20 : 24}
        aria-hidden
      />
      {/* No room for the words on the small tile — the dashed border and the
          plus are what say "press me" there, and the `title` carries the rest. */}
      {canEdit && size !== "sm" ? (
        <span className="px-1 text-center text-[0.7rem] font-semibold">
          {t("photoAdd")}
        </span>
      ) : null}
    </span>
  );

  if (!canEdit) {
    return (
      <span
        className={cn(
          box,
          className,
          "flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface-soft",
        )}
      >
        {picture}
      </span>
    );
  }

  return (
    <div className={cn("shrink-0", className)}>
      <div className="relative">
        <form ref={formRef} action={formAction}>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />

          {/* The label *is* the tile. Focusable in its own right so the keyboard
              reaches it: a label is not a control, and the input it points at is
              off screen. */}
          <label
            htmlFor={`${uid}-file`}
            title={src ? t("photoChange") : t("photoAdd")}
            className={cn(
              box,
              "flex cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-line-strong bg-surface-soft transition-colors",
              "hover:border-brand focus-within:outline focus-within:outline-2 focus-within:outline-brand",
              src && "border-solid border-line",
            )}
          >
            {picture}
            <input
              id={`${uid}-file`}
              name="file"
              type="file"
              accept={ALLOWED_MIME_TYPES.filter((type) =>
                type.startsWith("image/"),
              ).join(",")}
              className="sr-only"
              onChange={(event) => {
                if (event.target.files?.length)
                  formRef.current?.requestSubmit();
              }}
            />
          </label>

          <Working />
        </form>

        {/* A camera corner, so a filled tile still reads as something you press.
            Decorative — the label behind it is the target. */}
        {src && size !== "sm" ? (
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-1.5 -left-1.5 rounded-full border border-line bg-surface p-1 text-ink-soft shadow-card"
          >
            <Camera size={13} />
          </span>
        ) : null}

        {/* Only when the row owns the picture: removing an inherited one from
            here would silently strip every other variant of the product. */}
        {src && !inherited && allowRemove ? (
          <ActionForm
            action={removeStockPhoto}
            values={{ kind, id }}
            confirmMessage={t("photoRemoveConfirm")}
            className="absolute -top-2 -right-2"
          >
            <button
              type="submit"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface text-ink-soft shadow-card hover:text-danger"
              title={t("photoRemove")}
            >
              <Trash2 size={14} aria-hidden />
              <span className="sr-only">{t("photoRemove")}</span>
            </button>
          </ActionForm>
        ) : null}
      </div>

      {state.status === "error" ? (
        <p
          role="alert"
          className={cn(
            "mt-1 text-[0.78rem] font-semibold text-danger",
            caption,
          )}
        >
          {state.message}
        </p>
      ) : null}
      {inherited && size !== "sm" ? (
        <p className={cn("mt-1 text-[0.72rem] text-ink-faint", caption)}>
          {t("photoFromProduct")}
        </p>
      ) : null}
    </div>
  );
}

/** A veil while the bytes are on their way, so nobody presses the tile twice. */
function Working() {
  const { pending } = useFormStatus();
  if (!pending) return null;

  return (
    <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-surface/70">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-brand" />
    </span>
  );
}
