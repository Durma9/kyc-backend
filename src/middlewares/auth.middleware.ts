import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export type AuthUser = {
  userId: number;
  username: string;
  role: "EMPLOYEE" | "SUPERVISOR";
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function verifyToken(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;

    if (!header) {
      return res.status(401).json({ message: "Missing Authorization header" });
    }

    const [type, token] = header.split(" ");

    if (type !== "Bearer" || !token) {
      return res
        .status(401)
        .json({ message: "Invalid Authorization format. Use Bearer <token>" });
    }

    const secret = process.env.JWT_SECRET;

    if (!secret) {
      return res.status(500).json({ message: "Missing JWT_SECRET" });
    }

    const payload = jwt.verify(token, secret) as AuthUser;

    req.user = payload;

    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

export function requireRole(role: "EMPLOYEE" | "SUPERVISOR") {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (req.user.role !== role) {
      return res.status(403).json({ message: "Forbidden" });
    }

    next();
  };
}