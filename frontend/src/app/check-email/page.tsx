/**
 * @module routes/check-email
 * Next.js route entry — passes the verificationPreviewUrl search param to CheckEmailPage.
 */

import CheckEmailPage from '../../features/pages/auth/CheckEmailPage'

export type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

/**
 * Next.js page component — resolves the verificationPreviewUrl search param and delegates to CheckEmailPage.
 * @param searchParams - Promise resolving to the URL search parameters.
 */
export default async function Page({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const rawVerificationPreviewUrl = resolvedSearchParams.verificationPreviewUrl
  const verificationPreviewUrl = Array.isArray(rawVerificationPreviewUrl)
    ? rawVerificationPreviewUrl[0]
    : rawVerificationPreviewUrl

  return <CheckEmailPage verificationPreviewUrl={verificationPreviewUrl} />
}
