import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, Bot, User, ArrowRight, Loader2, RefreshCw, ShoppingBag, Check } from 'lucide-react';
import { consultAI, AIRef } from '../services/api';
import { Product } from '../data/mockData';
import { CartItem } from '../types';
import { useDialogA11y } from '../hooks/useDialogA11y';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  referencias?: AIRef[];
}

interface ChatbotAssistenteProps {
  currentProduct?: Product | null;
  cartItems?: CartItem[];
  onSelectProduct?: (product: Product) => void;
  onAddToCart?: (product: Product, quantity: number) => void;
  catalog: Product[];
}

export const ChatbotAssistente: React.FC<ChatbotAssistenteProps> = ({
  currentProduct,
  cartItems = [],
  onSelectProduct,
  onAddToCart,
  catalog,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'Olá! Sou a assistente virtual da Lola Aço Inox. ✨\nPosso te ajudar a navegar pela nossa coleção e sugerir combinações de acessórios.',
      timestamp: 'Agora',
      referencias: [
        { tipo: 'produto', id: 'brinco-1', titulo: 'Brinco Argola Lisa', link: '/produto/brinco-1' },
      ],
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Janela flutuante não modal: sem aria-modal, sem trap e sem trava de rolagem,
  // mas com foco inicial no campo de digitação e devolução ao botão flutuante
  // (que fica montado, só oculto, para poder receber o foco de volta).
  const { dialogProps } = useDialogA11y({
    isOpen,
    onClose: () => setIsOpen(false),
    isModal: false,
    label: 'Assistente Virtual de Vendas Lola',
    initialFocusRef: inputRef,
    returnFocusRef: triggerRef,
  });

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [isOpen, messages]);

  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || inputMessage;
    if (!textToSend.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customText) setInputMessage('');
    setIsLoading(true);

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'assistant',
          text: 'Você está sem conexão no momento. Não foi possível consultar a disponibilidade — verifique sua internet e tente novamente.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      setIsLoading(false);
      return;
    }

    try {
      const response = await consultAI(textToSend.trim(), {
        produtoId: currentProduct?.id,
        carrinho: cartItems.map((i) => ({ id: i.productId, nome: i.name, qtd: i.quantity })),
      });

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: response.resposta,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        referencias: response.referencias,
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: 'Não foi possível verificar a disponibilidade no momento. Tente novamente em alguns minutos.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickQuestion = (question: string) => {
    handleSendMessage(question);
  };

  const handleReferenceClick = (ref: AIRef) => {
    if (ref.tipo === 'produto' && onSelectProduct) {
      const found = catalog.find((p) => p.id === ref.id || p.name.toLowerCase() === ref.titulo.toLowerCase());
      if (found) {
        onSelectProduct(found);
        setIsOpen(false);
      }
    }
  };

  return (
    <>
      {/* Floating Trigger Button — fica montado (só oculto) enquanto o chat
          está aberto, para o hook devolver o foco a ele ao fechar. */}
      <div className="fixed bottom-5 right-5 z-40">
        <button
          ref={triggerRef}
          onClick={() => setIsOpen(true)}
          aria-label="Abrir assistente virtual Lola"
          hidden={isOpen}
          className="group flex items-center gap-2.5 px-4 py-3 rounded-full bg-[#2A211B] text-[#F8F4ED] hover:bg-[#C49A5A] transition-all shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 cursor-pointer border border-[#C49A5A]/30"
        >
          <div className="w-6 h-6 rounded-full bg-[#C49A5A] text-white flex items-center justify-center group-hover:bg-[#2A211B] transition-colors">
            <Sparkles className="w-3.5 h-3.5 fill-current animate-spin" style={{ animationDuration: '6s' }} />
          </div>
          <div className="text-left hidden sm:block">
            <span className="text-[10px] tracking-widest uppercase font-semibold text-[#DCC7B0] block">
              Atendimento
            </span>
            <span className="text-xs font-serif-brand font-medium tracking-wide">
              Dúvidas & Estoque
            </span>
          </div>
        </button>
      </div>

      {/* Chat Window */}
      {isOpen && (
        <div
          {...dialogProps}
          className="fixed bottom-5 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-96 max-h-[85vh] h-[540px] bg-white rounded-3xl shadow-2xl border border-[#E7DED3] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        >
          {/* Header */}
          <div className="bg-[#2A211B] text-[#F8F4ED] p-4 flex items-center justify-between border-b border-[#C49A5A]/30">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#C49A5A] text-white flex items-center justify-center shadow-xs">
                <Sparkles className="w-4 h-4 fill-current" />
              </div>
              <div className="text-left">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-serif-brand text-sm font-semibold tracking-wide">
                    Assistente Lola
                  </h3>
                </div>
                <p className="text-[10px] text-[#DCC7B0]">
                  Atendimento e consulta de catálogo
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              aria-label="Fechar chat"
              className="p-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Current product context banner inside chat if viewing a product */}
          {currentProduct && (
            <div className="bg-[#F8F4ED] px-4 py-2 border-b border-[#E7DED3] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 truncate">
                <img
                  src={currentProduct.image}
                  alt={currentProduct.name}
                  className="w-6 h-6 rounded-md object-cover border border-[#E7DED3]"
                />
                <span className="font-medium text-[#241F1B] truncate">
                  {currentProduct.name}
                </span>
              </div>
              <span className="text-[11px] font-semibold text-[#C49A5A] shrink-0">
                R$ {currentProduct.price.toFixed(2).replace('.', ',')}
              </span>
            </div>
          )}

          {/* Messages Area — `role="log"`: respostas novas são anunciadas sem
              roubar o foco de quem está digitando. */}
          <div
            role="log"
            className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#F8F4ED]/30 text-left text-xs"
          >
            {messages.map((msg) => {
              const isUser = msg.sender === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="w-6 h-6 rounded-full bg-[#2A211B] text-[#C49A5A] flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                      <Sparkles className="w-3 h-3 fill-current" />
                    </div>
                  )}

                  <div className={`space-y-1.5 max-w-[82%] ${isUser ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`p-3 rounded-2xl leading-relaxed whitespace-pre-wrap ${
                        isUser
                          ? 'bg-[#2A211B] text-white rounded-br-xs'
                          : 'bg-white text-[#241F1B] border border-[#E7DED3] shadow-xs rounded-bl-xs'
                      }`}
                    >
                      {msg.text}
                    </div>

                    {/* Reference Chips */}
                    {msg.referencias && msg.referencias.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {msg.referencias.map((ref) => (
                          <button
                            key={ref.id}
                            onClick={() => handleReferenceClick(ref)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-[#F1E8DC] text-[#2A211B] hover:bg-[#C49A5A] hover:text-white transition-colors border border-[#DCC7B0] cursor-pointer"
                          >
                            <span>{ref.titulo}</span>
                            <ArrowRight className="w-2.5 h-2.5" />
                          </button>
                        ))}
                      </div>
                    )}

                    <span className="text-[9px] text-[#766D64]/70 block px-1">
                      {msg.timestamp}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Loading Indicator */}
            {isLoading && (
              <div role="status" className="flex gap-2.5 justify-start">
                <div className="w-6 h-6 rounded-full bg-[#2A211B] text-[#C49A5A] flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="w-3 h-3 fill-current" />
                </div>
                <div className="p-3 bg-white rounded-2xl rounded-bl-xs border border-[#E7DED3] text-[#766D64] flex items-center gap-2 shadow-xs">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C49A5A]" />
                  <span className="text-[11px]">Consultando estoque e catálogo...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggested Quick Questions */}
          <div className="px-3 py-2 bg-white border-t border-[#E7DED3]/80 overflow-x-auto whitespace-nowrap flex gap-1.5 scrollbar-none">
            <button
              onClick={() => handleQuickQuestion('O aço escurece ou pode molhar?')}
              className="text-[10px] px-2.5 py-1 rounded-full bg-[#F8F4ED] hover:bg-[#E7DED3] text-[#241F1B] transition-colors cursor-pointer border border-[#E7DED3]"
            >
              💧 Pode molhar?
            </button>
            <button
              onClick={() => handleQuickQuestion('Qual o estoque do Brinco Argola Lisa?')}
              className="text-[10px] px-2.5 py-1 rounded-full bg-[#F8F4ED] hover:bg-[#E7DED3] text-[#241F1B] transition-colors cursor-pointer border border-[#E7DED3]"
            >
              📦 Consultar estoque
            </button>
            <button
              onClick={() => handleQuickQuestion('Quais as características do aço inoxidável?')}
              className="text-[10px] px-2.5 py-1 rounded-full bg-[#F8F4ED] hover:bg-[#E7DED3] text-[#241F1B] transition-colors cursor-pointer border border-[#E7DED3]"
            >
              ✨ Sobre o aço inox
            </button>
          </div>

          {/* Input Footer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 bg-white border-t border-[#E7DED3] flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Digite sua dúvida ou peça desejada..."
              className="flex-1 h-10 px-3.5 rounded-full bg-[#F8F4ED] border border-[#E7DED3] text-xs text-[#241F1B] placeholder-[#766D64]/70 focus:outline-none focus:border-[#C49A5A]"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || isLoading}
              aria-label="Enviar mensagem"
              className="w-10 h-10 rounded-full bg-[#2A211B] text-white hover:bg-[#C49A5A] transition-colors flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-xs shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
