import React, { useState, useRef } from "react";
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
import { Bold, Italic, Underline, Type, Image, Upload, Link, EyeOff } from "lucide-react";

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

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        insertImage(dataUrl, imageAlt.trim() || file.name.replace(/\.[^/.]+$/, ""));
        setImageDialogOpen(false);
        setImageUrl("");
        setImageAlt("");
      }
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
                className="border-2 border-dashed border-stone-600 rounded-lg p-6 text-center cursor-pointer hover:border-amber-500 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 mx-auto text-stone-400 mb-2" />
                <p className="text-stone-400 text-sm">Click to upload an image</p>
                <p className="text-stone-500 text-xs mt-1">PNG, JPG, GIF, WebP</p>
              </div>
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

export function renderFormattedText(text: string, keyPrefix: string = ""): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let currentIndex = 0;
  
  const regex = /!\[([^\]]*)\]\(([^)]+)\)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(__([^_]+)__)|(#([^#\n]+)#)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > currentIndex) {
      parts.push(
        <span key={`${keyPrefix}-text-${currentIndex}`}>
          {text.slice(currentIndex, match.index)}
        </span>
      );
    }

    if (match[9] && match[10]) {
      parts.push(
        <span
          key={`${keyPrefix}-gmsecret-${match.index}`}
          className="bg-red-950/50 border border-red-900/60 rounded px-1 text-red-300"
          title="GM Secret - hidden from players"
        >
          {match[10]}
        </span>
      );
    } else if (match[1] !== undefined && match[2]) {
      const altText = match[1] || "image";
      const imageUrl = match[2];
      parts.push(
        <span key={`${keyPrefix}-image-${match.index}`} className="inline-block my-2">
          <img 
            src={imageUrl} 
            alt={altText}
            className="max-w-full h-auto rounded-md border border-stone-700"
            style={{ maxHeight: "300px" }}
          />
        </span>
      );
    } else if (match[3] && match[4]) {
      parts.push(
        <strong key={`${keyPrefix}-bold-${match.index}`} className="font-bold">
          {match[4]}
        </strong>
      );
    } else if (match[5] && match[6]) {
      parts.push(
        <em key={`${keyPrefix}-italic-${match.index}`} className="italic">
          {match[6]}
        </em>
      );
    } else if (match[7] && match[8]) {
      parts.push(
        <span key={`${keyPrefix}-underline-${match.index}`} className="underline">
          {match[8]}
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
