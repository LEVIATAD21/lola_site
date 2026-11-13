import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Instagram, LoaderCircle, PackageSearch, ShieldCheck, WifiOff } from 'lucide-react';

type Product = {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  disponivel: number;
};
type CatalogState =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; products: Product[] };

const instagram = 'https://www.instagram.com/lola_acoinox/';

/**
 * Cloudflare production storefront. It never imports the old demonstration
 * catalog, demonstration images, browser customer profiles or the mock checkout.
 * Products are read exclusively from the D1-backed /api/catalog endpoint.
 */
function validateProduct(input: unknown): input is Product {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const product = input as Record<string, unknown>;
  return typeof product.id === 'string' && /^[A-Za-z0-9_-]{2,80}$/.test(product.id)
    && typeof product.name === 'string' && product.name.length >= 1 && product.name.length <= 180
    && typeof product.category === 'string' && product.category.length <= 100
    && typeof product.description === 'string' && product.description.length <= 2000
    && typeof product.price === 'number' && Number.isFinite(product.price) && product.price >= 0
    && typeof product.disponivel === 'number' && Number.isSafeInteger(product.disponivel)
    && product.disponivel >= 0;
}

function parseCatalog(value: unknown): Product[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const products = (value as Record<string, unknown>).products;
  if (!Array.isArray(products) || products.length > 50 || !products.every(validateProduct)) return null;
  return products;
}

const price = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export default function ProductionApp() {
  const [catalog, setCatalog] = useState<CatalogState>({ kind: 'loading' });
  const [category, setCategory] = useState('Todas');

  // Remove legacy prototype values from previous visits to this origin.
  // Production does not create or retain any shopper profile/cart locally.
  useEffect(() => {
    for (const key of [
      'lola_cart', 'lola_favorites', 'lola_coupon', 'lola_shipping',
      'lola_customer_profile',
    ]) {
      try { window.localStorage.removeItem(key); } catch { /* disabled storage */ }
    }
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    const timeout = window.setTimeout(() => abort.abort(), 10000);
    const read = async () => {
      try {
        const response = await fetch('/api/catalog', {
          headers: { accept: 'application/json' },
          credentials: 'omit',
          cache: 'no-store',
          signal: abort.signal,
        });
        if (!response.ok) throw new Error('Catalog API unavailable');
        const parsed = parseCatalog(await response.json());
        if (!parsed) throw new Error('Catalog API contract invalid');
        if (!abort.signal.aborted) setCatalog({ kind: 'ready', products: parsed });
      } catch {
        if (!abort.signal.aborted) setCatalog({ kind: 'unavailable' });
      } finally {
        window.clearTimeout(timeout);
      }
    };
    void read();
    return () => { abort.abort(); window.clearTimeout(timeout); };
  }, []);

  const categories = useMemo(() =>
    catalog.kind === 'ready'
      ? ['Todas', ...new Set(catalog.products.map((item) => item.category))]
      : ['Todas'],
    [catalog],
  );
  const visible = catalog.kind === 'ready'
    ? catalog.products.filter((item) => category === 'Todas' || item.category === category)
    : [];

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F4ED] text-[#241F1B]">
      <div className="bg-[#2A211B] text-[#F8F4ED] text-center text-[11px] sm:text-xs px-4 py-2">
        Loja online em configuração · Pedidos e pagamentos ainda não estão habilitados
      </div>
      <header className="bg-white border-b border-[#E7DED3]">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-5 flex flex-wrap justify-between items-center gap-5">
          <a href="/" className="flex flex-col no-underline text-[#2A211B]" aria-label="LOLA — início">
            <span className="font-serif-brand text-3xl font-semibold tracking-[0.15em]">LOLA</span>
            <span className="text-[9px] uppercase tracking-[0.23em] text-[#766D64]">Aço Inox &amp; Acessórios</span>
          </a>
          <nav aria-label="Navegação principal" className="flex flex-wrap items-center gap-5 text-sm">
            <a href="#catalogo" className="hover:text-[#9B7138] transition-colors">Catálogo</a>
            <a href="/privacidade/" className="hover:text-[#9B7138] transition-colors">Privacidade</a>
            <a href={instagram} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-[#DCC7B0] hover:bg-[#F1E8DC] transition-colors">
              <Instagram className="w-4 h-4" aria-hidden="true" /> Atendimento
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden bg-gradient-to-br from-[#F1E8DC] via-[#F8F4ED] to-[#E6D5BD]">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-20 sm:py-28 relative">
            <div className="absolute pointer-events-none top-[-140px] right-[-110px] w-[470px] h-[470px] rounded-full border border-[#DCC7B0]/60" aria-hidden="true" />
            <div className="absolute pointer-events-none top-[-80px] right-[-40px] w-[330px] h-[330px] rounded-full border border-[#DCC7B0]/50" aria-hidden="true" />
            <div className="max-w-2xl relative">
              <p className="text-xs uppercase tracking-[0.3em] text-[#8B6A3D] font-semibold">LOLA Aço Inox &amp; Acessórios</p>
              <h1 className="font-serif-brand text-4xl sm:text-6xl leading-tight mt-5 text-[#2A211B]">
                Seu estilo, sua essência.
              </h1>
              <p className="text-[#65564A] text-base sm:text-lg leading-relaxed mt-6 max-w-xl">
                Bem-vinda ao espaço digital da LOLA. Nossa equipe está organizando o catálogo
                oficial para que você conheça cada peça com informações confiáveis.
              </p>
              <a href="#catalogo" className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#2A211B] text-white px-6 py-3.5 text-sm font-semibold hover:bg-[#8B6A3D] transition-colors">
                Consultar catálogo <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>

        <section id="catalogo" className="max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-20" aria-labelledby="catalog-title">
          <p className="text-xs text-[#8B6A3D] uppercase tracking-[0.2em] font-semibold">Coleção</p>
          <h2 id="catalog-title" className="font-serif-brand text-3xl sm:text-4xl mt-3">Catálogo oficial</h2>
          <p className="mt-3 text-sm text-[#766D64]">
            Somente produtos publicados e disponibilizados pelo banco de dados da loja aparecem aqui.
          </p>

          {catalog.kind === 'loading' && (
            <div role="status" className="min-h-64 flex flex-col items-center justify-center gap-3 text-[#766D64]">
              <LoaderCircle className="w-7 h-7 animate-spin text-[#B38A4B]" aria-hidden="true" />
              Consultando o catálogo...
            </div>
          )}

          {catalog.kind === 'unavailable' && (
            <div role="alert" className="mt-9 min-h-60 border border-[#E7DED3] rounded-3xl bg-white p-10 flex flex-col items-center justify-center text-center">
              <WifiOff className="w-9 h-9 text-[#9B7138]" aria-hidden="true" />
              <h3 className="font-serif-brand text-xl mt-4">Catálogo temporariamente indisponível</h3>
              <p className="mt-3 text-sm text-[#766D64] max-w-md">
                Não conseguimos consultar os dados oficiais. Nenhum preço ou estoque será exibido até a conexão ser restabelecida.
              </p>
              <a href={instagram} target="_blank" rel="noopener noreferrer" className="mt-6 underline text-sm text-[#8B6A3D]">Falar com a equipe</a>
            </div>
          )}

          {catalog.kind === 'ready' && catalog.products.length === 0 && (
            <div role="status" className="mt-9 min-h-72 border border-[#E7DED3] rounded-3xl bg-white p-10 flex flex-col items-center justify-center text-center">
              <PackageSearch className="w-10 h-10 text-[#B38A4B]" aria-hidden="true" />
              <h3 className="font-serif-brand text-2xl mt-4">Nenhum produto cadastrado no momento</h3>
              <p className="mt-3 text-sm text-[#766D64] max-w-md">
                O catálogo está vazio. Não exibimos produtos, preços nem quantidades fictícias.
                Novas peças aparecerão aqui quando forem cadastradas e publicadas pela loja.
              </p>
            </div>
          )}

          {catalog.kind === 'ready' && catalog.products.length > 0 && (
            <>
              <div className="flex flex-wrap gap-2 mt-8" role="group" aria-label="Filtrar categoria">
                {categories.map((item) => (
                  <button type="button" key={item} onClick={() => setCategory(item)}
                    aria-pressed={category === item}
                    className={`rounded-full px-4 py-2 text-sm border transition-colors ${category === item ? 'bg-[#2A211B] text-white border-[#2A211B]' : 'bg-white border-[#DCC7B0] hover:bg-[#F1E8DC]'}`}>
                    {item}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-7">
                {visible.map((item) => (
                  <article key={item.id} className="bg-white rounded-2xl border border-[#E7DED3] p-6 shadow-sm">
                    <p className="text-xs text-[#8B6A3D] uppercase tracking-wide">{item.category}</p>
                    <h3 className="font-serif-brand text-2xl mt-3">{item.name}</h3>
                    {item.description && <p className="text-sm text-[#766D64] mt-3">{item.description}</p>}
                    <p className="text-lg font-bold mt-6">{price(item.price)}</p>
                    <p className="text-xs text-[#766D64] mt-2">
                      {item.disponivel > 0 ? `Quantidade cadastrada: ${item.disponivel}` : 'Sem estoque'}
                    </p>
                  </article>
                ))}
              </div>
              {visible.length === 0 && <p className="mt-9 text-[#766D64]">Nenhum produto cadastrado nesta categoria.</p>}
              <p className="mt-8 text-sm text-[#766D64]">
                Compras, reservas e pagamentos pelo site ainda não estão habilitados.
              </p>
            </>
          )}
        </section>

        <section className="bg-white border-y border-[#E7DED3]">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-12 flex flex-col md:flex-row justify-between gap-7 md:items-center">
            <div className="max-w-xl">
              <div className="flex items-center gap-2 text-[#8B6A3D] text-sm font-semibold">
                <ShieldCheck className="w-5 h-5" aria-hidden="true" /> Transparência e cuidado
              </div>
              <p className="mt-3 text-[#766D64] text-sm leading-relaxed">
                Não solicitamos endereço, documentos ou dados de pagamento nesta versão.
                Consulte nossas políticas para saber como tratamos informações técnicas da navegação.
              </p>
            </div>
            <a href="/privacidade/" className="text-sm font-semibold underline text-[#8B6A3D]">Ler política de privacidade</a>
          </div>
        </section>
      </main>

      <footer className="bg-[#2A211B] text-[#F8F4ED]">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 flex flex-wrap justify-between items-center gap-5 text-xs sm:text-sm">
          <div><p className="font-serif-brand text-xl tracking-widest">LOLA</p><p className="mt-1 text-[#E6D5BD]">Aço Inox &amp; Acessórios</p></div>
          <div className="flex flex-wrap gap-5">
            <a href="/privacidade/" className="hover:underline">Privacidade</a>
            <a href="/cookies/" className="hover:underline">Cookies</a>
            <a href={instagram} target="_blank" rel="noopener noreferrer" className="hover:underline">Instagram oficial</a>
          </div>
          <p className="text-[#E6D5BD]">© 2026 LOLA</p>
        </div>
      </footer>
    </div>
  );
}
