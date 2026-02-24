import React, { useState, useCallback, useEffect, useRef } from "react";
import { useUpdateEntity, ENTITY_TYPE_CONFIG, type Entity } from "@/lib/worldbuilding-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Bold, Italic, Heading1, Heading2, Heading3, List, ListOrdered, Link2, Image, Eye, Edit3, Save, Hash, Minus } from "lucide-react";

const TYPE_TEMPLATE_FIELDS: Record<string, { key: string; label: string; type: 'text' | 'textarea' | 'select' | 'list'; options?: string[] }[]> = {
  location: [
    { key: "population", label: "Population", type: "text" },
    { key: "government", label: "Government", type: "text" },
    { key: "climate", label: "Climate", type: "text" },
    { key: "region", label: "Region", type: "text" },
    { key: "terrain", label: "Terrain", type: "text" },
  ],
  faction: [
    { key: "goals", label: "Goals", type: "textarea" },
    { key: "resources", label: "Resources", type: "text" },
    { key: "alignment", label: "Alignment", type: "text" },
    { key: "territory", label: "Territory", type: "text" },
    { key: "leader", label: "Leader", type: "text" },
  ],
  quest: [
    { key: "status", label: "Status", type: "select", options: ["active", "completed", "failed", "inactive"] },
    { key: "questType", label: "Quest Type", type: "text" },
    { key: "objectives", label: "Objectives", type: "list" },
    { key: "rewards", label: "Rewards", type: "textarea" },
  ],
  character: [
    { key: "species", label: "Race/Species", type: "text" },
    { key: "classRole", label: "Class/Role", type: "text" },
    { key: "affiliation", label: "Affiliation", type: "text" },
    { key: "homeland", label: "Homeland", type: "text" },
  ],
  event: [
    { key: "date", label: "Date/Era", type: "text" },
    { key: "duration", label: "Duration", type: "text" },
    { key: "impact", label: "Impact", type: "textarea" },
    { key: "participants", label: "Participants", type: "text" },
  ],
  magic: [
    { key: "damage", label: "Damage", type: "text" },
    { key: "range", label: "Range", type: "text" },
    { key: "cost", label: "Cost", type: "text" },
    { key: "school", label: "School", type: "text" },
    { key: "element", label: "Element", type: "text" },
    { key: "castingTime", label: "Casting Time", type: "text" },
    { key: "components", label: "Components", type: "text" },
  ],
  item: [
    { key: "rarity", label: "Rarity", type: "select", options: ["common", "uncommon", "rare", "epic", "legendary", "artifact"] },
    { key: "weight", label: "Weight", type: "text" },
    { key: "value", label: "Value", type: "text" },
    { key: "properties", label: "Properties", type: "textarea" },
    { key: "requirements", label: "Requirements", type: "text" },
  ],
  encounter: [
    { key: "difficulty", label: "Difficulty", type: "select", options: ["trivial", "easy", "medium", "hard", "deadly"] },
    { key: "environment", label: "Environment", type: "text" },
    { key: "creatures", label: "Creatures", type: "textarea" },
    { key: "rewards", label: "Rewards", type: "text" },
    { key: "tactics", label: "Tactics", type: "textarea" },
  ],
  clue: [
    { key: "source", label: "Source", type: "text" },
    { key: "relevance", label: "Relevance", type: "textarea" },
    { key: "discoveryLocation", label: "Discovery Location", type: "text" },
    { key: "connectedMystery", label: "Connected Mystery", type: "text" },
  ],
  lore: [
    { key: "era", label: "Era", type: "text" },
    { key: "source", label: "Source", type: "text" },
    { key: "significance", label: "Significance", type: "textarea" },
  ],
  timeline: [
    { key: "startDate", label: "Start Date", type: "text" },
    { key: "endDate", label: "End Date", type: "text" },
    { key: "era", label: "Era", type: "text" },
  ],
  article: [
    { key: "category", label: "Category", type: "text" },
    { key: "summary", label: "Summary", type: "textarea" },
  ],
};

interface WikiArticleEditorProps {
  entity: Entity;
  campaignId?: string;
  worldId?: string;
  isGM: boolean;
  onEntityUpdated?: () => void;
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

export function WikiArticleEditor({ entity, campaignId, worldId, isGM, onEntityUpdated }: WikiArticleEditorProps) {
  const resolvedId = worldId || campaignId;
  const scope = worldId ? "worlds" as const : "campaigns" as const;
  const updateEntity = useUpdateEntity(resolvedId, scope);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [articleContent, setArticleContent] = useState(entity.articleContent || "");
  const [description, setDescription] = useState(entity.description || "");
  const [displayName, setDisplayName] = useState(entity.displayName || "");
  const [image, setImage] = useState(entity.image || "");
  const [templateData, setTemplateData] = useState<Record<string, any>>(() => {
    const dataKey = `${entity.entityType}Data` as keyof Entity;
    return (entity[dataKey] as Record<string, any>) || (entity.loreFields as Record<string, any>) || {};
  });
  const [isSaving, setIsSaving] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setArticleContent(entity.articleContent || "");
    setDescription(entity.description || "");
    setDisplayName(entity.displayName || "");
    setImage(entity.image || "");
    const dataKey = `${entity.entityType}Data` as keyof Entity;
    setTemplateData((entity[dataKey] as Record<string, any>) || (entity.loreFields as Record<string, any>) || {});
  }, [entity.id]);

  const saveChanges = useCallback(async () => {
    setIsSaving(true);
    const dataKey = `${entity.entityType}Data`;
    const updateData: any = {
      id: entity.id,
      articleContent,
      description,
      displayName,
      image: image || undefined,
    };
    if (['location', 'faction', 'event', 'clue', 'lore', 'timeline', 'article', 'character'].includes(entity.entityType)) {
      updateData.loreFields = templateData;
    } else {
      updateData[dataKey] = templateData;
    }
    try {
      await updateEntity.mutateAsync(updateData);
      onEntityUpdated?.();
    } finally {
      setIsSaving(false);
    }
  }, [entity.id, articleContent, description, displayName, image, templateData, updateEntity, onEntityUpdated]);

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

  const templateFields = TYPE_TEMPLATE_FIELDS[entity.entityType] || [];

  const updateTemplateField = (key: string, value: any) => {
    setTemplateData(prev => ({ ...prev, [key]: value }));
    autoSave();
  };

  const cfg = ENTITY_TYPE_CONFIG[entity.entityType];

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
      </div>

      <div className="flex-1 overflow-y-auto">
        {image && (
          <div className="relative h-48 overflow-hidden">
            <img src={image} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-stone-950 to-transparent" />
          </div>
        )}

        {templateFields.length > 0 && (
          <div className="border-b border-stone-700 bg-stone-900/30 p-3 md:p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {templateFields.map(field => (
                <div key={field.key} className={field.type === 'textarea' || field.type === 'list' ? 'col-span-2' : ''}>
                  <Label className="text-[10px] text-stone-500 uppercase tracking-wider">{field.label}</Label>
                  {mode === "edit" ? (
                    field.type === 'select' ? (
                      <select
                        value={templateData[field.key] || ""}
                        onChange={(e) => updateTemplateField(field.key, e.target.value)}
                        className="w-full mt-0.5 bg-stone-800 border border-stone-700 text-stone-200 rounded px-2 py-1 text-xs"
                        data-testid={`select-template-${field.key}`}
                      >
                        <option value="">—</option>
                        {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    ) : field.type === 'textarea' ? (
                      <Textarea
                        value={templateData[field.key] || ""}
                        onChange={(e) => updateTemplateField(field.key, e.target.value)}
                        className="mt-0.5 bg-stone-800 border-stone-700 text-stone-200 text-xs min-h-[50px] resize-none"
                        data-testid={`input-template-${field.key}`}
                      />
                    ) : field.type === 'list' ? (
                      <div className="mt-0.5 space-y-1">
                        {((templateData[field.key] as string[]) || [""]).map((item: string, idx: number) => (
                          <div key={idx} className="flex gap-1">
                            <Input
                              value={item}
                              onChange={(e) => {
                                const list = [...((templateData[field.key] as string[]) || [""])];
                                list[idx] = e.target.value;
                                updateTemplateField(field.key, list);
                              }}
                              className="bg-stone-800 border-stone-700 text-stone-200 text-xs h-7"
                              data-testid={`input-template-${field.key}-${idx}`}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-stone-500 hover:text-red-400"
                              onClick={() => {
                                const list = ((templateData[field.key] as string[]) || [""]).filter((_: any, i: number) => i !== idx);
                                updateTemplateField(field.key, list.length ? list : [""]);
                              }}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[10px] text-stone-500 hover:text-amber-400 h-5"
                          onClick={() => updateTemplateField(field.key, [...((templateData[field.key] as string[]) || []), ""])}
                        >
                          + Add
                        </Button>
                      </div>
                    ) : (
                      <Input
                        value={templateData[field.key] || ""}
                        onChange={(e) => updateTemplateField(field.key, e.target.value)}
                        className="mt-0.5 bg-stone-800 border-stone-700 text-stone-200 text-xs h-7"
                        data-testid={`input-template-${field.key}`}
                      />
                    )
                  ) : (
                    <div className="text-xs text-stone-300 mt-0.5">
                      {field.type === 'list' 
                        ? ((templateData[field.key] as string[]) || []).filter(Boolean).join(", ") || "—"
                        : templateData[field.key] || "—"
                      }
                    </div>
                  )}
                </div>
              ))}
            </div>
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
