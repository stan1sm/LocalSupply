import Link from 'next/link'

const section = 'mt-6'
const h2 = 'text-lg font-bold text-[#111827]'
const p = 'mt-2 leading-relaxed text-[#4b5563]'
const ul = 'mt-2 list-disc pl-5 space-y-1 text-[#4b5563]'

export default function PrivacyPolicyPage() {
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
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#111827]">Privacy Policy</h1>
          <p className="mt-2 text-sm text-[#6b7280]">Last updated: April 2026</p>

          <p className={p}>
            LocalSupply ("we", "us", or "our") is committed to protecting your personal data in accordance with the General Data Protection Regulation (GDPR) and Norwegian data protection law. This policy explains what data we collect, why we collect it, and your rights.
          </p>

          <hr className="my-6 border-[#e5e7eb]" />

          <div className={section}>
            <h2 className={h2}>1. Who we are</h2>
            <p className={p}>
              LocalSupply is a Norwegian company operating a B2B/B2C grocery marketplace. We act as the data controller for personal data collected through our platform at localsupply.site.
            </p>
          </div>

          <div className={section}>
            <h2 className={h2}>2. Data we collect</h2>
            <p className={p}>We collect the following categories of personal data:</p>
            <ul className={ul}>
              <li><strong>Account data:</strong> name, email address, and password (hashed) when you register.</li>
              <li><strong>Business data (suppliers):</strong> company name, organisation number, and business address.</li>
              <li><strong>Order data:</strong> delivery addresses, order contents, payment method, and order history.</li>
              <li><strong>Communication data:</strong> messages sent between buyers and suppliers on the platform.</li>
              <li><strong>Technical data:</strong> IP address, browser type, and usage logs for security and performance purposes.</li>
              <li><strong>Vipps login data:</strong> if you sign in with Vipps, we receive your name and email from Vipps as part of the OAuth flow.</li>
            </ul>
          </div>

          <div className={section}>
            <h2 className={h2}>3. Why we process your data</h2>
            <ul className={ul}>
              <li><strong>To provide our service:</strong> processing orders, managing accounts, and enabling marketplace features (legal basis: contract).</li>
              <li><strong>To send transactional emails:</strong> order confirmations, password resets, and account notifications (legal basis: contract).</li>
              <li><strong>To verify supplier businesses:</strong> using the Brønnøysund Register Centre (Brreg) to validate Norwegian organisation numbers (legal basis: legitimate interest).</li>
              <li><strong>To comply with legal obligations:</strong> retaining records as required by Norwegian law (legal basis: legal obligation).</li>
              <li><strong>To improve our platform:</strong> analysing usage patterns to fix bugs and improve features (legal basis: legitimate interest).</li>
            </ul>
          </div>

          <div className={section}>
            <h2 className={h2}>4. Third-party services</h2>
            <p className={p}>We share data with the following third parties where necessary to operate the platform:</p>
            <ul className={ul}>
              <li><strong>Resend</strong> — transactional email delivery.</li>
              <li><strong>Vipps</strong> — payment and login services.</li>
              <li><strong>Wolt Drive</strong> — last-mile delivery. Your delivery address is shared with Wolt when a delivery is requested.</li>
              <li><strong>Vercel</strong> — cloud hosting and infrastructure.</li>
              <li><strong>Neon / PostgreSQL</strong> — database hosting.</li>
            </ul>
            <p className={p}>All third-party processors are contractually bound to process your data only as instructed and in compliance with GDPR.</p>
          </div>

          <div className={section}>
            <h2 className={h2}>5. Data retention</h2>
            <p className={p}>
              We retain your account data for as long as your account is active. Order records are retained for 5 years to comply with Norwegian accounting regulations. You may request deletion of your account at any time from your account settings.
            </p>
          </div>

          <div className={section}>
            <h2 className={h2}>6. Your rights</h2>
            <p className={p}>Under GDPR, you have the right to:</p>
            <ul className={ul}>
              <li>Access the personal data we hold about you.</li>
              <li>Correct inaccurate or incomplete data.</li>
              <li>Request deletion of your data ("right to be forgotten").</li>
              <li>Object to or restrict processing in certain circumstances.</li>
              <li>Data portability — receive your data in a structured, machine-readable format.</li>
              <li>Lodge a complaint with Datatilsynet (the Norwegian Data Protection Authority) at datatilsynet.no.</li>
            </ul>
          </div>

          <div className={section}>
            <h2 className={h2}>7. Cookies</h2>
            <p className={p}>
              We use cookies for authentication and session management. See our{' '}
              <Link className="font-medium text-[#2f9f4f] underline hover:text-[#25813f]" href="/cookie-policy">Cookie Policy</Link>
              {' '}for full details.
            </p>
          </div>

          <div className={section}>
            <h2 className={h2}>8. Contact</h2>
            <p className={p}>
              For any questions about this policy or to exercise your rights, contact us at{' '}
              <a className="font-medium text-[#2f9f4f] underline hover:text-[#25813f]" href="mailto:privacy@localsupply.site">
                privacy@localsupply.site
              </a>.
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-[#9ca3af]">
          &copy; 2026 LocalSupply.{' '}
          <Link className="underline hover:text-[#6b7280]" href="/cookie-policy">Cookie Policy</Link>
          {' · '}
          <Link className="underline hover:text-[#6b7280]" href="/about">About</Link>
        </p>
      </div>
    </main>
  )
}
