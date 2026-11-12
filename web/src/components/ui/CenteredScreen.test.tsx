import { render, screen } from '@testing-library/react'
import { CenteredScreen } from './CenteredScreen'

test('puts the content in the page main area, centred', () => {
  render(
    <CenteredScreen>
      <p>Hello</p>
    </CenteredScreen>,
  )

  const main = screen.getByRole('main')
  expect(main).toContainElement(screen.getByText('Hello'))
  expect(main).toHaveClass('justify-center', 'items-center')
})

test('without a header it keeps clear of the notch itself', () => {
  render(<CenteredScreen>x</CenteredScreen>)

  expect(screen.getByRole('main').className).toContain('safe-area-inset-top')
})

test('with a header, the header comes first and handles the notch', () => {
  render(<CenteredScreen header={<header>Top</header>}>x</CenteredScreen>)

  const main = screen.getByRole('main')
  expect(screen.getByRole('banner').nextElementSibling).toBe(main)
  expect(main.className).not.toContain('safe-area-inset-top')
})

test('className changes the spacing (later class wins)', () => {
  render(<CenteredScreen className="gap-2">x</CenteredScreen>)

  expect(screen.getByRole('main')).toHaveClass('gap-2')
  expect(screen.getByRole('main')).not.toHaveClass('gap-4')
})

test('a footer comes after the content and takes over the home bar safe area', () => {
  render(<CenteredScreen footer={<a href="/privacy.html">Privacy</a>}>x</CenteredScreen>)

  const main = screen.getByRole('main')
  const footer = screen.getByRole('contentinfo')
  expect(main.nextElementSibling).toBe(footer)
  expect(footer).toContainElement(screen.getByRole('link', { name: 'Privacy' }))
  expect(footer.className).toContain('safe-area-inset-bottom')
  expect(main.className).not.toContain('safe-area-inset-bottom')
})
