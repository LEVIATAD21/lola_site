import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Circle, ExternalLink, LoaderCircle, PackageCheck, Truck } from 'lucide-react';

type Status = 'preparing' | 'posted' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception';
interface EventItem { id: string; status: Status; title: string; description: string; occurredAt: string; source: 'store' | 'carrier'; location?: string; }
interface TrackingData { orderNumber: string; carrierCode: string | null; status: Status; events: EventItem[]; updatedAt: string; }
const STEPS: Array<{ status: Status; title: string; text: string }> = [
  { status: 'preparing', title: 'Pedido sendo preparado', text: 'A loja está preparando seu pedido.' },
  { status: 'posted', title: 'Pedido postado nos Correios', text: 'A encomenda foi entregue à transportadora.' },
  { status: 'in_transit', title: 'Pedido em trânsito', text: 'A encomenda está em movimentação.' },
  { status: 'out_for_delivery', title: 'Saiu para entrega', text: 'A transportadora informou que saiu para entrega.' },
  { status: 'delivered', title: 'Pedido recebido', text: 'A entrega foi confirmada pela fonte de rastreamento.' },
];
const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data indisponível' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

export const OrderTrackingPage: React.FC<{ onBackHome: () => void }> = ({ onBackHome }) => {
  const [tracking, setTracking] = useState<TrackingData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token') || '';
    if (!token) { setError('Para acompanhar um pedido, use o link seguro de rastreamento enviado pela LOLA.'); setLoading(false); return; }
    let active = true;
    fetch('/api/rastreio/' + encodeURIComponent(token), { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'Não foi possível consultar o rastreamento.');
        if (!payload?.tracking || typeof payload.tracking.orderNumber !== 'string' || !Array.isArray(payload.tracking.events)) throw new Error('Resposta de rastreamento inválida.');
        return payload.tracking as TrackingData;
      })
      .then((data) => { if (active) setTracking(data); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Rastreamento temporariamente indisponível.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const currentIndex = tracking ? STEPS.findIndex((step) => step.status === tracking.status) : -1;
  const carrierUrl = tracking?.carrierCode ? 'https://rastreamento.correios.com.br/app/index.php?objeto=' + encodeURIComponent(tracking.carrierCode) : '';
  return (
    <main className="flex-1 bg-[#F8F4ED] px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-3xl">
        <button onClick={onBackHome} className="mb-6 inline-flex items-center gap-2 text-sm text-[#766D64] hover:text-[#2A211B]">
          <ArrowLeft size={16} /> Voltar à loja
        </button>
        <section className="overflow-hidden rounded-2xl border border-[#E7DED3] bg-white shadow-sm">
          <div className="bg-[#2A211B] px-6 py-7 text-[#F8F4ED] sm:px-8">
            <div className="mb-3 flex items-center gap-2 text-sm text-[#D9BD8A]"><Truck size={18} /> ACOMPANHAMENTO LOLA</div>
            <h1 className="font-serif-brand text-2xl sm:text-3xl">Seu pedido, a caminho</h1>
            <p className="mt-2 text-sm text-[#E7DED3]">Acompanhe as atualizações disponíveis para sua encomenda.</p>
          </div>
          <div className="p-6 sm:p-8">
            {loading ? <div className="flex items-center gap-3 py-10 text-[#766D64]"><LoaderCircle className="animate-spin" /> Consultando rastreamento…</div> :
              error ? <div role="status" className="rounded-xl border border-[#E7DED3] bg-[#F8F4ED] p-5 text-sm text-[#5E5145]">{error}</div> :
              tracking && <>
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E7DED3] pb-5">
                  <div><p className="text-xs uppercase tracking-widest text-[#766D64]">Número do pedido</p><p className="mt-1 text-lg font-semibold text-[#2A211B]">{tracking.orderNumber}</p></div>
                  <div className="rounded-full bg-[#F3E8D6] px-3 py-1 text-sm text-[#654323]">{STEPS.find((s) => s.status === tracking.status)?.title || 'Ocorrência na entrega'}</div>
                </div>
                <div className="py-7">
                  <h2 className="mb-6 text-lg font-semibold text-[#2A211B]">Etapas do pedido</h2>
                  <ol className="space-y-0">
                    {STEPS.map((step, index) => {
                      const completed = currentIndex >= 0 && index <= currentIndex && tracking.status !== 'exception';
                      const active = index === currentIndex;
                      return <li key={step.status} className="relative flex gap-4 pb-7 last:pb-0">
                        {index < STEPS.length - 1 && <span className={'absolute left-[15px] top-8 h-[calc(100%-8px)] w-px ' + (completed && index < currentIndex ? 'bg-[#C49A5A]' : 'bg-[#E7DED3]')} />}
                        <span className={'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ' + (completed ? 'bg-[#C49A5A] text-white' : 'border border-[#D8CBB8] bg-white text-[#A89A87]')}>
                          {completed ? <CheckCircle2 size={17} /> : <Circle size={16} />}
                        </span>
                        <div className="pt-1"><p className={'font-medium ' + (active ? 'text-[#2A211B]' : 'text-[#766D64]')}>{step.title}</p><p className="mt-1 text-sm text-[#766D64]">{step.text}</p></div>
                      </li>;
                    })}
                  </ol>
                  {tracking.status === 'exception' && <div className="mt-4 rounded-lg bg-[#F8F4ED] p-4 text-sm text-[#654323]">Existe uma ocorrência registrada para este pedido. Consulte os eventos abaixo para ver os detalhes disponíveis.</div>}
                </div>
                <div className="border-t border-[#E7DED3] pt-6">
                  <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold text-[#2A211B]">Movimentações</h2><p className="text-xs text-[#766D64]">Atualizado em {formatDate(tracking.updatedAt)}</p></div>
                  <ol className="mt-4 space-y-4">
                    {[...tracking.events].reverse().map((event) => <li key={event.id} className="border-l-2 border-[#C49A5A] pl-4">
                      <p className="font-medium text-[#2A211B]">{event.title}</p><p className="mt-1 text-sm text-[#5E5145]">{event.description}</p>
                      {event.location && <p className="mt-1 text-xs text-[#766D64]">{event.location}</p>}
                      <p className="mt-1 text-xs text-[#766D64]">{formatDate(event.occurredAt)} · {event.source === 'carrier' ? 'Transportadora' : 'LOLA'}</p>
                    </li>)}
                  </ol>
                </div>
                {carrierUrl && <a href={carrierUrl} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#2A211B] px-5 py-3 text-sm font-medium text-white hover:bg-[#44352B]"><PackageCheck size={17} /> Consultar nos Correios <ExternalLink size={15} /></a>}
                {!tracking.carrierCode && <p className="mt-5 rounded-lg bg-[#F8F4ED] p-4 text-sm text-[#766D64]">O código dos Correios ainda não foi registrado pela loja. As movimentações aparecerão quando forem cadastradas.</p>}
              </>}
          </div>
        </section>
        <p className="mt-5 text-center text-xs text-[#766D64]">LOLA Aço Inox &amp; Acessórios · Não compartilhe seu link privado de rastreamento.</p>
      </div>
    </main>
  );
};
