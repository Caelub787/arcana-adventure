// A Book: a note whose body is an ordered list of other notes and characters.
//
// The reason it exists is sharing. A GM writes twenty notes the party can't
// open, drops the handful they should read into a book, and shares the book.
// Readers get every chapter in full and no way back to the note it came from;
// the server resolves chapter text against the BOOK's permissions and only
// tells an editor where a chapter came from.
//
// A chapter keeps its own copy of the text by default, so a book stays put
// while the notes behind it keep moving. Turn "Follow the source notes" on and
// the copy is set aside: chapters read and write their source note directly,
// so an edit in either place is an edit in both.
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, FileText, GripVertical, Plus, Trash2, User, X, Check } from "lucide-react";

export interface BookViewNoteOption {
  id: string;
  title: string;
  type?: string;
}

export function BookView({
  noteId,
  campaignId,
  title,
  liveSyncStored,
  onToggleLiveSync,
  availableNotes,
  renderContent,
}: {
  noteId: string;
  campaignId: string;
  title: string;
  /** The book note's own bookLiveSync, so the switch tracks the note record. */
  liveSyncStored: boolean;
  onToggleLiveSync: (next: boolean) => void;
  /** Notes the viewer can already see, for the Add chapter picker. */
  availableNotes: BookViewNoteOption[];
  /** Lets the host draw @entity references the same way it does elsewhere. */
  renderContent?: (text: string) => React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [titleDraftId, setTitleDraftId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const dragChapterId = useRef<string | null>(null);

  const queryKey = ["/api/notes", noteId, "book"];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => api.getBook(noteId),
    enabled: !!noteId,
  });
  const chapters = data?.chapters ?? [];
  const canEdit = !!data?.canEdit;
  const liveSync = data?.liveSync ?? liveSyncStored;

  const { data: characters = [] } = useQuery({
    queryKey: [`/api/campaigns/${campaignId}/characters`],
    queryFn: () => api.getCampaignCharacters(campaignId),
    enabled: pickerOpen && !!campaignId,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const addChapter = useMutation({
    mutationFn: (v: { sourceType: "note" | "character"; sourceId: string }) => api.addBookChapter(noteId, v),
    onSuccess: () => { refresh(); setPickerOpen(false); setPickerSearch(""); },
    onError: (e: any) => toast({ title: "Couldn't add that chapter", description: e?.message || "Please try again.", variant: "destructive" }),
  });
  const patchChapter = useMutation({
    mutationFn: (v: { id: string; data: { title?: string; content?: string } }) => api.updateBookChapter(noteId, v.id, v.data),
    onSuccess: refresh,
    onError: (e: any) => toast({ title: "Couldn't save the chapter", description: e?.message || "Please try again.", variant: "destructive" }),
  });
  const removeChapter = useMutation({
    mutationFn: (id: string) => api.deleteBookChapter(noteId, id),
    onSuccess: refresh,
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.reorderBook(noteId, ids),
    onSuccess: refresh,
  });

  // A chapter being edited elsewhere shouldn't yank the text out from under
  // whoever is typing, so the draft is only seeded when the editor opens.
  const beginEdit = (id: string, content: string) => {
    if (!canEdit) return;
    setEditingChapterId(id);
    setDraft(content);
  };
  const commitEdit = () => {
    if (!editingChapterId) return;
    patchChapter.mutate({ id: editingChapterId, data: { content: draft } });
    setEditingChapterId(null);
  };

  const alreadyIn = useMemo(
    () => new Set(chapters.map((c) => c.sourceId).filter(Boolean) as string[]),
    [chapters],
  );

  const pickerNotes = availableNotes
    .filter((n) => n.id !== noteId && n.type !== "book" && !alreadyIn.has(n.id))
    .filter((n) => !pickerSearch.trim() || n.title.toLowerCase().includes(pickerSearch.trim().toLowerCase()));
  const pickerCharacters = (characters as any[])
    .filter((c) => !alreadyIn.has(c.id))
    .filter((c) => !pickerSearch.trim() || (c.name || "").toLowerCase().includes(pickerSearch.trim().toLowerCase()));

  // Drag a note out of the sidebar, or a character off the roster, onto the
  // book. Both already set these types for their own drop targets.
  const dropTypes = ["application/note-id", "application/character-id"];
  const handleDragOver = (e: React.DragEvent) => {
    if (!canEdit) return;
    if (!dropTypes.some((t) => e.dataTransfer.types.includes(t))) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropActive(true);
  };
  const handleDrop = (e: React.DragEvent) => {
    if (!canEdit) return;
    const noteDrop = e.dataTransfer.getData("application/note-id");
    const charDrop = e.dataTransfer.getData("application/character-id");
    if (!noteDrop && !charDrop) return;
    e.preventDefault();
    e.stopPropagation();
    setDropActive(false);
    addChapter.mutate(noteDrop
      ? { sourceType: "note", sourceId: noteDrop }
      : { sourceType: "character", sourceId: charDrop });
  };

  const moveChapter = (id: string, delta: number) => {
    const ids = chapters.map((c) => c.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    reorder.mutate(ids);
  };
  const dropOnChapter = (targetId: string) => {
    const dragged = dragChapterId.current;
    dragChapterId.current = null;
    if (!dragged || dragged === targetId) return;
    const ids = chapters.map((c) => c.id);
    const from = ids.indexOf(dragged);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    reorder.mutate(ids);
  };

  return (
    <div
      className="flex-1 min-h-0 flex flex-col overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={() => setDropActive(false)}
      onDrop={handleDrop}
      data-testid="book-view"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-700 shrink-0">
        <BookOpen className="h-4 w-4 shrink-0" style={{ color: "var(--ca-gilt)" }} />
        <span className="text-sm font-display font-bold text-stone-100 truncate flex-1">{title}</span>
        {canEdit && (
          <>
            <label className="flex items-center gap-1.5 text-[11px] text-stone-400 shrink-0" title="Chapters read and write their source notes directly. Off, each chapter keeps the copy it was made with.">
              <Switch
                checked={liveSync}
                onCheckedChange={onToggleLiveSync}
                data-testid="book-toggle-live-sync"
              />
              Follow sources
            </label>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs shrink-0"
              onClick={() => setPickerOpen(true)}
              data-testid="button-book-add-chapter"
            >
              <Plus className="h-3 w-3 mr-1" /> Chapter
            </Button>
          </>
        )}
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-stone-500">Loading…</div>
      ) : (
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* Contents rail. Drag a row onto another to reorder. */}
          {chapters.length > 0 && (
            <div className="w-40 shrink-0 border-r border-stone-800 overflow-y-auto p-1 space-y-0.5" data-testid="book-contents">
              <p className="text-[10px] uppercase tracking-wide text-stone-500 px-1.5 py-1">Contents</p>
              {chapters.map((c, i) => (
                <div
                  key={c.id}
                  draggable={canEdit}
                  onDragStart={() => { dragChapterId.current = c.id; }}
                  onDragOver={(e) => { if (canEdit && dragChapterId.current) { e.preventDefault(); e.stopPropagation(); } }}
                  onDrop={(e) => { if (canEdit && dragChapterId.current) { e.preventDefault(); e.stopPropagation(); dropOnChapter(c.id); } }}
                  onClick={() => document.getElementById(`book-chapter-${c.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className="flex items-center gap-1 px-1.5 py-1 rounded text-xs text-stone-300 hover:bg-stone-800/60 cursor-pointer"
                  data-testid={`book-contents-${c.id}`}
                >
                  {canEdit && <GripVertical className="h-3 w-3 text-stone-600 shrink-0" />}
                  <span className="text-stone-600 text-[10px] shrink-0">{i + 1}</span>
                  <span className="truncate flex-1">{c.title}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex-1 min-w-0 overflow-y-auto p-3 space-y-3">
            {chapters.length === 0 && (
              <div
                className={`rounded-lg border border-dashed p-8 text-center text-xs ${dropActive ? "border-amber-600 text-amber-400" : "border-stone-700 text-stone-500"}`}
                data-testid="book-empty"
              >
                {canEdit
                  ? "Drag a note or a character in here, or press Chapter above."
                  : "This book has no chapters yet."}
              </div>
            )}

            {chapters.map((c, i) => (
              <div
                key={c.id}
                id={`book-chapter-${c.id}`}
                className="rounded-lg p-4 bg-stone-900/40"
                style={{ border: "1px solid var(--ca-gilt-line-soft)" }}
                data-testid={`book-chapter-${c.id}`}
              >
                <div className="flex items-start gap-2 mb-2">
                  {c.character?.portrait ? (
                    <img src={c.character.portrait} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                  ) : c.sourceType === "character" ? (
                    <User className="h-4 w-4 text-stone-500 mt-1 shrink-0" />
                  ) : (
                    <FileText className="h-4 w-4 text-stone-500 mt-1 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="block text-[10px] uppercase tracking-wide text-stone-600">Chapter {i + 1}</span>
                    {titleDraftId === c.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          autoFocus
                          value={titleDraft}
                          onChange={(e) => setTitleDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { patchChapter.mutate({ id: c.id, data: { title: titleDraft } }); setTitleDraftId(null); }
                            if (e.key === "Escape") setTitleDraftId(null);
                          }}
                          className="h-7 text-sm bg-stone-900 border-stone-700"
                          data-testid={`input-book-chapter-title-${c.id}`}
                        />
                        <Button size="sm" className="h-7 w-7 p-0" onClick={() => { patchChapter.mutate({ id: c.id, data: { title: titleDraft } }); setTitleDraftId(null); }}>
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => setTitleDraftId(null)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <h2
                        className={`text-lg font-display font-bold text-stone-100 truncate ${canEdit ? "cursor-pointer" : ""}`}
                        onDoubleClick={() => { if (canEdit) { setTitleDraft(c.title); setTitleDraftId(c.id); } }}
                        title={canEdit ? "Double-click to retitle this chapter" : undefined}
                        data-testid={`text-book-chapter-title-${c.id}`}
                      >
                        {c.title}
                      </h2>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => moveChapter(c.id, -1)} title="Move up" data-testid={`button-book-up-${c.id}`}>↑</Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => moveChapter(c.id, 1)} title="Move down" data-testid={`button-book-down-${c.id}`}>↓</Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-red-400"
                        onClick={() => removeChapter.mutate(c.id)}
                        title="Remove this chapter (the note it came from is untouched)"
                        data-testid={`button-book-remove-${c.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>

                {editingChapterId === c.id ? (
                  <div className="space-y-1">
                    <textarea
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={12}
                      className="w-full rounded border border-stone-700 bg-stone-900 text-stone-200 text-sm p-2 resize-y leading-relaxed"
                      data-testid={`textarea-book-chapter-${c.id}`}
                    />
                    <div className="flex items-center gap-1">
                      <Button size="sm" className="h-7 text-xs" onClick={commitEdit} data-testid={`button-book-save-${c.id}`}>Save</Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingChapterId(null)}>Cancel</Button>
                      {liveSync && <span className="text-[10px] text-stone-500">Saves to the note this chapter came from.</span>}
                    </div>
                  </div>
                ) : (
                  <div
                    className={`text-sm text-stone-300 whitespace-pre-wrap leading-relaxed ${canEdit ? "cursor-text" : ""}`}
                    onClick={() => beginEdit(c.id, c.content)}
                    data-testid={`text-book-chapter-${c.id}`}
                  >
                    {c.content
                      ? (renderContent ? renderContent(c.content) : c.content)
                      : <span className="text-stone-600 italic">Nothing written here yet.</span>}
                  </div>
                )}
              </div>
            ))}

            {chapters.length > 0 && canEdit && (
              <div
                className={`rounded-lg border border-dashed p-4 text-center text-[11px] ${dropActive ? "border-amber-600 text-amber-400" : "border-stone-800 text-stone-600"}`}
                data-testid="book-drop-hint"
              >
                Drag a note or a character here to add a chapter.
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={pickerOpen} onOpenChange={(o) => { setPickerOpen(o); if (!o) setPickerSearch(""); }}>
        <DialogContent className="bg-stone-900 border-stone-700 max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-stone-200">Add a chapter</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Search notes and characters…"
            value={pickerSearch}
            onChange={(e) => setPickerSearch(e.target.value)}
            className="bg-stone-800 border-stone-700"
            data-testid="input-book-picker-search"
          />
          <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
            {pickerNotes.length > 0 && <p className="text-[10px] uppercase tracking-wide text-stone-500 px-1 pt-1">Notes</p>}
            {pickerNotes.map((n) => (
              <button
                key={n.id}
                onClick={() => addChapter.mutate({ sourceType: "note", sourceId: n.id })}
                className="w-full flex items-center gap-2 p-2 rounded-lg bg-stone-800/70 border border-stone-700 hover:border-amber-600 text-left"
                data-testid={`book-picker-note-${n.id}`}
              >
                <FileText className="h-3.5 w-3.5 text-stone-400 shrink-0" />
                <span className="text-sm text-stone-200 truncate">{n.title || "Untitled"}</span>
              </button>
            ))}
            {pickerCharacters.length > 0 && <p className="text-[10px] uppercase tracking-wide text-stone-500 px-1 pt-2">Characters</p>}
            {pickerCharacters.map((c: any) => (
              <button
                key={c.id}
                onClick={() => addChapter.mutate({ sourceType: "character", sourceId: c.id })}
                className="w-full flex items-center gap-2 p-2 rounded-lg bg-stone-800/70 border border-stone-700 hover:border-amber-600 text-left"
                data-testid={`book-picker-character-${c.id}`}
              >
                {c.portrait
                  ? <img src={c.portrait} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
                  : <User className="h-3.5 w-3.5 text-stone-400 shrink-0" />}
                <span className="text-sm text-stone-200 truncate">{c.name}</span>
              </button>
            ))}
            {pickerNotes.length === 0 && pickerCharacters.length === 0 && (
              <p className="text-sm text-stone-500 text-center py-4">Nothing left to add.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
