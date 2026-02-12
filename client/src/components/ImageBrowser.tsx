import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Folder, FolderOpen, ArrowLeft, Search, Image, Loader2, Check, Home, AlertCircle, RefreshCw, X } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

interface DriveFolder {
  id: string;
  name: string;
}

interface DriveImage {
  id: string;
  name: string;
  thumbnailLink?: string;
  webContentLink?: string;
}

interface ImageBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (imageBase64: string) => void;
  title?: string;
}

export function ImageBrowser({ open, onOpenChange, onSelect, title = "Browse Image Library" }: ImageBrowserProps) {
  const queryClient = useQueryClient();
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(undefined);
  const [folderStack, setFolderStack] = useState<{ id: string | undefined; name: string }[]>([
    { id: undefined, name: 'Image Library' }
  ]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [panelPos, setPanelPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, posX: 0, posY: 0 });

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  useEffect(() => {
    if (open) {
      if (isMobile) {
        setPanelPos({ x: 0, y: 0 });
      } else {
        setPanelPos({
          x: Math.max(20, (window.innerWidth - 600) / 2),
          y: Math.max(20, (window.innerHeight - window.innerHeight * 0.7) / 2),
        });
      }
    }
  }, [open]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['drive-folders'] });
      await queryClient.invalidateQueries({ queryKey: ['drive-images'] });
      await queryClient.invalidateQueries({ queryKey: ['drive-search'] });
      toast({ title: 'Refreshed', description: 'Image library updated with latest files' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to refresh library', variant: 'destructive' });
    } finally {
      setIsRefreshing(false);
    }
  };

  const { data: folders = [], isLoading: foldersLoading } = useQuery({
    queryKey: ['drive-folders', currentFolderId],
    queryFn: async () => {
      const url = currentFolderId 
        ? `/api/drive/folders?parentId=${encodeURIComponent(currentFolderId)}`
        : '/api/drive/folders';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load folders');
      return res.json() as Promise<DriveFolder[]>;
    },
    enabled: open && !searchQuery,
  });

  const { data: images = [], isLoading: imagesLoading } = useQuery({
    queryKey: ['drive-images', currentFolderId],
    queryFn: async () => {
      const url = currentFolderId 
        ? `/api/drive/images?folderId=${encodeURIComponent(currentFolderId)}`
        : '/api/drive/images';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load images');
      return res.json() as Promise<DriveImage[]>;
    },
    enabled: open && !searchQuery,
  });

  const { data: searchResults = [], isLoading: searchLoading } = useQuery({
    queryKey: ['drive-search', searchQuery, currentFolderId],
    queryFn: async () => {
      const params = new URLSearchParams({ q: searchQuery });
      if (currentFolderId) params.set('folderId', currentFolderId);
      const res = await fetch(`/api/drive/search?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to search images');
      return res.json() as Promise<DriveImage[]>;
    },
    enabled: open && searchQuery.length >= 2,
  });

  const navigateToFolder = (folder: DriveFolder) => {
    setFolderStack(prev => [...prev, { id: folder.id, name: folder.name }]);
    setCurrentFolderId(folder.id);
    setSelectedImageId(null);
  };

  const navigateBack = () => {
    if (folderStack.length > 1) {
      const newStack = [...folderStack];
      newStack.pop();
      setFolderStack(newStack);
      setCurrentFolderId(newStack[newStack.length - 1].id);
      setSelectedImageId(null);
    }
  };

  const navigateToRoot = () => {
    setFolderStack([{ id: undefined, name: 'Image Library' }]);
    setCurrentFolderId(undefined);
    setSelectedImageId(null);
  };

  const handleSelectImage = async (image: DriveImage) => {
    setSelectedImageId(image.id);
    setIsLoadingImage(true);
    
    try {
      const res = await fetch(`/api/drive/image/${image.id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load image');
      const { data } = await res.json();
      onSelect(data);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to load image:', error);
    } finally {
      setIsLoadingImage(false);
      setSelectedImageId(null);
    }
  };

  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setSelectedImageId(null);
    }
  }, [open]);

  const displayedImages = searchQuery.length >= 2 ? searchResults : images;
  const isLoading = foldersLoading || imagesLoading || searchLoading;

  if (!open) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/50"
        style={{ zIndex: 10001 }}
        onClick={() => onOpenChange(false)}
      />
      <div
        className={`fixed bg-stone-950 border border-stone-800 text-stone-200 shadow-2xl flex flex-col overflow-hidden ${
          isMobile ? 'inset-0 rounded-none' : 'rounded-lg'
        }`}
        style={isMobile ? { zIndex: 10002 } : { left: panelPos.x, top: panelPos.y, width: '600px', height: '70vh', zIndex: 10002 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className={`flex items-center justify-between px-4 py-2 border-b border-stone-800 bg-stone-900 select-none shrink-0 ${
            isMobile ? '' : 'cursor-move rounded-t-lg'
          }`}
          onPointerDown={(e) => {
            if (isMobile) return;
            e.preventDefault();
            setDragging(true);
            dragRef.current = { startX: e.clientX, startY: e.clientY, posX: panelPos.x, posY: panelPos.y };
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (isMobile || !dragging) return;
            setPanelPos({
              x: dragRef.current.posX + e.clientX - dragRef.current.startX,
              y: Math.max(0, dragRef.current.posY + e.clientY - dragRef.current.startY),
            });
          }}
          onPointerUp={(e) => {
            if (isMobile) return;
            if (dragging) {
              setDragging(false);
              (e.target as HTMLElement).releasePointerCapture(e.pointerId);
            }
          }}
        >
          <div>
            <h2 className="text-amber-500 font-display text-lg">{title}</h2>
            <p className="text-stone-400 text-xs">Browse your Google Drive image library</p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-stone-400 hover:text-stone-200 p-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden p-4 gap-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
              <Input
                placeholder="Search images..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-stone-900 border-stone-700 text-stone-200"
                data-testid="input-image-search"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="border-stone-700 hover:bg-stone-800 hover:text-amber-500"
              title="Refresh library"
              data-testid="button-refresh-library"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {!searchQuery && (
            <div className="flex items-center gap-1 text-sm overflow-x-auto">
              <Button
                variant="ghost"
                size="sm"
                className="text-stone-400 hover:text-amber-500 p-1 h-auto"
                onClick={navigateToRoot}
                data-testid="button-nav-root"
              >
                <Home className="h-4 w-4" />
              </Button>
              {folderStack.slice(1).map((folder, index) => (
                <div key={folder.id || 'root'} className="flex items-center">
                  <span className="text-stone-600 mx-1">/</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-stone-400 hover:text-amber-500 p-1 h-auto truncate max-w-[100px]"
                    onClick={() => {
                      const targetIndex = index + 1;
                      setFolderStack(folderStack.slice(0, targetIndex + 1));
                      setCurrentFolderId(folder.id);
                    }}
                    data-testid={`button-nav-folder-${folder.id}`}
                  >
                    {folder.name}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {!searchQuery && folderStack.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={navigateBack}
              className="w-fit text-stone-400 border-stone-700 hover:bg-stone-800"
              data-testid="button-nav-back"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          )}

          <ScrollArea className="flex-1 min-h-0">
            {isLoading ? (
              <div className="flex items-center justify-center h-[300px]">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
              </div>
            ) : (
              <div className="space-y-4 pr-4">
                {!searchQuery && folders.length > 0 && (
                  <div>
                    <h3 className="text-xs text-stone-500 uppercase tracking-wider mb-2">Folders</h3>
                    <div className="grid grid-cols-3 sm:grid-cols-3 gap-2">
                      {folders.map((folder) => (
                        <button
                          key={folder.id}
                          onClick={() => navigateToFolder(folder)}
                          className="flex items-center gap-2 p-3 bg-stone-900 border border-stone-800 rounded-lg hover:border-amber-600/50 transition-colors text-left"
                          data-testid={`button-folder-${folder.id}`}
                        >
                          <Folder className="h-5 w-5 text-amber-600 flex-shrink-0" />
                          <span className="text-sm text-stone-300 truncate">{folder.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {displayedImages.length > 0 && (
                  <div>
                    <h3 className="text-xs text-stone-500 uppercase tracking-wider mb-2">
                      {searchQuery ? 'Search Results' : 'Images'}
                    </h3>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pb-2">
                      {displayedImages.map((image) => (
                        <button
                          key={image.id}
                          onClick={() => handleSelectImage(image)}
                          disabled={isLoadingImage}
                          className={`relative aspect-square bg-stone-900 border rounded-lg overflow-hidden transition-all ${
                            selectedImageId === image.id 
                              ? 'border-amber-500 ring-2 ring-amber-500/50' 
                              : 'border-stone-800 hover:border-amber-600/50'
                          }`}
                          data-testid={`button-image-${image.id}`}
                        >
                          {image.thumbnailLink ? (
                            <img
                              src={image.thumbnailLink}
                              alt={image.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Image className="h-8 w-8 text-stone-700" />
                            </div>
                          )}
                          
                          {selectedImageId === image.id && isLoadingImage && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
                            </div>
                          )}
                          
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                            <span className="text-[10px] text-stone-300 truncate block">{image.name}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {!isLoading && folders.length === 0 && displayedImages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-[200px] text-stone-500">
                    <Image className="h-12 w-12 mb-2" />
                    <p>
                      {searchQuery 
                        ? 'No images found for your search' 
                        : 'No images or folders in this location'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          <div className="flex justify-end pt-3 border-t border-stone-800">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="text-stone-400 border-stone-700 hover:bg-stone-800"
              data-testid="button-cancel-image-browser"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
