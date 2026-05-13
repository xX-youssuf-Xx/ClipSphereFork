// API Configuration
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api/v1";
const BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") || "http://localhost:5000";
const S3_ENDPOINT = process.env.NEXT_PUBLIC_S3_ENDPOINT || "http://localhost:9000";

export const getApiUrl = () => API_URL;
export const getBaseUrl = () => BASE_URL;
export const getS3Endpoint = () => S3_ENDPOINT;

export default API_URL;
