import { Router } from "express";
import { prisma } from "../db.js";

export const publicRouter = Router();

// No auth middleware on this router at all — this is the whole point of a
// shareable link. Only projects explicitly marked visibility: "public"
// (via POST /projects/:id/share) are ever returned here, and only by their
// exact share slug — there's no way to list or guess into other projects.
publicRouter.get("/projects/:slug", async (req, res) => {
  const project = await prisma.project.findUnique({ where: { shareSlug: req.params.slug } });
  if (!project || project.visibility !== "public") {
    return res.status(404).json({ error: "This link is invalid or is no longer shared" });
  }
  res.json({ name: project.name, buildingGraph: project.buildingGraph, updatedAt: project.updatedAt });
});
