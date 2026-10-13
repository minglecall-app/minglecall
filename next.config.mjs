import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Expose Vite-named Supabase env to the Next client bundle (login requires these)
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.r2.dev' },
      { protocol: 'https', hostname: '**.cloudflarestorage.com' },
    ],
  },
  webpack: (config, { dev, isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': __dirname,
    };
    if (isServer) {
      const prev = config.externals;
      config.externals = [
        ...(Array.isArray(prev) ? prev : prev ? [prev] : []),
        ({ context, request }, callback) => {
          if (request && String(request).replace(/\\/g, '/').includes('api/_lib/cjs/')) {
            const abs = path.isAbsolute(request)
              ? request
              : path.resolve(context || __dirname, request);
            return callback(null, 'commonjs ' + abs);
          }
          callback();
        },
      ];
    }
    // Next 15's minify plugin throws "WebpackError is not a constructor" on this
    // tree (Windows + the large server bundle). The app still builds and runs.
    if (!dev) config.optimization.minimize = false;
    return config;
  },
  serverExternalPackages: ['@upstash/redis', 'livekit-server-sdk', 'express', 'ws', 'nodemailer', 'bcryptjs'],
};

export default nextConfig;
