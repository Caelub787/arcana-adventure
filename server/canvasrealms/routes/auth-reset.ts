import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

const CLERK_COOKIE_NAMES = [
  "__session",
  "__client_uat",
  "__clerk_db_jwt",
  "__client",
  "__refresh",
  "__session_-hpbJtYW",
  "__client_uat_-hpbJtYW",
  "__clerk_db_jwt_-hpbJtYW",
  "__client_-hpbJtYW",
  "__refresh_-hpbJtYW",
];

const PATHS_TO_CLEAR = ["/", "/api", "/app", "/sign-in", "/sign-up"];

function clearAllClerkCookies(req: Request, res: Response): void {
  const host = (req.headers["x-forwarded-host"] as string | undefined) ||
    req.headers["host"] ||
    "";
  const hostOnly = host.split(":")[0];
  const domains: (string | undefined)[] = [undefined, hostOnly];

  for (const name of CLERK_COOKIE_NAMES) {
    for (const path of PATHS_TO_CLEAR) {
      for (const domain of domains) {
        const parts = [
          `${name}=`,
          `Path=${path}`,
          `Max-Age=0`,
          `Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
          `SameSite=Lax`,
        ];
        if (domain) parts.push(`Domain=${domain}`);
        // Issue both Secure and non-Secure variants since we don't know
        // how the original was set.
        res.append("Set-Cookie", parts.join("; "));
        res.append("Set-Cookie", parts.concat("Secure").join("; "));
      }
    }
  }
}

router.get("/auth/reset", (req, res) => {
  clearAllClerkCookies(req, res);
  res
    .status(200)
    .type("html")
    .send(`<!doctype html><html><head><meta charset="utf-8"><title>Session reset</title>
<style>body{font-family:system-ui;background:#0a0a14;color:#e6e6e6;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}main{max-width:480px;padding:32px;text-align:center}h1{font-size:20px;margin:0 0 12px}p{opacity:0.8;margin:0 0 24px}a.btn{display:inline-block;background:#5ee0ff;color:#0a0a14;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600}</style>
</head><body><main>
<h1>Session cleared</h1>
<p>Your old sign-in cookies have been removed. Continue to sign in again.</p>
<a class="btn" href="/sign-in">Continue to sign in</a>
</main></body></html>`);
});

export default router;
