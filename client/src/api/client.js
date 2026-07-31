import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API = axios.create({
  baseURL: 'http://localhost:5000/api', // במידה ואתה בודק במכשיר פיזי, שנה לכתובת ה-IP של המחשב שלך ברשת
});

// הוספת טוקן אוטומטית לכל בקשה אם קיים
API.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default API;