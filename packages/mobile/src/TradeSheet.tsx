import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, errorMessage } from './api';
import { canTrade, fmt, Market, orderEstimate, OutcomeName, quote } from './market';
import { Button, C, Caps, Card, Icon, S, T } from './ui';

export function TradeSheet({ market, initialOutcome, balance, close, completed, wallet }: {
  market: Market; initialOutcome: OutcomeName; balance?: number; close: () => void;
  completed: () => void; wallet: () => void;
}) {
  const [outcome, setOutcome] = React.useState(initialOutcome);
  const [mode, setMode] = React.useState<'quote' | 'limit'>('quote');
  const [budget, setBudget] = React.useState('100');
  const [limit, setLimit] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [result, setResult] = React.useState<{ order: { id: string; filled_qty: number; qty: number; status: string }; trades: { qty: number; price: number }[] }>();
  const bestAsk = quote(market, outcome);
  const price = mode === 'quote' ? bestAsk ?? 0 : Number(limit);
  const estimate = orderEstimate(Number(budget), price);
  const affordable = balance != null && estimate.cost <= balance;
  const valid = estimate.qty > 0 && affordable && canTrade(market);

  async function submit() {
    if (busy || !valid) return;
    setError(''); setBusy(true);
    try {
      const res = await api.post('/orders', { market_id: market.id, outcome, side: 'buy', price, qty: estimate.qty });
      if (!res.data.success || !res.data.data?.order) throw new Error('Agizo halijathibitishwa.');
      setResult(res.data.data);
      completed();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }

  return <Modal transparent animationType="slide" visible onRequestClose={() => !busy && close()}>
    <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#000000b8' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable accessibilityLabel="Funga agizo" onPress={() => !busy && close()} style={{ flex: 1, minHeight: 30 }} />
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: C.high, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '92%' }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16 }}>
          <View style={{ width: 36, height: 4, borderRadius: 3, backgroundColor: '#526058', alignSelf: 'center' }} />
          <View style={S.between}><View><Caps color={C.green}>Kesho • Paper trading</Caps><T style={S.heading}>{result ? 'Agizo limepokelewa' : 'Kamilisha agizo'}</T></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Funga" disabled={busy} onPress={close} hitSlop={12}><Icon name="close-circle-outline" size={26} /></Pressable></View>
          {result ? <>
            <View style={{ alignItems: 'center', paddingVertical: 10 }}><Icon name="checkmark-circle-outline" size={58} color={C.green} /></View>
            <T bold>{market.question}</T>
            <Card><Caps color={C.green}>{outcome === 'YES' ? 'Ndiyo' : 'Hapana'}</Caps>
              <T>Hisa zilizoagizwa: {fmt(result.order.qty)}</T><T>Hisa zilizojazwa: {fmt(result.order.filled_qty)}</T>
              <T>Gharama iliyotekelezwa: {fmt(result.trades.reduce((sum, t) => sum + t.price * t.qty, 0))} PT</T>
              <T muted>{result.order.status === 'filled' ? 'Agizo limejazwa kikamilifu.' : 'Kiasi kilichobaki kinasubiri kwenye kitabu cha maagizo. Unaweza kukighairi kwenye Pochi.'}</T>
              <Caps>Rejea: {result.order.id.slice(0, 12)}</Caps>
            </Card>
            <Button label="Tazama pochi yako" onPress={wallet} icon="wallet-outline" />
          </> : <>
            <T bold numberOfLines={3}>{market.question}</T>
            <View style={{ flexDirection: 'row', gap: 8 }}>{(['YES', 'NO'] as const).map((o) => <Pressable key={o} accessibilityRole="button" accessibilityLabel={o === 'YES' ? 'Chagua Ndiyo' : 'Chagua Hapana'}
              onPress={() => { setOutcome(o); setError(''); }} style={{ flex: 1, padding: 14, gap: 7, borderRadius: 12, backgroundColor: outcome === o ? (o === 'YES' ? C.green : C.pink) : C.card }}>
              <T bold style={{ color: outcome === o ? C.greenDark : C.text }}>{o === 'YES' ? 'Ndiyo' : 'Hapana'} {outcome === o ? '✓' : ''}</T>
              <T bold style={{ color: outcome === o ? C.greenDark : C.muted }}>{quote(market, o) ?? '—'} PT / hisa</T>
            </Pressable>)}</View>
            <View style={[S.row, { backgroundColor: C.low, padding: 4, borderRadius: 12 }]}>{([['quote', 'Bei ya sasa'], ['limit', 'Weka bei yako']] as const).map(([id, label]) =>
              <Pressable key={id} accessibilityRole="button" onPress={() => { setMode(id); setError(''); if (id === 'limit' && !limit) setLimit(String(bestAsk ?? 50)); }}
                style={{ flex: 1, padding: 10, borderRadius: 8, backgroundColor: mode === id ? C.line : 'transparent' }}><T bold style={{ textAlign: 'center', fontSize: 11 }}>{label}</T></Pressable>)}</View>
            {mode === 'limit' && <><Caps>Bei kwa hisa (1–99 PT)</Caps><TextInput accessibilityLabel="Bei ya limit" style={S.input} keyboardType="number-pad" value={limit} onChangeText={(v) => setLimit(v.replace(/[^0-9]/g, ''))} maxLength={2} /></>}
            <Card><View style={S.between}><Caps>Bajeti ya pointi</Caps><T bold style={{ color: C.green, fontSize: 11 }}>Salio: {balance == null ? '—' : fmt(balance)} PT</T></View>
              <View style={[S.row, { backgroundColor: C.lowest, borderRadius: 12, paddingHorizontal: 14 }]}><T bold style={{ color: C.muted }}>PT</T>
                <TextInput accessibilityLabel="Kiasi cha pointi" value={budget} keyboardType="number-pad" onChangeText={(v) => { setBudget(v.replace(/[^0-9]/g, '')); setError(''); }} maxLength={9}
                  style={[S.input, { flex: 1, fontFamily: 'JakartaExtraBold', fontSize: 28, lineHeight: 38 }]} />
              </View>
              <View style={S.row}>{[100, 500, 1000].map((v) => <Pressable key={v} accessibilityRole="button" onPress={() => setBudget(String(Number(budget) + v))} style={[S.pill, { flex: 1, paddingHorizontal: 5 }]}><T bold style={{ fontSize: 11, textAlign: 'center' }}>+{fmt(v)}</T></Pressable>)}
                <Pressable accessibilityRole="button" accessibilityLabel="Pointi zote" onPress={() => setBudget(String(balance ?? 0))} style={[S.pill, { flex: 1, paddingHorizontal: 5 }]}><T bold style={{ color: C.green, fontSize: 11, textAlign: 'center' }}>MAX</T></Pressable></View>
            </Card>
            <Card style={{ backgroundColor: C.low }}>
              <View style={S.between}><T muted>Idadi ya hisa</T><T bold>{fmt(estimate.qty)} @ {price || '—'} PT</T></View>
              <View style={S.between}><T muted>Gharama ya juu</T><T>{fmt(estimate.cost)} PT</T></View>
              <View style={S.between}><T muted>Pointi zisizotumika</T><T>{fmt(estimate.remainder)} PT</T></View>
              <View style={S.divider} />
              <View style={S.between}><T muted>Malipo ikiwa itashinda</T><T bold>{fmt(estimate.payout)} PT</T></View>
              <View style={[S.between, { backgroundColor: '#173c30', padding: 12, borderRadius: 10 }]}><T bold style={{ color: C.green }}>Faida ikiwa itashinda</T><T bold style={{ color: C.green }}>+{fmt(estimate.profit)} PT</T></View>
            </Card>
            <T muted style={{ fontSize: 11 }}>Kila hisa inalipa 100 PT ikishinda, 0 ikipoteza. Maagizo yanaweza kujazwa kwa sehemu; pointi za kiasi kinachosubiri zinafungwa. Haya si malipo ya fedha.</T>
            {!canTrade(market) && <T style={{ color: C.pink }}>Soko hili halipokei maagizo.</T>}
            {mode === 'quote' && bestAsk == null && <T style={{ color: C.pink }}>Hakuna bei ya kuuza. Weka agizo la bei yako.</T>}
            {balance == null && <T style={{ color: C.pink }}>Pakia pochi ili kuthibitisha salio kwanza.</T>}
            {balance != null && !affordable && <T style={{ color: C.pink }}>Pointi hazitoshi kwa agizo hili.</T>}
            {!!error && <T accessibilityRole="alert" style={{ color: C.pink }}>{error}</T>}
            <Button testID="confirm-paper-order" label={`Thibitisha ${outcome === 'YES' ? 'Ndiyo' : 'Hapana'} • ${fmt(estimate.cost)} PT`} icon="flash-outline" disabled={!valid} loading={busy} onPress={submit} />
          </>}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  </Modal>;
}
