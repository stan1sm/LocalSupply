import Link from 'next/link'

type CheckEmailPageProps = {
  verificationPreviewUrl?: string
}

export default function CheckEmailPage({ verificationPreviewUrl }: CheckEmailPageProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f2f4ef] px-4 py-8 sm:px-6 lg:py-12">
      <section className="w-full max-w-2xl overflow-hidden rounded-3xl border border-[#dfe5da] bg-white shadow-[0_20px_50px_rgba(17,24,39,0.08)]">
        <div className="bg-gradient-to-r from-[#2fa04f] via-[#2a9448] to-[#1f7b3a] px-8 py-10 text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/85">LocalSupply</p>
          <h1 className="mt-4 text-3xl font-extrabold leading-tight sm:text-4xl">Check email for verification</h1>
          <p className="mt-3 max-w-xl text-sm text-white/85 sm:text-base">
            Your account was created. Open the verification link we sent to your inbox before signing in.
          </p>
        </div>

        <div className="space-y-4 px-8 py-8 text-sm text-[#4b5a4f] sm:text-base">
          <p>If you do not see the message, check your spam folder and confirm you registered with the correct email address.</p>
          {verificationPreviewUrl ? (
            <div className="rounded-2xl border border-[#cfe7d5] bg-[#f4fbf6] p-4 text-sm text-[#295237]">
              <p className="font-semibold">Email fallback is active.</p>
              <p className="mt-2">Open the verification link directly while you are still testing without a sending domain.</p>
              <a
                className="mt-3 inline-flex rounded-xl bg-[#2f9f4f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#25813f]"
                href={verificationPreviewUrl}
              >
                Open Verification Link
              </a>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Link
              className="rounded-xl bg-[#2f9f4f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#25813f]"
              href="/login"
            >
              Back to Login
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
