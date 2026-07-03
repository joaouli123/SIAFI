/**
 * Direct Supabase MFA REST API calls using the user's access token from tokenStore.
 * We bypass the browser SDK client because our login flow is managed server-side
 * (NestJS calls signInWithPassword and returns the token), so the browser client
 * has no active session to attach to MFA requests.
 */
import { tokenStore } from '@/lib/api'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

function headers(extra?: Record<string, string>) {
  return {
    Authorization: `Bearer ${tokenStore.get()}`,
    apikey: SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    ...extra,
  }
}

async function expectOk(res: Response) {
  if (res.ok) return res.json()
  const err = await res.json().catch(() => ({}))
  throw new Error(err.error_description ?? err.message ?? `HTTP ${res.status}`)
}

export interface MfaFactor {
  id: string
  status: 'unverified' | 'verified'
  factor_type: string
}

export interface EnrollResult {
  id: string
  type: string
  totp: { qr_code: string; secret: string; uri: string }
}

export async function mfaEnroll(): Promise<EnrollResult> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/factors`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      factor_type: 'totp',
      issuer: 'SIAFI',
      friendly_name: 'Google Authenticator',
    }),
  })
  return expectOk(res)
}

export async function mfaListFactors(): Promise<MfaFactor[]> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: headers(),
  })
  const data = await expectOk(res)
  return data?.factors ?? []
}

export async function mfaChallengeAndVerify(
  factorId: string,
  code: string,
): Promise<{ access_token: string; refresh_token: string }> {
  // 1. Create challenge
  const challengeRes = await fetch(`${SUPABASE_URL}/auth/v1/factors/${factorId}/challenge`, {
    method: 'POST',
    headers: headers(),
  })
  const { id: challengeId } = await expectOk(challengeRes)

  // 2. Verify — returns a new aal2 session
  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/factors/${factorId}/verify`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ challenge_id: challengeId, code }),
  })
  return expectOk(verifyRes)
}

export async function mfaUnenroll(factorId: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/factors/${factorId}`, {
    method: 'DELETE',
    headers: headers(),
  })
  if (!res.ok) await expectOk(res)
}
