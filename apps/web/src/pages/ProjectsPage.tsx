import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, clearToken } from "../api/client";

interface ProjectSummary {
  id: string;
  name: string;
  mode: string;
  visibility: string;
  updatedAt: string;
}

export function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      setProjects(await api.listProjects());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load projects");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function createProject(startFrom: "blank" | "sample") {
    setCreating(true);
    try {
      const name = startFrom === "sample" ? "Untitled (from sample house)" : "Untitled project";
      const project = await api.createProject(name, "creative", startFrom);
      navigate(`/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create project");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(project: ProjectSummary) {
    const confirmed = window.confirm(`Delete "${project.name}"? This can't be undone.`);
    if (!confirmed) return;

    setDeletingId(project.id);
    try {
      await api.deleteProject(project.id);
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete project");
    } finally {
      setDeletingId(null);
    }
  }

  function signOut() {
    clearToken();
    navigate("/login");
  }

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <div className="eyebrow">Keep</div>
          <h1>Projects</h1>
        </div>
        <button className="btn" onClick={signOut}>
          Sign out
        </button>
      </header>

      <div className="create-row">
        <button className="btn btn--primary" disabled={creating} onClick={() => createProject("blank")}>
          New blank project
        </button>
        <button className="btn" disabled={creating} onClick={() => createProject("sample")}>
          Start from sample house
        </button>
      </div>

      {error && (
        <div className="form-error">
          {error}
          {error === "Failed to fetch" && (
            <>
              {" "}
              — this usually means the API server isn't running. Check the terminal running{" "}
              <code>npm run dev:api</code> and make sure it's still up.
            </>
          )}
        </div>
      )}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : projects.length === 0 ? (
        <p className="muted">No projects yet — create one above to see the viewer in action.</p>
      ) : (
        <ul className="project-list">
          {projects.map((p) => (
            <li key={p.id} className="project-row">
              <Link to={`/projects/${p.id}`} className="project-card">
                <span className="project-card__name">{p.name}</span>
                <span className="project-card__meta">
                  {p.mode} · updated {new Date(p.updatedAt).toLocaleString()}
                </span>
              </Link>
              <button
                className="project-delete-btn"
                disabled={deletingId === p.id}
                onClick={() => handleDelete(p)}
                title="Delete project"
              >
                {deletingId === p.id ? "…" : "Delete"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
