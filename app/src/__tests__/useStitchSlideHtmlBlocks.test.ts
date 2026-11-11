import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { useUpsertStitchSlideHtmlBlock } from '@/hooks/useStitchSlideHtmlBlocks'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ profile: { id: 'admin', role: 'admin', is_active: true } }) }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ upsert: () => ({ select: () => ({ single: async () => ({ data: {}, error: null }) }) }) }) } }))

describe('saved Ryan finance inputs', () => {
  it('invalidates the latest saved deck as well as the selected period after saving', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    let save: ReturnType<typeof useUpsertStitchSlideHtmlBlock>['mutateAsync']
    function Test() { save = useUpsertStitchSlideHtmlBlock().mutateAsync; return null }
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    await act(async () => { root.render(createElement(QueryClientProvider, { client }, createElement(Test))) })
    await act(async () => { await save!({ period_month:'2026-11-01', slide_key:'custom:ryan-html-deck', view_mode:'html', html_code:'deck' }) })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['stitch_slide_html_blocks', '2026-11-01'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['stitch_slide_html_blocks', 'ryan-latest'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['stitch_slide_html_blocks', 'ryan-finance-milestones'] })
    await act(async () => root.unmount())
    container.remove()
    client.clear()
  })
})
