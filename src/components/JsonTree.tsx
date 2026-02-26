import { useState } from "react";

type JsonValue = unknown;

function keyCount(v: Record<string, unknown> | unknown[]): number {
  return Array.isArray(v) ? v.length : Object.keys(v).length;
}

function JsonNode({ name, value, depth = 0 }: { name: string; value: JsonValue; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);

  if (value === null) {
    return <div style={{ paddingLeft: depth * 12, fontFamily: "monospace", fontSize: "0.8rem" }}><span style={{ color: "var(--muted)" }}>{name}:</span> <span style={{ color: "#f472b6" }}>null</span></div>;
  }
  if (typeof value === "boolean") {
    return <div style={{ paddingLeft: depth * 12, fontFamily: "monospace", fontSize: "0.8rem" }}><span style={{ color: "var(--muted)" }}>{name}:</span> <span style={{ color: "#a78bfa" }}>{String(value)}</span></div>;
  }
  if (typeof value === "number") {
    return <div style={{ paddingLeft: depth * 12, fontFamily: "monospace", fontSize: "0.8rem" }}><span style={{ color: "var(--muted)" }}>{name}:</span> <span style={{ color: "#22d3ee" }}>{value}</span></div>;
  }
  if (typeof value === "string") {
    const preview = value.length > 80 ? value.slice(0, 80) + "…" : value;
    return <div style={{ paddingLeft: depth * 12, fontFamily: "monospace", fontSize: "0.8rem", wordBreak: "break-all" }}><span style={{ color: "var(--muted)" }}>{name}:</span> <span style={{ color: "#4ade80" }}>"{preview}"</span></div>;
  }

  const count = keyCount(value as Record<string, unknown> | unknown[]);
  const isArray = Array.isArray(value);

  return (
    <div style={{ paddingLeft: depth * 12 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ background: "none", border: "none", padding: "2px 4px", cursor: "pointer", fontFamily: "monospace", fontSize: "0.8rem", color: "var(--accent)", textAlign: "left" }}
      >
        {open ? "▼" : "▶"} {name} {isArray ? `[${count}]` : `{${count}}`}
      </button>
      {open && (
        <div style={{ borderLeft: "1px solid var(--border)", marginLeft: 8 }}>
          {Array.isArray(value)
            ? value.slice(0, 200).map((item, i) => (
                <JsonNode key={i} name={String(i)} value={item} depth={depth + 1} />
              ))
            : Object.entries(value as Record<string, unknown>).slice(0, 200).map(([k, v]) => (
                <JsonNode key={k} name={k} value={v} depth={depth + 1} />
              ))}
          {(Array.isArray(value) ? value.length : Object.keys(value as object).length) > 200 && (
            <div style={{ paddingLeft: (depth + 1) * 12, fontFamily: "monospace", fontSize: "0.75rem", color: "var(--muted)" }}>… (truncated)</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function JsonTree({ data }: { data: unknown }) {
  return (
    <div style={{ maxHeight: 400, overflow: "auto", padding: "0.75rem", background: "var(--bg-card)", borderRadius: 8, border: "1px solid var(--border)" }}>
      <JsonNode name="root" value={data} depth={0} />
    </div>
  );
}
