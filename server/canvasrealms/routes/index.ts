import { Router, type IRouter } from "express";
import healthRouter from "./health";
import realmsRouter from "./realms";
import nodesRouter from "./nodes";
import foldersRouter from "./folders";
import relationshipsRouter from "./relationships";
import viewportsRouter from "./viewports";
import compassRouter from "./compass";
import canvasMembersRouter from "./canvas-members";
import collaboratorsRouter from "./collaborators";
import storageRouter from "./storage";
import authResetRouter from "./auth-reset";
import arcanaRouter, { publicArcanaRouter } from "./arcana";
import wikiRouter, { publicWikiRouter } from "./wiki";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// Public: health check.
router.use(healthRouter);

// Public: clear stale Clerk cookies (for recovery from instance changes).
router.use(authResetRouter);

// Public: Arcana OAuth callback (no Clerk session — auth is the signed
// `state` we issued). The authenticated arcana routes (authorize/unlink/openapi)
// are mounted below after requireAuth.
router.use(publicArcanaRouter);

// Public: published wiki snapshot lookup by realm slug. Anyone with the link
// can read the live snapshot — no Clerk session required.
router.use(publicWikiRouter);

// All other API routes require an authenticated Clerk session.
// Note: object storage is mounted AFTER requireAuth — `<img src="/api/storage/objects/...">`
// works because Clerk session cookies are sent automatically on same-origin GETs.
router.use(requireAuth);
router.use(storageRouter);

router.use(realmsRouter);
router.use(collaboratorsRouter);
router.use(nodesRouter);
router.use(foldersRouter);
router.use(relationshipsRouter);
router.use(viewportsRouter);
router.use(compassRouter);
router.use(canvasMembersRouter);
router.use(arcanaRouter);
router.use(wikiRouter);

export default router;
