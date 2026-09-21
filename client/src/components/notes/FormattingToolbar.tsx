import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Bold, Italic, Underline, Type, Image, Upload, Link, EyeOff, Table, AlignLeft, AlignCenter, AlignRight, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

export type NoteFont = "inherit" | "serif" | "sans-serif" | "monospace";

export const FONT_OPTIONS: { value: NoteFont; label: string }[] = [
  { value: "inherit", label: "Default" },
  { value: "serif", label: "Serif" },
  { value: "sans-serif", label: "Sans-serif" },
  { value: "monospace", label: "Monospace" },
];

export function getFontClass(font: NoteFont): string {
  switch (font) {
    case "serif":
      return "font-serif";
    case "sans-serif":
      return "font-sans";
    case "monospace":
      return "font-mono";
    default:
      return "";
  }
}

interface FormattingToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  content: string;
  onContentChange: (content: string) => void;
  font: NoteFont;
  onFontChange: (font: NoteFont) => void;
  compact?: boolean;
  // Shows the "GM Secret" button, which wraps the selection in #...# -
  // redacted server-side for anyone who isn't a GM on this note's campaign.
  // Only GMs can create these, since only a GM can see what they hide.
  isGm?: boolean;
}

export function FormattingToolbar({
  textareaRef,
  content,
  onContentChange,
  font,
  onFontChange,
  compact = false,
  isGm = false,
}: FormattingToolbarProps) {
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [imageTab, setImageTab] = useState<"url" | "upload">("url");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const wrapSelection = (prefix: string, suffix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.slice(start, end);

    if (selectedText) {
      const beforeText = content.slice(0, start);
      const afterText = content.slice(end);
      const newContent = beforeText + prefix + selectedText + suffix + afterText;
      onContentChange(newContent);
      
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(
          start + prefix.length,
          end + prefix.length
        );
      }, 0);
    } else {
      const beforeText = content.slice(0, start);
      const afterText = content.slice(start);
      const placeholder = "text";
      const newContent = beforeText + prefix + placeholder + suffix + afterText;
      onContentChange(newContent);
      
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(
          start + prefix.length,
          start + prefix.length + placeholder.length
        );
      }, 0);
    }
  };

  const insertImage = (url: string, alt: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const beforeText = content.slice(0, start);
    const afterText = content.slice(start);
    const imageMarkdown = `![${alt || "image"}](${url})`;
    const newContent = beforeText + imageMarkdown + afterText;
    onContentChange(newContent);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + imageMarkdown.length,
        start + imageMarkdown.length
      );
    }, 0);
  };

  const insertTable = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const beforeText = content.slice(0, start);
    const afterText = content.slice(start);
    const needsLeadingNewline = beforeText.length > 0 && !beforeText.endsWith("\n");
    const needsTrailingNewline = afterText.length > 0 && !afterText.startsWith("\n");
    const table = "| Column 1 | Column 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |";
    const insertion = (needsLeadingNewline ? "\n" : "") + table + (needsTrailingNewline ? "\n" : "");
    const newContent = beforeText + insertion + afterText;
    onContentChange(newContent);

    setTimeout(() => {
      textarea.focus();
      const cursorPos = start + insertion.length;
      textarea.setSelectionRange(cursorPos, cursorPos);
    }, 0);
  };

  const handleImageInsert = () => {
    if (imageUrl.trim()) {
      insertImage(imageUrl.trim(), imageAlt.trim());
      setImageDialogOpen(false);
      setImageUrl("");
      setImageAlt("");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      return;
    }

    setUploadError(null);
    setIsUploadingImage(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) {
        setIsUploadingImage(false);
        return;
      }
      try {
        // Persisted to a real asset, not inlined as base64 - a multi-MB data
        // URL sitting in the note's content, re-serialized on every
        // keystroke's autosave and every revision snapshot, is what made
        // uploads look like they "didn't work" (the page just bogged down).
        const { url } = await api.uploadBase64Image(dataUrl);
        insertImage(url, imageAlt.trim() || file.name.replace(/\.[^/.]+$/, ""));
        setImageDialogOpen(false);
        setImageUrl("");
        setImageAlt("");
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setIsUploadingImage(false);
      }
    };
    reader.onerror = () => {
      setIsUploadingImage(false);
      setUploadError("Couldn't read that file");
    };
    reader.readAsDataURL(file);
  };

  const handleBold = () => wrapSelection("**", "**");
  const handleItalic = () => wrapSelection("*", "*");
  const handleUnderline = () => wrapSelection("__", "__");
  const handleGmSecret = () => wrapSelection("#", "#");

  const buttonSize = compact ? "h-6 w-6" : "h-8 w-8";
  const iconSize = compact ? "h-3 w-3" : "h-4 w-4";
  const selectHeight = compact ? "h-6" : "h-8";

  return (
    <>
      <div className="flex items-center gap-1 mb-2" data-testid="formatting-toolbar">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={`${buttonSize} border-stone-700 hover:bg-stone-800`}
          onClick={handleBold}
          title="Bold (Ctrl+B)"
          data-testid="button-format-bold"
        >
          <Bold className={iconSize} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={`${buttonSize} border-stone-700 hover:bg-stone-800`}
          onClick={handleItalic}
          title="Italic (Ctrl+I)"
          data-testid="button-format-italic"
        >
          <Italic className={iconSize} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={`${buttonSize} border-stone-700 hover:bg-stone-800`}
          onClick={handleUnderline}
          title="Underline (Ctrl+U)"
          data-testid="button-format-underline"
        >
          <Underline className={iconSize} />
        </Button>
        {isGm && (
          <>
            <div className="w-px h-5 bg-stone-700 mx-1" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={`${buttonSize} border-red-900 text-red-400 hover:bg-red-950`}
              onClick={handleGmSecret}
              title="GM Secret (hidden from players)"
              data-testid="button-format-gm-secret"
            >
              <EyeOff className={iconSize} />
            </Button>
          </>
        )}
        <div className="w-px h-5 bg-stone-700 mx-1" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={`${buttonSize} border-stone-700 hover:bg-stone-800`}
          onClick={() => setImageDialogOpen(true)}
          title="Insert Image"
          data-testid="button-insert-image"
        >
          <Image className={iconSize} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={`${buttonSize} border-stone-700 hover:bg-stone-800`}
          onClick={insertTable}
          title="Insert Table"
          data-testid="button-insert-table"
        >
          <Table className={iconSize} />
        </Button>
        <div className="w-px h-5 bg-stone-700 mx-1" />
        <Select value={font} onValueChange={(v) => onFontChange(v as NoteFont)}>
          <SelectTrigger 
            className={`${selectHeight} w-28 border-stone-700 bg-stone-900 text-xs`}
            data-testid="select-font"
          >
            <Type className={`${iconSize} mr-1`} />
            <SelectValue placeholder="Font" />
          </SelectTrigger>
          <SelectContent className="bg-stone-900 border-stone-700">
            {FONT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                <span className={getFontClass(opt.value)}>{opt.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Dialog open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
        <DialogContent className="bg-stone-900 border-stone-700 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-stone-100">Insert Image</DialogTitle>
            <DialogDescription className="text-stone-400">
              Add an image to your note using a URL or by uploading a file.
            </DialogDescription>
          </DialogHeader>
          <Tabs value={imageTab} onValueChange={(v) => setImageTab(v as "url" | "upload")} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-stone-800">
              <TabsTrigger value="url" className="data-[state=active]:bg-stone-700">
                <Link className="h-4 w-4 mr-2" />
                URL
              </TabsTrigger>
              <TabsTrigger value="upload" className="data-[state=active]:bg-stone-700">
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </TabsTrigger>
            </TabsList>
            <TabsContent value="url" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="image-url" className="text-stone-300">Image URL</Label>
                <Input
                  id="image-url"
                  placeholder="https://example.com/image.png"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-image-url"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="image-alt-url" className="text-stone-300">Alt Text (optional)</Label>
                <Input
                  id="image-alt-url"
                  placeholder="Description of the image"
                  value={imageAlt}
                  onChange={(e) => setImageAlt(e.target.value)}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-image-alt"
                />
              </div>
            </TabsContent>
            <TabsContent value="upload" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="image-alt-upload" className="text-stone-300">Alt Text (optional)</Label>
                <Input
                  id="image-alt-upload"
                  placeholder="Description of the image"
                  value={imageAlt}
                  onChange={(e) => setImageAlt(e.target.value)}
                  className="bg-stone-800 border-stone-700"
                />
              </div>
              <div
                className={`border-2 border-dashed border-stone-600 rounded-lg p-6 text-center transition-colors ${isUploadingImage ? "opacity-60 cursor-wait" : "cursor-pointer hover:border-amber-500"}`}
                onClick={() => !isUploadingImage && fileInputRef.current?.click()}
              >
                {isUploadingImage ? (
                  <>
                    <Loader2 className="h-8 w-8 mx-auto text-amber-500 mb-2 animate-spin" />
                    <p className="text-stone-400 text-sm">Uploading…</p>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 mx-auto text-stone-400 mb-2" />
                    <p className="text-stone-400 text-sm">Click to upload an image</p>
                    <p className="text-stone-500 text-xs mt-1">PNG, JPG, GIF, WebP</p>
                  </>
                )}
              </div>
              {uploadError && (
                <p className="text-red-400 text-xs" data-testid="text-image-upload-error">{uploadError}</p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
                data-testid="input-image-file"
              />
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setImageDialogOpen(false);
                setImageUrl("");
                setImageAlt("");
                setUploadError(null);
              }}
              className="border-stone-700"
            >
              Cancel
            </Button>
            {imageTab === "url" && (
              <Button
                onClick={handleImageInsert}
                disabled={!imageUrl.trim()}
                className="bg-amber-600 hover:bg-amber-700"
                data-testid="button-confirm-image"
              >
                Insert
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function useFormattingShortcuts(
  textareaRef: React.RefObject<HTMLTextAreaElement>,
  content: string,
  onContentChange: (content: string) => void
) {
  const wrapSelection = React.useCallback((prefix: string, suffix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.slice(start, end);

    if (selectedText) {
      const beforeText = content.slice(0, start);
      const afterText = content.slice(end);
      const newContent = beforeText + prefix + selectedText + suffix + afterText;
      onContentChange(newContent);
      
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(
          start + prefix.length,
          end + prefix.length
        );
      }, 0);
    }
  }, [textareaRef, content, onContentChange]);

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault();
          wrapSelection("**", "**");
          break;
        case 'i':
          e.preventDefault();
          wrapSelection("*", "*");
          break;
        case 'u':
          e.preventDefault();
          wrapSelection("__", "__");
          break;
      }
    }
  }, [wrapSelection]);

  return handleKeyDown;
}

// ---------------------------------------------------------------------------
// Floating/resizable images - a note image can carry an optional directive
// (`{w=320,float=left}`) right after its normal `![alt](url)` markdown,
// holding a pixel width and a wrap side. Omitted entirely for an image
// that's never been resized/repositioned, so every pre-existing note image
// keeps rendering exactly as it did before this existed.
// ---------------------------------------------------------------------------

export interface NoteImageDirective {
  width?: number;
  float?: "left" | "right";
}

const IMAGE_TOKEN_REGEX = /!\[[^\]]*\]\([^)]+\)(?:\{[^}]*\})?/g;

export function parseImageDirective(raw: string | undefined): NoteImageDirective {
  const out: NoteImageDirective = {};
  if (!raw) return out;
  for (const part of raw.split(",")) {
    const [k, v] = part.split("=").map((s) => s.trim());
    if (k === "w") {
      const n = parseInt(v, 10);
      if (Number.isFinite(n) && n > 0) out.width = n;
    } else if (k === "float" && (v === "left" || v === "right")) {
      out.float = v;
    }
  }
  return out;
}

export function buildImageMarkdown(alt: string, url: string, directive: NoteImageDirective): string {
  const parts: string[] = [];
  if (directive.width) parts.push(`w=${Math.round(directive.width)}`);
  if (directive.float) parts.push(`float=${directive.float}`);
  const suffix = parts.length > 0 ? `{${parts.join(",")}}` : "";
  return `![${alt || "image"}](${url})${suffix}`;
}

/**
 * Replaces the Nth (0-indexed) image token in `content`, in document order,
 * with `newMarkdown`. "Document order" here means the same order
 * `renderFormattedText` assigns images as it walks the note top to bottom -
 * see `ImageEditContext` - so an edit made from a click in the read view
 * always lands on the exact image that was clicked, regardless of which
 * line, bullet, or table cell it's nested inside.
 */
export function replaceNthImageMarkdown(content: string, index: number, newMarkdown: string): string {
  let i = 0;
  return content.replace(IMAGE_TOKEN_REGEX, (m) => (i++ === index ? newMarkdown : m));
}

/**
 * Threaded through renderFormattedText (and the formatInlineReferences/
 * formatEntityReferences wrappers around it in the two note-reading
 * components) so every image gets a stable position in document order
 * without either component needing to track character offsets through
 * their own line/bullet/table-cell text transforms.
 */
export interface ImageEditContext {
  counter: { current: number };
  onImageEdit: (index: number, newMarkdown: string) => void;
}

function NoteImage({
  src,
  alt,
  width,
  float,
  editable,
  onChange,
}: {
  src: string;
  alt: string;
  width?: number;
  float?: "left" | "right";
  editable: boolean;
  onChange: (next: NoteImageDirective) => void;
}) {
  const [selected, setSelected] = useState(false);
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    if (!selected) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setSelected(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [selected]);

  const effectiveWidth = liveWidth ?? width;

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startWidth = wrapRef.current?.getBoundingClientRect().width || width || 300;
    dragRef.current = { startX: e.clientX, startWidth };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const next = Math.max(60, Math.round(dragRef.current.startWidth + (ev.clientX - dragRef.current.startX)));
      setLiveWidth(next);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      dragRef.current = null;
      setLiveWidth((current) => {
        if (current != null) onChange({ width: current, float });
        return null;
      });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const isFloating = float === "left" || float === "right";
  const style: React.CSSProperties = {
    width: effectiveWidth ? `${effectiveWidth}px` : undefined,
    maxWidth: "100%",
    float: isFloating ? float : undefined,
    display: isFloating ? undefined : "block",
    margin:
      float === "left" ? "0.25rem 1rem 0.5rem 0"
      : float === "right" ? "0.25rem 0 0.5rem 1rem"
      : "0.5rem auto",
  };

  return (
    <span
      ref={wrapRef}
      className="relative inline-block align-top"
      style={style}
      onClick={editable ? (e) => { e.stopPropagation(); setSelected(true); } : undefined}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={`w-full h-auto rounded-md border ${selected ? "border-amber-500" : "border-stone-700"}`}
        style={!effectiveWidth ? { maxHeight: "300px", width: "auto", maxWidth: "100%" } : undefined}
      />
      {editable && selected && (
        <>
          <div className="absolute -top-8 left-0 flex items-center gap-0.5 bg-stone-900 border border-stone-700 rounded px-1 py-1 shadow-lg z-10">
            <button
              type="button"
              title="Wrap left"
              onClick={(e) => { e.stopPropagation(); onChange({ width: effectiveWidth, float: "left" }); }}
              className={`h-6 w-6 flex items-center justify-center rounded ${float === "left" ? "bg-amber-700 text-white" : "text-stone-400 hover:bg-stone-800"}`}
              data-testid="button-note-image-float-left"
            >
              <AlignLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Center"
              onClick={(e) => { e.stopPropagation(); onChange({ width: effectiveWidth, float: undefined }); }}
              className={`h-6 w-6 flex items-center justify-center rounded ${!float ? "bg-amber-700 text-white" : "text-stone-400 hover:bg-stone-800"}`}
              data-testid="button-note-image-float-center"
            >
              <AlignCenter className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Wrap right"
              onClick={(e) => { e.stopPropagation(); onChange({ width: effectiveWidth, float: "right" }); }}
              className={`h-6 w-6 flex items-center justify-center rounded ${float === "right" ? "bg-amber-700 text-white" : "text-stone-400 hover:bg-stone-800"}`}
              data-testid="button-note-image-float-right"
            >
              <AlignRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div
            onMouseDown={startResize}
            className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-amber-500 border border-amber-700 rounded-tl cursor-nwse-resize"
            style={{ transform: "translate(30%, 30%)" }}
            data-testid="note-image-resize-handle"
          />
        </>
      )}
    </span>
  );
}

export function renderFormattedText(text: string, keyPrefix: string = "", imageCtx?: ImageEditContext): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let currentIndex = 0;

  const regex = /!\[([^\]]*)\]\(([^)]+?)\)(?:\{([^}]*)\})?|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(__([^_]+)__)|(#([^#\n]+)#)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > currentIndex) {
      parts.push(
        <span key={`${keyPrefix}-text-${currentIndex}`}>
          {text.slice(currentIndex, match.index)}
        </span>
      );
    }

    if (match[10] && match[11]) {
      parts.push(
        <span
          key={`${keyPrefix}-gmsecret-${match.index}`}
          className="bg-red-950/50 border border-red-900/60 rounded px-1 text-red-300"
          title="GM Secret - hidden from players"
        >
          {match[11]}
        </span>
      );
    } else if (match[1] !== undefined && match[2]) {
      const altText = match[1] || "image";
      const imageUrl = match[2];
      const directive = parseImageDirective(match[3]);
      const myIndex = imageCtx ? imageCtx.counter.current++ : -1;
      parts.push(
        <NoteImage
          key={`${keyPrefix}-image-${match.index}`}
          src={imageUrl}
          alt={altText}
          width={directive.width}
          float={directive.float}
          editable={!!imageCtx}
          onChange={(next) => {
            if (!imageCtx) return;
            imageCtx.onImageEdit(myIndex, buildImageMarkdown(altText, imageUrl, next));
          }}
        />
      );
    } else if (match[4] && match[5]) {
      parts.push(
        <strong key={`${keyPrefix}-bold-${match.index}`} className="font-bold">
          {match[5]}
        </strong>
      );
    } else if (match[6] && match[7]) {
      parts.push(
        <em key={`${keyPrefix}-italic-${match.index}`} className="italic">
          {match[7]}
        </em>
      );
    } else if (match[8] && match[9]) {
      parts.push(
        <span key={`${keyPrefix}-underline-${match.index}`} className="underline">
          {match[9]}
        </span>
      );
    }

    currentIndex = regex.lastIndex;
  }

  if (currentIndex < text.length) {
    parts.push(
      <span key={`${keyPrefix}-text-${currentIndex}`}>
        {text.slice(currentIndex)}
      </span>
    );
  }

  return parts.length > 0 ? parts : [text];
}
