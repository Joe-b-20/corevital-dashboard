import { useState } from "react";

export default function CopyButton({
  text,
  label = "Copy",
  size = "sm",
}: {
  text: string;
  label?: string;
  size?: "sm" | "md";
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`copy-btn ${size}`}
      title="Copy to clipboard"
    >
      {copied ? "✓ Copied" : label}
    </button>
  );
}
