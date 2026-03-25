export interface MessageTemplate {
  id: string;
  label: string;
  category: 'devis' | 'relance' | 'administratif' | 'planning';
  subject: string;
  body: string;
}

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    id: 'demande_devis',
    label: 'Demande de devis',
    category: 'devis',
    subject: 'Demande de devis - {{chantier_nom}}',
    body: `Bonjour {{artisan_nom}},

Je vous contacte dans le cadre de mon projet "{{chantier_nom}}".

Pourriez-vous me faire parvenir un devis pour les travaux correspondants ?

Je reste disponible pour tout complément d'information.

Cordialement,
{{client_nom}}`,
  },
  {
    id: 'relance_devis',
    label: 'Relance devis',
    category: 'relance',
    subject: 'Relance - Devis en attente - {{chantier_nom}}',
    body: `Bonjour {{artisan_nom}},

Je me permets de revenir vers vous concernant ma demande de devis pour le projet "{{chantier_nom}}".

N'ayant pas encore reçu votre proposition, pourriez-vous me donner une estimation du délai ?

Cordialement,
{{client_nom}}`,
  },
  {
    id: 'demande_attestation',
    label: 'Demande attestation',
    category: 'administratif',
    subject: 'Demande d\'attestation d\'assurance - {{chantier_nom}}',
    body: `Bonjour {{artisan_nom}},

Dans le cadre du projet "{{chantier_nom}}", pourriez-vous me transmettre votre attestation d'assurance décennale en cours de validité ?

Ce document est nécessaire avant le démarrage des travaux.

Cordialement,
{{client_nom}}`,
  },
  {
    id: 'confirmation_planning',
    label: 'Confirmation planning',
    category: 'planning',
    subject: 'Confirmation de planning - {{chantier_nom}}',
    body: `Bonjour {{artisan_nom}},

Je souhaite confirmer les dates d'intervention prévues pour le projet "{{chantier_nom}}".

Pouvez-vous me confirmer votre disponibilité ?

Cordialement,
{{client_nom}}`,
  },
];

export const TEMPLATE_CATEGORIES: Record<MessageTemplate['category'], string> = {
  devis: 'Devis',
  relance: 'Relances',
  administratif: 'Administratif',
  planning: 'Planning',
};

/** Replace {{variable}} placeholders with actual values */
export function interpolateTemplate(
  text: string,
  vars: Record<string, string>,
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match);
}
