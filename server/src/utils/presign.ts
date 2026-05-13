import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../config/s3";

/**
 * Replace internal S3 endpoint with public endpoint in presigned URL
 * Used when generating URLs for frontend consumption
 */
function replaceEndpointInUrl(url: string): string {
    if (!process.env.S3_PUBLIC_ENDPOINT) {
        return url;
    }
    
    // Replace internal endpoint with public endpoint
    // Internal: http://minio:9000 → External: https://clipsphere.8bitsolutions.net:9000
    const internalEndpoint = process.env.S3_ENDPOINT!;
    return url.replace(internalEndpoint, process.env.S3_PUBLIC_ENDPOINT);
}

export async function createDownloadUrl(key: string) {
    const command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: key,
    });

    const url = await getSignedUrl(s3, command, {
        expiresIn: 60 * 5,
    });

    return replaceEndpointInUrl(url);
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

    return replaceEndpointInUrl(url);
}