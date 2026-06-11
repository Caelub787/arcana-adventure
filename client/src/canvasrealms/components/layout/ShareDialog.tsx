import { useState } from "react";
import { useUser } from "@cr/lib/useUser";
import {
  useListCollaborators,
  useInviteCollaborator,
  useUpdateCollaborator,
  useRemoveCollaborator,
  getListCollaboratorsQueryKey,
  type Collaborator,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@cr/components/ui/dialog";
import { Button } from "@cr/components/ui/button";
import { Input } from "@cr/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@cr/components/ui/select";
import { Copy, Loader2, Trash2, Check, Eye, Pencil } from "lucide-react";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  realmId: string;
  realmName: string;
  isOwner: boolean;
}

function buildInviteLink(token: string): string {
  if (typeof window === "undefined") return "";
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${window.location.origin}${base}/invite/${token}`;
}

export function ShareDialog({
  open,
  onOpenChange,
  realmId,
  realmName,
  isOwner,
}: ShareDialogProps) {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { data: collaborators, isLoading } = useListCollaborators(realmId, {
    query: { enabled: open, queryKey: getListCollaboratorsQueryKey(realmId) },
  });
  const invite = useInviteCollaborator();
  const updateRole = useUpdateCollaborator();
  const remove = useRemoveCollaborator();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("viewer");
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: getListCollaboratorsQueryKey(realmId),
    });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) return;
    invite.mutate(
      { realmId, data: { email: email.trim(), role } },
      {
        onSuccess: () => {
          setEmail("");
          refresh();
        },
        onError: (err) =>
          setError(err instanceof Error ? err.message : "Failed to invite"),
      },
    );
  };

  const handleCopy = async (token: string) => {
    const link = buildInviteLink(token);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(token);
      setTimeout(() => setCopied((c) => (c === token ? null : c)), 1600);
    } catch {
      setCopied(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share “{realmName}”</DialogTitle>
          <DialogDescription>
            {isOwner
              ? "Invite collaborators by email. They’ll get a link to join this realm."
              : "Members of this realm. Only the owner can change roles."}
          </DialogDescription>
        </DialogHeader>

        {isOwner && (
          <form onSubmit={handleInvite} className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Input
                type="email"
                required
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1"
              />
              <Select value={role} onValueChange={(v) => setRole(v as "editor" | "viewer")}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" disabled={invite.isPending}>
                {invite.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Invite"
                )}
              </Button>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </form>
        )}

        <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-border/50 divide-y divide-border/40">
          {isLoading && (
            <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
            </div>
          )}
          {!isLoading && collaborators?.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground italic">
              No collaborators yet.
            </div>
          )}
          {collaborators?.map((c) => (
            <CollaboratorRow
              key={c.id}
              c={c}
              isOwner={isOwner}
              isMe={!!user && c.userId === user.id}
              onCopy={handleCopy}
              copied={copied === c.inviteToken}
              onChangeRole={(newRole) =>
                updateRole.mutate(
                  { realmId, collaboratorId: c.id, data: { role: newRole } },
                  { onSuccess: refresh },
                )
              }
              onRemove={() =>
                remove.mutate(
                  { realmId, collaboratorId: c.id },
                  { onSuccess: refresh },
                )
              }
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CollaboratorRow({
  c,
  isOwner,
  isMe,
  onCopy,
  copied,
  onChangeRole,
  onRemove,
}: {
  c: Collaborator;
  isOwner: boolean;
  isMe: boolean;
  onCopy: (token: string) => void;
  copied: boolean;
  onChangeRole: (role: "editor" | "viewer") => void;
  onRemove: () => void;
}) {
  const pending = !c.acceptedAt;
  const label = c.invitedEmail || (c.userId ? `user ${c.userId.slice(0, 8)}…` : "—");
  const RoleIcon = c.role === "viewer" ? Eye : Pencil;

  return (
    <div className="flex items-center gap-2 p-3 text-sm">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 truncate">
          <span className="truncate">{label}</span>
          {isMe && <span className="text-[10px] text-muted-foreground">(you)</span>}
          {pending && (
            <span className="text-[10px] uppercase tracking-wide text-amber-400/80 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded-sm">
              pending
            </span>
          )}
        </div>
      </div>

      {pending && c.inviteToken && isOwner && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => onCopy(c.inviteToken!)}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" /> Copied
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 mr-1" /> Copy link
            </>
          )}
        </Button>
      )}

      {isOwner ? (
        <Select
          value={c.role}
          onValueChange={(v) => onChangeRole(v as "editor" | "viewer")}
        >
          <SelectTrigger className="h-7 w-24 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="viewer">Viewer</SelectItem>
            <SelectItem value="editor">Editor</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <RoleIcon className="w-3 h-3" />
          {c.role}
        </span>
      )}

      {isOwner && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          aria-label="Remove collaborator"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
}
