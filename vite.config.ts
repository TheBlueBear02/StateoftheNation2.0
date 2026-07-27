import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { electionsEditApiPlugin } from './vite-plugins/electionsEditApi.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const supabaseUrl = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').trim()
  const supabaseAnonKey = (env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '').trim()

  return {
    plugins: [react(), electionsEditApiPlugin(env)],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
      'import.meta.env.VITE_ELECTIONS_EDIT_SECRET': JSON.stringify(
        (env.VITE_ELECTIONS_EDIT_SECRET || '').trim(),
      ),
    },
  }
})
