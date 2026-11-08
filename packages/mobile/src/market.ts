export type OutcomeName = 'YES' | 'NO';
export interface BookOrder { id: string; price: number; qty: number; filled: number }
export interface MarketOutcome {
  id: string; name: string; bids?: BookOrder[]; asks?: BookOrder[]; mid?: number;
}
export interface Trade { id: string; outcome_id: string; price: number; qty: number; created_at: string }
export interface Market {
  id: string; question: string; category: string; status: string; outcome_type: string;
  close_at: string; resolution_source: string; resolution_source_url: string;
  outcomes: MarketOutcome[]; trades?: Trade[];
}
export interface Position {
  id: string; market_id: string; qty: number; avg_price: number;
  sp_markets: Market; sp_market_outcomes: MarketOutcome;
}
export interface Portfolio {
  balance: number; locked_balance: number; available_balance: number;
  positions: Position[]; open_orders: { id: string; market_id: string; price: number; qty: number; filled_qty: number; side: string }[];
  trades: Trade[];
}

export const categories = [
  { id: 'all', label: 'Yanayovuma', icon: 'flame-outline' },
  { id: 'michezo', label: 'Michezo', icon: 'football-outline' },
  { id: 'uchumi', label: 'Uchumi & FX', icon: 'trending-up-outline' },
  { id: 'hewa', label: 'Hali ya hewa', icon: 'partly-sunny-outline' },
  { id: 'teknolojia', label: 'Teknolojia', icon: 'hardware-chip-outline' },
] as const;
export const categoryLabel = (id: string) => categories.find((c) => c.id === id)?.label ?? id;
export const fmt = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value || 0);
export function book(market: Market, name: OutcomeName) {
  return market.outcomes.find((o) => o.name === name);
}
export function quote(market: Market, name: OutcomeName): number | undefined {
  return book(market, name)?.asks?.[0]?.price;
}
export function probability(market: Market): number | undefined {
  const yes = book(market, 'YES');
  if (!yes) return undefined;
  const bid = yes.bids?.[0]?.price;
  const ask = yes.asks?.[0]?.price;
  return bid != null && ask != null ? (bid + ask) / 2 : ask ?? bid;
}
export function filterMarkets(markets: Market[], query: string, category: string) {
  const text = query.trim().toLocaleLowerCase();
  return markets.filter((m) => m.category !== 'siasa'
    && (category === 'all' || m.category === category)
    && `${m.question} ${categoryLabel(m.category)}`.toLocaleLowerCase().includes(text));
}
export function canTrade(market: Market, now = Date.now()) {
  return market.status === 'open' && market.outcome_type === 'binary'
    && market.category !== 'siasa' && new Date(market.close_at).getTime() > now;
}
export function orderEstimate(budget: number, price: number) {
  if (!Number.isFinite(budget) || budget <= 0 || !Number.isInteger(price) || price < 1 || price > 99) {
    return { qty: 0, cost: 0, remainder: Math.max(0, budget || 0), payout: 0, profit: 0 };
  }
  const qty = Math.floor(budget / price);
  const cost = qty * price;
  return { qty, cost, remainder: budget - cost, payout: qty * 100, profit: qty * 100 - cost };
}
export function remaining(market: Market) {
  const days = Math.ceil((new Date(market.close_at).getTime() - Date.now()) / 86400000);
  return market.status !== 'open' ? 'Limemalizika' : days <= 0 ? 'Limefungwa' : days === 1 ? 'Siku 1' : `Siku ${days}`;
}
