import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../api/client";

export function LoginPage() {
  const navigate = useNavigate();
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("demo@keep.local");
  const [password, setPassword] = useState("keep-demo-1234");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = isSignup
        ? await api.signup(email, password, name || undefined)
        : await api.login(email, password);
      setToken(result.token);
      navigate("/projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="eyebrow">Keep</div>
        <h1>{isSignup ? "Create an account" : "Sign in"}</h1>
        <p className="muted">
          Phase 0 seed data includes a demo account: <code>demo@keep.local</code> /{" "}
          <code>keep-demo-1234</code>
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          {isSignup && (
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && <div className="form-error">{error}</div>}

          <button type="submit" className="btn btn--primary" disabled={loading}>
            {loading ? "Working…" : isSignup ? "Create account" : "Sign in"}
          </button>
        </form>

        <button className="link-btn" onClick={() => setIsSignup((v) => !v)}>
          {isSignup ? "Have an account? Sign in" : "New here? Create an account"}
        </button>
      </div>
    </div>
  );
}
