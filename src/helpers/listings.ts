// helpers/listings.ts
import { supabase } from "../utils/supabase.js";

export async function requireListingOwner(listingId: string, userId: string) {
    const { data: listing, error } = await supabase
        .from("listings")
        .select("user_id")
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
