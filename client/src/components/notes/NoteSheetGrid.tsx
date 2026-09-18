import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Minus } from "lucide-react";
import {
  type SheetData,
  cellAddress,
  colIndexToLabel,
  evaluateSheet,
} from "@/lib/sheetFormula";

interface NoteSheetGridProps {
  data: SheetData;
  onChange: (data: SheetData) => void;
  readOnly?: boolean;
}

const MIN_ROWS = 1;
const MIN_COLS = 1;
const MAX_ROWS = 200;
const MAX_COLS = 52;

export function NoteSheetGrid({ data, onChange, readOnly = false }: NoteSheetGridProps) {
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const displayValues = useMemo(() => evaluateSheet(data), [data]);

  const commitEdit = () => {
    if (!editingCell) return;
    const cells = { ...data.cells };
    if (editValue === "") {
      delete cells[editingCell];
    } else {
      cells[editingCell] = editValue;
    }
    onChange({ ...data, cells });
    setEditingCell(null);
  };

  const startEdit = (ref: string) => {
    if (readOnly) return;
    setEditingCell(ref);
    setEditValue(data.cells[ref] ?? "");
  };

  const addRow = () => {
    if (data.rowCount >= MAX_ROWS) return;
    onChange({ ...data, rowCount: data.rowCount + 1 });
  };
  const removeRow = () => {
    if (data.rowCount <= MIN_ROWS) return;
    const lastRow = data.rowCount - 1;
    const cells = { ...data.cells };
    for (let c = 0; c < data.colCount; c++) delete cells[cellAddress(lastRow, c)];
    onChange({ ...data, rowCount: data.rowCount - 1, cells });
  };
  const addCol = () => {
    if (data.colCount >= MAX_COLS) return;
    onChange({ ...data, colCount: data.colCount + 1 });
  };
  const removeCol = () => {
    if (data.colCount <= MIN_COLS) return;
    const lastCol = data.colCount - 1;
    const cells = { ...data.cells };
    for (let r = 0; r < data.rowCount; r++) delete cells[cellAddress(r, lastCol)];
    onChange({ ...data, colCount: data.colCount - 1, cells });
  };

  return (
    <div className="flex flex-col gap-2">
      {!readOnly && (
        <div className="flex items-center gap-1 text-xs text-stone-400">
          <Button type="button" variant="outline" size="sm" className="h-6 px-2 border-stone-700" onClick={addRow} data-testid="button-sheet-add-row">
            <Plus className="h-3 w-3 mr-1" /> Row
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-6 px-2 border-stone-700" onClick={removeRow} data-testid="button-sheet-remove-row">
            <Minus className="h-3 w-3 mr-1" /> Row
          </Button>
          <div className="w-px h-4 bg-stone-700 mx-1" />
          <Button type="button" variant="outline" size="sm" className="h-6 px-2 border-stone-700" onClick={addCol} data-testid="button-sheet-add-col">
            <Plus className="h-3 w-3 mr-1" /> Col
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-6 px-2 border-stone-700" onClick={removeCol} data-testid="button-sheet-remove-col">
            <Minus className="h-3 w-3 mr-1" /> Col
          </Button>
          <span className="ml-2 text-stone-500">Double-click a cell to edit. Formulas start with =, e.g. =SUM(A1:A5)</span>
        </div>
      )}
      <div className="overflow-auto border border-stone-700 rounded-md max-h-[60vh]">
        <table className="border-collapse text-sm w-full">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 bg-stone-800 border border-stone-700 w-10" />
              {Array.from({ length: data.colCount }, (_, c) => (
                <th
                  key={c}
                  className="sticky top-0 z-10 bg-stone-800 border border-stone-700 px-2 py-1 text-stone-300 font-medium min-w-[96px]"
                >
                  {colIndexToLabel(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: data.rowCount }, (_, r) => (
              <tr key={r}>
                <td className="sticky left-0 z-10 bg-stone-800 border border-stone-700 px-2 py-1 text-center text-stone-400 font-medium">
                  {r + 1}
                </td>
                {Array.from({ length: data.colCount }, (_, c) => {
                  const ref = cellAddress(r, c);
                  const isEditing = editingCell === ref;
                  const display = displayValues[ref] ?? "";
                  return (
                    <td
                      key={ref}
                      className="border border-stone-700 px-0 py-0 align-top"
                      onDoubleClick={() => startEdit(ref)}
                      data-testid={`sheet-cell-${ref}`}
                    >
                      {isEditing ? (
                        <Input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={commitEdit}
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitEdit();
                            } else if (e.key === "Escape") {
                              setEditingCell(null);
                            }
                          }}
                          className="h-7 w-full min-w-[96px] rounded-none border-0 focus-visible:ring-1 focus-visible:ring-amber-500 bg-stone-900 px-2"
                        />
                      ) : (
                        <div
                          className={`h-7 px-2 flex items-center min-w-[96px] truncate ${!readOnly ? "cursor-text hover:bg-stone-800/50" : ""} ${display === "#ERR!" || display === "#REF!" ? "text-red-400" : ""}`}
                          title={data.cells[ref]?.startsWith("=") ? data.cells[ref] : undefined}
                        >
                          {display}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
