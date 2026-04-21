"use client";

import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-20 navbar-shell">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3 font-semibold text-lg">
          <span className="brand-mark" aria-hidden>
            T
          </span>
          <div>
            <span>Transit Weather</span>
            <p className="navbar-subtitle">Boston · MBTA</p>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          <SignedOut>
            <Link href="/sign-in" className="nav-button">
              Sign in
            </Link>
          </SignedOut>
          <SignedIn>
            <UserButton afterSignOutUrl="/sign-in" />
          </SignedIn>
        </div>
      </div>
    </header>
  );
}
