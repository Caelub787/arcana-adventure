import React, { useState, useCallback, useEffect, useRef } from "react";
import { useUpdateEntity, ENTITY_TYPE_CONFIG, TAG_COLORS, type Entity } from "@/lib/worldbuilding-api";
import { PREDEFINED_TAGS } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Bold, Italic, Heading1, Heading2, Heading3, List, ListOrdered, Link2, Image, Eye, EyeOff, Edit3, Save, Hash, Share2, ExternalLink, X, Tag, ChevronDown } from "lucide-react";
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
    .replace(/\[\[(.+?)\]\]/g, '<span class="text-amber-400 bg-amber-900/20 px-1 rounded cursor-pointer hover:underline">$1</span>')
    .replace(/^- (.+)$/gm, '<li class="text-stone-300 ml-4 list-disc">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="text-stone-300 ml-4 list-decimal">$1</li>')
    .replace(/^---$/gm, '<hr class="border-stone-700 my-4" />')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-amber-400 hover:underline">$1</a>')
    .replace(/^(?!<[hlu]|<li|<hr|<p)(.+)$/gm, '<p class="text-stone-300 mb-2 leading-relaxed">$1</p>');
  return html;
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
  const [tags, setTags] = useState<string[]>((entity.tags as string[]) || []);
  const [isSaving, setIsSaving] = useState(false);
  const [tagSearchQuery, setTagSearchQuery] = useState("");
  const [showTagPicker, setShowTagPicker] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setArticleContent(entity.articleContent || "");
    setDescription(entity.description || "");
    setDisplayName(entity.displayName || "");
    setImage(entity.image || "");
    setVisibility(entity.visibility || "gm_only");
    setTags((entity.tags as string[]) || []);
  }, [entity.id]);

  const saveChanges = useCallback(async () => {
    setIsSaving(true);
    const updateData: any = {
      id: entity.id,
      articleContent,
      description,
      displayName,
      image: image || undefined,
      visibility,
      tags,
    };
    try {
      await updateEntity.mutateAsync(updateData);
      onEntityUpdated?.();
    } finally {
      setIsSaving(false);
    }
  }, [entity.id, articleContent, description, displayName, image, visibility, tags, updateEntity, onEntityUpdated]);

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

  const toggleTag = (tag: string) => {
    setTags(prev => {
      const next = prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag];
      return next;
    });
    autoSave();
  };

  const allAvailableTags = [...PREDEFINED_TAGS, ...customTags.filter(t => !PREDEFINED_TAGS.includes(t as any))];
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

        <div className="p-3 md:p-4">
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
                <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-500/50 hover:text-amber-400" onClick={() => insertMarkdown("[[", "]]")} title="Wiki Link" data-testid="button-md-wikilink"><Hash className="h-3.5 w-3.5" /></Button>
              </div>
              <Textarea
                ref={textareaRef}
                value={articleContent}
                onChange={(e) => { setArticleContent(e.target.value); autoSave(); }}
                placeholder="Write your article here... Use [[Entity Name]] to create wiki links."
                className="bg-stone-950 border-stone-800 text-stone-300 min-h-[250px] md:min-h-[400px] font-mono text-sm resize-none leading-relaxed"
                data-testid="textarea-article-content"
              />
            </>
          ) : (
            <div
              className="prose prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(articleContent) }}
              data-testid="article-preview"
            />
          )}
        </div>
      </div>
    </div>
  );
}
