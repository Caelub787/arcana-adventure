import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { User, LogOut, Edit2, Users } from "lucide-react";
import { api, type UserProfile } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [friendsPanelOpen, setFriendsPanelOpen] = useState(false);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [newAvatarBase64, setNewAvatarBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["/api/profile"],
    queryFn: () => api.getProfile(),
    enabled: !!user,
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

  const handleEditOpen = () => {
    if (profile) {
      setName(profile.name || "");
      setBio(profile.bio || "");
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
      if (name !== profile?.name || bio !== profile?.bio) {
        await updateProfileMutation.mutateAsync({ name, bio });
      }
      if (newAvatarBase64) {
        await updateAvatarMutation.mutateAsync(newAvatarBase64);
      }
      setEditDialogOpen(false);
    } catch (error) {
      console.error("Failed to update profile:", error);
    }
  };

  const isSaving =
    updateProfileMutation.isPending || updateAvatarMutation.isPending;

  const displayName = profile?.name || user?.username || "User";
  const avatarUrl = profile?.avatarUrl;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="relative h-10 w-10 rounded-full p-0 hover:ring-2 hover:ring-amber-500/50 transition-all"
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
                {displayName}
              </p>
              <p
                className="text-xs text-stone-500"
                data-testid="text-profile-username"
              >
                @{user?.username || "unknown"}
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
                  {name.charAt(0).toUpperCase() || "U"}
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
              <Label htmlFor="name" className="text-stone-400">
                Display Name
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border-stone-700 bg-stone-900 text-stone-200 focus:ring-amber-500"
                placeholder="Enter your display name"
                data-testid="input-profile-name"
              />
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
