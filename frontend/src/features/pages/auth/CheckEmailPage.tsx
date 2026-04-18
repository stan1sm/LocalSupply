import Link from 'next/link'

type CheckEmailPageProps = {
  verificationPreviewUrl?: string
}

export default function CheckEmailPage({ verificationPreviewUrl }: CheckEmailPageProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f4f6] px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-[#dfe5da] bg-white p-8 shadow-[0_20px_50px_rgba(17,24,39,0.08)]">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#f0faf4]">
          <svg className="h-7 w-7 text-[#2f9f4f]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
          </svg>
        </div>

        <h1 className="text-xl font-bold text-[#1b2a1f]">Check your inbox</h1>
        <p className="mt-2 text-sm text-[#5b665f]">
          Your account was created. Open the verification link we sent to confirm your email before signing in.
        </p>
        <p className="mt-2 text-[10px] text-[#9ca3af]">
          No email? Check your spam folder and confirm you used the right address.
        </p>

        {verificationPreviewUrl ? (
          <div className="mt-4 rounded-xl border border-[#a3d4b3] bg-[#f0faf4] px-4 py-3">
            <p className="text-xs font-semibold text-[#1a5c2e]">Email fallback is active</p>
            <p className="mt-0.5 text-[11px] text-[#3d6b4b]">Open the verification link directly while testing without a sending domain.</p>
            <a
              className="mt-3 inline-flex items-center rounded-lg bg-[#2f9f4f] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#25813f]"
              href={verificationPreviewUrl}
            >
              Open verification link
            </a>
          </div>
        ) : null}

        <Link
          className="mt-6 block w-full rounded-xl bg-[#2f9f4f] px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-[#25813f]"
          href="/login"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  )
}
