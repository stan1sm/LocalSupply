import EmailVerifiedPage from '../../features/pages/auth/EmailVerifiedPage'

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function Page({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const rawStatus = resolvedSearchParams.status
  const status = Array.isArray(rawStatus) ? rawStatus[0] : rawStatus

  return <EmailVerifiedPage status={status} />
}
