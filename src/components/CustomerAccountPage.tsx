import React, { useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, BadgeCheck, Box, Check, ChevronRight, CircleHelp,
  ClipboardList, Heart, House, LockKeyhole, Mail, MapPin, Package, Pencil,
  ShieldCheck, ShoppingBag, Sparkles, UserRound, Wallet, X
} from 'lucide-react';
import type { Product } from '../data/mockData';

type AccountSection = 'overview' | 'profile' | 'orders' | 'addresses' | 'favorites' | 'coupons' | 'security' | 'support';

interface CustomerProfile {
  name: string;
  email: string;
  phone: string;
  birthDate: string;
}

interface CustomerAccountPageProps {
  favorites: Product[];
  onToggleFavorite: (product: Product) => void;
  onSelectProduct: (product: Product) => void;
  onBackToStore: () => void;
  onOpenInfo: (title: string, content: string) => void;
}

const menuItems: { id: AccountSection; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Visão geral', icon: House },
  { id: 'profile', label: 'Meu perfil', icon: UserRound },
  { id: 'orders', label: 'Meus pedidos', icon: Package },
  { id: 'addresses', label: 'Meus endereços', icon: MapPin },
  { id: 'favorites', label: 'Meus favoritos', icon: Heart },
  { id: 'coupons', label: 'Cupons', icon: Wallet },
  { id: 'security', label: 'Segurança', icon: ShieldCheck },
  { id: 'support', label: 'Ajuda e suporte', icon: CircleHelp },
];

const readProfile = (): CustomerProfile => {
  const empty = { name: '', email: '', phone: '', birthDate: '' };
  try {
    const saved = localStorage.getItem('lola_customer_profile');
    return saved ? { ...empty, ...JSON.parse(saved) } : empty;
  } catch {
    return empty;
  }
};

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const CustomerAccountPage: React.FC<CustomerAccountPageProps> = ({
  favorites,
  onToggleFavorite,
  onSelectProduct,
  onBackToStore,
  onOpenInfo,
}) => {
  const [section, setSection] = useState<AccountSection>('overview');
  const [profile, setProfile] = useState<CustomerProfile>(readProfile);
  const [savedMessage, setSavedMessage] = useState('');
  const [addressFormOpen, setAddressFormOpen] = useState(false);

  const title = menuItems.find((item) => item.id === section)?.label ?? 'Minha conta';
  const initials = profile.name.trim()
    ? profile.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
    : 'L';

  const saveProfile = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      localStorage.setItem('lola_customer_profile', JSON.stringify(profile));
      setSavedMessage('Seus dados foram salvos neste dispositivo.');
      window.setTimeout(() => setSavedMessage(''), 3500);
    } catch {
      setSavedMessage('Não foi possível salvar neste dispositivo. Tente novamente.');
    }
  };

  const openSection = (next: AccountSection) => {
    setSection(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const SectionIcon = menuItems.find((item) => item.id === section)?.icon ?? UserRound;

  return (
    <main className="flex-1 bg-[#F8F4ED] text-[#241F1B]">
      <div className="border-b border-[#E7DED3] bg-white/70">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <button onClick={onBackToStore} className="inline-flex items-center gap-2 text-sm text-[#766D64] transition hover:text-[#C49A5A]">
            <ArrowLeft className="h-4 w-4" /> Voltar à loja
          </button>
          <div className="text-right">
            <p className="font-serif-brand text-xl font-semibold tracking-[0.18em] text-[#2A211B]">LOLA</p>
            <p className="-mt-1 text-[9px] uppercase tracking-[0.28em] text-[#766D64]">Aço Inox & Acessórios</p>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[245px_minmax(0,1fr)] lg:px-8 lg:py-9">
        <aside className="h-fit overflow-hidden rounded-2xl border border-[#E7DED3] bg-white shadow-sm">
          <div className="bg-gradient-to-br from-[#F1E8DC] to-[#E5D1B8] px-5 py-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-white bg-[#C49A5A] font-serif-brand text-2xl text-white shadow-sm">
              {initials}
            </div>
            <p className="mt-3 font-semibold text-[#2A211B]">{profile.name || 'Bem-vinda à LOLA'}</p>
            <p className="mt-1 text-xs text-[#766D64]">{profile.email || 'Sua conta e suas compras'}</p>
            <span className="mt-3 inline-flex items-center gap-1 rounded-full border border-[#C49A5A]/30 bg-white/70 px-3 py-1 text-[11px] font-medium text-[#806033]">
              <Sparkles className="h-3 w-3" /> Seu espaço Lola
            </span>
          </div>
          <nav className="grid grid-cols-2 gap-1 p-3 sm:grid-cols-4 lg:grid-cols-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button key={item.id} onClick={() => openSection(item.id)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${active ? 'bg-[#F1E8DC] font-semibold text-[#2A211B] ring-1 ring-inset ring-[#DCC7B0]' : 'text-[#766D64] hover:bg-[#F8F4ED] hover:text-[#2A211B]'}`}>
                  <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-[#A77D3D]' : ''}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="mx-4 mb-4 rounded-xl border border-[#E7DED3] bg-[#F8F4ED] p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#2A211B]"><LockKeyhole className="h-4 w-4 text-[#C49A5A]" /> Seus dados, com cuidado</div>
            <p className="mt-1 text-xs leading-relaxed text-[#766D64]">Esta área ainda não está conectada a um sistema de login. Os dados de perfil salvos aqui ficam apenas neste dispositivo.</p>
          </div>
        </aside>

        <div className="min-w-0 space-y-5">
          <section className="relative overflow-hidden rounded-2xl border border-[#E7DED3] bg-gradient-to-r from-[#E8D4BB] via-[#F1E8DC] to-[#F8F4ED] p-6 sm:p-8">
            <div className="pointer-events-none absolute -right-8 -top-12 h-48 w-48 rounded-full border border-white/60" />
            <div className="pointer-events-none absolute -right-1 -top-5 h-36 w-36 rounded-full border border-white/50" />
            <div className="relative max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8B6A3D]">Minha conta LOLA</p>
              <h1 className="mt-2 font-serif-brand text-3xl font-semibold text-[#2A211B] sm:text-4xl">
                {section === 'overview' ? (profile.name ? `Olá, ${profile.name.split(' ')[0]}!` : 'Seu estilo, do seu jeito.') : title}
              </h1>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-[#65564A]">
                {section === 'overview'
                  ? 'Acompanhe seus favoritos e mantenha suas informações organizadas em um só lugar.'
                  : 'Uma experiência pensada para acompanhar você e suas escolhas LOLA.'}
              </p>
              <div className="mt-5 flex flex-wrap gap-4 text-xs text-[#5F5145]">
                <span className="inline-flex items-center gap-2"><BadgeCheck className="h-4 w-4" /> Peças para o seu estilo</span>
                <span className="inline-flex items-center gap-2"><ShoppingBag className="h-4 w-4" /> Sua jornada de compra</span>
              </div>
            </div>
          </section>

          {savedMessage && <div role="status" className="flex items-center gap-2 rounded-xl border border-[#B7D6B9] bg-[#EFF8EF] px-4 py-3 text-sm text-[#356B3B]"><Check className="h-4 w-4" />{savedMessage}</div>}

          {section === 'overview' && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <button onClick={() => openSection('orders')} className="rounded-2xl border border-[#E7DED3] bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1E8DC] text-[#A77D3D]"><Package className="h-5 w-5" /></span>
                  <p className="mt-4 text-sm font-semibold">Meus pedidos</p><p className="mt-1 text-xs text-[#766D64]">Consulte suas compras</p>
                </button>
                <button onClick={() => openSection('addresses')} className="rounded-2xl border border-[#E7DED3] bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1E8DC] text-[#A77D3D]"><MapPin className="h-5 w-5" /></span>
                  <p className="mt-4 text-sm font-semibold">Endereços</p><p className="mt-1 text-xs text-[#766D64]">Organize suas entregas</p>
                </button>
                <button onClick={() => openSection('favorites')} className="rounded-2xl border border-[#E7DED3] bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1E8DC] text-[#A77D3D]"><Heart className="h-5 w-5" /></span>
                  <p className="mt-4 text-2xl font-semibold tabular-nums">{favorites.length}</p><p className="mt-1 text-xs text-[#766D64]">Produtos favoritos salvos</p>
                </button>
              </div>
              <section className="rounded-2xl border border-[#E7DED3] bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div><h2 className="font-serif-brand text-xl font-semibold">Seus favoritos</h2><p className="mt-1 text-xs text-[#766D64]">Peças que você guardou para ver depois.</p></div>
                  <button onClick={() => openSection('favorites')} className="inline-flex items-center gap-1 text-xs font-semibold text-[#8B6A3D] hover:text-[#C49A5A]">Ver todos <ArrowRight className="h-3 w-3" /></button>
                </div>
                {favorites.length ? (
                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {favorites.slice(0, 4).map((product) => (
                      <button key={product.id} onClick={() => onSelectProduct(product)} className="overflow-hidden rounded-xl border border-[#E7DED3] text-left transition hover:-translate-y-0.5 hover:shadow-md">
                        <img src={product.image} alt={product.name} className="aspect-square w-full bg-[#F1E8DC] object-cover" loading="lazy" />
                        <span className="block p-3"><span className="block truncate text-xs font-medium">{product.name}</span><span className="mt-1 block text-sm font-semibold text-[#8B6A3D]">{money(product.price)}</span></span>
                      </button>
                    ))}
                  </div>
                ) : <EmptyState icon={Heart} title="Seus favoritos começam aqui" description="Toque no coração de uma peça na loja para guardá-la nesta área." action="Explorar a loja" onAction={onBackToStore} />}
              </section>
              <section className="flex flex-col gap-4 rounded-2xl border border-[#E7DED3] bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1E8DC] text-[#A77D3D]"><ClipboardList className="h-5 w-5" /></span><div><h2 className="font-semibold">Histórico de pedidos</h2><p className="mt-1 text-sm text-[#766D64]">Seus pedidos aparecerão aqui quando a conta estiver conectada ao sistema da loja.</p></div></div>
                <button onClick={() => openSection('orders')} className="shrink-0 rounded-lg border border-[#DCC7B0] px-4 py-2 text-sm font-medium text-[#806033] transition hover:bg-[#F8F4ED]">Ver pedidos</button>
              </section>
            </>
          )}

          {section === 'profile' && (
            <section className="rounded-2xl border border-[#E7DED3] bg-white p-5 shadow-sm sm:p-7">
              <div className="mb-6 flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1E8DC] text-[#A77D3D]"><UserRound className="h-5 w-5" /></span><div><h2 className="font-serif-brand text-xl font-semibold">Informações pessoais</h2><p className="mt-1 text-sm text-[#766D64]">Preencha os dados que deseja manter neste dispositivo.</p></div></div>
              <form onSubmit={saveProfile} className="grid gap-5 sm:grid-cols-2">
                <label className="text-sm font-medium">Nome completo<input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} placeholder="Como podemos chamar você?" className="mt-2 w-full rounded-xl border border-[#E7DED3] bg-[#FDFBF8] px-4 py-3 font-normal outline-none transition focus:border-[#C49A5A]" /></label>
                <label className="text-sm font-medium">E-mail<input type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} placeholder="voce@exemplo.com" className="mt-2 w-full rounded-xl border border-[#E7DED3] bg-[#FDFBF8] px-4 py-3 font-normal outline-none transition focus:border-[#C49A5A]" /></label>
                <label className="text-sm font-medium">Telefone<input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="(00) 00000-0000" className="mt-2 w-full rounded-xl border border-[#E7DED3] bg-[#FDFBF8] px-4 py-3 font-normal outline-none transition focus:border-[#C49A5A]" /></label>
                <label className="text-sm font-medium">Data de nascimento<input type="date" value={profile.birthDate} onChange={(e) => setProfile({ ...profile, birthDate: e.target.value })} className="mt-2 w-full rounded-xl border border-[#E7DED3] bg-[#FDFBF8] px-4 py-3 font-normal outline-none transition focus:border-[#C49A5A]" /></label>
                <div className="sm:col-span-2"><button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-[#2A211B] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#806033]"><Check className="h-4 w-4" /> Salvar informações</button></div>
              </form>
              <p className="mt-5 text-xs leading-relaxed text-[#766D64]">Aviso: por enquanto, essas informações ficam apenas no armazenamento local do navegador. Ainda não existe login nem sincronização com a loja.</p>
            </section>
          )}

          {section === 'orders' && <EmptyState icon={Package} title="Nenhum pedido vinculado" description="O histórico e o rastreamento serão exibidos aqui quando o sistema de pedidos estiver conectado. Não exibimos pedidos fictícios." action="Voltar ao resumo" onAction={() => openSection('overview')} />}
          {section === 'addresses' && (
            <section className="rounded-2xl border border-[#E7DED3] bg-white p-5 shadow-sm sm:p-7">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="font-serif-brand text-xl font-semibold">Seus endereços</h2><p className="mt-1 text-sm text-[#766D64]">Organize os endereços que deseja usar nas entregas.</p></div><button onClick={() => setAddressFormOpen(!addressFormOpen)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2A211B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#806033]"><MapPin className="h-4 w-4" /> {addressFormOpen ? 'Cancelar' : 'Adicionar endereço'}</button></div>
              {addressFormOpen && <form onSubmit={(e) => { e.preventDefault(); setAddressFormOpen(false); onOpenInfo('Endereços da conta', 'O formulário visual está pronto, mas o salvamento de endereços depende da integração de conta e backend. Nenhum endereço foi gravado.'); }} className="mt-5 grid gap-4 rounded-xl bg-[#F8F4ED] p-4 sm:grid-cols-2">
                <label className="text-sm">Apelido<input required placeholder="Ex.: Casa" className="mt-1 w-full rounded-lg border border-[#E7DED3] bg-white px-3 py-2.5 outline-none focus:border-[#C49A5A]" /></label>
                <label className="text-sm">CEP<input required placeholder="00000-000" className="mt-1 w-full rounded-lg border border-[#E7DED3] bg-white px-3 py-2.5 outline-none focus:border-[#C49A5A]" /></label>
                <label className="text-sm sm:col-span-2">Rua e número<input required placeholder="Rua, avenida e número" className="mt-1 w-full rounded-lg border border-[#E7DED3] bg-white px-3 py-2.5 outline-none focus:border-[#C49A5A]" /></label>
                <label className="text-sm">Bairro<input required placeholder="Seu bairro" className="mt-1 w-full rounded-lg border border-[#E7DED3] bg-white px-3 py-2.5 outline-none focus:border-[#C49A5A]" /></label>
                <label className="text-sm">Cidade / UF<input required placeholder="Cidade - UF" className="mt-1 w-full rounded-lg border border-[#E7DED3] bg-white px-3 py-2.5 outline-none focus:border-[#C49A5A]" /></label>
                <button type="submit" className="rounded-xl border border-[#DCC7B0] bg-white px-4 py-2.5 text-sm font-semibold text-[#806033] sm:col-span-2">Continuar</button>
              </form>}
              <EmptyState icon={House} title="Nenhum endereço salvo" description="Quando o cadastro de endereços estiver integrado, você poderá manter seus locais de entrega aqui." />
            </section>
          )}
          {section === 'favorites' && (
            <section className="rounded-2xl border border-[#E7DED3] bg-white p-5 shadow-sm sm:p-7">
              <div className="mb-5"><h2 className="font-serif-brand text-xl font-semibold">Peças que você ama</h2><p className="mt-1 text-sm text-[#766D64]">{favorites.length} {favorites.length === 1 ? 'produto salvo' : 'produtos salvos'} nos favoritos.</p></div>
              {favorites.length ? <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">{favorites.map((product) => <article key={product.id} className="overflow-hidden rounded-xl border border-[#E7DED3] bg-white"><button onClick={() => onSelectProduct(product)} className="block w-full text-left"><img src={product.image} alt={product.name} className="aspect-square w-full object-cover" loading="lazy" /><span className="block p-3"><span className="block text-xs text-[#766D64]">{product.category}</span><span className="mt-1 block font-medium">{product.name}</span><span className="mt-2 block text-sm font-semibold text-[#8B6A3D]">{money(product.price)}</span></span></button><button onClick={() => onToggleFavorite(product)} className="m-3 mt-0 inline-flex items-center gap-1 text-xs font-medium text-[#8B6A3D] hover:text-red-700"><X className="h-3.5 w-3.5" /> Remover dos favoritos</button></article>)}</div> : <EmptyState icon={Heart} title="Você ainda não salvou nenhuma peça" description="Explore a coleção e toque no coração para guardar suas peças favoritas." action="Voltar à loja" onAction={onBackToStore} />}
            </section>
          )}
          {section === 'coupons' && <EmptyState icon={Wallet} title="Cupons e benefícios" description="Os cupons disponíveis serão mostrados aqui quando houver campanhas ativas vinculadas à sua conta. Não há saldo ou cupom ativo conectado neste momento." action="Conhecer a coleção" onAction={onBackToStore} />}
          {section === 'security' && (
            <section className="rounded-2xl border border-[#E7DED3] bg-white p-5 shadow-sm sm:p-7"><div className="flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1E8DC] text-[#A77D3D]"><ShieldCheck className="h-5 w-5" /></span><div><h2 className="font-serif-brand text-xl font-semibold">Segurança da conta</h2><p className="mt-1 text-sm text-[#766D64]">Sua proteção será configurada junto com o sistema de autenticação.</p></div></div><div className="mt-5 space-y-3">{[['Acesso à conta','Login por e-mail e senha'],['Recuperação de senha','Redefinição por e-mail'],['Sessões e dispositivos','Gerenciamento de dispositivos']].map(([label, description]) => <div key={label} className="flex items-center justify-between gap-3 rounded-xl border border-[#E7DED3] p-4"><div><p className="text-sm font-medium">{label}</p><p className="mt-1 text-xs text-[#766D64]">{description}</p></div><LockKeyhole className="h-4 w-4 text-[#C49A5A]" /></div>)}</div><p className="mt-4 text-xs text-[#766D64]">Esses controles são informativos no momento; nenhuma autenticação real foi ativada.</p></section>
          )}
          {section === 'support' && (
            <section className="rounded-2xl border border-[#E7DED3] bg-white p-5 shadow-sm sm:p-7"><div className="flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1E8DC] text-[#A77D3D]"><CircleHelp className="h-5 w-5" /></span><div><h2 className="font-serif-brand text-xl font-semibold">Como podemos ajudar?</h2><p className="mt-1 text-sm text-[#766D64]">Estamos preparando os canais de atendimento da LOLA.</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><button onClick={() => onOpenInfo('Ajuda com pedidos', 'O atendimento sobre pedidos poderá ser feito aqui quando a integração de pedidos estiver disponível.')} className="rounded-xl border border-[#E7DED3] p-4 text-left hover:bg-[#F8F4ED]"><ClipboardList className="h-5 w-5 text-[#C49A5A]" /><p className="mt-3 text-sm font-semibold">Pedidos e entregas</p><p className="mt-1 text-xs text-[#766D64]">Dúvidas sobre suas compras</p></button><button onClick={() => onOpenInfo('Contato LOLA', 'Os canais oficiais de atendimento serão publicados pela loja. Confira o Instagram @lola_acoinox para novidades.')} className="rounded-xl border border-[#E7DED3] p-4 text-left hover:bg-[#F8F4ED]"><Mail className="h-5 w-5 text-[#C49A5A]" /><p className="mt-3 text-sm font-semibold">Falar com a LOLA</p><p className="mt-1 text-xs text-[#766D64]">Canais oficiais da loja</p></button></div></section>
          )}
        </div>
      </div>
      <div className="border-t border-[#E7DED3] bg-white/70 py-5"><div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 text-xs text-[#766D64] sm:flex-row sm:px-6 lg:px-8"><span>LOLA Aço Inox & Acessórios</span><span>Mais que acessórios, é sobre você.</span></div></div>
    </main>
  );
};

function EmptyState({ icon: Icon, title, description, action, onAction }: { icon: React.ElementType; title: string; description: string; action?: string; onAction?: () => void }) {
  return <div className="flex flex-col items-center rounded-2xl border border-[#E7DED3] bg-white px-6 py-12 text-center shadow-sm"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F1E8DC] text-[#A77D3D]"><Icon className="h-6 w-6" /></span><h2 className="mt-4 font-serif-brand text-xl font-semibold text-[#2A211B]">{title}</h2><p className="mt-2 max-w-md text-sm leading-relaxed text-[#766D64]">{description}</p>{action && onAction && <button onClick={onAction} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#2A211B] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#806033]">{action}<ChevronRight className="h-4 w-4" /></button>}</div>;
}
