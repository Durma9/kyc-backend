import { Router } from "express";
import bcrypt from "bcrypt";
import { pool } from "../config/db";

export const devRouter = Router();

// DEV ONLY: creates demo accounts (employee + supervisor)
devRouter.get("/seed", async (_req, res) => {
  try {
    const employeeUsername = "employee1";
    const supervisorUsername = "supervisor1";

    const employeePass = "Password123!";
    const supervisorPass = "Password123!";

    const employeeHash = await bcrypt.hash(employeePass, 10);
    const supervisorHash = await bcrypt.hash(supervisorPass, 10);

    // Upsert-like behavior (delete if exists, then insert)
    await pool.query("DELETE FROM users WHERE username IN ($1, $2)", [
      employeeUsername,
      supervisorUsername,
    ]);

    await pool.query(
      "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)",
      [employeeUsername, employeeHash, "EMPLOYEE"]
    );

    await pool.query(
      "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)",
      [supervisorUsername, supervisorHash, "SUPERVISOR"]
    );

    res.json({
      ok: true,
      created: [
        { username: employeeUsername, role: "EMPLOYEE", password: employeePass },
        { username: supervisorUsername, role: "SUPERVISOR", password: supervisorPass },
      ],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Seed failed" });
  }
});