import React, { useState, useEffect } from 'react';
import { StyleSheet, Text,Platform, View, TouchableOpacity, FlatList, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import API from '../api/client';

// חובה להפעיל את זה כדי שהדפדפן יסגור את עצמו ויחזיר את השליטה לאפליקציה
WebBrowser.maybeCompleteAuthSession();
const fs = require('fs');
const path = require('path');

export default function DashboardScreen({ route, navigation }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);


  const fetchDocuments = async () => {
    try {
      const response = await API.get('/documents');
      setDocuments(response.data.documents || []);
    } catch (error) {
      console.error('Failed to fetch documents', error);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  // --- החיבור החדש והחלק לגוגל דרך Expo ---
const handleConnectGoogle = async () => {
    try {
      const redirectUri = AuthSession.makeRedirectUri({
        scheme: 'smartmailbills',
        path: 'dashboard',
      });

      const response = await API.get('/auth/google/url');
      let authUrl = response.data.url;

      // --- תיקון השם ל- openAuthSessionAsync ---
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      if (result.type === 'success' && result.url) {
        const parsedUrl = new URL(result.url);

        const email = parsedUrl.searchParams.get('email');
        const token = parsedUrl.searchParams.get('token');

        if (token) {
          await AsyncStorage.setItem('token', token);
        }

        if (email) {
          await AsyncStorage.setItem('userEmail', email);
        }

        setGoogleConnected(true);

        Alert.alert('הצלחה', 'התחברת לחשבון Google בהצלחה!');
        fetchDocuments();
      }
    } catch (error) {
      console.error('Google Auth Error:', error);
      Alert.alert('שגיאה', 'לא ניתן להתחבר לחשבון Google כרגע');
    }
  };
  
  const handleScanEmails = async () => {
    setLoading(true);

    try {
      try {
        const response = await API.post('/documents/scan-emails');

        Alert.alert(
          'הצלחה',
          `הסריקה הסתיימה בהצלחה! נמצאו ${response.data.data.count} מסמכים חדשים.`
        );

        fetchDocuments();
        
      } catch (error) {
        const message =
        error.response?.data?.error ||
        error.message ||
        'שגיאה בסריקת המיילים';
        
        if (Platform.OS === 'web') {
          window.alert(`שגיאה: ${message}`);
        } else {
          Alert.alert('Request Failed', message);
        }
      }
    } catch (error) {
      Alert.alert('שגיאה', error.response?.data?.error || 'שגיאה בסריקת המיילים');
    } finally {
      setLoading(false);
    }
  };


 const handleDownloadDocument = async (documentId, filename) => {
  try {
    const response = await API.get(
      `/documents/download/${documentId}`,
      {
        responseType: 'blob'
      }
    );

    const blob = new Blob(
      [response.data],
      { type: 'application/pdf' }
    );

    const downloadUrl = window.URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;

    document.body.appendChild(link);
    link.click();

    link.remove();

    window.URL.revokeObjectURL(downloadUrl);

  } catch (error) {
    console.error(
      'Download error:',
      error.response?.data || error.message
    );

    Alert.alert(
      'שגיאה',
      'לא ניתן להוריד את המסמך'
    );
  }
};

  const handleLogout = async () => {
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('userEmail');
    navigation.replace('Login');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>לוח בקרה - חשבוניות</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>התנתק</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actionsContainer}>
        <TouchableOpacity style={[
            styles.googleButton,
            googleConnected && styles.connectedButton
          ]}
          onPress={handleConnectGoogle}>
          <Text style={styles.buttonText}>
            {googleConnected
              ? '✓ חשבון Google מחובר'
              : '1. חבר חשבון Google (Gmail)'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.scanButton} onPress={handleScanEmails} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'סורק מיילים...' : '2. סרוק מיילים לחשבוניות'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>מסמכים שזוהו במערכת:</Text>

      <FlatList
        data={documents}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.company_name} ({item.category})</Text>
            <Text style={styles.cardDetail}>סכום: {item.amount} {item.currency}</Text>
            <Text style={styles.cardDetail}>סטטוס: {item.status}</Text>
            <Text style={styles.cardDate}>תאריך: {new Date(item.invoice_date).toLocaleDateString('he-IL')}</Text>
            <TouchableOpacity
                style={styles.downloadButton}
                onPress={() =>
                  handleDownloadDocument(item.id, item.title)
                }
              >
                <Text style={styles.buttonText}>
                  הורד PDF
                </Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>אין עדיין מסמכים במערכת. לחץ על סריקת מיילים.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f4f6f8', paddingTop: 50 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  logoutText: { color: '#ff3b30', fontWeight: 'bold', fontSize: 16 },
  actionsContainer: { marginBottom: 20 },
  googleButton: { backgroundColor: '#4285F4', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  scanButton: { backgroundColor: '#34A853', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  buttonText: { color: '#333', fontSize: 16, fontWeight: 'bold' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10, color: '#444' },
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#e1e4e8' },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#1a73e8', marginBottom: 5 },
  cardDetail: { fontSize: 14, color: '#333', marginBottom: 3 },
  cardDate: { fontSize: 12, color: '#777', marginTop: 5 },
  emptyText: { textAlign: 'center', color: '#888', marginTop: 20, fontSize: 14 },
  connectedButton: {backgroundColor: '#34A853'}
});