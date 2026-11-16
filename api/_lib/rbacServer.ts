/**
 * Server-side role checks for API routes.
 * Never trust client-sent role claims.
 */
import { requireBusinessMember } from './security';

const ROLE_RANK: Record<string, number> = {
  staff: 1,
  manager: 2,
  admin: 3,
  owner: 4
};

export async function requireMinRole(
  accessToken: string,
  businessId: string,
  minRole: 'staff' | 'manager' | 'admin' | 'owner'
): Promise<{ role: string }> {
  const { role } = await requireBusinessMember(accessToken, businessId);
  const have = ROLE_RANK[String(role).toLowerCase()] || 0;
  const need = ROLE_RANK[minRole] || 99;
  if (have < need) {
    throw Object.assign(new Error('Insufficient role'), { status: 403 });
  }
  return { role };
}

/** Integrations connect/sync require at least manager */
export async function requireIntegrationManager(accessToken: string, businessId: string) {
  return requireMinRole(accessToken, businessId, 'manager');
}
