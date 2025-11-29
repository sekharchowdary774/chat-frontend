import axios from "axios";

export const chatApi = axios.create({
  baseURL: "https://chat-backened-2.onrender.com",
});

// Attach token ONLY for protected endpoints
chatApi.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  
  // 🔥 Don't send token to public search endpoint
  const isSearchEndpoint = config.url?.includes('/api/users/search');
  
  if (token && !isSearchEndpoint) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  return config;
});