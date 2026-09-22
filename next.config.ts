import type { NextConfig } from "next";

const storageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: storageUrl ? [{
      protocol: "https",
      hostname: new URL(storageUrl).hostname,
      port: "",
      pathname: "/storage/v1/object/public/quiz-media/**",
      search: "",
    }] : [],
  },
};

export default nextConfig;
