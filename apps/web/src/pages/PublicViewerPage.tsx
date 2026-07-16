import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { validateBuildingGraph, type BuildingGraph } from "@keep/building-graph";
import { fetchPublicProject } from "../api/client";
import { BuildingViewer } from "../viewer/BuildingViewer";
import { EstimatePanel } from "../estimate/EstimatePanel";

export function PublicViewerPage() {
  const { slug } = useParams<{ slug: string }>();
  const [name, setName] = useState("");
  const [graph, setGraph] = useState<BuildingGraph | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    fetchPublicProject(slug)
      .then((project) => {
        setName(project.name);
        const validation = validateBuildingGraph(project.buildingGraph);
        if (!validation.success) {
          setError("This project's data failed validation — see console for details.");
          console.error(validation.error.issues);
          return;
        }
        setGraph(validation.data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "This link is invalid or is no longer shared"));
  }, [slug]);

  return (
    <div className="page page--viewer">
      <header className="page__header">
        <div>
          <div className="eyebrow">Keep — shared blueprint</div>
          <h1>{name || "Loading…"}</h1>
        </div>
      </header>

      {error && <div className="form-error">{error}</div>}
      {!error && !graph && <p className="muted">Loading building…</p>}
      {graph && <BuildingViewer graph={graph} />}
      {graph && <EstimatePanel graph={graph} />}
      {graph && (
        <p className="muted public-viewer__footnote">
          Read-only shared view — sign in to Keep to edit this project.
        </p>
      )}
    </div>
  );
}
