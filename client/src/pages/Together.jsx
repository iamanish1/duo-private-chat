import { useState } from 'react';
import { CalendarHeart, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageLayout } from '../components/common/PageLayout';
import { BottomSheet } from '../components/common/BottomSheet';
import { useChatStore } from '../store/chatStore';
import { addEvent, daysBetween, durationSince, nextOccurrence, removeEvent, setSince, todayLocal, updateEvent, useCloseStore } from '../services/closeActions';

const KINDS = [
  { id: 'birthday', label: 'Birthday', icon: '🎂', yearly: true },
  { id: 'anniversary', label: 'Anniversary', icon: '💞', yearly: true },
  { id: 'meetup', label: 'Meet-up', icon: '✈️', yearly: false },
  { id: 'other', label: 'Other', icon: '📅', yearly: false },
];
const iconOf = (kind) => KINDS.find((k) => k.id === kind)?.icon ?? '📅';
const longDate = (day) => new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = (day) => new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

function whenText(days) {
  if (days === 0) return 'Today 🎉';
  if (days === 1) return 'Tomorrow';
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} ago`;
  return `in ${days} days`;
}

function EventSheet({ event, onClose, onDelete }) {
  const [title, setTitle] = useState(event?.title ?? '');
  const [date, setDate] = useState(event?.date ?? todayLocal());
  const [kind, setKind] = useState(event?.kind ?? 'birthday');
  const [yearly, setYearly] = useState(event?.yearly ?? true);
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    if (!title.trim() || !date) return;
    setSaving(true);
    const data = { title: title.trim(), date, kind, yearly };
    const ok = event ? await updateEvent(event.id, data) : await addEvent(data);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <BottomSheet open onClose={onClose} title={event ? 'Edit date' : 'Add a date'}>
      <form onSubmit={save} className="space-y-4 px-5 pb-3">
        <div className="grid grid-cols-4 gap-2">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => {
                setKind(k.id);
                setYearly(k.yearly);
              }}
              className={`flex flex-col items-center gap-1 rounded-2xl py-2.5 text-xs font-semibold ${kind === k.id ? 'bg-accent-soft text-accent-strong ring-2 ring-accent' : 'bg-surface-2'}`}
            >
              <span className="text-xl">{k.icon}</span>
              {k.label}
            </button>
          ))}
        </div>
        <label className="block text-sm font-medium">
          Name
          <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 60))} placeholder={kind === 'birthday' ? "Anishka's birthday" : kind === 'meetup' ? 'Next time we meet' : 'Our first date'} className="mt-1 h-11 w-full rounded-2xl border border-line bg-surface px-4 font-normal focus:border-accent/50 focus:outline-none" />
        </label>
        <label className="block text-sm font-medium">
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 h-11 w-full rounded-2xl border border-line bg-surface px-4 font-normal focus:border-accent/50 focus:outline-none" />
        </label>
        <label className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3 text-sm font-medium">
          Repeats every year
          <input type="checkbox" checked={yearly} onChange={(e) => setYearly(e.target.checked)} className="size-5 accent-[var(--c-accent)]" />
        </label>
        <button type="submit" disabled={saving || !title.trim() || !date} className="w-full rounded-full bg-accent py-3 font-semibold text-on-accent disabled:opacity-50">
          Save
        </button>
        {event && (
          <button type="button" onClick={onDelete} className="flex w-full items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-semibold text-danger hover:bg-surface-2">
            <Trash2 size={15} /> Delete this date
          </button>
        )}
      </form>
    </BottomSheet>
  );
}

/** Days together, and countdowns to the dates that matter — shared by both. */
export default function Together() {
  const together = useCloseStore((s) => s.together);
  const peer = useChatStore((s) => s.peer);
  const me = useChatStore((s) => s.me);
  const [editing, setEditing] = useState(null); // event | 'new' | null
  const [editingSince, setEditingSince] = useState(false);
  const [sinceInput, setSinceInput] = useState(together.since ?? '');
  const today = todayLocal();
  const days = together.since ? daysBetween(together.since, today) : null;

  const upcoming = together.events
    .map((e) => ({ ...e, next: nextOccurrence(e, today) }))
    .map((e) => ({ ...e, days: daysBetween(today, e.next) }))
    .sort((a, b) => a.days - b.days);
  const future = upcoming.filter((e) => e.days >= 0);
  const past = upcoming.filter((e) => e.days < 0).reverse();

  return (
    <PageLayout title="Together">
      <div className="px-4 pt-4 pb-10">
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-accent to-accent-strong p-6 text-center text-on-accent shadow-float">
          <span className="pointer-events-none absolute -top-6 -right-4 text-8xl opacity-15" aria-hidden="true">❤️</span>
          <p className="text-sm font-medium opacity-90">
            {me?.name} & {peer?.name}
          </p>
          {days !== null && days >= 0 ? (
            <>
              <p className="mt-2 text-6xl font-bold tabular-nums">{days.toLocaleString()}</p>
              <p className="text-lg font-semibold">days together ❤️</p>
              <p className="mt-2 text-sm opacity-90">{durationSince(together.since, today)} · since {longDate(together.since)}</p>
            </>
          ) : (
            <p className="mt-3 text-lg font-semibold">When did your story begin?</p>
          )}
          {editingSince ? (
            <form
              className="mx-auto mt-4 flex max-w-xs gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (sinceInput && (await setSince(sinceInput))) setEditingSince(false);
              }}
            >
              <input type="date" value={sinceInput} max={today} onChange={(e) => setSinceInput(e.target.value)} aria-label="Together since" className="h-10 min-w-0 flex-1 rounded-full bg-white/90 px-3 text-ink" />
              <button type="submit" className="rounded-full bg-white px-4 text-sm font-semibold text-accent-strong">
                Save
              </button>
            </form>
          ) : (
            <button type="button" onClick={() => setEditingSince(true)} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-4 py-1.5 text-sm font-semibold">
              <Pencil size={14} /> {together.since ? 'Change date' : 'Set the date'}
            </button>
          )}
        </section>

        <div className="mt-6 flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Coming up</h2>
          <button type="button" onClick={() => setEditing('new')} className="flex items-center gap-1 rounded-full bg-accent-soft px-3 py-1.5 text-sm font-semibold text-accent-strong">
            <Plus size={16} /> Add a date
          </button>
        </div>
        {future.length === 0 ? (
          <div className="mt-3 flex flex-col items-center rounded-3xl bg-surface-2 px-6 py-8 text-center">
            <CalendarHeart size={30} className="text-accent" />
            <p className="mt-2 font-medium">Add birthdays, anniversaries or your next meet-up</p>
            <p className="mt-1 text-sm text-muted">You'll both see the countdown, and get a reminder the day before.</p>
          </div>
        ) : (
          <ul className="mt-2 space-y-2">
            {future.map((e) => (
              <li key={e.id} className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${e.days === 0 ? 'bg-accent-soft ring-2 ring-accent' : 'bg-surface-2'}`}>
                <span className="text-2xl">{iconOf(e.kind)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{e.title}</span>
                  <span className="block text-xs text-muted">
                    {shortDate(e.next)}
                    {e.yearly ? ' · every year' : ''}
                  </span>
                </span>
                <span className="text-right">
                  <span className={`block text-sm font-bold ${e.days <= 7 ? 'text-accent-strong' : ''}`}>{whenText(e.days)}</span>
                </span>
                <button type="button" onClick={() => setEditing(e)} aria-label={`Edit ${e.title}`} className="rounded-full p-1.5 text-muted hover:bg-surface">
                  <Pencil size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {past.length > 0 && (
          <>
            <h2 className="mt-6 px-1 text-xs font-semibold tracking-wide text-muted uppercase">Past</h2>
            <ul className="mt-2 space-y-1.5">
              {past.map((e) => (
                <li key={e.id} className="flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm text-muted">
                  <span>{iconOf(e.kind)}</span>
                  <span className="min-w-0 flex-1 truncate">{e.title}</span>
                  <span>{whenText(e.days)}</span>
                  <button type="button" onClick={() => removeEvent(e.id)} aria-label={`Delete ${e.title}`} className="rounded-full p-1.5 hover:bg-surface-2">
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {editing && (
        <EventSheet
          event={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDelete={async () => {
            if (await removeEvent(editing.id)) setEditing(null);
          }}
        />
      )}
    </PageLayout>
  );
}
