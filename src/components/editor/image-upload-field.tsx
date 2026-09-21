"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { uploadQuizImage } from "@/lib/supabase/storage";

export function ImageUploadField({
  value,
  onChange,
  previewClassName = "h-28 w-full object-cover",
  uploadLabel = "העלה תמונה",
  replaceLabel = "החלף תמונה",
}: {
  value: string;
  onChange: (url: string) => void;
  previewClassName?: string;
  uploadLabel?: string;
  replaceLabel?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const url = await uploadQuizImage(supabase, file);
      onChange(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "העלאת התמונה נכשלה");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      {value && (
        <div className="relative overflow-hidden rounded-lg border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className={previewClassName} draggable={false} />
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            className="absolute top-1.5 left-1.5"
            onClick={() => onChange("")}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? "מעלה..." : value ? replaceLabel : uploadLabel}
      </Button>
    </div>
  );
}
