// src/lib/supabase.js
// ============================================================
// Supabase client for מצב האומה 2.0
//
// Setup:
// 1. npm install @supabase/supabase-js
// 2. Create a .env file in your project root with the two vars below
// 3. Import { supabase } from '@/lib/supabase' wherever you need it
// ============================================================

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase env vars — check your .env file')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)


// ============================================================
// EXAMPLE QUERIES
// ============================================================

// --- Current ministers of a specific government ---
// const { data } = await supabase
//   .from('minister_appointments')
//   .select(`
//     *,
//     person:people(full_name, image_url, twitter_handle),
//     office:offices(name, logo_url)
//   `)
//   .eq('government_id', 37)
//   .eq('is_current', true)
//   .order('start_date')

// --- All KMs of a specific Knesset ---
// const { data } = await supabase
//   .from('knesset_memberships')
//   .select(`
//     *,
//     person:people(full_name, image_url),
//     party:parties(name, color, logo_url)
//   `)
//   .eq('knesset_id', 1)   // replace 1 with the knessets.id for Knesset 25
//   .is('end_date', null)  // currently serving

// --- Coalition parties of a government ---
// const { data } = await supabase
//   .from('coalition_parties')
//   .select(`
//     seats,
//     is_leading,
//     party:parties(name, abbreviation, color, logo_url)
//   `)
//   .eq('government_id', 37)

// --- Full minister history for one office ---
// const { data } = await supabase
//   .from('minister_appointments')
//   .select(`
//     start_date,
//     end_date,
//     is_acting,
//     person:people(full_name, image_url),
//     government:governments(government_number)
//   `)
//   .eq('office_id', 1)   // replace with offices.id for the ministry you want
//   .order('start_date', { ascending: false })

// --- KPI indexes for a ministry ---
// const { data } = await supabase
//   .from('indexes')
//   .select(`
//     *,
//     index_data(label, value, recorded_at)
//   `)
//   .eq('office_id', 1)
//   .eq('is_kpi', true)
//   .eq('is_shown', true)