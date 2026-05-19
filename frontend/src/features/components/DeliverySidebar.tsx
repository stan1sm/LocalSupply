/**
 * @module DeliverySidebar
 * Navigation sidebar component for the delivery person area of the application.
 */

'use client'

export type DeliveryPersonInfo = { name: string; email: string | null }

const navItems = [
  {
    id: 'dashboard',
    label: 'Available Orders',
    href: '/delivery/dashboard',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
      </svg>
    ),
  },
  {
    id: 'my-orders',
    label: 'My Deliveries',
    href: '/delivery/my-orders',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4" />
      </svg>
    ),
  },
]

export default function DeliverySidebar({
  activeId,
  person,
}: {
  activeId: string
  person: DeliveryPersonInfo
}) {
  return (
    <aside className="flex flex-col rounded-[28px] border border-[#dce5d7] bg-white/95 p-4 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
      <div className="px-2 pb-5">
        <a
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#2f9f4f] hover:text-[#1f2937]"
          href="/"
        >
          <span aria-hidden="true">←</span>
          <span>LocalSupply</span>
        </a>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#2f9f4f]">Delivery</p>
        <h2 className="mt-1.5 text-[17px] font-bold leading-snug text-[#1f2b22]">{person.name}</h2>
        {person.email ? <p className="mt-1 text-xs text-[#6d7b70]">{person.email}</p> : null}
      </div>

      <nav aria-label="Delivery navigation" className="flex-1 space-y-0.5">
        {navItems.map((item) => {
          const isActive = item.id === activeId
          return (
            <a
              key={item.id}
              aria-current={isActive ? 'page' : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[#eef6f0] text-[#1a7a34]'
                  : 'text-[#4f5d52] hover:bg-[#f6faf5] hover:text-[#1f2b22]'
              }`}
              href={item.href}
            >
              <span className={`shrink-0 ${isActive ? 'text-[#2f9f4f]' : 'text-[#8a9e8f]'}`}>{item.icon}</span>
              {item.label}
            </a>
          )
        })}
      </nav>

      <div className="mt-3 border-t border-[#eef2ec] pt-3">
        <button
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[#c53030] transition-colors hover:bg-[#fff5f5] hover:text-[#9b2c2c]"
          onClick={() => {
            window.localStorage.removeItem('localsupply-delivery-token')
            window.localStorage.removeItem('localsupply-delivery-person')
            window.location.href = '/delivery/login'
          }}
          type="button"
        >
          <span className="shrink-0 text-[#c53030]">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
            </svg>
          </span>
          Log out
        </button>
      </div>
    </aside>
  )
}
