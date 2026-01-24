import { useEffect } from "react";

interface SEOHeadProps {
  title: string;
  description: string;
  canonical?: string;
  ogType?: "website" | "article";
  ogImage?: string;
}

/**
 * Composant SEO pour gérer les balises meta dynamiquement
 * Chaque page doit avoir un titre unique et une description orientée utilisateur
 */
const SEOHead = ({ title, description, canonical, ogType = "website", ogImage }: SEOHeadProps) => {
  useEffect(() => {
    // Update document title
    document.title = title;

    // Update meta description
    let metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute("content", description);
    } else {
      metaDescription = document.createElement("meta");
      metaDescription.setAttribute("name", "description");
      metaDescription.setAttribute("content", description);
      document.head.appendChild(metaDescription);
    }

    // Update OG tags
    let ogTitleTag = document.querySelector('meta[property="og:title"]');
    if (ogTitleTag) {
      ogTitleTag.setAttribute("content", title);
    } else {
      ogTitleTag = document.createElement("meta");
      ogTitleTag.setAttribute("property", "og:title");
      ogTitleTag.setAttribute("content", title);
      document.head.appendChild(ogTitleTag);
    }

    let ogDescriptionTag = document.querySelector('meta[property="og:description"]');
    if (ogDescriptionTag) {
      ogDescriptionTag.setAttribute("content", description);
    } else {
      ogDescriptionTag = document.createElement("meta");
      ogDescriptionTag.setAttribute("property", "og:description");
      ogDescriptionTag.setAttribute("content", description);
      document.head.appendChild(ogDescriptionTag);
    }

    // OG Type
    let ogTypeTag = document.querySelector('meta[property="og:type"]');
    if (ogTypeTag) {
      ogTypeTag.setAttribute("content", ogType);
    } else {
      ogTypeTag = document.createElement("meta");
      ogTypeTag.setAttribute("property", "og:type");
      ogTypeTag.setAttribute("content", ogType);
      document.head.appendChild(ogTypeTag);
    }

    // OG Image
    if (ogImage) {
      let ogImageTag = document.querySelector('meta[property="og:image"]');
      if (ogImageTag) {
        ogImageTag.setAttribute("content", ogImage);
      } else {
        ogImageTag = document.createElement("meta");
        ogImageTag.setAttribute("property", "og:image");
        ogImageTag.setAttribute("content", ogImage);
        document.head.appendChild(ogImageTag);
      }
    }

    // Update canonical if provided
    if (canonical) {
      let canonicalLink = document.querySelector('link[rel="canonical"]');
      if (canonicalLink) {
        canonicalLink.setAttribute("href", canonical);
      } else {
        canonicalLink = document.createElement("link");
        canonicalLink.setAttribute("rel", "canonical");
        canonicalLink.setAttribute("href", canonical);
        document.head.appendChild(canonicalLink);
      }
    }
  }, [title, description, canonical, ogType, ogImage]);

  return null;
};

export default SEOHead;
