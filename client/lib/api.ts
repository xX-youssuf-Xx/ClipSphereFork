// API Configuration
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api/v1";
const BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") || "http://localhost:5000";

export const getApiUrl = () => API_URL;
export const getBaseUrl = () => BASE_URL;

export default API_URL;
