// routes/listings.js
import express from "express";
import multer from "multer";
import { supabase } from "../utils/supabaseClient.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: {
        fileSize: 1 * 1024 * 1024 // 1MB hard limit
    }
});

// Public: get all active listings
router.get("/", async (req, res) => {

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
router.get("/:id", async (req, res) => {
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
router.post("/", authenticate, async (req, res) => {
    const user = req.user;
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

router.post(
    "/:id/images",
    authenticate,
    upload.array("images", 10),
    async (req, res) => {
        const user = req.user;
        const { id } = req.params;

        // 1. Verify ownership
        const { data: listing } = await supabase
            .from("listings")
            .select("user_id")
            .eq("id", id)
            .single();

        if (!listing || listing.user_id !== user.id) {
            return res.status(403).json({ error: "Forbidden" });
        }

        // 2. Validate files
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: "No images uploaded" });
        }

        const imageUrls = [];

        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];

            // Double check size (defensive)
            if (file.size > 1_000_000) {
                return res.status(400).json({ error: "Image exceeds 1MB limit" });
            }

            const ext = file.mimetype.split("/")[1];
            const path = `${id}/${Date.now()}-${i}.${ext}`;

            const { error } = await supabase.storage
                .from("listings")
                .upload(path, file.buffer, {
                contentType: file.mimetype
                });

            if (error) {
                return res.status(500).json({ error: "Image upload failed" });
            }

            const { data } = supabase.storage
                .from("listings")
                .getPublicUrl(path);

            imageUrls.push(data.publicUrl);
        }

        // 3. Save image URLs
        await supabase
            .from("listings")
            .update({ images: imageUrls })
            .eq("id", id);

        res.json({ success: true });
    }
);

// Authenticated: update listing (owner only)
router.put("/:id", authenticate, async (req, res) => {
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
router.delete("/:id", authenticate, async (req, res) => {
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
