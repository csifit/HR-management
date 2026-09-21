"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../database.types";
import { supabaseConfig } from "./config";
export function browserSupabase() {
  const { url, key } = supabaseConfig();
  return createBrowserClient<Database>(url, key);
}
