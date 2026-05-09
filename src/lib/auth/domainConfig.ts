export type DomainType = "travaux" | "auto" | "dentaire";

export const DOMAIN_BLOCKS: Record<DomainType, string[]> = {
  travaux: ["entreprise", "devis", "prix_marche", "securite", "contexte", "urbanisme"],
  auto: ["entreprise", "devis", "prix_marche", "securite"],
  dentaire: ["entreprise", "devis", "securite"],
};

export function getVisibleBlocks(domain: string): string[] {
  return DOMAIN_BLOCKS[domain as DomainType] || DOMAIN_BLOCKS.travaux;
}
