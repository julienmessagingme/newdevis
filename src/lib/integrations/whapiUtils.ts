// src/lib/whapiUtils.ts

const API_URL = import.meta.env.WHAPI_API_URL ?? 'https://gate.whapi.cloud';
const TOKEN   = import.meta.env.WHAPI_TOKEN ?? '';

// Formate un numéro en format whapi : "33XXXXXXXXX" (sans + ni espaces)
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  // Numéro français commençant par 0 → remplacer par 33
  if (digits.startsWith('0') && digits.length === 10) return '33' + digits.slice(1);
  // Déjà en international avec 33
  if (digits.startsWith('33')) return digits;
  // Autre pays : on retourne tel quel
  return digits;
}

// Crée un groupe WhatsApp et retourne { groupId, inviteLink }
export async function createWhatsAppGroup(
  subject: string,
  participants: string[],
): Promise<{ groupId: string; inviteLink: string }> {
  // 1. Créer le groupe
  const createRes = await fetch(`${API_URL}/groups`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ subject, participants }),
  });
  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`whapi create group: ${createRes.status} — ${err}`);
  }
  const created = await createRes.json();
  const groupId: string = created.id ?? created.gid;
  if (!groupId) throw new Error('whapi: pas de groupId dans la réponse');

  // 2. Récupérer le lien d'invitation
  const inviteRes = await fetch(`${API_URL}/groups/${groupId}/invite`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!inviteRes.ok) throw new Error(`whapi get invite: ${inviteRes.status}`);
  const inviteData = await inviteRes.json();
  const inviteLink: string = inviteData.link ?? inviteData.invite_link ?? '';

  return { groupId, inviteLink };
}

// Ajoute des participants à un groupe existant
export async function addGroupParticipants(
  groupId: string,
  participants: string[],
): Promise<void> {
  const res = await fetch(`${API_URL}/groups/${groupId}/participants`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ participants }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`whapi add participants: ${res.status} — ${err}`);
  }
}
