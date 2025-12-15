import express from "express";

import multer, { MulterError} from "multer";
import { supabase } from "../utils/supabase.ts";
import { authenticate } from "../middleware/auth.ts";
import { requireListingOwner, generateThumbPaths, generateImagePaths } from "../helpers/listings.ts";
import { uploadListingImages } from "../helpers/images.ts";

const bucketUrl = "https://pvfwwwovnyylktrsfqkn.supabase.co/storage/v1/object/public/listings";
const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: {
        fileSize: 1_200_000  // 1MB hard limit
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
 
        listings[i].thumbs = generateThumbPaths(listings[i].id, maxImages);
    }

    res.json(listings);
});

// Public: get single listing
router.get("/:id", express.json(), async (req, res) => {
    const { data: listing, error } = await supabase
        .from("listings")
        .select(`
            *, 
            profile:user_id (*),
            category:category_id (name)
        `)
        .eq("id", req.params.id)
        .eq("is_active", true)
        .single();

    if (error) return res.status(404).json({ error: "Listing not found" });

    listing.images = generateImagePaths(listing.id, listing.image_count);

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
        region_code,
        place_id,
        place_name,
        locality_id,
        locality_name,
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
            region_code,
            place_id,
            place_name,
            locality_id,
            locality_name,
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
    const { title, description, price, category_id, 
        region_code,
        place_id,
        place_name,
        locality_name,
        locality_id,
        location_lat,
        location_lng } = req.body;
    
    await requireListingOwner(id, user!.id);

     await supabase.from("listings").update({
        title,
        description,
        price: Number(price),
        category_id,
        region_code,
        place_id,
        place_name,
        locality_name,
        locality_id,
        location_lat,
        location_lng,
    }).eq("id", id);

    res.json({ success: true, message: 'Listing updated' });
});

// Authenticated: update listing images (owner only)
router.put("/:id/images", authenticate, upload.array("images", 10), async (req, res) => {
    const user = req.user;
    const { id } = req.params;

    const listing = await requireListingOwner(id, user!.id);

    const { imageUrls, thumbnailUrls } = await uploadListingImages(
        id,
        req.files as Express.Multer.File[],
        generateImagePaths(id, listing.image_count),
        generateThumbPaths(id, listing.image_count)
    );

    // 3. Save image URLs
    await supabase
        .from("listings")
        .update({ image_count: imageUrls.length ?? 0 })
        .eq("id", id);
        
    res.json({ success: true });
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

router.use((err: any, req: any, res: any, next: any) => {
    if (err instanceof MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
                error: "Image must be smaller than 1MB"
            });
        }
    }

    if (err instanceof Error) {
        return res.status(400).json({ error: err.message });
    }

    next(err);
});

export default router;
