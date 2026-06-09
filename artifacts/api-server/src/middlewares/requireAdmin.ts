import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { requireAuth, type AuthRequest } from "./requireAuth";

export interface AdminRequest extends AuthRequest {
  userRole: string;
  userEmail: string | null;
}

const DEMO_USER_ID = "demo-user";

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, async () => {
    const userId = (req as AuthRequest).userId;

    // Demo identities never get admin access — admin role must be granted
    // to a real authenticated user record stored in the database.
    if (userId === DEMO_USER_ID) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    try {
      const [user] = await db
        .select({ id: usersTable.id, email: usersTable.email, role: usersTable.role })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);

      if (!user || user.role !== "admin") {
        res.status(403).json({ error: "Admin access required" });
        return;
      }
      (req as AdminRequest).userRole = user.role;
      (req as AdminRequest).userEmail = user.email;
      next();
    } catch (e) {
      res.status(500).json({ error: "Authorization check failed" });
    }
  });
}
