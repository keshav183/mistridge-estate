import { inr } from './format';

export function PriceLines({ quote, promoCode }) {
  const nights = quote.nights.length;
  return (
    <div className="sum" aria-live="polite">
      <div><span>{quote.rooms > 1 ? `${quote.rooms} rooms × ` : ''}{nights} night{nights > 1 ? 's' : ''}</span><span>{inr(quote.subtotal)}</span></div>
      {quote.discount > 0 && <div className="disc"><span>Promo {promoCode}</span><span>− {inr(quote.discount)}</span></div>}
      {quote.gstBreakdown.map((g) => <div key={g.rate}><span className="muted">GST @ {g.rate}%</span><span>{inr(g.amount)}</span></div>)}
      <div className="total"><span>Total</span><span>{inr(quote.total)}</span></div>
    </div>
  );
}
