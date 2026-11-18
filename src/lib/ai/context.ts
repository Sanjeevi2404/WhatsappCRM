import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChatMessage } from './types'
import { aiContextMessageLimit } from './defaults'

interface DbMessage {
  sender_type: 'customer' | 'agent' | 'bot'
  content_text: string | null
}

/**
 * Fetch the last N text messages of a conversation and map them to the
 * provider-neutral chat shape. Customer messages become `user`; agent
 * and bot messages become `assistant`. Non-text messages (media,
 * templates, interactive) are excluded — they carry no text to model.
 *
 * Ordered oldest-first (chronological) so the transcript reads
 * naturally and the most recent customer message lands last.
 */
export async function buildConversationContext(
  db: SupabaseClient,
  conversationId: string,
  limit: number = aiContextMessageLimit(),
): Promise<ChatMessage[]> {
  const { data, error } = await db
    .from('messages')
    .select('sender_type, content_text')
    .eq('conversation_id', conversationId)
    .not('content_text', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  const rows = ((data ?? []) as DbMessage[]).reverse()
  return rows
    .filter((m) => m.content_text && m.content_text.trim())
    .map((m) => ({
      role: m.sender_type === 'customer' ? 'user' : 'assistant',
      content: m.content_text!.trim(),
    }))
}

/**
 * Fetch known contact information and recent appointment/booking details
 * for the customer so the AI can answer questions about their details and avoid
 * repeatedly asking for info the customer has already submitted.
 */
export async function loadCustomerDetails(
  db: SupabaseClient,
  accountId: string,
  contactId?: string | null,
): Promise<string | undefined> {
  if (!contactId) return undefined

  try {
    const parts: string[] = []

    const { data: contact } = await db
      .from('contacts')
      .select('name, phone, email')
      .eq('id', contactId)
      .maybeSingle()

    if (contact) {
      if (contact.name) parts.push(`Name: ${contact.name}`)
      if (contact.phone) parts.push(`Phone: ${contact.phone}`)
      if (contact.email) parts.push(`Email: ${contact.email}`)
    }

    const { data: appt } = await db
      .from('appointments')
      .select('customer_name, location, phone, appointment_date, appointment_time, appointment_type, additional_requirements, status')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (appt) {
      parts.push(`Recent Appointment Booking (${appt.status}):`)
      if (appt.customer_name && (!contact?.name || contact.name !== appt.customer_name)) {
        parts.push(`  Customer Name: ${appt.customer_name}`)
      }
      if (appt.appointment_type) parts.push(`  Service/Type: ${appt.appointment_type}`)
      if (appt.appointment_date) parts.push(`  Date: ${appt.appointment_date} at ${appt.appointment_time}`)
      if (appt.location) parts.push(`  Area/Location: ${appt.location}`)
      if (appt.additional_requirements) parts.push(`  Requirement/Details: ${appt.additional_requirements}`)
    }

    return parts.length > 0 ? parts.join('\n') : undefined
  } catch (err) {
    console.warn('[ai context] loadCustomerDetails failed (continuing):', err)
    return undefined
  }
}

