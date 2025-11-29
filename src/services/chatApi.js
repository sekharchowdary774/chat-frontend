import axios from "axios";

export const chatApi = axios.create({
  baseURL: "https://chat-backened-2.onrender.com",
});

// Attach token if available
chatApi.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
