/** Row shapes of the Supabase tables the cockpit reads (see supabase/migrations). */

export interface Profile {
  id: string;
  org_id: number;
  name: string;
  email: string;
  role: 'owner' | 'member';
  assistant_language: 'auto' | 'es' | 'en' | 'fr' | 'de' | 'it';
  voice: string;
  voice_custom_id: string | null;
}

export interface Property {
  ses_establishment_code: string | null;
  external_ref: string | null;
  id: number;
  org_id: number;
  building_id: number | null;
  name: string;
  address: string | null;
  default_language: string;
  auto_answer: boolean;
  auto_answer_threshold: number | null;
  whatsapp_phone_number_id: string | null;
  timezone: string;
  cleaning_minutes: number;
  check_in_time: string;
  check_out_time: string;
  created_at: string;
}

export interface Building {
  id: number;
  org_id: number;
  name: string;
}

export interface KnowledgeItem {
  id: number;
  property_id: number | null;
  building_id: number | null;
  category: string;
  content: string;
  is_private: boolean;
  created_at: string;
}

export type ReservationSource = 'booking' | 'airbnb' | 'direct' | 'other';

export interface Reservation {
  id: number;
  property_id: number;
  guest_name: string;
  guest_ref: string;
  check_in: string;
  check_out: string;
  status: 'upcoming' | 'active' | 'past' | 'cancelled';
  source: ReservationSource;
  code: string | null;
  total_amount: number | null;
  nightly_rate: number | null;
  currency: string;
  guests: number | null;
  channel_fee: number | null;
  review_ok: boolean;
  marketing_ok: boolean;
}

export interface Conversation {
  id: number;
  property_id: number;
  guest_ref: string;
  channel: string;
  reservation_id: number | null;
  handoff: boolean;
  last_guest_message_at: string | null;
  created_at: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  direction: 'in' | 'out';
  text: string;
  language: string;
  kind: 'text' | 'audio';
  media_path: string | null;
  transcript: string | null;
  external_id: string | null;
  created_at: string;
}

export type EscalationReason = 'auto' | 'manual' | 'sin_info' | 'poca_confianza' | 'urgente';

export interface Draft {
  id: number;
  inbound_message_id: number;
  text: string;
  language: string;
  confidence: number;
  model: string;
  reason: EscalationReason | null;
  status: 'pending' | 'approved' | 'edited' | 'sent';
  created_at: string;
}

export type AgentKey = 'guest' | 'operations' | 'pricing' | 'analytics' | 'marketing';

export interface AgentSetting {
  org_id: number;
  agent: AgentKey;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface AgentRun {
  id: string;
  agent: AgentKey;
  status: 'running' | 'completed' | 'failed' | 'budget_exceeded';
  summary: string | null;
  error: string | null;
  cost_cents: number;
  started_at: string;
  finished_at: string | null;
}

export type ProposalKind = 'price' | 'guest_message' | 'staff_message' | 'listing_copy' | 'review_reply' | 'knowledge' | 'task';

export interface Proposal {
  id: string;
  org_id: number;
  agent: string;
  kind: ProposalKind;
  property_id: number | null;
  conversation_id: number | null;
  title: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'applied' | 'failed';
  created_at: string;
}

export interface Task {
  id: string;
  org_id: number;
  property_id: number | null;
  reservation_id: number | null;
  kind: 'turnover' | 'maintenance' | 'missing_info' | 'other';
  title: string;
  notes: string | null;
  due_at: string | null;
  window_minutes: number | null;
  status: 'open' | 'done' | 'cancelled';
  staff_id: string | null;
  source: 'host' | 'system' | 'ai';
  dedupe_key: string | null;
}

export interface Staff {
  id: string;
  name: string;
  phone: string | null;
  role: 'cleaning' | 'maintenance' | 'other';
}

export type TemplateKind = 'booking_confirmed' | 'pre_arrival' | 'check_in' | 'during_stay' | 'checkout' | 'post_stay' | 'saved_reply';
export type TemplateAnchor = 'booking' | 'check_in' | 'check_out';

export interface MessageTemplate {
  id: string;
  property_id: number | null;
  kind: TemplateKind;
  anchor: TemplateAnchor | null;
  min_nights: number | null;
  positive_only: boolean;
  as_voice: boolean;
  title: string;
  language: string;
  body: string;
  approved: boolean;
  send_offset_hours: number | null;
}
