import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useUpdateEntity, useEntities, useWikiSearch, useEntityAccessList, ENTITY_TYPE_CONFIG, TAG_COLORS, type Entity, type WikiSearchResult } from "@/lib/worldbuilding-api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PREDEFINED_TAGS } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Bold, Italic, Heading1, Heading2, Heading3, List, ListOrdered, Link2, Image, Eye, EyeOff, Edit3, Save, Hash, Share2, ExternalLink, X, Tag, ChevronDown, Layout, Search, BookOpen, Map, Swords, Sparkles, User, Users, UserPlus, FileText } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CanvasEditor, type CanvasData } from "@/components/notes/CanvasEditor";

interface WikiArticleEditorProps {
  entity: Entity;
  campaignId?: string;
  worldId?: string;
  isGM: boolean;
  canEdit?: boolean;
  onEntityUpdated?: () => void;
  onWikiLinkClick?: (type: string, id: string) => void;
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

function migrateLegacyNode(n: any): any {
  const node = { ...n };
  if (node.type === "heading") {
    node.type = "text";
    node.content = node.content || "";
  } else if (node.type === "shape") {
    node.type = "text";
    node.content = node.content || "";
  } else if (node.type === "image" && node.content && !node.mediaUrl) {
    node.mediaUrl = node.content;
    delete node.content;
  }
  return node;
}

function parseCanvasData(content: string): CanvasData {
  if (!content) return { nodes: [], connections: [] };
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return { nodes: parsed.map(migrateLegacyNode), connections: [] };
    }
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.nodes)) {
      return { nodes: parsed.nodes, connections: parsed.connections || [] };
    }
    return { nodes: [], connections: [] };
  } catch {
    return { nodes: [], connections: [] };
  }
}

function WbEntityPicker({ worldId, open, onOpenChange, onSelect, triggerElement }: {
  worldId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (entity: any) => void;
  triggerElement?: React.ReactNode;
}) {
  const [search, setSearch] = useState("");
  const { data: entities = [] } = useEntities(worldId);
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return entities
      .filter((e: Entity) => !q || e.displayName.toLowerCase().includes(q))
      .slice(0, 30);
  }, [entities, search]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{triggerElement}</PopoverTrigger>
      <PopoverContent className="w-72 p-0 bg-stone-950 border-stone-700" align="start" side="right">
        <div className="p-2 border-b border-stone-800">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search entities..."
              className="pl-7 h-8 text-xs bg-stone-900 border-stone-700"
              data-testid="wb-entity-picker-search"
            />
          </div>
        </div>
        <ScrollArea className="h-60">
          <div className="p-1 space-y-0.5">
            {filtered.length === 0 ? (
              <div className="text-center py-6 text-stone-500 text-xs">No entities found</div>
            ) : (
              filtered.map((entity: Entity) => {
                const cfg = ENTITY_TYPE_CONFIG[entity.entityType];
                return (
                  <button
                    key={entity.id}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-stone-800/50 text-left"
                    onClick={() => {
                      onSelect({
                        id: entity.id,
                        name: entity.displayName,
                        type: entity.entityType || "article",
                      });
                      onOpenChange(false);
                      setSearch("");
                    }}
                    data-testid={`wb-entity-result-${entity.id}`}
                  >
                    <Badge variant="outline" className="text-[9px]" style={{ color: cfg?.color || "#78909c", borderColor: (cfg?.color || "#78909c") + "40" }}>
                      {entity.entityType || "article"}
                    </Badge>
                    <span className="text-xs text-stone-200 truncate">{entity.displayName}</span>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function WbCanvasWrapper({ content, onChange, isEditing, worldId }: {
  content: string;
  onChange: (c: string) => void;
  isEditing: boolean;
  worldId: string;
}) {
  const canvasData = useMemo(() => parseCanvasData(content), [content]);
  const handleChange = useCallback((data: CanvasData) => {
    onChange(JSON.stringify(data));
  }, [onChange]);

  const entitySearchProvider = useMemo(() => ({
    component: (props: any) => <WbEntityPicker worldId={worldId} {...props} />,
  }), [worldId]);

  return (
    <div className="flex-1 h-full min-h-[400px]" data-testid="canvas-article-editor">
      <CanvasEditor
        canvasData={canvasData}
        onChange={handleChange}
        readOnly={!isEditing}
        hideNoteNodes
        entitySearchProvider={entitySearchProvider}
      />
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

  const grouped = results.reduce<Record<string, WikiSearchResult[]>>((acc, r) => {
    (acc[r.category] = acc[r.category] || []).push(r);
    return acc;
  }, {});

  const flatList = Object.values(grouped).flat();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, flatList.length - 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); return; }
    if (e.key === "Enter" && flatList[selectedIndex]) { e.preventDefault(); onSelect(flatList[selectedIndex]); return; }
  };

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

function ArticleAccessControl({ worldId, entityId, campaignId }: { worldId: string; entityId: string; campaignId?: string }) {
  const queryClient = useQueryClient();
  const { data: accessList = [] } = useEntityAccessList(worldId, entityId);
  const { data: campaignMembers = [] } = useQuery<any[]>({
    queryKey: ['/api/campaigns', campaignId, 'members-for-access'],
    queryFn: async () => {
      if (!campaignId) return [];
      const res = await fetch(`/api/campaigns/${campaignId}/members`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!campaignId,
  });
  const [showPicker, setShowPicker] = useState(false);

  const grantMutation = useMutation({
    mutationFn: async ({ userId, accessLevel }: { userId: string; accessLevel: string }) => {
      const res = await fetch(`/api/worlds/${worldId}/entities/${entityId}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId, accessLevel }),
      });
      if (!res.ok) throw new Error('Failed to set access');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/worlds', worldId, 'entities', entityId, 'access'] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/worlds/${worldId}/entities/${entityId}/access/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to revoke access');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/worlds', worldId, 'entities', entityId, 'access'] });
    },
  });

  const accessUserIds = new Set(accessList.map((a: any) => a.userId));
  const players = campaignMembers.filter((m: any) => m.role === 'player' || m.role === 'assistant_gm');
  const availablePlayers = players.filter((p: any) => !accessUserIds.has(p.userId));

  return (
    <Popover open={showPicker} onOpenChange={setShowPicker}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="text-stone-400 hover:text-blue-400 h-7 text-xs gap-1"
          data-testid="button-article-access"
        >
          <Users className="h-3 w-3" />
          {accessList.length > 0 ? `${accessList.length} player${accessList.length !== 1 ? 's' : ''}` : 'Access'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="bg-stone-900 border-stone-700 w-64 p-3" align="start">
        <h4 className="text-xs font-semibold text-stone-300 mb-2 flex items-center gap-1.5">
          <Users className="h-3 w-3 text-blue-400" /> Player Access
        </h4>
        {accessList.length > 0 && (
          <div className="space-y-1 mb-2">
            {accessList.map((a: any) => (
              <div key={a.userId} className="flex items-center justify-between px-2 py-1 bg-stone-800/50 rounded text-xs">
                <div className="flex items-center gap-1.5">
                  <User className="h-3 w-3 text-stone-500" />
                  <span className="text-stone-300">{a.displayName || a.username || 'User'}</span>
                  <button
                    onClick={() => grantMutation.mutate({ userId: a.userId, accessLevel: a.accessLevel === 'view' ? 'edit' : 'view' })}
                    className="cursor-pointer"
                    data-testid={`button-toggle-access-${a.userId}`}
                    title={`Click to switch to ${a.accessLevel === 'view' ? 'edit' : 'view'}`}
                  >
                    <Badge variant="outline" className={`text-[9px] px-1 py-0 border-stone-600 hover:border-amber-500/50 ${a.accessLevel === 'edit' ? 'text-amber-400' : 'text-stone-500'}`}>{a.accessLevel}</Badge>
                  </button>
                </div>
                <button
                  onClick={() => revokeMutation.mutate(a.userId)}
                  className="text-stone-500 hover:text-red-400 p-0.5"
                  data-testid={`button-revoke-access-${a.userId}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {!campaignId ? (
          <p className="text-[10px] text-stone-500 text-center py-1">Link this world to a campaign to manage player access</p>
        ) : availablePlayers.length === 0 && accessList.length === 0 ? (
          <p className="text-[10px] text-stone-500 text-center py-1">No players in this campaign</p>
        ) : availablePlayers.length > 0 ? (
          <div className="space-y-1 border-t border-stone-800 pt-2 mt-1">
            <p className="text-[10px] text-stone-500 mb-1">Grant access:</p>
            {availablePlayers.map((p: any) => (
              <button
                key={p.userId}
                onClick={() => grantMutation.mutate({ userId: p.userId, accessLevel: 'view' })}
                className="w-full flex items-center gap-2 px-2 py-1 bg-stone-800/30 hover:bg-stone-800/60 rounded text-left text-xs transition-colors"
                disabled={grantMutation.isPending}
                data-testid={`button-grant-access-${p.userId}`}
              >
                <UserPlus className="h-3 w-3 text-stone-500" />
                <span className="text-stone-300">{p.displayName || p.username}</span>
              </button>
            ))}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export function WikiArticleEditor({ entity, campaignId, worldId, isGM, canEdit: canEditProp, onEntityUpdated, onWikiLinkClick, shareToken, customTags = [] }: WikiArticleEditorProps) {
  const canEdit = isGM || canEditProp;
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
  const latestStateRef = useRef({ articleContent, description, displayName, image, visibility, entityType, tags, entityId: entity.id });
  latestStateRef.current = { articleContent, description, displayName, image, visibility, entityType, tags, entityId: entity.id };

  useEffect(() => {
    setArticleContent(entity.articleContent || "");
    setDescription(entity.description || "");
    setDisplayName(entity.displayName || "");
    setImage(entity.image || "");
    setVisibility(entity.visibility || "gm_only");
    setEntityType(entity.entityType || "article");
    setTags((entity.tags as string[]) || []);
    setMode("view");
  }, [entity.id]);

  const doSave = useCallback(async () => {
    const s = latestStateRef.current;
    setIsSaving(true);
    try {
      await updateEntity.mutateAsync({
        id: s.entityId,
        articleContent: s.articleContent,
        description: s.description,
        displayName: s.displayName,
        image: s.image || undefined,
        visibility: s.visibility,
        entityType: s.entityType,
        tags: s.tags,
      });
      onEntityUpdated?.();
    } finally {
      setIsSaving(false);
    }
  }, [updateEntity, onEntityUpdated]);

  const saveChanges = useCallback(async () => {
    if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); saveTimeoutRef.current = null; }
    await doSave();
  }, [doSave]);

  const debouncedSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => { saveTimeoutRef.current = null; doSave(); }, 800);
  }, [doSave]);

  const saveImmediately = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = null;
    doSave();
  }, [doSave]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        const s = latestStateRef.current;
        const sid = resolvedId;
        const sc = scope;
        fetch(`/api/${sc}/${sid}/entities/${s.entityId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            articleContent: s.articleContent,
            description: s.description,
            displayName: s.displayName,
            image: s.image || undefined,
            visibility: s.visibility,
            entityType: s.entityType,
            tags: s.tags,
          }),
          keepalive: true,
        });
      }
    };
  }, [resolvedId, scope]);

  const autoSave = debouncedSave;

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
    setTimeout(() => saveImmediately(), 0);
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
            {isGM && mode === "edit" && (
              <div className="flex items-center bg-stone-800/50 border border-stone-700 rounded-md h-7 overflow-hidden" data-testid="toggle-entity-type">
                <button
                  className={`px-2 h-full text-[10px] flex items-center gap-1 transition-colors ${entityType === "article" ? "bg-amber-600/30 text-amber-400" : "text-stone-500 hover:text-stone-300"}`}
                  onClick={() => { setEntityType("article"); setTimeout(() => saveImmediately(), 0); }}
                  data-testid="toggle-type-article"
                >
                  <FileText className="h-3 w-3" /> Article
                </button>
                <button
                  className={`px-2 h-full text-[10px] flex items-center gap-1 transition-colors ${entityType === "canvas" ? "bg-blue-600/30 text-blue-400" : "text-stone-500 hover:text-stone-300"}`}
                  onClick={() => { setEntityType("canvas"); setTimeout(() => saveImmediately(), 0); }}
                  data-testid="toggle-type-canvas"
                >
                  <Layout className="h-3 w-3" /> Canvas
                </button>
              </div>
            )}
            {isGM && (
              <>
                <Select value={visibility} onValueChange={(val) => { setVisibility(val); setTimeout(() => saveImmediately(), 0); }}>
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
                {(visibility === "player_visible" || visibility === "shared") && worldId && (
                  <ArticleAccessControl worldId={worldId} entityId={entity.id} campaignId={campaignId} />
                )}
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
              </>
            )}
            {canEdit && (
              mode === "edit" ? (
                <Button size="sm" onClick={() => { saveChanges(); setMode("view"); }} className="bg-amber-600 hover:bg-amber-500 text-white h-7 text-xs" data-testid="button-save-article">
                  <Save className="h-3 w-3 mr-1" /> Save
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setMode("edit")} className="text-stone-400 hover:text-amber-400 h-7 text-xs" data-testid="button-edit-article">
                  <Edit3 className="h-3 w-3 mr-1" /> Edit
                </Button>
              )
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

      <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
        {image && (
          <div className="relative h-48 overflow-hidden flex-shrink-0">
            <img src={image} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-stone-950 to-transparent" />
          </div>
        )}

        {entityType === "canvas" ? (
          <WbCanvasWrapper
            content={articleContent}
            onChange={(c) => { setArticleContent(c); autoSave(); }}
            isEditing={mode === "edit"}
            worldId={worldId || ""}
          />
        ) : (
          <div className="p-3 md:p-4 relative flex-1 flex flex-col min-h-0" ref={editorContainerRef}>
            {mode === "edit" ? (
              <>
                <div className="flex items-center gap-1 mb-2 border-b border-stone-800 pb-2 flex-wrap flex-shrink-0">
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
                  className="bg-stone-950 border-stone-800 text-stone-300 flex-1 min-h-[200px] font-mono text-sm resize-none leading-relaxed"
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
              <WikiArticlePreview content={articleContent} onEntityClick={onWikiLinkClick} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
