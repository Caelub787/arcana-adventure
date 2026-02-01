import React from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bold, Italic, Underline, Type } from "lucide-react";

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
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  content: string;
  onContentChange: (content: string) => void;
  font: NoteFont;
  onFontChange: (font: NoteFont) => void;
  compact?: boolean;
}

export function FormattingToolbar({
  textareaRef,
  content,
  onContentChange,
  font,
  onFontChange,
  compact = false,
}: FormattingToolbarProps) {
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

  const handleBold = () => wrapSelection("**", "**");
  const handleItalic = () => wrapSelection("*", "*");
  const handleUnderline = () => wrapSelection("__", "__");

  const buttonSize = compact ? "h-6 w-6" : "h-8 w-8";
  const iconSize = compact ? "h-3 w-3" : "h-4 w-4";
  const selectHeight = compact ? "h-6" : "h-8";

  return (
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
  
  const regex = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(__([^_]+)__)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > currentIndex) {
      parts.push(
        <span key={`${keyPrefix}-text-${currentIndex}`}>
          {text.slice(currentIndex, match.index)}
        </span>
      );
    }

    if (match[1] && match[2]) {
      parts.push(
        <strong key={`${keyPrefix}-bold-${match.index}`} className="font-bold">
          {match[2]}
        </strong>
      );
    } else if (match[3] && match[4]) {
      parts.push(
        <em key={`${keyPrefix}-italic-${match.index}`} className="italic">
          {match[4]}
        </em>
      );
    } else if (match[5] && match[6]) {
      parts.push(
        <span key={`${keyPrefix}-underline-${match.index}`} className="underline">
          {match[6]}
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
