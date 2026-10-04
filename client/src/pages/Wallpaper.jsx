import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Check, ImagePlus, RotateCcw } from 'lucide-react';
import { PageLayout } from '../components/common/PageLayout';
import { Spinner } from '../components/common/Spinner';
import { ChatWallpaper, WALLPAPER_COLORS, WALLPAPER_GRADIENTS, presetBackground } from '../components/chat/ChatWallpaper';
import { useTheme } from '../context/ThemeContext';
import { useChatStore } from '../store/chatStore';
import { toast } from '../store/toastStore';
import { chatApi } from '../services/api';
import { compressImage } from '../utils/media';
import { formatDayLabel } from '../utils/format';

const same = (a, b) => (a?.kind ?? 'default') === (b?.kind ?? 'default') && (a?.value ?? null) === (b?.value ?? null);

function Swatch({ label, background, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected}
      className={`relative aspect-[3/4] w-full overflow-hidden rounded-2xl border transition active:scale-95 ${selected ? 'border-accent ring-2 ring-accent' : 'border-line'}`}
      style={{ background }}
    >
      {selected && (
        <span className="absolute right-1.5 bottom-1.5 flex size-6 items-center justify-center rounded-full bg-accent text-on-accent shadow-soft">
          <Check size={14} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

/** Chat background — shared: both people see it and either can change it. */
export default function Wallpaper() {
  const navigate = useNavigate();
  const { resolved } = useTheme();
  const current = useChatStore((s) => s.wallpaper);
  const setWallpaper = useChatStore((s) => s.setWallpaper);
  const me = useChatStore((s) => s.me);
  const peer = useChatStore((s) => s.peer);
  const [choice, setChoice] = useState(() => current ?? { kind: 'default' });
  const [photo, setPhoto] = useState(null); // { file, url } — a new photo not uploaded yet
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef(null);

  useEffect(() => () => photo && URL.revokeObjectURL(photo.url), [photo]);

  const preview = photo ? { kind: 'photo', imageUrl: photo.url, dim: choice.dim ?? 0 } : choice;
  const changed = Boolean(photo) || !same(choice, current) || (choice.kind === 'photo' && (choice.dim ?? 0) !== (current?.dim ?? 0));
  const isPhoto = preview.kind === 'photo';
  const changedBy = current?.updatedBy ? (current.updatedBy === me?.id ? 'you' : peer?.name) : null;

  const pick = (kind, value) => {
    setPhoto(null);
    setChoice({ kind, value, dim: 0 });
  };

  const onFile = async (file) => {
    if (!file) return;
    try {
      const { file: small } = await compressImage(file, { maxDimension: 1920, quality: 0.85 });
      setPhoto({ file: small, url: URL.createObjectURL(small) });
      setChoice({ kind: 'photo', value: null, dim: current?.kind === 'photo' ? current.dim ?? 20 : 20 });
    } catch (err) {
      toast.error(err.message);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      let result;
      if (photo) {
        const form = new FormData();
        form.append('dim', String(choice.dim ?? 0));
        form.append('file', photo.file, photo.file.name || 'background.jpg');
        result = await chatApi.uploadWallpaper(form, { onProgress: setProgress });
      } else {
        result = await chatApi.setWallpaper({ kind: choice.kind, value: choice.kind === 'photo' ? null : choice.value ?? null, dim: choice.dim ?? 0 });
      }
      setWallpaper(result.wallpaper);
      toast.show(`Chat background changed for you and ${peer?.name ?? 'them'}`);
      navigate(-1);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
      setProgress(0);
    }
  };

  return (
    <PageLayout title="Chat background">
      <div className="px-4 pt-4 pb-32">
        <p className="text-sm text-muted">
          Shared — you and {peer?.name ?? 'they'} both see it, and either of you can change it.
          {changedBy && current?.updatedAt && ` Last changed by ${changedBy} · ${formatDayLabel(current.updatedAt)}.`}
        </p>

        {/* Live preview */}
        <div className="relative mt-4 h-64 overflow-hidden rounded-3xl border border-line shadow-soft">
          <ChatWallpaper wallpaper={preview} />
          <div className="relative flex h-full flex-col justify-end gap-2 p-4">
            <span className="max-w-[75%] self-start rounded-[20px] rounded-bl-md border border-line bg-bubble-in px-3.5 py-2 text-[15px] text-ink shadow-soft">Good morning ☀️</span>
            <span className="max-w-[75%] self-end rounded-[20px] rounded-br-md bg-bubble-out px-3.5 py-2 text-[15px] text-on-accent shadow-soft">Morning! Love the new background ❤️</span>
          </div>
        </div>

        {isPhoto && (
          <label className="mt-4 block rounded-2xl bg-surface-2 px-4 py-3 text-sm font-medium">
            <span className="flex justify-between">
              <span>Dim the photo</span>
              <span className="text-muted tabular-nums">{choice.dim ?? 0}%</span>
            </span>
            <input type="range" min={0} max={80} step={5} value={choice.dim ?? 0} onChange={(e) => setChoice((c) => ({ ...c, dim: Number(e.target.value) }))} className="mt-2 w-full accent-[var(--c-accent)]" aria-label="Dim the photo" />
          </label>
        )}

        <h2 className="mt-6 mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Your photo</h2>
        <div className="grid grid-cols-4 gap-2.5">
          <button type="button" onClick={() => fileRef.current?.click()} className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line text-xs font-semibold text-accent-strong">
            <ImagePlus size={22} /> Choose
          </button>
          {(photo || current?.kind === 'photo') && (
            <Swatch
              label="Photo background"
              background={`center / cover url("${photo ? photo.url : current.imageUrl}")`}
              selected={isPhoto}
              onClick={() => (photo ? null : setChoice({ ...current }))}
            />
          )}
          <button
            type="button"
            onClick={() => pick('default', null)}
            aria-pressed={preview.kind === 'default'}
            className={`chat-backdrop flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 rounded-2xl border text-xs font-semibold text-muted ${preview.kind === 'default' ? 'border-accent ring-2 ring-accent' : 'border-line'}`}
          >
            <RotateCcw size={18} /> Default
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        <h2 className="mt-6 mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Gradients</h2>
        <div className="grid grid-cols-4 gap-2.5">
          {WALLPAPER_GRADIENTS.map((g) => (
            <Swatch key={g.id} label={g.name} background={presetBackground({ kind: 'gradient', value: g.id }, resolved)} selected={!photo && same(preview, { kind: 'gradient', value: g.id })} onClick={() => pick('gradient', g.id)} />
          ))}
        </div>

        <h2 className="mt-6 mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Colours</h2>
        <div className="grid grid-cols-4 gap-2.5">
          {WALLPAPER_COLORS.map((c) => (
            <Swatch key={c.id} label={c.name} background={presetBackground({ kind: 'color', value: c.id }, resolved)} selected={!photo && same(preview, { kind: 'color', value: c.id })} onClick={() => pick('color', c.id)} />
          ))}
        </div>
      </div>

      <div className="glass fixed inset-x-0 bottom-0 z-20 border-t border-line px-4 pt-3 pb-[calc(var(--safe-bottom)+12px)]">
        <button
          type="button"
          onClick={save}
          disabled={!changed || saving}
          className="mx-auto flex w-full max-w-md items-center justify-center gap-2 rounded-full bg-accent py-3.5 font-semibold text-on-accent shadow-soft disabled:opacity-50"
        >
          {saving ? <Spinner size={18} /> : <Check size={18} />}
          {saving && photo ? `Uploading… ${Math.round(progress * 100)}%` : `Set for both of us`}
        </button>
      </div>
    </PageLayout>
  );
}
