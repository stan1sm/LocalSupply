import { Link } from 'react-router-dom'

const howItWorks = [
  {
    title: 'Find Your Groceries',
    description: 'Quickly search for produce and daily essentials from your favorite local stores.',
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-3.6-3.6" />
      </svg>
    ),
  },
  {
    title: 'Compare Prices',
    description: 'See real-time prices across suppliers so you can confidently choose the best deal.',
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
        <path d="M12 3v18" />
        <path d="M17 7.5c0-1.9-2.2-3.5-5-3.5S7 5.6 7 7.5 9.2 11 12 11s5 1.6 5 3.5S14.8 18 12 18s-5-1.6-5-3.5" />
      </svg>
    ),
  },
  {
    title: 'Schedule Delivery',
    description: 'Choose a delivery window that fits your day and track your order to your door.',
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

const reasons = [
  {
    title: 'Maximize Your Savings',
    description:
      'Our intelligent comparison engine checks prices at nearby partners so every cart has better value.',
  },
  {
    title: 'Fast and Reliable Delivery',
    description:
      'From produce to pantry staples, LocalSupply helps you schedule delivery with confidence and clear timing.',
  },
]

const shoppingLists = [
  {
    title: 'Weekly Staples',
    items: '18 items',
    image:
      'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80',
  },
  {
    title: 'Healthy Meals',
    items: '14 items',
    image:
      'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=900&q=80',
  },
  {
    title: 'Quick Dinners',
    items: '12 items',
    image:
      'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?auto=format&fit=crop&w=900&q=80',
  },
  {
    title: 'Snack Restock',
    items: '10 items',
    image:
      'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=900&q=80',
  },
]

export default function HomePage() {
  return (
    <main className="bg-[#f2f4ef] text-[#1f2937]">
      <section className="mx-auto w-full max-w-6xl px-4 pb-12 pt-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
          <Link className="inline-flex items-center gap-2 text-sm font-bold text-[#2f9f4f]" to="/">
            <span className="grid h-5 w-5 place-items-center rounded bg-[#2f9f4f] text-[10px] text-white">LS</span>
            LocalSupply
          </Link>

          <label className="mx-4 hidden w-full max-w-md items-center gap-2 rounded-full border border-[#d8dfd4] bg-[#f9fbf8] px-3 py-2 text-sm text-[#6b7280] md:flex">
            <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-3.6-3.6" />
            </svg>
            <input
              className="w-full bg-transparent outline-none placeholder:text-[#9ca3af]"
              placeholder="Search for groceries..."
              type="search"
            />
          </label>

          <Link className="text-sm font-semibold text-[#1f2937] hover:text-[#2f9f4f]" to="/register">
            Sign in
          </Link>
        </header>

        <div className="mt-8 grid items-center gap-8 rounded-3xl bg-white p-6 shadow-[0_15px_40px_rgba(15,23,42,0.06)] sm:p-8 lg:grid-cols-2">
          <div>
            <h1 className="max-w-md text-3xl font-extrabold leading-tight text-[#1f2937] sm:text-4xl">
              Find the best local prices for your groceries
            </h1>
            <p className="mt-4 max-w-md text-sm text-[#5b665f] sm:text-base">
              Compare prices, discover deals, and get groceries delivered from local stores, all in one smart app.
            </p>
            <div className="mt-6 flex gap-3">
              <Link
                className="rounded-lg bg-[#2f9f4f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#25813f]"
                to="/register"
              >
                Start Shopping
              </Link>
              <Link
                className="rounded-lg border border-[#d0d8cc] px-5 py-2.5 text-sm font-semibold text-[#314237] transition hover:border-[#2f9f4f] hover:text-[#2f9f4f]"
                to="/supplier/register"
              >
                For Suppliers
              </Link>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl">
            <img
              alt="A shopping cart with fresh groceries."
              className="h-[280px] w-full object-cover sm:h-[320px]"
              src="https://images.unsplash.com/photo-1543168256-418811576931?auto=format&fit=crop&w=1200&q=80"
            />
          </div>
        </div>
      </section>

      <section className="border-y border-[#e2e8df] bg-[#f7f9f5] py-14">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold text-[#1f2937]">How LocalSupply Works</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {howItWorks.map((step) => (
              <article
                className="rounded-2xl border border-[#dce5d7] bg-white p-6 text-center shadow-[0_10px_25px_rgba(15,23,42,0.05)]"
                key={step.title}
              >
                <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-[#eaf7ee] text-[#2f9f4f]">{step.icon}</div>
                <h3 className="mt-4 text-lg font-semibold text-[#253128]">{step.title}</h3>
                <p className="mt-2 text-sm text-[#5b665f]">{step.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <h2 className="text-center text-3xl font-bold text-[#1f2937]">Why Choose LocalSupply?</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {reasons.map((reason) => (
            <article className="rounded-2xl bg-white p-6 shadow-[0_10px_25px_rgba(15,23,42,0.05)]" key={reason.title}>
              <h3 className="text-xl font-semibold text-[#253128]">{reason.title}</h3>
              <p className="mt-3 text-sm text-[#5b665f] sm:text-base">{reason.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-[#e2e8df] bg-[#f7f9f5] py-14">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold text-[#1f2937]">Popular Shopping Lists</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {shoppingLists.map((list) => (
              <article className="group relative overflow-hidden rounded-xl" key={list.title}>
                <img
                  alt={`${list.title} shopping list`}
                  className="h-44 w-full object-cover transition duration-300 group-hover:scale-105"
                  src={list.image}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <h3 className="text-sm font-semibold text-white">{list.title}</h3>
                  <p className="text-xs text-white/80">{list.items}</p>
                </div>
              </article>
            ))}
          </div>
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
              Grocery delivery made local. Compare prices and get essentials delivered from stores and suppliers near you.
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
        <p className="mt-8 text-center text-xs text-[#8b978e]">© 2026 LocalSupply. All rights reserved.</p>
      </footer>
    </main>
  )
}
