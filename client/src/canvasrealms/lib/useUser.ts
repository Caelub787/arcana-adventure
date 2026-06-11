import { useQuery } from "@tanstack/react-query";

export interface CRUser {
  id: string;
  username: string;
  fullName: string;
  imageUrl: string;
  primaryEmailAddress: { emailAddress: string };
  unsafeMetadata: Record<string, unknown>;
  update?: (data: { unsafeMetadata?: Record<string, unknown> }) => Promise<void>;
}

interface HostMeResponse {
  user: {
    id: string;
    email: string;
    username: string | null;
    name: string | null;
    isAdmin: boolean;
  };
}

async function fetchMe(): Promise<HostMeResponse["user"] | null> {
  const res = await fetch("/api/me", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (res.status === 401 || res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Failed to load current user (${res.status})`);
  }
  const data = (await res.json()) as HostMeResponse;
  return data.user ?? null;
}

function toCRUser(hostUser: HostMeResponse["user"]): CRUser {
  return {
    id: hostUser.id,
    username: hostUser.username ?? "",
    fullName: hostUser.name ?? "",
    imageUrl: "",
    primaryEmailAddress: { emailAddress: hostUser.email },
    unsafeMetadata: {},
    update: async () => {
      // TODO host displayName: host has no editable user metadata endpoint.
    },
  };
}

export function useUser(): {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: CRUser | null;
} {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["cr-me"],
    queryFn: fetchMe,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const isLoaded = !isLoading;
  const user = data && !isError ? toCRUser(data) : null;

  return {
    isLoaded,
    isSignedIn: !!user,
    user,
  };
}

export function useAuth(): {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
} {
  const { isLoaded, isSignedIn, user } = useUser();
  return {
    isLoaded,
    isSignedIn,
    userId: user?.id ?? null,
  };
}
