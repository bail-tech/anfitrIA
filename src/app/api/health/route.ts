import { CLAUDE_MODEL, features } from '@/lib/env';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({
    status: 'ok',
    app: 'AnfitrIA',
    ai: features.claude() ? CLAUDE_MODEL : 'mock',
    whatsapp: features.whatsapp(),
    voice: features.openai(),
    service_role: features.serviceRole(),
    managed_agents: features.managedAgents(),
  });
}
