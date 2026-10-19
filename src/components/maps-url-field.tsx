"use client";

import { useEffect, useState } from "react";
import { mapOpenHref, mapsQuery, PlaceMap } from "@/components/place-map";

export function MapsUrlField({
  defaultValue,
  placeName,
  fallback,
}: {
  defaultValue: string;
  placeName: string;
  fallback: string;
}) {
  const [url, setUrl] = useState(defaultValue);
  const [shown, setShown] = useState(defaultValue);

  useEffect(() => {
    const timer = setTimeout(() => setShown(url), 400);
    return () => clearTimeout(timer);
  }, [url]);

  const query = mapsQuery(shown.trim() || null, fallback);

  return (
    <>
      <label>
        Google Maps
        <input name="mapsUrl" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.google.com/maps/..." />
      </label>
      {query ? <PlaceMap name={placeName || "ობიექტი"} query={query} openHref={mapOpenHref(shown, query)} /> : null}
    </>
  );
}
