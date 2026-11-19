/**
 * Put a picture somewhere and give back a link to it.
 *
 * A picture picked off disk arrives as a `data:` URL — the whole image spelled
 * out in the string. That is fine to show straight away, but it is no good to
 * keep: the string gets written into every row that wants the picture, and a
 * single photo off a phone is a few megabytes of it. Saving it once and
 * passing the link around keeps all of that to a few dozen characters.
 *
 * Anything that is already a link is handed straight back, so this is safe to
 * call on whatever you have.
 */
export async function storeImage(src: string): Promise<string> {
  if (!src.startsWith("data:")) return src;
  const res = await fetch("/api/agnostic/image", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: src }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.url) throw new Error(body.error || "Couldn't save that picture");
  return body.url as string;
}
