import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Bell, 
  Calendar, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  Building2,
  Shield,
  Info
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PostSignatureTrackingSectionProps {
  analysisId: string;
  companySiret?: string;
  companyName?: string;
  workStartDate?: string;
  workEndDate?: string;
  maxExecutionDays?: number;
  isRejectedDocument?: boolean;
}

interface TrackingData {
  id: string;
  tracking_consent: boolean;
  is_signed: boolean;
  phone_number: string | null;
  work_start_date: string | null;
  work_end_date: string | null;
  deadline_alert_sent: boolean;
  work_completion_status: string | null;
}

const PostSignatureTrackingSection = ({
  analysisId,
  companySiret,
  companyName,
  workStartDate,
  workEndDate,
  maxExecutionDays,
  isRejectedDocument = false
}: PostSignatureTrackingSectionProps) => {
  const [isSigned, setIsSigned] = useState(false);
  const [trackingConsent, setTrackingConsent] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [existingTracking, setExistingTracking] = useState<TrackingData | null>(null);
  const [showCompletionQuestion, setShowCompletionQuestion] = useState(false);

  useEffect(() => {
    fetchExistingTracking();
  }, [analysisId]);

  const fetchExistingTracking = async () => {
    const { data, error } = await supabase
      .from("post_signature_tracking")
      .select("*")
      .eq("analysis_id", analysisId)
      .maybeSingle();

    if (data) {
      setExistingTracking(data as TrackingData);
      setIsSigned(data.is_signed);
      setTrackingConsent(data.tracking_consent);
      setPhoneNumber(data.phone_number || "");
      
      // Check if we should show the completion question
      if (data.deadline_alert_sent && !data.work_completion_status) {
        setShowCompletionQuestion(true);
      }
    }
  };

  const handleActivateTracking = async () => {
    if (!isSigned) {
      toast.error("Veuillez confirmer que vous avez signé le devis");
      return;
    }
    if (!trackingConsent) {
      toast.error("Veuillez accepter le suivi pour continuer");
      return;
    }

    setLoading(true);
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Vous devez être connecté");
      setLoading(false);
      return;
    }

    const trackingData = {
      analysis_id: analysisId,
      user_id: user.id,
      is_signed: true,
      signed_date: new Date().toISOString(),
      tracking_consent: true,
      consent_date: new Date().toISOString(),
      phone_number: phoneNumber || null,
      communication_channel: phoneNumber ? "whatsapp" : "email",
      company_siret: companySiret || null,
      company_name: companyName || null,
      work_start_date: workStartDate || null,
      work_end_date: workEndDate || null,
      max_execution_days: maxExecutionDays || null
    };

    const { data, error } = existingTracking
      ? await supabase
          .from("post_signature_tracking")
          .update(trackingData)
          .eq("id", existingTracking.id)
          .select()
          .single()
      : await supabase
          .from("post_signature_tracking")
          .insert(trackingData)
          .select()
          .single();

    if (error) {
      toast.error("Erreur lors de l'activation du suivi");
      console.error(error);
    } else {
      toast.success("Suivi post-signature activé avec succès !");
      setExistingTracking(data as TrackingData);
    }
    
    setLoading(false);
  };

  const handleCompletionResponse = async (status: string) => {
    if (!existingTracking) return;

    const { error } = await supabase
      .from("post_signature_tracking")
      .update({
        work_completion_status: status,
        work_completion_response_date: new Date().toISOString()
      })
      .eq("id", existingTracking.id);

    if (error) {
      toast.error("Erreur lors de l'enregistrement");
    } else {
      toast.success("Réponse enregistrée");
      setShowCompletionQuestion(false);
      fetchExistingTracking();
    }
  };

  // Don't show for rejected documents (factures, etc.)
  if (isRejectedDocument) return null;

  // If tracking is already active and consent given
  if (existingTracking?.tracking_consent) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 mb-6 card-shadow">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-score-green/10 rounded-lg">
            <Bell className="h-5 w-5 text-score-green" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Suivi post-signature activé</h2>
            <p className="text-sm text-muted-foreground">Vous recevrez des rappels et alertes informatifs</p>
          </div>
        </div>

        <div className="bg-accent/50 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-score-green mt-0.5" />
            <div className="text-sm">
              <p className="text-foreground font-medium">Suivi actif</p>
              <p className="text-muted-foreground">
                Nous vous informerons des échéances et des éventuelles évolutions administratives concernant l'entreprise.
              </p>
            </div>
          </div>
        </div>

        {/* Display extracted dates if available */}
        {(existingTracking.work_start_date || existingTracking.work_end_date) && (
          <div className="flex flex-wrap gap-4 mb-4 text-sm">
            {existingTracking.work_start_date && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Début prévu : {new Date(existingTracking.work_start_date).toLocaleDateString("fr-FR")}</span>
              </div>
            )}
            {existingTracking.work_end_date && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Fin prévue : {new Date(existingTracking.work_end_date).toLocaleDateString("fr-FR")}</span>
              </div>
            )}
          </div>
        )}

        {/* Completion question (shown after deadline alert) */}
        {showCompletionQuestion && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mt-4">
            <p className="text-sm font-medium text-foreground mb-3">
              Les travaux ont-ils été réalisés conformément au devis ?
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCompletionResponse("oui")}
              >
                Oui
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCompletionResponse("en_cours")}
              >
                En cours
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCompletionResponse("non_retard")}
              >
                Non / Retard
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Cette réponse est facultative et ne modifie pas votre analyse.
            </p>
          </div>
        )}

        {/* Completion status if already answered */}
        {existingTracking.work_completion_status && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-4">
            <CheckCircle2 className="h-4 w-4 text-score-green" />
            <span>Statut déclaré : {
              existingTracking.work_completion_status === "oui" ? "Travaux réalisés" :
              existingTracking.work_completion_status === "en_cours" ? "Travaux en cours" :
              "Non réalisés / Retard"
            }</span>
          </div>
        )}

        {/* Legal disclaimer */}
        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
          <p className="text-xs text-muted-foreground">
            <strong>Rappel :</strong> Les rappels et alertes sont fournis à titre informatif, sur la base des informations 
            figurant sur le devis transmis et des données publiques disponibles. Ils constituent une aide au suivi 
            et ne remplacent pas une analyse juridique ou contractuelle.
          </p>
        </div>
      </div>
    );
  }

  // Activation form
  return (
    <div className="bg-card border border-border rounded-xl p-6 mb-6 card-shadow">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Bell className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-foreground">Suivi post-signature</h2>
          <p className="text-sm text-muted-foreground">Restez informé pendant la durée de votre chantier</p>
        </div>
      </div>

      {/* Value proposition */}
      <div className="bg-accent/50 rounded-lg p-4 mb-6">
        <p className="text-sm text-foreground mb-3">
          <strong>Un suivi utile, même après la signature</strong>
        </p>
        <p className="text-sm text-muted-foreground mb-3">
          Avec votre accord, VerifierMonDevis.fr peut vous envoyer des rappels et alertes informatives 
          pendant la durée de votre chantier (délais prévus, informations administratives publiques), 
          afin de vous aider à suivre votre projet en toute sérénité.
        </p>
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <p>
            Ce service est optionnel et activé uniquement avec votre accord. 
            Les informations transmises sont factuelles et issues des éléments figurant sur le devis ou de sources publiques officielles.
          </p>
        </div>
      </div>

      {/* Activation form */}
      <div className="space-y-4">
        {/* Signature confirmation */}
        <div className="flex items-start gap-3">
          <Checkbox
            id="is-signed"
            checked={isSigned}
            onCheckedChange={(checked) => setIsSigned(checked as boolean)}
          />
          <div className="grid gap-1">
            <Label htmlFor="is-signed" className="text-sm font-medium cursor-pointer">
              J'ai signé ce devis
            </Label>
            <p className="text-xs text-muted-foreground">
              Le suivi n'est disponible que pour les devis signés
            </p>
          </div>
        </div>

        {/* Tracking consent */}
        <div className="flex items-start gap-3">
          <Checkbox
            id="tracking-consent"
            checked={trackingConsent}
            onCheckedChange={(checked) => setTrackingConsent(checked as boolean)}
            disabled={!isSigned}
          />
          <div className="grid gap-1">
            <Label 
              htmlFor="tracking-consent" 
              className={`text-sm font-medium cursor-pointer ${!isSigned ? "text-muted-foreground" : ""}`}
            >
              J'accepte de recevoir des rappels et alertes informatifs liés à ce chantier
            </Label>
            <p className="text-xs text-muted-foreground">
              Par email ou WhatsApp selon vos préférences
            </p>
          </div>
        </div>

        {/* Optional phone number for WhatsApp */}
        {trackingConsent && (
          <div className="pl-6">
            <Label htmlFor="phone-number" className="text-sm font-medium mb-2 block">
              Numéro WhatsApp (optionnel)
            </Label>
            <Input
              id="phone-number"
              type="tel"
              placeholder="06 12 34 56 78"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="max-w-xs"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Laissez vide pour recevoir les alertes par email uniquement
            </p>
          </div>
        )}

        {/* Activate button */}
        <Button
          onClick={handleActivateTracking}
          disabled={!isSigned || !trackingConsent || loading}
          className="w-full sm:w-auto"
        >
          {loading ? "Activation..." : "Activer le suivi"}
        </Button>
      </div>

      {/* What you'll receive */}
      <div className="mt-6 pt-6 border-t border-border">
        <p className="text-sm font-medium text-foreground mb-3">Ce que vous recevrez :</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="flex items-start gap-2 text-sm">
            <Clock className="h-4 w-4 text-primary mt-0.5" />
            <span className="text-muted-foreground">Rappel à l'approche de la date de fin prévue</span>
          </div>
          <div className="flex items-start gap-2 text-sm">
            <Building2 className="h-4 w-4 text-primary mt-0.5" />
            <span className="text-muted-foreground">Alerte en cas d'évolution administrative de l'entreprise</span>
          </div>
        </div>
      </div>

      {/* Legal disclaimer */}
      <div className="mt-4 p-3 bg-muted/50 rounded-lg">
        <p className="text-xs text-muted-foreground">
          <strong>Mention légale :</strong> Les rappels et alertes sont fournis à titre informatif, sur la base 
          des informations figurant sur le devis transmis et des données publiques disponibles. 
          Ils constituent une aide au suivi et ne remplacent pas une analyse juridique ou contractuelle.
        </p>
      </div>
    </div>
  );
};

export default PostSignatureTrackingSection;
