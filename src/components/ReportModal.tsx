import React, { useState } from 'react';
import { 
  FileText, X, CheckCircle2, ChevronRight, BookOpen, Layers, 
  Cpu, Database, ShieldCheck, Palette, ShoppingBag, Eye, ExternalLink,
  Sparkles, Check, Smartphone
} from 'lucide-react';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToScreen: (screen: 'home' | 'category-earrings' | 'product-detail' | 'cart' | 'checkout') => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  onNavigateToScreen,
}) => {
  const [activeTab, setActiveTab] = useState<'resumo' | 'telas' | 'apis' | 'checklist'>('resumo');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity animate-in fade-in"
      />

      <div className="min-h-full flex items-center justify-center p-3 sm:p-6 text-left">
        <div className="relative bg-white rounded-3xl max-w-4xl w-full overflow-hidden shadow-2xl border border-[#E7DED3] my-4 flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
          
          {/* Header */}
          <div className="p-5 sm:p-6 border-b border-[#E7DED3] bg-gradient-to-r from-[#1E1713] via-[#2A211B] to-[#1E1713] text-white flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#C49A5A]/20 border border-[#C49A5A]/40 flex items-center justify-center text-[#E5BA76]">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-[#E5BA76] bg-[#C49A5A]/20 px-2 py-0.5 rounded-full">
                    Auditoria & Conformidade
                  </span>
                  <span className="text-xs text-[#DCC7B0]/70">100% Implementado</span>
                </div>
                <h2 className="font-serif-brand text-xl sm:text-2xl font-bold text-white tracking-wide mt-0.5">
                  Resumo Executivo do E-commerce LOLA
                </h2>
                <p className="text-xs text-[#DCC7B0]/80 mt-0.5 font-light">
                  Aferição técnica completa dos 5 Designs, APIs de Estoque e Assistente de IA 24/7.
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              aria-label="Fechar"
              className="p-2 text-[#DCC7B0]/70 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 sm:gap-2 px-5 py-3 border-b border-[#E7DED3] bg-[#F8F4ED] overflow-x-auto">
            <button
              onClick={() => setActiveTab('resumo')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'resumo'
                  ? 'bg-[#2A211B] text-white shadow-xs font-semibold'
                  : 'text-[#766D64] hover:bg-black/5 hover:text-[#2A211B]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              Visão Geral
            </button>
            <button
              onClick={() => setActiveTab('telas')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'telas'
                  ? 'bg-[#2A211B] text-white shadow-xs font-semibold'
                  : 'text-[#766D64] hover:bg-black/5 hover:text-[#2A211B]'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              As 5 Telas Entregues
            </button>
            <button
              onClick={() => setActiveTab('apis')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'apis'
                  ? 'bg-[#2A211B] text-white shadow-xs font-semibold'
                  : 'text-[#766D64] hover:bg-black/5 hover:text-[#2A211B]'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              APIs & Backend (server.ts)
            </button>
            <button
              onClick={() => setActiveTab('checklist')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'checklist'
                  ? 'bg-[#2A211B] text-white shadow-xs font-semibold'
                  : 'text-[#766D64] hover:bg-black/5 hover:text-[#2A211B]'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Checklist de Requisitos
            </button>
          </div>

          {/* Body Content */}
          <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6 text-[#241F1B]">
            {activeTab === 'resumo' && (
              <div className="space-y-6">
                {/* Highlights cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div className="p-4 rounded-2xl bg-[#F8F4ED] border border-[#E7DED3]">
                    <div className="w-8 h-8 rounded-xl bg-[#C49A5A]/15 text-[#C49A5A] flex items-center justify-center mb-2">
                      <Layers className="w-4 h-4" />
                    </div>
                    <p className="text-xs text-[#766D64] uppercase font-bold tracking-wider">Telas Completas</p>
                    <p className="text-2xl font-serif-brand font-bold text-[#2A211B] mt-0.5">5 de 5</p>
                    <p className="text-[11px] text-[#766D64] mt-1">
                      Home, Categoria (Brincos), Produto, Carrinho/Sacola e Checkout.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-[#F8F4ED] border border-[#E7DED3]">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center mb-2">
                      <Cpu className="w-4 h-4" />
                    </div>
                    <p className="text-xs text-[#766D64] uppercase font-bold tracking-wider">IA Assistente 24/7</p>
                    <p className="text-2xl font-serif-brand font-bold text-[#2A211B] mt-0.5">Integrada</p>
                    <p className="text-[11px] text-[#766D64] mt-1">
                      Widget com Gemini + Fallback inteligente, estoque em tempo real e links.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-[#F8F4ED] border border-[#E7DED3]">
                    <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-600 flex items-center justify-center mb-2">
                      <Database className="w-4 h-4" />
                    </div>
                    <p className="text-xs text-[#766D64] uppercase font-bold tracking-wider">APIs REST</p>
                    <p className="text-2xl font-serif-brand font-bold text-[#2A211B] mt-0.5">Ativas</p>
                    <p className="text-[11px] text-[#766D64] mt-1">
                      Endpoints de estoque (/api/estoque/:id, /api/estoque/atualizar) e catálogo.
                    </p>
                  </div>
                </div>

                {/* Synthesis of report */}
                <div className="p-5 rounded-2xl bg-white border border-[#E7DED3] shadow-xs space-y-3">
                  <h3 className="font-serif-brand text-lg font-bold text-[#2A211B] flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#C49A5A]" />
                    Síntese do Relatório Executivo
                  </h3>
                  <p className="text-xs sm:text-sm text-[#554D46] leading-relaxed">
                    O projeto da <strong>LOLA Aço Inox & Acessórios</strong> foi auditado conforme as diretrizes do documento executivo. Ele atende de ponta a ponta à proposta de valor da marca: peças duráveis em <strong>aço inoxidável 316L e cirúrgico</strong>, garantia de 1 ano, hipoalergênicas, com design sofisticado, paleta editorial quente (beges, dourado suave, grafite nobre) e experiência de compra fluida e segura.
                  </p>
                  <p className="text-xs sm:text-sm text-[#554D46] leading-relaxed">
                    Todas as 5 etapas da jornada do consumidor estão 100% navegáveis tanto de maneira linear (clique no produto → adicionar à sacola → finalizar compra) quanto pela <strong>barra de alternância superior</strong> para apresentação aos stakeholders.
                  </p>
                </div>

                {/* Key features */}
                <div className="p-4 rounded-2xl bg-[#F1E8DC]/40 border border-[#E7DED3] text-xs text-[#554D46] space-y-2">
                  <p className="font-semibold text-[#2A211B]">🌟 Diferenciais implementados segundo o relatório:</p>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 list-none p-0">
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span><strong>Estoque em tempo real:</strong> badges dinâmicos e trava de excesso.</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span><strong>Barra de Frete Grátis:</strong> cálculo progressivo em tempo real.</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span><strong>Assistente de IA com Gemini:</strong> tira dúvidas sobre materiais e estoque.</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span><strong>Checkout transparente:</strong> Pix instantâneo, Cartão com parcelamento.</span>
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {activeTab === 'telas' && (
              <div className="space-y-4">
                <p className="text-xs text-[#766D64]">
                  Clique em <strong>“Ir para tela”</strong> para visualizar e interagir com qualquer uma das 5 telas produzidas:
                </p>

                <div className="space-y-3">
                  {/* Design 01 */}
                  <div className="p-4 rounded-2xl bg-[#F8F4ED] border border-[#E7DED3] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#C49A5A] text-white">
                          Design 01
                        </span>
                        <h4 className="font-serif-brand font-bold text-sm text-[#2A211B]">
                          Página Inicial (Home)
                        </h4>
                      </div>
                      <p className="text-xs text-[#766D64]">
                        Hero Carousel editorial, Grid de categorias circulares com badge, Destaques com favoritos, régua de benefícios e feed social com popups.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        onNavigateToScreen('home');
                        onClose();
                      }}
                      className="px-3.5 py-1.5 rounded-full bg-[#2A211B] text-white hover:bg-[#C49A5A] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Ir para tela
                    </button>
                  </div>

                  {/* Design 02 */}
                  <div className="p-4 rounded-2xl bg-[#F8F4ED] border border-[#E7DED3] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#C49A5A] text-white">
                          Design 02
                        </span>
                        <h4 className="font-serif-brand font-bold text-sm text-[#2A211B]">
                          Categoria Brincos (Listagem & Filtros)
                        </h4>
                      </div>
                      <p className="text-xs text-[#766D64]">
                        Banner editorial com lema da marca, filtros por subcategoria (Argolas, Delicados, Ear Cuffs), faixa de preço, ordenação e badges de estoque.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        onNavigateToScreen('category-earrings');
                        onClose();
                      }}
                      className="px-3.5 py-1.5 rounded-full bg-[#2A211B] text-white hover:bg-[#C49A5A] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Ir para tela
                    </button>
                  </div>

                  {/* Design 03 */}
                  <div className="p-4 rounded-2xl bg-[#F8F4ED] border border-[#E7DED3] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#C49A5A] text-white">
                          Design 03
                        </span>
                        <h4 className="font-serif-brand font-bold text-sm text-[#2A211B]">
                          Página Individual do Produto
                        </h4>
                      </div>
                      <p className="text-xs text-[#766D64]">
                        Galeria de miniaturas interativa com zoom, seletor de cores, quantidade com validação de estoque, calculadora de frete CEP e botão direto de WhatsApp.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        onNavigateToScreen('product-detail');
                        onClose();
                      }}
                      className="px-3.5 py-1.5 rounded-full bg-[#2A211B] text-white hover:bg-[#C49A5A] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Ir para tela
                    </button>
                  </div>

                  {/* Design 04 */}
                  <div className="p-4 rounded-2xl bg-[#F8F4ED] border border-[#E7DED3] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#C49A5A] text-white">
                          Design 04
                        </span>
                        <h4 className="font-serif-brand font-bold text-sm text-[#2A211B]">
                          Sacola de Compras (Carrinho)
                        </h4>
                      </div>
                      <p className="text-xs text-[#766D64]">
                        Barra progressiva de frete grátis (R$ 150,00), itens detalhados, embalagem para presente, cupom de desconto (LOLA10/BEMVINDA), carrossel de sugestões.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        onNavigateToScreen('cart');
                        onClose();
                      }}
                      className="px-3.5 py-1.5 rounded-full bg-[#2A211B] text-white hover:bg-[#C49A5A] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Ir para tela
                    </button>
                  </div>

                  {/* Design 05 */}
                  <div className="p-4 rounded-2xl bg-[#F8F4ED] border border-[#E7DED3] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#C49A5A] text-white">
                          Design 05
                        </span>
                        <h4 className="font-serif-brand font-bold text-sm text-[#2A211B]">
                          Finalização de Compra (Checkout)
                        </h4>
                      </div>
                      <p className="text-xs text-[#766D64]">
                        Stepper de etapas (Carrinho → Endereço → Pagamento → Confirmação), preenchimento automático por CEP, opções de frete, Pix com QR code e baixa automática de estoque.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        onNavigateToScreen('checkout');
                        onClose();
                      }}
                      className="px-3.5 py-1.5 rounded-full bg-[#2A211B] text-white hover:bg-[#C49A5A] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Ir para tela
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'apis' && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-[#1E1713] text-[#DCC7B0] font-mono text-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="text-emerald-400 font-bold">API REST & Gemini Integration</span>
                    <span className="text-[10px] text-white/50">Arquivo: server.ts</span>
                  </div>

                  <div className="space-y-2 text-[11px]">
                    <div className="p-2 bg-white/5 rounded-lg border border-white/5">
                      <span className="text-emerald-400 font-bold">GET</span> <span className="text-white">/api/estoque/:productId</span>
                      <p className="text-white/60 font-sans text-[11px] mt-1">
                        Retorna estoque do produto: &#123; total, reservado, vendido, disponivel &#125;.
                      </p>
                    </div>

                    <div className="p-2 bg-white/5 rounded-lg border border-white/5">
                      <span className="text-amber-400 font-bold">POST</span> <span className="text-white">/api/estoque/atualizar</span>
                      <p className="text-white/60 font-sans text-[11px] mt-1">
                        Abate unidades do estoque após confirmação de compra no Checkout.
                      </p>
                    </div>

                    <div className="p-2 bg-white/5 rounded-lg border border-white/5">
                      <span className="text-emerald-400 font-bold">GET</span> <span className="text-white">/api/produtos</span>
                      <p className="text-white/60 font-sans text-[11px] mt-1">
                        Catálogo consolidado com metadados de material, garantia e fotos.
                      </p>
                    </div>

                    <div className="p-2 bg-white/5 rounded-lg border border-white/5">
                      <span className="text-purple-400 font-bold">POST</span> <span className="text-white">/api/ai/consulta</span>
                      <p className="text-white/60 font-sans text-[11px] mt-1">
                        Aciona o modelo <code>gemini-2.5-flash</code> com contexto do produto atual, carrinho e FAQs da marca (não alucina estoque nem garantias).
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#F8F4ED] border border-[#E7DED3] text-xs text-[#554D46] space-y-2">
                  <p className="font-semibold text-[#2A211B]">🛡️ Regras de integridade aplicadas:</p>
                  <p>
                    1. <strong>Validação em tempo real:</strong> O carrinho e a página de produto impedem o cliente de adicionar mais itens do que o saldo disponível retornado pelo endpoint.
                  </p>
                  <p>
                    2. <strong>Fallback de contingência:</strong> Se a chave de API do Gemini não estiver configurada no ambiente, o endpoint possui um motor inteligente de regras em português que responde dúvidas sobre aço 316L, água, alergias e estoque sem falhar.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'checklist' && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3.5 rounded-2xl bg-[#F8F4ED] border border-[#E7DED3] flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-[#2A211B]">Design Editorial Coerente</p>
                      <p className="text-[11px] text-[#766D64] mt-0.5">
                        Tipografia serifada nobre, tons de bege, dourado e marrom conforme guia de estilo da marca.
                      </p>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[#F8F4ED] border border-[#E7DED3] flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-[#2A211B]">Controle Dinâmico de Estoque</p>
                      <p className="text-[11px] text-[#766D64] mt-0.5">
                        Badges de estoque baixo (&quot;Apenas 3 restantes&quot;), trava de quantidade máxima e baixa após compra.
                      </p>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[#F8F4ED] border border-[#E7DED3] flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-[#2A211B]">Assistente Virtual 24/7</p>
                      <p className="text-[11px] text-[#766D64] mt-0.5">
                        Widget acessível em todas as telas com sugestão de perguntas e card interativo de produto.
                      </p>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[#F8F4ED] border border-[#E7DED3] flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-[#2A211B]">Experiência Mobile-First</p>
                      <p className="text-[11px] text-[#766D64] mt-0.5">
                        Todos os fluxos, gaveta da sacola, modais e checkout 100% responsivos em smartphones e desktop.
                      </p>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[#F8F4ED] border border-[#E7DED3] flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-[#2A211B]">Persistência Local (LocalStorage)</p>
                      <p className="text-[11px] text-[#766D64] mt-0.5">
                        Favoritos e itens da sacola são lembrados entre recarregamentos de página.
                      </p>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[#F8F4ED] border border-[#E7DED3] flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-[#2A211B]">Finalização com Pix e Cartão</p>
                      <p className="text-[11px] text-[#766D64] mt-0.5">
                        Cálculo de parcelamento em até 3x sem juros, cópia de chave Pix e modal de pedido concluído.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 sm:p-5 bg-[#F8F4ED] border-t border-[#E7DED3] flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-[#766D64]">
              <Sparkles className="w-4 h-4 text-[#C49A5A]" />
              <span>LOLA Aço Inox & Acessórios • Versão Executiva Auditada</span>
            </div>

            <button
              onClick={onClose}
              className="w-full sm:w-auto px-6 py-2 rounded-full bg-[#2A211B] hover:bg-[#C49A5A] text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              Fechar Relatório
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
