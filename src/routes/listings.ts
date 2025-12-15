import express from "express";

import multer from "multer";
import { supabase } from "../utils/supabase.js";
import { authenticate } from "../middleware/auth.js";
import { requireListingOwner } from "../helpers/listings.js";
import { uploadListingImages } from "../helpers/images.js";

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: {
        fileSize: 1_000_000  // 1MB hard limit
    }
});

// Public: get all active listings
router.get("/", express.json(), async (req, res) => {

    const { q, minPrice, maxPrice } = req.query;

    let query = supabase
        .from('listings')
        .select(`
            *,
            profile:user_id (
                display_name
            )
        `)
        .eq('is_active', true);

    if (q) {
        query = query.ilike("title", `%${q}%`);
    }

    if (minPrice) {
        query = query.gte("price", Number(minPrice));
    }

    if (maxPrice) {
        query = query.lte("price", Number(maxPrice));
    }

    const { data, error } = await query
        .order("created_at", { ascending: false });

    if (error) {
        return res.status(500).json({ error: "Failed to load listings" });
    }

    res.json(data);
});

// Public: get single listing
router.get("/:id", express.json(), async (req, res) => {
    const { data, error } = await supabase
        .from("listings")
        .select("*, profile:user_id (*)")
        .eq("id", req.params.id)
        .eq("is_active", true)
        .single();

    if (error) return res.status(404).json({ error: "Listing not found" });
    res.json(data);
});

// Authenticated: create listing
router.post("/", express.json(), authenticate, async (req, res) => {
    const user = (req as any).user;
    const {
        title,
        description,
        price,
        category_id,
        location_text,
        location_lat,
        location_lng
    } = req.body;

    const { data, error } = await supabase
        .from("listings")
        .insert({
            title,
            description,
            price,
            category_id,
            user_id: user.id,
            location_text,
            location_lat,
            location_lng,
            is_active: true
        })
        .select();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data[0]);
});
router.put("/:id/images", express.json(), authenticate, async (req, res) => {



});
router.post(
    "/:id/images",
    authenticate,
    upload.array("images", 10),
    async (req, res) => {
        const user = req.user;
        const { id } = req.params;
        
        await requireListingOwner(id, user.id);


        const imageUrls = await uploadListingImages(
            id,
            req.files as Express.Multer.File[]
        );

        // 3. Save image URLs
        await supabase
            .from("listings")
            .update({ images: imageUrls })
            .eq("id", id);

        res.json({ success: true });
    }
);

// Authenticated: update listing (owner only)
router.put("/:id", express.json(), authenticate, async (req, res) => {
    const { title, description, price, category, location, images } = req.body;

    // check ownership
    const { data: listing, error: fetchError } = await supabase
        .from("listings")
        .select("*")
        .eq("id", req.params.id)
        .single();

    if (fetchError || !listing) return res.status(404).json({ error: "Listing not found" });
    if (listing.owner_id !== req.user.id) return res.status(403).json({ error: "Forbidden" });

    const { data, error } = await supabase
        .from("listings")
        .update({ title, description, price, category, location, images })
        .eq("id", req.params.id)
        .select();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data[0]);
});



// Authenticated: delete listing (soft delete)
router.delete("/:id", express.json(), authenticate, async (req, res) => {
    const { data: listing, error: fetchError } = await supabase
        .from("listings")
        .select("*")
        .eq("id", req.params.id)
        .single();

    if (fetchError || !listing) return res.status(404).json({ error: "Listing not found" });
    if (listing.owner_id !== req.user.id) return res.status(403).json({ error: "Forbidden" });

    const { data, error } = await supabase
        .from("listings")
        .update({ is_active: false })
        .eq("id", req.params.id)
        .select();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: "Listing deleted" });
});

export default router;
