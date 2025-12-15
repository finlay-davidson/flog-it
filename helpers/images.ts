// helpers/images.ts
import { supabase } from "../utils/supabase.js";

type UploadedFile = Express.Multer.File;

export async function uploadListingImages(
    listingId: string,
    files: UploadedFile[]
) {
    if (!files || files.length === 0) {
        throw new Error("No images uploaded");
    }

    const imageUrls: string[] = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (file.size > 1_000_000) {
            throw new Error("Image exceeds 1MB limit");
        }

        const ext = file.mimetype.split("/")[1];
        const path = `${listingId}/${Date.now()}-${i}.${ext}`;

        const { error } = await supabase.storage
            .from("listings")
            .upload(path, file.buffer, {
                contentType: file.mimetype,
            });

        if (error) {
            throw new Error("Image upload failed");
        }

        const { data } = supabase.storage
            .from("listings")
            .getPublicUrl(path);

        imageUrls.push(data.publicUrl);
    }

    return imageUrls;
}
