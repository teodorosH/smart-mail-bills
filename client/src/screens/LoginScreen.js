import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { Feather } from '@expo/vector-icons';
import API from '../api/client';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [language, setLanguage] = useState('he');
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);

  const isHe = language === 'he';

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert(
        isHe ? 'שגיאה' : 'Error',
        isHe ? 'נא למלא אימייל וסיסמה' : 'Please fill in email and password'
      );
      return;
    }

    setLoading(true);

    try {
      if (isRegistering) {
        // 1️⃣ תהליך הרשמה
        await API.post('/auth/register', { email, password, language });

        Alert.alert(
          isHe ? 'ההרשמה הושלמה!' : 'Registration Successful!',
          isHe ? 'החשבון נוצר בהצלחה. כעת תוכל להתחבר למערכת.' : 'Account created successfully. Please log in.'
        );

        // העברה למצב התחברות ואיפוס השדות
        setIsRegistering(false);
        setPassword('');
      } else {
        // 2️⃣ תהליך התחברות
    // בתוך handleAuth ב-LoginScreen.js:
    const response = await API.post('/auth/login', { email, password });
    const token = response.data.token;

    const tenMinutesFromNow = Date.now() + 10 * 60 * 1000;

    await AsyncStorage.setItem('token', token);
    await AsyncStorage.setItem('sessionExpiry', tenMinutesFromNow.toString());
    await AsyncStorage.setItem('userLanguage', response.data.user?.language || 'he');

    // רק לאחר שמירת ה-AsyncStorage עוברים מסך!
    navigation.replace('Dashboard');
      }
    } catch (error) {
      Alert.alert(
        isHe ? 'שגיאה' : 'Error',
        error.response?.data?.error || (isHe ? 'אירעה שגיאה בתהליך' : 'An error occurred')
      );
    } finally {
      setLoading(false);
    }
  };

  // התחברות ישירה דרך Google למי שמעוניין
  const handleGoogleLogin = async () => {
    try {
      const redirectUri = AuthSession.makeRedirectUri({
        scheme: 'smartmailbills',
        path: 'dashboard'
      });

      const response = await API.get('/auth/google/url');

      const result = await WebBrowser.openAuthSessionAsync(
        response.data.url,
        redirectUri
      );

      if (result.type === 'success' && result.url) {
        const parsedUrl = new URL(result.url);
        const userEmail = parsedUrl.searchParams.get('email');
        const token = parsedUrl.searchParams.get('token');
        const userLang = parsedUrl.searchParams.get('lang');
        const tenMinutesFromNow = Date.now() + 10 * 60 * 1000;
        
        if (token) await AsyncStorage.setItem('token', token);
        if (userEmail) await AsyncStorage.setItem('userEmail', userEmail);
        if (userLang) await AsyncStorage.setItem('userLanguage', userLang);
        await AsyncStorage.setItem('sessionExpiry', tenMinutesFromNow.toString());
        if (userEmail) await AsyncStorage.setItem('userEmail', userEmail);    
        await AsyncStorage.setItem('googleConnected', 'true');

        navigation.replace('Dashboard');
      }
    } catch (error) {
      console.error('Google Auth Error', error);
      Alert.alert(
        isHe ? 'שגיאה' : 'Error',
        isHe ? 'לא ניתן להתחבר דרך גוגל' : 'Failed to connect via Google'
      );
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {isHe ? 'ניהול חשבונות וחכמת מיילים' : 'Smart Email & Invoice Management'}
      </Text>
      <Text style={styles.subtitle}>
        {isRegistering
          ? (isHe ? 'יצירת חשבון חדש' : 'Create New Account')
          : (isHe ? 'התחברות למערכת' : 'System Login')}
      </Text>

      {/* בורר שפה */}
      <View style={styles.languageContainer}>
        <Text style={styles.languageLabel}>
          {isHe ? 'שפת ממשק:' : 'Language:'}
        </Text>
        <View style={styles.languageButtonsRow}>
          <TouchableOpacity
            style={[styles.langButton, language === 'he' && styles.langButtonActive]}
            onPress={() => setLanguage('he')}
          >
            <Text style={[styles.langText, language === 'he' && styles.langTextActive]}>עברית</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.langButton, language === 'en' && styles.langButtonActive]}
            onPress={() => setLanguage('en')}
          >
            <Text style={[styles.langText, language === 'en' && styles.langTextActive]}>English</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* כפתור התחברות מהירה מגוגל */}
      <TouchableOpacity style={styles.googleLoginButton} onPress={handleGoogleLogin}>
        <Feather name="log-in" size={18} color="#fff" style={{ marginRight: 8 }} />
        <Text style={styles.googleButtonText}>
          {isHe ? 'התחבר באמצעות Google' : 'Sign in with Google'}
        </Text>
      </TouchableOpacity>

      <View style={styles.dividerContainer}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>{isHe ? 'או' : 'OR'}</Text>
        <View style={styles.dividerLine} />
      </View>

      <TextInput
        style={[styles.input, { textAlign: isHe ? 'right' : 'left' }]}
        placeholder={isHe ? 'אימייל' : 'Email'}
        placeholderTextColor="#888"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <TextInput
        style={[styles.input, { textAlign: isHe ? 'right' : 'left' }]}
        placeholder={isHe ? 'סיסמה' : 'Password'}
        placeholderTextColor="#888"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity style={styles.button} onPress={handleAuth} disabled={loading}>
        <Text style={styles.buttonText}>
          {loading
            ? (isHe ? 'טוען...' : 'Loading...')
            : (isRegistering
                ? (isHe ? 'הירשם' : 'Sign Up')
                : (isHe ? 'התחבר' : 'Log In'))}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setIsRegistering(!isRegistering)}>
        <Text style={styles.switchText}>
          {isRegistering
            ? (isHe ? 'כבר יש לך חשבון? התחבר כאן' : 'Already have an account? Log in here')
            : (isHe ? 'אין לך חשבון עדיין? לחץ כאן להרשמה' : "Don't have an account? Register here")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#f9f9f9' },
  title: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 5, color: '#333' },
  subtitle: { fontSize: 16, textAlign: 'center', marginBottom: 15, color: '#666' },
  
  languageContainer: { marginBottom: 15, alignItems: 'center' },
  languageLabel: { fontSize: 13, color: '#555', marginBottom: 6 },
  languageButtonsRow: { flexDirection: 'row', backgroundColor: '#e0e0e0', borderRadius: 8, padding: 3 },
  langButton: { paddingVertical: 5, paddingHorizontal: 14, borderRadius: 6 },
  langButtonActive: { backgroundColor: '#007AFF' },
  langText: { fontSize: 13, color: '#333', fontWeight: '500' },
  langTextActive: { color: '#fff', fontWeight: 'bold' },

  googleLoginButton: {
    flexDirection: 'row',
    backgroundColor: '#4285F4',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15
  },
  googleButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  dividerContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#ddd' },
  dividerText: { marginHorizontal: 10, color: '#888', fontSize: 14 },

  input: { backgroundColor: '#fff', padding: 14, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#ddd', fontSize: 15 },
  button: { backgroundColor: '#007AFF', padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  switchText: { textAlign: 'center', color: '#007AFF', fontSize: 14, marginTop: 8 }
});