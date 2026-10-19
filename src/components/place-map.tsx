import { externalHref } from "@/server/labels";

export function mapsQuery(mapsUrl: string | null, fallback: string) {
  if (mapsUrl) {
    try {
      const url = new URL(externalHref(mapsUrl));
      const query = url.searchParams.get("query") || url.searchParams.get("q") || url.searchParams.get("destination");
      if (query?.trim()) return query.trim();
    } catch {
      return fallback.trim();
    }
  }
  return fallback.trim();
}

export function mapOpenHref(mapsUrl: string | null, query: string) {
  const trimmed = mapsUrl?.trim() ?? "";
  if (!trimmed) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  try {
    const url = new URL(externalHref(trimmed));
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
  } catch {
    /* the typed text is not a link yet */
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || trimmed)}`;
}

export function PlaceMap({ name, query, openHref }: { name: string; query: string; openHref: string }) {
  const destination = encodeURIComponent(query);
  return (
    <div className="place-map">
      <iframe
        title={`${name} რუკაზე`}
        src={`https://maps.google.com/maps?q=${destination}&z=16&hl=ka&output=embed`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <div className="row">
        <a className="button" href={openHref} target="_blank" rel="noreferrer">რუკა</a>
        <a className="button secondary" href={`https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`} target="_blank" rel="noreferrer">მიმართულება</a>
      </div>
    </div>
  );
}
