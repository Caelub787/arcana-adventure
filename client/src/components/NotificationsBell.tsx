import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, X, Trash2, CheckCheck, Loader2 } from "lucide-react";
import {
  api,
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  type UserNotification,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function NotificationsBell() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["/api/notifications/count"],
    queryFn: getUnreadNotificationCount,
    refetchInterval: 30000,
  });

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["/api/notifications"],
    queryFn: getNotifications,
    enabled: isOpen,
  });

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/count"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/count"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteNotification,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/count"] });
    },
  });

  const acceptFriendMutation = useMutation({
    mutationFn: (requestId: string) => api.acceptFriendRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests/incoming"] });
    },
  });

  const declineFriendMutation = useMutation({
    mutationFn: (requestId: string) => api.declineFriendRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests/incoming"] });
    },
  });

  const handleAcceptFriend = (referenceId: string | null) => {
    if (referenceId) {
      acceptFriendMutation.mutate(referenceId);
    }
  };

  const handleDeclineFriend = (referenceId: string | null) => {
    if (referenceId) {
      declineFriendMutation.mutate(referenceId);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-stone-400 hover:text-amber-500 hover:bg-stone-800"
          data-testid="button-notifications-bell"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-xs font-medium text-stone-950"
              data-testid="badge-notification-count"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 border-stone-700 bg-stone-900"
        align="end"
        data-testid="popover-notifications"
      >
        <div className="flex items-center justify-between border-b border-stone-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-amber-500">Notifications</h3>
          {notifications.some((n) => !n.isRead) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              className="h-7 text-xs text-stone-400 hover:text-amber-500 hover:bg-stone-800"
              data-testid="button-mark-all-read"
            >
              {markAllReadMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  <CheckCheck className="h-3 w-3 mr-1" />
                  Mark All Read
                </>
              )}
            </Button>
          )}
        </div>
        <ScrollArea className="h-80">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-stone-500" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-8 text-center text-stone-500">
              <Bell className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No notifications</p>
            </div>
          ) : (
            <div className="divide-y divide-stone-800">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-3 ${
                    notification.isRead ? "bg-stone-900/50" : "bg-stone-800/50"
                  }`}
                  data-testid={`notification-item-${notification.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm font-medium truncate ${
                          notification.isRead ? "text-stone-400" : "text-stone-200"
                        }`}
                      >
                        {notification.title}
                      </p>
                      {notification.message && (
                        <p className="text-xs text-stone-500 mt-1 line-clamp-2">
                          {notification.message}
                        </p>
                      )}
                      <p className="text-xs text-stone-600 mt-1">
                        {formatTimeAgo(notification.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!notification.isRead && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => markReadMutation.mutate(notification.id)}
                          disabled={markReadMutation.isPending}
                          className="h-6 w-6 text-stone-500 hover:text-green-400 hover:bg-green-950/30"
                          title="Mark as read"
                          data-testid={`button-mark-read-${notification.id}`}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(notification.id)}
                        disabled={deleteMutation.isPending}
                        className="h-6 w-6 text-stone-500 hover:text-red-400 hover:bg-red-950/30"
                        title="Delete"
                        data-testid={`button-delete-notification-${notification.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {notification.type === "friend_request" && notification.referenceId && (
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        onClick={() => handleAcceptFriend(notification.referenceId)}
                        disabled={acceptFriendMutation.isPending || declineFriendMutation.isPending}
                        className="flex-1 h-7 bg-green-700 text-stone-100 hover:bg-green-600 text-xs"
                        data-testid={`button-accept-friend-${notification.id}`}
                      >
                        {acceptFriendMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <Check className="h-3 w-3 mr-1" />
                            Accept
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeclineFriend(notification.referenceId)}
                        disabled={acceptFriendMutation.isPending || declineFriendMutation.isPending}
                        className="flex-1 h-7 border-stone-700 text-stone-400 hover:text-red-400 hover:bg-red-950/30 text-xs"
                        data-testid={`button-decline-friend-${notification.id}`}
                      >
                        {declineFriendMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <X className="h-3 w-3 mr-1" />
                            Decline
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
