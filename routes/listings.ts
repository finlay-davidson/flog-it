import express from "express";

import multer from "multer";
import { supabase } from "../utils/supabase.ts";
import { authenticate } from "../middleware/auth.ts";
import { requireListingOwner } from "../helpers/listings.ts";
import { uploadListingImages } from "../helpers/images.ts";

const bucketUrl = "https://pvfwwwovnyylktrsfqkn.supabase.co/storage/v1/object/public/listings";
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

    const { data: listings, error } = await query
        .order("created_at", { ascending: false });

    if (error) {
        return res.status(500).json({ error: "Failed to load listings" });
    }

    for (let i = 0; i < listings.length; i++) {
        const maxImages = listings[i].image_count;
        const thumbs: string[] = [];

        for (let j = 0; j < maxImages; j++) {
            const thumbUrl = `${bucketUrl}/${listings[i].id}/${j}-thumb.jpeg`;
            thumbs.push(thumbUrl);
        }
        listings[i].thumbnails = thumbs;
    }

    res.json(listings);
});

// Public: get single listing
router.get("/:id", express.json(), async (req, res) => {
    const { data: listing, error } = await supabase
        .from("listings")
        .select("*, profile:user_id (*)")
        .eq("id", req.params.id)
        .eq("is_active", true)
        .single();

    if (error) return res.status(404).json({ error: "Listing not found" });

    const maxImages = listing.image_count;
    const images: string[] = [];

    for (let i = 0; i < maxImages; i++) {
        const fullUrl = `${bucketUrl}/${listing.id}/${i}.jpeg`;
        images.push(fullUrl);
    }

    listing.images = images;

    res.json(listing);
});

// Authenticated: create listing
router.post("/", express.json(), authenticate, async (req, res) => {
    const user = (req as any).user;
    const {
        title,
        description,
        price,
        category_id,
        locality_name,
        locality_id,
        region_code,
        place_name,
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
            locality_name,
            locality_id,
            region_code,
            place_name,
            location_lat,
            location_lng,
            is_active: true
        })
        .select();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data[0]);
});

// Authenticated: upload listing images (owner only)
router.put("/:id/images", express.json(), authenticate, async (req, res) => {

});


router.post(
    "/:id/images",
    authenticate,
    upload.array("images", 10),
    async (req, res) => {
        const user = req.user;
        const { id } = req.params;
        
        await requireListingOwner(id, user!.id);

        const { imageUrls } = await uploadListingImages(
            id,
            req.files as Express.Multer.File[]
        );

        // 3. Save image URLs
        await supabase
            .from("listings")
            .update({ image_count: imageUrls.length ?? 0 })
            .eq("id", id);

        res.json({ success: true });
    }
);

// Authenticated: update listing (owner only)
router.put("/:id", express.json(), authenticate, async (req, res) => {
    const user = req.user;
    const { id } = req.params;
    const { title, description, price, category, location, images } = req.body;

    await requireListingOwner(id, user!.id);

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
    if (listing.owner_id !== req.user!.id) return res.status(403).json({ error: "Forbidden" });

    const { data, error } = await supabase
        .from("listings")
        .update({ is_active: false })
        .eq("id", req.params.id)
        .select();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: "Listing deleted" });
});

export default router;
