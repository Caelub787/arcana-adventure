import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  UserPlus,
  UserMinus,
  Check,
  X,
  Loader2,
  Users,
  Mail,
  Clock,
} from "lucide-react";
import {
  api,
  globalWs,
  type UserProfile,
  type FriendRequestWithUser,
} from "@/lib/api";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface FriendsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function FriendsPanel({ open, onOpenChange }: FriendsPanelProps) {
  const queryClient = useQueryClient();
  const [searchUsername, setSearchUsername] = useState("");
  const [searchResult, setSearchResult] = useState<UserProfile | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [requestMessage, setRequestMessage] = useState("");
  const [removeFriendId, setRemoveFriendId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const unsub = globalWs.onMessage((data) => {
      if (data.type === 'friend_request_received' || data.type === 'friend_request_accepted' || data.type === 'friend_request_declined' || data.type === 'friend_request_cancelled' || data.type === 'friends_updated') {
        queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
        queryClient.invalidateQueries({ queryKey: ["/api/friends/requests/incoming"] });
        queryClient.invalidateQueries({ queryKey: ["/api/friends/requests/outgoing"] });
      }
    });
    return () => { unsub(); };
  }, [queryClient]);

  const { data: friends = [], isLoading: friendsLoading } = useQuery<UserProfile[]>({
    queryKey: ["/api/friends"],
    queryFn: () => api.getFriends(),
    enabled: open,
  });

  const { data: incomingRequests = [], isLoading: incomingLoading } = useQuery<
    FriendRequestWithUser[]
  >({
    queryKey: ["/api/friends/requests/incoming"],
    queryFn: () => api.getIncomingFriendRequests(),
    enabled: open,
  });

  const { data: outgoingRequests = [], isLoading: outgoingLoading } = useQuery<
    FriendRequestWithUser[]
  >({
    queryKey: ["/api/friends/requests/outgoing"],
    queryFn: () => api.getOutgoingFriendRequests(),
    enabled: open,
  });

  const sendRequestMutation = useMutation({
    mutationFn: ({ username, message }: { username: string; message?: string }) =>
      api.sendFriendRequest(username, message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests/outgoing"] });
      setSearchResult(null);
      setSearchUsername("");
      setRequestMessage("");
    },
  });

  const acceptRequestMutation = useMutation({
    mutationFn: (requestId: string) => api.acceptFriendRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests/incoming"] });
    },
  });

  const declineRequestMutation = useMutation({
    mutationFn: (requestId: string) => api.declineFriendRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests/incoming"] });
    },
  });

  const cancelRequestMutation = useMutation({
    mutationFn: (requestId: string) => api.cancelFriendRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests/outgoing"] });
    },
  });

  const removeFriendMutation = useMutation({
    mutationFn: (friendId: string) => api.removeFriend(friendId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      setRemoveFriendId(null);
    },
  });

  const handleSearch = async () => {
    if (!searchUsername.trim()) return;

    setIsSearching(true);
    setSearchError(null);
    setSearchResult(null);

    try {
      const user = await api.searchUserByUsername(searchUsername.trim());
      setSearchResult(user);
    } catch (error: any) {
      setSearchError(error.message || "User not found");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendRequest = () => {
    if (searchResult) {
      sendRequestMutation.mutate({
        username: searchResult.username,
        message: requestMessage || undefined,
      });
    }
  };

  const requestCount = incomingRequests.length;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md border-stone-800 bg-stone-950 text-stone-200"
          data-testid="sheet-friends-panel"
        >
          <SheetHeader>
            <SheetTitle className="text-amber-500 flex items-center gap-2">
              <Users className="h-5 w-5" />
              Friends
            </SheetTitle>
          </SheetHeader>

          <Tabs defaultValue="friends" className="mt-6">
            <TabsList className="w-full bg-stone-900 border border-stone-800">
              <TabsTrigger
                value="friends"
                className="flex-1 data-[state=active]:bg-stone-800 data-[state=active]:text-amber-500"
                data-testid="tab-friends"
              >
                Friends
              </TabsTrigger>
              <TabsTrigger
                value="requests"
                className="flex-1 data-[state=active]:bg-stone-800 data-[state=active]:text-amber-500 relative"
                data-testid="tab-requests"
              >
                Requests
                {requestCount > 0 && (
                  <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-xs text-stone-950">
                    {requestCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="search"
                className="flex-1 data-[state=active]:bg-stone-800 data-[state=active]:text-amber-500"
                data-testid="tab-search"
              >
                Search
              </TabsTrigger>
            </TabsList>

            <TabsContent value="friends" className="mt-4 space-y-3">
              {friendsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-stone-500" />
                </div>
              ) : friends.length === 0 ? (
                <div className="py-8 text-center text-stone-500">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No friends yet</p>
                  <p className="text-sm">Search for users to add friends</p>
                </div>
              ) : (
                friends.map((friend) => (
                  <div
                    key={friend.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-stone-900 border border-stone-800"
                    data-testid={`friend-card-${friend.id}`}
                  >
                    <Avatar className="h-10 w-10 border border-stone-700">
                      {friend.avatarUrl ? (
                        <AvatarImage src={friend.avatarUrl} alt={friend.name} />
                      ) : null}
                      <AvatarFallback className="bg-stone-800 text-amber-500">
                        {friend.name?.charAt(0).toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-200 truncate">
                        {friend.name || friend.username}
                      </p>
                      <p className="text-xs text-stone-500 truncate">
                        @{friend.username}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setRemoveFriendId(friend.id)}
                      className="text-stone-500 hover:text-red-400 hover:bg-red-950/30"
                      data-testid={`button-remove-friend-${friend.id}`}
                    >
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="requests" className="mt-4 space-y-4">
              {incomingRequests.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-stone-400 flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Incoming Requests
                  </h3>
                  {incomingRequests.map((request) => (
                    <div
                      key={request.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-stone-900 border border-stone-800"
                      data-testid={`incoming-request-${request.id}`}
                    >
                      <Avatar className="h-10 w-10 border border-stone-700">
                        {request.sender?.avatarUrl ? (
                          <AvatarImage
                            src={request.sender.avatarUrl}
                            alt={request.sender.name}
                          />
                        ) : null}
                        <AvatarFallback className="bg-stone-800 text-amber-500">
                          {request.sender?.name?.charAt(0).toUpperCase() || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-200 truncate">
                          {request.sender?.name || request.sender?.username}
                        </p>
                        <p className="text-xs text-stone-500 truncate">
                          @{request.sender?.username}
                        </p>
                        {request.message && (
                          <p className="text-xs text-stone-400 mt-1 italic truncate">
                            "{request.message}"
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => acceptRequestMutation.mutate(request.id)}
                          disabled={acceptRequestMutation.isPending}
                          className="text-green-500 hover:text-green-400 hover:bg-green-950/30"
                          data-testid={`button-accept-request-${request.id}`}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => declineRequestMutation.mutate(request.id)}
                          disabled={declineRequestMutation.isPending}
                          className="text-red-500 hover:text-red-400 hover:bg-red-950/30"
                          data-testid={`button-decline-request-${request.id}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {outgoingRequests.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-stone-400 flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Pending Requests
                  </h3>
                  {outgoingRequests.map((request) => (
                    <div
                      key={request.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-stone-900 border border-stone-800"
                      data-testid={`outgoing-request-${request.id}`}
                    >
                      <Avatar className="h-10 w-10 border border-stone-700">
                        {request.recipient?.avatarUrl ? (
                          <AvatarImage
                            src={request.recipient.avatarUrl}
                            alt={request.recipient.name}
                          />
                        ) : null}
                        <AvatarFallback className="bg-stone-800 text-amber-500">
                          {request.recipient?.name?.charAt(0).toUpperCase() || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-200 truncate">
                          {request.recipient?.name || request.recipient?.username}
                        </p>
                        <p className="text-xs text-stone-500 truncate">
                          @{request.recipient?.username}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => cancelRequestMutation.mutate(request.id)}
                        disabled={cancelRequestMutation.isPending}
                        className="text-stone-500 hover:text-red-400 hover:bg-red-950/30"
                        data-testid={`button-cancel-request-${request.id}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {incomingRequests.length === 0 && outgoingRequests.length === 0 && (
                <div className="py-8 text-center text-stone-500">
                  <Mail className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No pending requests</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="search" className="mt-4 space-y-4">
              <div className="flex gap-2">
                <Input
                  value={searchUsername}
                  onChange={(e) => setSearchUsername(e.target.value)}
                  placeholder="Enter exact username"
                  className="border-stone-700 bg-stone-900 text-stone-200 focus:ring-amber-500"
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  data-testid="input-search-username"
                />
                <Button
                  onClick={handleSearch}
                  disabled={isSearching || !searchUsername.trim()}
                  className="bg-amber-600 text-stone-950 hover:bg-amber-500"
                  data-testid="button-search-user"
                >
                  {isSearching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {searchError && (
                <div className="p-3 rounded-lg bg-red-950/30 border border-red-900/50 text-red-400 text-sm">
                  {searchError}
                </div>
              )}

              {searchResult && (
                <div className="p-4 rounded-lg bg-stone-900 border border-stone-800 space-y-3">
                  <div
                    className="flex items-center gap-3"
                    data-testid="search-result"
                  >
                    <Avatar className="h-12 w-12 border border-stone-700">
                      {searchResult.avatarUrl ? (
                        <AvatarImage
                          src={searchResult.avatarUrl}
                          alt={searchResult.name}
                        />
                      ) : null}
                      <AvatarFallback className="bg-stone-800 text-amber-500">
                        {searchResult.name?.charAt(0).toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-stone-200">
                        {searchResult.name || searchResult.username}
                      </p>
                      <p className="text-sm text-stone-500">
                        @{searchResult.username}
                      </p>
                      {searchResult.bio && (
                        <p className="text-xs text-stone-400 mt-1 line-clamp-2">
                          {searchResult.bio}
                        </p>
                      )}
                    </div>
                  </div>
                  <Textarea
                    value={requestMessage}
                    onChange={(e) => setRequestMessage(e.target.value)}
                    placeholder="Add a message (optional)"
                    className="border-stone-700 bg-stone-800 text-stone-200 focus:ring-amber-500 text-sm"
                    rows={2}
                    data-testid="input-request-message"
                  />
                  <Button
                    onClick={handleSendRequest}
                    disabled={sendRequestMutation.isPending}
                    className="w-full bg-amber-600 text-stone-950 hover:bg-amber-500"
                    data-testid="button-send-request"
                  >
                    {sendRequestMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <UserPlus className="h-4 w-4 mr-2" />
                    )}
                    Send Friend Request
                  </Button>
                </div>
              )}

              {!searchResult && !searchError && (
                <div className="py-8 text-center text-stone-500">
                  <Search className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Search for a user by their exact username</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={!!removeFriendId}
        onOpenChange={(open) => !open && setRemoveFriendId(null)}
      >
        <AlertDialogContent className="border-stone-800 bg-stone-950 text-stone-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-amber-500">
              Remove Friend
            </AlertDialogTitle>
            <AlertDialogDescription className="text-stone-400">
              Are you sure you want to remove this friend? You will need to send
              a new friend request to add them again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-stone-700 text-stone-400 hover:bg-stone-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeFriendId && removeFriendMutation.mutate(removeFriendId)}
              className="bg-red-600 text-white hover:bg-red-500"
              data-testid="button-confirm-remove-friend"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
