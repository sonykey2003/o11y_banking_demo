import React, {useState} from 'react';
import {Text, View} from 'react-native';
import {useTheme} from '../theme/ThemeContext';
import {useNav} from '../navigation/NavContext';
import {PrimaryButton, TopBar} from '../components/ui';
import {SCAN_MERCHANT} from '../data/content';
import {telemetry} from '../telemetry';

// No camera: the demo simulates reading a merchant QR code, then hands the amount to
// Transfer so the payment still runs through the real backend (and APM).
export function ScanPayScreen() {
  const {brand} = useTheme();
  const {navigate, back} = useNav();
  const [scanning, setScanning] = useState(false);

  const simulateScan = () => {
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      telemetry.trackEvent('qr_scan', {'bank.qr.merchant': SCAN_MERCHANT.name, 'bank.transfer.amount': SCAN_MERCHANT.amount});
      navigate('transfer', {amount: SCAN_MERCHANT.amount.toFixed(2), payee: SCAN_MERCHANT.name, entry: 'scan'});
    }, 900);
  };

  const corner = (pos: object) => (
    <View style={[{position: 'absolute', width: 36, height: 36, borderColor: '#FFFFFF'}, pos]} />
  );

  return (
    <View style={{flex: 1, backgroundColor: '#111318'}}>
      <TopBar title="Scan & Pay" onBack={back} />
      <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24}}>
        <View style={{width: 240, height: 240, alignItems: 'center', justifyContent: 'center'}}>
          {corner({top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 12})}
          {corner({top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 12})}
          {corner({bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 12})}
          {corner({bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 12})}
          <Text style={{color: '#FFFFFF', fontSize: 64, opacity: scanning ? 1 : 0.35}}>⌗</Text>
        </View>
        <Text style={{color: '#FFFFFF', marginTop: 24, textAlign: 'center', opacity: 0.8}}>
          {scanning ? 'Reading QR code…' : 'Align the QR code within the frame'}
        </Text>
        <Text style={{color: '#FFFFFF', marginTop: 6, fontSize: 12, textAlign: 'center', opacity: 0.5}}>
          Camera is simulated in this demo.
        </Text>
      </View>
      <View style={{padding: 20, backgroundColor: brand.colors.surface}}>
        <PrimaryButton label="Simulate scan" onPress={simulateScan} loading={scanning} />
      </View>
    </View>
  );
}
