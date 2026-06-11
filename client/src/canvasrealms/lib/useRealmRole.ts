import { useUser } from "@cr/lib/useUser";
import {
  useGetRealm,
  useListCollaborators,
  getGetRealmQueryKey,
  getListCollaboratorsQueryKey,
} from "@workspace/api-client-react";

export type RealmRole = "owner" | "editor" | "viewer";

export interface RealmRoleInfo {
  role: RealmRole | null;
  isOwner: boolean;
  isEditor: boolean; // owner or editor
  isViewer: boolean; // viewer only
  canEdit: boolean; // alias for isEditor
  isLoading: boolean;
}

/**
 * Resolves the current user's role on the given realm by combining the
 * realm's owner_user_id with the collaborators list (which is viewer-readable).
 *
 * Returns null role until both queries have loaded; null also means the user
 * has no access (which shouldn't happen in practice — the API would 403 first).
 */
export function useRealmRole(realmId: string | null | undefined): RealmRoleInfo {
  const { user, isLoaded: userLoaded } = useUser();
  const enabled = !!realmId && userLoaded;

  const { data: realm, isLoading: realmLoading } = useGetRealm(
    realmId || "",
    {
      query: {
        enabled,
        queryKey: getGetRealmQueryKey(realmId || ""),
      },
    },
  );
  const { data: collaborators, isLoading: collabsLoading } =
    useListCollaborators(realmId || "", {
      query: {
        enabled,
        queryKey: getListCollaboratorsQueryKey(realmId || ""),
      },
    });

  const isLoading = !userLoaded || realmLoading || collabsLoading;

  let role: RealmRole | null = null;
  if (realm && user) {
    if (realm.ownerUserId === user.id) {
      role = "owner";
    } else if (collaborators) {
      const mine = collaborators.find((c) => c.userId === user.id);
      if (mine) role = mine.role as RealmRole;
    }
  }

  const isOwner = role === "owner";
  const isEditor = role === "owner" || role === "editor";
  const isViewer = role === "viewer";

  return { role, isOwner, isEditor, isViewer, canEdit: isEditor, isLoading };
}
