export function TypingIndicator({ name }) {
  return (
    <div className="flex animate-message-in px-3 pt-1 pb-2" aria-live="polite">
      <div className="flex items-center gap-1 rounded-[20px] rounded-bl-md border border-line bg-bubble-in px-4 py-3 shadow-soft" aria-label={`${name} is typing`}>
        {[0, 160, 320].map((delay) => (
          <span key={delay} className="size-2 animate-bounce rounded-full bg-muted/70" style={{ animationDelay: `${delay}ms`, animationDuration: '1s' }} />
        ))}
      </div>
    </div>
  );
}
