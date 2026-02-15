import { useState, useEffect } from "react";
import { Search, BookOpen, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import SEOHead from "@/components/SEOHead";
import ArticleCard from "@/components/blog/ArticleCard";
import BlogCTA from "@/components/blog/BlogCTA";

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content_html: string;
  category: string | null;
  cover_image_url: string | null;
  published_at: string | null;
}

const POSTS_PER_PAGE = 9;

const Blog = () => {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [filteredPosts, setFilteredPosts] = useState<BlogPost[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchPosts();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredPosts(posts);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredPosts(
        posts.filter(
          (post) =>
            post.title.toLowerCase().includes(query) ||
            post.excerpt?.toLowerCase().includes(query) ||
            post.category?.toLowerCase().includes(query)
        )
      );
    }
    setCurrentPage(1);
  }, [searchQuery, posts]);

  const fetchPosts = async () => {
    try {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("id, slug, title, excerpt, content_html, category, cover_image_url, published_at")
        .eq("status", "published")
        .order("published_at", { ascending: false });

      if (error) throw error;
      setPosts(data || []);
      setFilteredPosts(data || []);
    } catch (error) {
      console.error("Error fetching blog posts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const totalPages = Math.ceil(filteredPosts.length / POSTS_PER_PAGE);
  const paginatedPosts = filteredPosts.slice(
    (currentPage - 1) * POSTS_PER_PAGE,
    currentPage * POSTS_PER_PAGE
  );

  return (
    <>
      <SEOHead
        title="Blog - Conseils Devis & Travaux | VerifierMonDevis.fr"
        description="Conseils pratiques pour analyser vos devis artisan, éviter les arnaques et réussir vos travaux. Guides, checklists et astuces d'experts."
        canonical="https://verifiermondevis.fr/blog"
      />

      <div className="min-h-screen flex flex-col bg-background">
        <Header />

        <main className="flex-1">
          {/* Hero Section */}
          <section className="py-16 md:py-20 bg-gradient-to-b from-primary/5 to-background">
            <div className="container px-4 md:px-6">
              <div className="max-w-3xl mx-auto text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-primary text-sm font-medium mb-6">
                  <BookOpen className="h-4 w-4" />
                  Blog & Conseils
                </div>
                <h1 className="text-2xl sm:text-4xl md:text-5xl font-bold text-foreground mb-4">
                  Guides et conseils pour vos travaux
                </h1>
                <p className="text-base sm:text-lg text-muted-foreground mb-8">
                  Apprenez à décrypter un devis, repérer les arnaques et faire les bons choix 
                  pour vos projets de rénovation.
                </p>

                {/* Search */}
                <div className="relative max-w-md mx-auto">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Rechercher un article..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-12 h-12 text-base"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Articles Grid */}
          <section className="py-12 md:py-16">
            <div className="container px-4 md:px-6">
              {isLoading ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-card rounded-2xl border border-border p-6 animate-pulse">
                      <div className="h-40 bg-muted rounded-xl mb-4" />
                      <div className="h-4 bg-muted rounded w-1/3 mb-3" />
                      <div className="h-6 bg-muted rounded mb-2" />
                      <div className="h-4 bg-muted rounded w-2/3" />
                    </div>
                  ))}
                </div>
              ) : filteredPosts.length === 0 ? (
                <div className="text-center py-12">
                  <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h2 className="text-xl font-semibold text-foreground mb-2">
                    {searchQuery ? "Aucun article trouvé" : "Aucun article publié"}
                  </h2>
                  <p className="text-muted-foreground mb-6">
                    {searchQuery
                      ? "Essayez avec d'autres mots-clés"
                      : "Les articles arrivent bientôt !"}
                  </p>
                  {searchQuery && (
                    <Button variant="outline" onClick={() => setSearchQuery("")}>
                      Voir tous les articles
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {paginatedPosts.map((post) => (
                      <ArticleCard
                        key={post.id}
                        slug={post.slug}
                        title={post.title}
                        excerpt={post.excerpt || undefined}
                        category={post.category || undefined}
                        coverImageUrl={post.cover_image_url || undefined}
                        publishedAt={post.published_at || undefined}
                        contentHtml={post.content_html}
                      />
                    ))}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex justify-center gap-2 mt-12">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage((p) => p - 1)}
                      >
                        Précédent
                      </Button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                          <Button
                            key={page}
                            variant={currentPage === page ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setCurrentPage(page)}
                          >
                            {page}
                          </Button>
                        ))}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage((p) => p + 1)}
                      >
                        Suivant
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          {/* CTA Section */}
          <section className="py-12 md:py-16 bg-muted/30">
            <div className="container px-4 md:px-6">
              <div className="max-w-2xl mx-auto">
                <BlogCTA variant="bottom" />
              </div>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default Blog;
