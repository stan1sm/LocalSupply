import Link from 'next/link'

export default function CheckEmailPage() {
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
          <div className="flex flex-wrap gap-3">
            <Link
              className="rounded-xl bg-[#2f9f4f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#25813f]"
              href="/login"
            >
              Back to Login
            </Link>
            <Link
              className="rounded-xl border border-[#d0d8cc] px-5 py-3 text-sm font-semibold text-[#314237] transition hover:border-[#2f9f4f] hover:text-[#2f9f4f]"
              href="/register"
            >
              Register Again
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
