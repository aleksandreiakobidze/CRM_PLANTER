"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rescheduleExcursionDayAction, rescheduleTaskAction } from "@/server/actions/work-actions";

export type CalendarChip = {
  id: string;
  kind: "task" | "rental" | "excursion";
  label: string;
  title: string;
  lines: string[];
  href?: string;
  hrefLabel?: string;
  files?: { id: string; name: string }[];
  late?: boolean;
  movable?: boolean;
};

const KIND_LABEL = { task: "დავალება", rental: "გაქირავება", excursion: "ექსკურსია" };
const MONTHS = ["იანვარი", "თებერვალი", "მარტი", "აპრილი", "მაისი", "ივნისი", "ივლისი", "აგვისტო", "სექტემბერი", "ოქტომბერი", "ნოემბერი", "დეკემბერი"];

function dayTitle(iso: string) {
  const [year, month, day] = iso.split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

export type CalendarDay = {
  iso: string;
  inMonth: boolean;
  chips: CalendarChip[];
};

const WEEKDAYS = ["ორშ", "სამ", "ოთხ", "ხუთ", "პარ", "შაბ", "კვი"];

export function MonthCalendar({
  today,
  days,
  unscheduled,
}: {
  today: string;
  days: CalendarDay[];
  unscheduled: CalendarChip[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [openChip, setOpenChip] = useState<CalendarChip | null>(null);
  const dragged = useRef(false);

  function moveTask(taskId: string, dueOn: string | null) {
    setError("");
    startTransition(async () => {
      try {
        await rescheduleTaskAction(taskId, dueOn);
        router.refresh();
      } catch {
        setError("ვადა ვერ შეიცვალა");
      }
    });
  }

  function moveExcursion(bookingId: string, date: string | null) {
    setError("");
    if (!date) {
      setError("ექსკურსიას თარიღი სჭირდება");
      return;
    }
    startTransition(async () => {
      const result = await rescheduleExcursionDayAction(bookingId, date);
      if (!result.ok) {
        setError(result.message || "თარიღი ვერ შეიცვალა");
        return;
      }
      router.refresh();
    });
  }

  function onDrop(event: React.DragEvent, dueOn: string | null) {
    event.preventDefault();
    setOver(null);
    const raw = event.dataTransfer.getData("text/plain");
    if (!raw) return;
    const sep = raw.indexOf(":");
    const kind = sep === -1 ? "task" : raw.slice(0, sep);
    const id = sep === -1 ? raw : raw.slice(sep + 1);
    if (kind === "excursion") {
      moveExcursion(id, dueOn);
      return;
    }
    if (kind === "task") moveTask(id, dueOn);
  }

  function showChip(chip: CalendarChip) {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    setOpenChip(chip);
  }

  const openDayData = days.find((day) => day.iso === openDay) ?? null;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenChip(null);
        setOpenDay(null);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={pending ? "calendar-layout pending" : "calendar-layout"}>
      {error ? <p className="err">{error}</p> : null}
      <div className="calendar-grid" role="grid" aria-label="თვის კალენდარი">
        {WEEKDAYS.map((day) => <div key={day} className="calendar-weekday">{day}</div>)}
        {days.map((day) => (
          <div
            key={day.iso}
            role="gridcell"
            className={["calendar-day", day.inMonth ? "" : "outside", day.iso === today ? "today" : "", over === day.iso ? "over" : ""].filter(Boolean).join(" ")}
            onDragOver={(event) => {
              event.preventDefault();
              setOver(day.iso);
            }}
            onDragLeave={() => setOver((current) => current === day.iso ? null : current)}
            onDrop={(event) => onDrop(event, day.iso)}
            onClick={() => {
              if (day.chips.length === 0) return;
              setOpenChip(null);
              setOpenDay(day.iso);
            }}
          >
            <span className="day-number">{Number(day.iso.slice(8))}</span>
            <div className="day-chips">
              {day.chips.map((chip) => (
                <CalendarChipView
                  key={`${chip.kind}-${chip.id}-${day.iso}`}
                  chip={chip}
                  onOpen={() => showChip(chip)}
                  onDrag={() => { dragged.current = true; }}
                  onDragEnd={() => { window.setTimeout(() => { dragged.current = false; }, 0); }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <aside
        className={over === "none" ? "calendar-tray over" : "calendar-tray"}
        onDragOver={(event) => {
          event.preventDefault();
          setOver("none");
        }}
        onDragLeave={() => setOver((current) => current === "none" ? null : current)}
        onDrop={(event) => onDrop(event, null)}
      >
        <h2>ვადის გარეშე</h2>
        {unscheduled.length === 0 ? <p className="muted">აქ გადმოიტანეთ დავალება, თუ ვადა არ სჭირდება.</p> : null}
        <div className="day-chips">
          {unscheduled.map((chip) => (
            <CalendarChipView
              key={chip.id}
              chip={chip}
              onOpen={() => showChip(chip)}
              onDrag={() => { dragged.current = true; }}
              onDragEnd={() => { window.setTimeout(() => { dragged.current = false; }, 0); }}
            />
          ))}
        </div>
        {error ? <p className="err">{error}</p> : null}
      </aside>
      {openChip || openDayData ? (
        <div
          className="cal-backdrop"
          onClick={() => {
            setOpenChip(null);
            setOpenDay(null);
          }}
        >
          <div className="cal-dialog" role="dialog" aria-modal="true" aria-label={openChip?.title ?? openDayData?.iso} onClick={(event) => event.stopPropagation()}>
            {openChip ? (
              <>
                <p className="muted">{KIND_LABEL[openChip.kind]}</p>
                <h2>{openChip.title}</h2>
                {openChip.lines.map((line) => <p key={line}>{line}</p>)}
                {openChip.files?.map((file) => <a key={file.id} href={`/tasks/files/${file.id}`}>{file.name}</a>)}
                {openChip.href ? <Link className="button" href={openChip.href}>{openChip.hrefLabel ?? "გახსნა"}</Link> : null}
              </>
            ) : openDayData ? (
              <>
                <h2>{openDayData ? dayTitle(openDayData.iso) : ""}</h2>
                {openDayData.chips.length === 0 ? <p className="muted">ამ დღეს ჩანაწერი არ არის.</p> : (
                  <div className="day-chips">
                    {openDayData.chips.map((chip) => (
                      <button key={`${chip.kind}-${chip.id}`} type="button" className={["cal-chip", chip.kind, chip.late ? "late" : ""].filter(Boolean).join(" ")} onClick={() => setOpenChip(chip)}>
                        {chip.label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : null}
            <div className="row" style={{ justifyContent: "flex-start" }}>
              {openDay && openChip ? <button type="button" className="secondary" onClick={() => setOpenChip(null)}>უკან</button> : null}
              <button type="button" className="secondary" onClick={() => { setOpenChip(null); setOpenDay(null); }}>დახურვა</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CalendarChipView({ chip, onOpen, onDrag, onDragEnd }: { chip: CalendarChip; onOpen: () => void; onDrag: () => void; onDragEnd: () => void }) {
  const draggable = chip.kind === "task" || (chip.kind === "excursion" && chip.movable !== false);
  return (
    <button
      type="button"
      className={["cal-chip", chip.kind, chip.late ? "late" : ""].filter(Boolean).join(" ")}
      draggable={draggable}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      onDragStart={(event) => {
        if (!draggable) {
          event.preventDefault();
          return;
        }
        onDrag();
        event.dataTransfer.setData("text/plain", `${chip.kind}:${chip.id}`);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={onDragEnd}
    >
      {chip.label}
    </button>
  );
}
