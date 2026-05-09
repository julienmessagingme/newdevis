/**
 * OwnerChannelToggle — bouton dans Settings pour activer le canal WhatsApp privé IA.
 *
 * Le canal owner (`chantier_whatsapp_groups.is_owner_channel = true`) est un groupe
 * WhatsApp avec UNIQUEMENT le user et le numéro GMC (pas les artisans). C'est par ce
 * canal que l'agent IA pousse ses alertes proactives, demandes de décision, rappels
 * programmés. Sans canal owner, `schedule_reminder` et `notify_owner_for_decision`
 * échouent silencieusement côté agent.
 *
 * Aujourd'hui le canal peut aussi être créé via l'agent qui appelle
 * `create_owner_whatsapp_channel`. Ce composant expose la même action via UI pour les
 * users qui ne passent pas par le chat.
 */
import { useState } from 'react';
import { Loader2, Check, AlertCircle, MessageCircle } from 'lucide-react';

interface OwnerChannelToggleProps {
  chantierId: string;
  token:      string;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; alreadyExisted: boolean; inviteLink?: string }
  | { kind: 'error'; message: string };

export default function OwnerChannelToggle({ chantierId, token }: OwnerChannelToggleProps) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function activate() {
    setStatus({ kind: 'loading' });
    try {
      const res = await fetch(`/api/chantier/${chantierId}/whatsapp`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ is_owner_channel: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({ kind: 'error', message: data?.error ?? `HTTP ${res.status}` });
        return;
      }
      setStatus({
        kind: 'success',
        alreadyExisted: !!data?.already_exists,
        inviteLink:     data?.group?.invite_link,
      });
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'erreur réseau' });
    }
  }

  return (
    <div>
      <h2 className="font-semibold text-gray-900 mb-3">Notifications WhatsApp IA</h2>
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
            <MessageCircle className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Canal privé avec votre assistant IA</p>
            <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">
              Active un groupe WhatsApp avec uniquement vous et l'IA. Vous y recevrez les alertes
              importantes, les rappels programmés et les questions de l'assistant. Aucun artisan n'y
              a accès.
            </p>
          </div>
        </div>

        {status.kind === 'idle' && (
          <button
            onClick={activate}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors touch-manipulation"
          >
            Activer le canal WhatsApp IA
          </button>
        )}

        {status.kind === 'loading' && (
          <button
            disabled
            className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold opacity-70 cursor-wait"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Création du canal…
          </button>
        )}

        {status.kind === 'success' && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
            <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1 text-[12px]">
              <p className="font-semibold text-emerald-800">
                {status.alreadyExisted ? 'Canal déjà actif' : 'Canal activé !'}
              </p>
              <p className="text-emerald-700 mt-0.5">
                {status.alreadyExisted
                  ? 'Vous receviez déjà les notifications IA dans ce groupe.'
                  : 'Vérifiez WhatsApp — un message de bienvenue arrive.'}
              </p>
              {status.inviteLink && (
                <a
                  href={status.inviteLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-1.5 text-emerald-700 underline hover:text-emerald-900"
                >
                  Ouvrir le groupe →
                </a>
              )}
            </div>
          </div>
        )}

        {status.kind === 'error' && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 text-[12px]">
              <p className="font-semibold text-red-800">Activation impossible</p>
              <p className="text-red-700 mt-0.5">{status.message}</p>
              <button
                onClick={activate}
                className="mt-1.5 text-red-700 underline hover:text-red-900"
              >
                Réessayer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
