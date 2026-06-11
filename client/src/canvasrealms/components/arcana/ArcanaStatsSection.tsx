import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useGetRealm,
  useUpdateNode,
  getGetNodeQueryKey,
  getListNodesQueryKey,
  getGetRealmQueryKey,
  type Node,
} from "@workspace/api-client-react";
import { ChevronDown, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { Input } from "@cr/components/ui/input";
import { useAppStore } from "@cr/lib/store";
import { customFetch } from "@workspace/api-client-react";
import { useAutoGrowTextarea } from "@cr/lib/useAutoGrowTextarea";

/**
 * Local textarea wrapper that grows with its content so long descriptions
 * are fully visible without an inner scrollbar.
 */
function AutoGrowTextarea({
  value,
  onChange,
  readOnly,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  readOnly?: boolean;
}) {
  const setEl = useAutoGrowTextarea(value, 3);
  return (
    <textarea
      ref={setEl}
      readOnly={readOnly}
      value={value}
      onChange={onChange}
      className="w-full bg-background/60 border border-border rounded-md px-2 py-1 text-sm resize-none overflow-hidden"
    />
  );
}

const ARCANA_KINDS = new Set([
  "item",
  "spell",
  "character",
  "species",
  "class",
  "feat-tree",
  "character-template",
  "roll-template",
]);

interface JSONSchema {
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  enum?: unknown[];
  description?: string;
  items?: JSONSchema;
  format?: string;
  title?: string;
}

interface OpenAPIDoc {
  components?: { schemas?: Record<string, JSONSchema> };
  paths?: Record<string, Record<string, { requestBody?: { content?: Record<string, { schema?: JSONSchema }> } }>>;
}

/**
 * Find the schema for a kind in Arcana's OpenAPI document. Tries common
 * conventions:
 *   - components.schemas[<Kind>] (PascalCase)
 *   - components.schemas[<kind>]
 *   - request body of POST /<kind> or /<kind>s
 * Returns null if nothing matches.
 */
function pickSchemaForKind(doc: OpenAPIDoc, kind: string): JSONSchema | null {
  const schemas = doc.components?.schemas ?? {};
  const camel = kind.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const Pascal = camel[0]!.toUpperCase() + camel.slice(1);
  const candidates = [
    // Arcana Adventure prefixes its sync schemas with "Sync" (e.g. SyncSpell,
    // SyncFeatTree). Try those first.
    `Sync${Pascal}`,
    Pascal,
    camel,
    kind[0]!.toUpperCase() + kind.slice(1),
    kind,
    `Sync${Pascal}Patch`,
  ];
  for (const c of candidates) {
    if (schemas[c]) return schemas[c]!;
  }
  // Case-insensitive sweep before falling back to path-based lookup.
  const wantPascal = Pascal.toLowerCase();
  const wantSync = "sync" + wantPascal;
  for (const [name, schema] of Object.entries(schemas)) {
    const lc = name.toLowerCase();
    if (lc === wantSync || lc === wantPascal) return schema;
  }
  // Look for a request body schema for an upsert/create path on this kind.
  const paths = doc.paths ?? {};
  for (const [path, methods] of Object.entries(paths)) {
    if (!path.toLowerCase().includes(kind.toLowerCase())) continue;
    for (const op of Object.values(methods)) {
      const sch = op.requestBody?.content?.["application/json"]?.schema;
      if (sch) return sch;
    }
  }
  if (typeof console !== "undefined") {
    console.warn(
      `[arcana] No schema matched kind "${kind}" (tried ${candidates.join(", ")}). Available:`,
      Object.keys(schemas),
    );
  }
  return null;
}

interface Props {
  node: Node;
  readOnly: boolean;
}

export function ArcanaStatsSection({ node, readOnly }: Props) {
  const { activeRealmId } = useAppStore();
  const { data: realm } = useGetRealm(node.realmId, {
    query: {
      enabled: !!activeRealmId,
      queryKey: getGetRealmQueryKey(node.realmId),
    },
  });
  const updateNode = useUpdateNode();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(true);

  const linked = !!realm?.arcanaLinked;
  const kindIsArcana = ARCANA_KINDS.has(node.kind);

  const schemaQuery = useQuery({
    queryKey: ["arcana-openapi", node.realmId, node.kind],
    enabled: linked && kindIsArcana,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const doc = await customFetch<OpenAPIDoc>(
        `/api/realms/${node.realmId}/arcana/openapi`,
        { method: "GET" },
      );
      return pickSchemaForKind(doc, node.kind);
    },
  });

  const stats = useMemo(
    () =>
      node.arcanaStats && typeof node.arcanaStats === "object"
        ? (node.arcanaStats as Record<string, unknown>)
        : {},
    [node.arcanaStats],
  );

  const [draft, setDraft] = useState<Record<string, unknown>>(stats);
  useEffect(() => {
    setDraft(stats);
  }, [stats]);

  if (!kindIsArcana || !linked) return null;

  const schema = schemaQuery.data;
  const props = schema?.properties ?? {};
  const HIDDEN_KEYS = new Set([
    "id",
    "externalId",
    "externalUpdatedAt",
    "createdAt",
    "updatedAt",
    "isTemplate",
    "isLiveTemplate",
    "templatePriority",
    "templateUseOwnOrder",
    "templateSourceId",
  ]);
  const propEntries = Object.entries(props).filter(
    ([k]) => !HIDDEN_KEYS.has(k) && !/Id$/.test(k),
  );

  const persist = (next: Record<string, unknown>) => {
    setDraft(next);
    if (readOnly) return;
    updateNode.mutate(
      { nodeId: node.id, data: { arcanaStats: next } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetNodeQueryKey(node.id) });
          if (activeRealmId) {
            queryClient.invalidateQueries({ queryKey: getListNodesQueryKey(activeRealmId) });
          }
        },
      },
    );
  };

  return (
    <div className="border-t border-border bg-muted/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-accent" />
          Arcana stats · {node.kind}
        </span>
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 max-h-[40vh] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
          {schemaQuery.isLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading Arcana schema…
            </div>
          )}
          {schemaQuery.isError && (
            <div className="text-xs text-destructive">
              Couldn't load the Arcana schema for this kind.
            </div>
          )}
          {!schemaQuery.isLoading && !schema && (
            <div className="text-xs text-muted-foreground">
              No schema found for "{node.kind}". Edits to this section will be sent to Arcana as
              free-form fields.
            </div>
          )}
          {propEntries.length === 0 && schema && (
            <div className="text-xs text-muted-foreground italic">
              This kind has no editable stats in the current Arcana schema.
            </div>
          )}
          {propEntries.map(([key, propSchema]) => (
            <Field
              key={key}
              name={key}
              schema={propSchema}
              value={draft[key]}
              readOnly={readOnly}
              onChange={(v) => persist({ ...draft, [key]: v })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface FieldProps {
  name: string;
  schema: JSONSchema;
  value: unknown;
  readOnly: boolean;
  onChange: (v: unknown) => void;
}

function Field({ name, schema, value, readOnly, onChange }: FieldProps) {
  const label = schema.title || name;
  const t = Array.isArray(schema.type) ? schema.type[0] : schema.type;

  if (schema.enum && schema.enum.length > 0) {
    return (
      <label className="block">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
          {label}
        </div>
        <select
          disabled={readOnly}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value || null)}
          className="w-full h-8 bg-background/60 border border-border rounded-md px-2 text-sm"
        >
          <option value="">—</option>
          {schema.enum.map((opt) => (
            <option key={String(opt)} value={String(opt)}>
              {String(opt)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (t === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          disabled={readOnly}
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{label}</span>
      </label>
    );
  }

  if (t === "number" || t === "integer") {
    return (
      <label className="block">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
          {label}
        </div>
        <Input
          type="number"
          readOnly={readOnly}
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") return onChange(null);
            const n = t === "integer" ? parseInt(v, 10) : parseFloat(v);
            onChange(Number.isFinite(n) ? n : null);
          }}
          className="h-8 bg-background/60"
        />
      </label>
    );
  }

  // Strings (and any unknown leaf shape) — use textarea for long descriptions.
  const isLong =
    name.toLowerCase().includes("description") ||
    name.toLowerCase().includes("notes") ||
    name.toLowerCase().includes("text");
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
        {label}
      </div>
      {isLong ? (
        <AutoGrowTextarea
          readOnly={readOnly}
          value={typeof value === "string" ? value : value == null ? "" : JSON.stringify(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          readOnly={readOnly}
          value={typeof value === "string" ? value : value == null ? "" : JSON.stringify(value)}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 bg-background/60"
        />
      )}
    </label>
  );
}
