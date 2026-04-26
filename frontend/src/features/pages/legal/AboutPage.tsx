import Link from 'next/link'

export default function AboutPage() {
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
            About us
          </div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#111827]">
            We make grocery shopping smarter
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[#4b5563]">
            LocalSupply is a Norwegian marketplace that connects buyers with local suppliers and compares prices across the country's leading grocery chains — so you always get the best deal, delivery cost included.
          </p>

          <hr className="my-8 border-[#e5e7eb]" />

          <h2 className="text-xl font-bold text-[#111827]">Our mission</h2>
          <p className="mt-3 leading-relaxed text-[#4b5563]">
            Grocery shopping in Norway is expensive. Prices vary significantly between chains, and most people don't have the time to compare them. We built LocalSupply to do that work for you — automatically.
          </p>
          <p className="mt-3 leading-relaxed text-[#4b5563]">
            Our platform checks prices across MENY, Coop, Joker, Spar, Oda, and more in real time, then uses AI to build the cheapest possible order for your list — factoring in delivery costs so the total you see is the total you pay.
          </p>

          <hr className="my-8 border-[#e5e7eb]" />

          <h2 className="text-xl font-bold text-[#111827]">For suppliers</h2>
          <p className="mt-3 leading-relaxed text-[#4b5563]">
            LocalSupply isn't just for buyers. We're building the infrastructure for local Norwegian food businesses to reach customers directly — with their own storefront, product listings, and order management — all in one place.
          </p>
          <p className="mt-3 leading-relaxed text-[#4b5563]">
            Suppliers on LocalSupply get verified listings, Wolt Drive delivery integration, real-time order notifications, and a dashboard to manage everything from inventory to customer conversations.
          </p>

          <hr className="my-8 border-[#e5e7eb]" />

          <h2 className="text-xl font-bold text-[#111827]">Built in Norway</h2>
          <p className="mt-3 leading-relaxed text-[#4b5563]">
            We're a Norwegian company. We built this for Norwegian consumers and businesses, and we take local compliance seriously — from GDPR to Vipps payment integration and Brreg business verification.
          </p>

          <hr className="my-8 border-[#e5e7eb]" />

          <div className="flex flex-wrap gap-3">
            <Link
              className="rounded-lg bg-[#2f9f4f] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#25813f]"
              href="/marketplace/dashboard"
            >
              Browse marketplace
            </Link>
            <Link
              className="rounded-lg border border-[#d1d5db] bg-white px-4 py-2.5 text-sm font-semibold text-[#374151] transition hover:border-[#2f9f4f] hover:text-[#1f7b3a]"
              href="/supplier/register"
            >
              Become a supplier
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-[#9ca3af]">
          &copy; 2026 LocalSupply.{' '}
          <Link className="underline hover:text-[#6b7280]" href="/privacy-policy">Privacy Policy</Link>
          {' · '}
          <Link className="underline hover:text-[#6b7280]" href="/cookie-policy">Cookie Policy</Link>
        </p>
      </div>
    </main>
  )
}
