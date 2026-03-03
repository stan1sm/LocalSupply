import EmailNotVerifiedPage from '../../features/pages/auth/EmailNotVerifiedPage'

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function Page({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const rawEmail = resolvedSearchParams.email
  const email = Array.isArray(rawEmail) ? rawEmail[0] : rawEmail

  return <EmailNotVerifiedPage email={email} />
}
