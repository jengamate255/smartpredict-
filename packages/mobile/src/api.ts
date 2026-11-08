import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL || (__DEV__
    ? `http://${Platform.OS === 'android' ? '10.0.2.2' : 'localhost'}:3000/api`
    : 'https://api.smartpredict.co.tz/api'),
  timeout: 20000,
});
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
export function errorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 401) return 'Kikao kimeisha. Toka na uingie tena.';
    return error.response?.data?.error || 'Imeshindikana kuunganisha. Jaribu tena.';
  }
  return error instanceof Error ? error.message : 'Hitilafu imetokea. Jaribu tena.';
}
