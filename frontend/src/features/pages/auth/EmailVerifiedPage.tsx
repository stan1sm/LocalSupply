import Link from 'next/link'

type EmailVerifiedPageProps = {
  status?: string
}

export default function EmailVerifiedPage({ status }: EmailVerifiedPageProps) {
  const isInvalid = status === 'invalid'

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f4f6] px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-[#dfe5da] bg-white p-8 shadow-[0_20px_50px_rgba(17,24,39,0.08)]">
        <div className={`mb-5 flex h-14 w-14 items-center justify-center rounded-full ${isInvalid ? 'bg-[#fff5f5]' : 'bg-[#f0faf4]'}`}>
          {isInvalid ? (
            <svg className="h-7 w-7 text-[#c53030]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          ) : (
            <svg className="h-7 w-7 text-[#2f9f4f]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          )}
        </div>

        <h1 className="text-xl font-bold text-[#1b2a1f]">
          {isInvalid ? 'Verification link unavailable' : 'Email verified'}
        </h1>
        <p className="mt-2 text-sm text-[#5b665f]">
          {isInvalid
            ? 'This link is invalid or has already been used. Verification links expire automatically for security.'
            : 'Your email is confirmed. You can now sign in with the email and password you registered with.'}
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <Link
            className="block w-full rounded-xl bg-[#2f9f4f] px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-[#25813f]"
            href={isInvalid ? '/register' : '/login'}
          >
            {isInvalid ? 'Register again' : 'Continue to sign in'}
          </Link>
          <Link
            className="block w-full rounded-xl border border-[#d4ddcf] px-4 py-3 text-center text-sm font-semibold text-[#314237] transition hover:border-[#9db5a4] hover:text-[#2f9f4f]"
            href="/"
          >
            Back to homepage
          </Link>
        </div>
      </div>
    </main>
  )
}
