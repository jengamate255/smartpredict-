import React from 'react';
import { ActivityIndicator, Image, Linking, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Line, Path, Stop } from 'react-native-svg';
import { Button, C, Caps, Card, Empty, Icon, S, T } from './ui';
import { book, canTrade, categories, categoryLabel, filterMarkets, fmt, Market, OutcomeName, Portfolio, probability, quote, remaining } from './market';

const stadium = 'https://lh3.googleusercontent.com/aida-public/AB6AXuBDYypO5gbNE39GPNtLSv-_lYg_JAb5-dBQfux7_HFVf2Rxb-c1LVcwZok5L2gbH1ywWFY2fKSv_CGw_Q8msQ-LnPsrRZo6ofs9tGNcZIFonlu8FabggI6Ym9gJIyigykJpDhFAB4TO2W5EKFNpaimYR5B99V4XXuD8x-1EbXSrFM5yHCtfSiTH0O6fxSRjW-nSYC6rbLYK-BjvSmqvoOeaoFJuCY5QmDcorOhvAQJ7';

function ProbabilityBar({ market }: { market: Market }) {
  const p = probability(market);
  return <View style={{ gap: 7 }}>
    <View style={S.between}><T bold style={{ color: C.green, fontSize: 11 }}>Ndiyo {p == null ? '—' : `${Math.round(p)}%`}</T>
      <T bold style={{ color: C.pink, fontSize: 11 }}>Hapana {p == null ? '—' : `${Math.round(100 - p)}%`}</T></View>
    <View style={{ height: 6, backgroundColor: C.lowest, borderRadius: 6, flexDirection: 'row', overflow: 'hidden' }}>
      {p != null && <><View style={{ flex: p, backgroundColor: C.green }} /><View style={{ flex: 100 - p, backgroundColor: C.red }} /></>}
    </View>
    <T muted style={{ fontSize: 9, lineHeight: 13 }}>Makadirio kutoka bei za maagizo; si uhakika wa matokeo.</T>
  </View>;
}

export function OutcomeButtons({ market, onTrade, large = false }: {
  market: Market; onTrade: (m: Market, outcome: OutcomeName) => void; large?: boolean;
}) {
  return <View style={{ flexDirection: 'row', gap: 10 }}>
    {(['YES', 'NO'] as const).map((name) => {
      const price = quote(market, name);
      const color = name === 'YES' ? C.green : C.pink;
      const available = canTrade(market) && price != null;
      return <Pressable key={name} accessibilityRole="button" accessibilityLabel={`Nunua ${name === 'YES' ? 'Ndiyo' : 'Hapana'}`}
        disabled={!available} onPress={() => onTrade(market, name)} style={({ pressed }) => ({
          flex: 1, borderRadius: 12, padding: large ? 14 : 12, gap: 8, opacity: pressed ? 0.65 : available ? 1 : 0.45,
          backgroundColor: name === 'YES' ? '#183c32' : '#391c2c',
        })}>
        <View style={S.between}><Caps color={color}>{name === 'YES' ? 'Ndiyo • Yes' : 'Hapana • No'}</Caps><Icon name="arrow-forward-outline" color={color} size={16} /></View>
        <T bold style={{ color, fontSize: large ? 24 : 18 }}>{price != null ? `${price} PT` : 'Hakuna bei'}</T>
        {large && <T muted style={{ fontSize: 10 }}>Hisa 1 • malipo hadi 100 PT</T>}
      </Pressable>;
    })}
  </View>;
}

function MarketCard({ market, featured, onSelect, onTrade }: {
  market: Market; featured?: boolean; onSelect: (m: Market) => void; onTrade: (m: Market, o: OutcomeName) => void;
}) {
  const binary = market.outcome_type === 'binary';
  return <Card style={featured ? { borderWidth: 1, borderColor: '#334a40', padding: 18 } : {}}>
    {featured && <View style={{ position: 'absolute', width: 170, height: 170, borderRadius: 100, backgroundColor: '#21362e', right: -75, top: -90 }} />}
    <View style={S.between}><View style={{ backgroundColor: featured ? '#3c2230' : '#17333b', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5 }}>
      <Caps color={featured ? C.pink : C.cyan}>{categoryLabel(market.category)}{featured ? ' • Spotlight' : ''}</Caps>
    </View><View style={S.row}><Icon name="time-outline" size={12} /><T muted style={{ fontSize: 10 }}>{remaining(market)}</T></View></View>
    <Pressable accessibilityRole="button" accessibilityLabel={market.question} onPress={() => onSelect(market)} style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{ flex: 1, gap: 6 }}><T bold style={featured ? S.heading : { fontSize: 15, lineHeight: 23 }}>{market.question}</T>
        <T muted style={{ fontSize: 11 }} numberOfLines={2}>{market.resolution_source}</T></View>
      {market.category === 'michezo' ? <Image source={{ uri: stadium }} style={{ width: 56, height: 60, borderRadius: 12, backgroundColor: C.high }} />
        : <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: C.high, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={categories.find((c) => c.id === market.category)?.icon ?? 'stats-chart-outline'} color={C.green} size={24} /></View>}
    </Pressable>
    {binary ? <><ProbabilityBar market={market} /><OutcomeButtons market={market} onTrade={onTrade} large={featured} /></>
      : <Button label="Tazama matokeo" onPress={() => onSelect(market)} secondary icon="list-outline" />}
    <View style={S.between}><View style={S.row}><View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: C.green }} />
      <T muted style={{ fontSize: 10 }}>Soko la mazoezi</T></View><Pressable onPress={() => onSelect(market)} accessibilityRole="button"><T bold style={{ color: C.green, fontSize: 11 }}>Uchambuzi ↗</T></Pressable></View>
  </Card>;
}

export function Explore({ markets, loading, error, refresh, onSelect, onTrade }: {
  markets: Market[]; loading: boolean; error: string; refresh: () => void;
  onSelect: (m: Market) => void; onTrade: (m: Market, o: OutcomeName) => void;
}) {
  const [query, setQuery] = React.useState('');
  const [category, setCategory] = React.useState('all');
  const filtered = filterMarkets(markets, query, category);
  const featured = !query && category === 'all' ? filtered.find((m) => m.category === 'michezo' && canTrade(m)) : undefined;
  const feed = filtered.filter((m) => m.id !== featured?.id);
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={S.content}
    refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={C.green} colors={[C.green]} />}>
    <View style={S.between}><View style={S.row}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.green }} />
      <Caps color={C.green}>Gundua masoko</Caps></View><Caps color={C.cyan}>Pointi tu • Hakuna pesa</Caps></View>
    <View style={[S.row, { backgroundColor: C.low, borderRadius: 12, paddingHorizontal: 12 }]}>
      <Icon name="search-outline" size={19} /><TextInput accessibilityLabel="Tafuta soko" placeholder="Tafuta soko: Simba, Dola…" placeholderTextColor={C.muted}
        value={query} onChangeText={setQuery} style={[S.input, { flex: 1, backgroundColor: 'transparent', fontSize: 12, paddingHorizontal: 0 }]} />
      {!!query && <Pressable accessibilityLabel="Futa utafutaji" onPress={() => setQuery('')} hitSlop={10}><Icon name="close-circle-outline" size={18} /></Pressable>}
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {categories.map((c) => <Pressable key={c.id} accessibilityRole="button" accessibilityState={{ selected: category === c.id }} onPress={() => setCategory(c.id)}
        style={[S.pill, S.row, { backgroundColor: c.id === category ? C.green : C.low }]}>
        <Icon name={c.icon} color={c.id === category ? C.greenDark : C.muted} size={15} />
        <T bold style={{ fontSize: 10, color: c.id === category ? C.greenDark : C.muted }}>{c.label}</T>
      </Pressable>)}
    </ScrollView>
    {!!error && <Empty title="Masoko hayajapakiwa" detail={error} retry={refresh} />}
    {featured && <MarketCard market={featured} featured onSelect={onSelect} onTrade={onTrade} />}
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {[['MASOKO WAZI', `${markets.length}`, C.green], ['AINA ZA MASOKO', `${new Set(markets.map((m) => m.category)).size}`, C.cyan], ['MALIPO / HISA', '100 PT', C.text]].map(([label, value, color]) =>
        <Card key={label} style={{ flex: 1, padding: 11, borderRadius: 12, gap: 5 }}><Caps>{label}</Caps><T bold style={{ color, fontSize: 18 }}>{value}</T><T muted style={{ fontSize: 9 }}>Mazoezi pekee</T></Card>)}
    </View>
    <View style={S.between}><View style={S.row}><Icon name="flame-outline" color={C.green} size={19} /><T bold>Masoko yanayopatikana</T></View><T muted>{filtered.length}</T></View>
    {!loading && !filtered.length && !error && <Empty title="Hakuna soko lililopatikana" detail="Jaribu jina jingine au chagua aina tofauti." />}
    {feed.map((m) => <MarketCard key={m.id} market={m} onSelect={onSelect} onTrade={onTrade} />)}
    <T muted style={{ textAlign: 'center', fontSize: 10 }}>Siasa haijawezeshwa. Pointi hazina thamani ya fedha.</T>
  </ScrollView>;
}

function HistoryChart({ market }: { market: Market }) {
  const [range, setRange] = React.useState('1W');
  const yesId = book(market, 'YES')?.id;
  const cutoff = Date.now() - (range === '1D' ? 1 : range === '1W' ? 7 : range === '1M' ? 30 : Infinity) * 86400000;
  const points = (market.trades ?? []).filter((t) => t.outcome_id === yesId && new Date(t.created_at).getTime() >= cutoff)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const coords = points.map((t, i) => [10 + i / Math.max(1, points.length - 1) * 300, 145 - t.price * 1.2]);
  const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'} ${x} ${y}`).join(' ');
  return <Card style={{ backgroundColor: C.low }}>
    <Caps>Mwendo wa bei • Ndiyo</Caps>
    <View style={S.between}><T bold style={S.heading}>{points.length ? `${points[points.length - 1].price} PT` : 'Hakuna historia'}</T>
      <View style={[S.row, { gap: 3, backgroundColor: C.card, padding: 3, borderRadius: 8 }]}>
        {['1D', '1W', '1M', 'ZOTE'].map((r) => <Pressable key={r} onPress={() => setRange(r)} accessibilityRole="button" accessibilityState={{ selected: range === r }}
          style={{ padding: 6, borderRadius: 5, backgroundColor: range === r ? C.green : 'transparent' }}><T bold style={{ fontSize: 9, color: range === r ? C.greenDark : C.muted }}>{r}</T></Pressable>)}
      </View>
    </View>
    {!points.length ? <View style={{ height: 120, alignItems: 'center', justifyContent: 'center' }}><Icon name="analytics-outline" color={C.green} size={28} /><T muted>Chati itaonekana baada ya miamala.</T></View>
      : <Svg width="100%" height={160} viewBox="0 0 320 160">
        <Defs><LinearGradient id="area" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={C.green} stopOpacity={0.35} /><Stop offset="1" stopColor={C.green} stopOpacity={0} /></LinearGradient></Defs>
        {[25, 85, 145].map((y) => <Line key={y} x1="0" y1={y} x2="320" y2={y} stroke={C.line} strokeDasharray="3,5" />)}
        {coords.length > 1 && <><Path d={`${line} L ${coords[coords.length - 1][0]} 160 L 10 160 Z`} fill="url(#area)" /><Path d={line} fill="none" stroke={C.green} strokeWidth={2.5} /></>}
        {coords.map(([x, y], i) => <Circle key={i} cx={x} cy={y} r={3} fill={C.green} />)}
      </Svg>}
    <View style={S.between}><Caps>{points.length ? new Date(points[0].created_at).toLocaleDateString() : 'Bei halisi za miamala'}</Caps><Caps color={C.green}>{points.length} miamala</Caps></View>
  </Card>;
}

export function Analytics({ market, loading, error, refresh, onTrade, explore }: {
  market?: Market; loading: boolean; error: string; refresh: () => void;
  onTrade: (m: Market, o: OutcomeName) => void; explore: () => void;
}) {
  if (!market) return <View style={S.content}><Empty title="Chagua soko kuchambua" detail="Fungua soko kutoka Masoko ili kuona bei, maagizo na chanzo." retry={error ? refresh : undefined} /><Button label="Gundua masoko" onPress={explore} /></View>;
  const yes = book(market, 'YES');
  const bids = yes?.bids ?? [];
  const asks = yes?.asks ?? [];
  const shares = (market.trades ?? []).reduce((n, t) => n + t.qty, 0);
  const volume = (market.trades ?? []).reduce((n, t) => n + t.price * t.qty, 0);
  return <ScrollView contentContainerStyle={S.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} colors={[C.green]} />}>
    <View style={S.between}><Caps color={C.cyan}>{categoryLabel(market.category)} • {market.status === 'open' ? 'Wazi' : 'Limemalizika'}</Caps><T muted style={{ fontSize: 11 }}>{remaining(market)}</T></View>
    {!!error && <Empty title="Imeshindikana kusasisha" detail={error} retry={refresh} />}
    <Card><Caps color={C.green}>Uchambuzi wa soko • Mazoezi</Caps><T style={S.title}>{market.question}</T><T muted style={{ fontSize: 11 }}>{market.resolution_source}</T>
      {market.outcome_type === 'binary' ? <><T style={[S.title, { color: C.green, fontSize: 36, lineHeight: 44 }]}>{probability(market) == null ? '—' : `${Math.round(probability(market)!)}%`}</T><ProbabilityBar market={market} /></>
        : <T muted>Soko la matokeo mengi. Biashara haijawezeshwa kwa aina hii.</T>}
    </Card>
    {market.outcome_type === 'binary' && <HistoryChart market={market} />}
    <View style={{ flexDirection: 'row', gap: 10 }}><Card style={{ flex: 1 }}><Caps>Kiasi cha miamala</Caps><T bold style={S.heading}>{fmt(volume)} PT</T><T muted style={{ fontSize: 10 }}>Miamala iliyorekodiwa</T></Card>
      <Card style={{ flex: 1 }}><Caps>Hisa zilizouzwa</Caps><T bold style={[S.heading, { color: C.cyan }]}>{fmt(shares)}</T><T muted style={{ fontSize: 10 }}>{market.trades?.length ?? 0} miamala</T></Card></View>
    <Card style={{ backgroundColor: C.low }}><View style={S.row}><Icon name="list-outline" color={C.green} /><T bold>Kitabu cha maagizo • YES</T></View>
      <View style={S.between}><Caps>Nunua: kiasi / bei</Caps><Caps>Uza: bei / kiasi</Caps></View>
      {!bids.length && !asks.length && <T muted>Hakuna maagizo yanayosubiri.</T>}
      {Array.from({ length: Math.min(5, Math.max(bids.length, asks.length)) }, (_, i) => <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
        <View style={[S.between, { flex: 1, backgroundColor: '#163329', padding: 9, borderRadius: 5 }]}><T>{bids[i] ? fmt(bids[i].qty - bids[i].filled) : '—'}</T><T bold style={{ color: C.green }}>{bids[i]?.price ?? '—'}</T></View>
        <View style={[S.between, { flex: 1, backgroundColor: '#351c29', padding: 9, borderRadius: 5 }]}><T bold style={{ color: C.pink }}>{asks[i]?.price ?? '—'}</T><T>{asks[i] ? fmt(asks[i].qty - asks[i].filled) : '—'}</T></View>
      </View>)}
      <T muted style={{ fontSize: 10 }}>Bei kwa pointi • Kiasi kwa hisa • Vuta chini kusasisha.</T>
    </Card>
    <Card style={{ backgroundColor: C.low }}><View style={S.row}><Icon name="shield-checkmark-outline" color={C.cyan} /><T bold>Chanzo cha utatuzi</T></View>
      <Caps color={C.cyan}>{market.resolution_source}</Caps><T muted>Matokeo yatatatuliwa na msimamizi kwa kutumia chanzo kilichotajwa. Kila hisa iliyoshinda inalipa pointi 100; iliyopoteza inalipa 0.</T>
      <Button label="Fungua chanzo" secondary icon="open-outline" onPress={() => {
        if (/^https?:\/\//i.test(market.resolution_source_url)) Linking.openURL(market.resolution_source_url).catch(() => {});
      }} />
      <T muted style={{ fontSize: 10 }}>Mwisho: {new Date(market.close_at).toLocaleString()}</T>
    </Card>
    <Card><Caps>Miamala ya hivi karibuni</Caps>{!(market.trades ?? []).length && <T muted>Hakuna miamala bado.</T>}
      {[...(market.trades ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5).map((t) => <View key={t.id} style={S.between}>
        <View style={S.row}><Icon name="swap-horizontal" color={C.green} /><T>{market.outcomes.find((o) => o.id === t.outcome_id)?.name} • {t.qty} hisa</T></View><T bold style={{ color: C.green }}>{t.price} PT</T>
      </View>)}</Card>
    <OutcomeButtons market={market} onTrade={onTrade} large />
  </ScrollView>;
}

export function Wallet({ portfolio, loading, error, refresh, onSelect, onCancel, onSignOut }: {
  portfolio?: Portfolio; loading: boolean; error: string; refresh: () => void;
  onSelect: (m: Market) => void; onCancel: (id: string) => Promise<void>; onSignOut: () => void;
}) {
  const [tab, setTab] = React.useState('active');
  const [cancelling, setCancelling] = React.useState('');
  const positions = (portfolio?.positions ?? []).filter((p) => tab === 'active' ? p.sp_markets?.status === 'open' : p.sp_markets?.status !== 'open');
  return <ScrollView contentContainerStyle={S.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} colors={[C.green]} />}>
    <View style={S.between}><T style={S.title}>Pochi ya mazoezi</T><Icon name="wallet-outline" color={C.green} size={26} /></View>
    {!!error && <Empty title="Pochi haijapakiwa" detail={error} retry={refresh} />}
    <Card style={{ backgroundColor: C.high, padding: 20 }}><View style={S.between}><Caps color={C.green}>Pointi za mazoezi</Caps><Icon name="shield-outline" color={C.cyan} /></View>
      <T muted>Salio la pointi</T><View style={[S.row, { alignItems: 'baseline' }]}><T style={[S.title, { fontSize: 36, lineHeight: 46 }]}>{portfolio ? fmt(portfolio.balance) : '—'}</T><T muted>PT</T></View>
      <View style={{ backgroundColor: C.lowest, padding: 14, borderRadius: 10, flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}><Caps>Zinazopatikana</Caps><T bold style={{ color: C.green }}>{portfolio ? fmt(portfolio.available_balance) : '—'} PT</T></View>
        <View style={{ flex: 1, gap: 4 }}><Caps>Zilizofungwa</Caps><T bold style={{ color: C.cyan }}>{portfolio ? fmt(portfolio.locked_balance) : '—'} PT</T></View>
      </View><T muted style={{ fontSize: 11 }}>Pointi hazina thamani ya fedha. Hakuna kuweka au kutoa pesa.</T>
    </Card>
    <View style={[S.row, { padding: 4, borderRadius: 12, backgroundColor: C.lowest }]}>
      {[['active', 'Nafasi zilizopo'], ['settled', 'Zilizotatuliwa']].map(([id, label]) => <Pressable key={id} accessibilityRole="button" onPress={() => setTab(id)} style={{ flex: 1, padding: 11, borderRadius: 8, backgroundColor: tab === id ? C.high : 'transparent' }}>
        <T bold style={{ fontSize: 11, color: tab === id ? C.green : C.muted, textAlign: 'center' }}>{label}</T></Pressable>)}
    </View>
    {!positions.length && <Empty title="Hakuna nafasi hapa bado" detail="Hisa ulizonunua zitaonekana hapa." />}
    {positions.map((p) => <Pressable key={p.id} accessibilityRole="button" onPress={() => onSelect(p.sp_markets)}><Card>
      <View style={S.between}><Caps color={C.cyan}>{categoryLabel(p.sp_markets?.category)}</Caps><Caps color={p.sp_market_outcomes?.name === 'YES' ? C.green : C.pink}>{p.sp_market_outcomes?.name === 'YES' ? 'Ndiyo' : 'Hapana'}</Caps></View>
      <T bold style={{ fontSize: 15 }}>{p.sp_markets?.question}</T>
      <View style={{ flexDirection: 'row', backgroundColor: C.low, padding: 12, borderRadius: 10, gap: 10 }}>
        <View style={{ flex: 1 }}><Caps>Hisa zako</Caps><T bold>{fmt(p.qty)}</T></View><View style={{ flex: 1 }}><Caps>Bei wastani</Caps><T bold>{p.avg_price} PT</T></View>
        <View style={{ flex: 1 }}><Caps>Gharama</Caps><T bold style={{ color: C.green }}>{fmt(p.qty * p.avg_price)} PT</T></View>
      </View><T muted style={{ fontSize: 10 }}>Hali: {p.sp_markets?.status} • Tazama uchambuzi ↗</T>
    </Card></Pressable>)}
    <T bold style={S.heading}>Maagizo yanayosubiri</T>
    {!(portfolio?.open_orders ?? []).length && <T muted>Hakuna maagizo wazi.</T>}
    {(portfolio?.open_orders ?? []).map((o) => <Card key={o.id}><View style={S.between}><T>{o.side === 'buy' ? 'Nunua' : 'Uza'} • {o.qty - o.filled_qty} hisa @ {o.price} PT</T><Icon name="time-outline" color={C.cyan} /></View>
      <Button label="Ghairi agizo" secondary loading={cancelling === o.id} disabled={!!cancelling} onPress={async () => {
        setCancelling(o.id); try { await onCancel(o.id); } finally { setCancelling(''); }
      }} /></Card>)}
    <Card style={{ backgroundColor: C.low }}><Caps>Historia ya biashara</Caps>
      {!(portfolio?.trades ?? []).length && <T muted>Hakuna miamala bado.</T>}
      {(portfolio?.trades ?? []).slice(0, 10).map((t) => <View key={t.id} style={S.between}><T muted style={{ fontSize: 11 }}>{new Date(t.created_at).toLocaleDateString()} • {t.qty} hisa</T><T bold>{t.price} PT</T></View>)}
    </Card>
    <Button label="Toka kwenye akaunti" onPress={onSignOut} secondary icon="log-out-outline" />
  </ScrollView>;
}
