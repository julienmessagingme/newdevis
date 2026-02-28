/**
 * Blog utilities: HTML sanitization, CTA injection, reading time calculation
 */
import DOMPurify from 'dompurify';

// CTA URL
export const getCTAUrl = (): string => {
  return '/nouvelle-analyse';
};

/**
 * Calculate reading time in minutes
 */
export const calculateReadingTime = (html: string): number => {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const words = text.split(' ').filter(w => w.length > 0).length;
  return Math.max(1, Math.ceil(words / 200));
};

/**
 * Clean and sanitize HTML from AI-generated articles
 * Rules:
 * - Extract content from .container or body only
 * - Remove html, head, style, meta, title tags and content after </html>
 * - Add loading="lazy" to all images
 * - Replace CTA links with dynamic URL
 */
export const sanitizeArticleHtml = (rawHtml: string): string => {
  if (!rawHtml || rawHtml.trim().length === 0) return '';
  
  let html = rawHtml;
  
  // Step 1: Remove everything after </html> if present
  const htmlEndIndex = html.toLowerCase().indexOf('</html>');
  if (htmlEndIndex !== -1) {
    html = html.substring(0, htmlEndIndex);
  }
  
  // Step 2: Try to extract .container content (from .hero to end of .container)
  const containerMatch = html.match(/<div[^>]*class="[^"]*container[^"]*"[^>]*>([\s\S]*)<\/div>\s*$/i);
  if (containerMatch) {
    html = containerMatch[1];
    // Look for hero section start
    const heroIndex = html.indexOf('<div class="hero">');
    if (heroIndex !== -1) {
      html = html.substring(heroIndex);
    }
  } else {
    // Fallback: extract body content only
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      html = bodyMatch[1];
    }
  }
  
  // Step 3: Remove unwanted tags completely
  html = html.replace(/<html[^>]*>/gi, '');
  html = html.replace(/<\/html>/gi, '');
  html = html.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
  html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  html = html.replace(/<meta[^>]*\/>/gi, '');
  html = html.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '');
  html = html.replace(/<link[^>]*\/>/gi, '');
  html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<body[^>]*>/gi, '');
  html = html.replace(/<\/body>/gi, '');
  
  // Step 4: Add loading="lazy" to all images that don't have it
  html = html.replace(/<img(?![^>]*loading=)/gi, '<img loading="lazy"');
  
  // Step 5: Replace CTA links
  const ctaUrl = getCTAUrl();
  const ctaPatterns = [
    /<a\s+href="#"([^>]*)>/gi,
    /<a\s+([^>]*)href="#"([^>]*)>/gi,
  ];
  
  // Replace href="#" links
  html = html.replace(/<a\s+href="#"/gi, `<a href="${ctaUrl}"`);
  html = html.replace(/<a\s+([^>]*)href="#"/gi, `<a $1href="${ctaUrl}"`);
  
  // Replace CTA text links (Analyser, Essayer, gratuitement, devis)
  const ctaTextPattern = /<a\s+([^>]*)>((?:[^<]|<\/a>)*(?:Analyser|Essayer|gratuitement|devis)[^<]*)<\/a>/gi;
  html = html.replace(ctaTextPattern, (match, attrs, content) => {
    // If already has href pointing somewhere other than #, keep it but update if it's a placeholder
    if (attrs.includes('href="') && !attrs.includes('href="#"')) {
      // Update the href to CTA URL
      return `<a ${attrs.replace(/href="[^"]*"/, `href="${ctaUrl}"`)}>${content}</a>`;
    }
    return `<a href="${ctaUrl}" ${attrs}>${content}</a>`;
  });
  
  return html.trim();
};

/**
 * Allowed HTML tags for rendering
 */
export const ALLOWED_TAGS = [
  'div', 'p', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 
  'strong', 'em', 'b', 'i', 'a', 'img', 'span', 'br', 
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'blockquote', 'figure', 'figcaption', 'section', 'article',
  'header', 'footer', 'nav', 'aside', 'main'
];

export const ALLOWED_ATTRIBUTES = {
  'a': ['href', 'target', 'rel', 'class'],
  'img': ['src', 'alt', 'loading', 'width', 'height', 'class'],
  'div': ['class', 'id'],
  'span': ['class'],
  'p': ['class'],
  'h1': ['class', 'id'],
  'h2': ['class', 'id'],
  'h3': ['class', 'id'],
  'h4': ['class', 'id'],
  'ul': ['class'],
  'ol': ['class'],
  'li': ['class'],
  'table': ['class'],
  'th': ['class', 'colspan', 'rowspan'],
  'td': ['class', 'colspan', 'rowspan'],
  '*': ['class', 'id'],
};

/**
 * HTML sanitization using DOMPurify (allowlist-based, XSS-safe)
 */
export const sanitizeForRender = (html: string): string => {
  if (!html) return '';

  // Use DOMPurify for proper allowlist-based sanitization
  if (typeof window !== 'undefined' && DOMPurify) {
    const sanitized = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ALLOWED_TAGS,
      ALLOWED_ATTR: [
        'href', 'src', 'alt', 'title', 'class', 'id', 'width', 'height',
        'target', 'rel', 'loading', 'decoding', 'colspan', 'rowspan',
      ],
      ALLOW_DATA_ATTR: false,
    });

    // Ensure all external links open in new tab with noopener
    return sanitized.replace(/<a\s+([^>]*href="https?:\/\/[^"]*"[^>]*)>/gi, (match: string, attrs: string) => {
      if (!attrs.includes('target=')) {
        return `<a ${attrs} target="_blank" rel="noopener noreferrer">`;
      }
      if (!attrs.includes('rel=')) {
        return match.replace('>', ' rel="noopener noreferrer">');
      }
      return match;
    });
  }

  // Fallback (SSR): basic regex sanitization
  let sanitized = html;
  sanitized = sanitized.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '');
  sanitized = sanitized.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');
  return sanitized;
};

/**
 * Format date for display
 */
export const formatArticleDate = (date: string | null): string => {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('fr-FR', { 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  });
};

/**
 * Generate slug from title
 */
export const generateSlug = (title: string): string => {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);
};
