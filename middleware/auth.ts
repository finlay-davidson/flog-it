// middleware/auth.js
import { supabase } from "../utils/supabase.ts";
import type {
    Request,
    Response,
    NextFunction
} from "express";

export async function authenticate(
    req: Request,
    res: Response,
    next: NextFunction
) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Missing auth header" });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) return res.status(401).json({ error: "Invalid token" });
    (req as any).user = user;
    next();
}
