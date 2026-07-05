import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme';
import { t } from '../i18n';
import { useAuthStore } from '../stores/authStore';

// Screens
import SetupScreen from '../screens/SetupScreen';
import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import CaisseScreen from '../screens/CaisseScreen';
import ProductsScreen from '../screens/ProductsScreen';
import EstoqueScreen from '../screens/EstoqueScreen';
import HistoriqueScreen from '../screens/HistoriqueScreen';
import CadernoScreen from '../screens/CadernoScreen';
import SettingsScreen from '../screens/SettingsScreen';
import UsersScreen from '../screens/UsersScreen';
import ReservationsScreen from '../screens/ReservationsScreen';
import LicenseScreen from '../screens/LicenseScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      id="MainTabs"
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';
          if (route.name === 'Dashboard') iconName = 'stats-chart';
          else if (route.name === 'Caisse') iconName = 'cart';
          else if (route.name === 'Products') iconName = 'pricetags';
          else if (route.name === 'Settings') iconName = 'settings';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: { backgroundColor: COLORS.surface, borderTopColor: COLORS.border },
        headerStyle: { backgroundColor: COLORS.surface },
        headerTintColor: COLORS.text,
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: t('nav.dashboard'), headerShown: false }} />
      <Tab.Screen name="Caisse" component={CaisseScreen} options={{ title: t('nav.caisse'), headerShown: false }} />
      <Tab.Screen name="Products" component={ProductsScreen} options={{ title: t('nav.products'), headerShown: false }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: t('nav.settings'), headerShown: false }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { user, isSetupDone, loginChecked } = useAuthStore();

  if (!loginChecked) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator id="RootStack" screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.background } }}>
        {!isSetupDone ? (
          <Stack.Screen name="Setup" component={SetupScreen} />
        ) : !user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="Estoque" component={EstoqueScreen} options={{ headerShown: true, headerStyle: { backgroundColor: COLORS.surface }, headerTintColor: COLORS.text, title: t('nav.stock') }} />
            <Stack.Screen name="Historique" component={HistoriqueScreen} options={{ headerShown: true, headerStyle: { backgroundColor: COLORS.surface }, headerTintColor: COLORS.text, title: t('nav.history') }} />
            <Stack.Screen name="Caderno" component={CadernoScreen} options={{ headerShown: true, headerStyle: { backgroundColor: COLORS.surface }, headerTintColor: COLORS.text, title: t('nav.caderno') }} />
            <Stack.Screen name="Users" component={UsersScreen} options={{ headerShown: true, headerStyle: { backgroundColor: COLORS.surface }, headerTintColor: COLORS.text, title: t('nav.users') }} />
            <Stack.Screen name="Reservations" component={ReservationsScreen} options={{ headerShown: true, headerStyle: { backgroundColor: COLORS.surface }, headerTintColor: COLORS.text, title: t('nav.reservations') }} />
            <Stack.Screen name="License" component={LicenseScreen} options={{ headerShown: true, headerStyle: { backgroundColor: COLORS.surface }, headerTintColor: COLORS.text, title: t('nav.license') }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
