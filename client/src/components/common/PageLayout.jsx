import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router';
import { IconButton } from './IconButton';

/** Secondary screen with a back button; content scrolls under a glass header. */
export function PageLayout({ title, actions, children, bodyClassName = '' }) {
  const navigate = useNavigate();
  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/', { replace: true }));

  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="glass sticky top-0 z-20 border-b border-line pt-safe">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-1 px-2">
          <IconButton label="Back" onClick={goBack}>
            <ArrowLeft size={22} />
          </IconButton>
          <h1 className="min-w-0 flex-1 truncate px-1 text-[17px] font-semibold">{title}</h1>
          {actions}
        </div>
      </header>
      <main className={`scroll-area flex-1 ${bodyClassName}`}>
        <div className="mx-auto max-w-3xl pb-safe">{children}</div>
      </main>
    </div>
  );
}
