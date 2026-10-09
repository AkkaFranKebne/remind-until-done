import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { createContext, useContext, useState, type ReactNode } from 'react'

const Content = createContext<ReactNode>(null)

function Root() {
  return useContext(Content)
}

/**
 * Renders a component inside a small router, so components with <Link> work
 * in tests and Storybook. The router is created once; new children (e.g. a
 * Storybook control change) flow in through context, so nothing remounts.
 */
export function WithRouter({ children }: { children: ReactNode }) {
  const [router] = useState(() =>
    createRouter({
      routeTree: createRootRoute({ component: Root }),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    }),
  )
  return (
    <Content.Provider value={children}>
      <RouterProvider router={router} />
    </Content.Provider>
  )
}
