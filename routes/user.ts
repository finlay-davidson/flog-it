import express from "express";
import { supabase } from "../utils/supabase.ts";
import { authenticate } from "../middleware/auth.ts";
import { generateThumbPaths } from "../helpers/listings.ts";

const router = express.Router();

// Authenticated: get a users listings
router.get("/listings", authenticate, async (req, res) => {
    const user = req.user!;
    const { data: listings, error } = await supabase
        .from("listings")
        .select(`
            *
        `)
        .eq("user_id", user.id);

    if (error) {
        return res.status(500).json({ error: "Failed to load user's listings" });
    }

    for (let i = 0; i < listings.length; i++) {
        const maxImages = listings[i].image_count;
 
        listings[i].thumbs = generateThumbPaths(listings[i].id, maxImages);
    }

    res.json(listings);
});


export default router;