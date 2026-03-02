import express from "express";
import { authRouter } from "./routes/auth.routes";
import { devRouter } from "./routes/dev.routes";
import { verifyToken } from "./middlewares/verifyToken";
import { requireRole } from "./middlewares/requireRole";
import { kycRouter } from "./routes/kyc.routes";


export const app = express();

app.use(express.json());
app.use("/dev", devRouter);
app.use("/auth", authRouter);
app.use("/kyc", kycRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/me", verifyToken, (req, res) => {
  // @ts-ignore
  res.json({ user: req.user });
});
// samo ulogovan
app.get("/protected", verifyToken, (_req, res) => {
  res.json({ ok: true });
});

// samo supervisor
app.get("/super", verifyToken, requireRole("SUPERVISOR"), (_req, res) => {
  res.json({ ok: true, role: "SUPERVISOR" });
});
