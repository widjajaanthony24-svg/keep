import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { validateBuildingGraph, type BuildingGraph } from "@keep/building-graph";
import { api } from "../api/client";
import { BuildingViewer } from "../viewer/BuildingViewer";
import { EstimatePanel } from "../estimate/EstimatePanel";
import { ShareButton } from "../share/ShareButton";

export function ViewerPage() {
  const { id } = useParams<{ id: string }>();
  const [name, setName] = useState("");
  const [graph, setGraph] = useState<BuildingGraph | null>(null);
  const [shareSlug, setShareSlug] = useState<string | null>(null);
  const [visibility, setVisibility] = useState("private");
  const [error, setError] = useState<string | null>(null);
  const [rateSaveNote, setRateSaveNote] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .getProject(id)
      .then((project) => {
        setName(project.name);
        setShareSlug(project.shareSlug);
        setVisibility(project.visibility);
        const validation = validateBuildingGraph(project.buildingGraph);
        if (!validation.success) {
          setError("This project's Building Graph failed schema validation — see console for details.");
          console.error(validation.error.issues);
          return;
        }
        setGraph(validation.data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load project"));
  }, [id]);

  function handleLaborRateChange(rate: number) {
    if (!graph || !id) return;
    const updated: BuildingGraph = { ...graph, metadata: { ...graph.metadata, laborRatePerHour: rate } };
    setGraph(updated);

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await api.updateProject(id, { buildingGraph: updated });
        setRateSaveNote("Labor rate saved.");
      } catch (err) {
        setRateSaveNote(err instanceof Error ? err.message : "Could not save labor rate");
      } finally {
        setTimeout(() => setRateSaveNote(null), 3000);
      }
    }, 500);
  }

  return (
    <div className="page page--viewer">
      <header className="page__header">
        <div>
          <Link to="/projects" className="back-link">
            ← Projects
          </Link>
          <h1>{name || "Loading…"}</h1>
        </div>
        <div className="page__header-actions">
          {id && <ShareButton projectId={id} initialSlug={shareSlug} initialVisibility={visibility} />}
          {id && (
            <Link to={`/projects/${id}/edit`} className="btn btn--primary">
              Edit
            </Link>
          )}
        </div>
      </header>

      {error && <div className="form-error">{error}</div>}
      {!error && !graph && <p className="muted">Loading building…</p>}
      {graph && <BuildingViewer graph={graph} />}
      {graph && <EstimatePanel graph={graph} onLaborRateChange={handleLaborRateChange} />}
      {rateSaveNote && <p className="muted estimate-panel__save-note">{rateSaveNote}</p>}
    </div>
  );
}
