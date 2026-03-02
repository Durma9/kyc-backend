import { Request, Response, NextFunction } from "express";

export function requireRole(role: "EMPLOYEE" | "SUPERVISOR") {
  return (req: Request, res: Response, next: NextFunction) => {
    // @ts-ignore
    const user = req.user;

    if (!user) return res.status(401).json({ message: "Not authenticated" });

    if (user.role !== role) {
      return res.status(403).json({ message: "Forbidden" });
    }

    next();
  };
}