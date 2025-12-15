// helpers/images.ts
import { supabase } from "../utils/supabase.ts";
import sharp from "sharp";

type UploadedFile = Express.Multer.File;

/**
 * Upload or replace listing images and thumbnails
 * @param listingId Listing ID
 * @param files Array of uploaded files
 * @param oldImagePaths Optional: existing full image paths to delete
 * @param oldThumbnailPaths Optional: existing thumbnail paths to delete
 */
export async function uploadListingImages(
    listingId: string,
    files: UploadedFile[],
    oldImagePaths: string[] = [],
    oldThumbnailPaths: string[] = []
) {
    if (!files || files.length === 0) {
        throw new Error("No images uploaded");
    }

    const imageUrls: string[] = [];
    const thumbnailUrls: string[] = [];

    // --- 0. Delete old images if provided ---
    for (const path of oldImagePaths) {
        await supabase.storage.from("listings").remove([path]).catch(() => {});
    }
    for (const path of oldThumbnailPaths) {
        await supabase.storage.from("listings").remove([path]).catch(() => {});
    }

    // --- 1. Upload new files ---
    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        const fullPath = `${listingId}/${i}.webp`;
        const imgBuffer = await sharp(file.buffer)
            .webp({ quality: 80 })
            .toBuffer();

        const { error: uploadError } = await supabase.storage
            .from("listings")
            .upload(fullPath, imgBuffer, { contentType: file.mimetype, upsert: true });

        if (uploadError) throw new Error(`Full image upload failed for index ${i}`);

        const { data: fullData } = supabase.storage.from("listings").getPublicUrl(fullPath);
        imageUrls.push(fullData.publicUrl);

        // --- Thumbnail ---
        const thumbBuffer = await sharp(file.buffer)
            .resize(300, 300, { fit: "cover", position: "center" })
            .webp({ quality: 80 })
            .toBuffer();

        const thumbPath = `${listingId}/${i}-thumb.webp`;
        const { error: thumbError } = await supabase.storage
            .from("listings")
            .upload(thumbPath, thumbBuffer, { contentType: file.mimetype, upsert: true });

        if (thumbError) throw new Error(`Thumbnail upload failed for index ${i}`);

        const { data: thumbData } = supabase.storage.from("listings").getPublicUrl(thumbPath);
        thumbnailUrls.push(thumbData.publicUrl);
    }

    return { imageUrls, thumbnailUrls };
}
