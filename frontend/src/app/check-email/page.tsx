import CheckEmailPage from '../../features/pages/auth/CheckEmailPage'

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function Page({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const rawVerificationPreviewUrl = resolvedSearchParams.verificationPreviewUrl
  const verificationPreviewUrl = Array.isArray(rawVerificationPreviewUrl)
    ? rawVerificationPreviewUrl[0]
    : rawVerificationPreviewUrl

  return <CheckEmailPage verificationPreviewUrl={verificationPreviewUrl} />
}
