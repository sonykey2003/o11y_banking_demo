import React, {useState} from 'react';
import {Alert, Pressable, ScrollView, Switch, Text, View} from 'react-native';
import {api, demoFaultHeaders} from '../api/client';
import {useTheme} from '../theme/ThemeContext';
import {useNav} from '../navigation/NavContext';
import {useAuth} from '../state/AuthContext';
import {Card, LinkButton, ScreenHeader} from '../components/ui';
import {telemetry} from '../telemetry';

function Row({label, onPress, color}: {label: string; onPress: () => void; color: string}) {
  return (
    <Pressable
      onPress={onPress}
      style={{borderWidth: 1, borderColor: color, borderRadius: 10, padding: 12, marginBottom: 8}}>
      <Text style={{color, fontWeight: '600', textAlign: 'center'}}>{label}</Text>
    </Pressable>
  );
}

export function DemoControlsScreen() {
  const {brand} = useTheme();
  const {navigate} = useNav();
  const {user} = useAuth();
  const [clientLatency, setClientLatency] = useState(false);
  const [clientError, setClientError] = useState(false);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      Alert.alert('Done', ok);
    } catch (e) {
      Alert.alert('Result', (e as Error).message);
    }
  };

  const toggleClientLatency = (v: boolean) => {
    setClientLatency(v);
    if (v) demoFaultHeaders['x-fault-latency-ms'] = '1500';
    else delete demoFaultHeaders['x-fault-latency-ms'];
  };
  const toggleClientError = (v: boolean) => {
    setClientError(v);
    if (v) demoFaultHeaders['x-fault-error-rate'] = '0.5';
    else delete demoFaultHeaders['x-fault-error-rate'];
  };

  return (
    <ScrollView style={{backgroundColor: brand.colors.background}} contentContainerStyle={{padding: 20, paddingTop: 60}}>
      <ScreenHeader title="Demo controls" subtitle="Break things on purpose for the APM / RUM demo." />

      <Card>
        <Text style={{fontWeight: '800', color: brand.colors.text, marginBottom: 10}}>Backend faults (all services)</Text>
        <Row color={brand.colors.text} label="Add 1.5s latency" onPress={() => run(() => api.setFault({service: 'all', latencyMs: 1500}), 'Latency injected across services.')} />
        <Row color={brand.colors.text} label="Add 3s latency" onPress={() => run(() => api.setFault({service: 'all', latencyMs: 3000}), '3s latency injected.')} />
        <Row color="#B00020" label="Fail 50% of requests" onPress={() => run(() => api.setFault({service: 'all', errorRate: 0.5}), '50% error rate injected.')} />
        <Row color="#B00020" label="Fail 100% of requests" onPress={() => run(() => api.setFault({service: 'all', errorRate: 1}), '100% error rate injected.')} />
        <Row color={brand.colors.primary} label="Clear all backend faults" onPress={() => run(() => api.clearFault(), 'All backend faults cleared.')} />
      </Card>

      <Card>
        <Text style={{fontWeight: '800', color: brand.colors.text, marginBottom: 10}}>Per-request fault headers (from app)</Text>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
          <Text style={{color: brand.colors.text}}>Send 1.5s latency header</Text>
          <Switch value={clientLatency} onValueChange={toggleClientLatency} />
        </View>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
          <Text style={{color: brand.colors.text}}>Send 50% error header</Text>
          <Switch value={clientError} onValueChange={toggleClientError} />
        </View>
      </Card>

      <Card>
        <Text style={{fontWeight: '800', color: brand.colors.text, marginBottom: 10}}>Client-side RUM events</Text>
        <Row color={brand.colors.text} label="Report error → RUM custom event" onPress={() => { telemetry.reportError(new Error('Demo reported error')); Alert.alert('Sent', 'Emitted an app.error custom event to RUM (rum.custom_event.count).'); }} />
        <Row color={brand.colors.text} label="Unhandled promise rejection → custom event" onPress={() => {
          // Reject then report to RUM and catch, so it can't escalate and kill the app.
          Promise.reject(new Error('Demo unhandled rejection')).catch((err) => telemetry.reportError(err as Error));
          Alert.alert('Sent', 'Rejection reported to RUM as an app.error custom event.');
        }} />
        <Row color="#B00020" label="Crash app (fatal JS error → crash report)" onPress={() => {
          // The ONLY way to feed rum.crash.count with this SDK: a genuinely uncaught
          // fatal error the native crash module captures. Explicitly destructive.
          throw new Error('Demo fatal crash');
        }} />
        <Row color={brand.colors.text} label="Failed network call" onPress={() => run(() => api.transactions('DOES-NOT-EXIST'), 'unexpected success')} />
        <Row color={brand.colors.text} label="Freeze JS thread (2s)" onPress={() => { const end = Date.now() + 2000; while (Date.now() < end) {} }} />
      </Card>

      <LinkButton label="Back" onPress={() => navigate(user ? 'dashboard' : 'login')} />
    </ScrollView>
  );
}
