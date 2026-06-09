import { Router, type IRouter } from "express";
import { getJob } from "../lib/jobStore";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get(
  "/jobs/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const jobId = String(req.params.id);
    const job = getJob(jobId);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    const userId = (req as AuthRequest).userId;
    if (job.userId && job.userId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    res.json(job);
  }),
);

export default router;
