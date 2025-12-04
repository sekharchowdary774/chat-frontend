import axios from "axios";

export const chatApi = axios.create({
  baseURL: "https://chat-backened-2.onrender.com",
});

// Attach token ONLY for protected endpoints
chatApi.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  
  // 🔥 DEBUG - Log everything
  console.log("========== CHATAPI DEBUG ==========");
  console.log("📍 Request URL:", config.url);
  console.log("📍 Full URL:", config.baseURL + config.url);
  console.log("🔑 Token exists?", !!token);
  
  // Check if it's a search endpoint
  const isSearchEndpoint = config.url?.includes('/api/users/search');
  console.log("🔍 Is search endpoint?", isSearchEndpoint);
  console.log("✅ Will add Authorization header?", token && !isSearchEndpoint);
  
  if (token && !isSearchEndpoint) {
    config.headers.Authorization = `Bearer ${token}`;
    console.log("🔐 Added Authorization header");
  } else {
    console.log("⚠️ NOT adding Authorization header");
  }
  
  console.log("===================================");
  
  return config;
});