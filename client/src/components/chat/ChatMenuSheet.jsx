import { ChevronRight, History, Images, Moon, Search, Settings, Sun } from 'lucide-react';
import { useNavigate } from 'react-router';
import { BottomSheet, SheetAction } from '../common/BottomSheet';
import { Avatar } from '../common/Avatar';
import { useTheme } from '../../context/ThemeContext';
import { useChatStore } from '../../store/chatStore';

export function ChatMenuSheet({ open, onClose }) {
  const navigate = useNavigate();
  const me = useChatStore((s) => s.me);
  const { resolved, setPreference } = useTheme();
  const go = (path) => () => {
    onClose();
    navigate(path);
  };

  return (
    <BottomSheet open={open} onClose={onClose}>
      <button type="button" onClick={go('/settings')} className="mx-3 mb-2 flex w-[calc(100%-1.5rem)] items-center gap-4 rounded-3xl bg-surface-2 px-4 py-3 text-left transition hover:brightness-95">
        <Avatar user={me} size="lg" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{me?.name}</span>
          <span className="block text-sm text-muted">Your profile · change photo & name</span>
        </span>
        <ChevronRight size={20} className="text-muted" />
      </button>
      <SheetAction icon={Images} label="Photos & videos" onClick={go('/media')} />
      <SheetAction icon={Search} label="Search messages" onClick={go('/search')} />
      <SheetAction icon={History} label="Call history" onClick={go('/calls')} />
      <SheetAction
        icon={resolved === 'dark' ? Sun : Moon}
        label={resolved === 'dark' ? 'Light mode' : 'Dark mode'}
        onClick={() => setPreference(resolved === 'dark' ? 'light' : 'dark')}
      />
      <SheetAction icon={Settings} label="Settings" onClick={go('/settings')} />
    </BottomSheet>
  );
}
