import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { electionsEditApiPlugin } from './vite-plugins/electionsEditApi.ts'
import { knessetEditApiPlugin } from './vite-plugins/knessetEditApi.ts'
import { pollsEditApiPlugin } from './vite-plugins/pollsEditApi.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const supabaseUrl = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').trim()
  const supabaseAnonKey = (env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '').trim()

  return {
    plugins: [
      react(),
      electionsEditApiPlugin(env),
      knessetEditApiPlugin(env),
      pollsEditApiPlugin(env),
    ],
    server: {
      // Listen on all interfaces so phones/other devices on the same Wi‑Fi can open the site
      host: true,
    },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
      'import.meta.env.VITE_ELECTIONS_EDIT_SECRET': JSON.stringify(
        (env.VITE_ELECTIONS_EDIT_SECRET || '').trim(),
      ),
      'import.meta.env.VITE_KNESSET_EDIT_SECRET': JSON.stringify(
        (env.VITE_KNESSET_EDIT_SECRET || '').trim(),
      ),
    },
  }
})
