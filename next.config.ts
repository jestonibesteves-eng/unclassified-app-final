import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const securityHeaders = [
  // Prevent browsers from MIME-sniffing a response away from the declared content-type
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Deny framing entirely — blocks clickjacking
  { key: "X-Frame-Options", value: "DENY" },
  // Only send the origin (no path/query) as the referrer when crossing origins
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disable browser features the app never uses
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Content Security Policy:
  //   default-src 'self'          — block everything not explicitly allowed
  //   script-src 'unsafe-inline'  — required for Next.js App Router hydration scripts
  //   script-src 'unsafe-eval'    — dev only: React uses eval() for stack traces & debugging
  //   style-src  'unsafe-inline'  — required for Tailwind + Next.js injected styles
  //   img-src data:               — allow base64-encoded images (SVG logos, etc.)
  //   frame-ancestors 'none'      — belt-and-suspenders alongside X-Frame-Options
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.101"],
  async headers() {
    return [
      {
        // Apply to every route
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
