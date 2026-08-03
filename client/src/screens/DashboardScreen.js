import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  Platform,
  View,
  TouchableOpacity,
  FlatList,
  Alert
} from 'react-native';
import { Feather } from "@expo/vector-icons";
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import API from '../api/client';

WebBrowser.maybeCompleteAuthSession();

// מילון התרגומים של הממשק
const translations = {
  he: {
    title: 'לוח בקרה - חשבוניות',
    logout: 'התנתק',
    connectGoogle: 'חבר חשבון Google',
    googleConnected: '✓ חשבון Google מחובר',
    scanEmails: 'סרוק מיילים',
    scanning: 'סורק...',
    summaryTitle: 'סיכום הוצאות',
    totalDocs: 'מספר מסמכים:',
    totalExpenses: 'סה"כ הוצאות:',
    pendingPayments: 'ממתינים לתשלום:',
    sectionTitle: 'מסמכים שזוהו:',
    emptyText: 'אין מסמכים להצגה',
    headers: {
      company: 'חברה / מסמך',
      amount: 'סכום',
      date: 'תאריך',
      type: 'סוג'
    },
    docTypes: {
      invoice: 'חשבונית',
      receipt: 'קבלה',
      reminder: 'תזכורת חוב',
      other: 'אחר'
    },
    currencies: {
      ILS: '₪',
      USD: '$',
      EUR: '€'
    }
  },
  en: {
    title: 'Dashboard - Invoices',
    logout: 'Logout',
    connectGoogle: 'Connect Google Account',
    googleConnected: '✓ Google Account Connected',
    scanEmails: 'Scan Emails',
    scanning: 'Scanning...',
    summaryTitle: 'Expenses Summary',
    totalDocs: 'Total Documents:',
    totalExpenses: 'Total Expenses:',
    pendingPayments: 'Pending Payments:',
    sectionTitle: 'Detected Documents:',
    emptyText: 'No documents found',
    headers: {
      company: 'Company / File',
      amount: 'Amount',
      date: 'Date',
      type: 'Type'
    },
    docTypes: {
      invoice: 'Invoice',
      receipt: 'Receipt',
      reminder: 'Reminder',
      other: 'Other'
    },
    currencies: {
      ILS: 'ILS',
      USD: 'USD',
      EUR: 'EUR'
    }
  }
};

export default function DashboardScreen({ navigation }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [lang, setLang] = useState('he');

  const t = translations[lang] || translations.he;
  const isHe = lang === 'he';

  // 🔴 התנתקות נקייה ואיפוס ה-Session
  const handleLogout = useCallback(async () => {
    await AsyncStorage.multiRemove([
      'token',
      'sessionExpiry',
      'userEmail',
      'googleConnected',
      'userLanguage'
    ]);
    setGoogleConnected(false);
    navigation.replace('Login');
  }, [navigation]);

  // 🟢 שליפת מסמכים מהשרת
  const fetchDocuments = async () => {
    try {
      const response = await API.get('/documents');
      setDocuments(response.data.documents || []);

      if (response.data.userLanguage) {
        setLang(response.data.userLanguage);
        await AsyncStorage.setItem('userLanguage', response.data.userLanguage);
      }
    } catch (error) {
      console.error('Failed to fetch documents', error);
    }
  };

  // 🟢 בדיקת חיבור גוגל מול השרת
  const checkGoogleConnection = async () => {
    try {
      const response = await API.get('/auth/google/status');
      if (response.data.connected) {
        setGoogleConnected(true);
        await AsyncStorage.setItem('googleConnected', 'true');
      } else {
        setGoogleConnected(false);
        await AsyncStorage.setItem('googleConnected', 'false');
      }
    } catch (error) {
      console.error('Error checking Google connection:', error);
      setGoogleConnected(false);
    }
  };

 useEffect(() => {
  const checkSessionAndInit = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      let expiry = await AsyncStorage.getItem('sessionExpiry');
      const now = Date.now();

      // אם אין טוקן בכלל - התנתק
      if (!token) {
        await handleLogout();
        return;
      }

      // 🟢 אם יש טוקן אך עדיין לא הוגדר expiry, נגדיר אותו ל-10 דקות מעכשיו
      if (!expiry) {
        expiry = (now + 10 * 60 * 1000).toString();
        await AsyncStorage.setItem('sessionExpiry', expiry);
      }

      // אם עברו 10 דקות - התנתק
      if (now > parseInt(expiry, 10)) {
        await handleLogout();
        return;
      }

      // טעינת שפה
      const savedLang = await AsyncStorage.getItem('userLanguage');
      if (savedLang) setLang(savedLang);

      // בדיקת סטטוס גוגל ושליפת מסמכים
      await checkGoogleConnection();
      await fetchDocuments();
    } catch (error) {
      console.error('Session check error:', error);
      await handleLogout();
    }
  };

  checkSessionAndInit();
}, [handleLogout]);

  const handleConnectGoogle = async () => {
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
  const email = parsedUrl.searchParams.get('email');
  const token = parsedUrl.searchParams.get('token');
  const userLang = parsedUrl.searchParams.get('lang');

  // 🟢 הגדרת תוקף Session ל-10 דקות מהרגע שהתחברנו
  const tenMinutes = Date.now() + 10 * 60 * 1000;
  await AsyncStorage.setItem('sessionExpiry', tenMinutes.toString());

  if (token) await AsyncStorage.setItem('token', token);
  if (email) await AsyncStorage.setItem('userEmail', email);
  if (userLang) {
    setLang(userLang);
    await AsyncStorage.setItem('userLanguage', userLang);
  }

  await AsyncStorage.setItem('googleConnected', 'true');
  setGoogleConnected(true);
  
  fetchDocuments();
}
    } catch (error) {
      console.error('Google Auth Error', error);
      Alert.alert(
        isHe ? 'שגיאה' : 'Error',
        isHe ? 'לא ניתן להתחבר לגוגל' : 'Failed to connect Google account'
      );
    }
  };

  const handleScanEmails = async () => {
    setLoading(true);
    try {
      await API.post('/documents/scan-emails');
      fetchDocuments();
    } catch (error) {
      const message = error.response?.data?.error || error.message;
      if (Platform.OS === 'web') {
        window.alert(message);
      } else {
        Alert.alert(isHe ? 'שגיאה' : 'Error', message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadDocument = async (documentId, filename) => {
    try {
      if (Platform.OS === 'web') {
        const response = await API.get(`/documents/download/${documentId}`, {
          responseType: 'blob'
        });

        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      } else {
        Alert.alert(
          isHe ? 'הורדה' : 'Download',
          isHe ? 'תמיכה במובייל תתווסף בהמשך' : 'Mobile download support coming soon'
        );
      }
    } catch (error) {
      console.error('Download error', error);
      Alert.alert(
        isHe ? 'שגיאה' : 'Error',
        isHe ? 'לא ניתן להוריד את המסמך' : 'Cannot download document'
      );
    }
  };

  const totalExpenses = documents.reduce((sum, doc) => {
    const amount = parseFloat(doc.amount);
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);

  const totalDocuments = documents.length;
  const pendingPayments = documents.filter(
    doc => doc.payment_status === 'pending' || doc.payment_required === true
  ).length;

  const formatDate = (date) => {
    if (!date) return '-';
    const d = new Date(date);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear().toString().slice(-2)}`;
  };

  const formatDocType = (type) => {
    return t.docTypes[type?.toLowerCase()] || type || t.docTypes.other;
  };

  const formatCurrency = (amount, currency) => {
    if (amount === null || amount === undefined) return isHe ? 'לא זוהה' : 'N/A';
    const symbol = t.currencies[currency] || currency || '₪';
    return `${amount} ${symbol}`;
  };

  // 🟢 עמודת כותרת בטבלה
  const renderTableHeader = () => (
    <View style={[styles.headerRow, { flexDirection: isHe ? 'row' : 'row-reverse' }]}>
      <Text style={[styles.headerText, styles.company]}>{t.headers.company}</Text>
      <Text style={[styles.headerText, styles.amount]}>{t.headers.amount}</Text>
      <Text style={[styles.headerText, styles.date]}>{t.headers.date}</Text>
      <Text style={[styles.headerText, styles.type]}>{t.headers.type}</Text>
      <View style={styles.actionHeaderPlaceholder} />
    </View>
  );

  // 🟢 שורת נתונים בטבלה
  const renderDocument = ({ item }) => (
    <View style={[styles.row, { flexDirection: isHe ? 'row' : 'row-reverse' }]}>
      <Text style={[styles.company, { textAlign: isHe ? 'right' : 'left' }]} numberOfLines={1}>
        {item.company_name || item.title}
      </Text>

      <Text style={styles.amount}>
        {formatCurrency(item.amount, item.currency)}
      </Text>

      <Text style={styles.date}>
        {formatDate(item.invoice_date)}
      </Text>

      <Text style={styles.type}>
        {formatDocType(item.document_type)}
      </Text>

      <TouchableOpacity
        style={styles.downloadIcon}
        onPress={() => handleDownloadDocument(item.id, item.title)}
      >
        <Feather name="download" size={18} color="#007AFF" />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { flexDirection: isHe ? 'row' : 'row-reverse' }]}>
        <Text style={styles.title}>{t.title}</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>{t.logout}</Text>
        </TouchableOpacity>
      </View>

      {/* Buttons */}
      <TouchableOpacity
        style={[styles.googleButton, googleConnected && styles.connectedButton]}
        onPress={handleConnectGoogle}
      >
        <Text style={styles.buttonText}>
          {googleConnected ? t.googleConnected : t.connectGoogle}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.scanButton}
        onPress={handleScanEmails}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? t.scanning : t.scanEmails}
        </Text>
      </TouchableOpacity>

      {/* Summary Card */}
      <View style={[styles.summaryCard, { alignItems: isHe ? 'flex-start' : 'flex-end' }]}>
        <Text style={styles.summaryTitle}>{t.summaryTitle}</Text>
        <Text style={styles.summaryText}>{t.totalDocs} {totalDocuments}</Text>
        <Text style={styles.summaryText}>{t.totalExpenses} {totalExpenses.toFixed(2)} ₪</Text>
        <Text style={styles.summaryText}>{t.pendingPayments} {pendingPayments}</Text>
      </View>

      <Text style={[styles.sectionTitle, { textAlign: isHe ? 'right' : 'left' }]}>
        {t.sectionTitle}
      </Text>

      {/* 🟢 טבלת המסמכים עם כותרות */}
      <View style={styles.tableContainer}>
        {renderTableHeader()}
        <FlatList
          data={documents}
          keyExtractor={item => item.id.toString()}
          renderItem={renderDocument}
          ListEmptyComponent={
            <Text style={styles.emptyText}>{t.emptyText}</Text>
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f4f6f8', paddingTop: 40 },
  header: { justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  logoutText: { color: '#ff3b30', fontWeight: 'bold', fontSize: 16 },

  googleButton: { backgroundColor: '#4285F4', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 8 },
  scanButton: { backgroundColor: '#34A853', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 15 },
  connectedButton: { backgroundColor: '#2b8a3e' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },

  summaryCard: {
    backgroundColor: '#ffffff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#e1e4e8',
    elevation: 2
  },
  summaryTitle: { fontSize: 17, fontWeight: 'bold', marginBottom: 8, color: '#333' },
  summaryText: { fontSize: 14, marginBottom: 4, color: '#555' },

  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10, color: '#444' },
  tableContainer: { flex: 1, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e1e4e8', overflow: 'hidden' },

  headerRow: {
    backgroundColor: '#eaeef2',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#d0d7de',
    alignItems: 'center'
  },
  headerText: { fontWeight: 'bold', color: '#333', fontSize: 13 },

  row: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0'
  },

  company: { flex: 3, fontWeight: 'bold', fontSize: 13, color: '#222' },
  amount: { flex: 2, textAlign: 'center', fontSize: 13, fontWeight: '600', color: '#2b8a3e' },
  date: { flex: 2, textAlign: 'center', fontSize: 12, color: '#666' },
  type: { flex: 2, textAlign: 'center', fontSize: 12, color: '#007AFF' },
  downloadIcon: { paddingLeft: 6 },
  actionHeaderPlaceholder: { width: 24 },

  emptyText: { textAlign: 'center', color: '#888', padding: 20, fontSize: 14 }
});