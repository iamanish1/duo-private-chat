import { useRef, useState } from 'react';
import { Camera, Images, Trash2 } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { BottomSheet, SheetAction } from '../common/BottomSheet';
import { Spinner } from '../common/Spinner';
import { AvatarEditor } from './AvatarEditor';
import { userApi } from '../../services/api';
import { toast } from '../../store/toastStore';
import { compressImage, validateMediaFile } from '../../utils/media';

/** Profile photo with change (camera / gallery → crop) and remove. */
export function ProfilePhoto({ user, onUpdated }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const pick = (source) => {
    setSheetOpen(false);
    const input = inputRef.current;
    if (source === 'camera') input.setAttribute('capture', 'user');
    else input.removeAttribute('capture');
    input.click();
  };

  const onFile = async (file) => {
    if (!file) return;
    const check = validateMediaFile(file);
    if (!check.ok || check.kind !== 'image') {
      toast.error(check.ok ? 'Please choose a photo, not a video.' : check.error);
      return;
    }
    setBusy(true);
    try {
      // Normalizes orientation and converts HEIC where possible before cropping.
      const { file: normalized } = await compressImage(file, { maxDimension: 1600, quality: 0.92 });
      setEditing(normalized);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const upload = async (cropped) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', cropped, cropped.name);
      const { user: next } = await userApi.uploadAvatar(form);
      onUpdated(next);
      setEditing(null);
      toast.success('Profile photo updated');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setSheetOpen(false);
    setBusy(true);
    try {
      const { user: next } = await userApi.removeAvatar();
      onUpdated(next);
      toast.show('Profile photo removed');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center">
      <button type="button" onClick={() => setSheetOpen(true)} className="relative rounded-full" aria-label="Change profile photo" disabled={busy}>
        <Avatar user={user} size="xl" />
        <span className="absolute right-0 bottom-0 flex size-9 items-center justify-center rounded-full bg-accent text-on-accent shadow-soft ring-4 ring-canvas">
          {busy && !editing ? <Spinner size={16} /> : <Camera size={17} />}
        </span>
      </button>
      <button type="button" onClick={() => setSheetOpen(true)} disabled={busy} className="mt-3 rounded-full px-3 py-1 text-sm font-semibold text-accent hover:bg-accent-soft">
        {user?.avatarUrl ? 'Change photo' : 'Add a photo'}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Profile photo">
        <SheetAction icon={Camera} label="Take a photo" onClick={() => pick('camera')} />
        <SheetAction icon={Images} label="Choose from library" onClick={() => pick('library')} />
        {user?.avatarUrl && <SheetAction icon={Trash2} label="Remove photo" tone="danger" onClick={remove} />}
      </BottomSheet>

      {editing && <AvatarEditor file={editing} saving={busy} onCancel={() => setEditing(null)} onSave={upload} />}
    </div>
  );
}
