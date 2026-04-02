import React, { useState, useCallback, useEffect, useRef } from "react";
import { useUpdateEntity, useWikiSearch, ENTITY_TYPE_CONFIG, TAG_COLORS, type Entity, type WikiSearchResult } from "@/lib/worldbuilding-api";
import { PREDEFINED_TAGS } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Bold, Italic, Heading1, Heading2, Heading3, List, ListOrdered, Link2, Image, Eye, EyeOff, Edit3, Save, Hash, Share2, ExternalLink, X, Tag, ChevronDown, Layout, Move, Square, Type, Minus, Circle, Search, BookOpen, Map, Swords, Sparkles, User, FileText } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface WikiArticleEditorProps {
  entity: Entity;
  campaignId?: string;
  worldId?: string;
  isGM: boolean;
  onEntityUpdated?: () => void;
  shareToken?: string;
  customTags?: string[];
}

function renderMarkdownPreview(content: string): string {
  if (!content) return '<p class="text-stone-500 italic">No content yet. Click Edit to start writing.</p>';
  let html = content
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold text-stone-200 mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold text-stone-200 mt-5 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-stone-100 mt-6 mb-3">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-stone-200 font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="text-stone-300 italic">$1</em>')
    .replace(/\[\[([^:\]]+):([^\|\]]+)\|([^\]]+)\]\]/g, '<span class="text-amber-400 bg-amber-900/20 px-1 rounded cursor-pointer hover:underline font-medium">$3</span>')
    .replace(/\[\[(.+?)\]\]/g, '<span class="text-amber-400 bg-amber-900/20 px-1 rounded cursor-pointer hover:underline">$1</span>')
    .replace(/^- (.+)$/gm, '<li class="text-stone-300 ml-4 list-disc">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="text-stone-300 ml-4 list-decimal">$1</li>')
    .replace(/^---$/gm, '<hr class="border-stone-700 my-4" />')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-amber-400 hover:underline">$1</a>')
    .replace(/^(?!<[hlu]|<li|<hr|<p)(.+)$/gm, '<p class="text-stone-300 mb-2 leading-relaxed">$1</p>');
  return html;
}

interface CanvasNode {
  id: string;
  type: "text" | "heading" | "image" | "shape";
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  color?: string;
  shapeType?: "rectangle" | "ellipse" | "line";
}

function CanvasArticleEditor({ content, onChange, isEditing }: { content: string; onChange: (c: string) => void; isEditing: boolean }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<CanvasNode[]>(() => {
    try { return JSON.parse(content || "[]"); } catch { return []; }
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: string; startX: number; startY: number; nodeX: number; nodeY: number } | null>(null);

  const syncNodes = useCallback((newNodes: CanvasNode[]) => {
    setNodes(newNodes);
    onChange(JSON.stringify(newNodes));
  }, [onChange]);

  const addNode = (type: CanvasNode["type"]) => {
    const id = `node-${Date.now()}`;
    const defaults: Record<string, Partial<CanvasNode>> = {
      text: { width: 200, height: 60, content: "New text block" },
      heading: { width: 300, height: 40, content: "Heading" },
      image: { width: 200, height: 150, content: "" },
      shape: { width: 100, height: 100, content: "", shapeType: "rectangle", color: "#64748b" },
    };
    const d = defaults[type] || defaults.text;
    syncNodes([...nodes, { id, type, x: 50 + Math.random() * 100, y: 50 + Math.random() * 100, ...d } as CanvasNode]);
    setSelectedId(id);
  };

  const updateNode = (id: string, updates: Partial<CanvasNode>) => {
    syncNodes(nodes.map(n => n.id === id ? { ...n, ...updates } : n));
  };

  const deleteNode = (id: string) => {
    syncNodes(nodes.filter(n => n.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    if (!isEditing) return;
    e.stopPropagation();
    setSelectedId(id);
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    setDragging({ id, startX: e.clientX, startY: e.clientY, nodeX: node.x, nodeY: node.y });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragging.startX;
    const dy = e.clientY - dragging.startY;
    updateNode(dragging.id, { x: dragging.nodeX + dx, y: dragging.nodeY + dy });
  }, [dragging]);

  const handleMouseUp = useCallback(() => { setDragging(null); }, []);

  useEffect(() => {
    if (dragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => { window.removeEventListener("mousemove", handleMouseMove); window.removeEventListener("mouseup", handleMouseUp); };
    }
  }, [dragging, handleMouseMove, handleMouseUp]);

  const selectedNode = nodes.find(n => n.id === selectedId);

  return (
    <div className="flex flex-col h-full" data-testid="canvas-article-editor">
      {isEditing && (
        <div className="flex items-center gap-1 p-2 border-b border-stone-800 bg-stone-900/80">
          <Button variant="ghost" size="sm" className="h-7 text-xs text-stone-400 hover:text-stone-200" onClick={() => addNode("text")} data-testid="canvas-add-text"><Type className="h-3.5 w-3.5 mr-1" /> Text</Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-stone-400 hover:text-stone-200" onClick={() => addNode("heading")} data-testid="canvas-add-heading"><Heading1 className="h-3.5 w-3.5 mr-1" /> Heading</Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-stone-400 hover:text-stone-200" onClick={() => addNode("image")} data-testid="canvas-add-image"><Image className="h-3.5 w-3.5 mr-1" /> Image</Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-stone-400 hover:text-stone-200" onClick={() => addNode("shape")} data-testid="canvas-add-shape"><Square className="h-3.5 w-3.5 mr-1" /> Shape</Button>
          {selectedNode && (
            <>
              <div className="w-px h-4 bg-stone-700 mx-1" />
              <Button variant="ghost" size="sm" className="h-7 text-xs text-red-400 hover:text-red-300" onClick={() => deleteNode(selectedNode.id)} data-testid="canvas-delete-node"><X className="h-3.5 w-3.5 mr-1" /> Delete</Button>
            </>
          )}
        </div>
      )}
      <div
        ref={canvasRef}
        className="relative flex-1 bg-stone-950 overflow-auto min-h-[400px]"
        style={{ backgroundImage: "radial-gradient(circle, #374151 1px, transparent 1px)", backgroundSize: "20px 20px" }}
        onClick={() => setSelectedId(null)}
        data-testid="canvas-surface"
      >
        {nodes.map(node => (
          <div
            key={node.id}
            className={`absolute cursor-${isEditing ? "move" : "default"} ${selectedId === node.id && isEditing ? "ring-2 ring-amber-400" : ""}`}
            style={{ left: node.x, top: node.y, width: node.width, height: node.type === "text" || node.type === "heading" ? "auto" : node.height, minHeight: node.height }}
            onMouseDown={(e) => handleMouseDown(e, node.id)}
            data-testid={`canvas-node-${node.id}`}
          >
            {node.type === "text" && (
              isEditing && selectedId === node.id ? (
                <textarea
                  value={node.content}
                  onChange={(e) => updateNode(node.id, { content: e.target.value })}
                  className="w-full bg-stone-900/80 border border-stone-700 rounded p-2 text-sm text-stone-300 resize-none"
                  style={{ minHeight: node.height }}
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`canvas-text-input-${node.id}`}
                />
              ) : (
                <div className="p-2 text-sm text-stone-300 whitespace-pre-wrap">{node.content || "Empty text"}</div>
              )
            )}
            {node.type === "heading" && (
              isEditing && selectedId === node.id ? (
                <input
                  value={node.content}
                  onChange={(e) => updateNode(node.id, { content: e.target.value })}
                  className="w-full bg-transparent border-b-2 border-amber-500/50 text-lg font-bold text-stone-100 p-1"
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`canvas-heading-input-${node.id}`}
                />
              ) : (
                <h2 className="text-lg font-bold text-stone-100 p-1">{node.content || "Untitled"}</h2>
              )
            )}
            {node.type === "image" && (
              isEditing && selectedId === node.id && !node.content ? (
                <div className="w-full h-full bg-stone-900/80 border border-dashed border-stone-700 rounded flex flex-col items-center justify-center p-2">
                  <Image className="h-6 w-6 text-stone-600 mb-1" />
                  <input
                    placeholder="Paste image URL..."
                    className="w-full bg-stone-800 border border-stone-700 rounded text-xs text-stone-300 p-1 mt-1"
                    onBlur={(e) => { if (e.target.value) updateNode(node.id, { content: e.target.value }); }}
                    onClick={(e) => e.stopPropagation()}
                    data-testid={`canvas-image-input-${node.id}`}
                  />
                </div>
              ) : (
                node.content ? <img src={node.content} alt="" className="w-full h-full object-cover rounded" /> : <div className="w-full h-full bg-stone-900/50 border border-stone-800 rounded flex items-center justify-center"><Image className="h-8 w-8 text-stone-700" /></div>
              )
            )}
            {node.type === "shape" && (
              <div
                className={`w-full h-full ${node.shapeType === "ellipse" ? "rounded-full" : "rounded"}`}
                style={{ backgroundColor: (node.color || "#64748b") + "30", border: `2px solid ${node.color || "#64748b"}` }}
              />
            )}
          </div>
        ))}
      </div>
      {isEditing && selectedNode && (
        <div className="p-2 border-t border-stone-800 bg-stone-900/80 flex items-center gap-2 text-xs">
          <span className="text-stone-500">Selected: {selectedNode.type}</span>
          <span className="text-stone-600">|</span>
          <label className="text-stone-500">W:</label>
          <input type="number" value={selectedNode.width} onChange={(e) => updateNode(selectedNode.id, { width: parseInt(e.target.value) || 100 })} className="w-14 bg-stone-800 border border-stone-700 rounded text-stone-300 px-1 text-xs" data-testid="canvas-node-width" />
          <label className="text-stone-500">H:</label>
          <input type="number" value={selectedNode.height} onChange={(e) => updateNode(selectedNode.id, { height: parseInt(e.target.value) || 60 })} className="w-14 bg-stone-800 border border-stone-700 rounded text-stone-300 px-1 text-xs" data-testid="canvas-node-height" />
          {selectedNode.type === "shape" && (
            <>
              <label className="text-stone-500">Color:</label>
              <input type="color" value={selectedNode.color || "#64748b"} onChange={(e) => updateNode(selectedNode.id, { color: e.target.value })} className="w-6 h-5 bg-transparent border-0 cursor-pointer" data-testid="canvas-node-color" />
              <select value={selectedNode.shapeType || "rectangle"} onChange={(e) => updateNode(selectedNode.id, { shapeType: e.target.value as CanvasNode["shapeType"] })} className="bg-stone-800 border border-stone-700 rounded text-stone-300 text-xs px-1" data-testid="canvas-shape-type">
                <option value="rectangle">Rectangle</option>
                <option value="ellipse">Ellipse</option>
              </select>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function WikiArticlePreview({ content, onEntityClick }: { content: string; onEntityClick?: (type: string, id: string) => void }) {
  if (!content) return <p className="text-stone-500 italic" data-testid="article-preview">No content yet. Click Edit to start writing.</p>;

  const wikiLinkRegex = /\[\[([^:\]]+):([^\|\]]+)\|([^\]]+)\]\]/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  while ((match = wikiLinkRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const plainSegment = content.slice(lastIndex, match.index);
      parts.push(
        <span key={`plain-${lastIndex}`} dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(plainSegment) }} />
      );
    }
    const [, refType, refId, refLabel] = match;
    const colorMap: Record<string, string> = {
      entity: "text-amber-400 hover:text-amber-300",
      map: "text-emerald-400 hover:text-emerald-300",
      character: "text-blue-400 hover:text-blue-300",
      item: "text-orange-400 hover:text-orange-300",
      spell: "text-purple-400 hover:text-purple-300",
    };
    parts.push(
      <span
        key={`ref-${match.index}`}
        className={`${colorMap[refType] || "text-amber-400 hover:text-amber-300"} cursor-pointer font-medium bg-stone-800/50 px-1 rounded hover:underline`}
        onClick={() => onEntityClick?.(refType, refId)}
        data-testid={`wiki-link-${refType}-${refId}`}
      >
        {refLabel}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push(
      <span key={`plain-end`} dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(content.slice(lastIndex)) }} />
    );
  }

  if (parts.length === 0) {
    return (
      <div
        className="prose prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(content) }}
        data-testid="article-preview"
      />
    );
  }

  return <div className="prose prose-invert max-w-none" data-testid="article-preview">{parts}</div>;
}

const WIKI_CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Encyclopedia: <BookOpen className="h-3.5 w-3.5 text-amber-400" />,
  Maps: <Map className="h-3.5 w-3.5 text-emerald-400" />,
  Characters: <User className="h-3.5 w-3.5 text-blue-400" />,
  Items: <Swords className="h-3.5 w-3.5 text-orange-400" />,
  Spells: <Sparkles className="h-3.5 w-3.5 text-purple-400" />,
};

function WikiReferencePicker({ worldId, onSelect, onClose, position }: {
  worldId: string;
  onSelect: (result: WikiSearchResult) => void;
  onClose: () => void;
  position: { top: number; left: number };
}) {
  const [search, setSearch] = useState("");
  const { data: results = [] } = useWikiSearch(worldId, search);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => { setSelectedIndex(0); }, [results]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, results.length - 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); return; }
    if (e.key === "Enter" && results[selectedIndex]) { e.preventDefault(); onSelect(results[selectedIndex]); return; }
  };

  const grouped = results.reduce<Record<string, WikiSearchResult[]>>((acc, r) => {
    (acc[r.category] = acc[r.category] || []).push(r);
    return acc;
  }, {});

  let flatIndex = 0;

  return (
    <div
      ref={containerRef}
      className="absolute z-50 w-72 bg-stone-900 border border-stone-700 rounded-lg shadow-xl overflow-hidden"
      style={{ top: position.top, left: position.left }}
      data-testid="wiki-reference-picker"
    >
      <div className="p-2 border-b border-stone-800">
        <div className="flex items-center gap-2 bg-stone-800 rounded px-2">
          <Search className="h-3.5 w-3.5 text-stone-500" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search articles, maps, items..."
            className="w-full bg-transparent text-sm text-stone-200 py-1.5 outline-none placeholder-stone-500"
            data-testid="wiki-search-input"
          />
        </div>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {results.length === 0 && search.length > 0 && (
          <div className="px-3 py-4 text-center text-xs text-stone-500">No results found</div>
        )}
        {results.length === 0 && search.length === 0 && (
          <div className="px-3 py-4 text-center text-xs text-stone-500">Type to search...</div>
        )}
        {Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            <div className="px-3 py-1 text-[10px] font-semibold text-stone-500 uppercase tracking-wider bg-stone-900/50 flex items-center gap-1.5">
              {WIKI_CATEGORY_ICONS[category] || <BookOpen className="h-3 w-3" />}
              {category}
            </div>
            {items.map((item) => {
              const thisIndex = flatIndex++;
              return (
                <button
                  key={`${item.type}-${item.id}`}
                  className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors ${
                    thisIndex === selectedIndex ? "bg-amber-600/20 text-amber-300" : "text-stone-300 hover:bg-stone-800"
                  }`}
                  onClick={() => onSelect(item)}
                  data-testid={`wiki-result-${item.type}-${item.id}`}
                >
                  {item.name}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function WikiArticleEditor({ entity, campaignId, worldId, isGM, onEntityUpdated, shareToken, customTags = [] }: WikiArticleEditorProps) {
  const resolvedId = worldId || campaignId;
  const scope = worldId ? "worlds" as const : "campaigns" as const;
  const updateEntity = useUpdateEntity(resolvedId, scope);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [articleContent, setArticleContent] = useState(entity.articleContent || "");
  const [description, setDescription] = useState(entity.description || "");
  const [displayName, setDisplayName] = useState(entity.displayName || "");
  const [image, setImage] = useState(entity.image || "");
  const [visibility, setVisibility] = useState(entity.visibility || "gm_only");
  const [entityType, setEntityType] = useState(entity.entityType || "article");
  const [tags, setTags] = useState<string[]>((entity.tags as string[]) || []);
  const [isSaving, setIsSaving] = useState(false);
  const [tagSearchQuery, setTagSearchQuery] = useState("");
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [wikiPickerOpen, setWikiPickerOpen] = useState(false);
  const [wikiPickerPos, setWikiPickerPos] = useState({ top: 0, left: 0 });
  const [wikiPickerTriggeredByTyping, setWikiPickerTriggeredByTyping] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setArticleContent(entity.articleContent || "");
    setDescription(entity.description || "");
    setDisplayName(entity.displayName || "");
    setImage(entity.image || "");
    setVisibility(entity.visibility || "gm_only");
    setEntityType(entity.entityType || "article");
    setTags((entity.tags as string[]) || []);
  }, [entity.id]);

  const saveChanges = useCallback(async () => {
    setIsSaving(true);
    const updateData: Partial<Entity> & { id: string } = {
      id: entity.id,
      articleContent,
      description,
      displayName,
      image: image || undefined,
      visibility,
      entityType,
      tags,
    };
    try {
      await updateEntity.mutateAsync(updateData);
      onEntityUpdated?.();
    } finally {
      setIsSaving(false);
    }
  }, [entity.id, articleContent, description, displayName, image, visibility, entityType, tags, updateEntity, onEntityUpdated]);

  const autoSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveChanges(), 2000);
  }, [saveChanges]);

  const insertMarkdown = (prefix: string, suffix: string = "") => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = articleContent.substring(start, end);
    const newContent = articleContent.substring(0, start) + prefix + selected + suffix + articleContent.substring(end);
    setArticleContent(newContent);
    autoSave();
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    }, 0);
  };

  const handleArticleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    const pos = e.target.selectionStart;
    setArticleContent(newContent);
    setCursorPosition(pos);
    autoSave();

    if (pos >= 2 && newContent.slice(pos - 2, pos) === "[[") {
      const ta = textareaRef.current;
      if (ta && editorContainerRef.current) {
        const containerRect = editorContainerRef.current.getBoundingClientRect();
        const taRect = ta.getBoundingClientRect();
        const lineHeight = parseInt(getComputedStyle(ta).lineHeight) || 20;
        const lines = newContent.substring(0, pos).split("\n");
        const currentLineIndex = lines.length - 1;
        const topOffset = taRect.top - containerRect.top + (currentLineIndex * lineHeight) + lineHeight + ta.scrollTop * -1;
        setWikiPickerPos({ top: Math.min(topOffset, taRect.height - 50), left: 20 });
      } else {
        setWikiPickerPos({ top: 80, left: 20 });
      }
      setWikiPickerTriggeredByTyping(true);
      setWikiPickerOpen(true);
    }
  };

  const handleWikiSelect = (result: WikiSearchResult) => {
    const referenceText = `[[${result.type}:${result.id}|${result.name}]]`;
    const charsToRemove = wikiPickerTriggeredByTyping ? 2 : 0;
    const beforeCursor = articleContent.slice(0, cursorPosition - charsToRemove);
    const afterCursor = articleContent.slice(cursorPosition);
    const newContent = beforeCursor + referenceText + afterCursor;
    setArticleContent(newContent);
    setWikiPickerOpen(false);
    setWikiPickerTriggeredByTyping(false);
    autoSave();
    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = beforeCursor.length + referenceText.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  const toggleTag = (tag: string) => {
    setTags(prev => {
      const next = prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag];
      return next;
    });
    autoSave();
  };

  const predefinedSet = new Set<string>(PREDEFINED_TAGS);
  const allAvailableTags: string[] = [...PREDEFINED_TAGS, ...customTags.filter(t => !predefinedSet.has(t))];
  const filteredAvailableTags = tagSearchQuery
    ? allAvailableTags.filter(t => t.toLowerCase().includes(tagSearchQuery.toLowerCase()))
    : allAvailableTags;

  return (
    <div className="flex flex-col h-full" data-testid="wiki-article-editor">
      <div className="border-b border-stone-700 bg-stone-900/50 p-3 md:p-4">
        <div className="flex items-center justify-between mb-3">
          {mode === "edit" ? (
            <Input
              value={displayName}
              onChange={(e) => { setDisplayName(e.target.value); autoSave(); }}
              className="text-xl font-bold bg-transparent border-stone-700 text-stone-100 p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0 border-0 border-b"
              data-testid="input-entity-title"
            />
          ) : (
            <h1 className="text-xl font-bold text-stone-100">{displayName}</h1>
          )}
          <div className="flex items-center gap-2">
            {isSaving && <span className="text-xs text-stone-500">Saving...</span>}
            {isGM && (
              <>
                {mode === "edit" && (
                  <div className="flex items-center bg-stone-800/50 border border-stone-700 rounded-md h-7 overflow-hidden" data-testid="toggle-entity-type">
                    <button
                      className={`px-2 h-full text-[10px] flex items-center gap-1 transition-colors ${entityType === "article" ? "bg-amber-600/30 text-amber-400" : "text-stone-500 hover:text-stone-300"}`}
                      onClick={() => { setEntityType("article"); autoSave(); }}
                      data-testid="toggle-type-article"
                    >
                      <FileText className="h-3 w-3" /> Article
                    </button>
                    <button
                      className={`px-2 h-full text-[10px] flex items-center gap-1 transition-colors ${entityType === "canvas" ? "bg-blue-600/30 text-blue-400" : "text-stone-500 hover:text-stone-300"}`}
                      onClick={() => { setEntityType("canvas"); autoSave(); }}
                      data-testid="toggle-type-canvas"
                    >
                      <Layout className="h-3 w-3" /> Canvas
                    </button>
                  </div>
                )}
                <Select value={visibility} onValueChange={(val) => { setVisibility(val); autoSave(); }}>
                  <SelectTrigger className="h-7 w-auto min-w-[100px] text-xs bg-stone-800/50 border-stone-700 text-stone-300 gap-1" data-testid="select-visibility">
                    <div className="flex items-center gap-1.5">
                      {visibility === "gm_only" ? <EyeOff className="h-3 w-3 text-stone-500" /> : <Eye className="h-3 w-3 text-amber-400" />}
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="bg-stone-800 border-stone-700">
                    <SelectItem value="gm_only" className="text-xs text-stone-300">GM Only</SelectItem>
                    <SelectItem value="player_visible" className="text-xs text-stone-300">Players</SelectItem>
                    <SelectItem value="shared" className="text-xs text-stone-300">Shared</SelectItem>
                  </SelectContent>
                </Select>
                {shareToken && visibility !== "gm_only" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-stone-400 hover:text-amber-400 h-7 text-xs"
                    onClick={() => window.open(`${window.location.origin}/world/${shareToken}#entity=${entity.id}`, '_blank')}
                    title="Preview article in shared view"
                    data-testid="button-preview-article"
                  >
                    <ExternalLink className="h-3 w-3 mr-1" /> Preview
                  </Button>
                )}
                {mode === "edit" ? (
                  <Button size="sm" onClick={() => { saveChanges(); setMode("view"); }} className="bg-amber-600 hover:bg-amber-500 text-white h-7 text-xs" data-testid="button-save-article">
                    <Save className="h-3 w-3 mr-1" /> Save
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setMode("edit")} className="text-stone-400 hover:text-amber-400 h-7 text-xs" data-testid="button-edit-article">
                    <Edit3 className="h-3 w-3 mr-1" /> Edit
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {mode === "edit" ? (
          <Textarea
            value={description}
            onChange={(e) => { setDescription(e.target.value); autoSave(); }}
            placeholder="Short description / subtitle..."
            className="bg-stone-800/50 border-stone-700 text-stone-300 text-sm min-h-[40px] resize-none"
            rows={2}
            data-testid="input-entity-subtitle"
          />
        ) : description ? (
          <p className="text-sm text-stone-400 italic">{description}</p>
        ) : null}

        {mode === "edit" && (
          <div className="mt-2">
            <Input
              value={image}
              onChange={(e) => { setImage(e.target.value); autoSave(); }}
              placeholder="Image URL..."
              className="bg-stone-800/50 border-stone-700 text-stone-300 text-xs h-7"
              data-testid="input-entity-image"
            />
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-1">
          {tags.map(tag => (
            <Badge
              key={tag}
              variant="outline"
              className="text-[10px] px-1.5 py-0 cursor-pointer hover:opacity-80"
              style={{ borderColor: (TAG_COLORS[tag] || "#78909c") + "55", color: TAG_COLORS[tag] || "#78909c", backgroundColor: (TAG_COLORS[tag] || "#78909c") + "15" }}
              onClick={() => mode === "edit" && toggleTag(tag)}
              data-testid={`tag-badge-${tag}`}
            >
              {tag}
              {mode === "edit" && <X className="h-2.5 w-2.5 ml-1" />}
            </Badge>
          ))}
          {mode === "edit" && (
            <Popover open={showTagPicker} onOpenChange={setShowTagPicker}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-5 text-[10px] text-stone-500 hover:text-amber-400 px-1.5" data-testid="button-add-tag">
                  <Tag className="h-3 w-3 mr-1" /> Add Tag
                </Button>
              </PopoverTrigger>
              <PopoverContent className="bg-stone-800 border-stone-700 p-2 w-56" align="start">
                <Input
                  value={tagSearchQuery}
                  onChange={(e) => setTagSearchQuery(e.target.value)}
                  placeholder="Search tags..."
                  className="bg-stone-900 border-stone-700 text-stone-200 text-xs h-7 mb-2"
                  data-testid="input-tag-search"
                />
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {filteredAvailableTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => { toggleTag(tag); setTagSearchQuery(""); }}
                      className={`w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center justify-between ${
                        tags.includes(tag) ? 'bg-stone-700 text-amber-400' : 'text-stone-300 hover:bg-stone-700/50'
                      }`}
                      data-testid={`tag-option-${tag}`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TAG_COLORS[tag] || "#78909c" }} />
                        {tag}
                      </span>
                      {tags.includes(tag) && <span className="text-[10px] text-amber-400">&#10003;</span>}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {image && (
          <div className="relative h-48 overflow-hidden">
            <img src={image} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-stone-950 to-transparent" />
          </div>
        )}

        {entityType === "canvas" ? (
          <CanvasArticleEditor
            content={articleContent}
            onChange={(c) => { setArticleContent(c); autoSave(); }}
            isEditing={mode === "edit"}
          />
        ) : (
          <div className="p-3 md:p-4 relative" ref={editorContainerRef}>
            {mode === "edit" ? (
              <>
                <div className="flex items-center gap-1 mb-2 border-b border-stone-800 pb-2 flex-wrap">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-stone-500 hover:text-stone-200" onClick={() => insertMarkdown("**", "**")} data-testid="button-md-bold"><Bold className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-stone-500 hover:text-stone-200" onClick={() => insertMarkdown("*", "*")} data-testid="button-md-italic"><Italic className="h-3.5 w-3.5" /></Button>
                  <div className="w-px h-4 bg-stone-700 mx-1" />
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-stone-500 hover:text-stone-200" onClick={() => insertMarkdown("# ")} data-testid="button-md-h1"><Heading1 className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-stone-500 hover:text-stone-200" onClick={() => insertMarkdown("## ")} data-testid="button-md-h2"><Heading2 className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-stone-500 hover:text-stone-200" onClick={() => insertMarkdown("### ")} data-testid="button-md-h3"><Heading3 className="h-3.5 w-3.5" /></Button>
                  <div className="w-px h-4 bg-stone-700 mx-1" />
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-stone-500 hover:text-stone-200" onClick={() => insertMarkdown("- ")} data-testid="button-md-ul"><List className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-stone-500 hover:text-stone-200" onClick={() => insertMarkdown("1. ")} data-testid="button-md-ol"><ListOrdered className="h-3.5 w-3.5" /></Button>
                  <div className="w-px h-4 bg-stone-700 mx-1" />
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-stone-500 hover:text-stone-200" onClick={() => insertMarkdown("[", "](url)")} data-testid="button-md-link"><Link2 className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-stone-500 hover:text-stone-200" onClick={() => insertMarkdown("![alt](", ")")} data-testid="button-md-image"><Image className="h-3.5 w-3.5" /></Button>
                  <div className="w-px h-4 bg-stone-700 mx-1" />
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-500/50 hover:text-amber-400" onClick={() => { if (textareaRef.current) setCursorPosition(textareaRef.current.selectionStart); setWikiPickerTriggeredByTyping(false); setWikiPickerPos({ top: 80, left: 20 }); setWikiPickerOpen(true); }} title="Wiki Link [[" data-testid="button-md-wikilink"><Hash className="h-3.5 w-3.5" /></Button>
                </div>
                <Textarea
                  ref={textareaRef}
                  value={articleContent}
                  onChange={handleArticleContentChange}
                  placeholder="Write your article here... Type [[ to insert a wiki link."
                  className="bg-stone-950 border-stone-800 text-stone-300 min-h-[250px] md:min-h-[400px] font-mono text-sm resize-none leading-relaxed"
                  data-testid="textarea-article-content"
                />
                {wikiPickerOpen && worldId && (
                  <WikiReferencePicker
                    worldId={worldId}
                    onSelect={handleWikiSelect}
                    onClose={() => setWikiPickerOpen(false)}
                    position={wikiPickerPos}
                  />
                )}
              </>
            ) : (
              <WikiArticlePreview content={articleContent} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
