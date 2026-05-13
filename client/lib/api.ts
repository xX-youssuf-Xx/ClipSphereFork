// API Configuration
const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://clipsphere.8bitsolutions.net/api/v1";
const BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") || "https://clipsphere.8bitsolutions.net";
const S3_ENDPOINT = process.env.NEXT_PUBLIC_S3_ENDPOINT || "https://clipsphere.8bitsolutions.net";

export const getApiUrl = () => API_URL;
export const getBaseUrl = () => BASE_URL;
export const getS3Endpoint = () => S3_ENDPOINT;

export default API_URL;
