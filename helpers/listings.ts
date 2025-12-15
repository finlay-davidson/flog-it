// helpers/listings.ts
import { supabase } from "../utils/supabase.ts";
const bucketUrl = "https://pvfwwwovnyylktrsfqkn.supabase.co/storage/v1/object/public/listings";

export async function requireListingOwner(listingId: string, userId: string) {
    const { data: listing, error } = await supabase
        .from("listings")
        .select("*")
        .eq("id", listingId)
        .single();

    if (error || !listing) {
        throw new Error("Listing not found");
    }

    if (listing.user_id !== userId) {
        throw new Error("Forbidden");
    }

    return listing;
}

export function generateImagePaths(listingId: string, imageCount: number) {

    let images: string[] = [];

    for (let i = 0; i < imageCount; i++) {

        images.push(`${bucketUrl}/${listingId}/${i}.webp`);
    }

    return images;
}

export function generateThumbPaths(listingId: string, imageCount: number) {

    let thumbs: string[] = [];

    for (let i = 0; i < imageCount; i++) {

        thumbs.push(`${bucketUrl}/${listingId}/${i}-thumb.webp`);
    }

    return thumbs;
}
