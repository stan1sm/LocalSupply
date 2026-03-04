import RegisterPage from '../../features/pages/auth/RegisterPage'

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function Page({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const rawVippsError = resolvedSearchParams.vippsError
  const vippsError = Array.isArray(rawVippsError) ? rawVippsError[0] : rawVippsError

  return <RegisterPage vippsError={vippsError} />
}
