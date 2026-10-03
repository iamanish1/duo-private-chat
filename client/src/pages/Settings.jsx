import { useEffect, useState } from 'react';
import { Bell, BellOff, Download, LogOut, Monitor, Moon, Pencil, ShieldCheck, Smartphone, Sun } from 'lucide-react';
import { PageLayout } from '../components/common/PageLayout';
import { BottomSheet } from '../components/common/BottomSheet';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useNotifications } from '../hooks/useNotifications';
import { notificationApi, userApi } from '../services/api';
import { canPromptInstall, onInstallAvailability, promptInstall } from '../services/install';
import { isIOS, isStandalone } from '../services/push';
import { useChatStore } from '../store/chatStore';
import { toast } from '../store/toastStore';
import { ProfilePhoto } from '../components/settings/ProfilePhoto';
import { APP_NAME } from '../config';

function Section({ title, children }) {
  return (
    <section className="px-4 pt-6">
      <h2 className="px-2 pb-2 text-xs font-semibold tracking-wide text-muted uppercase">{title}</h2>
      <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-soft">{children}</div>
    </section>
  );
}

function Row({ icon: Icon, title, description, children, onClick, tone }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`flex w-full items-center gap-4 border-b border-line px-4 py-3.5 text-left last:border-b-0 ${onClick ? 'transition hover:bg-surface-2' : ''} ${tone === 'danger' ? 'text-danger' : ''}`}
    >
      {Icon && <Icon size={20} className={tone === 'danger' ? '' : 'text-muted'} />}
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        {description && <span className="block text-sm text-muted">{description}</span>}
      </span>
      {children}
    </Tag>
  );
}

function Segmented({ value, options, onChange, label }) {
  return (
    <div className="flex rounded-full bg-surface-2 p-1" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition ${value === o.value ? 'bg-surface text-ink shadow-soft dark:bg-white/15' : 'text-muted'}`}
        >
          {o.icon && <o.icon size={15} />} {o.label}
        </button>
      ))}
    </div>
  );
}

const NOTIFICATION_STATES = {
  enabled: 'On for this device',
  'local-only': 'On while the app is open in the background',
  default: 'Off',
  off: 'Off for this device',
  denied: 'Blocked in your browser settings',
  private: 'Not available in private/incognito windows. Open the app in a normal window.',
  unsupported: "Not supported in this browser",
  'needs-install': 'Add the app to your Home Screen to enable',
};

const PREVIEW_OPTIONS = [
  { value: 'hidden', label: 'Nothing' },
  { value: 'sender', label: 'Name' },
  { value: 'full', label: 'Message' },
];

export default function Settings() {
  const { user, updateUser, logout } = useAuth();
  const peer = useChatStore((s) => s.peer);
  const setMe = useChatStore((s) => s.setMe);
  const { preference, setPreference } = useTheme();
  const notifications = useNotifications();
  const [name, setName] = useState(user?.name ?? '');
  const [editingName, setEditingName] = useState(false);
  const [preview, setPreview] = useState(user?.settings?.notificationPreview ?? 'sender');
  const [installable, setInstallable] = useState(canPromptInstall);
  const [confirmEverywhere, setConfirmEverywhere] = useState(false);

  useEffect(() => onInstallAvailability(setInstallable), []);

  const applyUser = (next) => {
    updateUser(next);
    setMe(next);
  };

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === user.name) return setEditingName(false);
    try {
      const { user: next } = await userApi.update({ name: trimmed });
      applyUser(next);
      setEditingName(false);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const changePreview = async (value) => {
    const previous = preview;
    setPreview(value);
    try {
      const { user: next } = await userApi.update({ settings: { notificationPreview: value } });
      applyUser(next);
    } catch (err) {
      setPreview(previous);
      toast.error(err.message);
    }
  };

  const toggleNotifications = async () => {
    try {
      if (notifications.state === 'enabled' || notifications.state === 'local-only') {
        await notifications.disable();
        toast.show('Notifications turned off for this device');
      } else {
        const result = await notifications.enable();
        if (result === 'private') toast.error("Notifications aren't available in private/incognito windows. Open the app in a normal window (or install it) to get them. You'll still hear a chime while this tab is open.", { duration: 9000 });
        else if (result === 'denied') toast.error('Notifications are blocked. Allow them in your browser settings.');
        else toast.success('Notifications are on');
      }
    } catch {
      toast.error("Couldn't change notification settings.");
    }
  };

  const sendTest = async () => {
    try {
      const { sent } = await notificationApi.test();
      toast.show(sent ? 'Test notification sent' : 'No subscribed devices found');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const notificationsOn = notifications.state === 'enabled' || notifications.state === 'local-only';
  const canToggle = ['enabled', 'local-only', 'default', 'off'].includes(notifications.state);

  return (
    <PageLayout title="Settings">
      <div className="flex flex-col items-center px-6 pt-8">
        <ProfilePhoto user={user} onUpdated={applyUser} />

        {editingName ? (
          <form onSubmit={(e) => { e.preventDefault(); saveName(); }} className="mt-4 flex w-full max-w-xs gap-2">
            <input autoFocus value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} className="h-11 min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 focus:border-accent focus:outline-none" aria-label="Your name" />
            <button type="submit" className="rounded-2xl bg-accent px-4 font-semibold text-on-accent">Save</button>
          </form>
        ) : (
          <button type="button" onClick={() => setEditingName(true)} className="mt-4 flex items-center gap-2 rounded-full px-3 py-1 text-xl font-semibold hover:bg-surface-2">
            {user?.name} <Pencil size={15} className="text-muted" />
          </button>
        )}
        <p className="mt-1 text-sm text-muted">{user?.email}</p>
      </div>

      <Section title="Appearance">
        <div className="p-3">
          <Segmented
            label="Theme"
            value={preference}
            onChange={setPreference}
            options={[
              { value: 'system', label: 'Auto', icon: Monitor },
              { value: 'light', label: 'Light', icon: Sun },
              { value: 'dark', label: 'Dark', icon: Moon },
            ]}
          />
        </div>
      </Section>

      <Section title="Notifications">
        <Row icon={notificationsOn ? Bell : BellOff} title="Message & call alerts" description={NOTIFICATION_STATES[notifications.state]}>
          {canToggle && (
            <button
              type="button"
              role="switch"
              aria-checked={notificationsOn}
              aria-label="Notifications"
              disabled={notifications.busy}
              onClick={toggleNotifications}
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${notificationsOn ? 'bg-accent' : 'bg-surface-2 ring-1 ring-line'}`}
            >
              <span className={`absolute top-1 left-1 size-5 rounded-full bg-white shadow transition ${notificationsOn ? 'translate-x-5' : ''}`} />
            </button>
          )}
        </Row>
        <div className="border-b border-line px-4 py-3.5 last:border-b-0">
          <p className="font-medium">Show in notifications</p>
          <p className="mb-3 text-sm text-muted">How much a lock-screen notification reveals.</p>
          <Segmented label="Notification preview" value={preview} onChange={changePreview} options={PREVIEW_OPTIONS} />
        </div>
        {notifications.state === 'enabled' && <Row icon={Smartphone} title="Send a test notification" onClick={sendTest} />}
      </Section>

      <Section title="App">
        {isStandalone() ? (
          <Row icon={Download} title="Installed" description={`${APP_NAME} is on your home screen.`} />
        ) : installable ? (
          <Row icon={Download} title={`Install ${APP_NAME}`} description="Open it like a native app, full screen." onClick={() => promptInstall()} />
        ) : (
          <Row
            icon={Download}
            title={`Install ${APP_NAME}`}
            description={isIOS() ? 'In Safari, tap Share, then “Add to Home Screen”.' : 'Use your browser menu and choose “Install app” or “Add to Home screen”.'}
          />
        )}
      </Section>

      <Section title="Privacy & account">
        <Row icon={ShieldCheck} title="Private by design" description={`Only you and ${peer?.name ?? 'your person'} can access this space.`} />
        <Row icon={LogOut} title="Sign out" onClick={() => logout()} />
        <Row icon={LogOut} title="Sign out of all devices" tone="danger" onClick={() => setConfirmEverywhere(true)} />
      </Section>

      <p className="px-6 py-8 text-center text-xs text-muted">{APP_NAME} · a private space for two</p>

      <BottomSheet open={confirmEverywhere} onClose={() => setConfirmEverywhere(false)} title="Sign out everywhere?">
        <p className="px-6 text-sm text-muted">Every device signed in to your account, including this one, will need your password again.</p>
        <div className="mt-5 flex gap-3 px-6">
          <button type="button" onClick={() => setConfirmEverywhere(false)} className="flex-1 rounded-full bg-surface-2 py-3 font-semibold">Cancel</button>
          <button type="button" onClick={() => logout({ everywhere: true })} className="flex-1 rounded-full bg-danger py-3 font-semibold text-white">Sign out</button>
        </div>
      </BottomSheet>
    </PageLayout>
  );
}
