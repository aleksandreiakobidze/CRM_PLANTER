"use client";

import { useMemo, useState } from "react";
import { ChevronDown, X } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { deletePlaceTermAction } from "@/server/actions/work-actions";
import { SETTINGS_COPY } from "@/server/features/admin/settings-copy";

const PREVIEW = 16;

export function PlaceCatalog({
  groups,
  canWrite,
}: {
  groups: { kind: string; label: string; rows: { id: string; name: string; code: string }[] }[];
  canWrite: boolean;
}) {
  const [query, setQuery] = useState("");
  const [openKind, setOpenKind] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const needle = query.trim().toLocaleLowerCase("ka");

  const filtered = useMemo(() => {
    return groups.map((group) => {
      const rows = group.rows.filter((item) => {
        if (!needle) return true;
        return [item.name, item.code].some((part) => part.toLocaleLowerCase("ka").includes(needle));
      });
      return { ...group, rows, total: group.rows.length };
    });
  }, [groups, needle]);

  return (
    <div className="space-y-3">
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={SETTINGS_COPY.search}
        aria-label={SETTINGS_COPY.search}
        className="h-10 max-w-sm"
      />
      <div className="space-y-2">
        {filtered.map((group) => {
          const opened = needle ? group.rows.length > 0 : Boolean(openKind[group.kind]);
          const showAll = Boolean(needle || expanded[group.kind]);
          const visible = showAll ? group.rows : group.rows.slice(0, PREVIEW);
          return (
            <section key={group.kind} className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
              <button
                type="button"
                className="settings-kind"
                aria-expanded={opened}
                onClick={() => setOpenKind((current) => ({ ...current, [group.kind]: !opened }))}
              >
                <strong className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  {group.label}
                </strong>
                <span className="text-sm tabular-nums text-gray-400">
                  {needle ? `${group.rows.length}/${group.total}` : group.total} {SETTINGS_COPY.records}
                </span>
                <ChevronDown
                  size={16}
                  className={cn("ml-auto text-gray-400 transition-transform duration-200", opened && "rotate-180")}
                />
              </button>
              {opened ? (
                <div className="space-y-3 border-t border-gray-200 px-4 py-3 dark:border-gray-800">
                  {group.rows.length === 0 ? <p className="text-sm text-gray-400">{SETTINGS_COPY.empty}</p> : (
                    <ul className="flex flex-wrap gap-2">
                      {visible.map((item) => (
                        <li
                          key={item.id}
                          className="inline-flex items-center gap-1 rounded-full bg-gray-100 py-1 pr-1 pl-2.5 text-sm font-medium text-gray-700 dark:bg-white/5 dark:text-gray-300"
                        >
                          <span>{item.code ? `${item.name} · ${item.code}` : item.name}</span>
                          {canWrite ? (
                            <form action={deletePlaceTermAction.bind(null, item.id)}>
                              <button
                                type="submit"
                                className="settings-chip-x"
                                aria-label={SETTINGS_COPY.delete}
                              >
                                <X size={12} />
                              </button>
                            </form>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                  {!needle && group.rows.length > PREVIEW ? (
                    <button
                      type="button"
                      className="settings-more"
                      onClick={() => setExpanded((current) => ({ ...current, [group.kind]: !showAll }))}
                    >
                      {showAll ? SETTINGS_COPY.hide : `${SETTINGS_COPY.show} · ${group.rows.length}`}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
