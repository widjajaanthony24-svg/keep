import { Router } from "express";
import { z } from "zod";
import { createId } from "@paralleldrive/cuid2";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { requireAuth, type AuthedRequest } from "../auth/auth.middleware.js";
import {
  createEmptyBuildingGraph,
  sampleBuilding,
  validateBuildingGraph,
} from "@keep/building-graph";

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

const CreateProjectSchema = z.object({
  name: z.string().min(1),
  mode: z.enum(["creative", "contract"]).default("creative"),
  startFrom: z.enum(["blank", "sample"]).default("blank"),
});

projectsRouter.get("/", async (req: AuthedRequest, res) => {
  const projects = await prisma.project.findMany({
    where: { ownerId: req.userId },
    select: {
      id: true,
      name: true,
      mode: true,
      visibility: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });
  res.json(projects);
});

projectsRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = CreateProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }
  const { name, mode, startFrom } = parsed.data;

  const graphId = createId();
  const buildingGraph =
    startFrom === "sample"
      ? { ...sampleBuilding, id: graphId, name }
      : createEmptyBuildingGraph(name, graphId);

  const project = await prisma.project.create({
    data: {
      name,
      mode,
      ownerId: req.userId!,
      buildingGraph: buildingGraph as unknown as Prisma.InputJsonValue,
    },
  });
  res.status(201).json(project);
});

projectsRouter.get("/:id", async (req: AuthedRequest, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.id } });
  if (!project || project.ownerId !== req.userId) {
    return res.status(404).json({ error: "Project not found" });
  }
  res.json(project);
});

const UpdateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  mode: z.enum(["creative", "contract"]).optional(),
  visibility: z.enum(["private", "unlisted", "public"]).optional(),
  buildingGraph: z.unknown().optional(),
});

projectsRouter.put("/:id", async (req: AuthedRequest, res) => {
  const existing = await prisma.project.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.ownerId !== req.userId) {
    return res.status(404).json({ error: "Project not found" });
  }

  const parsed = UpdateProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  const { buildingGraph, ...rest } = parsed.data;

  if (buildingGraph !== undefined) {
    const validation = validateBuildingGraph(buildingGraph);
    if (!validation.success) {
      return res.status(400).json({
        error: "buildingGraph failed schema validation",
        issues: validation.error.issues,
      });
    }
  }

  const project = await prisma.project.update({
    where: { id: req.params.id },
    data: {
      ...rest,
      ...(buildingGraph !== undefined
        ? { buildingGraph: buildingGraph as unknown as Prisma.InputJsonValue }
        : {}),
    },
  });
  res.json(project);
});

projectsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const existing = await prisma.project.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.ownerId !== req.userId) {
    return res.status(404).json({ error: "Project not found" });
  }
  await prisma.project.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// Generates (or reuses) a share slug and makes the project publicly readable
// at GET /public/projects/:slug — no login required for that endpoint.
projectsRouter.post("/:id/share", async (req: AuthedRequest, res) => {
  const existing = await prisma.project.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.ownerId !== req.userId) {
    return res.status(404).json({ error: "Project not found" });
  }
  const shareSlug = existing.shareSlug ?? createId();
  const project = await prisma.project.update({
    where: { id: req.params.id },
    data: { visibility: "public", shareSlug },
  });
  res.json({ shareSlug: project.shareSlug, visibility: project.visibility });
});

// Turns public sharing back off. Keeps the same slug so re-sharing later
// produces the same link rather than invalidating anything already sent out.
projectsRouter.post("/:id/unshare", async (req: AuthedRequest, res) => {
  const existing = await prisma.project.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.ownerId !== req.userId) {
    return res.status(404).json({ error: "Project not found" });
  }
  const project = await prisma.project.update({
    where: { id: req.params.id },
    data: { visibility: "private" },
  });
  res.json({ visibility: project.visibility });
});
