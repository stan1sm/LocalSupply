/**
 * @module routes/email-verified
 * Next.js route entry — passes the status search param to EmailVerifiedPage.
 */

import EmailVerifiedPage from '../../features/pages/auth/EmailVerifiedPage'

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

/**
 * Next.js page component — resolves the status search param and delegates to EmailVerifiedPage.
 * @param searchParams - Promise resolving to the URL search parameters.
 */
export default async function Page({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const rawStatus = resolvedSearchParams.status
  const status = Array.isArray(rawStatus) ? rawStatus[0] : rawStatus

  return <EmailVerifiedPage status={status} />
}
