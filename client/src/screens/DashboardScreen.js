import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  Platform,
  View,
  TouchableOpacity,
  FlatList,
  Alert
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import API from '../api/client';

WebBrowser.maybeCompleteAuthSession();

export default function DashboardScreen({ navigation }) {

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);

  const fetchDocuments = async () => {
    try {

      const response = await API.get('/documents');


      setDocuments(
        response.data.documents || []
      );

    } catch (error) {

      console.error(
        'Failed to fetch documents',
        error
      );

    }

  };

  useEffect(() => {


    const init = async () => {

      const connected =
        await AsyncStorage.getItem(
          'googleConnected'
        );

      if (connected === 'true') {
        setGoogleConnected(true);
      }


      fetchDocuments();

    };


    init();

  }, []);

  const handleConnectGoogle = async () => {

    try {

      const redirectUri =
        AuthSession.makeRedirectUri({
          scheme: 'smartmailbills',
          path: 'dashboard'
        });


      const response =
        await API.get('/auth/google/url');


      const result =
        await WebBrowser.openAuthSessionAsync(
          response.data.url,
          redirectUri
        );


      if (
        result.type === 'success' &&
        result.url
      ) {

        const parsedUrl =
          new URL(result.url);


        const email =
          parsedUrl.searchParams.get('email');


        const token =
          parsedUrl.searchParams.get('token');


        if (token) {
          await AsyncStorage.setItem(
            'token',
            token
          );
        }


        if (email) {

          await AsyncStorage.setItem(
            'userEmail',
            email
          );

        }


        await AsyncStorage.setItem(
          'googleConnected',
          'true'
        );


        setGoogleConnected(true);


        Alert.alert(
          'הצלחה',
          'חשבון Google התחבר בהצלחה'
        );


        fetchDocuments();

      }


    } catch (error) {

      console.error(
        'Google Auth Error',
        error
      );

      Alert.alert(
        'שגיאה',
        'לא ניתן להתחבר לגוגל'
      );

    }

  };

  const handleScanEmails = async () => {

    setLoading(true);

    try {

      const response =
        await API.post(
          '/documents/scan-emails'
        );


      // Alert.alert(
      //   'הצלחה',
      //   `נמצאו ${response.data.data.count} מסמכים`
      // );


      fetchDocuments();


    } catch (error) {

      const message =
        error.response?.data?.error ||
        error.message;


      if (Platform.OS === 'web') {

        window.alert(message);

      } else {

        Alert.alert(
          'שגיאה',
          message
        );

      }


    } finally {

      setLoading(false);

    }


  };

  const handleDownloadDocument = async (
    documentId,
    filename
  ) => {

    try {

      if (Platform.OS === 'web') {

        const response =
          await API.get(
            `/documents/download/${documentId}`,
            {
              responseType: 'blob'
            }
          );


        const blob =
          new Blob(
            [response.data],
            {
              type: 'application/pdf'
            }
          );


        const url =
          window.URL.createObjectURL(blob);


        const link =
          document.createElement('a');


        link.href = url;
        link.download = filename;


        document.body.appendChild(link);

        link.click();

        link.remove();


        window.URL.revokeObjectURL(url);


      } else {


        Alert.alert(
          'הורדה',
          'תמיכה במובייל תתווסף בהמשך'
        );


      }


    } catch (error) {

      console.error(
        'Download error',
        error
      );


      Alert.alert(
        'שגיאה',
        'לא ניתן להוריד את המסמך'
      );

    }


  };

 

  const totalExpenses = documents.reduce(
    (sum, doc) => sum + Number(doc.amount || 0),
    0
  );

  const totalDocuments = documents.length;


  const pendingPayments = documents.filter(
    doc => doc.payment_status === true
  ).length;

  const handleLogout = async () => {


    await AsyncStorage.removeItem('token');

    await AsyncStorage.removeItem(
      'userEmail'
    );

    navigation.replace('Login');


  };

   const renderDocument = ({ item }) => (

    <View style={styles.card}>

      <Text style={styles.cardTitle}>
        {item.company_name || item.title}
      </Text>


      <Text style={styles.cardDetail}>
        סכום: {item.amount || 0} {item.currency || ''}
      </Text>


      <Text style={styles.cardDetail}>
        סוג: {item.document_type || 'לא ידוע'}
      </Text>


      <Text style={styles.cardDetail}>
        סטטוס:
        {
        item.payment_status === 'pending' ||
        item.payment_status === 'unknown'
          ? ' נדרש תשלום'
          : ' טופל'
      }
      </Text>


      {item.invoice_date && (
        <Text style={styles.cardDate}>
          תאריך:
          {' '}
          {new Date(
            item.invoice_date
          ).toLocaleDateString('he-IL')}
        </Text>
      )}


      <TouchableOpacity
        style={styles.downloadButton}
        onPress={() =>
          handleDownloadDocument(
            item.id,
            item.title
          )
        }
      >
        <Text>
          הורד PDF
        </Text>

      </TouchableOpacity>


    </View>

  );



  return (

    <View style={styles.container}>


      <View style={styles.header}>

        <Text style={styles.title}>
          לוח בקרה - חשבוניות
        </Text>


        <TouchableOpacity
          onPress={handleLogout}
        >

          <Text style={styles.logoutText}>
            התנתק
          </Text>

        </TouchableOpacity>

      </View>



      <TouchableOpacity
        style={[
          styles.googleButton,
          googleConnected &&
          styles.connectedButton
        ]}
        onPress={handleConnectGoogle}
      >

        <Text>
          {
            googleConnected
              ? '✓ חשבון Google מחובר'
              : 'חבר חשבון Google'
          }
        </Text>

      </TouchableOpacity>



      <TouchableOpacity
        style={styles.scanButton}
        onPress={handleScanEmails}
        disabled={loading}
      >

        <Text>
          {
            loading
              ? 'סורק...'
              : 'סרוק מיילים'
          }
        </Text>

      </TouchableOpacity>




      <View style={styles.summaryCard}>

        <Text style={styles.summaryTitle}>
          סיכום הוצאות
        </Text>


        <Text style={styles.summaryText}>
          מספר מסמכים: {totalDocuments}
        </Text>


        <Text style={styles.summaryText}>
          סה"כ הוצאות: {totalExpenses.toFixed(2)}$
        </Text>


        <Text style={styles.summaryText}>
          ממתינים לתשלום: {pendingPayments}
        </Text>

      </View>




      <Text style={styles.sectionTitle}>
        מסמכים שזוהו:
      </Text>



      <FlatList

        data={documents}

        keyExtractor={
          item => item.id.toString()
        }

        renderItem={renderDocument}


        ListEmptyComponent={

          <Text style={styles.emptyText}>
            אין מסמכים
          </Text>

        }

      />


    </View>

  );

}


const styles = StyleSheet.create({
  downloadButton: {
    backgroundColor: '#ddd',
    padding: 10,
    borderRadius: 6,
    marginTop: 10,
    alignItems:'center'

  },
  summaryCard:{
  backgroundColor:'#ffffff',
  padding:15,
  borderRadius:10,
  marginBottom:15,
  borderWidth:1,
  borderColor:'#e1e4e8'
},

summaryTitle:{
  fontSize:18,
  fontWeight:'bold',
  marginBottom:10,
  color:'#333'
},

summaryText:{
  fontSize:15,
  marginBottom:5,
  color:'#555'
},
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
  connectedButton: { backgroundColor: '#34A853' }
});