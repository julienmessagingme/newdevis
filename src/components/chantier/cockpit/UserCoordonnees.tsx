import { useState, useEffect } from 'react';
import { User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import type { SupabaseClient } from '@supabase/supabase-js';

interface Props {
  supabase: SupabaseClient;
}

export default function UserCoordonnees({ supabase }: Props) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [phone, setPhone]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    setLoading(true);
    supabase.auth.getUser().then(({ data }) => {
      const meta = data.user?.user_metadata ?? {};
      setFirstName(meta.first_name ?? '');
      setLastName(meta.last_name ?? '');
      setPhone(meta.phone ?? '');
    }).finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    const digits = phone.replace(/\D/g, '');
    if (phone && digits.length !== 10) {
      toast.error('Numéro de téléphone invalide (10 chiffres requis)');
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({
      data: { first_name: firstName, last_name: lastName, phone: digits },
    });
    setSaving(false);
    if (error) toast.error('Erreur lors de la sauvegarde');
    else toast.success('Coordonnées mises à jour');
  }

  if (loading) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <User className="h-4 w-4 text-gray-400" />
        <h2 className="font-semibold text-gray-900">Vos coordonnées</h2>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 px-5 py-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="cc-firstname" className="text-xs text-gray-500">Prénom</Label>
            <Input
              id="cc-firstname"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Julien"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cc-lastname" className="text-xs text-gray-500">Nom</Label>
            <Input
              id="cc-lastname"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Dumas"
              className="h-9 text-sm"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cc-phone" className="text-xs text-gray-500">Téléphone portable</Label>
          <Input
            id="cc-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="06 12 34 56 78"
            className="h-9 text-sm"
          />
          <p className="text-xs text-gray-400">
            Utilisé pour vous ajouter aux groupes WhatsApp de vos chantiers
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="w-full"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  );
}
