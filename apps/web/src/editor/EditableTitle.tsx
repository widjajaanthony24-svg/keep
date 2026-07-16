import { useEffect, useRef, useState } from "react";

export function EditableTitle({
  value,
  onSave,
}: {
  value: string;
  onSave: (newName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    else setDraft(value);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="editable-title__input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        autoFocus
      />
    );
  }

  return (
    <h1
      className="editable-title"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      title="Click to rename"
    >
      {value}
      <span className="editable-title__pencil">✎</span>
    </h1>
  );
}
