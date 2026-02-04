import { useState, useMemo, useEffect } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type AdminUser, type UserActivity, type TermsAndConditions } from '@/lib/api';
import { getTerms, updateTerms } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from '@/hooks/use-toast';
import { Search, Shield, ShieldOff, Users, Clock, User, MapPin, FileText, Eye, Ban, ShieldCheck, X, Calendar, ExternalLink, Radio, Bell, Send, ChevronDown, ChevronRight, Trash2, Mail, ArrowLeft } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

type BanDuration = 'permanent' | '1day' | '1week' | '1month' | 'custom';

function getTimeRemaining(expiresAt: string): string {
  const now = new Date().getTime();
  const expiry = new Date(expiresAt).getTime();
  const diff = expiry - now;

  if (diff <= 0) return 'Expired';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

function BanCountdown({ expiresAt }: { expiresAt: string }) {
  const [timeRemaining, setTimeRemaining] = useState(getTimeRemaining(expiresAt));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining(getTimeRemaining(expiresAt));
    }, 60000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return (
    <div className="flex items-center gap-1 text-amber-400">
      <Clock className="h-3 w-3" />
      <span className="text-xs">{timeRemaining}</span>
    </div>
  );
}

function UserAvatar({ user }: { user: AdminUser }) {
  return (
    <Avatar className="h-10 w-10 border border-stone-600">
      <AvatarImage src={user.avatarUrl || undefined} alt={user.username} />
      <AvatarFallback className="bg-stone-700 text-amber-400">
        {user.username.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

export default function SiteSecurity() {
  const [, setLocation] = useLocation();
  const { user: currentUser, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const [mainTab, setMainTab] = useState<'users' | 'notifications' | 'terms'>('users');
  const [activeTab, setActiveTab] = useState<'all' | 'banned'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [showBanDialog, setShowBanDialog] = useState(false);
  const [editingBan, setEditingBan] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState<BanDuration>('permanent');
  const [customBanDate, setCustomBanDate] = useState('');
  const [userToBan, setUserToBan] = useState<AdminUser | null>(null);
  const [showBroadcastDialog, setShowBroadcastDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);

  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifPatchNotes, setNotifPatchNotes] = useState('');
  const [showPatchNotes, setShowPatchNotes] = useState(false);

  const [termsContent, setTermsContent] = useState('');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.getAllUsers(),
    enabled: isAdmin,
  });

  const { data: userActivity, isLoading: activityLoading } = useQuery({
    queryKey: ['user-activity', selectedUser?.id],
    queryFn: () => api.getUserActivity(selectedUser!.id),
    enabled: !!selectedUser,
  });

  interface AdminNotification {
    id: string;
    title: string;
    message: string;
    patchNotes: string | null;
    createdBy: string;
    createdAt: string;
  }

  const { data: notifications = [], isLoading: notificationsLoading } = useQuery<AdminNotification[]>({
    queryKey: ['/api/admin/notifications'],
    queryFn: async () => {
      const res = await fetch('/api/admin/notifications', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch notifications');
      return res.json();
    },
    enabled: isAdmin && mainTab === 'notifications',
  });

  const { data: terms, isLoading: termsLoading } = useQuery<TermsAndConditions | null>({
    queryKey: ['terms'],
    queryFn: () => getTerms(),
    enabled: isAdmin && mainTab === 'terms',
  });

  useEffect(() => {
    if (terms?.content && !termsContent) {
      setTermsContent(terms.content);
    }
  }, [terms]);

  const banMutation = useMutation({
    mutationFn: ({ userId, reason, expiresAt }: { userId: string; reason?: string; expiresAt?: string }) =>
      api.banUser(userId, reason, expiresAt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setShowBanDialog(false);
      setUserToBan(null);
      resetBanForm();
      toast({ title: 'User Banned', description: 'The user has been banned successfully.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const unbanMutation = useMutation({
    mutationFn: (userId: string) => api.unbanUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'User Unbanned', description: 'The user has been unbanned successfully.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateBanMutation = useMutation({
    mutationFn: ({ userId, reason, expiresAt }: { userId: string; reason?: string; expiresAt?: string | null }) =>
      api.updateBan(userId, reason, expiresAt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setShowBanDialog(false);
      setEditingBan(false);
      setUserToBan(null);
      resetBanForm();
      toast({ title: 'Ban Updated', description: 'The ban has been updated successfully.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const setAdminMutation = useMutation({
    mutationFn: ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) =>
      api.setUserAdmin(userId, isAdmin),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({
        title: variables.isAdmin ? 'Admin Granted' : 'Admin Revoked',
        description: `User admin status has been ${variables.isAdmin ? 'granted' : 'revoked'}.`,
      });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => api.deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setShowDeleteDialog(false);
      setUserToDelete(null);
      setSelectedUser(null);
      toast({ title: 'Account Deleted', description: 'The user account has been permanently deleted.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const sendPasswordResetMutation = useMutation({
    mutationFn: (userId: string) => api.sendPasswordResetEmail(userId),
    onSuccess: () => {
      toast({ title: 'Email Sent', description: 'Password reset email has been sent to the user.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const broadcastUpdateMutation = useMutation({
    mutationFn: () => api.broadcastSiteUpdate(),
    onSuccess: () => {
      setShowBroadcastDialog(false);
      toast({
        title: 'Update Broadcast Sent',
        description: 'All connected users have been notified to refresh the app.',
      });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const sendNotificationMutation = useMutation({
    mutationFn: async (data: { title: string; message: string; patchNotes?: string }) => {
      const res = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to send notification');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/notifications'] });
      setNotifTitle('');
      setNotifMessage('');
      setNotifPatchNotes('');
      setShowPatchNotes(false);
      toast({ title: 'Notification Sent', description: 'Notification has been broadcast to all active users' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to send notification', variant: 'destructive' });
    },
  });

  const updateTermsMutation = useMutation({
    mutationFn: (content: string) => updateTerms(content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terms'] });
      toast({ title: 'Terms Updated', description: 'New terms version created. All users will need to re-accept.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update terms', variant: 'destructive' });
    },
  });

  const resetBanForm = () => {
    setBanReason('');
    setBanDuration('permanent');
    setCustomBanDate('');
  };

  const isBanned = (user: AdminUser) => {
    if (!user.bannedAt) return false;
    if (!user.banExpiresAt) return true;
    return new Date(user.banExpiresAt) > new Date();
  };

  const filteredUsers = useMemo(() => {
    let filtered = users;

    if (activeTab === 'banned') {
      filtered = filtered.filter(isBanned);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (u) =>
          u.username.toLowerCase().includes(query) ||
          u.name.toLowerCase().includes(query) ||
          u.email.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [users, activeTab, searchQuery]);

  const handleBanClick = (user: AdminUser) => {
    setUserToBan(user);
    setEditingBan(false);
    resetBanForm();
    setShowBanDialog(true);
  };

  const handleEditBanClick = (user: AdminUser) => {
    setUserToBan(user);
    setEditingBan(true);
    setBanReason(user.banReason || '');
    if (user.banExpiresAt) {
      setBanDuration('custom');
      setCustomBanDate(new Date(user.banExpiresAt).toISOString().split('T')[0]);
    } else {
      setBanDuration('permanent');
    }
    setShowBanDialog(true);
  };

  const handleBanSubmit = () => {
    if (!userToBan) return;

    let expiresAt: string | undefined | null;

    if (banDuration === 'permanent') {
      expiresAt = undefined;
    } else if (banDuration === 'custom') {
      if (!customBanDate) {
        toast({ title: 'Error', description: 'Please select a date', variant: 'destructive' });
        return;
      }
      expiresAt = new Date(customBanDate).toISOString();
    } else {
      const now = new Date();
      const durationMap = {
        '1day': 1,
        '1week': 7,
        '1month': 30,
      };
      now.setDate(now.getDate() + durationMap[banDuration]);
      expiresAt = now.toISOString();
    }

    if (editingBan) {
      updateBanMutation.mutate({
        userId: userToBan.id,
        reason: banReason || undefined,
        expiresAt: expiresAt,
      });
    } else {
      banMutation.mutate({
        userId: userToBan.id,
        reason: banReason || undefined,
        expiresAt: expiresAt,
      });
    }
  };

  const handleViewCampaign = (campaignId: string) => {
    window.open(`/campaign/${campaignId}?incognito=true`, '_blank');
  };

  const handleSendNotification = () => {
    if (!notifTitle.trim() || !notifMessage.trim()) {
      toast({ title: 'Error', description: 'Title and message are required', variant: 'destructive' });
      return;
    }
    sendNotificationMutation.mutate({
      title: notifTitle.trim(),
      message: notifMessage.trim(),
      patchNotes: notifPatchNotes.trim() || undefined,
    });
  };

  const handleSaveTerms = () => {
    if (!termsContent.trim()) {
      toast({ title: 'Error', description: 'Terms content cannot be empty', variant: 'destructive' });
      return;
    }
    updateTermsMutation.mutate(termsContent.trim());
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-stone-900 to-stone-950 flex items-center justify-center">
        <Card className="bg-stone-800/90 border-stone-700">
          <CardContent className="pt-6">
            <p className="text-stone-400">You do not have permission to access this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-900 to-stone-950 text-stone-100">
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation('/')}
              className="text-amber-400 hover:text-amber-300 hover:bg-stone-700/50"
              data-testid="button-back-home"
            >
              <ArrowLeft className="h-6 w-6" />
            </Button>
            <Shield className="h-7 w-7 text-amber-500" />
            <h1 className="text-xl sm:text-2xl font-bold text-amber-400">Site Security</h1>
          </div>
          <Button
            onClick={() => setShowBroadcastDialog(true)}
            className="bg-amber-600 hover:bg-amber-700 text-stone-900"
            data-testid="button-push-update"
          >
            <Radio className="h-4 w-4 mr-2" />
            Push Update
          </Button>
        </div>

        <AlertDialog open={showBroadcastDialog} onOpenChange={setShowBroadcastDialog}>
          <AlertDialogContent className="bg-stone-800 border-stone-700">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-amber-400">Broadcast Site Update</AlertDialogTitle>
              <AlertDialogDescription className="text-stone-300">
                This will send a notification to all connected users, prompting them to refresh their browser. 
                Use this after deploying significant updates that require a page refresh.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-stone-700 text-stone-200 hover:bg-stone-600 border-stone-600">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => broadcastUpdateMutation.mutate()}
                disabled={broadcastUpdateMutation.isPending}
                className="bg-amber-600 text-stone-900 hover:bg-amber-700"
                data-testid="button-confirm-broadcast"
              >
                {broadcastUpdateMutation.isPending ? 'Sending...' : 'Broadcast Update'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent className="bg-stone-800 border-stone-700">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-red-400">Delete User Account</AlertDialogTitle>
              <AlertDialogDescription className="text-stone-300">
                This will permanently delete the account for <span className="font-semibold text-stone-100">@{userToDelete?.username}</span>. 
                This action cannot be undone. All of the user's data including campaigns, characters, notes, and permissions will be deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-stone-700 text-stone-200 hover:bg-stone-600 border-stone-600">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => userToDelete && deleteUserMutation.mutate(userToDelete.id)}
                disabled={deleteUserMutation.isPending}
                className="bg-red-600 text-white hover:bg-red-700"
                data-testid="button-confirm-delete-user"
              >
                {deleteUserMutation.isPending ? 'Deleting...' : 'Delete Account'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as 'users' | 'notifications' | 'terms')} className="w-full">
          <TabsList className="bg-stone-800 border border-stone-700 mb-6 w-full sm:w-auto">
            <TabsTrigger 
              value="users" 
              className="data-[state=active]:bg-amber-600 data-[state=active]:text-stone-900 flex-1 sm:flex-initial"
              data-testid="tab-user-management"
            >
              <Users className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">User Management</span>
            </TabsTrigger>
            <TabsTrigger 
              value="notifications" 
              className="data-[state=active]:bg-amber-600 data-[state=active]:text-stone-900 flex-1 sm:flex-initial"
              data-testid="tab-push-notifications"
            >
              <Bell className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Push Notifications</span>
            </TabsTrigger>
            <TabsTrigger 
              value="terms" 
              className="data-[state=active]:bg-amber-600 data-[state=active]:text-stone-900 flex-1 sm:flex-initial"
              data-testid="tab-terms"
            >
              <FileText className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Terms & Conditions</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <Card className="bg-stone-800/90 border-stone-700">
                  <CardHeader className="pb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <CardTitle className="text-amber-400 flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        User Management
                      </CardTitle>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-stone-400" />
                        <Input
                          placeholder="Search users..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-9 bg-stone-700 border-stone-600 text-stone-100 w-full sm:w-64"
                          data-testid="input-search-users"
                        />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'all' | 'banned')}>
                      <TabsList className="bg-stone-700 mb-4">
                        <TabsTrigger value="all" className="data-[state=active]:bg-amber-600" data-testid="tab-all-users">
                          All Users ({users.length})
                    </TabsTrigger>
                    <TabsTrigger value="banned" className="data-[state=active]:bg-red-600" data-testid="tab-banned-users">
                      Banned ({users.filter(isBanned).length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="all" className="mt-0">
                    <ScrollArea className="h-[500px]">
                      {isLoading ? (
                        <div className="text-center py-8 text-stone-400">Loading users...</div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow className="border-stone-700 hover:bg-transparent">
                              <TableHead className="text-stone-400">User</TableHead>
                              <TableHead className="text-stone-400 hidden md:table-cell">Email</TableHead>
                              <TableHead className="text-stone-400 hidden lg:table-cell">Joined</TableHead>
                              <TableHead className="text-stone-400">Status</TableHead>
                              <TableHead className="text-stone-400">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredUsers.map((user) => (
                              <TableRow
                                key={user.id}
                                className={`border-stone-700 cursor-pointer transition-colors ${
                                  isBanned(user)
                                    ? 'bg-red-950/20 hover:bg-red-950/30'
                                    : 'hover:bg-stone-700/50'
                                } ${selectedUser?.id === user.id ? 'bg-amber-900/20' : ''}`}
                                onClick={() => setSelectedUser(user)}
                                data-testid={`row-user-${user.id}`}
                              >
                                <TableCell>
                                  <div className="flex items-center gap-3">
                                    <UserAvatar user={user} />
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium text-stone-100">{user.username}</span>
                                        {user.isAdmin && (
                                          <Badge className="bg-amber-600 text-xs" data-testid={`badge-admin-${user.id}`}>
                                            Admin
                                          </Badge>
                                        )}
                                      </div>
                                      <span className="text-sm text-stone-400">{user.name}</span>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="text-stone-300 hidden md:table-cell">{user.email}</TableCell>
                                <TableCell className="text-stone-400 hidden lg:table-cell">
                                  {new Date(user.createdAt).toLocaleDateString()}
                                </TableCell>
                                <TableCell>
                                  {isBanned(user) ? (
                                    <div className="space-y-1">
                                      <Badge className="bg-red-600" data-testid={`badge-banned-${user.id}`}>
                                        Banned
                                      </Badge>
                                      {user.banExpiresAt && <BanCountdown expiresAt={user.banExpiresAt} />}
                                    </div>
                                  ) : (
                                    <Badge className="bg-green-600" data-testid={`badge-active-${user.id}`}>
                                      Active
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                    {isBanned(user) ? (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="border-green-600 text-green-400 hover:bg-green-600/20"
                                          onClick={() => unbanMutation.mutate(user.id)}
                                          data-testid={`button-unban-${user.id}`}
                                        >
                                          <ShieldOff className="h-4 w-4 mr-1" />
                                          Unban
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="border-amber-600 text-amber-400 hover:bg-amber-600/20"
                                          onClick={() => handleEditBanClick(user)}
                                          data-testid={`button-edit-ban-${user.id}`}
                                        >
                                          Edit Ban
                                        </Button>
                                      </>
                                    ) : (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="border-red-600 text-red-400 hover:bg-red-600/20"
                                        onClick={() => handleBanClick(user)}
                                        disabled={user.id === currentUser?.id}
                                        data-testid={`button-ban-${user.id}`}
                                      >
                                        <Ban className="h-4 w-4 mr-1" />
                                        Ban
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="banned" className="mt-0">
                    <ScrollArea className="h-[500px]">
                      {filteredUsers.length === 0 ? (
                        <div className="text-center py-8 text-stone-400">No banned users</div>
                      ) : (
                        <div className="space-y-3">
                          {filteredUsers.map((user) => (
                            <Card
                              key={user.id}
                              className="bg-red-950/20 border-red-900/50 cursor-pointer hover:bg-red-950/30 transition-colors"
                              onClick={() => setSelectedUser(user)}
                              data-testid={`card-banned-user-${user.id}`}
                            >
                              <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <UserAvatar user={user} />
                                    <div>
                                      <div className="font-medium text-stone-100">{user.username}</div>
                                      <div className="text-sm text-stone-400">{user.email}</div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <div className="text-right">
                                      {user.banExpiresAt ? (
                                        <BanCountdown expiresAt={user.banExpiresAt} />
                                      ) : (
                                        <span className="text-red-400 text-sm">Permanent</span>
                                      )}
                                      {user.banReason && (
                                        <div className="text-xs text-stone-500 mt-1 max-w-[200px] truncate">
                                          {user.banReason}
                                        </div>
                                      )}
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-green-600 text-green-400 hover:bg-green-600/20"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        unbanMutation.mutate(user.id);
                                      }}
                                      data-testid={`button-quick-unban-${user.id}`}
                                    >
                                      <ShieldOff className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          {/* Mobile Sheet for User Details */}
          {isMobile && (
          <Sheet open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
            <SheetContent side="right" className="w-full sm:max-w-md bg-stone-900 border-stone-700 overflow-y-auto">
              <SheetHeader className="pb-4">
                <SheetTitle className="text-amber-400 flex items-center gap-2">
                  <User className="h-5 w-5" />
                  User Details
                </SheetTitle>
              </SheetHeader>
              {selectedUser && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 border-2 border-stone-600">
                      <AvatarImage src={selectedUser.avatarUrl || undefined} />
                      <AvatarFallback className="bg-stone-700 text-amber-400 text-lg">
                        {selectedUser.username.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-stone-100 truncate">{selectedUser.name}</h3>
                      <p className="text-sm text-stone-400 truncate">@{selectedUser.username}</p>
                      <p className="text-xs text-stone-500 truncate">{selectedUser.email}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-stone-500 text-xs">Joined</span>
                      <p className="text-stone-300 text-sm">{new Date(selectedUser.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <span className="text-stone-500 text-xs">Status</span>
                      <div className="mt-0.5">
                        {isBanned(selectedUser) ? (
                          <Badge className="bg-red-600 text-xs">Banned</Badge>
                        ) : (
                          <Badge className="bg-green-600 text-xs">Active</Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {isBanned(selectedUser) && (
                    <div className="p-2 bg-red-950/30 rounded-lg border border-red-900/50">
                      <h4 className="text-xs font-medium text-red-400 mb-1">Ban Details</h4>
                      <div className="space-y-0.5 text-xs">
                        {selectedUser.banExpiresAt ? (
                          <p className="text-stone-300">Expires: {new Date(selectedUser.banExpiresAt).toLocaleDateString()}</p>
                        ) : (
                          <p className="text-red-400">Permanent ban</p>
                        )}
                        {selectedUser.banReason && (
                          <p className="text-stone-400 truncate">Reason: {selectedUser.banReason}</p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      id={`admin-mobile-${selectedUser.id}`}
                      checked={selectedUser.isAdmin || false}
                      onCheckedChange={(checked) => {
                        setAdminMutation.mutate({
                          userId: selectedUser.id,
                          isAdmin: !!checked,
                        });
                      }}
                      disabled={selectedUser.id === currentUser?.id}
                    />
                    <Label htmlFor={`admin-mobile-${selectedUser.id}`} className="text-stone-300 flex items-center gap-2 cursor-pointer text-sm">
                      <ShieldCheck className="h-4 w-4 text-amber-500" />
                      Admin Access
                    </Label>
                  </div>

                  <div className="border-t border-stone-700 pt-3">
                    <h4 className="text-xs font-medium text-stone-400 mb-2">Admin Actions</h4>
                    <div className="flex flex-col gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => sendPasswordResetMutation.mutate(selectedUser.id)}
                        disabled={sendPasswordResetMutation.isPending}
                        className="border-stone-600 text-stone-300 hover:bg-stone-700 w-full justify-start"
                      >
                        <Mail className="h-4 w-4 mr-2" />
                        {sendPasswordResetMutation.isPending ? 'Sending...' : 'Send Password Reset'}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setUserToDelete(selectedUser);
                          setShowDeleteDialog(true);
                        }}
                        disabled={selectedUser.id === currentUser?.id}
                        className="bg-red-600 hover:bg-red-700 w-full justify-start"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Account
                      </Button>
                    </div>
                  </div>

                  {userActivity && (
                    <div className="border-t border-stone-700 pt-3 space-y-3">
                      <div>
                        <div className="flex items-center gap-2 text-stone-400 mb-2">
                          <MapPin className="h-3 w-3" />
                          <span className="text-xs font-medium">Campaigns ({userActivity.campaigns.length})</span>
                        </div>
                        {userActivity.campaigns.length === 0 ? (
                          <p className="text-xs text-stone-500">No campaigns</p>
                        ) : (
                          <div className="space-y-1.5 max-h-32 overflow-y-auto">
                            {userActivity.campaigns.map((campaign) => (
                              <div
                                key={campaign.id}
                                className="flex items-center justify-between p-1.5 bg-stone-700/50 rounded text-xs"
                              >
                                <div className="min-w-0 flex-1">
                                  <span className="text-stone-200 truncate block">{campaign.name}</span>
                                  <Badge className="text-[10px] bg-stone-600 mt-0.5">{campaign.role}</Badge>
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-amber-400 hover:text-amber-300 hover:bg-stone-600 shrink-0"
                                  onClick={() => handleViewCampaign(campaign.id)}
                                  data-testid={`button-enter-campaign-mobile-${campaign.id}`}
                                >
                                  <Eye className="h-3 w-3 mr-1" />
                                  Enter
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-4 text-xs">
                        <p className="text-stone-300">
                          <User className="inline h-3 w-3 mr-1" />
                          {userActivity.characters.length} characters
                        </p>
                        <p className="text-stone-300">
                          <FileText className="inline h-3 w-3 mr-1" />
                          {userActivity.notes.length} notes
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </SheetContent>
          </Sheet>
          )}

          {/* Desktop Panel for User Details */}
          {!isMobile && (
          <div className="lg:col-span-1">
            {selectedUser ? (
              <Card className="bg-stone-800/90 border-stone-700 sticky top-6">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-amber-400 flex items-center gap-2">
                      <User className="h-5 w-5" />
                      User Details
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedUser(null)}
                      className="text-stone-400 hover:text-stone-100"
                      data-testid="button-close-details"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-16 w-16 border-2 border-stone-600">
                        <AvatarImage src={selectedUser.avatarUrl || undefined} />
                        <AvatarFallback className="bg-stone-700 text-amber-400 text-xl">
                          {selectedUser.username.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="text-lg font-semibold text-stone-100">{selectedUser.name}</h3>
                        <p className="text-stone-400">@{selectedUser.username}</p>
                        <p className="text-sm text-stone-500">{selectedUser.email}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-stone-500">Joined</span>
                        <p className="text-stone-300">{new Date(selectedUser.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div>
                        <span className="text-stone-500">Status</span>
                        <div className="mt-1">
                          {isBanned(selectedUser) ? (
                            <Badge className="bg-red-600">Banned</Badge>
                          ) : (
                            <Badge className="bg-green-600">Active</Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {isBanned(selectedUser) && (
                      <div className="p-3 bg-red-950/30 rounded-lg border border-red-900/50">
                        <h4 className="text-sm font-medium text-red-400 mb-2">Ban Details</h4>
                        <div className="space-y-1 text-sm">
                          {selectedUser.banExpiresAt ? (
                            <p className="text-stone-300">
                              <Clock className="inline h-3 w-3 mr-1" />
                              Expires: {new Date(selectedUser.banExpiresAt).toLocaleString()}
                            </p>
                          ) : (
                            <p className="text-red-400">Permanent ban</p>
                          )}
                          {selectedUser.banReason && (
                            <p className="text-stone-400">Reason: {selectedUser.banReason}</p>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        id={`admin-${selectedUser.id}`}
                        checked={selectedUser.isAdmin || false}
                        onCheckedChange={(checked) => {
                          setAdminMutation.mutate({
                            userId: selectedUser.id,
                            isAdmin: !!checked,
                          });
                        }}
                        disabled={selectedUser.id === currentUser?.id}
                        data-testid={`checkbox-admin-${selectedUser.id}`}
                      />
                      <Label
                        htmlFor={`admin-${selectedUser.id}`}
                        className="text-stone-300 flex items-center gap-2 cursor-pointer"
                      >
                        <ShieldCheck className="h-4 w-4 text-amber-500" />
                        Admin Access
                      </Label>
                    </div>

                    <div className="border-t border-stone-700 pt-4">
                      <h4 className="text-sm font-medium text-stone-400 mb-3">Admin Actions</h4>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => sendPasswordResetMutation.mutate(selectedUser.id)}
                          disabled={sendPasswordResetMutation.isPending}
                          className="border-stone-600 text-stone-300 hover:bg-stone-700"
                          data-testid={`button-send-reset-${selectedUser.id}`}
                        >
                          <Mail className="h-4 w-4 mr-2" />
                          {sendPasswordResetMutation.isPending ? 'Sending...' : 'Send Password Reset'}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            setUserToDelete(selectedUser);
                            setShowDeleteDialog(true);
                          }}
                          disabled={selectedUser.id === currentUser?.id}
                          className="bg-red-600 hover:bg-red-700"
                          data-testid={`button-delete-user-${selectedUser.id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Account
                        </Button>
                      </div>
                      {selectedUser.id === currentUser?.id && (
                        <p className="text-xs text-stone-500 mt-2">You cannot delete your own account</p>
                      )}
                    </div>

                    <div className="border-t border-stone-700 pt-4">
                      <h4 className="text-sm font-medium text-stone-400 mb-3">User Activity</h4>
                      {activityLoading ? (
                        <div className="text-stone-500 text-sm">Loading activity...</div>
                      ) : userActivity ? (
                        <div className="space-y-4">
                          <div>
                            <div className="flex items-center gap-2 text-stone-400 mb-2">
                              <MapPin className="h-4 w-4" />
                              <span className="text-sm">Campaigns ({userActivity.campaigns.length})</span>
                            </div>
                            <ScrollArea className="h-24">
                              {userActivity.campaigns.length === 0 ? (
                                <p className="text-sm text-stone-500">No campaigns</p>
                              ) : (
                                <div className="space-y-2">
                                  {userActivity.campaigns.map((campaign) => (
                                    <div
                                      key={campaign.id}
                                      className="flex items-center justify-between p-2 bg-stone-700/50 rounded text-sm"
                                    >
                                      <div>
                                        <span className="text-stone-200">{campaign.name}</span>
                                        <Badge className="ml-2 text-xs bg-stone-600">{campaign.role}</Badge>
                                      </div>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 px-2 text-amber-400 hover:text-amber-300 hover:bg-stone-600"
                                        onClick={() => handleViewCampaign(campaign.id)}
                                        data-testid={`button-enter-campaign-${campaign.id}`}
                                      >
                                        <Eye className="h-3 w-3 mr-1" />
                                        Enter
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </ScrollArea>
                          </div>

                          <div>
                            <div className="flex items-center gap-2 text-stone-400 mb-2">
                              <User className="h-4 w-4" />
                              <span className="text-sm">Characters ({userActivity.characters.length})</span>
                            </div>
                            <ScrollArea className="h-20">
                              {userActivity.characters.length === 0 ? (
                                <p className="text-sm text-stone-500">No characters</p>
                              ) : (
                                <div className="space-y-1">
                                  {userActivity.characters.slice(0, 5).map((char) => (
                                    <div key={char.id} className="text-sm text-stone-300">
                                      {char.name} <span className="text-stone-500">in {char.campaignName}</span>
                                    </div>
                                  ))}
                                  {userActivity.characters.length > 5 && (
                                    <p className="text-xs text-stone-500">
                                      +{userActivity.characters.length - 5} more
                                    </p>
                                  )}
                                </div>
                              )}
                            </ScrollArea>
                          </div>

                          <div>
                            <div className="flex items-center gap-2 text-stone-400 mb-2">
                              <FileText className="h-4 w-4" />
                              <span className="text-sm">Notes ({userActivity.notes.length})</span>
                            </div>
                            <ScrollArea className="h-20">
                              {userActivity.notes.length === 0 ? (
                                <p className="text-sm text-stone-500">No notes</p>
                              ) : (
                                <div className="space-y-1">
                                  {userActivity.notes.slice(0, 5).map((note) => (
                                    <div key={note.id} className="text-sm text-stone-300 truncate">
                                      {note.title}
                                    </div>
                                  ))}
                                  {userActivity.notes.length > 5 && (
                                    <p className="text-xs text-stone-500">+{userActivity.notes.length - 5} more</p>
                                  )}
                                </div>
                              )}
                            </ScrollArea>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-stone-800/90 border-stone-700">
                <CardContent className="pt-6">
                  <div className="text-center text-stone-400 py-12">
                    <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Click on a user to view details</p>
                  </div>
                </CardContent>
              </Card>
            )}
            </div>
          )}
          </div>
          </TabsContent>

          <TabsContent value="notifications" className="mt-0">
            <div className="flex flex-col gap-6">
              <Card className="bg-stone-800/90 border-stone-700">
                <CardHeader>
                  <CardTitle className="text-amber-400 flex items-center gap-2">
                    <Send className="h-5 w-5" />
                    Send Notification
                  </CardTitle>
                  <CardDescription className="text-stone-400">
                    Broadcast a notification to all users currently in an active campaign session
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div>
                    <Label htmlFor="notif-title" className="text-stone-300">Title</Label>
                    <Input
                      id="notif-title"
                      placeholder="Notification title..."
                      value={notifTitle}
                      onChange={(e) => setNotifTitle(e.target.value)}
                      className="bg-stone-700 border-stone-600 mt-1"
                      data-testid="input-notification-title"
                    />
                  </div>
                  <div>
                    <Label htmlFor="notif-message" className="text-stone-300">Message</Label>
                    <Textarea
                      id="notif-message"
                      placeholder="Notification message..."
                      value={notifMessage}
                      onChange={(e) => setNotifMessage(e.target.value)}
                      className="bg-stone-700 border-stone-600 mt-1 min-h-[100px]"
                      data-testid="input-notification-message"
                    />
                  </div>
                  <div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPatchNotes(!showPatchNotes)}
                      className="text-stone-400 hover:text-stone-200 p-0 h-auto"
                      data-testid="button-toggle-patch-notes"
                    >
                      {showPatchNotes ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronRight className="h-4 w-4 mr-1" />}
                      {showPatchNotes ? 'Hide' : 'Add'} Patch Notes (optional)
                    </Button>
                    {showPatchNotes && (
                      <Textarea
                        id="notif-patchnotes"
                        placeholder="Patch notes or changelog..."
                        value={notifPatchNotes}
                        onChange={(e) => setNotifPatchNotes(e.target.value)}
                        className="bg-stone-700 border-stone-600 mt-2 min-h-[120px]"
                        data-testid="input-notification-patchnotes"
                      />
                    )}
                  </div>
                  <Button
                    onClick={handleSendNotification}
                    disabled={sendNotificationMutation.isPending || !notifTitle.trim() || !notifMessage.trim()}
                    className="bg-amber-600 hover:bg-amber-700 text-stone-900 w-fit"
                    data-testid="button-send-notification"
                  >
                    {sendNotificationMutation.isPending ? (
                      <>Sending...</>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Send Notification
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-stone-800/90 border-stone-700">
                <CardHeader>
                  <CardTitle className="text-stone-300 flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    Notification History
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {notificationsLoading ? (
                    <div className="text-stone-500 text-center py-8">Loading...</div>
                  ) : notifications.length === 0 ? (
                    <div className="text-stone-500 text-center py-8">No notifications sent yet</div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {notifications.map((notif) => (
                        <div key={notif.id} className="bg-stone-700/50 rounded-lg p-4 border border-stone-600">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <h4 className="font-semibold text-amber-400">{notif.title}</h4>
                              <p className="text-stone-300 mt-1 whitespace-pre-wrap">{notif.message}</p>
                              {notif.patchNotes && (
                                <div className="mt-2 p-2 bg-stone-800 rounded text-stone-400 text-sm whitespace-pre-wrap">
                                  <span className="text-stone-500 text-xs uppercase tracking-wide">Patch Notes:</span>
                                  <div className="mt-1">{notif.patchNotes}</div>
                                </div>
                              )}
                            </div>
                            <div className="text-stone-500 text-xs shrink-0">
                              {new Date(notif.createdAt).toLocaleDateString()} {new Date(notif.createdAt).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="terms" className="mt-0">
            <Card className="bg-stone-800/90 border-stone-700">
              <CardHeader>
                <CardTitle className="text-amber-400 flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Terms & Conditions
                </CardTitle>
                <CardDescription className="text-stone-400">
                  Edit the site terms and conditions. Saving will create a new version that all users must re-accept.
                </CardDescription>
                {terms && (
                  <div className="mt-2 flex items-center gap-4 text-sm">
                    <Badge className="bg-amber-600 text-stone-900">Version {terms.version}</Badge>
                    <span className="text-stone-500">
                      Last updated: {new Date(terms.createdAt).toLocaleDateString()} at {new Date(terms.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {termsLoading ? (
                  <div className="text-stone-500 text-center py-8">Loading terms...</div>
                ) : (
                  <>
                    <div>
                      <Label htmlFor="terms-content" className="text-stone-300">Terms Content</Label>
                      <Textarea
                        id="terms-content"
                        placeholder="Enter terms and conditions..."
                        value={termsContent}
                        onChange={(e) => setTermsContent(e.target.value)}
                        className="bg-stone-700 border-stone-600 mt-1 min-h-[400px] font-mono text-sm"
                        data-testid="input-terms-content"
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <Button
                        onClick={handleSaveTerms}
                        disabled={updateTermsMutation.isPending || !termsContent.trim()}
                        className="bg-amber-600 hover:bg-amber-700 text-stone-900"
                        data-testid="button-save-terms"
                      >
                        {updateTermsMutation.isPending ? 'Saving...' : 'Save Terms'}
                      </Button>
                      <span className="text-stone-500 text-sm">
                        Note: Saving creates a new version that requires all users to re-accept
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showBanDialog} onOpenChange={setShowBanDialog}>
        <DialogContent className="bg-stone-800 border-stone-700 text-stone-100">
          <DialogHeader>
            <DialogTitle className="text-amber-400 flex items-center gap-2">
              <Ban className="h-5 w-5" />
              {editingBan ? 'Edit Ban' : 'Ban User'}
            </DialogTitle>
            <DialogDescription className="text-stone-400">
              {editingBan ? (
                <>Modify the ban for <strong>{userToBan?.username}</strong></>
              ) : (
                <>Ban <strong>{userToBan?.username}</strong> from accessing the platform</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-stone-300">Reason (optional)</Label>
              <Textarea
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="Enter reason for ban..."
                className="bg-stone-700 border-stone-600 text-stone-100"
                data-testid="input-ban-reason"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-stone-300">Duration</Label>
              <Select value={banDuration} onValueChange={(v) => setBanDuration(v as BanDuration)}>
                <SelectTrigger className="bg-stone-700 border-stone-600 text-stone-100" data-testid="select-ban-duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-stone-700 border-stone-600">
                  <SelectItem value="permanent">Permanent</SelectItem>
                  <SelectItem value="1day">1 Day</SelectItem>
                  <SelectItem value="1week">1 Week</SelectItem>
                  <SelectItem value="1month">1 Month</SelectItem>
                  <SelectItem value="custom">Custom Date</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {banDuration === 'custom' && (
              <div className="space-y-2">
                <Label className="text-stone-300">
                  <Calendar className="inline h-4 w-4 mr-1" />
                  Expires On
                </Label>
                <Input
                  type="date"
                  value={customBanDate}
                  onChange={(e) => setCustomBanDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="bg-stone-700 border-stone-600 text-stone-100"
                  data-testid="input-custom-ban-date"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowBanDialog(false)}
              className="border-stone-600 text-stone-300"
              data-testid="button-cancel-ban"
            >
              Cancel
            </Button>
            <Button
              onClick={handleBanSubmit}
              className="bg-red-600 hover:bg-red-700"
              disabled={banMutation.isPending || updateBanMutation.isPending}
              data-testid="button-confirm-ban"
            >
              {editingBan ? 'Update Ban' : 'Ban User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
