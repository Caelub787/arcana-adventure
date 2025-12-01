import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Folder, FolderOpen, ArrowLeft, Search, Image, Loader2, Check, Home, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
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
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(undefined);
  const [folderStack, setFolderStack] = useState<{ id: string | undefined; name: string }[]>([
    { id: undefined, name: 'My Drive' }
  ]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);

  // Fetch folders
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

  // Fetch images
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

  // Search images
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

  // Navigate into folder
  const navigateToFolder = (folder: DriveFolder) => {
    setFolderStack(prev => [...prev, { id: folder.id, name: folder.name }]);
    setCurrentFolderId(folder.id);
    setSelectedImageId(null);
  };

  // Navigate back
  const navigateBack = () => {
    if (folderStack.length > 1) {
      const newStack = [...folderStack];
      newStack.pop();
      setFolderStack(newStack);
      setCurrentFolderId(newStack[newStack.length - 1].id);
      setSelectedImageId(null);
    }
  };

  // Navigate to root
  const navigateToRoot = () => {
    setFolderStack([{ id: undefined, name: 'My Drive' }]);
    setCurrentFolderId(undefined);
    setSelectedImageId(null);
  };

  // Select image and load base64
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

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setSelectedImageId(null);
    }
  }, [open]);

  const displayedImages = searchQuery.length >= 2 ? searchResults : images;
  const isLoading = foldersLoading || imagesLoading || searchLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-950 border-stone-800 text-stone-200 max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-amber-500 font-display text-xl">{title}</DialogTitle>
          <DialogDescription className="text-stone-400">
            Browse your Google Drive image library
          </DialogDescription>
        </DialogHeader>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
          <Input
            placeholder="Search images..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-stone-900 border-stone-700 text-stone-200"
            data-testid="input-image-search"
          />
        </div>

        {/* Breadcrumb Navigation */}
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

        {/* Back Button */}
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

        {/* Content Area */}
        <ScrollArea className="flex-1 min-h-[300px] max-h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-[300px]">
              <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            </div>
          ) : (
            <div className="space-y-4 pr-4">
              {/* Folders (only show when not searching) */}
              {!searchQuery && folders.length > 0 && (
                <div>
                  <h3 className="text-xs text-stone-500 uppercase tracking-wider mb-2">Folders</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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

              {/* Images */}
              {displayedImages.length > 0 && (
                <div>
                  <h3 className="text-xs text-stone-500 uppercase tracking-wider mb-2">
                    {searchQuery ? 'Search Results' : 'Images'}
                  </h3>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
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
                        
                        {/* Loading Overlay */}
                        {selectedImageId === image.id && isLoadingImage && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
                          </div>
                        )}
                        
                        {/* Image Name Tooltip */}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                          <span className="text-[10px] text-stone-300 truncate block">{image.name}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty States */}
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

        {/* Footer */}
        <div className="flex justify-end pt-4 border-t border-stone-800">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="text-stone-400 border-stone-700 hover:bg-stone-800"
            data-testid="button-cancel-image-browser"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
