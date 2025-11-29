import axios from "axios";

export const chatApi = axios.create({
  baseURL: "https://chat-backened-2.onrender.com/api",
});

// Attach token ONLY for protected endpoints
chatApi.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  
  // 🔥 Don't send token to public endpoints
  const publicEndpoints = ['/api/users/search', '/api/auth/'];
  const isPublic = publicEndpoints.some(endpoint => config.url?.includes(endpoint));
  
  if (token && !isPublic) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  return config;
});