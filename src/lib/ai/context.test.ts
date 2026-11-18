import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildConversationContext, loadCustomerDetails } from './context'

/** Minimal fake matching the query chain in buildConversationContext:
 *  from().select().eq().eq().order().limit() → { data, error }. */
function fakeDb(rows: unknown[]): SupabaseClient {
  const chain = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    not: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: rows, error: null }),
  }
  return chain as unknown as SupabaseClient
}

describe('buildConversationContext', () => {
  it('maps sender_type to role and returns chronological order', async () => {
    // DB returns newest-first (created_at DESC); the fn reverses it.
    const rows = [
      { sender_type: 'customer', content_text: 'third' },
      { sender_type: 'agent', content_text: 'second' },
      { sender_type: 'customer', content_text: 'first' },
    ]
    const out = await buildConversationContext(fakeDb(rows), 'conv-1')
    expect(out).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'second' },
      { role: 'user', content: 'third' },
    ])
  })

  it('treats bot messages as assistant', async () => {
    const out = await buildConversationContext(
      fakeDb([{ sender_type: 'bot', content_text: 'auto reply' }]),
      'conv-1',
    )
    expect(out).toEqual([{ role: 'assistant', content: 'auto reply' }])
  })

  it('drops empty / whitespace-only messages', async () => {
    const out = await buildConversationContext(
      fakeDb([
        { sender_type: 'customer', content_text: '   ' },
        { sender_type: 'customer', content_text: null },
        { sender_type: 'customer', content_text: 'real' },
      ]),
      'conv-1',
    )
    expect(out).toEqual([{ role: 'user', content: 'real' }])
  })
})

describe('loadCustomerDetails', () => {
  it('returns undefined if contactId is missing', async () => {
    const res = await loadCustomerDetails(fakeDb([]), 'acct-1', null)
    expect(res).toBeUndefined()
  })

  it('formats contact and appointment details properly', async () => {
    const contactData = { name: 'Sanjeevi', phone: '919688482404', email: null }
    const apptData = {
      customer_name: 'Sanjeevi',
      location: 'Coimbatore',
      phone: '919688482404',
      appointment_date: '2026-11-18',
      appointment_time: '10:00 AM',
      appointment_type: 'New RO Purifier',
      additional_requirements: '25 LPH RO purifier for home',
      status: 'pending',
    }

    const mockDb = {
      from: (table: string) => {
        const query: Record<string, unknown> = {
          select: () => query,
          eq: () => query,
          order: () => query,
          limit: () => query,
          maybeSingle: () => {
            if (table === 'contacts') return Promise.resolve({ data: contactData, error: null })
            if (table === 'appointments') return Promise.resolve({ data: apptData, error: null })
            return Promise.resolve({ data: null, error: null })
          },
        }
        return query
      },
    } as unknown as SupabaseClient

    const details = await loadCustomerDetails(mockDb, 'acct-1', 'ct-1')
    expect(details).toContain('Name: Sanjeevi')
    expect(details).toContain('Phone: 919688482404')
    expect(details).toContain('Recent Appointment Booking (pending):')
    expect(details).toContain('Service/Type: New RO Purifier')
    expect(details).toContain('Area/Location: Coimbatore')
    expect(details).toContain('Requirement/Details: 25 LPH RO purifier for home')
  })
})
