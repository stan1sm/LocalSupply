import Link from 'next/link'

const section = 'mt-6'
const h2 = 'text-lg font-bold text-[#111827]'
const p = 'mt-2 leading-relaxed text-[#4b5563]'
const ul = 'mt-2 list-disc pl-5 space-y-1 text-[#4b5563]'

export default function CookiePolicyPage() {
  return (
    <main className="min-h-screen bg-[#f3f4f6] text-[#1f2937]">
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link
            className="inline-flex items-center gap-1 rounded-full border-2 border-[#c7d2c2] bg-white px-3 py-1.5 text-xs font-medium text-[#1f2937] shadow-sm transition hover:border-[#2f9f4f] hover:text-[#1f7b3a]"
            href="/"
          >
            <span aria-hidden="true">←</span>
            <span>Back to homepage</span>
          </Link>
        </div>

        <div className="rounded-2xl border border-[#e5e7eb] bg-white p-8 shadow-sm">
          <div className="mb-2 inline-block rounded-full border border-[#2f9f4f]/30 bg-[#eaf7ee] px-3 py-1 text-xs font-semibold text-[#1f7b3a]">
            Legal
          </div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#111827]">Cookie Policy</h1>
          <p className="mt-2 text-sm text-[#6b7280]">Last updated: April 2026</p>

          <p className={p}>
            This Cookie Policy explains how LocalSupply uses cookies and similar technologies when you visit localsupply.site. By using our platform, you agree to the use of cookies as described below.
          </p>

          <hr className="my-6 border-[#e5e7eb]" />

          <div className={section}>
            <h2 className={h2}>1. What are cookies?</h2>
            <p className={p}>
              Cookies are small text files stored on your device when you visit a website. They help websites remember your preferences, keep you signed in, and understand how you use the site.
            </p>
          </div>

          <div className={section}>
            <h2 className={h2}>2. Cookies we use</h2>

            <p className="mt-3 font-semibold text-[#111827]">Strictly necessary cookies</p>
            <p className={p}>These cookies are required for the platform to function and cannot be disabled.</p>
            <ul className={ul}>
              <li>
                <strong>localsupply-token</strong> — stores your authentication JWT so you stay signed in. Expires when you log out or after 7 days of inactivity.
              </li>
              <li>
                <strong>localsupply-user</strong> — stores basic profile data (name, ID) in localStorage to personalise the interface without an extra network request.
              </li>
            </ul>

            <p className="mt-4 font-semibold text-[#111827]">Session cookies</p>
            <p className={p}>
              During the Vipps login flow we use a short-lived session cookie (<strong>vipps_oauth_state</strong>) to protect against CSRF attacks. This cookie is deleted immediately after the OAuth callback completes.
            </p>

            <p className="mt-4 font-semibold text-[#111827]">Third-party cookies</p>
            <p className={p}>
              We do not use third-party advertising or analytics cookies. If you sign in with Vipps, Vipps may set their own cookies subject to{' '}
              <a
                className="font-medium text-[#2f9f4f] underline hover:text-[#25813f]"
                href="https://www.vipps.no/vilkar/cookie/"
                rel="noopener noreferrer"
                target="_blank"
              >
                Vipps' cookie policy
              </a>.
            </p>
          </div>

          <div className={section}>
            <h2 className={h2}>3. localStorage</h2>
            <p className={p}>
              In addition to cookies, we use your browser's localStorage to store your authentication token and cart contents. localStorage data is never transmitted to third parties and is cleared when you log out or delete your account.
            </p>
          </div>

          <div className={section}>
            <h2 className={h2}>4. Managing cookies</h2>
            <p className={p}>
              You can control cookies through your browser settings. Most browsers allow you to block or delete cookies. Note that disabling strictly necessary cookies will prevent you from signing in to LocalSupply.
            </p>
            <p className={p}>Browser guides for managing cookies:</p>
            <ul className={ul}>
              <li>Chrome: Settings → Privacy and security → Cookies</li>
              <li>Firefox: Settings → Privacy & Security → Cookies and Site Data</li>
              <li>Safari: Preferences → Privacy → Manage Website Data</li>
              <li>Edge: Settings → Cookies and site permissions</li>
            </ul>
          </div>

          <div className={section}>
            <h2 className={h2}>5. Changes to this policy</h2>
            <p className={p}>
              We may update this policy from time to time. When we do, we'll update the "Last updated" date at the top of this page. Continued use of the platform after changes constitutes acceptance of the updated policy.
            </p>
          </div>

          <div className={section}>
            <h2 className={h2}>6. Contact</h2>
            <p className={p}>
              Questions about our use of cookies? Contact us at{' '}
              <a className="font-medium text-[#2f9f4f] underline hover:text-[#25813f]" href="mailto:privacy@localsupply.site">
                privacy@localsupply.site
              </a>.
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-[#9ca3af]">
          &copy; 2026 LocalSupply.{' '}
          <Link className="underline hover:text-[#6b7280]" href="/privacy-policy">Privacy Policy</Link>
          {' · '}
          <Link className="underline hover:text-[#6b7280]" href="/about">About</Link>
        </p>
      </div>
    </main>
  )
}
