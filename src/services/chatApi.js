import axios from "axios";

export const chatApi = axios.create({
  baseURL: "https://chat-backened-2.onrender.com",
});

// Attach token for ALL protected endpoints (only exclude login/register)
chatApi.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  // 🔥 DEBUG - Log everything
  console.log("========== CHATAPI DEBUG ==========");
  console.log("📍 Request URL:", config.url);
  console.log("📍 Full URL:", config.baseURL + config.url);
  console.log("🔑 Token exists?", !!token);

  // public endpoints only
  const isPublic =
    config.url?.includes("/api/auth/login") ||
    config.url?.includes("/api/auth/signup");

  console.log("🔍 Is public endpoint?", isPublic);
  console.log("✅ Will add Authorization header?", token && !isPublic);

  // FIX: Always add token unless login/register
  if (token && !isPublic) {
    config.headers.Authorization = `Bearer ${token}`;
    console.log("🔐 Added Authorization header");
  } else {
    console.log("⚠️ NOT adding Authorization header");
  }

  console.log("===================================");

  return config;
});
