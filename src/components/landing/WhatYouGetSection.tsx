const items = [
  {
    emoji: "🔍",
    title: "Verdict global",
    description: "Signer en l'état, négocier, ou refuser — une décision claire avec les raisons.",
    highlight: true,
  },
  {
    emoji: "💶",
    title: "Surcoût estimé en euros",
    description: "Ce que vous payez en trop, poste par poste, comparé aux prix réels du marché.",
    highlight: false,
  },
  {
    emoji: "📋",
    title: "Arguments pour négocier",
    description: "Les formulations exactes à envoyer à votre artisan — copiez-collez, c'est prêt.",
    highlight: false,
  },
  {
    emoji: "🏢",
    title: "Fiabilité de l'entreprise",
    description: "SIRET actif, ancienneté, avis clients. Vous savez à qui vous avez affaire avant de signer.",
    highlight: false,
  },
  {
    emoji: "⚠️",
    title: "Risques détectés dans le devis",
    description: "Acompte trop élevé, mentions légales absentes, incohérences de quantités ou de prix.",
    highlight: false,
  },
];

const WhatYouGetSection = () => {
  return (
    <section className="py-10 bg-slate-50 border-b border-slate-100">
      <div className="container">
        <div className="text-center mb-7">
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-1">
            Ce que vous obtenez
          </h2>
          <p className="text-sm text-slate-500">
            Pas un comparateur de prix — un outil pour décider en toute connaissance de cause.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-4xl mx-auto">
          {items.map((item) => (
            <div
              key={item.title}
              className={`rounded-xl p-4 flex items-start gap-3 border ${
                item.highlight
                  ? "bg-primary/5 border-primary/20"
                  : "bg-white border-slate-200"
              }`}
            >
              <span className="text-xl flex-shrink-0 mt-0.5">{item.emoji}</span>
              <div className="min-w-0">
                <p className={`text-sm font-semibold mb-0.5 ${item.highlight ? "text-primary" : "text-slate-800"}`}>
                  {item.title}
                </p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-7">
          <a href="/nouvelle-analyse">
            <button className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 py-3 rounded-xl text-sm transition-colors">
              Analyser mon devis maintenant →
            </button>
          </a>
        </div>
      </div>
    </section>
  );
};

export default WhatYouGetSection;
