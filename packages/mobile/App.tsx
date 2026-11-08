import React from 'react';
import { ActivityIndicator, Alert, BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts, PlusJakartaSans_400Regular, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans';
import { api, errorMessage } from './src/api';
import { canTrade, fmt, Market, OutcomeName, Portfolio } from './src/market';
import { Analytics, Explore, Wallet } from './src/screens';
import { TradeSheet } from './src/TradeSheet';
import { Button, C, Caps, Card, Empty, Icon, IconName, S, T } from './src/ui';

type Tab = 'markets' | 'detail' | 'trade' | 'wallet';
const tabs: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'markets', label: 'Masoko', icon: 'trending-up-outline' },
  { id: 'detail', label: 'Detail', icon: 'analytics-outline' },
  { id: 'trade', label: 'Trade', icon: 'swap-horizontal-outline' },
  { id: 'wallet', label: 'Pochi', icon: 'wallet-outline' },
];

function Login({ signedIn }: { signedIn: (token: string) => void }) {
  const [phone, setPhone] = React.useState('');
  const [code, setCode] = React.useState('');
  const [step, setStep] = React.useState<'phone' | 'otp'>('phone');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  async function submit() {
    setError(''); setBusy(true);
    try {
      if (step === 'phone') {
        if (!/^255\d{9}$/.test(phone)) throw new Error('Weka namba katika muundo wa 2557XXXXXXXX.');
        const res = await api.post('/auth/send-otp', { phone_number: phone });
        if (__DEV__ && res.data.code) setCode(res.data.code);
        setStep('otp');
      } else {
        const res = await api.post('/auth/verify-otp', { phone_number: phone, code });
        await AsyncStorage.setItem('token', res.data.token);
        signedIn(res.data.token);
      }
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[S.content, { flexGrow: 1, justifyContent: 'center', gap: 24 }]}>
      <View style={{ width: 66, height: 66, borderRadius: 20, backgroundColor: '#16392e', alignItems: 'center', justifyContent: 'center' }}><Icon name="trending-up" color={C.green} size={36} /></View>
      <View style={{ gap: 10 }}><Caps color={C.green}>Karibu Kesho</Caps><T style={[S.title, { fontSize: 34, lineHeight: 43 }]}>Kesho inaanza{ '\n' }na mtazamo wako.</T><T muted>Gundua masoko. Jifunze kutabiri.{ '\n' }Fanya mazoezi bila pesa halisi.</T></View>
      <Card><Caps>{step === 'phone' ? 'Ingia kwa simu' : 'Thibitisha namba yako'}</Caps>
        <TextInput accessibilityLabel={step === 'phone' ? 'Namba ya simu' : 'Kodi ya OTP'} placeholder={step === 'phone' ? '2557XXXXXXXX' : '000000'} placeholderTextColor={C.muted}
          style={S.input} keyboardType="number-pad" value={step === 'phone' ? phone : code} maxLength={step === 'phone' ? 12 : 6}
          onChangeText={step === 'phone' ? setPhone : setCode} />
        {step === 'otp' && <T muted style={{ fontSize: 11 }}>{__DEV__ ? 'Hali ya maendeleo: kodi ya majaribio imejazwa.' : 'Weka kodi uliyopokea.'}</T>}
        {!!error && <T accessibilityRole="alert" style={{ color: C.pink }}>{error}</T>}
        <Button label={step === 'phone' ? 'Endelea →' : 'Thibitisha na uingie'} onPress={submit} loading={busy} />
        {step === 'otp' && <Button label="Badilisha namba" secondary disabled={busy} onPress={() => { setStep('phone'); setCode(''); setError(''); }} />}
      </Card>
      <T muted style={{ fontSize: 10 }}>PAPER TRADING TU • Pointi hazina thamani ya fedha. Hakuna kuweka pesa, kutoa pesa au malipo ya simu.</T>
    </ScrollView>
  </KeyboardAvoidingView>;
}

function MarketsApp({ signOut }: { signOut: () => void }) {
  const [tab, setTab] = React.useState<Tab>('markets');
  const [markets, setMarkets] = React.useState<Market[]>([]);
  const [market, setMarket] = React.useState<Market>();
  const [portfolio, setPortfolio] = React.useState<Portfolio>();
  const [marketsLoading, setMarketsLoading] = React.useState(false);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [walletLoading, setWalletLoading] = React.useState(false);
  const [marketsError, setMarketsError] = React.useState('');
  const [detailError, setDetailError] = React.useState('');
  const [walletError, setWalletError] = React.useState('');
  const [sheet, setSheet] = React.useState<{ market: Market; outcome: OutcomeName }>();
  const selectedId = React.useRef('');

  async function loadMarkets() {
    setMarketsLoading(true); setMarketsError('');
    try { setMarkets((await api.get('/markets')).data.data ?? []); }
    catch (e) { setMarketsError(errorMessage(e)); } finally { setMarketsLoading(false); }
  }
  async function loadPortfolio() {
    setWalletLoading(true); setWalletError('');
    try { setPortfolio((await api.get('/portfolio')).data.data); }
    catch (e) { setWalletError(errorMessage(e)); setPortfolio(undefined); } finally { setWalletLoading(false); }
  }
  async function loadDetail(id: string) {
    selectedId.current = id; setDetailLoading(true); setDetailError('');
    try {
      const data = (await api.get(`/markets/${id}`)).data.data;
      if (selectedId.current === id) setMarket(data);
    } catch (e) { if (selectedId.current === id) setDetailError(errorMessage(e)); }
    finally { if (selectedId.current === id) setDetailLoading(false); }
  }
  React.useEffect(() => { loadMarkets(); loadPortfolio(); }, []);
  React.useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (tab !== 'markets') { setTab('markets'); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [tab]);

  function select(m: Market) { setMarket(m); setTab('detail'); loadDetail(m.id); }
  async function openTrade(m: Market, outcome: OutcomeName) {
    setDetailError('');
    try {
      const fresh: Market = (await api.get(`/markets/${m.id}`)).data.data;
      if (!canTrade(fresh)) { Alert.alert('Soko limefungwa', 'Soko hili halipokei maagizo mapya ya mazoezi.'); return; }
      setMarket(fresh); selectedId.current = fresh.id;
      await loadPortfolio();
      setSheet({ market: fresh, outcome });
    } catch (e) { Alert.alert('Hitilafu', errorMessage(e)); }
  }
  function navigate(next: Tab) {
    setTab(next);
    if (next === 'wallet') loadPortfolio();
    if (next === 'detail' && market) loadDetail(market.id);
  }
  function completed() {
    loadPortfolio(); loadMarkets();
    if (market) loadDetail(market.id);
  }
  return <>
    <View style={{ height: 68, paddingHorizontal: 16, backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: '#1c242c', ...S.between }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Kesho Masoko" onPress={() => setTab('markets')} style={S.row}>
        <View style={{ backgroundColor: C.green, borderRadius: 10, width: 30, height: 32, alignItems: 'center', justifyContent: 'center' }}><Icon name="trending-up" color={C.greenDark} size={23} /></View>
        <T style={[S.heading, { fontSize: 23 }]}>Kesho<T style={{ color: C.green }}>.</T></T>
      </Pressable>
      <View style={S.row}><Pressable onPress={() => navigate('wallet')} accessibilityRole="button" accessibilityLabel="Salio la pointi" style={[S.pill, S.row, { paddingHorizontal: 10 }]}>
        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: C.green }} /><T bold style={{ fontSize: 11 }}>{portfolio ? fmt(portfolio.available_balance) : '—'} PT</T>
      </Pressable><View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#173c35', alignItems: 'center', justifyContent: 'center' }}><Icon name="person-outline" size={16} color={C.green} /></View></View>
    </View>
    <View style={{ flex: 1 }}>
      {tab === 'markets' && <Explore markets={markets} loading={marketsLoading} error={marketsError} refresh={loadMarkets} onSelect={select} onTrade={openTrade} />}
      {tab === 'detail' && <Analytics market={market} loading={detailLoading} error={detailError} refresh={() => market && loadDetail(market.id)} onTrade={openTrade} explore={() => setTab('markets')} />}
      {tab === 'wallet' && <Wallet portfolio={portfolio} loading={walletLoading} error={walletError} refresh={loadPortfolio} onSelect={select} onSignOut={signOut}
        onCancel={async (id) => { try { await api.delete(`/orders/${id}`); completed(); } catch (e) { Alert.alert('Hitilafu', errorMessage(e)); } }} />}
      {tab === 'trade' && <ScrollView contentContainerStyle={S.content}><Caps color={C.green}>Biashara ya mazoezi</Caps><T style={S.title}>Mtazamo wako,{ '\n' }agizo lako.</T>
        <T muted>Chagua soko, kagua bei, kisha thibitisha agizo kwa pointi. Malipo ni hadi 100 PT kwa hisa iliyoshinda.</T>
        {market && canTrade(market) && <Card><Caps>Soko ulilochagua</Caps><T bold>{market.question}</T><Button label="Fungua agizo" icon="swap-horizontal-outline" onPress={() => openTrade(market, 'YES')} /></Card>}
        {markets.filter((m) => canTrade(m)).slice(0, 6).map((m) => <Card key={m.id}><T bold>{m.question}</T><Button label="Chagua na uagize" secondary onPress={() => openTrade(m, 'YES')} /></Card>)}
        {!markets.length && <Empty title="Hakuna soko lililopakiwa" retry={loadMarkets} />}
      </ScrollView>}
    </View>
    <View style={{ flexDirection: 'row', backgroundColor: C.lowest, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#20262d' }}>
      {tabs.map((item) => <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: tab === item.id }} onPress={() => navigate(item.id)}
        style={{ flex: 1, alignItems: 'center', gap: 3, minHeight: 48 }}>
        <View style={{ width: 44, height: 28, borderRadius: 20, backgroundColor: tab === item.id ? '#17372d' : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Icon name={item.icon} size={21} color={tab === item.id ? C.green : C.muted} /></View>
        <Caps color={tab === item.id ? C.green : C.muted}>{item.label}</Caps>
      </Pressable>)}
    </View>
    {sheet && <TradeSheet key={`${sheet.market.id}:${sheet.outcome}`} market={sheet.market} initialOutcome={sheet.outcome} balance={portfolio?.available_balance}
      close={() => setSheet(undefined)} completed={completed} wallet={() => { setSheet(undefined); navigate('wallet'); }} />}
  </>;
}

export default function App() {
  const [token, setToken] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);
  const [fonts, fontError] = useFonts({ Jakarta: PlusJakartaSans_400Regular, JakartaBold: PlusJakartaSans_700Bold, JakartaExtraBold: PlusJakartaSans_800ExtraBold });
  React.useEffect(() => { AsyncStorage.getItem('token').then(setToken).finally(() => setReady(true)); }, []);
  return <SafeAreaProvider><StatusBar barStyle="light-content" backgroundColor={C.bg} />
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: C.bg }}>
      {!ready || (!fonts && !fontError) ? <ActivityIndicator color={C.green} style={{ flex: 1 }} />
        : token ? <MarketsApp signOut={async () => { await AsyncStorage.removeItem('token'); setToken(null); }} /> : <Login signedIn={setToken} />}
    </SafeAreaView>
  </SafeAreaProvider>;
}
