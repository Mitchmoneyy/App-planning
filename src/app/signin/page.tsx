import type { Metadata } from "next";
import { Suspense } from "react";
import SignInForm from "@/components/SignInForm";
import SiteHeader from "@/components/SiteHeader";

export const metadata: Metadata = { title: "Sign in · Global Sanctuary" };

export default function SignInPage() {
  return (
    <>
      <SiteHeader />
      <main className="narrow-page">
        <Suspense>
          <SignInForm />
        </Suspense>
      </main>
    </>
  );
}
