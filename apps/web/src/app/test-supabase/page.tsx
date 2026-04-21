"use client";

import { useEffect, useState } from "react";
import {
  useSession,
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from "@clerk/nextjs";
import { createClient } from "@supabase/supabase-js";

export default function TestSupabase() {
  const { session } = useSession();
  const [status, setStatus] = useState<string>("Waiting for sign-in...");
  const [details, setDetails] = useState<string[]>([]);

  useEffect(() => {
    if (!session) return;

    async function runTests() {
      const logs: string[] = [];

      try {
        // 1. Create Supabase client with Clerk auth
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            async accessToken() {
              return session?.getToken() ?? null;
            },
          }
        );
        logs.push("Supabase client created with Clerk token");

        // 2. Test reading weather_data (should work even if empty)
        const { data: weatherData, error: weatherError } = await supabase
          .from("weather_data")
          .select("*")
          .limit(1);

        if (weatherError) {
          logs.push(`weather_data READ: FAILED - ${weatherError.message}`);
        } else {
          logs.push(`weather_data READ: OK (${weatherData.length} rows)`);
        }

        // 3. Test writing to saved_locations (RLS scoped to user)
        const { data: insertData, error: insertError } = await supabase
          .from("saved_locations")
          .insert({
            user_id: session?.user?.id,
            name: "Test City",
            latitude: 41.88,
            longitude: -87.63,
            country: "Test",
          })
          .select()
          .single();

        if (insertError) {
          logs.push(`saved_locations INSERT: FAILED - ${insertError.message}`);
        } else {
          logs.push(`saved_locations INSERT: OK (id: ${insertData.id})`);

          // 4. Clean up test row
          const { error: deleteError } = await supabase
            .from("saved_locations")
            .delete()
            .eq("id", insertData.id);

          if (deleteError) {
            logs.push(`saved_locations DELETE: FAILED - ${deleteError.message}`);
          } else {
            logs.push("saved_locations DELETE: OK (cleaned up)");
          }
        }

        setStatus("All tests complete");
      } catch (err) {
        logs.push(`Unexpected error: ${err}`);
        setStatus("Tests failed");
      }

      setDetails(logs);
    }

    runTests();
  }, [session]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-bold">Supabase + Clerk Integration Test</h1>
      <SignedOut>
        <SignInButton mode="modal">
          <button className="rounded-lg bg-blue-600 px-4 py-2 font-semibold hover:bg-blue-500">
            Sign in to run tests
          </button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <UserButton />
      </SignedIn>
      <p className="text-lg">
        Status: <span className="font-mono">{status}</span>
      </p>
      <div className="rounded-lg bg-gray-900 p-6 font-mono text-sm max-w-xl w-full">
        {details.length === 0 ? (
          <p className="text-gray-400">Waiting for Clerk session...</p>
        ) : (
          details.map((line, i) => (
            <p
              key={i}
              className={
                line.includes("FAILED")
                  ? "text-red-400"
                  : line.includes("OK")
                  ? "text-green-400"
                  : "text-gray-300"
              }
            >
              {line}
            </p>
          ))
        )}
      </div>
    </main>
  );
}
