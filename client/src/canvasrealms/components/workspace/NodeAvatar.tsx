import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { objectUrl } from "@cr/lib/uploadImage";
import { cn } from "@cr/lib/utils";

interface Props {
  imageUrl?: string | null;
  icon: LucideIcon;
  iconClassName?: string;
  iconStyle?: React.CSSProperties;
  imgClassName?: string;
  alt?: string;
}

export function NodeAvatar({
  imageUrl,
  icon: Icon,
  iconClassName,
  iconStyle,
  imgClassName,
  alt,
}: Props) {
  const src = imageUrl ? objectUrl(imageUrl) : null;
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    if (!src) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setLoaded(true);
    };
    img.onerror = () => {
      if (!cancelled) setLoaded(false);
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (src && loaded) {
    return (
      <img
        src={src}
        alt={alt ?? ""}
        className={cn("object-cover", imgClassName ?? iconClassName)}
        draggable={false}
      />
    );
  }
  return <Icon className={iconClassName} style={iconStyle} />;
}
