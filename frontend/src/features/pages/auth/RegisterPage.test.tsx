import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import RegisterPage from './RegisterPage'

const pushMock = vi.fn()

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}))

describe('RegisterPage', () => {
  it('shows password mismatch until passwords match', () => {
    render(<RegisterPage />)

    const passwordInput = screen.getByPlaceholderText('Create a strong password')
    const confirmPasswordInput = screen.getByPlaceholderText('Repeat your password')

    fireEvent.change(passwordInput, { target: { value: 'Abcd!123' } })
    fireEvent.change(confirmPasswordInput, { target: { value: 'Abcd!124' } })

    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument()

    fireEvent.change(confirmPasswordInput, { target: { value: 'Abcd!123' } })

    expect(screen.queryByText("Passwords don't match.")).not.toBeInTheDocument()
  })
})
