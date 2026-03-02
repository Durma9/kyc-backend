import { Router } from "express";
import { z } from "zod";
import { pool } from "../config/db";
import { verifyToken } from "../middlewares/verifyToken";
import { requireRole } from "../middlewares/requireRole";

export const kycRouter = Router();

const createSchema = z.object({
  username: z.string().min(1),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  document_country: z.string().min(1),
  document_image_ocr: z.string().min(1),
  deposited: z.number().nonnegative(),
});

// EMPLOYEE creates a new KYC application
kycRouter.post("/", verifyToken, requireRole("EMPLOYEE"), async (req, res) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input" });

    const data = parsed.data;

    const result = await pool.query(
      `INSERT INTO kyc_applications
      (username, first_name, last_name, document_country, document_image_ocr, deposited, status)
      VALUES ($1,$2,$3,$4,$5,$6,'PENDING')
      RETURNING id, username, deposited, status, created_at`,
      [
        data.username,
        data.first_name,
        data.last_name,
        data.document_country,
        data.document_image_ocr,
        data.deposited,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Create failed" });
  }
});

kycRouter.get("/", verifyToken, async (req, res) => {
  const ocr = typeof req.query.ocr === "string" ? req.query.ocr.trim() : "";
  try {
    const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";

    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 10;

    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const safeLimit = Number.isFinite(limit) && limit > 0 && limit <= 50 ? limit : 10;
    const offset = (safePage - 1) * safeLimit;

    const where: string[] = [];
    const values: any[] = [];

    if (query) {
      values.push(`%${query}%`);
      where.push(`username ILIKE $${values.length}`);
    }
    if (ocr) {
      values.push(ocr);
      where.push(`similarity(lower(document_image_ocr), lower($${values.length})) > 0.1`);
    }

    if (status) {
      values.push(status);
      where.push(`status = $${values.length}::kyc_status`);
    }

    values.push(safeLimit);
    values.push(offset);

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const dataSql = `
      SELECT id, username, deposited, status, created_at
      FROM kyc_applications
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `;

    // count query (same filters, without limit/offset)
    const countSql = `
      SELECT COUNT(*)::int as count
      FROM kyc_applications
      ${whereSql}
    `;

    const countValues = values.slice(0, values.length - 2);

    const [dataRes, countRes] = await Promise.all([
      pool.query(dataSql, values),
      pool.query(countSql, countValues),
    ]);

    res.json({
      page: safePage,
      limit: safeLimit,
      total: countRes.rows[0].count,
      items: dataRes.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "List failed" });
  }
});

kycRouter.patch("/:id/approve", verifyToken, requireRole("EMPLOYEE"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

    const result = await pool.query(
      `UPDATE kyc_applications
       SET status = 'APPROVED', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, username, deposited, status`,
      [id]
    );

    if (!result.rows[0]) return res.status(404).json({ message: "Not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Approve failed" });
  }
});

kycRouter.patch("/:id/reject", verifyToken, requireRole("EMPLOYEE"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

    // get deposited first
    const found = await pool.query(
      `SELECT id, deposited, status FROM kyc_applications WHERE id = $1`,
      [id]
    );
    const row = found.rows[0];
    if (!row) return res.status(404).json({ message: "Not found" });

    const deposited = Number(row.deposited);
    const nextStatus = deposited > 10000 ? "PENDING_SUPERVISOR" : "REJECTED";

    const result = await pool.query(
      `UPDATE kyc_applications
       SET status = $2::kyc_status, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, username, deposited, status`,
      [id, nextStatus]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Reject failed" });
  }
});

kycRouter.patch(
  "/:id/supervisor/reject",
  verifyToken,
  requireRole("SUPERVISOR"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

      const found = await pool.query(
        `SELECT id, status FROM kyc_applications WHERE id = $1`,
        [id]
      );
      const row = found.rows[0];
      if (!row) return res.status(404).json({ message: "Not found" });

      if (row.status !== "PENDING_SUPERVISOR") {
        return res.status(400).json({ message: "Not in PENDING_SUPERVISOR state" });
      }

      const result = await pool.query(
        `UPDATE kyc_applications
         SET status = 'REJECTED', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING id, status`,
        [id]
      );

      res.json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Supervisor reject failed" });
    }
  }
);

kycRouter.patch(
  "/:id/supervisor/approve",
  verifyToken,
  requireRole("SUPERVISOR"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

      const found = await pool.query(
        `SELECT id, status FROM kyc_applications WHERE id = $1`,
        [id]
      );
      const row = found.rows[0];
      if (!row) return res.status(404).json({ message: "Not found" });

      if (row.status !== "PENDING_SUPERVISOR") {
        return res.status(400).json({ message: "Not in PENDING_SUPERVISOR state" });
      }

      const result = await pool.query(
        `UPDATE kyc_applications
         SET status = 'APPROVED', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING id, username, status`,
        [id]
      );

      res.json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Supervisor approve failed" });
    }
  }
);

kycRouter.get("/:id", verifyToken, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

    const result = await pool.query(
      `SELECT id, username, first_name, last_name, document_country, document_image_ocr,
              deposited, status, created_at, updated_at
       FROM kyc_applications
       WHERE id = $1`,
      [id]
    );

    if (!result.rows[0]) return res.status(404).json({ message: "Not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Get failed" });
  }
});