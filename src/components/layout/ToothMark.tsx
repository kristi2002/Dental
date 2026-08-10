/** A plain, drawn-with-a-pen tooth — the app's only piece of decoration. */
export function ToothMark({ size = 34 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="shrink-0 text-brand"
    >
      <path
        d="M12 3.2c-1.6 0-2.4.7-3.9.7-1.6 0-2.4-.7-3.3.4-.9 1.1-.9 3.2-.4 5.4.4 1.7.7 2.5.9 4.2.2 1.7.3 3.3.7 4.6.3 1.1.8 1.9 1.6 1.9.9 0 1.2-.9 1.5-2.4.3-1.6.5-3.3 1.4-3.3s1.1 1.7 1.4 3.3c.3 1.5.6 2.4 1.5 2.4.8 0 1.3-.8 1.6-1.9.4-1.3.5-2.9.7-4.6.2-1.7.5-2.5.9-4.2.5-2.2.5-4.3-.4-5.4-.9-1.1-1.7-.4-3.3-.4-1.5 0-2.3-.7-3.9-.7Z"
        fill="currentColor"
        fillOpacity="0.12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
