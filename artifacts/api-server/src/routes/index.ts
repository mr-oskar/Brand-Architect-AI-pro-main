import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import brandsRouter from "./brands";
import campaignsRouter from "./campaigns";
import postsRouter from "./posts";
import dashboardRouter from "./dashboard";
import jobsRouter from "./jobs";
import imagesRouter from "./images";
import designsRouter from "./designs";
import nodesRouter from "./nodes";
import adminRouter, { publicSettingsRouter } from "./admin";
import adminPlatformRouter from "./admin-platform";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(brandsRouter);
router.use(campaignsRouter);
router.use(postsRouter);
router.use(dashboardRouter);
router.use(jobsRouter);
router.use(imagesRouter);
router.use(designsRouter);
router.use(nodesRouter);
router.use(publicSettingsRouter);
router.use(adminRouter);
router.use(adminPlatformRouter);

export default router;
