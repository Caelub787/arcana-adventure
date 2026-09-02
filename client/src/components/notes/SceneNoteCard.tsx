import React, { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, Scene } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Map as MapIcon, Upload, Link2, ExternalLink } from "lucide-react";

export interface SceneNoteLink {
  sceneId?: string;
  source?: "upload" | "existing-scene";
}

interface SceneNoteCardProps {
  campaignId: string;
  isGm: boolean;
  link: SceneNoteLink | null;
  onLinkChange: (link: SceneNoteLink) => void;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function SceneNoteCard({ campaignId, isGm, link, onLinkChange }: SceneNoteCardProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pickedExistingId, setPickedExistingId] = useState<string>("");

  const { data: scenes = [] } = useQuery<Scene[]>({
    queryKey: ["/api/scenes", campaignId],
    queryFn: () => api.getScenes(campaignId),
    enabled: !!campaignId,
  });

  const linkedScene = link?.sceneId ? scenes.find(s => s.id === link.sceneId) : null;

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const scene = await api.registerSceneFromUpload(campaignId, dataUrl, file.name.replace(/\.[^.]+$/, ""));
      onLinkChange({ sceneId: scene.id, source: "upload" });
      toast({ title: "Scene registered", description: `"${scene.name}" is now available in this campaign's Scenes.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to register scene", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  if (!isGm) {
    return (
      <div className="rounded-lg border border-stone-800 bg-stone-900/60 p-4 text-center">
        <MapIcon className="h-6 w-6 mx-auto text-stone-600 mb-2" />
        <p className="text-xs text-stone-500">
          {linkedScene ? `Linked to Scene "${linkedScene.name}".` : "This scene note has no linked map yet."}
        </p>
      </div>
    );
  }

  if (linkedScene) {
    return (
      <div className="rounded-lg border border-stone-800 bg-stone-900/60 p-3 flex items-center gap-3" data-testid="scene-note-linked">
        {linkedScene.backgroundImage && (
          <img src={linkedScene.backgroundImage} alt="" className="h-14 w-20 object-cover rounded border border-stone-700 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-stone-200 truncate">{linkedScene.name}</div>
          <div className="text-[11px] text-stone-500 flex items-center gap-1">
            <Link2 className="h-2.5 w-2.5" /> Linked campaign Scene
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs shrink-0"
          onClick={() => onLinkChange({})}
          data-testid="button-unlink-scene"
        >
          Unlink
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-dashed border-stone-700 bg-stone-900/40 p-4 space-y-3" data-testid="scene-note-unlinked">
      <div className="text-center">
        <MapIcon className="h-6 w-6 mx-auto text-stone-600 mb-1" />
        <p className="text-xs text-stone-500">No map linked yet. Adding one here automatically registers it as a playable Scene.</p>
      </div>
      <div className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = "";
          }}
          data-testid="input-scene-upload"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs flex-1"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          data-testid="button-upload-scene-image"
        >
          <Upload className="h-3 w-3 mr-1" /> {uploading ? "Uploading..." : "Upload Image"}
        </Button>
      </div>
      {scenes.length > 0 && (
        <div className="flex gap-2">
          <Select value={pickedExistingId} onValueChange={setPickedExistingId}>
            <SelectTrigger className="h-8 text-xs bg-stone-900 border-stone-700 flex-1" data-testid="select-existing-scene">
              <SelectValue placeholder="Link an existing campaign Scene..." />
            </SelectTrigger>
            <SelectContent className="bg-stone-900 border-stone-700 text-xs">
              {scenes.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={!pickedExistingId}
            onClick={() => onLinkChange({ sceneId: pickedExistingId, source: "existing-scene" })}
            data-testid="button-link-existing-scene"
          >
            <ExternalLink className="h-3 w-3 mr-1" /> Link
          </Button>
        </div>
      )}
    </div>
  );
}
