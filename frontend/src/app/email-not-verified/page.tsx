/**
 * @module routes/email-not-verified
 * Next.js route entry — passes the email search param to EmailNotVerifiedPage.
 */

import EmailNotVerifiedPage from '../../features/pages/auth/EmailNotVerifiedPage'

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

/**
 * Next.js page component — resolves the email search param and delegates to EmailNotVerifiedPage.
 * @param searchParams - Promise resolving to the URL search parameters.
 */
export default async function Page({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const rawEmail = resolvedSearchParams.email
  const email = Array.isArray(rawEmail) ? rawEmail[0] : rawEmail

  return <EmailNotVerifiedPage email={email} />
}
