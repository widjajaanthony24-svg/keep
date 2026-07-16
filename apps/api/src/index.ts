import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { authRouter } from "./auth/auth.routes.js";
import { projectsRouter } from "./projects/projects.routes.js";
import { publicRouter } from "./projects/public.routes.js";

const app = express();

app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: "5mb" })); // building graphs can get large with many elements

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "keep-api" });
});

app.use("/auth", authRouter);
app.use("/projects", projectsRouter);
app.use("/public", publicRouter);

app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
});

app.listen(env.PORT, () => {
  console.log(`keep-api listening on port ${env.PORT}`);
});
