import Link from 'next/link'

const howItWorks = [
  {
    title: 'Browse Products',
    description: 'Search across 50,000+ products from Norwegian grocery chains — no account needed.',
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-3.6-3.6" />
      </svg>
    ),
  },
  {
    title: 'Build Your Cart',
    description: 'Add items from any store. Our AI figures out the cheapest way to get everything on your list.',
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
        <path d="M2 3h2l3.6 7.6L6.3 13a2 2 0 002 2.4h9.1" />
        <circle cx="10" cy="20" r="1.5" />
        <circle cx="18" cy="20" r="1.5" />
        <path d="M8 13h10.5l2-7H6.7" />
      </svg>
    ),
  },
  {
    title: 'Save & Get Delivered',
    description: 'Pick the best option — cheapest total, fastest delivery, or a mix of both.',
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
        <path d="M3 7h11v9H3z" />
        <path d="M14 10h3l4 3v3h-2" />
        <circle cx="8" cy="18" r="2" />
        <circle cx="18" cy="18" r="2" />
      </svg>
    ),
  },
]

const smartCartFeatures = [
  {
    title: 'AI-Powered Price Matching',
    description:
      'Our algorithm compares your entire cart across every store and finds the combination that saves you the most — even if it means splitting across two chains.',
    icon: (
      <svg aria-hidden="true" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
        <path d="M12 3v18" />
        <path d="M17 7.5c0-1.9-2.2-3.5-5-3.5S7 5.6 7 7.5 9.2 11 12 11s5 1.6 5 3.5S14.8 18 12 18s-5-1.6-5-3.5" />
      </svg>
    ),
  },
  {
    title: 'Delivery Cost Included',
    description:
      'A cheaper store doesn\'t help if delivery eats the savings. We factor in delivery costs so the total you see is the total you pay.',
    icon: (
      <svg aria-hidden="true" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
        <path d="M3 7h11v9H3z" />
        <path d="M14 10h3l4 3v3h-2" />
        <circle cx="8" cy="18" r="2" />
        <circle cx="18" cy="18" r="2" />
      </svg>
    ),
  },
  {
    title: 'Real-Time Store Data',
    description:
      'Prices sync daily from MENY, Coop, Joker, Spar, Oda, Bunnpris, KIWI, REMA 1000 and more via the Kassal catalog.',
    icon: (
      <svg aria-hidden="true" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
        <path d="M12 6v6l4 2" />
        <circle cx="12" cy="12" r="10" />
      </svg>
    ),
  },
]


export default function HomePage() {
  return (
    <main className="bg-[#f2f4ef] text-[#1f2937]">
      <section className="mx-auto w-full max-w-6xl px-4 pb-12 pt-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
          <Link className="inline-flex items-center gap-2 text-sm font-bold text-[#2f9f4f]" href="/">
            <span className="grid h-5 w-5 place-items-center rounded bg-[#2f9f4f] text-[10px] text-white">LS</span>
            LocalSupply
          </Link>

          <nav className="flex items-center gap-4">
            <Link className="text-sm font-medium text-[#5b665f] transition hover:text-[#2f9f4f]" href="/marketplace/dashboard">
              Marketplace
            </Link>
            <Link className="text-sm font-semibold text-[#1f2937] hover:text-[#2f9f4f]" href="/login">
              Sign in
            </Link>
          </nav>
        </header>

        <div className="mt-8 grid items-center gap-8 rounded-3xl bg-white p-6 shadow-[0_15px_40px_rgba(15,23,42,0.06)] sm:p-8 lg:grid-cols-2">
          <div>
            <span className="inline-block rounded-full bg-[#eaf7ee] px-3 py-1 text-xs font-semibold text-[#2f9f4f]">
              AI-powered grocery savings
            </span>
            <h1 className="mt-4 max-w-md text-3xl font-extrabold leading-tight text-[#1f2937] sm:text-4xl">
              We find the cheapest way to buy your groceries
            </h1>
            <p className="mt-4 max-w-md text-sm text-[#5b665f] sm:text-base">
              Add items to your cart and our AI compares prices across every Norwegian grocery chain — including delivery costs — to find the cheapest total for you.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                className="rounded-lg bg-[#2f9f4f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#25813f]"
                href="/marketplace/dashboard"
              >
                Browse Marketplace
              </Link>
              <Link
                className="rounded-lg border border-[#d0d8cc] px-5 py-2.5 text-sm font-semibold text-[#314237] transition hover:border-[#2f9f4f] hover:text-[#2f9f4f]"
                href="/register"
              >
                Create Account
              </Link>
              <Link
                className="rounded-lg border border-[#d0d8cc] px-5 py-2.5 text-sm font-semibold text-[#314237] transition hover:border-[#2f9f4f] hover:text-[#2f9f4f]"
                href="/supplier/register"
              >
                For Suppliers
              </Link>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl">
            <img
              alt="Fresh groceries ready for delivery"
              className="h-[280px] w-full object-cover sm:h-[320px]"
              src="https://images.unsplash.com/photo-1543168256-418811576931?auto=format&fit=crop&w=1200&q=80"
            />
          </div>
        </div>
      </section>

      <section className="border-y border-[#e2e8df] bg-[#f7f9f5] py-14">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold text-[#1f2937]">How It Works</h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-sm text-[#5b665f]">
            Three steps to cheaper groceries. No account required to start browsing.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {howItWorks.map((step, index) => (
              <article
                className="rounded-2xl border border-[#dce5d7] bg-white p-6 text-center shadow-[0_10px_25px_rgba(15,23,42,0.05)]"
                key={step.title}
              >
                <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-[#eaf7ee] text-[#2f9f4f]">
                  <span className="text-sm font-bold">{index + 1}</span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-[#253128]">{step.title}</h3>
                <p className="mt-2 text-sm text-[#5b665f]">{step.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="text-center">
          <span className="inline-block rounded-full bg-[#eaf7ee] px-3 py-1 text-xs font-semibold text-[#2f9f4f]">
            Smart Cart
          </span>
          <h2 className="mt-4 text-3xl font-bold text-[#1f2937]">AI that actually saves you money</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-[#5b665f] sm:text-base">
            Most people shop at one store and hope for the best. LocalSupply checks every store for you and builds the cheapest possible order — automatically.
          </p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {smartCartFeatures.map((feature) => (
            <article className="rounded-2xl bg-white p-6 shadow-[0_10px_25px_rgba(15,23,42,0.05)]" key={feature.title}>
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#eaf7ee] text-[#2f9f4f]">{feature.icon}</div>
              <h3 className="mt-4 text-lg font-semibold text-[#253128]">{feature.title}</h3>
              <p className="mt-2 text-sm text-[#5b665f]">{feature.description}</p>
            </article>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link
            className="inline-block rounded-lg bg-[#2f9f4f] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#25813f]"
            href="/marketplace/dashboard"
          >
            Try it now — no signup needed
          </Link>
        </div>
      </section>

      <footer className="border-t border-[#e2e8df] bg-white py-10">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 text-sm text-[#5b665f] sm:px-6 md:grid-cols-4 lg:px-8">
          <div className="md:col-span-2">
            <p className="inline-flex items-center gap-2 font-bold text-[#2f9f4f]">
              <span className="grid h-5 w-5 place-items-center rounded bg-[#2f9f4f] text-[10px] text-white">LS</span>
              LocalSupply
            </p>
            <p className="mt-3 max-w-md">
              AI-powered grocery comparison. We check prices across every Norwegian chain and find the cheapest way to fill your cart — delivery included.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-[#253128]">Company</h3>
            <ul className="mt-3 space-y-2">
              <li>About</li>
              <li>Careers</li>
              <li>Blog</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-[#253128]">Support</h3>
            <ul className="mt-3 space-y-2">
              <li>Help Center</li>
              <li>Contact</li>
              <li>Status</li>
            </ul>
          </div>
        </div>
        <p className="mt-8 text-center text-xs text-[#8b978e]">&copy; 2026 LocalSupply. All rights reserved.</p>
      </footer>
    </main>
  )
}
