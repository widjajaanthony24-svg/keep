export function ViewToggle({
  view,
  onChange,
}: {
  view: "2d" | "3d";
  onChange: (v: "2d" | "3d") => void;
}) {
  return (
    <div className="view-toggle">
      <button className={view === "2d" ? "view-toggle__btn is-active" : "view-toggle__btn"} onClick={() => onChange("2d")}>
        2D
      </button>
      <button className={view === "3d" ? "view-toggle__btn is-active" : "view-toggle__btn"} onClick={() => onChange("3d")}>
        3D
      </button>
    </div>
  );
}
