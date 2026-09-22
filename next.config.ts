import type { NextConfig } from "next";

const storageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    const csp = "base-uri 'self'; object-src 'none'; form-action 'self'; upgrade-insecure-requests";
    return [
      { source: "/:path*", headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Content-Security-Policy", value: csp + "; frame-ancestors 'self'" },
      ] },
      // Public quizzes are intentionally embeddable; dashboard/auth pages are not.
      { source: "/q/:path*", headers: [
        { key: "Content-Security-Policy", value: csp + "; frame-ancestors *" },
        { key: "Cache-Control", value: "private, no-store" },
      ] },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
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
