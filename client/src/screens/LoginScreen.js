import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API from '../api/client';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert('שגיאה', 'נא למלא אימייל וסיסמה');
      return;
    }

    setLoading(true);
    const endpoint = isRegistering ? '/auth/register' : '/auth/login';

    try {
      const response = await API.post(endpoint, { email, password });
      
      // אם זו הרשמה מוצלחת, אפשר להתחבר מיד או לבקש להתחבר
      if (isRegistering) {
        Alert.alert('הצלחה', 'המשתמש נוצר בהצלחה! מתחבר...');
        // נבצע התחברות מיד לאחר הרשמה מוצלחת
        const loginResponse = await API.post('/auth/login', { email, password });
        await AsyncStorage.setItem('token', loginResponse.data.token);
      } else {
        await AsyncStorage.setItem('token', response.data.token);
      }

      navigation.replace('Dashboard');
    } catch (error) {
      Alert.alert('שגיאה', error.response?.data?.error || 'אירעה שגיאה בתהליך');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ניהול חשבונות וחכמת מיילים</Text>
      <Text style={styles.subtitle}>{isRegistering ? 'יצירת חשבון חדש' : 'התחברות למערכת'}</Text>

      <TextInput
        style={styles.input}
        placeholder="אימייל"
        placeholderTextColor="#888"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <TextInput
        style={styles.input}
        placeholder="סיסמה"
        placeholderTextColor="#888"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity style={styles.button} onPress={handleAuth} disabled={loading}>
        <Text style={styles.buttonText}>
          {loading ? 'טוען...' : (isRegistering ? 'הירשם' : 'התחבר')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setIsRegistering(!isRegistering)}>
        <Text style={styles.switchText}>
          {isRegistering ? 'כבר יש לך חשבון? התחבר כאן' : 'אין לך חשבון עדיין? לחץ כאן להרשמה'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#f9f9f9' },
  title: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 5, color: '#333' },
  subtitle: { fontSize: 16, textAlign: 'center', marginBottom: 30, color: '#666' },
  input: { backgroundColor: '#fff', padding: 15, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#ddd', fontSize: 16 },
  button: { backgroundColor: '#007AFF', padding: 15, borderRadius: 8, alignItems: 'center', marginBottom: 15 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  switchText: { textAlign: 'center', color: '#007AFF', fontSize: 14, marginTop: 10 },
});