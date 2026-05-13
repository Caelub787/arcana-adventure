import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { User, LogOut, Edit2, Users, ShieldCheck, Cloud, Check, AlertCircle, Loader2 } from "lucide-react";
import { api, type UserProfile } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import FriendsPanel from "@/components/FriendsPanel";

interface ProfileDropdownProps {
  onLogout: () => void;
}

export default function ProfileDropdown({ onLogout }: ProfileDropdownProps) {
  const [, setLocation] = useLocation();
  const { user, refetchUser, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [friendsPanelOpen, setFriendsPanelOpen] = useState(false);
  const [bio, setBio] = useState("");
  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [newAvatarBase64, setNewAvatarBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["/api/profile"],
    queryFn: () => api.getProfile(),
    enabled: !!user,
  });

  const { data: googleStatus, isLoading: googleStatusLoading } = useQuery<{ connected: boolean; email?: string }>({
    queryKey: ["/api/google/status"],
    queryFn: () => api.getGoogleStatus(),
    enabled: editDialogOpen,
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { name?: string; bio?: string }) =>
      api.updateProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
    },
  });

  const updateAvatarMutation = useMutation({
    mutationFn: async (avatarUrl: string) => api.updateAvatar(avatarUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
    },
  });

  const updateUsernameMutation = useMutation({
    mutationFn: async (newUsername: string) => api.updateUsername(newUsername),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      refetchUser();
    },
  });

  const handleEditOpen = () => {
    if (profile) {
      setBio(profile.bio || "");
      setUsername(profile.username || "");
      setUsernameError(null);
      setAvatarPreview(profile.avatarUrl || null);
      setNewAvatarBase64(null);
    }
    setEditDialogOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setAvatarPreview(base64);
        setNewAvatarBase64(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    try {
      setUsernameError(null);
      
      if (bio !== profile?.bio) {
        await updateProfileMutation.mutateAsync({ bio });
      }
      if (newAvatarBase64) {
        await updateAvatarMutation.mutateAsync(newAvatarBase64);
      }
      if (username !== profile?.username) {
        try {
          await updateUsernameMutation.mutateAsync(username);
          toast({
            title: "Username Updated",
            description: `Your username is now "${username}"`,
          });
        } catch (err: any) {
          const errorMessage = err?.message || "Failed to update username";
          setUsernameError(errorMessage);
          toast({
            title: "Username Update Failed",
            description: errorMessage,
            variant: "destructive",
          });
          return;
        }
      }
      setEditDialogOpen(false);
    } catch (error) {
      console.error("Failed to update profile:", error);
    }
  };

  const isSaving =
    updateProfileMutation.isPending || updateAvatarMutation.isPending || updateUsernameMutation.isPending;

  const displayName = user?.username || "User";
  const avatarUrl = profile?.avatarUrl;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="relative h-12 w-12 rounded-full p-0 flex items-center justify-center hover:ring-2 hover:ring-amber-500/50 transition-all"
            data-testid="button-profile-dropdown"
          >
            <Avatar className="h-10 w-10 border-2 border-stone-700">
              {avatarUrl ? (
                <AvatarImage src={avatarUrl} alt={displayName} />
              ) : null}
              <AvatarFallback className="bg-stone-800 text-amber-500">
                {displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-56 border-stone-800 bg-stone-950 text-stone-200"
          align="end"
        >
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p
                className="text-sm font-medium text-amber-500"
                data-testid="text-profile-name"
              >
                @{user?.username || "User"}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-stone-800" />
          <DropdownMenuItem
            onClick={handleEditOpen}
            className="cursor-pointer hover:bg-stone-800 focus:bg-stone-800"
            data-testid="menu-item-edit-profile"
          >
            <Edit2 className="mr-2 h-4 w-4 text-stone-400" />
            <span>Edit Profile</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setFriendsPanelOpen(true)}
            className="cursor-pointer hover:bg-stone-800 focus:bg-stone-800"
            data-testid="menu-item-friends"
          >
            <Users className="mr-2 h-4 w-4 text-stone-400" />
            <span>Friends</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setLocation('/account')}
            className="cursor-pointer hover:bg-stone-800 focus:bg-stone-800"
            data-testid="menu-item-account"
          >
            <Edit2 className="mr-2 h-4 w-4 text-stone-400" />
            <span>Connected Apps</span>
          </DropdownMenuItem>
          {isAdmin && (
            <>
              <DropdownMenuSeparator className="bg-stone-800" />
              <DropdownMenuItem
                onClick={() => setLocation('/admin/security')}
                className="cursor-pointer hover:bg-stone-800 focus:bg-stone-800 text-red-400"
                data-testid="menu-item-site-security"
              >
                <ShieldCheck className="mr-2 h-4 w-4" />
                <span>Site Security</span>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator className="bg-stone-800" />
          <DropdownMenuItem
            onClick={onLogout}
            className="cursor-pointer text-red-400 hover:bg-red-950/30 focus:bg-red-950/30 hover:text-red-400 focus:text-red-400"
            data-testid="menu-item-logout"
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>Logout</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent
          className="border-stone-800 bg-stone-950 text-stone-200 sm:max-w-md"
          data-testid="dialog-edit-profile"
        >
          <DialogHeader>
            <DialogTitle className="text-amber-500">Edit Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-4">
              <Avatar className="h-24 w-24 border-2 border-stone-700">
                {avatarPreview ? (
                  <AvatarImage src={avatarPreview} alt="Avatar preview" />
                ) : null}
                <AvatarFallback className="bg-stone-800 text-amber-500 text-2xl">
                  {(user?.username || "U").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
                data-testid="input-avatar-file"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="border-stone-700 bg-stone-900 text-stone-300 hover:bg-stone-800 hover:text-amber-500"
                data-testid="button-upload-avatar"
              >
                Upload Avatar
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="username" className="text-stone-400">
                Username
              </Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setUsernameError(null);
                }}
                className={`border-stone-700 bg-stone-900 text-stone-200 focus:ring-amber-500 ${usernameError ? 'border-red-500' : ''}`}
                placeholder="Enter a unique username (3-30 characters)"
                data-testid="input-profile-username"
              />
              {usernameError && (
                <p className="text-sm text-red-400">{usernameError}</p>
              )}
              <p className="text-xs text-stone-500">
                Letters, numbers, and underscores only. 3-30 characters.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bio" className="text-stone-400">
                Bio
              </Label>
              <Textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="border-stone-700 bg-stone-900 text-stone-200 focus:ring-amber-500 min-h-[100px]"
                placeholder="Tell others about yourself..."
                data-testid="input-profile-bio"
              />
            </div>
            
            <div className="space-y-3 pt-2">
              <Label className="text-stone-400">Connected Services</Label>
              <div 
                className="flex items-center justify-between p-3 rounded-lg border border-stone-700 bg-stone-900"
                data-testid="google-drive-connection"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-stone-800">
                    <Cloud className="h-5 w-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="font-medium text-stone-200">Google Docs</p>
                    {googleStatusLoading ? (
                      <div className="flex items-center gap-1.5 text-sm text-stone-500">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Checking connection...</span>
                      </div>
                    ) : googleStatus?.connected ? (
                      <p className="text-sm text-stone-400" data-testid="text-drive-email">
                        {googleStatus.email || "Connected"}
                      </p>
                    ) : (
                      <p className="text-sm text-stone-500">Not connected</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {googleStatusLoading ? null : googleStatus?.connected ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-400 border-red-800 hover:bg-red-900/30"
                      data-testid="button-disconnect-google"
                      onClick={async () => {
                        try {
                          await api.disconnectGoogle();
                          queryClient.invalidateQueries({ queryKey: ["/api/google/status"] });
                          toast({ title: "Google account disconnected" });
                        } catch (e) {
                          toast({ title: "Failed to disconnect", variant: "destructive" });
                        }
                      }}
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-amber-400 border-amber-800 hover:bg-amber-900/30"
                      data-testid="button-connect-google"
                      onClick={async () => {
                        try {
                          const { url } = await api.getGoogleAuthUrl();
                          window.location.href = url;
                        } catch (e) {
                          toast({ title: "Failed to start Google connection", variant: "destructive" });
                        }
                      }}
                    >
                      Connect
                    </Button>
                  )}
                </div>
              </div>
              {!googleStatus?.connected && !googleStatusLoading && (
                <p className="text-xs text-stone-500">
                  Connect your Google account to import and export notes with Google Docs.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              className="border-stone-700 text-stone-400 hover:bg-stone-800"
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-amber-600 text-stone-950 hover:bg-amber-500"
              data-testid="button-save-profile"
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FriendsPanel open={friendsPanelOpen} onOpenChange={setFriendsPanelOpen} />
    </>
  );
}
