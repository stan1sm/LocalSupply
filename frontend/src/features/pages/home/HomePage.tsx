'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

const BUYER_STORAGE_KEY = 'localsupply-user'

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
  const [loggedInName, setLoggedInName] = useState<string | null>(null)

  useEffect(() => {
    function readStorage() {
      try {
        const stored = window.localStorage.getItem(BUYER_STORAGE_KEY)
        if (stored) {
          const parsed = JSON.parse(stored) as { firstName?: string; id?: string }
          if (parsed?.id && parsed?.firstName) setLoggedInName(parsed.firstName)
          else setLoggedInName(null)
        } else {
          setLoggedInName(null)
        }
      } catch { /* ignore */ }
    }
    readStorage()
    window.addEventListener('storage', readStorage)
    return () => window.removeEventListener('storage', readStorage)
  }, [])

  function handleLogout() {
    window.localStorage.removeItem(BUYER_STORAGE_KEY)
    setLoggedInName(null)
  }

  return (
    <main className="min-h-screen bg-[#f3f4f6] text-[#1f2937]">
      <section className="mx-auto w-full max-w-6xl px-4 pb-12 pt-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between rounded-xl border border-[#e5e7eb] bg-white/95 px-4 py-3 shadow-sm backdrop-blur-sm">
          <Link className="inline-flex items-center gap-2.5 text-[15px] font-bold text-[#1f2937] transition hover:text-[#2f9f4f]" href="/">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#2f9f4f] text-xs font-bold text-white">LS</span>
            <span>LocalSupply</span>
          </Link>

          <nav className="flex items-center gap-2">
            {loggedInName ? (
              <>
                <Link
                  className="rounded-full border border-[#d1d5db] bg-[#f9fafb] px-4 py-2 text-sm font-medium text-[#374151] transition hover:border-[#2f9f4f] hover:bg-[#eaf7ee] hover:text-[#1f7b3a]"
                  href="/marketplace/dashboard"
                >
                  My Marketplace
                </Link>
                <Link
                  className="rounded-full border border-[#d1d5db] bg-[#f9fafb] px-4 py-2 text-sm font-medium text-[#374151] transition hover:border-[#2f9f4f] hover:bg-[#eaf7ee] hover:text-[#1f7b3a]"
                  href="/settings"
                >
                  Settings
                </Link>
                <button
                  onClick={handleLogout}
                  className="rounded-full border border-[#d1d5db] bg-[#f9fafb] px-4 py-2 text-sm font-medium text-[#374151] transition hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link
                  className="rounded-full border border-[#d1d5db] bg-[#f9fafb] px-4 py-2 text-sm font-medium text-[#374151] transition hover:border-[#2f9f4f] hover:bg-[#eaf7ee] hover:text-[#1f7b3a]"
                  href="/marketplace/dashboard"
                >
                  Marketplace
                </Link>
                <Link
                  className="rounded-full border border-[#d1d5db] bg-[#f9fafb] px-4 py-2 text-sm font-medium text-[#374151] transition hover:border-[#2f9f4f] hover:bg-[#eaf7ee] hover:text-[#1f7b3a]"
                  href="/login"
                >
                  Login
                </Link>
                <Link
                  className="rounded-full bg-[#2f9f4f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#25813f]"
                  href="/register"
                >
                  Register
                </Link>
                <Link
                  className="hidden rounded-full border border-[#d1d5db] bg-[#f9fafb] px-4 py-2 text-sm font-medium text-[#374151] transition hover:border-[#2f9f4f] hover:bg-[#eaf7ee] hover:text-[#1f7b3a] sm:inline-block"
                  href="/supplier/login"
                >
                  Supplier login
                </Link>
              </>
            )}
          </nav>
        </header>

        <div className="mt-6 grid items-center gap-6 rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-sm sm:mt-8 sm:gap-8 sm:p-8 lg:grid-cols-2">
          <div>
            <span className="inline-block rounded-full border border-[#2f9f4f]/30 bg-[#eaf7ee] px-3 py-1 text-xs font-semibold text-[#1f7b3a]">
              AI-powered grocery savings
            </span>
            <h1 className="mt-3 max-w-md text-2xl font-extrabold leading-tight tracking-tight text-[#111827] sm:text-3xl lg:text-4xl">
              We find the cheapest way to buy your groceries
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-[#4b5563] sm:text-base">
              Add items to your cart and our AI compares prices across every Norwegian grocery chain — including delivery costs — to find the cheapest total for you.
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <Link
                className="rounded-lg bg-[#2f9f4f] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#25813f] focus:outline-none focus:ring-2 focus:ring-[#2f9f4f]/40 focus:ring-offset-2"
                href="/marketplace/dashboard"
              >
                Browse Marketplace
              </Link>
              {!loggedInName ? (
                <>
                  <Link
                    className="rounded-lg border border-[#d1d5db] bg-white px-4 py-2.5 text-sm font-semibold text-[#374151] transition hover:border-[#2f9f4f] hover:bg-[#f0f4ee] hover:text-[#1f7b3a]"
                    href="/register"
                  >
                    Create Account
                  </Link>
                  <Link
                    className="rounded-lg border border-[#d1d5db] bg-white px-4 py-2.5 text-sm font-semibold text-[#374151] transition hover:border-[#2f9f4f] hover:bg-[#f0f4ee] hover:text-[#1f7b3a]"
                    href="/supplier/register"
                  >
                    For Suppliers
                  </Link>
                </>
              ) : (
                <Link
                  className="rounded-lg border border-[#d1d5db] bg-white px-4 py-2.5 text-sm font-semibold text-[#374151] transition hover:border-[#2f9f4f] hover:bg-[#f0f4ee] hover:text-[#1f7b3a]"
                  href="/orders"
                >
                  My Orders
                </Link>
              )}
            </div>
            {!loggedInName ? (
              <p className="mt-2.5 text-xs text-[#6b7280]">
                Already a supplier?{' '}
                <Link className="font-semibold text-[#2f9f4f] hover:text-[#25813f]" href="/supplier/login">
                  Log in to your dashboard
                </Link>
                .
              </p>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-xl border border-[#e5e7eb]">
            <img
              alt="Fresh groceries ready for delivery"
              className="h-[240px] w-full object-cover sm:h-[280px]"
              src="https://images.unsplash.com/photo-1543168256-418811576931?auto=format&fit=crop&w=1200&q=80"
            />
          </div>
        </div>
      </section>

      <section className="border-y border-[#e5e7eb] bg-white/50 py-12">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-2xl font-bold text-[#111827] sm:text-3xl">How It Works</h2>
          <p className="mx-auto mt-2 max-w-lg text-center text-sm text-[#4b5563]">
            Three steps to cheaper groceries. No account required to start browsing.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {howItWorks.map((step, index) => (
              <article
                className="rounded-xl border border-[#e5e7eb] bg-white p-5 text-center shadow-sm"
                key={step.title}
              >
                <div className="mx-auto grid h-9 w-9 place-items-center rounded-full border border-[#2f9f4f]/20 bg-[#eaf7ee] text-sm font-bold text-[#1f7b3a]">
                  {index + 1}
                </div>
                <h3 className="mt-3 text-base font-semibold text-[#111827]">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[#4b5563]">{step.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center">
          <span className="inline-block rounded-full border border-[#2f9f4f]/30 bg-[#eaf7ee] px-3 py-1 text-xs font-semibold text-[#1f7b3a]">
            Smart Cart
          </span>
          <h2 className="mt-3 text-2xl font-bold text-[#111827] sm:text-3xl">AI that actually saves you money</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-[#4b5563] sm:text-base">
            Most people shop at one store and hope for the best. LocalSupply checks every store for you and builds the cheapest possible order — automatically.
          </p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {smartCartFeatures.map((feature) => (
            <article className="rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-sm" key={feature.title}>
              <div className="grid h-10 w-10 place-items-center rounded-lg border border-[#2f9f4f]/20 bg-[#eaf7ee] text-[#1f7b3a]">{feature.icon}</div>
              <h3 className="mt-3 text-base font-semibold text-[#111827]">{feature.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[#4b5563]">{feature.description}</p>
            </article>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link
            className="inline-block rounded-lg bg-[#2f9f4f] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#25813f] focus:outline-none focus:ring-2 focus:ring-[#2f9f4f]/40 focus:ring-offset-2"
            href="/marketplace/dashboard"
          >
            Try it now — no signup needed
          </Link>
        </div>
      </section>

      <footer className="border-t border-[#e5e7eb] bg-white py-8">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 text-sm text-[#4b5563] sm:px-6 md:grid-cols-4 lg:px-8">
          <div className="md:col-span-2">
            <p className="inline-flex items-center gap-2 font-bold text-[#1f2937]">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#2f9f4f] text-[10px] font-bold text-white">LS</span>
              LocalSupply
            </p>
            <p className="mt-2 max-w-md leading-relaxed">
              AI-powered grocery comparison. We check prices across every Norwegian chain and find the cheapest way to fill your cart — delivery included.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-[#111827]">Company</h3>
            <ul className="mt-2 space-y-1.5 text-[#4b5563]">
              <li>About</li>
              <li>Careers</li>
              <li>Blog</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-[#111827]">Support</h3>
            <ul className="mt-2 space-y-1.5 text-[#4b5563]">
              <li>Help Center</li>
              <li>Contact</li>
              <li>Status</li>
            </ul>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-[#6b7280]">&copy; 2026 LocalSupply. All rights reserved.</p>
      </footer>
    </main>
  )
}
