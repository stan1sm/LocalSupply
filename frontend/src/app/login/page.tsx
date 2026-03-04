import LoginPage from '../../features/pages/auth/LoginPage'

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function Page({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const rawVippsError = resolvedSearchParams.vippsError
  const vippsError = Array.isArray(rawVippsError) ? rawVippsError[0] : rawVippsError

  return <LoginPage vippsError={vippsError} />
}
