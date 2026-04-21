"use client";

import { useSession } from "@clerk/nextjs";
import { createClient } from "@supabase/supabase-js";
import { useMemo } from "react";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

type ClerkSession = ReturnType<typeof useSession>["session"];

export function createClerkSupabaseClient(session: ClerkSession) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase client env vars are missing for the web app.");
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    async accessToken() {
      return (await session?.getToken()) ?? null;
    },
  });
}

export function useSupabase() {
  const { session } = useSession();
  return useMemo(() => createClerkSupabaseClient(session), [session]);
}
