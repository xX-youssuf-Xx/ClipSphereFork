import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../config/s3";

/**
 * Transform presigned URL to use /storage/ path instead of direct port 9000
 * This allows Nginx to handle the request and add proper CORS headers
 * 
 * Input:  https://clipsphere.8bitsolutions.net:9000/clipsphere/videos/...?X-Amz-...
 * Output: https://clipsphere.8bitsolutions.net/storage/clipsphere/videos/...?X-Amz-...
 */
function transformPresignedUrl(url: string): string {
    if (!process.env.S3_PUBLIC_ENDPOINT) {
        return url;
    }
    
    try {
        const urlObj = new URL(url);
        const publicEndpoint = new URL(process.env.S3_PUBLIC_ENDPOINT!);
        
        // Replace the hostname and port with the public endpoint's hostname
        urlObj.hostname = publicEndpoint.hostname;
        urlObj.port = '';  // Remove port since /storage/ is on standard HTTPS
        
        // Replace the path from /bucket/key to /storage/bucket/key
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        urlObj.pathname = '/storage/' + pathParts.join('/');
        
        return urlObj.toString();
    } catch (error) {
        console.error('Failed to transform presigned URL:', error);
        return url;  // Return original URL if transformation fails
    }
}

export async function createDownloadUrl(key: string) {
    const command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: key,
    });

    const url = await getSignedUrl(s3, command, {
        expiresIn: 60 * 5,
    });

    return transformPresignedUrl(url);
}

export async function deleteFile(key: string) {
    const command = new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: key,
    });

    await s3.send(command).catch((err) => {
        console.error("S3 Deletion Error:", err);
    });
}

export async function createUploadUrl(key: string, contentType: string) {
    const command = new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        ContentType: contentType,
    });

    const url = await getSignedUrl(s3, command, {
        expiresIn: 60 * 5,
    });

    return transformPresignedUrl(url);
}