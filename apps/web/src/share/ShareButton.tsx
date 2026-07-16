import { useState } from "react";
import { api } from "../api/client";

export function ShareButton({
  projectId,
  initialSlug,
  initialVisibility,
}: {
  projectId: string;
  initialSlug: string | null;
  initialVisibility: string;
}) {
  const [slug, setSlug] = useState(initialSlug);
  const [visibility, setVisibility] = useState(initialVisibility);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publicUrl = slug ? `${window.location.origin}/share/${slug}` : null;
  const isShared = visibility === "public" && slug;

  async function handleShare() {
    setLoading(true);
    setError(null);
    try {
      const result = await api.shareProject(projectId);
      setSlug(result.shareSlug);
      setVisibility(result.visibility);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create share link");
    } finally {
      setLoading(false);
    }
  }

  async function handleUnshare() {
    setLoading(true);
    setError(null);
    try {
      const result = await api.unshareProject(projectId);
      setVisibility(result.visibility);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not stop sharing");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!isShared) {
    return (
      <div className="share-widget">
        <button className="btn" onClick={handleShare} disabled={loading}>
          {loading ? "Creating link…" : "Share"}
        </button>
        {error && <span className="share-widget__error">{error}</span>}
      </div>
    );
  }

  return (
    <div className="share-widget share-widget--active">
      <span className="share-widget__label">Public link:</span>
      <code className="share-widget__url">{publicUrl}</code>
      <button className="btn" onClick={handleCopy}>
        {copied ? "Copied!" : "Copy"}
      </button>
      <button className="btn" onClick={handleUnshare} disabled={loading}>
        Stop sharing
      </button>
      {error && <span className="share-widget__error">{error}</span>}
    </div>
  );
}
