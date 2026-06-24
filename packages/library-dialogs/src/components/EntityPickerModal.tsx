/**
 * EntityPickerModal — a search/filter "browse" panel for picking entities.
 *
 * Mirrors the "add an item to a character inventory" experience: instead of a
 * dropdown that dumps every option at once, the user opens a panel, searches
 * by name, optionally narrows by filters, and clicks rows to pick them.
 *
 * Multi-select friendly: pass `selectedIds` and the modal marks already-chosen
 * rows and keeps itself open so several can be added in a row. Closing is an
 * explicit "Done".
 *
 * Renders on top of the host dialog using the shared `.ld-dialog-overlay`
 * classes so it inherits the partner theme.
 */
import * as React from "react";
import { Button, Input, Select, SelectItem } from "../ui/primitives";

export type PickerOption = { id: string; name: string };

export type PickerFilter<T extends PickerOption> = {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  /** Return the option's value for this filter (lowercased compare). */
  getValue: (o: T) => string;
};

export interface EntityPickerModalProps<T extends PickerOption> {
  open: boolean;
  title: string;
  options: T[];
  /** ids already chosen — rows show a check and toggle off when clicked. */
  selectedIds?: string[];
  onPick: (option: T) => void;
  onClose: () => void;
  filters?: PickerFilter<T>[];
  /** Secondary text shown to the right of each row (e.g. type · rarity). */
  renderMeta?: (o: T) => React.ReactNode;
  searchPlaceholder?: string;
  emptyText?: string;
  testIdPrefix: string;
}

export function EntityPickerModal<T extends PickerOption>({
  open,
  title,
  options,
  selectedIds,
  onPick,
  onClose,
  filters,
  renderMeta,
  searchPlaceholder,
  emptyText,
  testIdPrefix,
}: EntityPickerModalProps<T>) {
  const [search, setSearch] = React.useState("");
  const [filterValues, setFilterValues] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open) { setSearch(""); setFilterValues({}); }
  }, [open]);

  if (!open) return null;

  const selSet = new Set(selectedIds ?? []);
  const trimmed = search.trim().toLowerCase();
  const filtered = options.filter((o) => {
    if (trimmed && !o.name.toLowerCase().includes(trimmed)) return false;
    for (const f of filters ?? []) {
      const want = filterValues[f.key];
      if (want && f.getValue(o).toLowerCase() !== want.toLowerCase()) return false;
    }
    return true;
  });

  return (
    <div
      className="ld-dialog-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid={`picker-overlay-${testIdPrefix}`}
    >
      <div className="ld-dialog" style={{ maxWidth: 560 }} role="dialog" aria-modal="true">
        <div className="ld-dialog-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 className="ld-dialog-title">{title}</h2>
          <Button size="sm" variant="ghost" onClick={onClose} data-testid={`button-close-${testIdPrefix}`}>✕</Button>
        </div>

        <div className="ld-dialog-body">
          <div className="ld-stack-sm">
            <Input
              autoFocus
              value={search}
              placeholder={searchPlaceholder ?? "Search…"}
              onChange={(e) => setSearch(e.target.value)}
              data-testid={`input-${testIdPrefix}-search`}
            />

            {(filters ?? []).length > 0 && (
              <div className="ld-row" style={{ flexWrap: "wrap" }}>
                {(filters ?? []).map((f) => (
                  <div key={f.key} style={{ minWidth: 140, flex: 1 }}>
                    <span className="ld-subtle">{f.label}</span>
                    <Select
                      value={filterValues[f.key] ?? ""}
                      onValueChange={(v) => setFilterValues((prev) => ({ ...prev, [f.key]: v }))}
                      data-testid={`select-${testIdPrefix}-${f.key}`}
                    >
                      <SelectItem value="">All</SelectItem>
                      {f.options.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>
            )}

            <div style={{ maxHeight: "48vh", overflowY: "auto" }} className="ld-stack-sm">
              {filtered.length === 0 ? (
                <div className="ld-subtle" data-testid={`text-${testIdPrefix}-empty`}>
                  {options.length === 0 ? (emptyText ?? "Nothing to pick yet.") : "No matches."}
                </div>
              ) : (
                filtered.map((o) => {
                  const isSelected = selSet.has(o.id);
                  return (
                    <Button
                      key={o.id}
                      variant={isSelected ? "primary" : "outline"}
                      onClick={() => onPick(o)}
                      style={{ justifyContent: "space-between", width: "100%" }}
                      data-testid={`button-pick-${testIdPrefix}-${o.id}`}
                    >
                      <span>{isSelected ? "✓ " : ""}{o.name}</span>
                      {renderMeta && <span className="ld-subtle">{renderMeta(o)}</span>}
                    </Button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="ld-dialog-footer">
          <Button variant="primary" onClick={onClose} data-testid={`button-done-${testIdPrefix}`}>Done</Button>
        </div>
      </div>
    </div>
  );
}
