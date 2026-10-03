const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g;

/** Renders text with safe, clickable http(s) links. React escapes everything else. */
export function RichText({ text, linkClassName = '' }) {
  const parts = text.split(URL_PATTERN);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className={`break-all underline underline-offset-2 ${linkClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
}
