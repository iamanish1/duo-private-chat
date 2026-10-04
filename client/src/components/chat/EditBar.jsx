import { Pencil, X } from 'lucide-react';
import { IconButton } from '../common/IconButton';

/** Shown above the composer while correcting a sent message. */
export function EditBar({ message, onCancel }) {
  const isCaption = message.type !== 'text';
  return (
    <div className="flex animate-fade-in items-center gap-3 px-3 pt-2">
      <Pencil size={18} className="shrink-0 text-accent" />
      <div className="min-w-0 flex-1 border-l-[3px] border-accent pl-2.5">
        <p className="text-xs font-semibold text-accent-strong">{isCaption ? 'Editing caption' : 'Editing message'}</p>
        <p className="truncate text-sm text-muted">{message.text || 'No caption'}</p>
      </div>
      <IconButton label="Cancel editing" variant="muted" size="sm" onClick={onCancel}>
        <X size={18} />
      </IconButton>
    </div>
  );
}
