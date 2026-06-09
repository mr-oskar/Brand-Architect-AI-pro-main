import type { Request, Response, NextFunction } from "express";
import { ZodError, type ZodTypeAny, z } from "zod";

function formatZodError(err: ZodError) {
  return {
    error: "Validation failed",
    issues: err.issues.map((i) => ({
      path: i.path.join("."),
      code: i.code,
      message: i.message,
    })),
  };
}

export function validateBody<S extends ZodTypeAny>(schema: S) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(formatZodError(parsed.error));
      return;
    }
    (req as any).validatedBody = parsed.data;
    next();
  };
}

export function validateParams<S extends ZodTypeAny>(schema: S) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json(formatZodError(parsed.error));
      return;
    }
    (req as any).validatedParams = parsed.data;
    next();
  };
}

export function getBody<T>(req: Request): T {
  return (req as any).validatedBody as T;
}

export function getParams<T>(req: Request): T {
  return (req as any).validatedParams as T;
}

export const Schemas = {
  EmailStr: z.string().trim().toLowerCase().email().max(254),
  PasswordStr: z.string().min(8).max(200),
  NameStr: z.string().trim().min(1).max(100),
  Role: z.enum(["admin", "user"]),
  UserStatus: z.enum(["active", "suspended"]),
  HexColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex color"),
  IdString: z.string().trim().min(1).max(100),
  IdNumber: z.coerce.number().int().positive(),
  Url: z.string().trim().url().max(2000),
};
