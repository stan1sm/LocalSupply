import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import RegisterPage from './RegisterPage'

describe('RegisterPage', () => {
  it('shows password mismatch until passwords match', () => {
    render(
      <BrowserRouter>
        <RegisterPage />
      </BrowserRouter>,
    )

    const passwordInput = screen.getByPlaceholderText('Create a secure password')
    const confirmPasswordInput = screen.getByPlaceholderText('Repeat your password')

    fireEvent.change(passwordInput, { target: { value: 'Abcd!123' } })
    fireEvent.change(confirmPasswordInput, { target: { value: 'Abcd!124' } })

    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument()

    fireEvent.change(confirmPasswordInput, { target: { value: 'Abcd!123' } })

    expect(screen.queryByText("Passwords don't match.")).not.toBeInTheDocument()
  })
})
