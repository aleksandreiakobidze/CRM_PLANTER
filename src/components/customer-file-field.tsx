"use client";

import { useState } from "react";

export function CustomerFileField({ accept, hint }: { accept: string; hint: string }) {
  const [names, setNames] = useState<string[]>([]);
  return (
    <div className="file-field">
      <div className="people-head">
        <span>ფაილები</span>
        <small>{names.length > 0 ? names.join(", ") : hint}</small>
      </div>
      <label className="file-trigger">
        <input
          name="files"
          type="file"
          multiple
          required
          accept={accept}
          onChange={(event) => setNames(Array.from(event.target.files ?? []).map((file) => file.name))}
        />
        <span>ფაილის არჩევა</span>
      </label>
    </div>
  );
}
