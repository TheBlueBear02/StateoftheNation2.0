import type { NextConfig } from 'next'

/**
 * Expose existing Vite-style env names to the client bundle so .env
 * does not need to be rewritten during the migration.
 */
const nextConfig: NextConfig = {
  // Allow phone / LAN access to Next.js dev HMR and assets.
  allowedDevOrigins: ['192.168.1.25'],
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      '',
    NEXT_PUBLIC_ELECTIONS_EDIT_SECRET:
      process.env.NEXT_PUBLIC_ELECTIONS_EDIT_SECRET ||
      process.env.ELECTIONS_EDIT_SECRET ||
      process.env.VITE_ELECTIONS_EDIT_SECRET ||
      '',
    NEXT_PUBLIC_KNESSET_EDIT_SECRET:
      process.env.NEXT_PUBLIC_KNESSET_EDIT_SECRET ||
      process.env.KNESSET_EDIT_SECRET ||
      process.env.VITE_KNESSET_EDIT_SECRET ||
      '',
    NEXT_PUBLIC_SITE_URL:
      process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
      },
    ],
  },
  serverExternalPackages: ['@supabase/supabase-js'],
}

export default nextConfig
