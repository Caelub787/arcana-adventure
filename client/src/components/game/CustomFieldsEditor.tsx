import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type CustomField } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, ArrowUp, ArrowDown, Save, X, Pencil, Lock, Highlighter } from "lucide-react";

interface CustomFieldsEditorProps {
  ownerType: "character" | "item";
  ownerId?: string;
  canEdit: boolean;
  // Only a real GM/assistant-GM can see or set gmOnly, or add/see the inline
  // GM-note highlights below — the server already strips that data out of
  // the response for non-GM viewers, so this only controls whether the
  // GM-only controls are rendered at all.
  isGM?: boolean;
}

// A GM-only note pinned to a highlighted span of the field's player-visible
// body text — like a Google Docs comment. `quote` is the exact highlighted
// substring, used to relocate it inside the current body on every render
// rather than a stored offset (offsets rot the moment anyone edits earlier
// text; a substring search degrades gracefully instead — see
// computeAnnotatedSegments). Persisted as JSON inside the existing gmNotes
// column, so a player's own body edits — a wholly separate field — can never
// overwrite these, and adding this feature needed no schema change.
interface GmAnnotation {
  id: string;
  quote: string;
  note: string;
}

function parseAnnotations(raw: string | null | undefined): GmAnnotation[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((a: any): a is GmAnnotation => a && typeof a.id === "string" && typeof a.quote === "string" && typeof a.note === "string");
  } catch {
    return [];
  }
}

// Always a real string (never undefined/omitted) — deleting the last
// annotation must still reach the server as an explicit "clear this", not
// get silently dropped as a no-op PATCH key.
function serializeAnnotations(annotations: GmAnnotation[]): string {
  return annotations.length ? JSON.stringify(annotations) : "";
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

// Locate each annotation's quote in the current body, left to right, each
// search starting after the previous match so repeated substrings don't
// collide. A quote no longer found (the player edited or removed it) simply
// produces no segment — the annotation isn't lost, it shows up in the
// "orphaned" list below instead.
function computeAnnotatedSegments(body: string, annotations: GmAnnotation[]): { text: string; annotationId: string | null }[] {
  const matches: { start: number; end: number; id: string }[] = [];
  let searchFrom = 0;
  for (const a of annotations) {
    if (!a.quote) continue;
    const idx = body.indexOf(a.quote, searchFrom);
    if (idx === -1) continue;
    matches.push({ start: idx, end: idx + a.quote.length, id: a.id });
    searchFrom = idx + a.quote.length;
  }
  const segments: { text: string; annotationId: string | null }[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start > cursor) segments.push({ text: body.slice(cursor, m.start), annotationId: null });
    segments.push({ text: body.slice(m.start, m.end), annotationId: m.id });
    cursor = m.end;
  }
  if (cursor < body.length) segments.push({ text: body.slice(cursor), annotationId: null });
  return segments;
}

// A textarea whose height tracks its content instead of staying a fixed box.
const AutoTextarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<typeof Textarea>>(
  ({ value, className, onChange, ...props }, forwardedRef) => {
    const innerRef = useRef<HTMLTextAreaElement>(null);
    useLayoutEffect(() => {
      const el = innerRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }, [value]);
    return (
      <Textarea
        ref={(node) => {
          innerRef.current = node;
          if (typeof forwardedRef === "function") forwardedRef(node);
          else if (forwardedRef) forwardedRef.current = node;
        }}
        value={value}
        onChange={onChange}
        className={`resize-none overflow-hidden ${className || ""}`}
        {...props}
      />
    );
  }
);
AutoTextarea.displayName = "AutoTextarea";

// C.A. only: freeform header+body sections, used on the Overview tab
// (ownerType="character") and on blank-sheet items (ownerType="item").
// The body is one continuous auto-growing text block visible to everyone.
// A GM (or assistant-GM) can select any part of it and pin a private note to
// that exact text — shown to them as a highlight, invisible to everyone
// else — instead of a separate boxed "GM Notes" section.
export function CustomFieldsEditor({ ownerType, ownerId, canEdit, isGM = false }: CustomFieldsEditorProps) {
  const queryClient = useQueryClient();
  const [addingNew, setAddingNew] = useState(false);
  const [newHeader, setNewHeader] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newGmOnly, setNewGmOnly] = useState(false);

  const queryKey = ["customFields", ownerType, ownerId];

  const { data: fields = [] } = useQuery({
    queryKey,
    queryFn: () => (ownerType === "item" ? api.getItemCustomFields(ownerId!) : api.getCharacterCustomFields(ownerId!)),
    enabled: !!ownerId,
    staleTime: 5 * 60 * 1000,
  });

  const sorted = [...fields].sort((a, b) => a.sortOrder - b.sortOrder);

  const createMutation = useMutation({
    mutationFn: (data: Partial<CustomField>) => api.createCustomField(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setAddingNew(false);
      setNewHeader("");
      setNewBody("");
      setNewGmOnly(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CustomField> }) => api.updateCustomField(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteCustomField(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, sortOrder }: { id: string; sortOrder: number }) => api.updateCustomField(id, { sortOrder }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const handleMove = (index: number, direction: -1 | 1) => {
    const target = sorted[index + direction];
    const current = sorted[index];
    if (!target || !current) return;
    moveMutation.mutate({ id: current.id, sortOrder: target.sortOrder });
    moveMutation.mutate({ id: target.id, sortOrder: current.sortOrder });
  };

  return (
    <div className="space-y-2" data-testid="section-custom-fields">
      {sorted.map((field, i) => (
        <CustomFieldRow
          key={field.id}
          field={field}
          isGM={isGM}
          canEdit={canEdit}
          isFirst={i === 0}
          isLast={i === sorted.length - 1}
          onMoveUp={() => handleMove(i, -1)}
          onMoveDown={() => handleMove(i, 1)}
          onSave={(data) => updateMutation.mutate({ id: field.id, data })}
          onDelete={() => deleteMutation.mutate(field.id)}
        />
      ))}

      {canEdit && (
        addingNew ? (
          <div className="rounded border border-amber-700 bg-stone-900/50 p-2 space-y-2" data-testid="form-new-custom-field">
            <div>
              <Label className="text-xs text-stone-400">Header</Label>
              <Input
                value={newHeader}
                onChange={(e) => setNewHeader(e.target.value)}
                placeholder="Section title"
                className="bg-stone-800 border-stone-600 text-sm"
                data-testid="input-new-custom-field-header"
              />
            </div>
            <div>
              <Label className="text-xs text-stone-400">Body</Label>
              <AutoTextarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="Content..."
                className="bg-stone-800 border-stone-600 text-sm min-h-[60px]"
                data-testid="textarea-new-custom-field-body"
              />
            </div>
            {isGM && (
              <label className="flex items-center gap-1.5 text-xs cursor-pointer text-violet-300">
                <input
                  type="checkbox"
                  checked={newGmOnly}
                  onChange={(e) => setNewGmOnly(e.target.checked)}
                  data-testid="checkbox-new-custom-field-gmonly"
                />
                <Lock className="h-3 w-3" /> GM Only (hide entire section from players)
              </label>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!newHeader.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate({
                  ownerType, ownerId, header: newHeader.trim(), body: newBody, sortOrder: fields.length,
                  ...(isGM ? { gmOnly: newGmOnly } : {}),
                })}
                data-testid="button-save-new-custom-field"
              >
                <Save className="h-3 w-3 mr-1" /> Save
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setAddingNew(false); setNewHeader(""); setNewBody(""); setNewGmOnly(false); }} data-testid="button-cancel-new-custom-field">
                <X className="h-3 w-3 mr-1" /> Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAddingNew(true)} data-testid="button-add-custom-field">
            <Plus className="h-3 w-3 mr-1" /> Add Section
          </Button>
        )
      )}
    </div>
  );
}

interface CustomFieldRowProps {
  field: CustomField;
  isGM: boolean;
  canEdit: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSave: (data: Partial<CustomField>) => void;
  onDelete: () => void;
}

function CustomFieldRow({ field, isGM, canEdit, isFirst, isLast, onMoveUp, onMoveDown, onSave, onDelete }: CustomFieldRowProps) {
  const [editing, setEditing] = useState(false);
  const [editHeader, setEditHeader] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editGmOnly, setEditGmOnly] = useState(false);

  // The quote a new note will attach to. Editable rather than a fixed
  // read-only echo of a text selection: native selection detection (mouseup/
  // touchend) is a nice-to-have shortcut that pre-fills this, but the "+ Add
  // Note" button always works even when nothing is selected — the GM can
  // just type or paste the exact phrase instead. That also sidesteps mobile
  // browsers whose native selection-handle drags don't reliably dispatch
  // events this component can listen for.
  const [pendingQuote, setPendingQuote] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const bodyContainerRef = useRef<HTMLDivElement>(null);
  // Right-click-on-a-selection context menu — viewport position + the
  // selected text captured at right-click time (clicking the menu item
  // itself would otherwise collapse the live selection before the click
  // handler runs, losing it) — or null when closed.
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number; quote: string } | null>(null);

  const startEdit = () => {
    setEditHeader(field.header);
    setEditBody(field.body || "");
    setEditGmOnly(!!field.gmOnly);
    setEditing(true);
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Listened for on the document rather than just this row's own
  // mouseup/touchend: a real drag-select routinely ends with the pointer
  // released outside the exact bounds of the text container (past the last
  // line, over the row's padding, etc.), and a handler attached only to the
  // container would silently never fire for those. Selection state itself is
  // checked against this row's own container, so other rows' selections are
  // ignored. This is a convenience pre-fill only — the "+ Add Note" button
  // below always works even without it, since some browsers' native
  // selection-handle drags (mobile in particular) don't reliably dispatch
  // events a page can listen for.
  useEffect(() => {
    if (!isGM) return;
    const handler = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const container = bodyContainerRef.current;
      if (!container) return;
      const range = sel.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) return;
      const text = sel.toString();
      if (!text.trim()) return;
      setPendingQuote(text);
      setNoteDraft("");
    };
    document.addEventListener("mouseup", handler);
    document.addEventListener("touchend", handler);
    return () => {
      document.removeEventListener("mouseup", handler);
      document.removeEventListener("touchend", handler);
    };
  }, [isGM]);

  const openAnnotationForm = () => {
    const sel = window.getSelection();
    const selected = sel && !sel.isCollapsed ? sel.toString().trim() : "";
    setPendingQuote(selected);
    setNoteDraft("");
  };

  // Tracks the most recent non-collapsed selection made inside this row's
  // body, kept fresh via `selectionchange` (which fires on every selection
  // change, unlike mouseup/touchend) rather than re-querying
  // window.getSelection() at contextmenu time — right-clicking collapses or
  // moves the live selection in some browsers before the contextmenu event
  // even fires, which silently emptied it and made preventDefault never run,
  // so the native menu showed instead of ours.
  const lastSelectionRef = useRef<string>("");
  useEffect(() => {
    if (!isGM) return;
    const handler = () => {
      const sel = window.getSelection();
      const container = bodyContainerRef.current;
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !container) return;
      const range = sel.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) return;
      const text = sel.toString().trim();
      if (text) lastSelectionRef.current = text;
    };
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, [isGM]);

  // Right-click inside this field's body -> small custom menu with "GM only
  // comment" (pre-filled with the last selection made here) instead of the
  // browser's own menu. Always suppresses the native menu for a GM viewing
  // this body, even with nothing selected, so right-clicking here is
  // predictable rather than sometimes falling through to the OS menu.
  const handleBodyContextMenu = (e: React.MouseEvent) => {
    if (!isGM) return;
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY, quote: lastSelectionRef.current });
  };

  const handleSaveAnnotation = () => {
    if (!pendingQuote?.trim() || !noteDraft.trim()) return;
    const annotations = parseAnnotations(field.gmNotes);
    annotations.push({ id: crypto.randomUUID(), quote: pendingQuote.trim(), note: noteDraft.trim() });
    onSave({ gmNotes: serializeAnnotations(annotations) });
    setPendingQuote(null);
    setNoteDraft("");
    window.getSelection()?.removeAllRanges();
  };

  const handleDeleteAnnotation = (id: string) => {
    const annotations = parseAnnotations(field.gmNotes).filter((a) => a.id !== id);
    onSave({ gmNotes: serializeAnnotations(annotations) });
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const annotations = isGM ? parseAnnotations(field.gmNotes) : [];
  const body = field.body || "";
  const orphaned = annotations.filter((a) => !body.includes(a.quote));

  return (
    <div
      className={`rounded border p-2 bg-stone-900/50 ${field.gmOnly ? "border-violet-700/70" : "border-stone-700"}`}
      data-testid={`row-custom-field-${field.id}`}
    >
      {editing ? (
        <div className="space-y-2">
          <Input
            value={editHeader}
            onChange={(e) => setEditHeader(e.target.value)}
            placeholder="Header"
            className="bg-stone-800 border-stone-600 text-sm"
            data-testid={`input-edit-custom-field-header-${field.id}`}
          />
          <AutoTextarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            placeholder="Body"
            className="bg-stone-800 border-stone-600 text-sm min-h-[60px]"
            data-testid={`textarea-edit-custom-field-body-${field.id}`}
          />
          {isGM && (
            <label className="flex items-center gap-1.5 text-xs cursor-pointer text-violet-300">
              <input
                type="checkbox"
                checked={editGmOnly}
                onChange={(e) => setEditGmOnly(e.target.checked)}
                data-testid={`checkbox-edit-custom-field-gmonly-${field.id}`}
              />
              <Lock className="h-3 w-3" /> GM Only (hide entire section from players)
            </label>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!editHeader.trim()}
              onClick={() => {
                onSave({ header: editHeader.trim(), body: editBody, ...(isGM ? { gmOnly: editGmOnly } : {}) });
                setEditing(false);
              }}
              data-testid={`button-save-custom-field-${field.id}`}
            >
              <Save className="h-3 w-3 mr-1" /> Save
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} data-testid={`button-cancel-custom-field-${field.id}`}>
              <X className="h-3 w-3 mr-1" /> Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-amber-400 flex items-center gap-1">
              {field.header}
              {field.gmOnly && (
                <span className="flex items-center gap-0.5 text-[10px] text-violet-400 font-normal" data-testid={`badge-gmonly-custom-field-${field.id}`}>
                  <Lock className="h-2.5 w-2.5" /> GM Only
                </span>
              )}
            </div>

            {body && (
              isGM ? (
                <div
                  ref={bodyContainerRef}
                  className="text-xs text-stone-300 whitespace-pre-wrap mt-0.5 cursor-text"
                  onContextMenu={handleBodyContextMenu}
                  data-testid={`text-custom-field-body-${field.id}`}
                >
                  {computeAnnotatedSegments(body, annotations).map((seg, i) => (
                    seg.annotationId ? (
                      <span
                        key={i}
                        className="bg-violet-700/40 hover:bg-violet-700/60 rounded-sm cursor-pointer underline decoration-violet-400 decoration-dotted decoration-2 underline-offset-2"
                        onClick={(e) => { e.stopPropagation(); toggleExpanded(seg.annotationId!); }}
                        data-testid={`highlight-annotation-${seg.annotationId}`}
                      >
                        {seg.text}
                      </span>
                    ) : (
                      <React.Fragment key={i}>{seg.text}</React.Fragment>
                    )
                  ))}
                </div>
              ) : (
                <div className="text-xs text-stone-300 whitespace-pre-wrap mt-0.5">{body}</div>
              )
            )}

            {isGM && body && pendingQuote === null && (
              <Button
                size="sm"
                variant="ghost"
                className="h-5 px-1 mt-0.5 text-[10px] text-violet-400 hover:text-violet-300"
                onClick={openAnnotationForm}
                data-testid={`button-add-annotation-${field.id}`}
              >
                <Highlighter className="h-2.5 w-2.5 mr-1" /> Add private note
              </Button>
            )}

            {isGM && pendingQuote !== null && (
              <div className="mt-1.5 rounded border border-violet-800/50 bg-violet-950/20 p-2 space-y-1.5">
                <div>
                  <Label className="text-[10px] text-violet-400">Attached to this text (select it above, or type/paste it here)</Label>
                  <Input
                    value={pendingQuote}
                    onChange={(e) => setPendingQuote(e.target.value)}
                    placeholder="Exact phrase from the text above..."
                    className="bg-stone-900 border-violet-800/60 text-xs h-7"
                    data-testid={`input-annotation-quote-${field.id}`}
                  />
                  {pendingQuote.trim() && !body.includes(pendingQuote.trim()) && (
                    <div className="text-[9px] text-amber-500 mt-0.5">Doesn't match the text above exactly — it'll still save, just won't highlight anything until it does.</div>
                  )}
                </div>
                <Textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Only you (and other GMs) will see this..."
                  className="bg-stone-900 border-violet-800/60 text-xs min-h-[50px]"
                  data-testid={`textarea-new-annotation-${field.id}`}
                />
                <div className="flex gap-1.5">
                  <Button size="sm" disabled={!pendingQuote.trim() || !noteDraft.trim()} onClick={handleSaveAnnotation} data-testid={`button-save-annotation-${field.id}`}>
                    Save Note
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setPendingQuote(null); window.getSelection()?.removeAllRanges(); }}
                    data-testid={`button-cancel-annotation-${field.id}`}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {isGM && annotations.filter((a) => expandedIds.has(a.id)).map((a) => (
              <div key={a.id} className="mt-1 pl-2 border-l-2 border-violet-700/60 flex items-start justify-between gap-2" data-testid={`text-annotation-note-${a.id}`}>
                <div>
                  <div className="text-[10px] text-violet-400 flex items-center gap-1"><Lock className="h-2.5 w-2.5" /> GM Note</div>
                  <div className="text-xs text-violet-200 whitespace-pre-wrap">{a.note}</div>
                </div>
                <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => handleDeleteAnnotation(a.id)} data-testid={`button-delete-annotation-${a.id}`}>
                  <Trash2 className="h-3 w-3 text-red-400" />
                </Button>
              </div>
            ))}

            {isGM && orphaned.length > 0 && (
              <div className="mt-1.5 rounded border border-amber-800/40 bg-amber-950/10 p-1.5 space-y-1">
                <div className="text-[10px] text-amber-500">Notes whose highlighted text was edited or removed:</div>
                {orphaned.map((a) => (
                  <div key={a.id} className="flex items-start justify-between gap-2">
                    <div className="text-[10px] text-stone-400">
                      <span className="italic">"{truncate(a.quote, 40)}"</span> — <span className="text-violet-200">{a.note}</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => handleDeleteAnnotation(a.id)} data-testid={`button-delete-annotation-${a.id}`}>
                      <Trash2 className="h-3 w-3 text-red-400" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {canEdit && (
            <div className="flex items-center gap-0.5 shrink-0">
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={isFirst} onClick={onMoveUp} data-testid={`button-move-up-custom-field-${field.id}`}>
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={isLast} onClick={onMoveDown} data-testid={`button-move-down-custom-field-${field.id}`}>
                <ArrowDown className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={startEdit} data-testid={`button-edit-custom-field-${field.id}`}>
                <Pencil className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onDelete} data-testid={`button-delete-custom-field-${field.id}`}>
                <Trash2 className="h-3 w-3 text-red-400" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Portaled to <body>, not just position:fixed in place — this row can
          sit inside a floating panel whose own transform-based positioning
          would otherwise turn "fixed" into "fixed relative to the panel"
          instead of the real viewport, misplacing the menu. */}
      {contextMenuPos && createPortal(
        <>
          <div className="fixed inset-0 z-[100000]" onClick={() => setContextMenuPos(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenuPos(null); }} />
          <div
            className="fixed z-[100001] rounded border border-violet-700/60 bg-stone-900 shadow-xl py-1 min-w-[160px]"
            style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
            data-testid={`contextmenu-annotation-${field.id}`}
          >
            {contextMenuPos.quote ? (
              <button
                type="button"
                className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-violet-300 hover:bg-violet-900/40 text-left"
                onClick={() => {
                  const quote = contextMenuPos.quote;
                  setContextMenuPos(null);
                  setPendingQuote(quote);
                  setNoteDraft("");
                }}
                data-testid={`button-contextmenu-gm-comment-${field.id}`}
              >
                <Highlighter className="h-3 w-3" /> GM only comment
              </button>
            ) : (
              <button
                type="button"
                className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-violet-300 hover:bg-violet-900/40 text-left"
                onClick={() => {
                  setContextMenuPos(null);
                  setPendingQuote("");
                  setNoteDraft("");
                }}
                data-testid={`button-contextmenu-gm-comment-${field.id}`}
              >
                <Highlighter className="h-3 w-3" /> GM only comment (type quote)
              </button>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
